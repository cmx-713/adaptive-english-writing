import React, { useState, useEffect } from 'react';
import { DrillItem, DrillMode } from '../types';

interface DrillCardProps {
  item: DrillItem;
  onAnswer: (isCorrect: boolean) => void;
  isAnswered: boolean;
}

const DrillCard: React.FC<DrillCardProps> = ({ item, onAnswer, isAnswered }) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [areOptionsVisible, setAreOptionsVisible] = useState(false);
  const [userDraft, setUserDraft] = useState('');

  useEffect(() => {
    // Reset local state when item changes
    setSelectedOption(null);
    setAreOptionsVisible(false);
    setUserDraft('');
  }, [item]);

  const handleSelect = (option: string) => {
    if (isAnswered) return;
    
    setSelectedOption(option);
    const correct = option === item.correctOption;
    onAnswer(correct);
  };

  const handleReveal = () => {
    setAreOptionsVisible(true);
  };

  const renderContent = () => {
    // --- MODE A: Grammar Doctor ---
    if (item.mode === 'grammar_doctor') {
      const parts = item.questionContext.split(new RegExp(`(${item.highlightText})`, 'gi'));
      return (
        <div className="text-center mb-6">
           <div className="inline-block bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-xs font-bold uppercase mb-4 border border-rose-100">
              发现语法漏洞 (Error Detected)
           </div>
           <div className="text-xl md:text-2xl text-slate-800 leading-relaxed font-medium">
             {parts.length > 1 ? parts.map((part, i) => (
                part.toLowerCase() === item.highlightText?.toLowerCase() ? (
                  <span key={i} className="inline-block bg-rose-100 text-rose-700 px-2 py-0.5 rounded border border-rose-200 mx-1 border-b-2 border-b-rose-400">
                    {part}
                  </span>
                ) : <span key={i}>{part}</span>
             )) : (
                <span className="border-b-2 border-rose-300 border-dashed">{item.questionContext}</span>
             )}
           </div>
           <div className="mt-4 text-sm text-slate-400 font-bold uppercase tracking-wider">
             请思考：如何修正上述错误？
           </div>
        </div>
      );
    } 
    
    // --- MODE B: Elevation Lab ---
    if (item.mode === 'elevation_lab') {
      return (
        <div className="text-center mb-6 space-y-4">
           <div>
             <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">原句 (Level 1)</span>
             <div className="text-lg text-slate-500 line-through decoration-slate-300">
                "{item.questionContext}"
             </div>
           </div>

           <div className="flex flex-col items-center gap-2">
              <span className="text-2xl">⬇️</span>
              <div className="bg-blue-50 text-blue-700 px-6 py-2 rounded-xl border-2 border-blue-100 font-bold text-xl shadow-sm">
                 目标词汇: "{item.highlightText}"
              </div>
           </div>

           <div className="text-sm text-slate-400 font-bold uppercase tracking-wider">
             请思考：如何用目标词升级原句？
           </div>
        </div>
      );
    } 
    
    // --- MODE C: Structure Architect ---
    if (item.mode === 'structure_architect') {
       return (
         <div className="flex flex-col gap-3 mb-6">
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-slate-700 font-medium text-lg relative">
               <span className="absolute -left-2 top-1/2 -translate-y-1/2 bg-white text-slate-300 border border-slate-200 rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-sm">A</span>
               {item.questionContext}
            </div>
            <div className="flex justify-center text-slate-300">
               +
            </div>
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-slate-700 font-medium text-lg relative">
               <span className="absolute -left-2 top-1/2 -translate-y-1/2 bg-white text-slate-300 border border-slate-200 rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-sm">B</span>
               {item.highlightText}
            </div>
            <div className="mt-2 text-center text-sm text-slate-400 font-bold uppercase tracking-wider">
               请思考：如何将两句合二为一？
            </div>
         </div>
       );
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative transition-all duration-300">
        <div className="p-8 md:p-10">
          {renderContent()}

          {/* ACTIVE THINKING ZONE */}
          {!areOptionsVisible ? (
             <div className="animate-fade-in-up">
                <div className="mb-6">
                  {/* Header for scratchpad to avoid label overlap */}
                  <div className="flex justify-between items-center mb-2 px-1">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">思维草稿 (Scratchpad)</span>
                     <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
                       仅供思考，不计分
                     </span>
                  </div>
                  <textarea
                    value={userDraft}
                    onChange={(e) => setUserDraft(e.target.value)}
                    placeholder="在此尝试写下你的答案..."
                    className="w-full h-24 p-4 bg-slate-50 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-50 outline-none resize-none text-slate-700 transition-all placeholder-slate-400 text-sm"
                  />
                </div>
                
                <button
                  onClick={handleReveal}
                  className="w-full py-4 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-700 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
                >
                  <span>👀</span> 显示选项 (Reveal Options)
                </button>
             </div>
          ) : (
             <div className="animate-fade-in-up">
                {/* Show draft if user wrote something */}
                {userDraft && (
                  <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm">
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">你的思考草稿</span>
                     <p className="text-slate-700 font-medium">{userDraft}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                   {item.options.map((opt, i) => {
                     let stateClass = "bg-white border-slate-200 hover:border-brand-300 hover:bg-slate-50 text-slate-700";
                     
                     if (isAnswered) {
                       if (opt === item.correctOption) {
                          stateClass = "bg-emerald-100 border-emerald-300 text-emerald-800 font-bold ring-2 ring-emerald-200";
                       } else if (opt === selectedOption) {
                          stateClass = "bg-rose-100 border-rose-300 text-rose-800 opacity-60";
                       } else {
                          stateClass = "bg-slate-50 border-slate-100 text-slate-400 opacity-50";
                       }
                     }

                     return (
                       <button
                         key={i}
                         onClick={() => handleSelect(opt)}
                         disabled={isAnswered}
                         className={`w-full p-4 rounded-xl border-2 text-left transition-all duration-200 text-base md:text-lg ${stateClass} active:scale-[0.98] leading-snug`}
                       >
                         {opt}
                       </button>
                     );
                   })}
                </div>
             </div>
          )}
        </div>
        
        {/* Feedback Section (Revealed after answer) */}
        {isAnswered && (
           <div className={`p-6 border-t animate-fade-in-up ${selectedOption === item.correctOption ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-start gap-3">
                 <div className={`text-2xl ${selectedOption === item.correctOption ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {selectedOption === item.correctOption ? '🎉' : '💡'}
                 </div>
                 <div>
                    <h4 className={`font-bold mb-1 ${selectedOption === item.correctOption ? 'text-emerald-800' : 'text-amber-800'}`}>
                       {selectedOption === item.correctOption ? '回答正确！' : '再接再厉'}
                    </h4>
                    <p className={`text-sm leading-relaxed ${selectedOption === item.correctOption ? 'text-emerald-700' : 'text-amber-700'}`}>
                       {item.explanation}
                    </p>
                 </div>
              </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default DrillCard;