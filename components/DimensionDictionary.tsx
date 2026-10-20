

import React, { useState } from 'react';
import { fetchDimensionKeywords } from '../services/geminiService';
import UiIcon from './UiIcon';

interface DimensionDictionaryProps {
  currentTopic?: string;
}

interface KeywordItem {
  en: string;
  zh: string;
}

const COMMON_DIMENSIONS = [
  { id: 'econ', label: '经济', query: 'Economic', icon: 'wallet' as const },
  { id: 'env', label: '环境', query: 'Environment', icon: 'leaf' as const },
  { id: 'soc', label: '社会', query: 'Social', icon: 'users' as const },
  { id: 'tech', label: '科技', query: 'Tech', icon: 'zap' as const },
  { id: 'health', label: '健康', query: 'Health', icon: 'health' as const },
  { id: 'psy', label: '心理', query: 'Psychology', icon: 'idea' as const },
  { id: 'edu', label: '教育', query: 'Education', icon: 'education' as const },
  { id: 'ethics', label: '伦理', query: 'Ethics', icon: 'scale' as const },
];

const DimensionDictionary: React.FC<DimensionDictionaryProps> = ({ currentTopic }) => {
  const [activeDim, setActiveDim] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Record<string, KeywordItem[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const handleDimensionClick = async (label: string, queryLabel: string) => {
    if (activeDim === label) {
      setActiveDim(null); // Toggle off
      return;
    }

    setActiveDim(label);

    if (!keywords[label]) {
      setLoading(label);
      try {
        const result = await fetchDimensionKeywords(queryLabel, currentTopic);
        setKeywords(prev => ({ ...prev, [label]: result }));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(null);
      }
    }
  };

  return (
    <div className="bg-slate-100/50 rounded-2xl p-6 border border-slate-200">
       <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <UiIcon name="book" size={20} className="text-slate-600" />
            <div>
              <h3 className="font-bold text-lg text-slate-800 leading-none">维度宝库</h3>
              <p className="text-xs text-slate-500 mt-1">按角度拓展观点</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 border-l border-slate-200 pl-4 ml-2">
             {currentTopic 
               ? "点击下方卡片，AI 将为你即时生成与当前题目相关的联想词。" 
               : "点击查看通用联想素材。"}
          </p>
       </div>

       <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
         {COMMON_DIMENSIONS.map((dim) => (
           <div key={dim.id} className="relative group">
             <button
               onClick={() => handleDimensionClick(dim.label, dim.query)}
               className={`w-full h-full flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 min-h-[80px]
                 ${activeDim === dim.label 
                   ? 'bg-white border-brand-400 ring-2 ring-brand-100 shadow-md transform -translate-y-1' 
                   : 'bg-white border-slate-200 hover:border-brand-300 hover:shadow-sm'}`}
             >
               <UiIcon name={dim.icon} size={20} className="mb-1 text-slate-500" />
               <span className={`text-xs font-bold ${activeDim === dim.label ? 'text-brand-700' : 'text-slate-600'}`}>{dim.label}</span>
               
               {activeDim === dim.label && (
                 <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-r border-b border-brand-400 rotate-45 z-10"></div>
               )}
             </button>
           </div>
         ))}
       </div>

       {/* Expanded Content Area (Full Width below Grid) */}
       {activeDim && (
         <div className="mt-4 bg-white rounded-xl border border-brand-100 p-4 shadow-sm animate-fade-in-up relative z-0 min-h-[100px]">
           <h4 className="text-xs font-bold text-brand-400 uppercase tracking-wider mb-3">
             Keywords for {activeDim}
           </h4>
           
           {loading === activeDim ? (
             <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
               <svg className="animate-spin h-4 w-4 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               Thinking related words...
             </div>
           ) : (
             <div className="flex flex-wrap gap-3">
               {keywords[activeDim]?.map((kw, idx) => (
                 <span 
                    key={idx} 
                    className="px-3 py-1.5 bg-brand-50 border border-brand-100 rounded-lg text-sm text-brand-800 font-medium hover:bg-brand-100 transition-colors select-text"
                 >
                   {kw.en} 
                   <span className="text-xs text-brand-600/70 ml-1 font-normal">({kw.zh})</span>
                 </span>
               ))}
             </div>
           )}
         </div>
       )}
    </div>
  );
};

export default DimensionDictionary;
