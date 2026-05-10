import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getAllLearningStats, LearningStats, getHistory, getAggregatedUserErrors, getAggregatedUserCollocations, getAggregatedUserVocab } from '../services/storageService';
import { HistoryItem, ScaffoldContent, EssayHistoryData, AggregatedError, CritiqueCategory, EssayGradeResult, Tab } from '../types';
import ResultsDisplay from '../components/ResultsDisplay';
import GradingReport from '../components/GradingReport';
import { getThinkingProcessByUser, getEssayGradesByUser, getVocabularyBank, deleteVocabBankEntry, VocabBankEntry, upsertVocabularyBank, getCollocationBank, deleteCollocationBankEntry, CollocationBankEntry, upsertCollocationBank } from '../services/supabaseDataService';
import { computeMilestones } from '../services/milestones';

/** 学习中心展示用：与 Supabase ctrl_score JSON 对齐的宽松类型（避免依赖 LLM 运行时模块） */
interface CtrlScoreStudentView {
  opinionConsistency?: number;
  argumentProgression?: number;
  linguisticAutonomy?: number;
  thoughtExpansion?: number;
  total?: number;
  explanations?: Partial<Record<'opinionConsistency' | 'argumentProgression' | 'linguisticAutonomy' | 'thoughtExpansion', string>>;
  overallComment?: string;
  analyzedAt?: string;
}

interface CtrlHistoryEntry {
  score: number;
  topic: string;
  date: string;
  detail: CtrlScoreStudentView | null;
}

