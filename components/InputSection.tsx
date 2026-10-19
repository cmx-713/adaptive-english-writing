import React, { useState } from 'react';
import { UserInput, WritingMode } from '../types';

interface InputSectionProps {
  onSubmit: (data: UserInput) => void;
  isLoading: boolean;
}

const PAST_EXAM_TOPICS = [
  "Artificial Intelligence: Blessing or Curse?",
  "The Importance of Traditional Culture",
  "Should College Students Hire Maids?",
  "Online Learning vs. Traditional Classrooms",
  "The Impact of Social Media on Interpersonal Relationships",
  "My View on the 'Gap Year'",
  "Environmental Protection: Everyone's Responsibility",
  "Innovation: The Engine of Development",
  "Information Security in the Digital Age",
  "Balancing Academic Study and Extracurricular Activities"
];

const InputSection: React.FC<InputSectionProps> = ({ onSubmit, isLoading }) => {
  const [topic, setTopic] = useState('');
  const [writingMode, setWritingMode] = useState<WritingMode>('argumentative');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim()) {
      onSubmit({ topic, blindBox: true, writingMode });
    }
  };

  const handleRandomTopic = () => {
    const random = PAST_EXAM_TOPICS[Math.floor(Math.random() * PAST_EXAM_TOPICS.length)];
    setTopic(random);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 mb-8 border border-slate-100 relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-blue-50 rounded-full blur-2xl opacity-50"></div>

      <div className="mb-6 text-center">
        <h2 className="text-2xl font-serif font-bold text-slate-800 mb-2">Topic Analysis</h2>
        <p className="text-slate-500 text-sm">输入题目，AI 将为你随机抽取 3 个挑战性视角，锻炼强制联想能力。</p>
      </div>
      
      <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-slate-600">选择写作类型</legend>
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'argumentative', label: '议论文', description: '提出并论证观点' },
              { value: 'narrative', label: '记叙文', description: '讲述经历与变化' },
            ] as const).map(option => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${writingMode === option.value
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                  : 'border-slate-200 bg-white hover:border-blue-200'
                }`}
              >
                <input
                  type="radio"
                  name="writingMode"
                  value={option.value}
                  checked={writingMode === option.value}
                  onChange={() => setWritingMode(option.value)}
                  disabled={isLoading}
                  className="sr-only"
                />
                <span className="block font-bold text-slate-800">{option.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="relative group">
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：The Impact of Social Media"
            className="w-full pl-6 pr-12 py-4 rounded-xl border border-slate-200 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none text-lg text-slate-800 placeholder-slate-400"
            disabled={isLoading}
            required
            autoComplete="off"
          />
          {topic && (
             <button 
               type="button"
               onClick={() => setTopic('')}
               className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
             >
               ✕
             </button>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <button
            type="button"
            onClick={handleRandomTopic}
            disabled={isLoading}
            className="px-6 py-3 rounded-xl font-medium text-blue-900 bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
          >
            <span>📚</span> 试一试真题
          </button>

          <button
            type="submit"
            disabled={isLoading || !topic}
            className={`px-8 py-3 rounded-xl font-bold text-white shadow-md transition-colors flex items-center justify-center gap-2 group min-w-[160px]
              ${isLoading 
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-blue-900 hover:bg-blue-950'
              }`}
          >
            <span className="text-xl transition-transform duration-500 group-hover:rotate-180">🎲</span>
            {isLoading ? 'Thinking...' : '开始联想'}
          </button>
        </div>
        
        <p className="text-center text-xs text-slate-400 max-w-md mx-auto leading-relaxed pt-2">
          <span className="inline-block bg-slate-50 px-2 py-1 rounded border border-slate-100">
            💡 Tip: 不知道写什么？点击“试一试真题”获取灵感。
          </span>
        </p>
      </form>
    </div>
  );
};

export default InputSection;
