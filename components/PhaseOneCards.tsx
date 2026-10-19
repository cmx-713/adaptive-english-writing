
import React, { useState, useEffect } from 'react';
import { InspirationCard, DimensionDraft, WritingMode, getNarrativeFocusLabel } from '../types';
import { continueIdeaCoaching, validateIdea, continueNarrativeCoaching, validateNarrativeIdea, synthesizeNarrativeRevision, IdeaCoachingTurn, IdeaValidationResult } from '../services/geminiService';

interface PhaseOneCardsProps {
  topic: string;
  writingMode?: WritingMode;
  cards: InspirationCard[];
  inputs: Record<string, string>;
  onInputChange: (id: string, value: string) => void;
  onSelect: (card: InspirationCard, idea: string) => void;
  isLoading: boolean;
  dimensionDrafts: Record<string, DimensionDraft>;  // 各维度草稿
  onAssembleEssay: () => void;                       // 组合成文回调
  onValidationComplete?: (cardId: string, result: IdeaValidationResult) => void; // 观点验证完成回调
  onAddDimension?: (dimension: string) => void;
  addingDimension?: string | null;
}

const DIMENSION_VAULT = [
  { label: 'Environment', icon: '🌱' },
  { label: 'Tech', icon: '⚡' },
  { label: 'Health', icon: '🏥' },
  { label: 'Psychology', icon: '🧠' },
  { label: 'Education', icon: '📚' },
  { label: 'Ethics', icon: '⚖️' },
];

