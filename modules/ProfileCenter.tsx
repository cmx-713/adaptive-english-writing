import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getAllLearningStats, LearningStats, getHistory, getAggregatedUserVocab, getAggregatedUserCollocations, getAggregatedUserErrors } from '../services/storageService';
import { HistoryItem, ScaffoldContent, EssayHistoryData, AggregatedError, CritiqueCategory, EssayGradeResult, Tab, VocabularyItem } from '../types';
import ResultsDisplay from '../components/ResultsDisplay';
import GradingReport from '../components/GradingReport';

interface ProfileCenterProps {
  isActive: boolean;
  onNavigate: (path: string) => void;
}

// --- 1. 外部组件定义 (防止 undefined 报错) ---

// StatCard: 核心数据卡片
const StatCard = ({ icon, label, value, colorClass, desc }: { icon: string, label: string, value: number, colorClass: string, desc: string }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex items-start gap-4">
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm ${colorClass}`}>
      {icon}
    </div>
    <div>
      <div className="text-3xl font-bold text-slate-800 mb-1">{value}</div>
      <div className="font-bold text-slate-600 text-sm mb-1">{label}</div>
      <div className="text-xs text-slate-400">{desc}</div>
    </div>
  </div>
);

// 🆕 VocabCard: 悬浮式词汇卡片组件
const VocabCard: React.FC<{ vocab: VocabularyItem }> = ({ vocab }) => {
  return (
    <div className="group relative inline-block">
      {/* 默认显示：英文单词 + 中文悬浮标签 */}
      <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-lg font-medium group-hover:bg-blue-50 group-hover:text-blue-900 group-hover:border-blue-300 transition-all cursor-pointer select-none flex items-center gap-1.5">
        <span className="font-semibold">{vocab.word}</span>
        <span className="text-xs text-slate-400 group-hover:text-blue-600">{vocab.chinese}</span>
      </div>

      {/* 悬停显示：完整详情卡片 */}
      <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border-2 border-blue-200 p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 pointer-events-none">
        {/* 箭头装饰 */}
        <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-t-2 border-l-2 border-blue-200 transform rotate-45"></div>

        {/* 卡片内容 */}
        <div className="space-y-3">
          {/* 标题：英文单词 */}
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <span className="text-2xl">📘</span>
            <h4 className="text-lg font-bold text-slate-800">{vocab.word}</h4>
          </div>

          {/* 中文释义 */}
          <div className="flex items-start gap-2">
            <span className="text-sm mt-0.5">🇨🇳</span>
            <div>
              <div className="text-xs text-slate-400 font-bold uppercase mb-0.5">中文释义</div>
              <div className="text-sm font-medium text-slate-700">{vocab.chinese}</div>
            </div>
          </div>

          {/* 用法示例（英文 + 中文） */}
          <div className="flex items-start gap-2 bg-blue-50/50 -mx-4 -mb-4 p-3 rounded-b-xl">
            <span className="text-sm mt-0.5">✏️</span>
            <div className="space-y-1.5">
              <div className="text-xs text-blue-700 font-bold uppercase">Usage Example</div>
              <div className="text-xs text-slate-700 leading-relaxed italic">{vocab.usage}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{vocab.usageChinese}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 🆕 CollocationBadge: 地道搭配展示组件
const CollocationBadge: React.FC<{ collocation: { en: string; zh: string } }> = ({ collocation }) => {
  return (
    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all cursor-default select-none">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-sm text-slate-700">{collocation.en}</span>
        <span className="text-xs text-slate-500">{collocation.zh}</span>
      </div>
    </div>
  );
};

// [NEW] ScoreLineChart: 分数走势折线图
const ScoreLineChart: React.FC<{ data: HistoryItem[] }> = ({ data }) => {
  const height = 160;
  const width = 500; // Internal SVG coordinate width
  const paddingX = 40;
  const paddingY = 20;

  if (data.length === 0) {
    return (
      <div className="w-full h-40 flex flex-col items-center justify-center text-slate-400 text-sm">
        <span>📊 暂无数据</span>
        <span className="text-xs mt-1">提交作文以追踪分数变化</span>
      </div>
    );
  }

  // Calculate coordinates (防御性：过滤掉无效数据)
  const validData = data.filter(item => {
    const d = item.data as EssayHistoryData;
    return d?.result && typeof d.result.totalScore === 'number';
  });

  if (validData.length === 0) {
    return (
      <div className="w-full h-40 flex flex-col items-center justify-center text-slate-400 text-sm">
        <span>📊 暂无有效数据</span>
        <span className="text-xs mt-1">提交作文以追踪分数变化</span>
      </div>
    );
  }

  const points = validData.map((item, index) => {
    const score = (item.data as EssayHistoryData).result.totalScore;

    // X axis: Distributed evenly
    const x = validData.length === 1
      ? width / 2
      : paddingX + (index * (width - 2 * paddingX)) / (validData.length - 1);

    // Y axis: 0-15 scale. Top is 0, Bottom is height.
    // 15 points = paddingY
    // 0 points = height - paddingY
    const y = (height - paddingY) - (score / 15) * (height - 2 * paddingY);

    return { x, y, score, date: item.timestamp };
  });

  // Construct Path Command
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Construct Gradient Area Path (Close the loop to the bottom)
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <div className="w-full h-40 relative group">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        {/* Definitions for Gradient */}
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(30, 58, 138)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="rgb(30, 58, 138)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Reference Lines (optional) */}
        {[5, 10, 15].map(val => {
          const y = (height - paddingY) - (val / 15) * (height - 2 * paddingY);
          return (
            <g key={val}>
              <line x1={0} y1={y} x2={width} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="1" />
              <text x={0} y={y + 4} className="text-[8px] fill-slate-300" textAnchor="start">{val}</text>
            </g>
          );
        })}

        {/* Area Fill */}
        <path d={areaD} fill="url(#lineGradient)" stroke="none" />

        {/* The Line */}
        <path d={pathD} fill="none" stroke="#1e3a8a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data Points */}
        {points.map((p, i) => (
          <g key={i} className="group/point cursor-pointer">
            {/* Hover Target Area (invisible larger circle) */}
            <circle cx={p.x} cy={p.y} r="15" fill="transparent" />

            {/* Visible Dot */}
            <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#1e3a8a" strokeWidth="2" className="transition-all duration-300 group-hover/point:r-6 group-hover/point:fill-blue-900" />

            {/* Score Label (Above) */}
            <text x={p.x} y={p.y - 12} textAnchor="middle" className="text-[10px] font-bold fill-blue-900 opacity-0 group-hover/point:opacity-100 transition-opacity">
              {p.score}
            </text>

            {/* Date Label (Below) - Only show first, last, or hovered */}
            <text
              x={p.x}
              y={height}
              textAnchor="middle"
              className={`text-[9px] fill-slate-400 font-mono transition-opacity ${i === 0 || i === points.length - 1 ? 'opacity-100' : 'opacity-0 group-hover/point:opacity-100'}`}
            >
              {new Date(p.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

// RadarChart: 雷达图组件
const RadarChart: React.FC<{
  current: EssayGradeResult['subScores'];
  average: EssayGradeResult['subScores'];
}> = ({ current, average }) => {
  const size = 240;
  const center = size / 2;
  const radius = 80;

  const toPercent = (scores: EssayGradeResult['subScores']) => ({
    content: (scores.content || 0) / 4 * 100,
    organization: (scores.organization || 0) / 3 * 100,
    proficiency: (scores.proficiency || 0) / 5 * 100,
    clarity: (scores.clarity || 0) / 3 * 100,
  });

  const currentP = toPercent(current);
  const averageP = toPercent(average);

  const axes = [
    { label: '内容与思辨', key: 'content', angle: -90 },
    { label: '组织与逻辑', key: 'organization', angle: 0 },
    { label: '语言纯熟度', key: 'proficiency', angle: 90 },
    { label: '表达清晰度', key: 'clarity', angle: 180 },
  ];

  const getCoordinates = (value: number, angleDeg: number) => {
    const ratio = Math.max(0, Math.min(1, value / 100));
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: center + radius * ratio * Math.cos(angleRad),
      y: center + radius * ratio * Math.sin(angleRad),
    };
  };

  const buildPath = (data: any) => {
    return axes.map((axis) => {
      const val = data[axis.key] || 0;
      const { x, y } = getCoordinates(val, axis.angle);
      return `${x},${y}`;
    }).join(' ');
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[240px] aspect-square">
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {[0.25, 0.5, 0.75, 1].map((r, i) => (
            <circle key={i} cx={center} cy={center} r={radius * r} fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" />
          ))}
          {axes.map((axis, i) => {
            const end = getCoordinates(100, axis.angle);
            return <line key={i} x1={center} y1={center} x2={end.x} y2={end.y} stroke="#cbd5e1" strokeWidth="1" />;
          })}
          <polygon points={buildPath(averageP)} fill="rgba(148, 163, 184, 0.2)" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 2" />
          <polygon points={buildPath(currentP)} fill="rgba(59, 130, 246, 0.4)" stroke="#3b82f6" strokeWidth="2" className="animate-fade-in-up drop-shadow-sm" />
          {axes.map((axis, i) => {
            const labelPos = getCoordinates(125, axis.angle);
            return (
              <g key={i}>
                <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="middle" className="text-[10px] font-bold fill-slate-500 tracking-wide">{axis.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex gap-4 mt-2 text-[10px] font-bold">
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500/40 border border-blue-500 rounded-sm"></span><span className="text-slate-700">本次</span></div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-400/20 border border-slate-400 border-dashed rounded-sm"></span><span className="text-slate-500">平均</span></div>
      </div>
    </div>
  );
};

// DimensionTrendMini: 单个维度的迷你趋势图
const DimensionTrendMini: React.FC<{
  dimension: { key: string; label: string; max: number; icon: string; color: string };
  data: HistoryItem[];
}> = ({ dimension, data }) => {
  const height = 60;
  const width = 180;
  const paddingX = 10;
  const paddingY = 10;

  // 过滤有效数据并提取该维度分数
  const validData = data
    .filter(item => {
      const d = item.data as EssayHistoryData;
      return d?.result?.subScores && typeof d.result.subScores[dimension.key as keyof typeof d.result.subScores] === 'number';
    })
    .slice(-5); // 最近5次

  if (validData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs">
        <span>暂无数据</span>
      </div>
    );
  }

  const points = validData.map((item, index) => {
    const score = (item.data as EssayHistoryData).result.subScores[dimension.key as keyof EssayGradeResult['subScores']] as number;
    const x = validData.length === 1
      ? width / 2
      : paddingX + (index * (width - 2 * paddingX)) / (validData.length - 1);
    const y = (height - paddingY) - (score / dimension.max) * (height - 2 * paddingY);
    return { x, y, score };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  // 计算趋势（最后一次 vs. 第一次）
  const trend = points[points.length - 1].score - points[0].score;
  const trendIcon = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';
  const trendColor = trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-rose-600' : 'text-slate-400';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-sm">{dimension.icon}</span>
          <span className="text-xs font-bold text-slate-700">{dimension.label}</span>
        </div>
        <span className={`text-xs font-mono font-bold ${trendColor}`}>
          {points[points.length - 1].score}/{dimension.max}
        </span>
      </div>

      <div className="relative" style={{ height: `${height}px` }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
          <defs>
            <linearGradient id={`grad-${dimension.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={dimension.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={dimension.color} stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <path d={areaD} fill={`url(#grad-${dimension.key})`} stroke="none" />
          <path d={pathD} fill="none" stroke={dimension.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" fill="white" stroke={dimension.color} strokeWidth="2" />
            </g>
          ))}
        </svg>

        <div className={`absolute bottom-0 right-0 text-[10px] font-bold ${trendColor}`}>
          {trendIcon} {trend > 0 ? '+' : ''}{trend.toFixed(1)}
        </div>
      </div>
    </div>
  );
};

