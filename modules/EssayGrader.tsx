
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { gradeEssay } from '../services/geminiService';
import { saveToHistory, getHistory, deleteFromHistory, checkIsSaved } from '../services/storageService';
import { saveEssayGradeToSupabase, logAgentUsage } from '../services/supabaseDataService';
import { EssayGradeResult, HistoryItem, EssayHistoryData } from '../types';
import HistoryModal from '../components/HistoryModal';
import GradingReport from '../components/GradingReport';

// OPTIMIZATION: Exam Timer Component
const ExamTimer: React.FC<{ isActive: boolean; onToggle: () => void }> = ({ isActive, onToggle }) => {
  const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes in seconds

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3">
      {isActive && (
        <div className="bg-slate-800 text-white px-3 py-1.5 rounded-lg font-mono font-bold text-sm tabular-nums flex items-center gap-2 shadow-sm animate-fade-in-up">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          {formatTime(timeLeft)}
        </div>
      )}
      <button
        onClick={onToggle}
        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border ${isActive
          ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
          : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'
          }`}
      >
        {isActive ? '⏹ Stop Timer' : '⏱️ Exam Mode (30m)'}
      </button>
    </div>
  );
};

interface EssayGraderProps {
  prefillData?: { topic: string; essay: string } | null;
  onPrefillConsumed?: () => void;
  supabaseUserId?: string;
}

// 自评分数结构
interface SelfEval {
  content: number;       // 0-4
  organization: number;  // 0-3
  proficiency: number;   // 0-5
  clarity: number;       // 0-3
}

// 评分按钮组件
const ScoreSelector: React.FC<{
  label: string; sub: string; max: number; value: number;
  onChange: (v: number) => void; color: string;
}> = ({ label, sub, max, value, onChange, color }) => (
  <div className="space-y-2">
    <div className="flex items-baseline justify-between">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <span className="text-xs text-slate-400">{sub} / {max} 分</span>
    </div>
    <div className="flex gap-1.5 flex-wrap">
      {Array.from({ length: max + 1 }, (_, i) => (
        <button key={i} type="button" onClick={() => onChange(i)}
          className={`w-9 h-9 rounded-lg text-sm font-bold transition-all border-2 ${value === i
            ? 'text-white border-transparent shadow-sm'
            : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
          style={value === i ? { backgroundColor: color, borderColor: color } : {}}>
          {i}
        </button>
      ))}
    </div>
  </div>
);

