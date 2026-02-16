
import React, { useState, useEffect, useRef } from 'react';
import { ScaffoldContent, CollocationItem, DraftFeedback, SentenceFrame } from '../types';
import DimensionDictionary from './DimensionDictionary';
import { validateSentence, fetchMoreCollocations, analyzeDraft } from '../services/geminiService';
import { saveToHistory, checkIsSaved } from '../services/storageService';

interface ResultsDisplayProps {
  data: ScaffoldContent;
  topic: string;
  socraticQuestion?: string; // New: Pass context from step 1
  thinkingExpansion?: string[]; // 思路拓展：从 Step 1 带过来的论述角度
  onBack: () => void;
  isHistoryView?: boolean;
  initialDraft?: string;          // 从已保存草稿恢复
  onDraftChange?: (draft: string) => void;  // 实时回传草稿内容
}

// Badge Logic Helper
const getUsageBadge = (count: number) => {
  if (count >= 5) return { label: '🏆 表达大师 (Expression Master)', color: 'bg-amber-100 text-amber-700 border-amber-200', bg: 'bg-amber-50' };
  if (count >= 3) return { label: '🚀 进阶写手 (Rising Writer)', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', bg: 'bg-indigo-50' };
  if (count >= 1) return { label: '🦋 语言学徒 (Language Apprentice)', color: 'bg-sky-100 text-sky-700 border-sky-200', bg: 'bg-sky-50' };
  return { label: '🌱 初级探索者 (Novice Explorer)', color: 'bg-slate-100 text-slate-500 border-slate-200', bg: 'bg-slate-50' };
};

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ data, topic, socraticQuestion, thinkingExpansion, onBack, isHistoryView = false, initialDraft = '', onDraftChange }) => {
  // Local state for collocations to support "Load More"
  const [collocations, setCollocations] = useState<CollocationItem[]>(data.collocations);
  const [isLoadingMoreCols, setIsLoadingMoreCols] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  // Writing Practice State
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<DraftFeedback | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFeedbackExpanded, setIsFeedbackExpanded] = useState(true);
  
  // Real-time Usage Tracking State
  const [usedVocabSet, setUsedVocabSet] = useState<Set<string>>(new Set());
  const [usedCollocationSet, setUsedCollocationSet] = useState<Set<string>>(new Set());
  
  const feedbackRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync state when data prop changes
  useEffect(() => {
    setCollocations(data.collocations);
    setIsSaved(checkIsSaved(topic, data.userIdea, 'scaffold'));
    setFeedback(null);
    setDraft(initialDraft || '');
    setIsFeedbackExpanded(true);
    setUsedVocabSet(new Set());
    setUsedCollocationSet(new Set());
  }, [data, topic]);

  // Real-time detection of used vocabulary and collocations
  useEffect(() => {
    const lowerDraft = draft.toLowerCase();
    
    // Check Vocabulary
    const foundVocab = new Set<string>();
    data.vocabulary.forEach(v => {
        if (lowerDraft.includes(v.word.toLowerCase())) {
            foundVocab.add(v.word);
        }
    });
    setUsedVocabSet(foundVocab);

    // Check Collocations
    const foundCols = new Set<string>();
    collocations.forEach(c => {
        // Simple inclusion check. Could be improved with regex for word boundaries if needed.
        if (lowerDraft.includes(c.en.toLowerCase())) {
            foundCols.add(c.en);
        }
    });
    setUsedCollocationSet(foundCols);

  }, [draft, data.vocabulary, collocations]);

  // 实时回传草稿给父组件
  useEffect(() => {
    if (onDraftChange) {
      onDraftChange(draft);
    }
  }, [draft]);

  const handleLoadMoreCollocations = async () => {
    setIsLoadingMoreCols(true);
    try {
      const newCols = await fetchMoreCollocations(topic, data.selectedDimension, data.userIdea);
      setCollocations(prev => [...prev, ...newCols]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMoreCols(false);
    }
  };

  const handleSave = () => {
    if (isSaved) return;
    saveToHistory(topic, { ...data, collocations }, 'scaffold'); // Explicitly save as scaffold
    setIsSaved(true);
  };

  const handleCopyToClipboard = () => {
    const text = `
Topic: ${topic}
Dimension: ${data.selectedDimension}
Question: ${socraticQuestion || 'N/A'}
Idea: ${data.userIdea}

--- Core Vocabulary ---
${data.vocabulary.map(v => `${v.word} (${v.chinese}): ${v.englishDefinition}`).join('\n')}

--- Collocations ---
${collocations.map(c => `${c.en} (${c.zh})`).join('\n')}

--- Sentence Frames ---
${data.frames.map(f => `[${f.patternName}] ${f.patternNameZh}\nTemplate: ${f.template}\nModel: ${f.modelSentence}`).join('\n\n')}
`;
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    });
  };

  const handleAnalyzeDraft = async () => {
    if (!draft.trim()) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeDraft(topic, data.selectedDimension, draft, data.vocabulary);
      setFeedback(result);
      setIsFeedbackExpanded(true); // Auto expand on new feedback
      // Scroll to feedback (inside the sandbox container)
      setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    } catch (e) {
      console.error(e);
      alert("Failed to analyze draft. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const speakWord = (e: React.MouseEvent, word: string) => {
    e.stopPropagation();
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Helper to insert text at cursor position in textarea
  const handleInsertText = (text: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    const newText = draft.substring(0, start) + text + draft.substring(end);
    setDraft(newText);
    
    // Restore focus and move cursor
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 0);
  };

  const totalUsedCount = usedVocabSet.size + usedCollocationSet.size;
  const usageBadge = getUsageBadge(totalUsedCount);

  return (
    <div className="animate-fade-in-up space-y-8 pb-12">
      
      {/* 1. Header Section (Full Width) */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 relative group">
        <button 
          onClick={onBack}
          className="absolute top-6 right-6 text-sm text-slate-400 hover:text-brand-600 font-medium flex items-center gap-1 transition-colors"
        >
          <span>←</span> Back
        </button>

        <div className="pr-20">
          {/* Main Topic Title */}
          <div className="mb-4 pb-4 border-b border-slate-100/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Topic / 写作题目</span>
            <h2 className="text-xl md:text-2xl font-serif font-bold text-slate-900 leading-tight">{topic}</h2>
          </div>

          <div className="flex flex-col md:flex-row md:items-start gap-4 text-sm">
             <div className="flex flex-col gap-1">
               <span className="bg-brand-50 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded border border-brand-100 uppercase self-start">
                 Selected Dimension
               </span>
               <span className="font-bold text-slate-700 text-lg">{data.selectedDimension}</span>
             </div>
             
             <div className="hidden md:block w-px h-12 bg-slate-200 mx-2"></div>
             
             <div className="flex-1 space-y-2">
                {/* User Idea */}
                <div className="flex gap-2">
                   <span className="text-lg">💡</span>
                   <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Idea / 你的观点</span>
                      <p className="text-slate-600">"{data.userIdea}"</p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-50">
           {!isHistoryView && (
               <button 
                onClick={handleSave}
                disabled={isSaved}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all
                ${isSaved 
                    ? 'bg-green-50 text-green-600 cursor-default' 
                    : 'bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand-600'}`}
               >
                <span>{isSaved ? '✓ Saved' : '♥ Save to History'}</span>
               </button>
           )}

           <button 
             onClick={handleCopyToClipboard}
             className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-slate-800 text-white hover:bg-slate-700 transition-all shadow-md hover:shadow-lg"
           >
             <span>{copyStatus === 'copied' ? '✅ Copied!' : '📋 Copy All'}</span>
           </button>
        </div>
      </div>

      {/* 1.5 Writing Direction Reference Card (from Step 1 thinking expansion) */}
      {thinkingExpansion && thinkingExpansion.length > 0 && (
        <WritingDirectionCard thinkingExpansion={thinkingExpansion} userIdea={data.userIdea} />
      )}

      {/* 2. Split Layout: Scaffolds (Left) + Sticky Sandbox (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Language Scaffolds (Scrollable) */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <div>
                <h3 className="font-serif font-bold text-lg text-slate-800 flex items-center gap-2">
                <span className="text-brand-600">Language Scaffolds</span> 语言支架
                </h3>
                <p className="text-xs text-slate-400 mt-1">点击插入，输入后自动检测并打钩。</p>
            </div>
            
            {/* Progress Indicator */}
            <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-brand-600 mb-1">
                    Used: {totalUsedCount} / {data.vocabulary.length + collocations.length}
                </div>
                <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-brand-500 transition-all duration-500" 
                        style={{ width: `${(totalUsedCount / (data.vocabulary.length + collocations.length)) * 100}%` }}
                    ></div>
                </div>
            </div>
          </div>
          
          <div className="p-6 space-y-8">
            {/* Vocabulary */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                核心词汇 (Target Vocabulary)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.vocabulary.map((vocab, i) => {
                  const isUsed = usedVocabSet.has(vocab.word);
                  return (
                    <div 
                        key={i} 
                        onClick={() => handleInsertText(vocab.word)}
                        className={`p-4 rounded-lg border transition-all flex flex-col h-full group/card relative cursor-pointer active:scale-95
                        ${isUsed 
                            ? 'bg-emerald-50/40 border-emerald-400 shadow-sm ring-1 ring-emerald-100' 
                            : 'bg-white border-slate-200 hover:border-brand-400 hover:bg-brand-50/30 hover:shadow-md'
                        }`}
                        title={isUsed ? "Used in draft" : "Click to insert"}
                    >
                        <div className="flex items-baseline justify-between mb-1">
                            <div className="flex items-baseline gap-2">
                                <span className={`font-bold text-lg transition-colors ${isUsed ? 'text-emerald-700' : 'text-brand-700 group-hover/card:text-brand-800'}`}>
                                    {vocab.word}
                                </span>
                                <span className="text-base font-medium text-slate-600">({vocab.chinese})</span>
                            </div>
                            <button 
                                onClick={(e) => speakWord(e, vocab.word)}
                                className="opacity-0 group-hover/card:opacity-100 transition-opacity text-slate-400 hover:text-brand-500 p-1 rounded-full hover:bg-brand-100"
                                title="Pronounce"
                            >
                                🔊
                            </button>
                        </div>
                        <div className="mt-auto pt-2 border-t border-slate-50 space-y-1.5">
                            <div className={`text-xs italic p-1.5 rounded transition-colors ${isUsed ? 'text-emerald-700 bg-emerald-100/50' : 'text-slate-700 bg-slate-50 group-hover/card:bg-white'}`}>
                                {vocab.usage}
                            </div>
                            <div className={`text-xs p-1.5 rounded transition-colors ${isUsed ? 'text-emerald-600 bg-emerald-50/30' : 'text-slate-500 bg-slate-50 group-hover/card:bg-white'}`}>
                                {vocab.usageChinese}
                            </div>
                        </div>
                        
                        {/* Status Icon: Checkmark if used, Plus if not */}
                        <div className={`absolute top-2 right-2 transition-all duration-300 ${isUsed ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover/card:opacity-100 group-hover/card:scale-100'}`}>
                            {isUsed ? (
                                <span className="text-emerald-500 bg-white rounded-full shadow-sm block">✅</span>
                            ) : (
                                <span className="text-brand-300 text-lg font-bold">+</span>
                            )}
                        </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Collocations */}
            <div>
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  地道搭配 (Collocations)
                </h4>
                <button 
                  onClick={handleLoadMoreCollocations}
                  disabled={isLoadingMoreCols}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isLoadingMoreCols ? 'Loading...' : '🔄 Get More'}
                </button>
              </div>
              
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-1">
                {collocations.map((col, i) => {
                  const isUsed = usedCollocationSet.has(col.en);
                  return (
                    <li 
                        key={i} 
                        onClick={() => handleInsertText(col.en)}
                        className={`group relative flex items-start gap-2 text-sm p-3 rounded border transition-all h-auto cursor-pointer select-none active:scale-95
                        ${isUsed
                            ? 'bg-emerald-100/50 border-emerald-300 text-emerald-900 shadow-sm'
                            : 'bg-emerald-50/50 border-emerald-100/50 text-slate-700 hover:bg-emerald-100 hover:border-emerald-200'
                        }`}
                        title="Click to insert"
                    >
                        {isUsed ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></span>
                        ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 flex-shrink-0 mt-1.5 group-hover:bg-emerald-500"></span>
                        )}
                        
                        <span className={`font-medium whitespace-normal break-words leading-snug flex-1 ${isUsed ? 'line-through-none' : ''}`}>
                            {col.en}
                        </span>
                        
                        {/* Right Icon */}
                        {isUsed ? (
                            <span className="text-xs text-emerald-600 font-bold ml-2 self-start animate-fade-in-up">
                                ✓
                            </span>
                        ) : (
                            <span className="text-xs text-emerald-600/60 font-medium ml-2 self-start hidden group-hover:inline-block">
                                + Insert
                            </span>
                        )}
                        
                        {/* Tooltip on Hover */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[220px] bg-slate-800 text-white text-xs px-3 py-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[9999]">
                        <p className="font-bold text-center">{col.zh}</p>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Frames */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                句型框架 (Interactive Frames)
              </h4>
              <div className="space-y-4">
                {data.frames.map((frame, i) => (
                  <InteractiveFrame key={i} frame={frame} topic={topic} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Sandbox (Sticky) */}
        <div className="lg:col-span-5 xl:col-span-4 sticky top-6">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[calc(100vh-3rem)]">
             <div className="bg-blue-50 px-6 py-4 border-b border-blue-200 flex-shrink-0">
               <h3 className="font-serif font-bold text-lg text-blue-900 flex items-center gap-2">
                 <span className="text-blue-800">Writing Sandbox</span> 实战演练
               </h3>
               <p className="text-xs text-blue-600 mt-1">
                 Ready? Use materials on the left (Click to insert).
               </p>
             </div>
             
             <div className="p-4 overflow-y-auto custom-scrollbar flex-grow">
               <textarea
                 ref={textareaRef}
                 className="w-full h-48 p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none transition-all text-slate-700 placeholder-slate-400 text-sm leading-relaxed"
                 placeholder="Start writing your paragraph here (50-100 words)..."
                 value={draft}
                 onChange={(e) => setDraft(e.target.value)}
               />
               
               <div className="flex justify-end mt-4">
                 <button 
                   onClick={handleAnalyzeDraft}
                   disabled={isAnalyzing || !draft.trim()}
                   className={`px-4 py-2 rounded-lg font-bold text-white text-sm shadow-md transition-colors flex items-center gap-2
                     ${isAnalyzing || !draft.trim() 
                       ? 'bg-slate-300 cursor-not-allowed' 
                       : 'bg-blue-900 hover:bg-blue-950'}`}
                 >
                   {isAnalyzing ? 'Analyzing...' : '📝 Check My Draft'}
                 </button>
               </div>

               {/* Collapsible Feedback Display */}
               {feedback && (
                 <div ref={feedbackRef} className="mt-6 border border-blue-100 rounded-xl overflow-hidden animate-fade-in-up">
                   {/* Header / Toggle */}
                   <div 
                      onClick={() => setIsFeedbackExpanded(!isFeedbackExpanded)}
                      className="bg-blue-50 p-3 flex justify-between items-center cursor-pointer hover:bg-blue-100 transition-colors"
                   >
                      <div className="flex items-center gap-3">
                         <span className="text-xl font-bold text-blue-900">{feedback.score}<span className="text-xs text-blue-600">/10</span></span>
                         <span className="text-xs font-bold text-blue-900 uppercase">Coach's Feedback</span>
                      </div>
                      <span className={`text-blue-600 transform transition-transform duration-200 ${isFeedbackExpanded ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                   </div>
                   
                   {/* Expandable Body */}
                   {isFeedbackExpanded && (
                     <div className="p-4 space-y-4 bg-white">
                        {/* Comment */}
                        <p className="text-xs text-slate-600 leading-relaxed italic border-l-2 border-blue-200 pl-3">
                          "{feedback.comment}"
                        </p>

                        {/* Improvements */}
                        <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                            <h4 className="text-amber-800 font-bold text-xs mb-2 flex items-center gap-1">
                              <span>🔨</span> Suggestions
                            </h4>
                            <ul className="list-disc list-inside space-y-1 text-xs text-amber-900/80">
                              {feedback.suggestions.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                        </div>

                        {/* Polished Version */}
                        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                            <h4 className="text-emerald-800 font-bold text-xs mb-2 flex items-center gap-1">
                              <span>✨</span> Polished Version
                            </h4>
                            <p className="text-xs text-emerald-900/80 leading-relaxed italic">
                              "{feedback.polishedVersion}"
                            </p>
                        </div>

                        {/* Gamified Usage Badge (Replaces old List) */}
                        <div className={`flex items-center justify-between p-3 rounded-lg border ${usageBadge.color} bg-opacity-30 ${usageBadge.bg}`}>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    语料达成度 (Corpus Badge)
                                </span>
                                <div className="text-xs font-bold">
                                    {usageBadge.label}
                                </div>
                            </div>
                            <div className="text-2xl font-bold opacity-30">
                                {totalUsedCount} <span className="text-[10px] font-normal">items</span>
                            </div>
                        </div>

                     </div>
                   )}
                 </div>
               )}
             </div>
          </div>
        </div>

      </div>

      {/* 3. Bottom Section: Dimension Dictionary (Horizontal) */}
      <div className="mt-12 pt-8 border-t border-slate-200">
        <DimensionDictionary currentTopic={topic} />
      </div>

    </div>
  );
};

// Sub-component: Writing Direction Reference Card (carried from Step 1)
const WritingDirectionCard: React.FC<{ thinkingExpansion: string[]; userIdea: string }> = ({ thinkingExpansion, userIdea }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white rounded-xl border border-amber-200/70 shadow-sm overflow-hidden">
      {/* Clickable Header */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-5 py-3 flex items-center gap-3 bg-amber-50/50 cursor-pointer hover:bg-amber-50 transition-colors select-none"
      >
        <span className="text-lg">📌</span>
        <div className="flex-1">
          <span className="text-sm font-bold text-amber-800">你的写作方向</span>
          <span className="text-[10px] text-amber-500 ml-2">
            {isExpanded ? '（点击折叠）' : '（点击展开）'}
          </span>
        </div>
        <span className={`text-amber-400 transform transition-transform duration-200 text-xs ${isExpanded ? 'rotate-180' : 'rotate-0'}`}>
          ▼
        </span>
      </div>

      {/* Expandable Body */}
      {isExpanded && (
        <div className="px-5 py-3 border-t border-amber-100/60 space-y-3 animate-fade-in-up">
          {/* Thinking Expansion Points */}
          <div>
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1 mb-2">
              💡 可以展开的角度
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {thinkingExpansion.map((point, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-900/80 leading-relaxed bg-amber-50/50 rounded-lg px-3 py-2 border border-amber-100/50">
                  <span className="text-amber-500 mt-0.5 flex-shrink-0 font-bold">{i + 1}.</span>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-amber-500 italic">
            提示：选择 1-2 个角度作为你段落的论据，结合下方语言工具来表达。
          </p>
        </div>
      )}
    </div>
  );
};

// Sub-component for Interactive Frames with progressive scaffolding
const InteractiveFrame: React.FC<{ frame: SentenceFrame, topic: string }> = ({ frame, topic }) => {
  const [inputs, setInputs] = useState<string[]>([]);
  const [validation, setValidation] = useState<{ isValid: boolean; feedback: string; suggestion: string } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showModel, setShowModel] = useState(false);

  // Split logic: splits by [anything] or ______
  const parts = frame.template.split(/(\[.*?\]|______)/g);
  
  // Identify which parts are placeholders
  const placeholderIndices = parts.map((p, i) => 
    (p.startsWith('[') && p.endsWith(']')) || p === '______' ? i : -1
  ).filter(i => i !== -1);

  const handleInputChange = (index: number, value: string) => {
    const newInputs = [...inputs];
    newInputs[index] = value;
    setInputs(newInputs);
    setValidation(null);
    setShowModel(false);
  };

  const handleCheck = async () => {
    // Check if at least one blank is filled
    const hasAnyInput = placeholderIndices.some(index => inputs[index] && inputs[index].trim() !== '');

    if (!hasAnyInput) {
      setValidation({ isValid: false, feedback: "请至少填写一个空格再检查。", suggestion: "" });
      return;
    }

    // Build the sentence, use "___" for unfilled blanks
    let fullSentence = "";
    parts.forEach((part, i) => {
      if (placeholderIndices.includes(i)) {
        fullSentence += (inputs[i] && inputs[i].trim()) ? inputs[i] : "___";
      } else {
        fullSentence += part;
      }
    });

    setIsChecking(true);
    try {
      const result = await validateSentence(fullSentence, topic);
      setValidation(result);
      setShowModel(true); // Reveal model sentence after check
    } catch (e) {
      setValidation({ isValid: false, feedback: "检查失败，请重试。", suggestion: "" });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="p-4 bg-blue-50/30 rounded-xl border border-blue-100 text-sm text-slate-800 leading-relaxed shadow-sm">
      {/* Frame Header: Pattern Name */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-blue-100/60">
        <span className="text-blue-700 text-base">🏗️</span>
        <span className="font-bold text-blue-900 text-xs">{frame.patternName}</span>
        <span className="text-slate-400 text-xs">—</span>
        <span className="text-slate-600 text-xs">{frame.patternNameZh}</span>
      </div>

      {/* Fill-in-the-blank Template */}
      <div className="mb-3 font-mono leading-loose">
        {parts.map((part, i) => {
          if (placeholderIndices.includes(i)) {
             const placeholderText = part.replace(/[\[\]]/g, '');
             return (
               <input
                 key={i}
                 type="text"
                 placeholder={placeholderText}
                 value={inputs[i] || ''}
                 onChange={(e) => handleInputChange(i, e.target.value)}
                 className="mx-1 px-2 py-1 rounded border border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-blue-900 font-bold bg-white min-w-[100px] placeholder-blue-300/70 text-sm"
                 style={{ width: `${Math.max(100, placeholderText.length * 16)}px` }}
               />
             );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
      
      {/* Check Button */}
      <div className="flex items-center justify-end mt-2">
         <button 
           onClick={handleCheck}
           disabled={isChecking}
           className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-900 px-4 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1"
         >
           {isChecking ? '正在检查...' : '✨ 检查 (Check)'}
         </button>
      </div>

      {/* Feedback Section (shown after check) */}
      {validation && validation.feedback && (
        <div className="mt-3 animate-fade-in-up space-y-2">
          {/* Feedback */}
          <div className={`px-3 py-2.5 rounded-lg border ${validation.isValid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-start gap-2">
              <span className="text-base mt-0.5">{validation.isValid ? '✅' : '⚠️'}</span>
              <div className="flex-1">
                <p className={`text-xs leading-relaxed ${validation.isValid ? 'text-green-800' : 'text-amber-800'}`}>
                  {validation.feedback}
                </p>
                {validation.suggestion && (
                  <p className="text-xs text-slate-600 mt-1.5 pt-1.5 border-t border-slate-100">
                    <span className="font-bold text-blue-900">💡 建议：</span>{validation.suggestion}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Model Sentence (revealed after check) */}
          {showModel && (
            <div className="bg-emerald-50 px-3 py-2.5 rounded-lg border border-emerald-200 animate-fade-in-up">
              <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">📖 参考范句 (Model Sentence)</p>
              <p className="text-xs text-emerald-900 leading-relaxed italic">
                "{frame.modelSentence}"
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultsDisplay;
