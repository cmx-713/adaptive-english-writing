
import React from 'react';
import { HistoryItem, ScaffoldContent, EssayHistoryData, InspirationHistoryData } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  title?: string;
}

const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, history, onSelect, onDelete, title = "History" }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm no-print">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-fade-in-up">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-serif font-bold text-slate-800">{title}</h3>
            <p className="text-sm text-slate-500">Your saved sessions</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <span className="text-4xl block mb-2">📂</span>
              <p>No saved items yet.</p>
            </div>
          ) : (
            history.map((item) => {
              const isEssay = item.dataType === 'essay_grade';
              const isInspiration = item.dataType === 'inspiration';
              
              return (
                <div 
                  key={item.id} 
                  className="group border border-slate-100 rounded-xl p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white relative"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                      className="text-slate-300 hover:text-red-500 transition-colors px-2 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                  
                  <div onClick={() => onSelect(item)} className="cursor-pointer">
                    <h4 className="font-bold text-slate-800 mb-1">{item.topic || "Untitled"}</h4>
                    
                    {isEssay ? (
                      // Essay Card Style
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                            Score: {(item.data as EssayHistoryData).result.totalScore}/15
                          </span>
                          <span className="text-xs text-slate-400">
                            {(item.data as EssayHistoryData).result.critiques.length} issues found
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 line-clamp-2 font-serif bg-slate-50 p-2 rounded">
                          "{(item.data as EssayHistoryData).essay}"
                        </p>
                      </>
                    ) : isInspiration ? (
                        // Inspiration Card Style (Step 1)
                        <>
                           <div className="flex items-center gap-2 text-sm text-brand-600 mb-2">
                               <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold">
                                 Step 1 Draft
                               </span>
                               <span className="text-xs text-slate-400">
                                 {Object.keys((item.data as InspirationHistoryData).userInputs).length} ideas drafted
                               </span>
                           </div>
                           <div className="flex gap-2 mt-2">
                               {(item.data as InspirationHistoryData).cards.map(c => (
                                   <span key={c.id} className={`text-xs px-2 py-1 rounded border ${
                                       (item.data as InspirationHistoryData).userInputs[c.id] 
                                       ? 'bg-brand-50 border-brand-200 text-brand-700' 
                                       : 'bg-slate-50 border-slate-100 text-slate-400'
                                   }`}>
                                       {c.dimension}
                                   </span>
                               ))}
                           </div>
                        </>
                    ) : (
                      // Scaffold Card Style (Step 2)
                      <>
                        <div className="flex items-center gap-2 text-sm text-brand-600 mb-2">
                           <span className="w-2 h-2 rounded-full bg-brand-400"></span>
                           {(item.data as ScaffoldContent).selectedDimension}
                        </div>
                        <p className="text-sm text-slate-500 line-clamp-2 italic border-l-2 border-slate-200 pl-3">
                          "{(item.data as ScaffoldContent).userIdea}"
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl text-center">
          <button onClick={onClose} className="text-sm font-bold text-brand-600 hover:text-brand-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