const EssayGrader: React.FC<EssayGraderProps> = ({ prefillData, onPrefillConsumed, supabaseUserId }) => {
  const [topic, setTopic] = useState('');
  const [essayText, setEssayText] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [result, setResult] = useState<EssayGradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 自评状态
  const [selfEvalStep, setSelfEvalStep] = useState<'idle' | 'evaluating' | 'done'>('idle');
  const [selfEval, setSelfEval] = useState<SelfEval>({ content: 2, organization: 1, proficiency: 2, clarity: 1 });
  const [submittedSelfEval, setSubmittedSelfEval] = useState<SelfEval | null>(null);
  const aiResultRef = useRef<EssayGradeResult | null>(null); // 并行时暂存AI结果
  const selfEvalSubmittedRef = useRef<boolean>(false);        // 跟踪自评是否已提交（避免闭包陷阱）

  // Timer State
  const [isTimerActive, setIsTimerActive] = useState(false);

  // History State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  // 会话计时
  const sessionStartRef = useRef<number>(Date.now());

  // 接收从思维训练传来的预填数据
  useEffect(() => {
    if (prefillData) {
      setTopic(prefillData.topic);
      setEssayText(prefillData.essay);
      setResult(null);
      setError(null);
      // 重置自评状态，避免残留导致视图错乱
      setSelfEvalStep('idle');
      setSelfEval({ content: 2, organization: 1, proficiency: 2, clarity: 1 });
      setSubmittedSelfEval(null);
      aiResultRef.current = null;
      selfEvalSubmittedRef.current = false;
      setIsGrading(false);
      if (onPrefillConsumed) onPrefillConsumed();
    }
  }, [prefillData]);

  // Helper: Get effective topic name for storage consistency
  const getEffectiveTopic = useCallback(() => {
    return topic.trim() || "Untitled Essay";
  }, [topic]);

  // Load history logic
  const refreshHistory = () => {
    setHistoryItems(getHistory('essay_grade'));
  };

  useEffect(() => {
    if (isHistoryOpen) refreshHistory();
  }, [isHistoryOpen]);

  useEffect(() => {
    // Check if current result is already saved (only if result exists)
    // IMPORTANT: Use getEffectiveTopic() to match the saving logic
    if (result && essayText) {
      setIsSaved(checkIsSaved(getEffectiveTopic(), essayText, 'essay_grade'));
    }
  }, [result, essayText, getEffectiveTopic]);

  // 保存AI批改结果的公共函数
  const saveGradingResult = useCallback((gradingResult: EssayGradeResult) => {
    const effectiveTopic = getEffectiveTopic();
    const historyData: EssayHistoryData = { essay: essayText, result: gradingResult };
    saveToHistory(effectiveTopic, historyData, 'essay_grade');
    setIsSaved(true);
    if (supabaseUserId) {
      saveEssayGradeToSupabase(supabaseUserId, effectiveTopic, essayText, gradingResult).catch(() => { });
      const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
      logAgentUsage(supabaseUserId, '作文批改', 'writing_system', duration).catch(() => { });
      sessionStartRef.current = Date.now();
    }
  }, [essayText, supabaseUserId, getEffectiveTopic]);

  const handleGrade = async () => {
    if (!essayText.trim()) return;
    setIsTimerActive(false);
    setError(null);
    aiResultRef.current = null;
    selfEvalSubmittedRef.current = false;

    // 显示自评界面
    setSelfEvalStep('evaluating');

    // 同时在后台开始 AI 批改
    setIsGrading(true);
    gradeEssay(topic, essayText).then(gradingResult => {
      aiResultRef.current = gradingResult;
      setIsGrading(false);
      // 如果学生已提交自评（用 ref 避免闭包陷阱），直接显示结果
      if (selfEvalSubmittedRef.current) {
        saveGradingResult(gradingResult);
        setResult(gradingResult);
      }
    }).catch((e: any) => {
      setIsGrading(false);
      setError(e.message || '批改失败，请重试');
      setSelfEvalStep('idle');
      selfEvalSubmittedRef.current = false;
    });
  };

  // 学生提交自评
  const handleSelfEvalSubmit = () => {
    selfEvalSubmittedRef.current = true;
    setSubmittedSelfEval({ ...selfEval });
    setSelfEvalStep('done');
    // 如果 AI 已经批改完毕，直接显示结果
    if (aiResultRef.current) {
      saveGradingResult(aiResultRef.current);
      setResult(aiResultRef.current);
    }
    // 否则继续等待（isGrading 仍为 true，页面显示"AI正在分析"）
  };

  const handleSave = () => {
    // Robust check: Only save if result exists and NOT already saved
    if (result && !isSaved) {
      const effectiveTopic = getEffectiveTopic();
      const historyData: EssayHistoryData = { essay: essayText, result: result };

      // Strict dataType: 'essay_grade'
      saveToHistory(effectiveTopic, historyData, 'essay_grade');
      setIsSaved(true);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setEssayText('');
    setTopic('');
    setSelfEvalStep('idle');
    setSelfEval({ content: 2, organization: 1, proficiency: 2, clarity: 1 });
    setSubmittedSelfEval(null);
    aiResultRef.current = null;
    selfEvalSubmittedRef.current = false;
    setIsSaved(false);
    setIsTimerActive(false);
  };

  // History Handlers
  const handleSelectHistoryItem = (item: HistoryItem) => {
    if (item.dataType === 'essay_grade') {
      const data = item.data as EssayHistoryData;
      setTopic(item.topic); // This sets the raw state. If item.topic was "Untitled Essay", state becomes "Untitled Essay"
      setEssayText(data.essay);
      setResult(data.result);
      setIsSaved(true); // It's coming from history, so it's saved
      setIsHistoryOpen(false);
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    deleteFromHistory(id);
    refreshHistory();
  };

  // --- View 1: Input Form ---
  if (!result && selfEvalStep === 'idle') {
    return (
      <div className="max-w-4xl mx-auto animate-fade-in-up">
        {/* Toolbar for History */}
        <div className="flex justify-end gap-3 mb-6 no-print">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="text-sm font-medium text-slate-500 hover:text-blue-900 transition-colors flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm"
          >
            <span>📂</span> Graded Essays History
          </button>
        </div>

        <div className="text-center mb-10">
          <h2 className="text-3xl font-serif font-bold text-slate-800 mb-4">
            AI 智能作文<span className="text-blue-900">阅卷系统</span>
          </h2>
          <p className="text-slate-500 text-lg">
            资深教授 1v1 诊断 · 三色痛点分类 · 升格对比教学
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-8 space-y-6">
            {/* Topic Input */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">写作题目 (Optional)</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., The Importance of Traditional Culture"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
              />
            </div>

            {/* Essay Input */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="block text-sm font-bold text-slate-700">
                  你的作文 <span className="text-slate-400 font-normal ml-2">({essayText.length} chars)</span>
                </label>
                <ExamTimer isActive={isTimerActive} onToggle={() => setIsTimerActive(!isTimerActive)} />
              </div>

              <textarea
                value={essayText}
                onChange={(e) => setEssayText(e.target.value)}
                placeholder="在此粘贴或输入你的英语作文..."
                className={`w-full h-64 p-4 rounded-xl border focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none resize-none transition-all text-slate-700 leading-relaxed custom-scrollbar font-sans
                    ${isTimerActive ? 'border-rose-200 bg-rose-50/10' : 'border-slate-200'}`}
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center text-sm border border-red-100">
                <p className="font-bold mb-1">⚠️ Error</p>
                <p>{error}</p>
                {error.includes("API Key") && (
                  <p className="text-xs mt-2 text-slate-500">Go to Settings (top right) to enter your API key or configure it in Netlify.</p>
                )}
              </div>
            )}

            <button
              onClick={handleGrade}
              disabled={isGrading || !essayText.trim() || selfEvalStep !== 'idle'}
              className={`w-full py-4 rounded-xl font-bold text-white text-lg shadow-md transition-colors flex items-center justify-center gap-2
                  ${isGrading || !essayText.trim()
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-blue-900 hover:bg-blue-950'}`}
            >
              {isGrading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  教授阅卷中 (Grading)...
                </>
              ) : (
                <>✨ 提交批改 (Submit for Review)</>
              )}
            </button>

            {/* 错误提示 */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                <div className="flex items-start gap-3">
                  <span className="text-red-500 text-xl flex-shrink-0">⚠️</span>
                  <div>
                    <p className="font-bold text-sm mb-1">批改失败</p>
                    <p className="text-sm">{error}</p>
                    <p className="text-xs text-red-400 mt-2">请检查 API 设置是否正确，或稍后重试。</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-50 p-4 text-center text-xs text-slate-400 border-t border-slate-100">
            严格遵循 CET-4/6 (15分制) 评分标准
          </div>
        </div>

        <HistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          history={historyItems}
          onSelect={handleSelectHistoryItem}
          onDelete={handleDeleteHistoryItem}
          title="Graded Essays History"
        />
      </div>
    );
  }

  // --- View 1.5: 自评 / 等待AI ---
  if (selfEvalStep === 'evaluating' || (selfEvalStep === 'done' && isGrading)) {
    const dims = [
      { key: 'content' as const,      label: '内容',  sub: 'Content',      max: 4, color: '#9333ea' },
      { key: 'organization' as const, label: '组织',  sub: 'Organization', max: 3, color: '#f59e0b' },
      { key: 'proficiency' as const,  label: '语言',  sub: 'Proficiency',  max: 5, color: '#3b82f6' },
      { key: 'clarity' as const,      label: '清晰',  sub: 'Clarity',      max: 3, color: '#f43f5e' },
    ];

    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-blue-900 via-blue-700 to-blue-500" />
          <div className="p-8">
            {selfEvalStep === 'evaluating' ? (
              <>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">🪞</div>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">先评估一下自己的作文</h2>
                  <p className="text-slate-500 text-sm">AI 正在后台批改，趁这个时候先给自己打个分。<br />自评与 AI 评的差距本身就是很好的学习素材。</p>
                </div>

                <div className="space-y-5 mb-8">
                  {dims.map(d => (
                    <ScoreSelector key={d.key} label={d.label} sub={d.sub} max={d.max}
                      value={selfEval[d.key]} color={d.color}
                      onChange={v => setSelfEval(prev => ({ ...prev, [d.key]: v }))} />
                  ))}
                </div>

                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl mb-6 text-sm">
                  <span className="text-slate-500">我的自评总分</span>
                  <span className="text-xl font-bold text-slate-800">
                    {selfEval.content + selfEval.organization + selfEval.proficiency + selfEval.clarity}
                    <span className="text-sm text-slate-400 font-normal"> / 15</span>
                  </span>
                </div>

                <button onClick={handleSelfEvalSubmit}
                  className="w-full py-4 rounded-xl font-bold text-white text-base bg-blue-900 hover:bg-blue-950 transition-colors flex items-center justify-center gap-2 shadow-md">
                  提交自评，查看 AI 批改结果 →
                </button>
              </>
            ) : (
              /* 已提交自评，等待 AI */
              <div className="text-center py-12">
                <div className="relative w-16 h-16 mx-auto mb-6">
                  <svg className="animate-spin w-16 h-16 text-blue-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">AI 正在仔细阅读你的作文…</h3>
                <p className="text-slate-400 text-sm">自评已提交，稍候即可看到对比结果</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- View 2: Report ---
  const selfTotal = submittedSelfEval
    ? submittedSelfEval.content + submittedSelfEval.organization + submittedSelfEval.proficiency + submittedSelfEval.clarity
    : null;

  const SelfEvalComparison = () => {
    if (!submittedSelfEval || !result) return null;
    // 防御：subScores 可能因 LLM 异常返回为 undefined
    const safeSub = (result as any).subScores || { content: 0, organization: 0, proficiency: 0, clarity: 0 };
    const safeTotal = typeof result.totalScore === 'number' ? result.totalScore : 0;
    const dims = [
      { key: 'content' as const,      label: '内容',  aiKey: 'content',       max: 4, color: '#9333ea' },
      { key: 'organization' as const, label: '组织',  aiKey: 'organization',  max: 3, color: '#f59e0b' },
      { key: 'proficiency' as const,  label: '语言',  aiKey: 'proficiency',   max: 5, color: '#3b82f6' },
      { key: 'clarity' as const,      label: '清晰',  aiKey: 'clarity',       max: 3, color: '#f43f5e' },
    ];
    const aiTotal = safeTotal;
    const diff = selfTotal !== null ? selfTotal - aiTotal : 0;
    const overallLabel = diff > 1.5 ? { text: '你高估了自己', color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' }
      : diff < -1.5 ? { text: '你低估了自己', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' }
      : { text: '自评与 AI 评高度吻合', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' };

    return (
      <div className="mb-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🪞</span>
            <div>
              <h3 className="font-bold text-slate-800">自评 vs AI 评</h3>
              <p className="text-xs text-slate-400">元认知对比 — 了解自己的认知准确度</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold ${overallLabel.bg} ${overallLabel.color}`}>
            <span>你的总分 {selfTotal}</span>
            <span className="opacity-40">vs</span>
            <span>AI 总分 {aiTotal}</span>
            <span className="ml-1 pl-2 border-l border-current/20">{diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}</span>
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {dims.map(d => {
            const myVal = submittedSelfEval[d.key];
            const aiVal = (safeSub as any)[d.aiKey] ?? 0;
            const delta = myVal - aiVal;
            const deltaColor = Math.abs(delta) <= 0.5 ? 'text-emerald-600' : delta > 0 ? 'text-rose-600' : 'text-blue-600';
            const deltaText = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
            return (
              <div key={d.key} className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{d.label}</div>
                <div className="flex items-end justify-center gap-2 mb-2">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-400">{myVal}</div>
                    <div className="text-[10px] text-slate-400">我的评</div>
                  </div>
                  <div className="text-slate-300 pb-1">vs</div>
                  <div className="text-center">
                    <div className="text-2xl font-bold" style={{ color: d.color }}>{aiVal}</div>
                    <div className="text-[10px] text-slate-400">AI评</div>
                  </div>
                </div>
                <div className={`text-sm font-bold ${deltaColor}`}>
                  {Math.abs(delta) < 0.05 ? '✓ 准确' : deltaText}
                </div>
              </div>
            );
          })}
        </div>
        <div className={`mx-6 mb-5 px-4 py-2.5 rounded-xl border text-sm font-medium ${overallLabel.bg} ${overallLabel.color}`}>
          💡 {overallLabel.text}
          {Math.abs(diff) > 1.5 && (
            <span className="font-normal text-slate-500 ml-1">
              — 关注与 AI 差距较大的维度，这往往是最值得深思的学习点。
            </span>
          )}
        </div>
      </div>
    );
  };

  if (!result) return null;

  try {
    return (
      <>
        <SelfEvalComparison />
        <GradingReport
          result={result}
          essayText={essayText}
          topic={topic}
          onBack={reset}
          onSave={handleSave}
          isSaved={isSaved}
        />
      </>
    );
  } catch (renderErr: any) {
    console.error('[EssayGrader] 渲染崩溃:', renderErr);
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-rose-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-3xl mx-auto mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">批改结果显示异常</h2>
        <p className="text-sm text-slate-500 mb-6">AI 返回的数据结构不完整，无法正常显示。点击下方按钮重新批改。</p>
        <button onClick={reset} className="px-6 py-2.5 rounded-xl bg-blue-900 text-white font-bold hover:bg-blue-950 transition-colors">
          ← 返回重新批改
        </button>
      </div>
    );
  }
};

export default EssayGrader;