const PhaseOneCards: React.FC<PhaseOneCardsProps> = ({
  topic,
  writingMode = 'argumentative',
  cards,
  inputs,
  onInputChange,
  onSelect,
  isLoading,
  dimensionDrafts,
  onAssembleEssay,
  onValidationComplete,
  onAddDimension,
  addingDimension = null
}) => {
  const isNarrative = writingMode === 'narrative';
  // Track rescue/hint visibility: { [cardId]: 'hint' | 'rescue' | null }
  const [helperState, setHelperState] = useState<Record<string, 'hint' | 'rescue' | null>>({});

  // Validation State
  const [validationLoading, setValidationLoading] = useState<Record<string, boolean>>({});
  const [validationResult, setValidationResult] = useState<Record<string, IdeaValidationResult>>({});
  const [coachingAnswers, setCoachingAnswers] = useState<Record<string, string>>({});
  const [revisedIdeas, setRevisedIdeas] = useState<Record<string, string>>({});
  const [coachingBusy, setCoachingBusy] = useState<Record<string, boolean>>({});
  const [coachingErrors, setCoachingErrors] = useState<Record<string, string>>({});
  // Track if validation feedback is expanded (Accordion logic)
  const [feedbackExpanded, setFeedbackExpanded] = useState<Record<string, boolean>>({});
  const [showMoreDimensions, setShowMoreDimensions] = useState(false);

  // UI State for specific button loading feedback
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Reset submitting state when isLoading prop changes back to false (e.g. error or reset)
  useEffect(() => {
    if (!isLoading) {
      setSubmittingId(null);
    }
  }, [isLoading]);

  useEffect(() => {
    setShowMoreDimensions(false);
  }, [topic]);

  const handleSubmit = (card: InspirationCard) => {
    const revisedIdea = revisedIdeas[card.id] ?? validationResult[card.id]?.revisedIdea ?? '';
    if (revisedIdea !== (validationResult[card.id]?.revisedIdea || '')) {
      handleRevisedIdeaChange(card.id, revisedIdea);
    }
    const idea = revisedIdea.trim() || validationResult[card.id]?.initialIdea || inputs[card.id];
    if (idea && idea.trim()) {
      setSubmittingId(card.id); // Set local loading state
      onSelect(card, idea);
    }
  };

  const toggleHelper = (e: React.MouseEvent, id: string, type: 'hint' | 'rescue') => {
    e.stopPropagation();
    setHelperState(prev => ({
      ...prev,
      [id]: prev[id] === type ? null : type
    }));
  };

  const toggleFeedbackExpanded = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent triggering other clicks if needed
    setFeedbackExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const persistCoachingResult = (cardId: string, result: IdeaValidationResult) => {
    onValidationComplete?.(cardId, result);
  };

  const handleCheckIdea = async (card: InspirationCard) => {
    const input = inputs[card.id];
    if (!input || !input.trim()) return;

    setValidationLoading(prev => ({ ...prev, [card.id]: true }));
    setCoachingErrors(prev => ({ ...prev, [card.id]: '' }));
    try {
      const result = isNarrative
        ? await validateNarrativeIdea(topic, card.dimension, input, card.narrativeRole)
        : await validateIdea(topic, card.dimension, input);
      setValidationResult(prev => ({ ...prev, [card.id]: result }));
      setCoachingAnswers(prev => ({ ...prev, [card.id]: '' }));
      setRevisedIdeas(prev => ({ ...prev, [card.id]: '' }));
      // Auto-expand validation when it first arrives
      setFeedbackExpanded(prev => ({ ...prev, [card.id]: true }));
      persistCoachingResult(card.id, result);
    } catch (e) {
      console.error(e);
      setCoachingErrors(prev => ({ ...prev, [card.id]: e instanceof Error ? e.message : '思维导师暂时无法回应，请重试。' }));
    } finally {
      setValidationLoading(prev => ({ ...prev, [card.id]: false }));
    }
  };

  const handleCoachingResponse = async (card: InspirationCard, retry = false) => {
    const current = validationResult[card.id];
    const conversation = current?.conversation || [];
    const lastTurn = conversation[conversation.length - 1];
    if (!current || !lastTurn || coachingBusy[card.id]) return;

    const response = retry ? lastTurn.studentResponse || '' : (coachingAnswers[card.id] || '').trim();
    if (!response) return;

    const answeredConversation = conversation.map((turn, index) =>
      index === conversation.length - 1 ? { ...turn, studentResponse: response } : turn
    );
    const pendingResult = { ...current, conversation: answeredConversation };
    setValidationResult(prev => ({ ...prev, [card.id]: pendingResult }));
    persistCoachingResult(card.id, pendingResult);
    setCoachingErrors(prev => ({ ...prev, [card.id]: '' }));
    setCoachingBusy(prev => ({ ...prev, [card.id]: true }));

    try {
      const coachReply = isNarrative
        ? await continueNarrativeCoaching(topic, card.dimension, current.initialIdea || inputs[card.id] || '', answeredConversation, card.narrativeRole)
        : await continueIdeaCoaching(topic, card.dimension, current.initialIdea || inputs[card.id] || '', answeredConversation);
      const completedConversation: IdeaCoachingTurn[] = answeredConversation.map((turn, index) =>
        index === answeredConversation.length - 1
          ? { ...turn, coachFeedback: coachReply.analysis }
          : turn
      );
      const needsNextRound = !!coachReply.nextQuestion && completedConversation.length < 2;
      if (needsNextRound) {
        completedConversation.push({ question: coachReply.nextQuestion, hint: coachReply.nextHint });
      }
      let nextResult: IdeaValidationResult = {
        ...pendingResult,
        status: coachReply.status,
        progressSummary: coachReply.progressSummary,
        remainingGap: coachReply.remainingGap,
        conversation: completedConversation,
        isComplete: !needsNextRound,
      };
      if (isNarrative && !needsNextRound) {
        const revision = await synthesizeNarrativeRevision(
          topic,
          card.dimension,
          current.initialIdea || inputs[card.id] || '',
          completedConversation,
          coachReply.progressSummary,
          coachReply.remainingGap
        );
        nextResult = { ...nextResult, revisedIdea: revision.revisedIdea };
        // Keep the controlled textarea in sync with the generated revision.
        // Otherwise the initial empty edit state would mask result.revisedIdea.
        setRevisedIdeas(prev => ({ ...prev, [card.id]: revision.revisedIdea }));
      }
      setValidationResult(prev => ({ ...prev, [card.id]: nextResult }));
      setCoachingAnswers(prev => ({ ...prev, [card.id]: '' }));
      persistCoachingResult(card.id, nextResult);
    } catch (e) {
      console.error(e);
      setCoachingErrors(prev => ({ ...prev, [card.id]: e instanceof Error ? e.message : '思维导师暂时无法回应，请重试。' }));
    } finally {
      setCoachingBusy(prev => ({ ...prev, [card.id]: false }));
    }
  };

  const handleRevisedIdeaChange = (cardId: string, revisedIdea: string) => {
    const current = validationResult[cardId];
    if (!current) return;
    const next = { ...current, revisedIdea };
    setValidationResult(prev => ({ ...prev, [cardId]: next }));
    setRevisedIdeas(prev => ({ ...prev, [cardId]: revisedIdea }));
    persistCoachingResult(cardId, next);
  };

  // Helper to render text with bold markers (**text**)
  const renderRichText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <span key={i} className="font-bold text-slate-800 bg-yellow-100/50 px-0.5 rounded">{part.slice(2, -2)}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const renderValidationFeedback = (id: string) => {
    const result = validationResult[id];
    if (!result) return null;

    const isExpanded = feedbackExpanded[id];

    const config = {
      exceptional: {
        bg: "bg-purple-50",
        border: "border-purple-200",
        icon: "🌟",
        text: "text-purple-900",
        titleColor: "text-purple-700"
      },
      valid: {
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        icon: "✅",
        text: "text-emerald-800",
        titleColor: "text-emerald-700"
      },
      weak: {
        bg: "bg-amber-50",
        border: "border-amber-200",
        icon: "💡",
        text: "text-amber-800",
        titleColor: "text-amber-700"
      },
      off_topic: {
        bg: "bg-rose-50",
        border: "border-rose-200",
        icon: "🧭",
        text: "text-rose-800",
        titleColor: "text-rose-700"
      }
    }[result.status];

    return (
      <div className={`mt-3 rounded-lg border overflow-hidden animate-fade-in-up ${config.border} ${config.bg}`}>
        {/* 1. Clickable Header: Toggle Expand/Collapse */}
        <div
          onClick={(e) => toggleFeedbackExpanded(e, id)}
          className={`px-4 py-2 flex items-center gap-2 border-b ${isExpanded ? config.border : 'border-transparent'} bg-white/50 cursor-pointer hover:bg-white/80 transition-colors select-none`}
          title={isExpanded ? "Click to collapse" : "Click to view detailed analysis"}
        >
          <span className="text-lg">{config.icon}</span>
          <span className={`font-bold text-sm flex-grow ${config.titleColor}`}>
            {result.feedbackTitle}
            <span className="text-xs font-normal opacity-60 ml-2">
              {isExpanded ? '(Click to collapse)' : '... (Click to view analysis)'}
            </span>
          </span>

          {/* Exceptional Badge (if applicable) */}
          {result.status === 'exceptional' && (
            <span className="hidden sm:inline-block mr-2 text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider border border-purple-200">
              High Five! 🙌
            </span>
          )}

          {/* Chevron Icon */}
          <span className={`text-slate-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}>
            ▼
          </span>
        </div>

        {/* 2. Body: Coaching diagnosis (Collapsible) */}
        {isExpanded && (
          <div className="p-4">
            <p className={`text-sm leading-relaxed ${config.text} opacity-90`}>
              <span className="font-bold text-xs uppercase tracking-wider block mb-1 opacity-60">思考诊断 · {result.focusArea || (isNarrative ? '故事构思' : '观点分析')}</span>
              {renderRichText(result.analysis)}
            </p>
          </div>
        )}
      </div>
    );
  };

  // Identify cards that have input
  const filledCards = cards.filter(c => (inputs[c.id] || '').trim().length > 0);
  const hasStartedThinking = Object.values(inputs).some(value => value.trim().length > 0);
  // Narrative writing is complete only after all three story dimensions are drafted.
  // Argumentative writing keeps its existing two-dimension threshold.
  const completionTarget = isNarrative ? 3 : 2;
  const draftCount = Object.keys(dimensionDrafts).length;
  const progressComplete = draftCount >= completionTarget;
  const availableVaultDimensions = DIMENSION_VAULT.filter(dim =>
    !cards.some(card => card.dimension.toLowerCase() === dim.label.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      <div className="text-center relative">
        {/* Step Indicator */}
        <h3 className="text-2xl font-serif font-bold text-slate-800 mb-2">Step 1: 预测与联想 (Prediction)</h3>

        {/* Topic Display */}
        <div className="max-w-3xl mx-auto my-4 bg-white border border-slate-200 rounded-lg p-3 shadow-sm inline-flex items-center gap-3">
          <span className="bg-brand-50 text-brand-700 text-[10px] font-bold px-2 py-1 rounded border border-brand-100 uppercase tracking-wider whitespace-nowrap">
            当前题目 / Topic
          </span>
          <span className="font-bold text-slate-800 text-lg md:text-xl line-clamp-1 text-left">
            {topic}
          </span>
        </div>

        <p className="text-slate-500 text-sm md:text-base max-w-2xl mx-auto">
          <span className="font-bold text-brand-600">元认知训练：</span>
          {isNarrative
            ? '从为本题生成的故事构思切入点出发，写下你想讲述的场景、行动或变化。'
            : '先从为本题生成的不同切入点出发，写下你的第一反应（关键词或短句）。'}
          <br />{isNarrative
            ? '审辨写作思维导师会聚焦故事细节与事件发展，引导你讲清自己的经历，不替你编写故事。'
            : '审辨写作思维导师会通过聚焦问题，引导你检查理由、证据与条件，不替你生成观点。'}
        </p>

        {/* 🆕 Progress Indicator - Always Visible */}
        <div className="max-w-3xl mx-auto mt-6 mb-2">
          <div className={`rounded-xl border-2 p-4 transition-all duration-300 ${progressComplete
              ? 'bg-emerald-50 border-emerald-300 shadow-lg'
              : 'bg-blue-50 border-blue-200'
            }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-slate-700">
                📝 写作进度
              </span>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${progressComplete
                  ? 'bg-emerald-200 text-emerald-800'
                  : 'bg-blue-200 text-blue-800'
                }`}>
                {draftCount}/{completionTarget} {isNarrative ? '故事构思' : '维度'}已完成
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${progressComplete ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                style={{ width: `${Math.min((draftCount / completionTarget) * 100, 100)}%` }}
              />
            </div>

            <p className="text-xs text-slate-600">
              {draftCount === 0 && (
                isNarrative
                  ? <>💡 完成一个故事构思卡，即可进入叙事语言支架</>
                  : <>💡 完成任意 <strong className="text-brand-600">2 个维度</strong>即可 AI 辅助生成完整作文</>
              )}
              {draftCount === 1 && (
                isNarrative
                  ? <>✅ 已完成一个故事切入点，可继续补充构思或获取语言支架</>
                  : <>⏳ 再完成 <strong className="text-amber-600">1 个维度</strong>即可生成作文！</>
              )}
              {draftCount === 2 && (
                isNarrative
                  ? <>✅ 已完成场景和行动，再补充<strong className="text-emerald-600">结果与回望</strong>即可整理完整故事</>
                  : <>🎉 太棒了！现在可以<strong className="text-emerald-600">组合成篇</strong>了（也可继续完成更多维度）</>
              )}
              {draftCount >= 3 && (
                isNarrative
                  ? <>🎉 三个故事环节已完成，现在可以<strong className="text-emerald-600">整理完整故事</strong></>
                  : <>🎉 太棒了！现在可以<strong className="text-emerald-600">组合成篇</strong>了（也可继续完成更多维度）</>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card) => {
          const isRevealed = !!validationResult[card.id];
          const inputVal = inputs[card.id] || '';
          // 上方卡片不显示 loading 动画，loading 统一由底部卡片展示
          const isSubmitting = false;

          // Conditions
          const canCheck = inputVal.trim().length > 1; // Min length to check
          const isChecking = validationLoading[card.id];
          const hasValidation = !!validationResult[card.id]; // Must have result to reveal

          return (
            <div
              key={card.id}
              className={`rounded-2xl border-2 transition-all duration-300 relative flex flex-col group overflow-hidden bg-white
                ${isRevealed
                  ? 'border-brand-400 shadow-lg scale-[1.02]'
                  : 'border-slate-200 shadow-sm hover:border-brand-200'
                } ${isLoading ? 'opacity-40 grayscale pointer-events-none' : ''}`}
            >
              {/* 1. Header: Dimension Name (Always Visible) */}
              <div className={`p-5 border-b border-slate-100 ${dimensionDrafts[card.id] ? 'bg-emerald-50/50' : 'bg-slate-50/50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">
                    {isNarrative ? 'Story Focus' : 'Dimension'}
                  </span>
                  {dimensionDrafts[card.id] && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      ✅ {isNarrative ? '已完成草稿' : '已写段落'}
                    </span>
                  )}
                </div>
                <h4 className="text-xl font-bold text-slate-800 leading-tight">{isNarrative ? getNarrativeFocusLabel(card.dimension) : card.dimension}</h4>
                {dimensionDrafts[card.id] && (
                  <p className="text-xs text-emerald-600 mt-1 line-clamp-2 italic">
                    "{dimensionDrafts[card.id].draft.substring(0, 80)}..."
                  </p>
                )}
              </div>

              {/* 2. User Input Area (Prediction Phase) */}
              <div className="p-5 flex-grow flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {isNarrative ? '1. 你的故事初步构想 (Story Idea)' : '1. 你的初步构想 (Draft Idea)'}
                  </label>

                  {/* Rescue Button */}
                  {!isRevealed && (
                    <button
                      onClick={(e) => toggleHelper(e, card.id, 'rescue')}
                      className="text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-rose-50"
                      title="大脑空空？点击求救"
                    >
                      <span>🆘</span> {helperState[card.id] === 'rescue' ? 'Hide Help' : 'Stuck?'}
                    </button>
                  )}
                </div>

                {/* Rescue Keywords Display */}
                {helperState[card.id] === 'rescue' && !isRevealed && (
                  <div className="mb-3 bg-rose-50 border border-rose-100 p-3 rounded-lg animate-fade-in-up">
                    <span className="text-[10px] font-bold text-rose-400 uppercase block mb-1">Coach's Keywords</span>
                    <div className="flex flex-wrap gap-2">
                      {(card.keywords || []).map((kw, i) => (
                        <span key={i} className="bg-white text-rose-600 px-2 py-1 rounded text-xs border border-rose-200 shadow-sm">
                          {kw.en} <span className="text-rose-400/80">({kw.zh})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <textarea
                  className={`w-full p-3 rounded-lg border text-sm outline-none resize-none transition-all flex-grow min-h-[80px]
                    ${isRevealed
                      ? 'bg-slate-50 border-slate-200 text-slate-600 focus:bg-white focus:border-brand-300'
                      : 'bg-white border-brand-200 focus:ring-4 focus:ring-brand-50 focus:border-brand-500 text-slate-800 placeholder-slate-300'}`}
                  placeholder={isRevealed ? "" : isNarrative
                    ? '在这个故事切入点下，你想讲述什么场景、行动或变化？'
                    : '在这个维度下，你想到了什么观点？(Type here)...'}
                  value={inputVal}
                  onChange={(e) => onInputChange(card.id, e.target.value)}
                  disabled={isLoading}
                />

                {/* PRE-VALIDATION FEEDBACK - COLLAPSIBLE */}
                {renderValidationFeedback(card.id)}
                {coachingErrors[card.id] && !hasValidation && (
                  <div className="mt-3 p-2 rounded border border-rose-200 bg-rose-50 text-xs text-rose-700" role="alert">
                    {coachingErrors[card.id]}
                  </div>
                )}

                {/* ACTION AREA */}
                <div className="mt-4 space-y-4">
                  {/* ROW 1: CONTROL BUTTONS */}
                  <div className="flex gap-3">
                    {/* Check Button - Always visible to allow re-checking/refining */}
                    <button
                      onClick={() => handleCheckIdea(card)}
                      disabled={!canCheck || isChecking || isLoading}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 border
                            ${!canCheck || isLoading
                          ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                          : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 shadow-sm'}`}
                    >
                      {isChecking ? 'Thinking...' : hasValidation
                        ? isNarrative ? '⚡ 重新检查构想' : '⚡ Re-Check'
                        : isNarrative ? '⚡ 检查故事构想' : '⚡ Check Idea'}
                    </button>
                  </div>

                  {/* ROW 2: REVEALED CONTENT (SOCRATIC + NEXT STEP) */}
                  {isRevealed && (
                    <div className="pt-4 border-t border-dashed border-brand-200 animate-fade-in-up">
                      {(() => {
                        const result = validationResult[card.id];
                        const conversation = result?.conversation || [];
                        const currentTurn = conversation[conversation.length - 1];
                        const hasPendingAnswer = !!currentTurn?.studentResponse && !currentTurn.coachFeedback;
                        const roundComplete = !!result?.isComplete;
                        return (
                          <>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-brand-500 uppercase tracking-wider flex items-center gap-1">
                          <span>👨‍🏫</span> 思维导师引导
                        </label>
                        <span className="text-[10px] text-slate-400">{roundComplete ? '引导完成' : `第 ${Math.min(conversation.length, 2)}/2 轮`}</span>
                      </div>

                      <div className="space-y-3 mb-4">
                        {conversation.map((turn, index) => (
                          <div key={`${card.id}-turn-${index}`} className="space-y-2">
                            <div className="bg-brand-50/60 p-3 rounded-lg border border-brand-100">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-brand-600 mb-1">导师提问 · 第 {index + 1} 轮</div>
                              <p className="text-sm font-medium text-brand-900 leading-relaxed">{turn.question}</p>
                              {turn.hint && (
                                <details className="mt-2 text-xs text-brand-700">
                                  <summary className="cursor-pointer select-none">需要一点提示</summary>
                                  <p className="mt-1 leading-relaxed">{turn.hint}</p>
                                </details>
                              )}
                            </div>
                            {turn.studentResponse && (
                              <div className="ml-3 pl-3 border-l-2 border-sky-200">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-600 mb-1">你的回应</div>
                                <p className="text-xs text-slate-700 leading-relaxed">{turn.studentResponse}</p>
                                {turn.coachFeedback && <p className="text-xs text-emerald-700 leading-relaxed mt-2">导师反馈：{turn.coachFeedback}</p>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {roundComplete && (result?.progressSummary || result?.remainingGap) && (
                        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                          {result.progressSummary && (
                          <p className="text-xs text-emerald-900 leading-relaxed"><span className="font-bold">{isNarrative ? '构思进展：' : '思考进展：'}</span>{result.progressSummary}</p>
                          )}
                          {result.remainingGap && (
                            <p className="text-xs text-amber-900 leading-relaxed"><span className="font-bold">{isNarrative ? '故事写作时可继续补充：' : '写作时仍需留意：'}</span>{result.remainingGap}</p>
                          )}
                        </div>
                      )}

                      {coachingErrors[card.id] && (
                        <div className="mb-3 p-2 rounded border border-rose-200 bg-rose-50 text-xs text-rose-700" role="alert">
                          {coachingErrors[card.id]}
                        </div>
                      )}

                      {!roundComplete && currentTurn && !currentTurn.studentResponse && (
                        <div className="mb-4 space-y-2">
                          <textarea
                            value={coachingAnswers[card.id] || ''}
                            onChange={e => setCoachingAnswers(prev => ({ ...prev, [card.id]: e.target.value }))}
                            disabled={coachingBusy[card.id] || isLoading}
                            rows={3}
                            className="w-full p-3 rounded-lg border border-sky-200 text-sm text-slate-800 outline-none resize-y focus:ring-4 focus:ring-sky-50 focus:border-sky-400 disabled:bg-slate-50"
                            placeholder="试着回应导师的问题，可以写关键词或一两句话。"
                          />
                          <button
                            type="button"
                            onClick={() => handleCoachingResponse(card)}
                            disabled={!coachingAnswers[card.id]?.trim() || coachingBusy[card.id] || isLoading}
                            className="w-full py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold disabled:bg-slate-200 disabled:text-slate-400"
                          >
                            {coachingBusy[card.id] ? '思维导师正在根据你的回应思考…' : '提交回应'}
                          </button>
                        </div>
                      )}

                      {hasPendingAnswer && (
                        <button
                          type="button"
                          onClick={() => handleCoachingResponse(card, true)}
                          disabled={coachingBusy[card.id] || isLoading}
                          className="w-full py-2 mb-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-bold disabled:opacity-50"
                        >
                          {coachingBusy[card.id] ? '思维导师正在反馈…' : '重试导师反馈'}
                        </button>
                      )}

                      {roundComplete && (
                        <div className="mb-4 space-y-2">
                          <label className="block text-xs font-bold text-slate-600">{isNarrative ? '整合后的故事构想（写作路线图，可编辑）' : '用 1–2 句话写下修订后的中心观点（可跳过）'}</label>
                          <p className="text-[11px] text-slate-500">{isNarrative
                            ? 'AI已把你的原始构想和导师追问整合成一条故事线。这不是最终作文；写作时仍需展开场景、行动、反应和结果。你可以修改这条路线图，语言支架会围绕最终内容生成。'
                            : '聚焦你的主张；例子和解释可留到后续段落展开。语言支架将围绕这段观点生成，留空则沿用初步构想。'}</p>
                          <textarea
                            value={revisedIdeas[card.id] ?? result?.revisedIdea ?? ''}
                            onChange={e => setRevisedIdeas(prev => ({ ...prev, [card.id]: e.target.value }))}
                            onBlur={e => handleRevisedIdeaChange(card.id, e.target.value)}
                            disabled={isLoading}
                            rows={2}
                            className="w-full p-3 rounded-lg border border-emerald-200 text-sm text-slate-800 outline-none resize-y focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 disabled:bg-slate-50"
                            placeholder={isNarrative
                              ? '可修改这条故事路线图，也可补充关键场景、行动或结果。'
                              : "例如：Environmental protection requires cooperation among society's key actors, supported by clear policies and shared responsibilities."}
                          />
                        </div>
                      )}

                      {/* MAIN CALL TO ACTION: GET SCAFFOLDS */}
                      <button
                        onClick={() => handleSubmit(card)}
                        disabled={isLoading}
                        className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all text-sm flex items-center justify-center gap-2
                                  ${isSubmitting
                            ? 'bg-brand-400 cursor-wait'
                            : isLoading
                              ? 'bg-slate-300 cursor-not-allowed'
                              : 'bg-brand-600 hover:bg-brand-700 hover:shadow-brand-500/30'}`}
                      >
                        {isSubmitting ? (
                          <>
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <span>{isNarrative ? 'Generating Story Scaffolds...' : 'Generating Scaffolds...'}</span>
                          </>
                        ) : (
                          <>
                            <span>✨</span> {isNarrative
                              ? roundComplete ? '用路线图获取叙事表达支架' : '跳过追问并获取叙事表达支架'
                              : roundComplete ? '获取语言支架' : '跳过追问并获取语言支架'}
                          </>
                        )}
                      </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progressive dimension discovery: unlock after the student starts thinking */}
      {!isNarrative && onAddDimension && hasStartedThinking && availableVaultDimensions.length > 0 && (
        <div className="max-w-4xl mx-auto mt-8 border border-brand-100 rounded-xl bg-brand-50/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMoreDimensions(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-brand-50 transition-colors"
          >
            <span>
              <span className="font-bold text-sm text-brand-900">＋ 探索更多切入点</span>
              <span className="block text-xs text-brand-700/70 mt-0.5">先完成初步联想，再选择一个补充视角</span>
            </span>
            <span className={`text-brand-500 transition-transform ${showMoreDimensions ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {showMoreDimensions && (
            <div className="px-4 pb-4 border-t border-brand-100">
              <div className="flex flex-wrap gap-2 pt-3">
                {availableVaultDimensions.map(dim => (
                  <button
                    key={dim.label}
                    type="button"
                    onClick={() => onAddDimension(dim.label)}
                    disabled={!!addingDimension}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${addingDimension === dim.label
                      ? 'bg-brand-100 text-brand-700 border-brand-300 cursor-wait'
                      : addingDimension
                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-brand-300 hover:text-brand-700'
                    }`}
                  >
                    {addingDimension === dim.label ? '生成中…' : `${dim.icon} ${dim.label}`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-3">新增维度会生成一张与当前题目相关的思维卡片，并进入相同的验证与写作流程。</p>
            </div>
          )}
        </div>
      )}

      {/* Assembly CTA: narratives need all three story dimensions; arguments need two. */}
      {(() => {
        const draftCount = Object.keys(dimensionDrafts).length;
        if ((isNarrative && draftCount >= 3) || (!isNarrative && draftCount >= 2)) {
          return (
            <div className="mt-12 pt-8 border-t-2 border-emerald-200 max-w-4xl mx-auto">
              <div className="bg-gradient-to-r from-emerald-50 to-brand-50 rounded-2xl p-8 border border-emerald-200 shadow-lg text-center">
                <div className="text-4xl mb-3">📝</div>
                <h3 className="text-2xl font-serif font-bold text-slate-800 mb-2">
                  {isNarrative ? '准备整理完整故事！' : '准备组合成文！'}
                </h3>
                <p className="text-slate-500 mb-1">
                  {isNarrative
                    ? <>你已完成故事的<strong className="text-emerald-600">场景、行动与结果</strong>三个环节</>
                    : <>你已完成 <span className="font-bold text-emerald-600">{draftCount}</span> 个维度的段落写作</>}
                </p>
                <p className="text-sm text-slate-400 mb-6">
                  {isNarrative
                    ? 'AI 将帮助你整理开篇场景、事件发展和结尾与回望，形成完整故事'
                    : 'AI 将为你生成引言和结论，组合成一篇完整的 CET-4/6 作文'}
                </p>

                {/* Draft Progress */}
                <div className="flex justify-center gap-3 mb-6">
                  {cards.map((card) => (
                    <div key={card.id} className={`px-3 py-2 rounded-lg text-xs font-bold border ${dimensionDrafts[card.id]
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>
                      {dimensionDrafts[card.id] ? '✅' : '⬜'} {isNarrative ? getNarrativeFocusLabel(card.dimension) : card.dimension}
                    </div>
                  ))}
                </div>

                <button
                  onClick={onAssembleEssay}
                  className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-emerald-500/30 transition-all hover:-translate-y-0.5 flex items-center gap-2 mx-auto"
                >
                  <span>✨</span> {isNarrative ? '整理完整故事' : '组合成文 (Assemble Essay)'}
                </button>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Bottom Navigation / Action Bar */}
      <div className="mt-12 pt-8 border-t border-slate-200 max-w-4xl mx-auto text-center">
        <div className="mb-6">
          <h3 className="text-2xl font-serif font-bold text-slate-800">
            {draftCount > 0
              ? isNarrative
                ? draftCount >= 3 ? '整理完整故事' : '继续完善故事构思'
                : '继续写作其他维度'
              : isNarrative ? '准备获取叙事语言支架？' : 'Ready for Step 2?'}
          </h3>
          <p className="text-slate-500 mt-2">
            {filledCards.length > 0
              ? isNarrative
                ? draftCount >= 3
                  ? '三个故事环节已经完成，点击上方“整理完整故事”进入完整作文编辑。'
                  : '选择一个故事切入点，获取与场景、行动和叙述表达相关的语言支架。'
                : draftCount > 0
                  ? "选择下一个维度，继续写作段落。完成 2 个以上维度后可组合成文。"
                  : "选择一个切入点，获取 AI 定制的语言支架 (Vocabulary & Frames)。"
              : isNarrative ? '请先写下你想讲述的场景或经历。' : '请先在上方卡片中输入你的观点，再进行下一步。'}
          </p>
        </div>

        {filledCards.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-4">
            {filledCards.map(card => {
              const isSubmitting = isLoading && submittingId === card.id;
              const hasDraft = !!dimensionDrafts[card.id];

              return (
                <button
                  key={card.id}
                  onClick={() => handleSubmit(card)}
                  disabled={isLoading}
                  className={`group flex items-center gap-3 px-6 py-4 border-2 rounded-xl transition-all text-left min-w-[240px]
                            ${isSubmitting
                      ? 'bg-brand-50 border-brand-400 cursor-wait shadow-inner'
                      : isLoading
                        ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                        : hasDraft
                          ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400 hover:shadow-lg'
                          : 'bg-white border-slate-100 hover:border-brand-500 hover:bg-brand-50 hover:shadow-lg'
                    }`}
                >
                  {isSubmitting ? (
                    <div className="w-10 h-10 rounded-full bg-brand-200 flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 text-brand-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${hasDraft
                        ? 'bg-emerald-200 text-emerald-700'
                        : 'bg-brand-100 text-brand-600 group-hover:bg-brand-500 group-hover:text-white'
                      }`}>
                      {hasDraft ? '✓' : cards.indexOf(card) + 1}
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                      {isSubmitting ? 'AI Working...' : hasDraft ? '继续编辑 / Edit' : 'Proceed with'}
                    </div>
                    <div className={`font-bold ${isSubmitting ? 'text-brand-800' : hasDraft ? 'text-emerald-800' : 'text-slate-800 group-hover:text-brand-800'}`}>
                      {isNarrative ? getNarrativeFocusLabel(card.dimension) : card.dimension}
                    </div>
                  </div>

                  {!isSubmitting && (
                    <span className={`text-xl transition-colors ${hasDraft ? 'text-emerald-300 group-hover:text-emerald-500' : 'text-slate-300 group-hover:text-brand-500'}`}>→</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="inline-block px-6 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-sm">
            ✏️ Waiting for your input above...
          </div>
        )}
      </div>
    </div>
  );
};

export default PhaseOneCards;