const CTRL_DIMS_STUDENT: readonly {
  key: keyof Pick<CtrlScoreStudentView, 'opinionConsistency' | 'argumentProgression' | 'linguisticAutonomy' | 'thoughtExpansion'>;
  label: string;
  weight: number;
  color: string;
}[] = [
  { key: 'opinionConsistency', label: '观点一致性', weight: 25, color: '#3b82f6' },
  { key: 'argumentProgression', label: '论证递进性', weight: 30, color: '#10b981' },
  { key: 'linguisticAutonomy', label: '语言自主性', weight: 25, color: '#f59e0b' },
  { key: 'thoughtExpansion', label: '观点拓展度', weight: 20, color: '#8b5cf6' },
];

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
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverLeaveTimer = () => {
    if (hoverLeaveTimerRef.current != null) {
      clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
  };

  useEffect(() => () => clearHoverLeaveTimer(), []);

  const size = 240;
  const center = size / 2;
  const radius = 80;

  const axes = [
    { label: '内容与思辨', key: 'content' as const, angle: -90, max: 4 },
    { label: '组织与逻辑', key: 'organization' as const, angle: 0, max: 3 },
    { label: '语言纯熟度', key: 'proficiency' as const, angle: 90, max: 5 },
    { label: '表达清晰度', key: 'clarity' as const, angle: 180, max: 3 },
  ];

  const toPercent = (scores: EssayGradeResult['subScores']) => ({
    content: ((scores.content || 0) / 4) * 100,
    organization: ((scores.organization || 0) / 3) * 100,
    proficiency: ((scores.proficiency || 0) / 5) * 100,
    clarity: ((scores.clarity || 0) / 3) * 100,
  });

  const currentP = toPercent(current);
  const averageP = toPercent(average);

  /** valuePercent: 沿轴方向占半径的比例（0–100 钳制在圆内；>100 用于轴外标签） */
  const getCoordinates = (valuePercent: number, angleDeg: number, clamp = true) => {
    const ratio = clamp ? Math.max(0, Math.min(1, valuePercent / 100)) : valuePercent / 100;
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: center + radius * ratio * Math.cos(angleRad),
      y: center + radius * ratio * Math.sin(angleRad),
    };
  };

  const buildPath = (data: Record<string, number>) => {
    return axes
      .map((axis) => {
        const val = data[axis.key] || 0;
        const { x, y } = getCoordinates(val, axis.angle);
        return `${x},${y}`;
      })
      .join(' ');
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
            const labelPos = getCoordinates(118, axis.angle, false);
            const avg = (average as any)[axis.key] ?? 0;
            return (
              <g key={`lbl-${i}`}>
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[10px] font-bold fill-slate-500 tracking-wide"
                >
                  {axis.label}
                </text>
                <text
                  x={labelPos.x}
                  y={labelPos.y + 11}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#94a3b8"
                  fontWeight="600"
                  style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                >
                  均 {Number(avg).toFixed(1)}/{axis.max}
                </text>
              </g>
            );
          })}
          {/* 顶点悬停：显示本次得分/满分（透明热区置于最上层） */}
          {axes.map((axis, i) => {
            const pt = getCoordinates(currentP[axis.key], axis.angle);
            const cur = Number((current as any)[axis.key] ?? 0).toFixed(1);
            const dx = center - pt.x;
            const dy = center - pt.y;
            const len = Math.hypot(dx, dy) || 1;
            const tipX = pt.x + (dx / len) * 34;
            const tipY = pt.y + (dy / len) * 34;
            const tw = 108;
            const th = 42;
            return (
              <g key={`hit-${i}`}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={24}
                  fill="transparent"
                  stroke="none"
                  className="cursor-pointer"
                  onMouseEnter={() => {
                    clearHoverLeaveTimer();
                    setHoveredAxis(i);
                  }}
                  onMouseLeave={() => {
                    clearHoverLeaveTimer();
                    hoverLeaveTimerRef.current = setTimeout(() => setHoveredAxis(null), 200);
                  }}
                />
                {hoveredAxis === i && (
                  <g pointerEvents="none">
                    <rect
                      x={tipX - tw / 2}
                      y={tipY - th / 2}
                      width={tw}
                      height={th}
                      rx={8}
                      fill="#0f172a"
                      fillOpacity={0.94}
                      stroke="#334155"
                      strokeWidth="1"
                    />
                    <text
                      x={tipX}
                      y={tipY - 5}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#f8fafc"
                      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                    >
                      {axis.label}
                    </text>
                    <text
                      x={tipX}
                      y={tipY + 11}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="#93c5fd"
                      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                    >
                      本次 {cur} / {axis.max}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex gap-4 mt-2 text-[10px] font-bold">
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500/40 border border-blue-500 rounded-sm"></span><span className="text-slate-700">本次</span></div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-400/20 border border-slate-400 border-dashed rounded-sm"></span><span className="text-slate-500">平均</span></div>
      </div>
      <p className="text-[9px] text-slate-400 mt-1 text-center leading-tight px-1">
        鼠标移到蓝色图形各顶点附近可查看本次得分与满分；轴标下方灰色为你历次作文在该维度的平均分
      </p>
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
  const [recentCollocations, setRecentCollocations] = useState<CollocationBankEntry[]>([]);
  const [collocationBankLoading, setCollocationBankLoading] = useState(false);
  const [recentErrors, setRecentErrors] = useState<AggregatedError[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingItem, setViewingItem] = useState<HistoryItem | null>(null);

  // 词汇银行 state
  const [vocabBank, setVocabBank] = useState<VocabBankEntry[]>([]);
  const [vocabBankLoading, setVocabBankLoading] = useState(false);
  const [vocabSearch, setVocabSearch] = useState('');
  const [vocabTopicFilter, setVocabTopicFilter] = useState<string>('ALL');
  const [expandedVocabId, setExpandedVocabId] = useState<string | null>(null);

  // Interactive State
  const [revealedExplanationIds, setRevealedExplanationIds] = useState<Set<number>>(new Set());
  const [activeErrorFilter, setActiveErrorFilter] = useState<CritiqueCategory | 'ALL'>('ALL');
  const [showDimensionTrends, setShowDimensionTrends] = useState(false);
  const [showTrainingPreview, setShowTrainingPreview] = useState(false);
  const [pendingTrainingCategory, setPendingTrainingCategory] = useState<CritiqueCategory | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [activeVaultTab, setActiveVaultTab] = useState<'vocabulary' | 'collocations'>('vocabulary');
  const [ctrlHistory, setCtrlHistory] = useState<CtrlHistoryEntry[]>([]);
  const [showCtrlDimensions, setShowCtrlDimensions] = useState(false);
  /** 云端作文分数（时间升序），用于本地历史不足 2 条时仍显示「写作成长对比」 */
  const [remoteEssayScores, setRemoteEssayScores] = useState<{ created_at: string; total_score: number }[]>([]);

  // Computed Logic
  const errorStats = useMemo(() => {
    try {
      const defaultConfig = { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100', ring: 'ring-slate-200', icon: '📝', label: '其他' };
      const configMap: Record<string, typeof defaultConfig> = {
        'Clarity': { color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', ring: 'ring-rose-200', icon: '📖', label: '表达清晰度' },
        'Proficiency': { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', ring: 'ring-blue-200', icon: '🗣️', label: '语言纯熟度' },
        'Organization': { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', ring: 'ring-amber-200', icon: '🧩', label: '组织与逻辑' },
        'Content': { color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', ring: 'ring-purple-200', icon: '📝', label: '内容与思辨' }
      };
      const categories: CritiqueCategory[] = ['Content', 'Organization', 'Proficiency', 'Clarity'];
      const counts = categories.map(cat => ({
        category: cat,
        count: recentErrors.filter(e => e.category === cat).length,
        config: configMap[cat] || defaultConfig
      }));
      const sorted = [...counts].sort((a, b) => b.count - a.count);
      return {
        all: counts,
        topWeaknesses: sorted.filter(c => c.count > 0).slice(0, 2),
        total: recentErrors.length
      };
    } catch (err) {
      console.error('[ProfileCenter] errorStats computation failed:', err);
      return { all: [], topWeaknesses: [], total: 0 };
    }
  }, [recentErrors]);

  const essayHistory = useMemo(() => {
    try {
      return historyItems
        .filter(item => {
          if (item.dataType !== 'essay_grade') return false;
          const data = item.data as EssayHistoryData;
          return data?.result && typeof data.result.totalScore === 'number' && data.result.subScores;
        })
        .sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
      console.error('[ProfileCenter] essayHistory computation failed:', err);
      return [];
    }
  }, [historyItems]);

  /** 首次 vs 最新写作分数：优先本地批改历史；不足 2 条时用 Supabase wc_essay_grades */
  const writingGrowthComparison = useMemo(() => {
    if (essayHistory.length >= 2) {
      const firstScore = (essayHistory[0].data as EssayHistoryData)?.result?.totalScore ?? 0;
      const latestScore = (essayHistory[essayHistory.length - 1].data as EssayHistoryData)?.result?.totalScore ?? 0;
      return { firstScore, latestScore, count: essayHistory.length, source: 'local' as const };
    }
    if (remoteEssayScores.length >= 2) {
      const firstScore = remoteEssayScores[0].total_score;
      const latestScore = remoteEssayScores[remoteEssayScores.length - 1].total_score;
      return { firstScore, latestScore, count: remoteEssayScores.length, source: 'remote' as const };
    }
    return null;
  }, [essayHistory, remoteEssayScores]);

  /** 作文历史最高分：合并本地批改与云端 wc_essay_grades，供里程碑判定 */
  const essayMaxScore = useMemo(() => {
    let max = 0;
    essayHistory.forEach((item) => {
      const s = (item.data as EssayHistoryData)?.result?.totalScore;
      if (typeof s === 'number' && !Number.isNaN(s)) max = Math.max(max, s);
    });
    remoteEssayScores.forEach((e) => {
      if (typeof e.total_score === 'number' && !Number.isNaN(e.total_score)) {
        max = Math.max(max, e.total_score);
      }
    });
    return max;
  }, [essayHistory, remoteEssayScores]);

  const milestoneStates = useMemo(
    () =>
      computeMilestones({
        socraticCount: stats.socraticCount,
        graderCount: stats.graderCount,
        drillCount: stats.drillCount,
        essayMaxScore,
        ctrlAnalyzedCount: ctrlHistory.length,
      }),
    [stats.socraticCount, stats.graderCount, stats.drillCount, essayMaxScore, ctrlHistory.length]
  );

  // 获取最近的5次作文用于趋势图
  const recentEssays = essayHistory.slice(-5);
  const latestEssayData = essayHistory.length > 0
    ? (essayHistory[essayHistory.length - 1].data as EssayHistoryData)?.result ?? null
    : null;

  const historicalAverage = useMemo(() => {
    try {
      if (essayHistory.length === 0) return null;
      const sums = essayHistory.reduce((acc, item) => {
        const scores = (item.data as EssayHistoryData)?.result?.subScores;
        if (!scores) return acc;
        acc.content += (scores as any).content ?? 0;
        acc.organization += (scores as any).organization ?? 0;
        acc.proficiency += (scores as any).proficiency ?? 0;
        acc.clarity += (scores as any).clarity ?? 0;
        return acc;
      }, { content: 0, organization: 0, proficiency: 0, clarity: 0 });
      const count = essayHistory.length;
      return {
        content: sums.content / count,
        organization: sums.organization / count,
        proficiency: sums.proficiency / count,
        clarity: sums.clarity / count,
      };
    } catch (err) {
      console.error('[ProfileCenter] historicalAverage computation failed:', err);
      return null;
    }
  }, [essayHistory]);

  const improvementFeedback = useMemo(() => {
    try {
      if (!latestEssayData?.subScores || !historicalAverage) return null;
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
        const curr = (current as any)[dim.key] ?? 0;
        const avg = (average as any)[dim.key] ?? 0;
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
    } catch (err) {
      console.error('[ProfileCenter] improvementFeedback computation failed:', err);
      return null;
    }
  }, [latestEssayData, historicalAverage]);

  const recommendation = useMemo(() => {
    try {
      if (!latestEssayData?.subScores) return null;
      const scores = latestEssayData.subScores;
      const normalized = [
        { key: 'content', val: ((scores as any).content ?? 0) / 4, label: '内容思辨', drill: 'Socratic Coach' },
        { key: 'organization', val: ((scores as any).organization ?? 0) / 3, label: '组织逻辑', drill: 'Structure Architect' },
        { key: 'proficiency', val: ((scores as any).proficiency ?? 0) / 5, label: '语言纯熟', drill: 'Elevation Lab' },
        { key: 'clarity', val: ((scores as any).clarity ?? 0) / 3, label: '表达清晰', drill: 'Grammar Doctor' }
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
    } catch (err) {
      console.error('[ProfileCenter] recommendation computation failed:', err);
      return null;
    }
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

  // 词汇银行：筛选逻辑
  const vocabTopics = useMemo(() => {
    const topics = Array.from(new Set(vocabBank.map(v => v.topic).filter(Boolean))) as string[];
    return topics;
  }, [vocabBank]);

  const getFilteredVocab = useCallback(() => {
    return vocabBank.filter(v => {
      const matchSearch = !vocabSearch || v.word.toLowerCase().includes(vocabSearch.toLowerCase()) || v.chinese.includes(vocabSearch);
      const matchTopic = vocabTopicFilter === 'ALL' || v.topic === vocabTopicFilter;
      return matchSearch && matchTopic;
    });
  }, [vocabBank, vocabSearch, vocabTopicFilter]);

  // 词汇银行：删除词条
  const handleDeleteVocab = async (entryId: string) => {
    await deleteVocabBankEntry(entryId);
    setVocabBank(prev => prev.filter(v => v.id !== entryId));
  };

  // 维度 → 特训模式映射
  const CATEGORY_TO_DRILL_MODE: Partial<Record<CritiqueCategory, string>> = {
    Proficiency: 'grammar_doctor',
    Clarity: 'elevation_lab',
    Organization: 'structure_architect',
  };

  const handleConfirmTraining = () => {
    setShowTrainingPreview(false);
    if (pendingTrainingCategory === 'Content') {
      onNavigate('/coach');
      return;
    }
    // 过滤出该维度的错题原句，传递给特训
    const drillMode = CATEGORY_TO_DRILL_MODE[pendingTrainingCategory!];
    const categoryErrors = recentErrors
      .filter(e => e.category === pendingTrainingCategory)
      .map(e => e.original)
      .filter(Boolean)
      .slice(0, 6); // 最多传6句，避免 prompt 过长

    if (drillMode) {
      localStorage.setItem('cet_pending_drill', JSON.stringify({
        mode: drillMode,
        category: pendingTrainingCategory,
        errors: categoryErrors,
        launchedAt: Date.now(),
      }));
    }
    onNavigate('/drills');
  };

  // CSV导出功能
  const handleExportCSV = () => {
    let csvContent = '';
    let filename = '';

    if (activeVaultTab === 'vocabulary') {
      // 导出词汇银行（当前筛选结果）
      const filtered = getFilteredVocab();
      csvContent = '\uFEFF'; // UTF-8 BOM for Excel
      csvContent += '英文,中文,英文释义,例句(英文),例句(中文),来源话题,出现次数\n';
      filtered.forEach(v => {
        const row = [
          v.word,
          v.chinese,
          (v.english_def || '').replace(/,/g, '，'),
          (v.usage || '').replace(/,/g, '，'),
          (v.usage_zh || '').replace(/,/g, '，'),
          (v.topic || '').replace(/,/g, '，'),
          v.frequency,
        ].join(',');
        csvContent += row + '\n';
      });
      filename = `词汇银行_${new Date().toISOString().slice(0, 10)}.csv`;
    } else {
      // 导出地道搭配（云端版）
      csvContent = '\uFEFF';
      csvContent += '英文搭配,中文释义,来源话题,出现次数\n';
      recentCollocations.forEach(col => {
        const row = [
          col.en,
          col.zh,
          (col.topic || '').replace(/,/g, '，'),
          col.frequency,
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

  // 按话题导出 Markdown（适合导入 ima 语料库）
  const handleExportMarkdown = () => {
    // 收集所有话题
    const topicSet = new Set<string>();
    vocabBank.forEach(v => { if (v.topic) topicSet.add(v.topic); });
    recentCollocations.forEach(c => { if (c.topic) topicSet.add(c.topic); });

    if (topicSet.size === 0) {
      alert('暂无话题数据，完成训练后再导出');
      return;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    let md = `# 审辨写作训练 · 个人语料库\n\n`;
    md += `> 导出时间：${dateStr}　词汇：${vocabBank.length} 个　搭配：${recentCollocations.length} 条\n\n`;
    md += `---\n\n`;

    Array.from(topicSet).sort().forEach(topic => {
      md += `## ${topic}\n\n`;

      const topicVocab = vocabBank.filter(v => v.topic === topic);
      if (topicVocab.length > 0) {
        md += `### 核心词汇\n\n`;
        md += `| 单词 | 中文释义 | 英文释义 | 例句 | 出现次数 |\n`;
        md += `|------|---------|---------|------|--------|\n`;
        topicVocab.forEach(v => {
          const usage = (v.usage || '').replace(/\|/g, '｜');
          const def = (v.english_def || '').replace(/\|/g, '｜');
          md += `| **${v.word}** | ${v.chinese} | ${def} | *${usage}* | ${v.frequency} |\n`;
        });
        md += `\n`;
      }

      const topicCols = recentCollocations.filter(c => c.topic === topic);
      if (topicCols.length > 0) {
        md += `### 地道搭配\n\n`;
        topicCols.forEach(c => {
          const freq = c.frequency > 1 ? ` ×${c.frequency}` : '';
          md += `- **${c.en}** — ${c.zh}${freq}\n`;
        });
        md += `\n`;
      }

      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `语料库_按话题_${dateStr}.md`;
    link.click();
  };

  // Effects & Data Loading
  const refreshData = useCallback(() => {
    try {
      setStats(getAllLearningStats());
      setHistoryItems(getHistory());
      setRecentErrors(getAggregatedUserErrors(20));
    } catch (err) {
      console.error('[ProfileCenter] Failed to load data:', err);
      setStats({ socraticCount: 0, graderCount: 0, drillCount: 0 });
      setHistoryItems([]);
      setRecentErrors([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    refreshData();
    // 从 Supabase 加载 CTRL 审辨信度历史 & 词汇银行
    try {
      const saved = localStorage.getItem('cet_student_user');
      if (saved) {
        const user = JSON.parse(saved);
        if (user?.id) {
          // 加载词汇银行（含一次性 localStorage 迁移）
          setVocabBankLoading(true);
          const migrateAndLoadVocab = async () => {
            const VOCAB_MIGRATE_KEY = `cet_vocab_migrated_${user.id}`;
            if (!localStorage.getItem(VOCAB_MIGRATE_KEY)) {
              // 从 localStorage scaffold 历史中读取全量词汇
              const legacyVocab = getAggregatedUserVocab(500);
              if (legacyVocab.length > 0) {
                // 旧数据没有 topic，统一标记为"历史训练"
                await upsertVocabularyBank(user.id, legacyVocab, '历史训练').catch(() => {});
              }
              localStorage.setItem(VOCAB_MIGRATE_KEY, '1');
            }
            const { data } = await getVocabularyBank(user.id, 200);
            setVocabBank(data || []);
          };
          migrateAndLoadVocab().catch(() => setVocabBank([])).finally(() => setVocabBankLoading(false));

          // 加载搭配银行（含一次性 localStorage 迁移）
          setCollocationBankLoading(true);
          const migrateAndLoadCollocations = async () => {
            const MIGRATE_KEY = `cet_collocation_migrated_${user.id}`;
            if (!localStorage.getItem(MIGRATE_KEY)) {
              // 读取 localStorage 中的历史搭配（不限数量）
              const legacyCols = getAggregatedUserCollocations(500);
              if (legacyCols.length > 0) {
                // 按话题分组批量上传
                const byTopic = new Map<string, { en: string; zh: string }[]>();
                legacyCols.forEach(c => {
                  const t = c.topic || '历史训练';
                  if (!byTopic.has(t)) byTopic.set(t, []);
                  byTopic.get(t)!.push({ en: c.en, zh: c.zh });
                });
                for (const [topic, cols] of byTopic.entries()) {
                  await upsertCollocationBank(user.id, cols, topic).catch(() => {});
                }
              }
              localStorage.setItem(MIGRATE_KEY, '1');
            }
            const { data } = await getCollocationBank(user.id, 200);
            setRecentCollocations(data || []);
          };
          migrateAndLoadCollocations().catch(() => setRecentCollocations([])).finally(() => setCollocationBankLoading(false));

          Promise.all([
            getThinkingProcessByUser(user.id),
            getEssayGradesByUser(user.id),
          ]).then(([tpRes, essayRes]) => {
            const data = tpRes.data;
            if (data) {
              const scored: CtrlHistoryEntry[] = data
                .filter((p: any) => p.ctrl_score?.total != null)
                .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((p: any) => {
                  const cs = p.ctrl_score as CtrlScoreStudentView;
                  return {
                    score: cs.total as number,
                    topic: p.topic || '',
                    date: cs.analyzedAt || p.created_at,
                    detail: cs && typeof cs === 'object' ? cs : null,
                  };
                });
              setCtrlHistory(scored);
            } else {
              setCtrlHistory([]);
            }
            const rows = essayRes.data || [];
            const sorted = [...rows]
              .filter((e: any) => typeof e?.total_score === 'number')
              .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            setRemoteEssayScores(
              sorted.map((e: any) => ({ created_at: e.created_at, total_score: e.total_score }))
            );
          }).catch(() => {
            setCtrlHistory([]);
            setRemoteEssayScores([]);
          });
        } else {
          setRemoteEssayScores([]);
        }
      } else {
        setRemoteEssayScores([]);
      }
    } catch {
      setRemoteEssayScores([]);
    }
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

          {/* 1.5 学习里程碑徽章（纯展示，不改变任何业务逻辑） */}
          <div className="mb-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg" aria-hidden>🏅</span>
              <h3 className="font-bold text-slate-800 text-sm">学习里程碑</h3>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Milestones</span>
            </div>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              达成条件后自动点亮；悬停可查看说明。数据来自本机学习记录与（若已登录）云端作文与审辨信度。
            </p>
            <div className="flex flex-wrap gap-2">
              {milestoneStates.map((m) => (
                <div
                  key={m.id}
                  title={m.description}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-shadow cursor-default select-none ${
                    m.unlocked
                      ? 'bg-amber-50 text-amber-900 border-amber-200 shadow-sm'
                      : 'bg-slate-50 text-slate-400 border-slate-200 border-dashed opacity-80'
                  }`}
                >
                  <span aria-hidden>{m.icon}</span>
                  <span>{m.label}</span>
                  {m.unlocked ? <span className="text-[10px]">✓</span> : <span className="text-[10px] text-slate-300">···</span>}
                </div>
              ))}
            </div>
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

          {/* 2.5 成长对比 + 审辨信度趋势 */}
          {(writingGrowthComparison != null || ctrlHistory.length >= 1) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

              {/* 首次 vs 最新对比卡（本地历史 ≥2 或云端 ≥2 条作文批改） */}
              {writingGrowthComparison && (() => {
                const { firstScore, latestScore, count } = writingGrowthComparison;
                const delta = +(latestScore - firstScore).toFixed(1);
                const improved = delta > 0;
                const stable = delta === 0;
                return (
                  <div className={`rounded-2xl p-5 border shadow-sm flex items-center gap-5 ${improved ? 'bg-emerald-50 border-emerald-200' : stable ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 ${improved ? 'bg-emerald-100' : stable ? 'bg-slate-100' : 'bg-rose-100'}`}>
                      {improved ? '🚀' : stable ? '➡️' : '📉'}
                    </div>
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${improved ? 'text-emerald-600' : stable ? 'text-slate-500' : 'text-rose-600'}`}>
                        写作成长对比
                      </p>
                      <p className={`text-base font-bold ${improved ? 'text-emerald-800' : stable ? 'text-slate-700' : 'text-rose-800'}`}>
                        你的写作分数从 <span className="text-xl font-serif">{firstScore}</span> {improved ? '提升到' : stable ? '保持在' : '变化到'} <span className="text-xl font-serif">{latestScore}</span> 分
                      </p>
                      <p className={`text-sm mt-0.5 ${improved ? 'text-emerald-600' : stable ? 'text-slate-500' : 'text-rose-600'}`}>
                        {improved ? `↑ 进步了 +${delta} 分，共完成 ${count} 次批改` : stable ? `→ 保持稳定，共完成 ${count} 次批改` : `↓ 差距 ${delta} 分，继续加油！共完成 ${count} 次`}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* CTRL 审辨信度趋势 / 评分卡 */}
              {ctrlHistory.length >= 1 && (
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center text-lg">🔍</div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">审辨信度趋势</h3>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">CTRL Score Trend (Max 10)</p>
                    </div>
                  </div>
                  {ctrlHistory.length === 1 ? (
                    /* 仅1次：只显示评分卡 */
                    <div className="flex flex-col items-center justify-center h-24 gap-2">
                      <div className="text-4xl font-bold font-serif text-purple-600">{ctrlHistory[0].score.toFixed(1)}</div>
                      <div className="text-xs text-slate-400">/ 10 · {ctrlHistory[0].topic.slice(0, 20)}{ctrlHistory[0].topic.length > 20 ? '…' : ''}</div>
                      <div className="text-[10px] text-slate-300">完成更多思维训练后将显示成长趋势</div>
                    </div>
                  ) : (
                    /* ≥2次：显示趋势图 */
                    <>
                      <div className="flex items-end gap-1.5 h-20">
                        {ctrlHistory.slice(-6).map((item, i, arr) => {
                          const pct = (item.score / 10) * 100;
                          const isLatest = i === arr.length - 1;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                              <span className="text-[10px] font-bold text-slate-500">{item.score.toFixed(1)}</span>
                              <div
                                className={`w-full rounded-t-md transition-all ${isLatest ? 'bg-purple-500' : 'bg-purple-200'}`}
                                style={{ height: `${Math.max(pct * 0.56, 4)}px` }}
                              />
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                {item.topic.slice(0, 15)}{item.topic.length > 15 ? '…' : ''}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-[10px] text-slate-400">第1次</span>
                        <span className="text-[10px] text-slate-400">最近</span>
                      </div>
                      {(() => {
                        const first = ctrlHistory[0].score;
                        const latest = ctrlHistory[ctrlHistory.length - 1].score;
                        const d = +(latest - first).toFixed(1);
                        return (
                          <p className={`text-xs font-bold mt-2 text-center ${d > 0 ? 'text-purple-600' : d < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                            审辨信度：{first.toFixed(1)} → {latest.toFixed(1)}（{d > 0 ? `+${d}` : d}）
                          </p>
                        );
                      })()}
                    </>
                  )}

                  {/* 总体评语：学生端直接可见（基于最近一次已分析的训練） */}
                  {(() => {
                    const latest = ctrlHistory[ctrlHistory.length - 1];
                    const comment = latest?.detail?.overallComment?.trim();
                    if (!comment) return null;
                    return (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">总体评语</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{comment}</p>
                      </div>
                    );
                  })()}

                  {/* 四维明细：折叠展开，对齐教师端维度权重与配色 */}
                  {(() => {
                    const latest = ctrlHistory[ctrlHistory.length - 1];
                    const d = latest?.detail;
                    if (!d) return null;
                    return (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowCtrlDimensions(!showCtrlDimensions)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-purple-50/80 hover:bg-purple-50 border border-purple-100 rounded-lg transition-colors text-xs font-bold text-purple-800"
                        >
                          <span>📊 {showCtrlDimensions ? '收起' : '展开'}四维得分与要点</span>
                          <span className={`transform transition-transform ${showCtrlDimensions ? 'rotate-180' : ''}`}>▼</span>
                        </button>
                        {showCtrlDimensions && (
                          <div className="mt-2 p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-3 animate-fade-in-up">
                            <p className="text-[10px] text-slate-400">
                              以下为你最近一次思维训练（{latest.topic?.slice(0, 24)}{latest.topic && latest.topic.length > 24 ? '…' : ''}）的参考反馈；各维度满分 10 分。
                            </p>
                            {CTRL_DIMS_STUDENT.map(({ key, label, weight, color }) => {
                              const val = typeof d[key] === 'number' ? d[key] as number : 0;
                              const expl = d.explanations?.[key]?.trim() || '';
                              return (
                                <div key={key}>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-xs font-bold text-slate-700 truncate">{label}</span>
                                      <span className="text-[10px] text-slate-400 flex-shrink-0">×{weight}%</span>
                                    </div>
                                    <span className="text-sm font-bold flex-shrink-0 ml-2" style={{ color }}>
                                      {val.toFixed(1)}
                                    </span>
                                  </div>
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                                    <div
                                      className="h-full rounded-full transition-all duration-500"
                                      style={{ width: `${Math.max(0, Math.min(100, (val / 10) * 100))}%`, backgroundColor: color }}
                                    />
                                  </div>
                                  {expl ? (
                                    <p className="text-[11px] text-slate-600 leading-relaxed">{expl}</p>
                                  ) : (
                                    <p className="text-[11px] text-slate-400 italic">暂无该维度文字说明</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* 3. Insight Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {/* Left: 词汇银行 + 地道搭配 */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col h-[600px]">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-base font-bold">词</div>
                  <div>
                    <h3 className="font-bold text-slate-800">词汇银行</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {activeVaultTab === 'vocabulary' ? `已积累 ${vocabBank.length} 个词汇` : 'Collocations'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCSV}
                    disabled={activeVaultTab === 'vocabulary' ? vocabBank.length === 0 : recentCollocations.length === 0}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="导出当前分类为 CSV"
                  >
                    导出 CSV
                  </button>
                  <button
                    onClick={handleExportMarkdown}
                    disabled={vocabBank.length === 0 && recentCollocations.length === 0}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="按话题分组导出 Markdown，可直接导入 ima 语料库"
                  >
                    按话题导出
                  </button>
                </div>
              </div>

              {/* Tab 切换 */}
              <div className="flex gap-2 mb-3 flex-shrink-0">
                <button
                  onClick={() => setActiveVaultTab('vocabulary')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeVaultTab === 'vocabulary'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  核心词汇 ({vocabBank.length})
                </button>
                <button
                  onClick={() => setActiveVaultTab('collocations')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeVaultTab === 'collocations'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  地道搭配 ({collocationBankLoading ? '…' : recentCollocations.length})
                </button>
              </div>

              {/* 词汇银行：搜索 + 话题筛选 */}
              {activeVaultTab === 'vocabulary' && (
                <div className="flex gap-2 mb-3 flex-shrink-0">
                  <input
                    type="text"
                    value={vocabSearch}
                    onChange={e => setVocabSearch(e.target.value)}
                    placeholder="搜索单词或中文..."
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 bg-slate-50"
                  />
                  {vocabTopics.length > 0 && (
                    <select
                      value={vocabTopicFilter}
                      onChange={e => setVocabTopicFilter(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400 bg-slate-50 text-slate-700 max-w-[130px]"
                    >
                      <option value="ALL">全部话题</option>
                      {vocabTopics.map(t => (
                        <option key={t} value={t}>{t.length > 12 ? t.slice(0, 12) + '…' : t}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* 内容展示 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {activeVaultTab === 'vocabulary' ? (
                  vocabBankLoading ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">加载中...</div>
                  ) : (() => {
                    const filtered = getFilteredVocab();
                    return filtered.length > 0 ? (
                      <div className="flex flex-col gap-1 pr-1">
                        {filtered.map(v => (
                          <div
                            key={v.id}
                            className="border border-slate-100 rounded-lg overflow-hidden"
                          >
                            {/* 词汇行（可展开） */}
                            <div
                              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                              onClick={() => setExpandedVocabId(expandedVocabId === v.id ? null : v.id)}
                            >
                              <span className="font-semibold text-slate-800 text-sm flex-1">{v.word}</span>
                              <span className="text-xs text-slate-500 mr-1">{v.chinese}</span>
                              {v.frequency > 1 && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded border border-amber-200">
                                  ×{v.frequency}
                                </span>
                              )}
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteVocab(v.id); }}
                                className="ml-1 text-slate-300 hover:text-rose-400 transition-colors text-xs leading-none"
                                title="移除此词汇"
                              >✕</button>
                            </div>
                            {/* 展开详情 */}
                            {expandedVocabId === v.id && (
                              <div className="px-3 pb-3 pt-1 bg-slate-50 text-xs text-slate-600 space-y-1 border-t border-slate-100">
                                {v.english_def && <p><span className="font-medium text-slate-500">Def: </span>{v.english_def}</p>}
                                {v.usage && <p className="italic text-slate-700">"{v.usage}"</p>}
                                {v.usage_zh && <p className="text-slate-500">{v.usage_zh}</p>}
                                {v.topic && <p className="text-slate-400">话题：{v.topic}</p>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm py-8">
                        {vocabBank.length === 0 ? '完成一次思维训练后，词汇将自动入库' : '未找到匹配词汇'}
                      </div>
                    );
                  })()
                ) : (
                  collocationBankLoading ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">加载中...</div>
                  ) : recentCollocations.length > 0 ? (
                    <div className="flex flex-col gap-1 pr-1">
                      {recentCollocations.map(col => (
                        <div key={col.id} className="flex items-center gap-2 px-3 py-2 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors group">
                          <span className="font-semibold text-sm text-slate-700 flex-1">{col.en}</span>
                          <span className="text-xs text-slate-500">{col.zh}</span>
                          {col.frequency > 1 && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-200">×{col.frequency}</span>
                          )}
                          <button
                            onClick={() => deleteCollocationBankEntry(col.id).then(() => setRecentCollocations(prev => prev.filter(c => c.id !== col.id)))}
                            className="ml-1 text-slate-300 hover:text-rose-400 transition-colors text-xs opacity-0 group-hover:opacity-100"
                            title="移除此搭配"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm py-8">
                      完成一次思维训练后，搭配将自动入库
                    </div>
                  )
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
                        const defaultConf = { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100', ring: 'ring-slate-200', icon: '📝', label: '其他' };
                        const conf = errorStats.all.find(s => s.category === err.category)?.config ?? defaultConf;
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
              const colorClasses = ({
                purple: 'bg-purple-100 text-purple-600',
                amber: 'bg-amber-100 text-amber-600',
                blue: 'bg-blue-100 text-blue-600',
                rose: 'bg-rose-100 text-rose-600'
              } as Record<string, string>)[config.color] || 'bg-slate-100 text-slate-600';

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