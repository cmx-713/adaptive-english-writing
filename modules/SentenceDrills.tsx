
import React, { useState } from 'react';
import { DrillMode, DrillItem, DrillHistoryData } from '../types';
import { fetchDrillItems } from '../services/geminiService';
import { getAggregatedUserErrors, getAggregatedUserVocab, saveToHistory } from '../services/storageService';
import { saveDrillResultToSupabase } from '../services/supabaseDataService';
import DrillCard from '../components/DrillCard';

const MODES: { id: DrillMode; label: string; icon: string; desc: string; color: string }[] = [
  {
    id: 'grammar_doctor',
    label: '语法门诊 (Grammar Doctor)',
    icon: '🩺',
    desc: '专治顽固语法错误，巩固语言准确性。',
    color: 'from-blue-700 to-blue-900'
  },
  {
    id: 'elevation_lab',
    label: '表达升格 (Elevation Lab)',
    icon: '⚗️',
    desc: '使用高级词汇替换平庸表达，提升学术感。',
    color: 'from-blue-700 to-blue-900'
  },
  {
    id: 'structure_architect',
    label: '句式工坊 (Structure Architect)',
    icon: '🏗️',
    desc: '训练长难句合并与逻辑连接能力。',
    color: 'from-blue-700 to-blue-900'
  },
];

interface SentenceDrillsProps {
  supabaseUserId?: string;
}

