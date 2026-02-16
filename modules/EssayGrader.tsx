
import React, { useState, useEffect, useCallback } from 'react';
import { gradeEssay } from '../services/geminiService';
import { saveToHistory, getHistory, deleteFromHistory, checkIsSaved } from '../services/storageService';
import { saveEssayGradeToSupabase } from '../services/supabaseDataService';
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

const EssayGrader: React.FC<EssayGraderProps> = ({ prefillData, onPrefillConsumed, supabaseUserId }) => {
  const [topic, setTopic] = useState('');
  const [essayText, setEssayText] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [result, setResult] = useState<EssayGradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Timer State
  const [isTimerActive, setIsTimerActive] = useState(false);

  // History State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  // 接收从思维训练传来的预填数据
  useEffect(() => {
    if (prefillData) {
      setTopic(prefillData.topic);
      setEssayText(prefillData.essay);
      setResult(null); // 清除之前的批改结果
      setError(null);
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

  const handleGrade = async () => {
    if (!essayText.trim()) return;
    setIsGrading(true);
    setError(null);
    setIsTimerActive(false); // Stop timer on submit

    try {
      const gradingResult = await gradeEssay(topic, essayText);
      setResult(gradingResult);

      // Auto-save immediately to history
      const effectiveTopic = getEffectiveTopic();
      const historyData: EssayHistoryData = { essay: essayText, result: gradingResult };

      // Strict dataType: 'essay_grade'
      saveToHistory(effectiveTopic, historyData, 'essay_grade');
      setIsSaved(true);
      // Supabase 双写（异步，不阻断前端）
      if (supabaseUserId) {
        saveEssayGradeToSupabase(supabaseUserId, effectiveTopic, essayText, gradingResult).catch(() => { });
      }

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to grade essay. Please try again later.");
    } finally {
      setIsGrading(false);
    }
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
  if (!result) {
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
              disabled={isGrading || !essayText.trim()}
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

  // --- View 2: Report ---
  return (
    <>
      <GradingReport
        result={result}
        essayText={essayText}
        topic={topic}
        onBack={reset}
        onSave={handleSave}
        isSaved={isSaved}
      />
      {/* Hidden History Button for consistent UX if user wants to switch context without fully resetting, though simpler to use Reset */}
    </>
  );
};

export default EssayGrader;
