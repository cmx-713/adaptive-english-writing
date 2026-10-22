import React, { useState } from 'react';
import { UserInput, WritingMode } from '../types';
import UiIcon from './UiIcon';

interface InputSectionProps {
  onSubmit: (data: UserInput) => void;
  isLoading: boolean;
  writingMode: WritingMode;
  onWritingModeChange: (mode: WritingMode) => void;
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

const InputSection: React.FC<InputSectionProps> = ({ onSubmit, isLoading, writingMode, onWritingModeChange }) => {
  const [topic, setTopic] = useState('');

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
    <div className="bg-white rounded-lg shadow-sm p-6 md:p-8 mb-8 border border-slate-200">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">输入写作题目</h2>
        <p className="text-slate-500 text-sm">选择文体并输入题目，开始构思。</p>
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
                  onChange={() => onWritingModeChange(option.value)}
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
            className="w-full pl-4 pr-12 py-3 rounded-md border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors outline-none text-base text-slate-800 placeholder-slate-400"
            disabled={isLoading}
            required
            autoComplete="off"
          />
          {topic && (
             <button 
               type="button"
               onClick={() => setTopic('')}
               className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
               aria-label="清空题目"
             >
               <UiIcon name="close" size={16} />
             </button>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <button
            type="button"
            onClick={handleRandomTopic}
            disabled={isLoading}
            className="px-5 py-3 rounded-md font-medium text-blue-900 bg-white border border-slate-300 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
          >
            <UiIcon name="book" size={18} /> 试一试真题
          </button>

          <button
            type="submit"
            disabled={isLoading || !topic}
            className={`px-6 py-3 rounded-md font-bold text-white shadow-sm transition-colors flex items-center justify-center gap-2 min-w-[160px]
              ${isLoading 
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-blue-900 hover:bg-blue-950'
              }`}
          >
            {isLoading ? <><span className="animate-spin"><UiIcon name="refresh" size={17} /></span>正在生成</> : <><UiIcon name="brain" size={18} />开始构思</>}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InputSection;