const SentenceDrills: React.FC<SentenceDrillsProps> = ({ supabaseUserId }) => {
  const [activeMode, setActiveMode] = useState<DrillMode | null>(null);
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<DrillItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isCurrentAnswered, setIsCurrentAnswered] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [adaptiveSource, setAdaptiveSource] = useState<string | null>(null);

  const startSession = async (mode: DrillMode) => {
    setActiveMode(mode);
    setIsLoading(true);
    setItems([]);
    setScore(0);
    setCurrentIndex(0);
    setSessionComplete(false);
    setIsCurrentAnswered(false);
    setAdaptiveSource(null);

    // --- Prepare Adaptive Data ---
    // Update: Map AggregatedError objects to simple strings for the drill generator context
    const adaptiveContext = {
      pastErrors: getAggregatedUserErrors(8).map(e => e.original),
      targetVocab: getAggregatedUserVocab(8), // Get last 8 random vocab
    };

    // Determine if we are using adaptive data or generic
    if (mode === 'grammar_doctor' && adaptiveContext.pastErrors.length > 0) {
      setAdaptiveSource(`基于你过去的 ${adaptiveContext.pastErrors.length} 个高频错题`);
    } else if (mode === 'elevation_lab' && adaptiveContext.targetVocab.length > 0) {
      setAdaptiveSource(`复习生词本中的 ${adaptiveContext.targetVocab.length} 个核心词`);
    } else {
      setAdaptiveSource("标准模式（暂无足够历史数据）");
    }

    try {
      const drillItems = await fetchDrillItems(topic || 'General Academic English', mode, adaptiveContext);
      setItems(drillItems);
    } catch (e) {
      console.error(e);
      alert("题目加载失败，请重试。");
      setActiveMode(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = (isCorrect: boolean) => {
    setIsCurrentAnswered(true);
    if (isCorrect) setScore(s => s + 1);
  };

  const nextCard = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(c => c + 1);
      setIsCurrentAnswered(false);
    } else {
      // Session Complete - Auto Save
      if (activeMode) {
        const historyData: DrillHistoryData = {
          mode: activeMode,
          score: score,
          totalQuestions: items.length
        };
        saveToHistory(topic || 'Sentence Drill', historyData, 'drill');
        // Supabase 双写（异步，不阻断前端）
        if (supabaseUserId) {
          saveDrillResultToSupabase(supabaseUserId, activeMode, score, items.length, items).catch(() => { });
        }
      }
      setSessionComplete(true);
    }
  };

  const exitSession = () => {
    setActiveMode(null);
    setTopic('');
  };

  // --- RENDER: MODE SELECTION ---
  if (!activeMode) {
    return (
      <div className="animate-fade-in-up max-w-4xl mx-auto pb-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-serif font-bold text-slate-800 mb-4">
            AI 自适应<span className="text-blue-900">特训系统</span>
          </h2>
          <p className="text-slate-500 text-lg">
            基于你的作文批改历史生成的个性化刷题健身房。
          </p>
        </div>

        {/* Topic Input (Optional) */}
        <div className="max-w-md mx-auto mb-10">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
            训练主题 (可选)
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：科技、教育 (留空则生成通用题目)"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-center focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
          {MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => startSession(mode.id)}
              className="group relative bg-white rounded-2xl p-6 shadow-md hover:shadow-xl border border-slate-100 transition-all hover:-translate-y-1 text-left overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${mode.color}`}></div>
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300 inline-block">{mode.icon}</div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{mode.label}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{mode.desc}</p>
              <div className="mt-6 flex items-center text-sm font-bold text-blue-900 opacity-0 group-hover:opacity-100 transition-opacity">
                开始训练 →
              </div>
            </button>
          ))}
        </div>

        <div className="text-center mt-12 text-xs text-slate-400">
          * 请先使用“思维训练”和“作文批改”功能来积累你的自适应数据。
        </div>
      </div>
    );
  }

  // --- RENDER: LOADING ---
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] animate-fade-in-up">
        <div className="w-16 h-16 border-4 border-brand-100 border-t-brand-600 rounded-full animate-spin mb-6"></div>
        <h3 className="text-xl font-bold text-slate-700">正在生成特训题目...</h3>
        <p className="text-slate-400 mt-2">{adaptiveSource || "正在分析你的学习档案..."}</p>
      </div>
    );
  }

  // --- RENDER: SESSION COMPLETE ---
  if (sessionComplete) {
    return (
      <div className="max-w-md mx-auto text-center pt-10 animate-fade-in-up">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-100 text-emerald-600 text-4xl mb-6 shadow-inner">
          🏆
        </div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">训练完成！</h2>
        <p className="text-slate-500 mb-8">本次得分：{score} / {items.length}</p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => startSession(activeMode)}
            className="w-full py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-all shadow-lg hover:shadow-xl"
          >
            再练一组
          </button>
          <button
            onClick={exitSession}
            className="w-full py-3 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
          >
            选择其他模式
          </button>
        </div>
      </div>
    );
  }

  // --- RENDER: ACTIVE DRILL ---
  const currentItem = items[currentIndex];
  const progressPercent = ((currentIndex) / items.length) * 100;

  return (
    <div className="max-w-3xl mx-auto pb-12 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={exitSession} className="text-slate-400 hover:text-slate-600 font-medium text-sm">
          ← 退出
        </button>
        <div className="flex flex-col items-end">
          <div className="text-sm font-bold text-slate-500">
            {currentIndex + 1} / {items.length}
          </div>
          {adaptiveSource && (
            <span className="text-[10px] text-brand-500 font-medium bg-brand-50 px-2 py-0.5 rounded-full mt-1">
              {adaptiveSource}
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>

      {/* Card */}
      {currentItem && (
        <DrillCard
          item={currentItem}
          onAnswer={handleAnswer}
          isAnswered={isCurrentAnswered}
        />
      )}

      {/* Next Button (Floating or Fixed) */}
      {isCurrentAnswered && (
        <div className="mt-8 flex justify-center animate-fade-in-up">
          <button
            onClick={nextCard}
            className="px-8 py-3 bg-slate-800 text-white font-bold rounded-full hover:bg-slate-700 hover:scale-105 transition-all shadow-lg flex items-center gap-2"
          >
            {currentIndex < items.length - 1 ? '下一题 →' : '完成训练 🏁'}
          </button>
        </div>
      )}
    </div>
  );
};

export default SentenceDrills;