// --- 2. 主组件 (ProfileCenter) ---

const ProfileCenter: React.FC<ProfileCenterProps> = ({ isActive, onNavigate }) => {
  // State
  const [stats, setStats] = useState<LearningStats>({ socraticCount: 0, graderCount: 0, drillCount: 0 });
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [recentVocab, setRecentVocab] = useState<VocabularyItem[]>([]);
  const [recentCollocations, setRecentCollocations] = useState<{ en: string; zh: string; topic: string; date: string }[]>([]);
  const [recentErrors, setRecentErrors] = useState<AggregatedError[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingItem, setViewingItem] = useState<HistoryItem | null>(null);

  // Interactive State
  const [revealedExplanationIds, setRevealedExplanationIds] = useState<Set<number>>(new Set());
  const [activeErrorFilter, setActiveErrorFilter] = useState<CritiqueCategory | 'ALL'>('ALL');
  const [showDimensionTrends, setShowDimensionTrends] = useState(false); // 🆕 4维度历史趋势折叠状态
  const [showTrainingPreview, setShowTrainingPreview] = useState(false); // 🆕 训练预览对话框
  const [pendingTrainingCategory, setPendingTrainingCategory] = useState<CritiqueCategory | null>(null); // 🆕 待训练的维度
  const [showAllHistory, setShowAllHistory] = useState(false); // 🆕 学习活动档案展开状态
  const [activeVaultTab, setActiveVaultTab] = useState<'vocabulary' | 'collocations'>('vocabulary'); // 🆕 语料库Tab状态

  // Computed Logic
  const errorStats = useMemo(() => {
    const categories: CritiqueCategory[] = ['Content', 'Organization', 'Proficiency', 'Clarity'];
    const counts = categories.map(cat => ({
      category: cat,
      count: recentErrors.filter(e => e.category === cat).length,
      config: {
        'Clarity': { color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', ring: 'ring-rose-200', icon: '📖', label: '表达清晰度' },
        'Proficiency': { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', ring: 'ring-blue-200', icon: '🗣️', label: '语言纯熟度' },
        'Organization': { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', ring: 'ring-amber-200', icon: '🧩', label: '组织与逻辑' },
        'Content': { color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', ring: 'ring-purple-200', icon: '📝', label: '内容与思辨' }
      }[cat]
    }));
    const sorted = [...counts].sort((a, b) => b.count - a.count);
    return {
      all: counts,
      topWeaknesses: sorted.filter(c => c.count > 0).slice(0, 2),
      total: recentErrors.length
    };
  }, [recentErrors]);

  const essayHistory = useMemo(() => {
    return historyItems
      .filter(item => {
        if (item.dataType !== 'essay_grade') return false;
        // 防御性检查：过滤掉数据不完整的记录，避免下游计算崩溃
        const data = item.data as EssayHistoryData;
        return data?.result && typeof data.result.totalScore === 'number' && data.result.subScores;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [historyItems]);

  // 获取最近的5次作文用于趋势图
  const recentEssays = essayHistory.slice(-5);
  const latestEssayData = essayHistory.length > 0 ? (essayHistory[essayHistory.length - 1].data as EssayHistoryData).result : null;

  const historicalAverage = useMemo(() => {
    if (essayHistory.length === 0) return null;
    const sums = essayHistory.reduce((acc, item) => {
      const scores = (item.data as EssayHistoryData).result.subScores;
      const s = scores as any;
      acc.content += s.content || 0;
      acc.organization += s.organization || 0;
      acc.proficiency += s.proficiency || 0;
      acc.clarity += s.clarity || 0;
      return acc;
    }, { content: 0, organization: 0, proficiency: 0, clarity: 0 });
    const count = essayHistory.length;
    return {
      content: sums.content / count,
      organization: sums.organization / count,
      proficiency: sums.proficiency / count,
      clarity: sums.clarity / count,
    };
  }, [essayHistory]);

  const improvementFeedback = useMemo(() => {
    if (!latestEssayData || !historicalAverage) return null;
    const current = latestEssayData.subScores;
    const average = historicalAverage;
    const dims = [
      { key: 'content', label: '内容 (Content)', max: 4 },
      { key: 'organization', label: '组织 (Organization)', max: 3 },
      { key: 'proficiency', label: '语言 (Proficiency)', max: 5 },
      { key: 'clarity', label: '清晰度 (Clarity)', max: 3 }
    ];
    let bestDim = null;
    let maxDiffPercent = 0;
    dims.forEach(dim => {
      const curr = current[dim.key as keyof typeof current];
      const avg = average[dim.key as keyof typeof average];
      if (avg > 0 && curr > avg) {
        const diff = ((curr - avg) / avg) * 100;
        if (diff > maxDiffPercent) {
          maxDiffPercent = diff;
          bestDim = dim.label;
        }
      }
    });
    if (bestDim && maxDiffPercent > 0) return { dim: bestDim, percent: Math.round(maxDiffPercent) };
    return null;
  }, [latestEssayData, historicalAverage]);

  const recommendation = useMemo(() => {
    if (!latestEssayData) return null;
    const scores = latestEssayData.subScores;
    const normalized = [
      { key: 'content', val: scores.content / 4, label: '内容思辨', drill: 'Socratic Coach' },
      { key: 'organization', val: scores.organization / 3, label: '组织逻辑', drill: 'Structure Architect' },
      { key: 'proficiency', val: scores.proficiency / 5, label: '语言纯熟', drill: 'Elevation Lab' },
      { key: 'clarity', val: scores.clarity / 3, label: '表达清晰', drill: 'Grammar Doctor' }
    ];
    const weakest = normalized.sort((a, b) => a.val - b.val)[0];
    const adviceMap: Record<string, string> = {
      'content': "建议回到【思维训练】环节，加强多维度审题练习。",
      'organization': "建议使用【句式工坊】特训，加强逻辑连接词运用。",
      'proficiency': "建议使用【表达升格】特训，积累高级同义替换。",
      'clarity': "建议使用【语法门诊】特训，修复基础句法漏洞。"
    };
    return {
      weakestSkill: weakest.label,
      text: adviceMap[weakest.key],
      drillMode: weakest.drill
    };
  }, [latestEssayData]);

  // 🆕 训练配置映射
  const getTrainingConfig = (category: CritiqueCategory) => {
    const configs = {
      'Content': {
        mode: '思维训练',
        modeEn: 'Socratic Coach',
        focus: '多维度审题与论证展开',
        duration: '10-15分钟',
        icon: '🧠',
        color: 'purple'
      },
      'Organization': {
        mode: '句式工坊',
        modeEn: 'Structure Architect',
        focus: '逻辑连接词与段落衔接',
        duration: '5-8分钟',
        icon: '🏗️',
        color: 'amber'
      },
      'Proficiency': {
        mode: '语法门诊',
        modeEn: 'Grammar Doctor',
        focus: '语法准确性与词汇搭配',
        duration: '5-8分钟',
        icon: '🩺',
        color: 'blue'
      },
      'Clarity': {
        mode: '表达升格',
        modeEn: 'Elevation Lab',
        focus: '学术词汇与表达清晰度',
        duration: '5-8分钟',
        icon: '🧪',
        color: 'rose'
      }
    };
    return configs[category];
  };

  // 🆕 处理训练跳转
  const handleGoToTraining = (category: CritiqueCategory) => {
    setPendingTrainingCategory(category);
    setShowTrainingPreview(true);
    // 滚动到页面顶部，确保对话框可见
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmTraining = () => {
    setShowTrainingPreview(false);
    // 根据维度类型跳转到对应模块
    if (pendingTrainingCategory === 'Content') {
      onNavigate('/coach'); // Content → 思维训练
    } else {
      onNavigate('/drills'); // Organization/Proficiency/Clarity → 句子特训
    }
    // TODO: 未来可以在这里传递训练配置参数到对应模块
  };

  // 🆕 CSV导出功能
  const handleExportCSV = () => {
    let csvContent = '';
    let filename = '';

    if (activeVaultTab === 'vocabulary') {
      // 导出核心词汇
      csvContent = '\uFEFF'; // UTF-8 BOM for Excel
      csvContent += '英文,中文,例句(英文),例句(中文)\n';
      recentVocab.forEach(vocab => {
        const row = [
          vocab.word,
          vocab.chinese,
          vocab.usage.replace(/,/g, '，'), // 替换英文逗号避免CSV格式问题
          vocab.usageChinese?.replace(/,/g, '，') || ''
        ].join(',');
        csvContent += row + '\n';
      });
      filename = `核心词汇_${new Date().toISOString().slice(0, 10)}.csv`;
    } else {
      // 导出地道搭配
      csvContent = '\uFEFF';
      csvContent += '英文搭配,中文释义,来源主题,日期\n';
      recentCollocations.forEach(col => {
        const row = [
          col.en,
          col.zh,
          col.topic,
          new Date(col.date).toLocaleDateString()
        ].join(',');
        csvContent += row + '\n';
      });
      filename = `地道搭配_${new Date().toISOString().slice(0, 10)}.csv`;
    }

    // 触发下载
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  // Effects & Data Loading
  const refreshData = useCallback(() => {
    setStats(getAllLearningStats());
    setHistoryItems(getHistory());
    setRecentVocab(getAggregatedUserVocab(15));
    setRecentCollocations(getAggregatedUserCollocations(20));
    setRecentErrors(getAggregatedUserErrors(20));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isActive) refreshData();
  }, [isActive, refreshData]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "cet_writing_history_v2") refreshData();
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refreshData]);

  // Helper Functions
  const handleItemClick = (item: HistoryItem) => {
    if (item.dataType === 'scaffold' || item.dataType === 'essay_grade') setViewingItem(item);
  };

  const toggleExplanation = (id: number) => {
    setRevealedExplanationIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const renderErrorContext = (context: string | undefined, original: string) => {
    if (!context) return <span className="font-mono text-rose-600 bg-rose-50 px-1 rounded">{original}</span>;
    const parts = context.split(original);
    if (parts.length === 1) return <span>{context}</span>;
    return (
      <span>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {i < parts.length - 1 && (
              <span className="bg-rose-100 text-rose-800 font-bold px-1 rounded mx-0.5 border-b-2 border-rose-200">
                {original}
              </span>
            )}
          </React.Fragment>
        ))}
      </span>
    );
  };

  const getBadgeConfig = (type: string) => {
    switch (type) {
      case 'scaffold': return { label: '🧠 思维训练', style: 'bg-brand-50 text-brand-700 border-brand-200' };
      case 'essay_grade': return { label: '✍️ 作文批改', style: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'drill': return { label: '🏋️ 句子特训', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      default: return { label: '📝 记录', style: 'bg-slate-50 text-slate-600 border-slate-200' };
    }
  };

  // Render Views
  if (viewingItem) {
    if (viewingItem.dataType === 'scaffold') {
      return <ResultsDisplay data={viewingItem.data as ScaffoldContent} topic={viewingItem.topic} onBack={() => setViewingItem(null)} isHistoryView={true} />;
    }
    if (viewingItem.dataType === 'essay_grade') {
      const data = viewingItem.data as EssayHistoryData;
      return <GradingReport result={data.result} essayText={data.essay} topic={viewingItem.topic} onBack={() => setViewingItem(null)} isHistoryView={true} />;
    }
  }

  return (
    <div className="animate-fade-in-up max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <h2 className="text-3xl font-serif font-bold text-slate-800 mb-4">学习数据中心 <span className="text-blue-900">Learning Hub</span></h2>
        <p className="text-slate-500 text-lg">追踪你的每一次思考与进步</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-blue-900 rounded-full animate-spin"></div></div>
      ) : (
        <>
          {/* 1. Core Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard icon="🧠" label="思维训练" value={stats.socraticCount} colorClass="bg-blue-50 text-blue-800" desc="Topics Explored" />
            <StatCard icon="✍️" label="作文批改" value={stats.graderCount} colorClass="bg-blue-50 text-blue-800" desc="Essays Graded" />
            <StatCard icon="🏋️" label="句子特训" value={stats.drillCount} colorClass="bg-blue-50 text-blue-800" desc="Skills Mastered" />
          </div>

          {/* 2. Progress Tracking (Charts) */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">

            {/* Left: Score History (Now using ScoreLineChart) */}
            <div className="md:col-span-3 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-50">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center text-lg">📈</div>
                <div>
                  <h3 className="font-bold text-slate-800">写作分数走势 (Score Trend)</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Last 5 Essays (Max 15)</p>
                </div>
              </div>

              <div className="flex-grow flex items-center justify-center pt-2">
                {/* 👇 使用新的折线图组件 */}
                <ScoreLineChart data={recentEssays} />
              </div>
            </div>

            {/* Right: Radar Chart */}
            <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-50">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center text-lg">🎯</div>
                <div><h3 className="font-bold text-slate-800">能力雷达 (Skill Radar)</h3><p className="text-[10px] text-slate-400 uppercase tracking-wider">Latest vs. Avg</p></div>
              </div>
              <div className="flex-grow flex flex-col justify-center items-center">
                {!latestEssayData || !historicalAverage ? <div className="text-center text-slate-400 text-sm py-10">暂无数据</div> : (
                  <>
                    <RadarChart current={latestEssayData.subScores} average={historicalAverage} />

                    {/* 🆕 4维度历史趋势（可折叠） */}
                    {essayHistory.length >= 2 && (
                      <div className="mt-3 w-full">
                        <button
                          onClick={() => setShowDimensionTrends(!showDimensionTrends)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors text-xs font-bold text-slate-600"
                        >
                          <span>📊 查看各维度历史趋势</span>
                          <span className={`transform transition-transform ${showDimensionTrends ? 'rotate-180' : ''}`}>▼</span>
                        </button>

                        {showDimensionTrends && (
                          <div className="mt-2 grid grid-cols-2 gap-3 p-3 bg-slate-50/50 border border-slate-200 rounded-lg animate-fade-in-up">
                            <DimensionTrendMini
                              dimension={{ key: 'content', label: '内容', max: 4, icon: '📝', color: '#9333ea' }}
                              data={essayHistory}
                            />
                            <DimensionTrendMini
                              dimension={{ key: 'organization', label: '组织', max: 3, icon: '🧩', color: '#f59e0b' }}
                              data={essayHistory}
                            />
                            <DimensionTrendMini
                              dimension={{ key: 'proficiency', label: '语言', max: 5, icon: '🗣️', color: '#3b82f6' }}
                              data={essayHistory}
                            />
                            <DimensionTrendMini
                              dimension={{ key: 'clarity', label: '清晰', max: 3, icon: '📖', color: '#f43f5e' }}
                              data={essayHistory}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {recommendation && (
                      <div className="mt-3 w-full bg-slate-50 border border-slate-200 rounded-xl p-3 animate-fade-in-up">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-500 uppercase">Coach's Advice</span>
                          <span className="bg-rose-100 text-rose-600 text-[10px] px-1.5 py-0.5 rounded font-bold">Weak: {recommendation.weakestSkill}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-snug">{recommendation.text}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 3. Insight Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {/* Left: Vocabulary Vault with Tabs */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col h-[600px]">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg">📚</div>
                  <div><h3 className="font-bold text-slate-800">语料库积累 (Word Vault)</h3><p className="text-[10px] text-slate-400 uppercase tracking-wider">Recently Acquired</p></div>
                </div>
                <button
                  onClick={handleExportCSV}
                  disabled={activeVaultTab === 'vocabulary' ? recentVocab.length === 0 : recentCollocations.length === 0}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="导出当前分类为CSV"
                >
                  <span>📥</span>
                  <span>导出</span>
                </button>
              </div>

              {/* Tab 切换 */}
              <div className="flex gap-2 mb-4 flex-shrink-0">
                <button
                  onClick={() => setActiveVaultTab('vocabulary')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeVaultTab === 'vocabulary'
                      ? 'bg-blue-900 text-white shadow-md'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  核心词汇 ({recentVocab.length})
                </button>
                <button
                  onClick={() => setActiveVaultTab('collocations')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeVaultTab === 'collocations'
                      ? 'bg-blue-900 text-white shadow-md'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  地道搭配 ({recentCollocations.length})
                </button>
              </div>

              {/* 内容展示（添加滚动） */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {activeVaultTab === 'vocabulary' ? (
                  recentVocab.length > 0 ? (
                    <div className="flex flex-col gap-2 pr-2">
                      {recentVocab.map((vocab, i) => (
                        <VocabCard key={i} vocab={vocab} />
                      ))}
                    </div>
                  ) : <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm py-8"><span>📭 暂无积累</span></div>
                ) : (
                  recentCollocations.length > 0 ? (
                    <div className="flex flex-col gap-2 pr-2">
                      {recentCollocations.map((col, i) => (
                        <CollocationBadge key={i} collocation={col} />
                      ))}
                    </div>
                  ) : <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm py-8"><span>📭 暂无积累</span></div>
                )}
              </div>
            </div>

            {/* Right: NEW Diagnostic Report Dashboard */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col h-[600px]">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-50 flex-shrink-0">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center text-lg">🩺</div>
                <div><h3 className="font-bold text-slate-800">弱点诊断报告 (Diagnostic Report)</h3><p className="text-[10px] text-slate-400 uppercase tracking-wider">Review, Challenge, Refine</p></div>
              </div>

              <div className="flex-grow flex flex-col min-h-0">
                {recentErrors.length > 0 ? (
                  <>
                    {/* A. Pain Point Dashboard */}
                    <div className="mb-4 flex gap-3 flex-shrink-0">
                      {errorStats.topWeaknesses.map((stat, idx) => (
                        <div key={stat.category} onClick={() => setActiveErrorFilter(stat.category)} className={`flex-1 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md relative overflow-hidden ${activeErrorFilter === stat.category ? `${stat.config.bg} ${stat.config.border} ring-1 ${stat.config.ring}` : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xl">{idx === 0 ? '🔥' : '⚠️'}</span>
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/60 ${stat.config.color}`}>{stat.count} Issues</span>
                          </div>
                          <div className={`text-xs font-bold uppercase tracking-wider ${stat.config.color}`}>{stat.config.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* B. Category Tabs */}
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-1 flex-shrink-0 no-scrollbar">
                      <button onClick={() => setActiveErrorFilter('ALL')} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border ${activeErrorFilter === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>全部 ({errorStats.total})</button>
                      {errorStats.all.map(stat => {
                        if (stat.count === 0) return null;
                        const isActive = activeErrorFilter === stat.category;
                        return (
                          <button key={stat.category} onClick={() => setActiveErrorFilter(stat.category)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${isActive ? `${stat.config.bg} ${stat.config.color} ${stat.config.border} ring-1 ${stat.config.ring}` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                            <span>{stat.config.icon}</span><span>{stat.category}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* C. Scrollable List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 min-h-0">
                      {recentErrors.filter(e => activeErrorFilter === 'ALL' || e.category === activeErrorFilter).map((err, i) => {
                        const errId = i + (err.category.length * 100);
                        const isRevealed = revealedExplanationIds.has(errId);
                        const conf = errorStats.all.find(s => s.category === err.category)?.config!;
                        return (
                          <div key={i} className={`rounded-xl border bg-white overflow-hidden shadow-sm transition-all ${isRevealed ? `border-${conf.border.split('-')[1]}` : 'border-slate-100 hover:border-slate-300'}`}>
                            <div className="flex items-center justify-between px-3 py-2 bg-slate-50/50 border-b border-slate-50">
                              <div className={`text-[10px] font-bold uppercase flex items-center gap-1.5 ${conf.color}`}><span>{conf.icon}</span> {err.category}</div>
                              {err.severity === 'critical' && <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse"></span> CRITICAL</span>}
                            </div>
                            <div className="p-3"><p className="text-sm text-slate-700 leading-relaxed font-serif">{renderErrorContext(err.context, err.original)}</p></div>
                            {!isRevealed ? (
                              <div className="px-3 pb-3"><button onClick={() => toggleExplanation(errId)} className="w-full py-1.5 text-xs font-bold text-slate-400 bg-slate-50 hover:bg-white hover:text-indigo-600 hover:shadow-sm rounded-lg border border-slate-100 transition-all flex items-center justify-center gap-1"><span>🔍 点击查看诊断 (Analyze)</span></button></div>
                            ) : (
                              <div className="animate-fade-in-up">
                                <div className={`px-3 py-2 ${conf.bg} border-t ${conf.border} border-dashed`}>
                                  <div className="flex gap-2"><span className="text-lg">💡</span><p className={`text-xs leading-relaxed ${conf.color}`}><span className="font-bold opacity-70 block mb-0.5">诊断分析:</span>{err.explanation}</p></div>
                                </div>
                                {err.revised && <div className="px-3 py-2 bg-emerald-50/30 border-t border-emerald-50"><p className="text-xs text-emerald-800 font-serif"><span className="font-bold text-emerald-600 mr-1">✨ 升格:</span> {err.revised}</p></div>}
                                <button onClick={() => toggleExplanation(errId)} className="w-full py-1 text-[10px] text-slate-300 hover:text-slate-500 bg-white border-t border-slate-50">收起 (Collapse)</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* D. Action Call */}
                    {activeErrorFilter !== 'ALL' && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex-shrink-0 animate-fade-in-up">
                        <div className="bg-slate-800 rounded-xl p-3 flex items-center justify-between text-white shadow-lg">
                          <div><div className="text-[10px] text-slate-400 uppercase font-bold">Recommended Action</div><div className="text-xs font-bold">针对 {activeErrorFilter} 进行专项特训</div></div>
                          <button onClick={() => handleGoToTraining(activeErrorFilter)} className="px-3 py-1.5 bg-white text-slate-900 text-xs font-bold rounded-lg hover:bg-brand-50 transition-colors">去训练 →</button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm"><span className="text-4xl mb-2 grayscale opacity-50">🎉</span><span>暂无严重错误记录</span></div>
                )}
              </div>
            </div>
          </div>

          {/* 4. History List */}
          <div className="mb-12">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><span className="bg-blue-100 text-blue-900 w-8 h-8 rounded-lg flex items-center justify-center text-base">🗂️</span>学习活动档案 (Activity Log)</h3>
            {historyItems.length === 0 ? <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 border-dashed"><p className="text-slate-400">暂无历史记录</p></div> : (
              <>
                <div className="space-y-4">
                  {(showAllHistory ? historyItems : historyItems.slice(0, 5)).map((item) => {
                    const badge = getBadgeConfig(item.dataType);
                    const isClickable = item.dataType === 'scaffold' || item.dataType === 'essay_grade';
                    return (
                      <div key={item.id} onClick={() => isClickable && handleItemClick(item)} className={`bg-white p-4 rounded-xl border border-slate-100 transition-all group relative overflow-hidden ${isClickable ? 'hover:shadow-md cursor-pointer hover:border-blue-200' : 'opacity-80'}`}>
                        {isClickable && <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-900 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.style}`}>{badge.label}</span>
                              <span className="text-xs text-slate-400">{new Date(item.timestamp).toLocaleDateString()}</span>
                            </div>
                            <h4 className="font-bold text-slate-700 group-hover:text-blue-900 transition-colors line-clamp-1">{item.topic || "Untitled Session"}</h4>
                          </div>
                          <div className="flex items-center gap-4">
                            {item.dataType === 'essay_grade' && (item.data as any).result && (
                              <div className="text-right bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                                <div className="text-xl font-bold text-blue-900 leading-none">{(item.data as any).result.totalScore}<span className="text-[10px] text-slate-400 font-normal ml-0.5">/15</span></div>
                              </div>
                            )}
                            {isClickable && <span className="text-slate-300 group-hover:text-blue-900 transition-colors text-xl">→</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 🆕 展开/收起按钮 */}
                {historyItems.length > 5 && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => setShowAllHistory(!showAllHistory)}
                      className="px-6 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 transition-all hover:shadow-md flex items-center gap-2 mx-auto"
                    >
                      <span>{showAllHistory ? '收起' : `展开更多 (${historyItems.length - 5})`}</span>
                      <span className={`transform transition-transform ${showAllHistory ? 'rotate-180' : ''}`}>▼</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* 🆕 训练预览引导对话框 */}
      {showTrainingPreview && pendingTrainingCategory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in-up">
            {(() => {
              const config = getTrainingConfig(pendingTrainingCategory);
              const colorClasses = {
                purple: 'bg-purple-100 text-purple-600',
                amber: 'bg-amber-100 text-amber-600',
                blue: 'bg-blue-100 text-blue-600',
                rose: 'bg-rose-100 text-rose-600'
              }[config.color];

              return (
                <>
                  <div className="text-center mb-6">
                    <div className={`w-16 h-16 ${colorClasses} rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg`}>
                      {config.icon}
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">
                      🎯 即将开始针对性训练
                    </h3>
                    <p className="text-sm text-slate-500">
                      根据诊断报告为你推荐最佳训练方案
                    </p>
                  </div>

                  <div className="space-y-3 mb-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="flex items-start gap-3">
                      <span className="text-slate-400 text-xs font-bold min-w-[60px]">训练类型</span>
                      <span className="text-slate-800 text-sm font-bold flex-1">
                        {config.mode}
                        <span className="text-xs text-slate-400 font-normal ml-2">({config.modeEn})</span>
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-slate-400 text-xs font-bold min-w-[60px]">聚焦问题</span>
                      <span className="text-slate-700 text-sm flex-1">{config.focus}</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-slate-400 text-xs font-bold min-w-[60px]">预计时长</span>
                      <span className="text-slate-700 text-sm flex-1">{config.duration}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowTrainingPreview(false)}
                      className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-colors"
                    >
                      稍后再练
                    </button>
                    <button
                      onClick={handleConfirmTraining}
                      className={`flex-1 px-4 py-3 ${colorClasses} rounded-xl font-bold text-sm transition-all hover:shadow-lg hover:-translate-y-0.5`}
                    >
                      开始训练 →
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileCenter;