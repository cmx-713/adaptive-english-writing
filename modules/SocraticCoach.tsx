
import React, { useState, useEffect, useRef } from 'react';
import InputSection from '../components/InputSection';
import PhaseOneCards from '../components/PhaseOneCards';
import ResultsDisplay from '../components/ResultsDisplay';
import HistoryModal from '../components/HistoryModal';
import { fetchInspirationCards, fetchLanguageScaffolds, generateEssayIntroConclusion, analyzeCtrlScore } from '../services/geminiService';
import { getHistory, deleteFromHistory, saveToHistory, checkIsSaved } from '../services/storageService';
import { saveScaffoldToSupabase, saveInspirationToSupabase, updateScaffoldDraft, saveAssembledEssayToSupabase, logAgentUsage, createThinkingProcess, updateThinkingProcess, saveCtrlScore, upsertVocabularyBank, upsertCollocationBank } from '../services/supabaseDataService';
import { UserInput, InspirationCard, ScaffoldContent, FlowState, HistoryItem, InspirationHistoryData, DimensionDraft } from '../types';
import { IdeaValidationResult } from '../services/geminiService';

interface SocraticCoachProps {
  onSendToGrader?: (topic: string, essay: string) => void;
  supabaseUserId?: string;
}

const SocraticCoach: React.FC<SocraticCoachProps> = ({ onSendToGrader, supabaseUserId }) => {
  const [flowState, setFlowState] = useState<FlowState>('input_topic');
  const [currentTopic, setCurrentTopic] = useState<string>('');

  // Data State
  const [cards, setCards] = useState<InspirationCard[]>([]);
  const [activeCard, setActiveCard] = useState<InspirationCard | null>(null);
  const [scaffoldData, setScaffoldData] = useState<ScaffoldContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Phase 1 State (Lifted)
  const [step1Inputs, setStep1Inputs] = useState<Record<string, string>>({});

  // 维度草稿管理
  const [dimensionDrafts, setDimensionDrafts] = useState<Record<string, DimensionDraft>>({});
  const currentDraftRef = useRef<string>(''); // 用ref追踪实时草稿，避免频繁setState

  // 个性化思路拓展（Layer 2）：cardId -> string[]
  const [personalizedExpansions, setPersonalizedExpansions] = useState<Record<string, string[]>>({});

  // 组合成文状态
  const [assembledEssay, setAssembledEssay] = useState<{ introduction: string; bodyParagraphs: { dimension: string; draft: string }[]; conclusion: string } | null>(null);
  const [isAssembling, setIsAssembling] = useState(false);

  // AI 范例（按需生成，点击才触发）
  const [aiReference, setAiReference] = useState<{ introduction: string; conclusion: string } | null>(null);
  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const [showIntroRef, setShowIntroRef] = useState(false);
  const [showConclusionRef, setShowConclusionRef] = useState(false);

  // History State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  // 会话计时
  const sessionStartRef = useRef<number>(Date.now());

  // 思维过程记录 ID（用于后续更新同一条记录）
  const thinkingProcessIdRef = useRef<string | null>(null);

  // Load history on mount
  const refreshHistory = () => {
    const scaffolds = getHistory('scaffold');
    const inspirations = getHistory('inspiration');
    setHistoryItems([...scaffolds, ...inspirations].sort((a, b) => b.timestamp - a.timestamp));
  };

  useEffect(() => {
    if (isHistoryOpen) refreshHistory();
  }, [isHistoryOpen]);

  // Step 1: Handle Topic Input -> Fetch Cards
  const handleTopicSubmit = async (input: UserInput) => {
    setFlowState('loading_cards');
    setCurrentTopic(input.topic);
    setError(null);
    sessionStartRef.current = Date.now(); // 重置会话计时
    setActiveCard(null);
    setStep1Inputs({});
    setDimensionDrafts({}); // 新topic清空草稿
    setPersonalizedExpansions({}); // 清空个性化拓展
    validationResultsRef.current = {}; // 清空累积验证结果
    thinkingProcessIdRef.current = null; // 清空旧记录 ID

    try {
      const fetchedCards = await fetchInspirationCards(input.topic);
      setCards(fetchedCards);

      const historyData: InspirationHistoryData = {
        cards: fetchedCards,
        userInputs: {}
      };
      saveToHistory(input.topic, historyData, 'inspiration');
      // Supabase 双写（异步，不阻断前端）
      if (supabaseUserId) {
        saveInspirationToSupabase(supabaseUserId, input.topic, fetchedCards, {}).catch(() => { });
        // 创建思维过程记录
        console.log('[ThinkingProcess] 正在创建, userId:', supabaseUserId, 'topic:', input.topic);
        createThinkingProcess(supabaseUserId, input.topic, fetchedCards)
          .then(({ id, error }) => {
            if (id) {
              thinkingProcessIdRef.current = id;
              console.log('[ThinkingProcess] ✅ 创建成功, id:', id);
            } else {
              console.error('[ThinkingProcess] ❌ 创建失败, id 为 null, error:', error);
            }
          })
          .catch((err) => { console.error('[ThinkingProcess] ❌ 创建异常:', err); });
      } else {
        console.warn('[ThinkingProcess] ⚠️ supabaseUserId 为空，跳过创建');
      }

      setFlowState('selecting_card');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate inspiration cards. Please try again.");
      setFlowState('error');
    }
  };

  // 防抖定时器（用于 user_ideas 同步）
  const ideaSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle Input Changes in Step 1
  const handleStep1InputChange = (id: string, value: string) => {
    setStep1Inputs(prev => {
      const next = { ...prev, [id]: value };
      // 防抖同步学生观点到 Supabase（1秒内无新输入才同步）
      if (thinkingProcessIdRef.current && supabaseUserId) {
        if (ideaSyncTimerRef.current) clearTimeout(ideaSyncTimerRef.current);
        ideaSyncTimerRef.current = setTimeout(() => {
          if (thinkingProcessIdRef.current) {
            updateThinkingProcess(thinkingProcessIdRef.current, { user_ideas: next }).catch(() => { });
          }
        }, 1000);
      }
      return next;
    });

  };

  // Step 2: Handle Card Selection + Idea -> Fetch Scaffolds
  const handleCardSelect = async (card: InspirationCard, userIdea: string) => {
    setFlowState('loading_scaffold');
    setError(null);
    setActiveCard(card);

    // 如果该维度已有scaffold数据，直接使用
    const existingDraft = dimensionDrafts[card.id];
    if (existingDraft?.scaffoldData) {
      setScaffoldData(existingDraft.scaffoldData);
      currentDraftRef.current = existingDraft.draft;
      setFlowState('showing_result');
      return;
    }

    try {
      const result = await fetchLanguageScaffolds(currentTopic, card.dimension, userIdea);
      setScaffoldData(result);
      currentDraftRef.current = '';
      saveToHistory(currentTopic, result, 'scaffold');
      // Supabase 双写（异步，不阻断前端）
      if (supabaseUserId) {
        saveScaffoldToSupabase(supabaseUserId, currentTopic, result).catch(() => { });
        // 词汇银行：自动将本次 scaffold 词汇入库
        if (result.vocabulary && result.vocabulary.length > 0) {
          upsertVocabularyBank(supabaseUserId, result.vocabulary, currentTopic).catch(() => { });
        }
        // 搭配银行：自动将本次 scaffold 地道搭配入库
        if (result.collocations && result.collocations.length > 0) {
          upsertCollocationBank(supabaseUserId, result.collocations, currentTopic).catch(() => { });
        }
      }
      // 同步维度草稿数据到思维过程记录
      if (thinkingProcessIdRef.current) {
        const draftEntry = {
          cardId: card.id,
          dimension: card.dimension,
          userIdea: userIdea,
          draft: '',
          scaffoldData: result
        };
        setDimensionDrafts(prev => {
          // 这里不用 setState 更新，只是读取当前值来同步
          const updatedDrafts = { ...prev, [card.id]: draftEntry };
          updateThinkingProcess(thinkingProcessIdRef.current!, { dimension_drafts: updatedDrafts }).catch(() => { });
          return prev; // 不实际改变 state，避免影响原有逻辑
        });
      }
      setFlowState('showing_result');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate language scaffolds. Please try again.");
      setFlowState('selecting_card');
    }
  };

  // 草稿实时更新回调
  const handleDraftChange = (draft: string) => {
    currentDraftRef.current = draft;
  };

  // 个性化拓展回调（从 PhaseOneCards 接收 Layer 2 数据）
  const handlePersonalizedExpansion = (cardId: string, expansion: string[]) => {
    setPersonalizedExpansions(prev => {
      const next = { ...prev, [cardId]: expansion };
      // 同步到思维过程记录
      if (thinkingProcessIdRef.current) {
        updateThinkingProcess(thinkingProcessIdRef.current, { personalized_expansions: next }).catch(() => { });
      }
      return next;
    });
  };

  // 累积的验证结果（用于合并后发送到 Supabase）
  const validationResultsRef = useRef<Record<string, IdeaValidationResult>>({});

  // 观点验证完成回调（从 PhaseOneCards 接收验证结果）
  const handleValidationComplete = (cardId: string, result: IdeaValidationResult) => {
    // 合并到累积结果中
    validationResultsRef.current = { ...validationResultsRef.current, [cardId]: result };
    if (thinkingProcessIdRef.current) {
      updateThinkingProcess(thinkingProcessIdRef.current, {
        validation_results: validationResultsRef.current
      }).catch(() => { });
    }
  };

  // 返回维度选择页面，同时保存当前草稿
  const handleBackToDimensions = () => {
    // 保存当前维度的草稿
    if (activeCard && currentDraftRef.current.trim()) {
      setDimensionDrafts(prev => ({
        ...prev,
        [activeCard.id]: {
          cardId: activeCard.id,
          dimension: activeCard.dimension,
          userIdea: step1Inputs[activeCard.id] || '',
          draft: currentDraftRef.current,
          scaffoldData: scaffoldData || undefined
        }
      }));
      // Supabase: 更新该维度的草稿
      if (supabaseUserId) {
        updateScaffoldDraft(supabaseUserId, currentTopic, activeCard.dimension, currentDraftRef.current).catch(() => { });
        // 记录使用日志（含时长）
        const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
        logAgentUsage(supabaseUserId, '思维训练', 'writing_system', duration).catch(() => { });
      }
      // 同步草稿到思维过程记录
      if (thinkingProcessIdRef.current) {
        const updatedDrafts = {
          ...dimensionDrafts,
          [activeCard.id]: {
            cardId: activeCard.id,
            dimension: activeCard.dimension,
            userIdea: step1Inputs[activeCard.id] || '',
            draft: currentDraftRef.current,
            scaffoldData: scaffoldData || undefined
          }
        };
        updateThinkingProcess(thinkingProcessIdRef.current, { dimension_drafts: updatedDrafts }).catch(() => { });
      }
    }

    setFlowState('selecting_card');
    setScaffoldData(null);
  };

  // 组合成文（不调用AI，直接进入编辑界面）
  const handleAssembleEssay = () => {
    const bodyParagraphs = cards
      .filter(card => dimensionDrafts[card.id])
      .map(card => ({
        dimension: card.dimension,
        draft: dimensionDrafts[card.id].draft
      }));

    setAssembledEssay({
      introduction: '',
      bodyParagraphs,
      conclusion: ''
    });
    setAiReference(null);
    setShowIntroRef(false);
    setShowConclusionRef(false);
    setFlowState('assembling_essay');

    // 同步组合成文状态到思维过程记录
    if (thinkingProcessIdRef.current) {
      updateThinkingProcess(thinkingProcessIdRef.current, {
        assembled_essay: { introduction: '', bodyParagraphs, conclusion: '' },
        status: 'completed'
      }).catch(() => { });

      // 后台自动分析审辨信度（B方案：学生完成Phase3即触发）
      const processId = thinkingProcessIdRef.current;
      analyzeCtrlScore({
        topic: currentTopic,
        inspirationCards: cards,
        userIdeas: step1Inputs,
        validationResults: validationResultsRef.current,
        personalizedExpansions,
        dimensionDrafts,
        assembledEssay: { introduction: '', bodyParagraphs, conclusion: '' },
      }).then(result => {
        saveCtrlScore(processId, { ...result, source: 'auto', reviewed: false });
      }).catch(() => { /* 静默处理，不影响主流程 */ });
    }
  };

  // 按需生成 AI 范例（点击"看看AI范例"时触发）
  const handleLoadAiReference = async (section: 'intro' | 'conclusion') => {
    // 如果已有缓存，直接展示
    if (aiReference) {
      if (section === 'intro') setShowIntroRef(true);
      if (section === 'conclusion') setShowConclusionRef(true);
      return;
    }

    // 首次请求：生成两段范例并缓存
    setIsLoadingReference(true);
    try {
      const bodyParagraphs = assembledEssay?.bodyParagraphs || [];
      const { introduction, conclusion } = await generateEssayIntroConclusion(currentTopic, bodyParagraphs);
      setAiReference({ introduction, conclusion });
      if (section === 'intro') setShowIntroRef(true);
      if (section === 'conclusion') setShowConclusionRef(true);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingReference(false);
    }
  };

  // 发送到作文批改
  const handleSendToGrader = () => {
    if (!assembledEssay || !onSendToGrader) return;

    const fullEssay = [
      assembledEssay.introduction,
      ...assembledEssay.bodyParagraphs.map(p => p.draft),
      assembledEssay.conclusion
    ].filter(p => p.trim()).join('\n\n');

    // Supabase: 保存组合成文
    if (supabaseUserId && fullEssay.trim()) {
      saveAssembledEssayToSupabase(supabaseUserId, currentTopic, fullEssay).catch(() => { });
      // 记录使用日志（含时长）
      const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
      logAgentUsage(supabaseUserId, '思维训练', 'writing_system', duration).catch(() => { });
    }

    onSendToGrader(currentTopic, fullEssay);

    // 同步组合成文内容和状态到思维过程记录
    if (thinkingProcessIdRef.current) {
      updateThinkingProcess(thinkingProcessIdRef.current, {
        assembled_essay: assembledEssay,
        status: 'sent_to_grader'
      }).catch(() => { });
    }
  };

  const resetApp = () => {
    setFlowState('input_topic');
    setCards([]);
    setScaffoldData(null);
    setCurrentTopic('');
    setActiveCard(null);
    setStep1Inputs({});
    setDimensionDrafts({});
    setPersonalizedExpansions({});
    setAssembledEssay(null);
    setAiReference(null);
    setShowIntroRef(false);
    setShowConclusionRef(false);
    currentDraftRef.current = '';
    validationResultsRef.current = {};
    thinkingProcessIdRef.current = null;
  };

  // History Handlers
  const handleSelectHistoryItem = (item: HistoryItem) => {
    if (item.dataType === 'scaffold') {
      setCurrentTopic(item.topic);
      setScaffoldData(item.data as ScaffoldContent);
      setActiveCard(null);
      setFlowState('showing_result');
      setIsHistoryOpen(false);
    } else if (item.dataType === 'inspiration') {
      const data = item.data as InspirationHistoryData;
      setCurrentTopic(item.topic);
      setCards(data.cards);
      setStep1Inputs(data.userInputs);
      setFlowState('selecting_card');
      setIsHistoryOpen(false);
    }
  };

  const handleDeleteHistoryItem = (id: string) => {
    deleteFromHistory(id);
    refreshHistory();
  };

  return (
    <div className="animate-fade-in-up">
      {/* Module Toolbar */}
      <div className="flex justify-end gap-3 mb-6 no-print">
        <button
          onClick={() => setIsHistoryOpen(true)}
          className="text-sm font-medium text-slate-500 hover:text-blue-900 transition-colors flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm"
        >
          <span>📂</span> History
        </button>
        <button onClick={resetApp} className="text-sm font-medium text-white bg-blue-900 px-3 py-1.5 rounded-lg hover:bg-blue-950 transition-colors shadow-sm">
          + New Topic
        </button>
      </div>

      {/* Intro Text (Only show at start) */}
      {flowState === 'input_topic' && (
        <div className="text-center mb-10 max-w-2xl mx-auto animate-fade-in-up no-print">
          <h2 className="text-3xl font-serif font-bold text-slate-800 mb-4">
            苏格拉底式<br className="md:hidden" /><span className="text-blue-900">写作思维训练</span>
          </h2>
          <p className="text-slate-600 text-lg leading-relaxed mb-8">
            "Thinking before Scaffolding" - 我们不直接给答案，而是通过启发提问引导你构建论据，再提供地道的语言支持。
          </p>
        </div>
      )}

      {/* --- Flow Controller --- */}

      {/* 1. Input Section */}
      {flowState === 'input_topic' && (
        <InputSection onSubmit={handleTopicSubmit} isLoading={false} />
      )}

      {/* 2. Loading Cards Animation */}
      {flowState === 'loading_cards' && (
        <div className="text-center py-20 animate-pulse no-print">
          <div className="inline-block p-4 rounded-full bg-white shadow-lg mb-6">
            <span className="text-4xl">🎲</span>
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">正在抽取盲盒维度...</h3>
          <p className="text-slate-500">苏格拉底教练正在思考启发性问题</p>
        </div>
      )}

      {/* 3. Phase 1: Card Selection */}
      {(flowState === 'selecting_card' || flowState === 'loading_scaffold') && (
        <div className="no-print">
          <PhaseOneCards
            topic={currentTopic}
            cards={cards}
            inputs={step1Inputs}
            onInputChange={handleStep1InputChange}
            onSelect={handleCardSelect}
            isLoading={flowState === 'loading_scaffold'}
            dimensionDrafts={dimensionDrafts}
            onAssembleEssay={handleAssembleEssay}
            onPersonalizedExpansion={handlePersonalizedExpansion}
            onValidationComplete={handleValidationComplete}
          />
        </div>
      )}

      {/* 4. Phase 2: Results Display (with draft support) */}
      {flowState === 'showing_result' && scaffoldData && (
        <ResultsDisplay
          data={scaffoldData}
          topic={currentTopic}
          socraticQuestion={activeCard?.socraticQuestion}
          thinkingExpansion={
            activeCard
              ? (personalizedExpansions[activeCard.id] || activeCard.thinkingExpansion)
              : undefined
          }
          onBack={handleBackToDimensions}
          initialDraft={activeCard ? (dimensionDrafts[activeCard.id]?.draft || '') : ''}
          onDraftChange={handleDraftChange}
        />
      )}

      {/* 5. Essay Assembly View */}
      {flowState === 'assembling_essay' && assembledEssay && (
        <div className="max-w-4xl mx-auto animate-fade-in-up">
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-serif font-bold text-slate-800 mb-2">
                📝 <span className="text-emerald-600">组合成文</span>
              </h2>
              <p className="text-slate-500">写好引言和结论，完成后可一键发送到作文批改</p>
              <div className="mt-3 bg-white border border-slate-200 rounded-lg p-3 shadow-sm inline-flex items-center gap-3">
                <span className="bg-brand-50 text-brand-700 text-[10px] font-bold px-2 py-1 rounded border border-brand-100 uppercase tracking-wider whitespace-nowrap">
                  Topic
                </span>
                <span className="font-bold text-slate-800 text-lg">{currentTopic}</span>
              </div>
            </div>

            {/* Essay Sections */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">

              {/* === Introduction === */}
              <div className="border-b border-slate-100">
                <div className="bg-blue-50 px-6 py-3 border-b border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700 text-sm">🏁</span>
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">引言 (Introduction)</span>
                    <span className="text-[10px] text-blue-600 ml-auto">请自己尝试写作</span>
                  </div>
                </div>
                <div className="p-6 space-y-3">
                  {/* 写作提示 */}
                  <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                    <p className="text-xs font-bold text-blue-700 mb-1.5">📝 写作提示</p>
                    <ul className="text-xs text-blue-900/80 space-y-1 list-disc list-inside">
                      <li>用 1-2 句话引出话题（可用提问、现象描述或名言引入）</li>
                      <li>简要说明你将讨论哪几个方面，为正文做铺垫</li>
                    </ul>
                  </div>

                  <textarea
                    value={assembledEssay.introduction}
                    onChange={(e) => setAssembledEssay(prev => prev ? { ...prev, introduction: e.target.value } : null)}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none text-slate-700 leading-relaxed text-sm min-h-[100px]"
                    placeholder="Try writing your introduction here..."
                  />

                  {/* AI 范例按钮 */}
                  {!showIntroRef ? (
                    <button
                      onClick={() => handleLoadAiReference('intro')}
                      disabled={isLoadingReference}
                      className="text-xs text-blue-600 hover:text-blue-800 underline decoration-blue-200 hover:decoration-blue-400 transition-colors flex items-center gap-1"
                    >
                      {isLoadingReference ? '正在生成范例...' : '💡 写不出来？看看AI范例'}
                    </button>
                  ) : aiReference && (
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 animate-fade-in-up">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">📖 AI 参考范例</p>
                        <button onClick={() => setShowIntroRef(false)} className="text-[10px] text-blue-600 hover:text-blue-800 underline">收起</button>
                      </div>
                      <p className="text-xs text-blue-900 leading-relaxed italic">"{aiReference.introduction}"</p>
                      <p className="text-[10px] text-blue-600 mt-2">提示：请参考思路和结构，用自己的话重新表达</p>
                    </div>
                  )}
                </div>
              </div>

              {/* === Body Paragraphs === */}
              {assembledEssay.bodyParagraphs.map((para, i) => (
                <div key={i} className="border-b border-slate-100">
                  <div className="bg-slate-100 px-6 py-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 text-sm">📖</span>
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        正文段落 {i + 1} — {para.dimension}
                      </span>
                      <span className="text-[10px] text-slate-500 ml-auto">你的原创段落</span>
                    </div>
                  </div>
                  <div className="p-6">
                    <textarea
                      value={para.draft}
                      onChange={(e) => {
                        setAssembledEssay(prev => {
                          if (!prev) return null;
                          const newBody = [...prev.bodyParagraphs];
                          newBody[i] = { ...newBody[i], draft: e.target.value };
                          return { ...prev, bodyParagraphs: newBody };
                        });
                      }}
                      className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none text-slate-700 leading-relaxed text-sm min-h-[120px]"
                    />
                  </div>
                </div>
              ))}

              {/* === Conclusion === */}
              <div>
                <div className="bg-blue-50 px-6 py-3 border-b border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700 text-sm">🎯</span>
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">结论 (Conclusion)</span>
                    <span className="text-[10px] text-blue-600 ml-auto">请自己尝试写作</span>
                  </div>
                </div>
                <div className="p-6 space-y-3">
                  {/* 写作提示 */}
                  <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                    <p className="text-xs font-bold text-blue-700 mb-1.5">📝 写作提示</p>
                    <ul className="text-xs text-blue-900/80 space-y-1 list-disc list-inside">
                      <li>用 1 句话总结以上论点的核心观点</li>
                      <li>给出你的最终立场、建议或展望</li>
                    </ul>
                  </div>

                  <textarea
                    value={assembledEssay.conclusion}
                    onChange={(e) => setAssembledEssay(prev => prev ? { ...prev, conclusion: e.target.value } : null)}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none text-slate-700 leading-relaxed text-sm min-h-[100px]"
                    placeholder="Try writing your conclusion here..."
                  />

                  {/* AI 范例按钮 */}
                  {!showConclusionRef ? (
                    <button
                      onClick={() => handleLoadAiReference('conclusion')}
                      disabled={isLoadingReference}
                      className="text-xs text-blue-600 hover:text-blue-800 underline decoration-blue-200 hover:decoration-blue-400 transition-colors flex items-center gap-1"
                    >
                      {isLoadingReference ? '正在生成范例...' : '💡 写不出来？看看AI范例'}
                    </button>
                  ) : aiReference && (
                    <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 animate-fade-in-up">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">📖 AI 参考范例</p>
                        <button onClick={() => setShowConclusionRef(false)} className="text-[10px] text-blue-600 hover:text-blue-800 underline">收起</button>
                      </div>
                      <p className="text-xs text-blue-900 leading-relaxed italic">"{aiReference.conclusion}"</p>
                      <p className="text-[10px] text-blue-600 mt-2">提示：请参考思路和结构，用自己的话重新表达</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Word Count & Actions */}
            <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className="text-sm text-slate-500">
                总字数：<span className="font-bold text-slate-800">
                  {[assembledEssay.introduction, ...assembledEssay.bodyParagraphs.map(p => p.draft), assembledEssay.conclusion]
                    .join(' ').split(/\s+/).filter(w => w).length}
                </span> words
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setFlowState('selecting_card')}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  ← 返回编辑
                </button>

                {onSendToGrader && (
                  <button
                    onClick={handleSendToGrader}
                    className="px-6 py-3 bg-blue-900 hover:bg-blue-950 text-white rounded-xl font-bold text-sm shadow-md transition-colors flex items-center gap-2"
                  >
                    <span>🚀</span> 发送到作文批改 (Submit to Grader)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {(flowState === 'error' || error) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-600 max-w-2xl mx-auto mt-8 no-print">
          <p className="font-bold text-lg mb-2">Something went wrong</p>
          <p>{error}</p>
          {error?.includes("API Key") && (
            <p className="text-xs mt-2 text-slate-500">
              请检查右上角设置中的 API Key，或联系管理员在 Netlify 后台配置环境变量。
            </p>
          )}
          <button onClick={resetApp} className="mt-4 underline font-bold hover:text-red-800">Try Again</button>
        </div>
      )}

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={historyItems}
        onSelect={handleSelectHistoryItem}
        onDelete={handleDeleteHistoryItem}
        title="Thinking History"
      />
    </div>
  );
};

export default SocraticCoach;
