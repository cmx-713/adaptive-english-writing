
import React, { useState, useEffect } from 'react';
import { InspirationCard, DimensionDraft } from '../types';
import { validateIdea, IdeaValidationResult } from '../services/geminiService';

interface PhaseOneCardsProps {
  topic: string;
  cards: InspirationCard[];
  inputs: Record<string, string>;
  onInputChange: (id: string, value: string) => void;
  onSelect: (card: InspirationCard, idea: string) => void;
  isLoading: boolean;
  dimensionDrafts: Record<string, DimensionDraft>;  // 各维度草稿
  onAssembleEssay: () => void;                       // 组合成文回调
  onPersonalizedExpansion?: (cardId: string, expansion: string[]) => void; // 个性化拓展回调
}

const PhaseOneCards: React.FC<PhaseOneCardsProps> = ({ 
  topic, 
  cards, 
  inputs, 
  onInputChange, 
  onSelect, 
  isLoading,
  dimensionDrafts,
  onAssembleEssay,
  onPersonalizedExpansion
}) => {
  // Track revealed cards: Set<cardId>
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => {
    return new Set<string>();
  });

  // Track hints/rescue visibility: { [cardId]: 'hint' | 'rescue' | null }
  const [helperState, setHelperState] = useState<Record<string, 'hint' | 'rescue' | null>>({});
  
  // Validation State
  const [validationLoading, setValidationLoading] = useState<Record<string, boolean>>({});
  const [validationResult, setValidationResult] = useState<Record<string, IdeaValidationResult>>({});
  // Track if validation feedback is expanded (Accordion logic)
  const [feedbackExpanded, setFeedbackExpanded] = useState<Record<string, boolean>>({});

  // UI State for specific button loading feedback
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Reset submitting state when isLoading prop changes back to false (e.g. error or reset)
  useEffect(() => {
    if (!isLoading) {
      setSubmittingId(null);
    }
  }, [isLoading]);

  const handleReveal = (id: string) => {
    // Strict check: Must have validation result to reveal
    if (!validationResult[id]) return;
    
    const newRevealed = new Set(revealedIds);
    newRevealed.add(id);
    setRevealedIds(newRevealed);
    
    // Auto-collapse the validation feedback when revealing to save space
    setFeedbackExpanded(prev => ({ ...prev, [id]: false }));
  };

  const handleSubmit = (card: InspirationCard) => {
    const idea = inputs[card.id];
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

  const handleCheckIdea = async (card: InspirationCard) => {
    const input = inputs[card.id];
    if (!input || !input.trim()) return;

    setValidationLoading(prev => ({ ...prev, [card.id]: true }));
    try {
        const result = await validateIdea(topic, card.dimension, input);
        setValidationResult(prev => ({ ...prev, [card.id]: result }));
        // Auto-expand validation when it first arrives
        setFeedbackExpanded(prev => ({ ...prev, [card.id]: true }));
        // 只有观点有效（exceptional/valid）时，才将个性化拓展通知父组件用于语言支架页面
        if (result.thinkingExpansion && result.thinkingExpansion.length > 0 && onPersonalizedExpansion) {
          if (result.status === 'exceptional' || result.status === 'valid') {
            onPersonalizedExpansion(card.id, result.thinkingExpansion);
          }
        }
    } catch (e) {
        console.error(e);
    } finally {
        setValidationLoading(prev => ({ ...prev, [card.id]: false }));
    }
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
            
            {/* 2. Body: Detailed Analysis (Collapsible) */}
            {isExpanded && (
              <div className="p-4">
                <p className={`text-sm leading-relaxed ${config.text} opacity-90`}>
                  <span className="font-bold text-xs uppercase tracking-wider block mb-1 opacity-60">Coach's Analysis</span>
                  {renderRichText(result.analysis)}
                </p>
              </div>
            )}
        </div>
    );
  };

  // Identify cards that have input
  const filledCards = cards.filter(c => (inputs[c.id] || '').trim().length > 0);

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
          先尝试从以下三个维度出发，写下你的第一反应（关键词或短句）。
          <br/>只有当你付出思考后，苏格拉底教练的启发才会出现。
        </p>

        {/* 🆕 Progress Indicator - Always Visible */}
        <div className="max-w-3xl mx-auto mt-6 mb-2">
          <div className={`rounded-xl border-2 p-4 transition-all duration-300 ${
            Object.keys(dimensionDrafts).length >= 2 
              ? 'bg-emerald-50 border-emerald-300 shadow-lg' 
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-slate-700">
                📝 写作进度
              </span>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                Object.keys(dimensionDrafts).length >= 2
                  ? 'bg-emerald-200 text-emerald-800'
                  : 'bg-blue-200 text-blue-800'
              }`}>
                {Object.keys(dimensionDrafts).length}/2 维度已完成
              </span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  Object.keys(dimensionDrafts).length >= 2 ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min((Object.keys(dimensionDrafts).length / 2) * 100, 100)}%` }}
              />
            </div>
            
            <p className="text-xs text-slate-600">
              {Object.keys(dimensionDrafts).length === 0 && (
                <>💡 完成任意 <strong className="text-brand-600">2 个维度</strong>即可 AI 辅助生成完整作文</>
              )}
              {Object.keys(dimensionDrafts).length === 1 && (
                <>⏳ 再完成 <strong className="text-amber-600">1 个维度</strong>即可生成作文！</>
              )}
              {Object.keys(dimensionDrafts).length >= 2 && (
                <>🎉 太棒了！现在可以<strong className="text-emerald-600">组合成篇</strong>了（也可继续完成更多维度）</>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card) => {
          const isRevealed = revealedIds.has(card.id);
          const inputVal = inputs[card.id] || '';
          // 上方卡片不显示 loading 动画，loading 统一由底部卡片展示
          const isSubmitting = false;
          
          // Conditions
          const canCheck = inputVal.trim().length > 1; // Min length to check
          const isChecking = validationLoading[card.id];
          const hasValidation = !!validationResult[card.id]; // Must have result to reveal
          const canReveal = hasValidation && !isChecking;

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
                    Dimension
                  </span>
                  {dimensionDrafts[card.id] && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      ✅ 已写段落
                    </span>
                  )}
                </div>
                <h4 className="text-xl font-bold text-slate-800 leading-tight">{card.dimension}</h4>
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
                      1. 你的初步构想 (Draft Idea)
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
                  placeholder={isRevealed ? "" : "在这个维度下，你想到了什么观点？(Type here)..."}
                  value={inputVal}
                  onChange={(e) => onInputChange(card.id, e.target.value)}
                  disabled={isLoading}
                />

                {/* PRE-VALIDATION FEEDBACK - COLLAPSIBLE */}
                {renderValidationFeedback(card.id)}

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
                            {isChecking ? 'Thinking...' : hasValidation ? '⚡ Re-Check' : '⚡ Check Idea'}
                        </button>

                        {/* Reveal Button - Only visible if NOT revealed yet */}
                        {!isRevealed && (
                            <button
                                onClick={() => handleReveal(card.id)}
                                disabled={!canReveal || isLoading}
                                className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1
                                ${!canReveal || isLoading
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-slate-800 text-white hover:bg-slate-700 shadow-md transform hover:-translate-y-0.5'}`}
                                title={!canReveal ? "Please check your idea first" : "Reveal the coach's question"}
                            >
                                {canReveal ? '🔓 Reveal Coach' : '🔒 Check First'}
                            </button>
                        )}
                    </div>

                    {/* ROW 2: REVEALED CONTENT (SOCRATIC + NEXT STEP) */}
                    {isRevealed && (
                        <div className="pt-4 border-t border-dashed border-brand-200 animate-fade-in-up">
                             {/* Coach Perspective Header */}
                             <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-brand-500 uppercase tracking-wider flex items-center gap-1">
                                <span>👨‍🏫</span> Coach's Perspective
                                </label>
                                <button 
                                onClick={(e) => toggleHelper(e, card.id, 'hint')}
                                className="text-[10px] text-slate-400 hover:text-brand-500 underline decoration-slate-200"
                                >
                                {helperState[card.id] === 'hint' ? 'Hide Hint' : 'Too hard?'}
                                </button>
                             </div>
                            
                             {/* Socratic Question Box */}
                             <div className="bg-brand-50/50 p-3 rounded-lg border border-brand-100 mb-4 relative">
                                <p className="text-sm font-medium text-brand-900 leading-relaxed italic">
                                "{card.socraticQuestion}"
                                </p>
                                {helperState[card.id] === 'hint' && (
                                <div className="mt-2 pt-2 border-t border-brand-100 text-xs text-brand-700 animate-fade-in-up">
                                    <span className="font-bold">Hint: </span>{card.hint}
                                </div>
                                )}
                             </div>

                             {/* Thinking Expansion: Two-layer design */}
                             {(() => {
                               // Layer 2（个性化）优先于 Layer 1（通用）
                               const personalExpansion = validationResult[card.id]?.thinkingExpansion;
                               const validationStatus = validationResult[card.id]?.status;
                               const hasPersonalized = personalExpansion && personalExpansion.length > 0;
                               const displayExpansion = hasPersonalized ? personalExpansion : card.thinkingExpansion;
                               
                               // 只有观点被认可（exceptional/valid）时才标记为"个性化"
                               const isGenuinelyPersonalized = hasPersonalized && (validationStatus === 'exceptional' || validationStatus === 'valid');
                               
                               if (!displayExpansion || displayExpansion.length === 0) return null;

                               return (
                                 <div className={`mb-4 rounded-lg border overflow-hidden animate-fade-in-up ${
                                   isGenuinelyPersonalized 
                                     ? 'bg-teal-50/60 border-teal-200/60' 
                                     : 'bg-amber-50/60 border-amber-200/60'
                                 }`}>
                                   <div className={`px-3 py-2 border-b flex items-center justify-between ${
                                     isGenuinelyPersonalized 
                                       ? 'bg-teal-100/40 border-teal-200/40' 
                                       : 'bg-amber-100/40 border-amber-200/40'
                                   }`}>
                                     <span className={`text-xs font-bold flex items-center gap-1.5 ${
                                       isGenuinelyPersonalized ? 'text-teal-700' : 'text-amber-700'
                                     }`}>
                                       <span>{isGenuinelyPersonalized ? '🎯' : '💡'}</span> 
                                       {isGenuinelyPersonalized 
                                         ? '思路拓展 — 基于你的观点深度拓展' 
                                         : '思路拓展 — 参考方向，帮你找到切入点'}
                                     </span>
                                     {isGenuinelyPersonalized && (
                                       <span className="text-[10px] bg-teal-200/60 text-teal-700 px-1.5 py-0.5 rounded-full font-bold">
                                         个性化
                                       </span>
                                     )}
                                   </div>
                                   <ul className="px-3 py-2 space-y-1.5">
                                     {displayExpansion.map((point, idx) => (
                                       <li key={idx} className={`flex items-start gap-2 text-xs leading-relaxed ${
                                         isGenuinelyPersonalized ? 'text-teal-900/80' : 'text-amber-900/80'
                                       }`}>
                                         <span className={`mt-0.5 flex-shrink-0 ${isGenuinelyPersonalized ? 'text-teal-500' : 'text-amber-500'}`}>•</span>
                                         <span>{point}</span>
                                       </li>
                                     ))}
                                   </ul>
                                 </div>
                               );
                             })()}

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
                                       <span>Generating Scaffolds...</span>
                                    </>
                                ) : (
                                    <>
                                       <span>✨</span> 获取语言支架 (Get Scaffolds)
                                    </>
                                )}
                             </button>
                        </div>
                    )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Essay Assembly CTA - show when 2+ dimensions have drafts */}
      {(() => {
        const draftCount = Object.keys(dimensionDrafts).length;
        if (draftCount >= 2) {
          return (
            <div className="mt-12 pt-8 border-t-2 border-emerald-200 max-w-4xl mx-auto">
              <div className="bg-gradient-to-r from-emerald-50 to-brand-50 rounded-2xl p-8 border border-emerald-200 shadow-lg text-center">
                <div className="text-4xl mb-3">📝</div>
                <h3 className="text-2xl font-serif font-bold text-slate-800 mb-2">准备组合成文！</h3>
                <p className="text-slate-500 mb-1">
                  你已完成 <span className="font-bold text-emerald-600">{draftCount}</span> 个维度的段落写作
                </p>
                <p className="text-sm text-slate-400 mb-6">
                  AI 将为你生成引言和结论，组合成一篇完整的 CET-4/6 作文
                </p>
                
                {/* Draft Progress */}
                <div className="flex justify-center gap-3 mb-6">
                  {cards.map((card) => (
                    <div key={card.id} className={`px-3 py-2 rounded-lg text-xs font-bold border ${
                      dimensionDrafts[card.id]
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`}>
                      {dimensionDrafts[card.id] ? '✅' : '⬜'} {card.dimension}
                    </div>
                  ))}
                </div>

                <button
                  onClick={onAssembleEssay}
                  className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-emerald-500/30 transition-all hover:-translate-y-0.5 flex items-center gap-2 mx-auto"
                >
                  <span>✨</span> 组合成文 (Assemble Essay)
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
              {Object.keys(dimensionDrafts).length > 0 ? '继续写作其他维度' : 'Ready for Step 2?'}
            </h3>
            <p className="text-slate-500 mt-2">
               {filledCards.length > 0 
                  ? Object.keys(dimensionDrafts).length > 0 
                    ? "选择下一个维度，继续写作段落。完成 2 个以上维度后可组合成文。"
                    : "选择一个切入点，获取 AI 定制的语言支架 (Vocabulary & Frames)。"
                  : "请先在上方卡片中输入你的观点，再进行下一步。"}
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
                             <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-colors ${
                               hasDraft 
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
                                {card.dimension}
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
