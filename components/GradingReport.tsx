
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { EssayGradeResult, SentenceCritique, CritiqueCategory, KeyMaterial, ContrastivePoint } from '../types';
import { evaluateRetrainingAttempt } from '../services/geminiService';

interface GradingReportProps {
  result: EssayGradeResult;
  essayText: string;
  topic?: string;
  onBack?: () => void;
  onSave?: () => void;
  isSaved?: boolean;
  isHistoryView?: boolean;
}

// --- Helper Functions & Sub-components ---

const REFLECTION_PROMPTS = [
  "💡 停一下！在看诊断前，你能自己修好这个句子吗？",
  "🧠 挑战：尝试找出这个表达背后的语法陷阱...",
  "🔍 提示：点击前请先在心中构建你的‘升格版’。"
];

// Mini Radar for Contrast Tab
const MiniRadar: React.FC<{
  studentScores: EssayGradeResult['subScores'];
  modelScores?: EssayGradeResult['modelSubScores'];
}> = ({ studentScores, modelScores }) => {
  if (!modelScores) return null; // Fallback if model scores not available

  const size = 160;
  const center = size / 2;
  const radius = 50;

  // Normalize scores (0-100)
  const normalize = (scores: any) => ({
    content: (scores.content || 0) / 4 * 100,
    organization: (scores.organization || 0) / 3 * 100,
    proficiency: (scores.proficiency || 0) / 5 * 100,
    clarity: (scores.clarity || 0) / 3 * 100,
  });

  const studentP = normalize(studentScores);
  const modelP = normalize(modelScores);

  const axes = [
    { label: '思辨', key: 'content', angle: -90 },      // Top
    { label: '逻辑', key: 'organization', angle: 0 },   // Right
    { label: '语言', key: 'proficiency', angle: 90 },   // Bottom
    { label: '清晰', key: 'clarity', angle: 180 },      // Left
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
    <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-3 border border-slate-100">
      <div className="relative w-24 h-24">
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
          {/* Background Grid */}
          <circle cx={center} cy={center} r={radius} fill="none" stroke="#e2e8f0" strokeWidth="1" />
          <circle cx={center} cy={center} r={radius * 0.5} fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />

          {/* Axes */}
          {axes.map((axis, i) => {
            const end = getCoordinates(100, axis.angle);
            return <line key={i} x1={center} y1={center} x2={end.x} y2={end.y} stroke="#e2e8f0" strokeWidth="1" />;
          })}

          {/* Model Shape (Perfect - Gold) */}
          <polygon
            points={buildPath(modelP)}
            fill="rgba(234, 179, 8, 0.2)"
            stroke="#eab308"
            strokeWidth="2"
          />

          {/* Student Shape (Blue) */}
          <polygon
            points={buildPath(studentP)}
            fill="rgba(59, 130, 246, 0.4)"
            stroke="#3b82f6"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-2 text-[10px] font-bold">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40 border border-blue-500"></span>
          <span className="text-slate-600">你的表现</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-yellow-500/20 border border-yellow-500"></span>
          <span className="text-slate-600">满分范文</span>
        </div>
      </div>
    </div>
  );
};

// Improved Context Finder
const getSentenceContext = (fullText: string, snippet: string) => {
  if (!snippet || !fullText) return { before: '', match: snippet, after: '' };

  const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
  const cleanSnippet = normalize(snippet);
  const cleanFull = normalize(fullText);

  const index = cleanFull.indexOf(cleanSnippet);

  if (index === -1) {
    const indexCase = cleanFull.toLowerCase().indexOf(cleanSnippet.toLowerCase());
    if (indexCase === -1) return { before: '', match: snippet, after: '' };

    return {
      before: cleanFull.substring(Math.max(0, indexCase - 50), indexCase) + (indexCase > 50 ? '...' : ''),
      match: cleanFull.substring(indexCase, indexCase + cleanSnippet.length),
      after: cleanFull.substring(indexCase + cleanSnippet.length, Math.min(cleanFull.length, indexCase + cleanSnippet.length + 50)) + '...'
    };
  }

  let start = index;
  while (start > 0) {
    if (['.', '!', '?', '\n'].includes(cleanFull[start - 1])) break;
    start--;
  }

  let end = index + cleanSnippet.length;
  while (end < cleanFull.length) {
    if (['.', '!', '?', '\n'].includes(cleanFull[end])) {
      end++;
      break;
    }
    end++;
  }

  return {
    before: cleanFull.substring(start, index).trimStart(),
    match: cleanFull.substring(index, index + cleanSnippet.length),
    after: cleanFull.substring(index + cleanSnippet.length, end).trimEnd()
  };
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string; subLabel: string }> = ({ active, onClick, icon, label, subLabel }) => (
  <button
    onClick={onClick}
    className={`flex-1 min-w-[120px] py-3 px-2 rounded-lg transition-all duration-200 flex flex-col items-center justify-center gap-1
      ${active
        ? 'bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-200'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}
  >
    <div className="flex items-center gap-2">
      <span className="text-xl">{icon}</span>
      <span className="font-bold text-sm">{label}</span>
    </div>
    <span className={`text-[10px] uppercase tracking-wider ${active ? 'text-blue-600' : 'text-slate-400'}`}>
      {subLabel}
    </span>
  </button>
);

const ScoreBar: React.FC<{ label: string; score: number; max: number; color: string }> = ({ label, score, max, color }) => (
  <div>
    <div className="flex justify-between text-xs font-bold text-slate-600 mb-1.5">
      <span>{label}</span>
      <span className="font-mono text-slate-800 bg-slate-100 px-1.5 rounded">{score} / {max}</span>
    </div>
    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-50">
      <div
        className={`h-full ${color} rounded-full transition-all duration-1000 ease-out shadow-sm`}
        style={{ width: `${(score / max) * 100}%` }}
      ></div>
    </div>
  </div>
);

// --- Redesigned 3-Stage Critique Card ---
const CritiqueCard: React.FC<{ item: SentenceCritique, index: number, fullEssay: string }> = ({ item, index, fullEssay }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const reflectionPrompt = useMemo(() => {
    return REFLECTION_PROMPTS[Math.floor(Math.random() * REFLECTION_PROMPTS.length)];
  }, []);

  const isCrit = item.severity === 'critical';
  const isGen = item.severity === 'general';

  const statusColor = isCrit ? 'rose' : isGen ? 'amber' : 'emerald';
  const badgeText = isCrit ? 'Critical' : isGen ? 'General' : 'Minor';

  const colors = {
    rose: { border: 'border-l-rose-500', badge: 'bg-rose-100 text-rose-700', text: 'text-rose-600', highlight: 'bg-rose-100 text-rose-800 border-rose-200' },
    amber: { border: 'border-l-amber-500', badge: 'bg-amber-100 text-amber-700', text: 'text-amber-600', highlight: 'bg-amber-100 text-amber-800 border-amber-200' },
    emerald: { border: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-600', highlight: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  }[statusColor];

  const { before, match, after } = useMemo(() => {
    return getSentenceContext(fullEssay, item.original);
  }, [fullEssay, item.original]);

  const hasContext = before || after;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 overflow-hidden transition-all duration-300 mb-4
        ${colors.border} ${isExpanded ? 'ring-1 ring-slate-200 shadow-md' : 'hover:shadow-md cursor-pointer'}`}
      onClick={() => !isExpanded && setIsExpanded(true)}
    >
      {/* 1. Header & Stage 1 (Context) */}
      <div className="p-4 md:p-5">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${colors.badge}`}>
              {badgeText}
            </span>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide px-2 py-0.5 bg-slate-100 rounded">
              {item.category}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isExpanded && (
              <span className="hidden sm:inline-block text-[10px] font-medium text-slate-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 animate-pulse select-none">
                {reflectionPrompt}
              </span>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              {isExpanded ? '收起 (Collapse)' : '展开 (Analyze)'}
            </button>
          </div>
        </div>

        {/* Stage 1: Contextual Re-enactment */}
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-bold">1</span>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">语境重现 (Original Context)</h4>
          </div>
          <p className="pl-7 text-sm text-slate-700 leading-relaxed font-serif">
            {hasContext ? (
              <span>
                <span className="opacity-60">{before}</span>
                <span className={`font-bold px-1 rounded mx-0.5 border-b-2 ${colors.highlight}`}>
                  {match}
                </span>
                <span className="opacity-60">{after}</span>
              </span>
            ) : (
              <span className={`font-bold ${colors.text}`}>"{item.original}"</span>
            )}
          </p>
        </div>
      </div>

      {/* Expanded Content: Stage 2 & 3 */}
      {isExpanded && (
        <div className="bg-slate-50/50 border-t border-slate-100 p-4 md:p-5 space-y-5 animate-fade-in-up">

          {/* Stage 2: Cognitive Conflict */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">2</span>
              <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider">诊断分析 (Diagnosis)</h4>
            </div>
            <div className="pl-7 text-sm text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
              {item.explanation}
            </div>
          </div>

          {/* Stage 3: Elevation Suggestion */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold">3</span>
              <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider">升格表达 (Refinement)</h4>
            </div>
            <div className="pl-7">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-900 font-medium text-sm font-serif leading-relaxed">
                {item.revised}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// CritiqueAccordion
const CritiqueAccordion: React.FC<{ title: string; items: SentenceCritique[]; colorClass: string; fullEssay: string }> = ({ title, items, colorClass, fullEssay }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (items.length === 0) return null;

  const severityWeight = { critical: 0, general: 1, minor: 2 };
  const sortedItems = [...items].sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity]);

  return (
    <div className={`border border-slate-200 bg-white rounded-xl overflow-hidden transition-all duration-300 mb-4 shadow-sm ${isOpen ? 'ring-1 ring-indigo-50 border-indigo-200' : 'hover:border-slate-300'}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-4 flex items-center justify-between transition-colors ${isOpen ? 'bg-slate-50/50' : 'bg-white hover:bg-slate-50'}`}
      >
        <div className="flex items-center gap-3">
          <h3 className={`font-serif font-bold text-lg ${colorClass}`}>{title}</h3>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
            {items.length} issues
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!isOpen && sortedItems.some(i => i.severity === 'critical') && (
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
              {sortedItems.filter(i => i.severity === 'critical').length} Critical
            </span>
          )}
          <span className={`text-slate-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
            ▼
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="p-4 border-t border-slate-100 space-y-4 animate-fade-in-up bg-white">
          <div className="flex justify-end">
            <span className="text-[10px] text-slate-400 italic">
              * Issues are sorted by severity (Critical first)
            </span>
          </div>
          {sortedItems.map((item, idx) => (
            <CritiqueCard key={idx} item={item} index={idx} fullEssay={fullEssay} />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Structured & Highlightable Essay Component ---
const StructuredEssayRenderer: React.FC<{
  fullEssay: string,
  contrastPoints: ContrastivePoint[],
  activeIndex: number | null
}> = ({ fullEssay, contrastPoints, activeIndex }) => {

  // 1. Split essay into sections based on tags
  const splitRegex = /(\[[A-Z_0-9]+\])/g;
  const rawParts = fullEssay.split(splitRegex);
  const parts = rawParts.filter(p => p.trim() !== '');

  // Map tag to friendly name
  const getSectionTitle = (tag: string) => {
    switch (tag) {
      case '[INTRODUCTION]': return '引入段 (Introduction)';
      case '[BODY_PARA_1]': return '主体段 1 (Body Para 1)';
      case '[BODY_PARA_2]': return '主体段 2 (Body Para 2)';
      case '[CONCLUSION]': return '总结段 (Conclusion)';
      default: return null;
    }
  };

  const renderTextWithHighlights = (text: string) => {
    // Split by <highlight id='x'>...</highlight> or <highlight id="x">...</highlight> tags
    // Support both single and double quotes for robustness
    const highlightSplitRegex = /(<highlight id=['"]?\d+['"]?>[\s\S]*?<\/highlight>)/g;
    const textParts = text.split(highlightSplitRegex);

    return (
      <span className="whitespace-pre-wrap">
        {textParts.map((part, i) => {
          // Check if this part is a highlight tag (support both quote types)
          const match = part.match(/<highlight id=['"]?(\d+)['"]?>([\s\S]*?)<\/highlight>/);

          if (match) {
            const id = parseInt(match[1]);
            const content = match[2];
            const isActive = activeIndex === id;

            return (
              <span
                key={i}
                id={`highlight-${id}`}
                className={`rounded px-1 transition-all duration-500 inline-block cursor-pointer border-b-2
                   ${isActive
                    ? 'bg-indigo-200 text-indigo-900 font-bold scale-105 shadow-sm ring-2 ring-indigo-300 border-indigo-400'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
              >
                {content}
              </span>
            );
          }

          // Fallback for plain text
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {parts.map((part, index) => {
        const sectionTitle = getSectionTitle(part);

        if (sectionTitle) {
          return (
            <div key={index} className="sticky top-0 bg-white/95 backdrop-blur z-20 py-2 border-b border-slate-100 -mx-8 px-8 mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded border border-slate-100 flex items-center gap-2 w-max">
                <span className="w-1.5 h-4 bg-indigo-400 rounded-full"></span>
                {sectionTitle}
              </span>
            </div>
          );
        } else {
          // It's the content text
          return (
            <div key={index} className="leading-loose text-slate-700 text-lg font-serif pl-2 border-l-4 border-slate-100 hover:border-indigo-100 transition-colors">
              {renderTextWithHighlights(part)}
            </div>
          );
        }
      })}
    </div>
  );
};

// --- Main Component ---

type ResultTab = 'overview' | 'critiques' | 'contrast' | 'practice';

const GradingReport: React.FC<GradingReportProps> = ({
  result: rawResult,
  essayText,
  topic,
  onBack,
  onSave,
  isSaved = false,
  isHistoryView = false
}) => {
  // 防御性数据处理：确保所有字段都有安全默认值，防止白屏崩溃
  const result = useMemo(() => {
    const r = rawResult || {} as any;
    return {
      ...r,
      totalScore: typeof r.totalScore === 'number' ? r.totalScore : 0,
      subScores: r.subScores || { content: 0, organization: 0, proficiency: 0, clarity: 0 },
      modelSubScores: r.modelSubScores,
      generalComment: r.generalComment || '暂无评语',
      issueOverview: r.issueOverview || { critical: [], general: [], minor: [] },
      critiques: Array.isArray(r.critiques) ? r.critiques : [],
      contrastiveLearning: Array.isArray(r.contrastiveLearning) ? r.contrastiveLearning : [],
      polishedEssay: r.polishedEssay || essayText || '',
      retraining: {
        exercises: Array.isArray(r.retraining?.exercises) ? r.retraining.exercises : [],
        materials: Array.isArray(r.retraining?.materials) ? r.retraining.materials : [],
      },
    };
  }, [rawResult, essayText]);

  const [activeTab, setActiveTab] = useState<ResultTab>('overview');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<{ status: 'pass' | 'partial' | 'fail', feedback: string } | null>(null);

  // Retraining Card Carousel State
  const [activeExercise, setActiveExercise] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [userInputs, setUserInputs] = useState<Record<number, string>>({});
  const [hintVisible, setHintVisible] = useState(false);

  const [activeContrastIndex, setActiveContrastIndex] = useState<number | null>(null);
  const essayScrollRef = useRef<HTMLDivElement>(null); // 右侧范文滚动容器 ref
  const [isNavVisible, setIsNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (Math.abs(currentScrollY - lastScrollY.current) < 10) return;
      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setIsNavVisible(false);
      } else {
        setIsNavVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (activeTab === 'practice') {
      setActiveExercise(0);
      setShowResult(false);
      setUserInputs({});
      setHintVisible(false);
    }
    if (activeTab === 'contrast') {
      setActiveContrastIndex(null);
    }
  }, [activeTab]);

  // 滚动到右侧范文对应高亮位置（优先文本匹配，id 作为兜底）
  const scrollToHighlight = (index: number, polishedContent?: string) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        const container = essayScrollRef.current;
        if (!container) return;

        const scrollToElement = (el: Element) => {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2);
          container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
        };

        // 策略 1：用 polishedContent 文本在范文 DOM 中搜索匹配
        // 注意：renderTextWithHighlights 会将文本拆分到多个 span 中，
        // 所以需要先收集所有文本节点及其在整体文本中的偏移量，再定位匹配位置
        if (polishedContent) {
          const cleanText = polishedContent.replace(/<\/?highlight[^>]*>/g, '').trim();
          // 尝试多种长度的搜索关键词，提高匹配概率
          const searchKeys = [
            cleanText.substring(0, 40),
            cleanText.substring(0, 25),
            cleanText.substring(0, 15),
          ].filter(k => k.length > 5);

          // 收集容器内所有文本节点及其在全文中的累计偏移
          const textNodes: { node: Text; offset: number }[] = [];
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
          let fullText = '';
          let node: Text | null;
          while ((node = walker.nextNode() as Text | null)) {
            textNodes.push({ node, offset: fullText.length });
            fullText += node.textContent || '';
          }

          // 依次尝试不同长度的关键词
          for (const searchKey of searchKeys) {
            const matchIndex = fullText.indexOf(searchKey);
            if (matchIndex !== -1) {
              // 找到匹配位置后，定位对应的文本节点
              for (let i = textNodes.length - 1; i >= 0; i--) {
                if (textNodes[i].offset <= matchIndex) {
                  const targetEl = textNodes[i].node.parentElement;
                  if (targetEl) {
                    scrollToElement(targetEl);
                    return;
                  }
                  break;
                }
              }
            }
          }
        }

        // 策略 2：兜底 — 使用 highlight-id 元素
        const el = document.getElementById(`highlight-${index}`);
        if (el && container.contains(el)) {
          scrollToElement(el);
        }
      }, 100);
    });
  };

  const getCritiquesByCategory = (category: CritiqueCategory) => {
    return (result?.critiques || []).filter(c => c.category === category);
  };

  const handleCopyMaterials = (materials: KeyMaterial[]) => {
    const text = materials.map(m =>
      `${m.wordOrPhrase}\n[释义] ${m.definition}\n[例句] ${m.example}`
    ).join('\n\n-------------------\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    });
  };

  const handleExportCSV = (materials: KeyMaterial[]) => {
    let csvContent = "\uFEFF";
    csvContent += "Expression,Meaning & Example\n";
    materials.forEach(m => {
      const front = `"${m.wordOrPhrase.replace(/"/g, '""')}"`;
      const back = `"${m.definition}\n\nExample: ${m.example.replace(/"/g, '""')}"`;
      csvContent += `${front},${back}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `vocabulary_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleNextExercise = () => {
    if (activeExercise < result.retraining.exercises.length - 1) {
      setActiveExercise(prev => prev + 1);
      setShowResult(false); // Reset for next
      setHintVisible(false);
    }
  };

  const handlePrevExercise = () => {
    if (activeExercise > 0) {
      setActiveExercise(prev => prev - 1);
      // We keep the state of previous cards if they were answered in userInputs
      // But visibility of result is reset for UX flow usually, or we can check if input exists
      setShowResult(!!userInputs[activeExercise - 1]);
      setHintVisible(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInputs(prev => ({ ...prev, [activeExercise]: e.target.value }));
  };
  const handleEvaluateAndCompare = async () => {
    const currentUserInput = userInputs[activeExercise];
    if (!currentUserInput?.trim()) return;

    setIsEvaluating(true);

    try {
      const currentExercise = result.retraining.exercises[activeExercise];

      // 调用 API 进行实时评价
      const assessment = await evaluateRetrainingAttempt(
        currentExercise.question,
        currentExercise.hint,
        currentUserInput
      );

      setEvalResult(assessment);
      setShowResult(true); // 拿到结果后再显示对比页
    } catch (e) {
      console.error("Evaluation failed", e);
      setShowResult(true); // 失败兜底：依然显示对比结果
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="animate-fade-in-up pb-12 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6 no-print px-4 md:px-0">
        <div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} className="md:hidden text-slate-400 hover:text-slate-600">← Back</button>
            )}
            <h2 className="text-2xl font-serif font-bold text-slate-800">批改报告</h2>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-900 text-xs font-bold uppercase rounded border border-blue-100">Grading Report</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Topic: {topic || 'Untitled'}</p>
        </div>
        <div className="flex gap-2">
          {onBack && (
            <button onClick={onBack} className="hidden md:block text-sm font-medium px-4 py-2 bg-white text-slate-500 rounded-lg border border-slate-200 hover:text-blue-900 hover:bg-slate-50 transition-all shadow-sm">
              ← Back to Input
            </button>
          )}
          {!isHistoryView && onSave && (
            <button onClick={onSave} disabled={isSaved} className={`text-sm font-medium px-4 py-2 rounded-lg border transition-all shadow-sm flex items-center gap-2 ${isSaved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-500 hover:text-blue-900 hover:bg-slate-50'}`}>
              {isSaved ? '✓ Saved' : '♥ Save Report'}
            </button>
          )}
        </div>
      </div>

      <div className="h-16 mb-6" aria-hidden="true" />

      <div className={`fixed top-20 left-0 right-0 z-40 transition-transform duration-300 no-print ${isNavVisible ? 'translate-y-0' : '-translate-y-[150%]'}`}>
        <div className="max-w-6xl mx-auto px-4 md:px-0">
          <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200 p-1 flex overflow-x-auto no-scrollbar">
            <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon="📊" label="评分概览" subLabel="Overview" />
            <TabButton active={activeTab === 'critiques'} onClick={() => setActiveTab('critiques')} icon="🔍" label="深度精批" subLabel="Critiques" />
            <TabButton active={activeTab === 'contrast'} onClick={() => setActiveTab('contrast')} icon="🔄" label="范文对比" subLabel="Contrast" />
            <TabButton active={activeTab === 'practice'} onClick={() => setActiveTab('practice')} icon="🏋️" label="学练一体" subLabel="Retraining" />
          </div>
        </div>
      </div>

      <div className="min-h-[400px]">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                <div className="text-center md:border-r border-slate-100">
                  <div className="inline-flex items-center justify-center w-36 h-36 rounded-full border-8 border-blue-50 bg-white relative mb-4 shadow-inner">
                    <span className="text-6xl font-bold text-blue-900 tracking-tighter">{result.totalScore}</span>
                    <span className="absolute bottom-6 text-xs text-slate-400 font-bold uppercase bg-white px-2 rounded">/ 15 Points</span>
                  </div>
                  <div className="text-sm font-bold text-slate-500 uppercase tracking-wider">总体得分 (Total Score)</div>
                </div>
                <div className="col-span-1 md:col-span-2 space-y-6">
                  <h3 className="font-serif font-bold text-lg text-slate-800 mb-2 border-b border-slate-50 pb-2">各项维度评分 (Sub-scores)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
                    <ScoreBar label="内容与思辨 (Content)" score={result.subScores.content} max={4} color="bg-purple-500" />
                    <ScoreBar label="组织与逻辑 (Organization)" score={result.subScores.organization} max={3} color="bg-amber-500" />
                    <ScoreBar label="语言纯熟度 (Proficiency)" score={result.subScores.proficiency} max={5} color="bg-blue-500" />
                    <ScoreBar label="表达清晰度 (Clarity)" score={result.subScores.clarity} max={3} color="bg-rose-500" />
                  </div>
                </div>
              </div>
              <div className="bg-indigo-50/50 p-6 border-t border-indigo-50 flex gap-4">
                <div className="text-4xl bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-sm">👨‍🏫</div>
                <div>
                  <h4 className="font-bold text-indigo-900 text-sm mb-1 uppercase tracking-wider">Professor's Comment</h4>
                  <p className="text-indigo-900/80 text-base leading-relaxed font-medium">"{result.generalComment}"</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['critical', 'general', 'minor'].map((severity) => {
                const config = {
                  critical: { color: 'rose', icon: '🔴', label: '严重问题' },
                  general: { color: 'amber', icon: '🟡', label: '一般问题' },
                  minor: { color: 'emerald', icon: '🟢', label: '轻微问题' }
                }[severity as 'critical' | 'general' | 'minor'];

                const issues = result.issueOverview?.[severity as 'critical' | 'general' | 'minor'] || [];

                return (
                  <div key={severity} className={`bg-white rounded-xl border border-${config.color}-100 shadow-sm p-5 border-t-4 border-t-${config.color}-500`}>
                    <h4 className={`text-${config.color}-700 font-bold text-sm uppercase mb-3 flex items-center gap-2`}>
                      <span className={`bg-${config.color}-100 p-1 rounded text-lg`}>{config.icon}</span> {config.label}
                    </h4>
                    {issues.length > 0 ? (
                      <ul className="space-y-2">
                        {issues.map((issue, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-start gap-2 leading-snug">
                            <span className={`text-${config.color}-400 mt-0.5`}>•</span> {issue}
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-xs text-slate-400 italic">None detected.</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CRITIQUES */}
        {activeTab === 'critiques' && (
          <div className="space-y-8 animate-fade-in-up">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-4 shadow-md">
              <span className="text-3xl">💡</span>
              <div>
                <h4 className="font-bold text-blue-800 mb-1">Interactive Learning Mode</h4>
                <p className="text-sm text-blue-800/80 leading-relaxed">
                  为了加深记忆，修改建议默认已隐藏。请先阅读 <b>Stage 1 (语境)</b>，思考如何修改，再点击卡片展开 <b>Stage 2 (诊断)</b> 和 <b>Stage 3 (升格)</b>。
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <CritiqueAccordion title="🗣️ 语言纯熟度 (Proficiency)" items={getCritiquesByCategory('Proficiency')} colorClass="text-blue-600" fullEssay={essayText} />
              <CritiqueAccordion title="📖 表达清晰度 (Clarity)" items={getCritiquesByCategory('Clarity')} colorClass="text-rose-600" fullEssay={essayText} />
              <CritiqueAccordion title="🧩 组织与逻辑 (Organization)" items={getCritiquesByCategory('Organization')} colorClass="text-amber-600" fullEssay={essayText} />
              <CritiqueAccordion title="📝 内容与思辨 (Content)" items={getCritiquesByCategory('Content')} colorClass="text-purple-600" fullEssay={essayText} />
            </div>
          </div>
        )}

        {/* TAB 3: CONTRAST (PYRAMID MODEL) */}
        {activeTab === 'contrast' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in-up h-[calc(100vh-140px)] min-h-[600px]">
            {/* LEFT: Contrast Points */}
            <div className="lg:col-span-5 flex flex-col h-full bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
              <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between shadow-sm z-10">
                <div>
                  <h3 className="font-serif font-bold text-lg text-slate-800">升格对比 (Pyramid Model)</h3>
                  <p className="text-xs text-slate-500">点击卡片查看右侧范文对应位置</p>
                </div>
                <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2 py-1 rounded">
                  {result.contrastiveLearning.length} Points
                </span>
              </div>

              <div className="overflow-y-auto custom-scrollbar p-4 space-y-4">
                {result.contrastiveLearning.map((pt, i) => {
                  const isActive = activeContrastIndex === i;
                  const config = {
                    'Language Foundation': { label: '语言地基 (Language)', icon: '🏛️', color: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50' },
                    'Logical Reasoning': { label: '逻辑链条 (Logic)', icon: '🔗', color: 'text-purple-600', border: 'border-purple-200', bg: 'bg-purple-50' },
                    'Strategic Intent': { label: '写作意图 (Strategy)', icon: '♟️', color: 'text-amber-600', border: 'border-amber-200', bg: 'bg-amber-50' },
                    'Rhetorical Structure': { label: '篇章技法 (Structure)', icon: '📐', color: 'text-orange-600', border: 'border-orange-200', bg: 'bg-orange-50' }
                  }[pt.category] || { label: '综合提升 (General)', icon: '✨', color: 'text-slate-600', border: 'border-slate-200', bg: 'bg-slate-50' };

                  return (
                    <div
                      key={i}
                      onClick={() => {
                        setActiveContrastIndex(i);
                        scrollToHighlight(i, pt.polishedContent);
                      }}
                      className={`rounded-xl border transition-all cursor-pointer relative overflow-hidden
                          ${isActive
                          ? `bg-white ring-2 ring-indigo-500 shadow-md transform scale-[1.02]`
                          : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'}`}
                    >
                      {/* Header */}
                      <div className={`px-4 py-2 border-b border-slate-100 flex justify-between items-center ${isActive ? 'bg-indigo-50/50' : 'bg-slate-50/50'}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{config.icon}</span>
                          <span className={`text-xs font-bold uppercase tracking-wider ${config.color}`}>{config.label}</span>
                        </div>
                        <span className="w-6 h-6 rounded-full bg-white text-slate-400 border border-slate-100 flex items-center justify-center text-xs font-bold shadow-sm">
                          {i + 1}
                        </span>
                      </div>

                      <div className="p-4 space-y-4">
                        {/* Comparison Block */}
                        <div className="grid grid-cols-1 gap-2 text-sm">
                          <div className="relative pl-3 border-l-2 border-slate-300">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">
                              [现状] Status Quo
                            </span>
                            <p className="text-slate-500 line-through decoration-slate-300 decoration-1 text-xs leading-relaxed">
                              {pt.userContent}
                            </p>
                          </div>
                          <div className="text-center text-indigo-300 text-lg leading-none">↓</div>
                          <div className="relative pl-3 border-l-2 border-emerald-400 bg-emerald-50/30 p-2 rounded-r">
                            <span className="text-[10px] text-emerald-600 uppercase font-bold block mb-0.5">
                              [升格] Elevation
                            </span>
                            <p className="text-emerald-900 font-medium font-serif text-sm leading-relaxed">
                              {pt.polishedContent.replace(/<\/?highlight[^>]*>/g, '')}
                            </p>
                          </div>
                        </div>

                        {/* Strategy Analysis (3-Part) */}
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-indigo-500">💡</span>
                            <span className="font-bold text-slate-600 uppercase">专家复盘</span>
                          </div>
                          <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {pt.analysis}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: Structured Polished Essay */}
            <div className="lg:col-span-7 flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
              <div className="p-4 bg-white border-b border-slate-100 shadow-sm z-10 flex justify-between items-center sticky top-0 bg-opacity-95 backdrop-blur">
                <div className="flex items-center gap-4">
                  <h3 className="font-serif font-bold text-lg text-slate-800 flex items-center gap-2">
                    <span>🌟</span> 满分范文 (Band 14-15)
                  </h3>
                  {/* NEW: Mini Radar Chart Comparison */}
                  <MiniRadar studentScores={result.subScores} modelScores={result.modelSubScores} />
                </div>
                <button onClick={() => navigator.clipboard.writeText(result.polishedEssay)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded font-bold transition-colors">
                  Copy Text
                </button>
              </div>

              <div ref={essayScrollRef} className="overflow-y-auto custom-scrollbar p-8 bg-slate-50/30">
                <StructuredEssayRenderer
                  fullEssay={result.polishedEssay}
                  contrastPoints={result.contrastiveLearning}
                  activeIndex={activeContrastIndex}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRACTICE (Integrated Learning & Card Mode) */}
        {activeTab === 'practice' && (
          <div className="space-y-12 animate-fade-in-up">
            <div>
              <h3 className="font-serif font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
                <span>✍️</span> 学练一体：高阶技法克隆 (Skill Cloning)
              </h3>

              {result.retraining.exercises.length > 0 ? (
                <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden relative min-h-[500px] flex flex-col">
                  {/* Header: Progress & Type */}
                  <div className="bg-slate-50 px-8 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Card {activeExercise + 1} / {result.retraining.exercises.length}
                      </span>
                      <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-200">
                        {result.retraining.exercises[activeExercise].type}
                      </span>
                    </div>

                    <div className="flex gap-1">
                      {result.retraining.exercises.map((_, idx) => (
                        <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${idx === activeExercise ? 'w-8 bg-blue-900' : 'w-2 bg-slate-200'}`}></div>
                      ))}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-8 md:p-12 flex-grow flex flex-col">
                    <div key={activeExercise} className="animate-fade-in-up flex-grow flex flex-col">

                      {/* Breathing Lamp Hint */}
                      <div className="flex justify-end mb-4 relative">
                        <button
                          onClick={() => setHintVisible(!hintVisible)}
                          className="flex items-center gap-2 text-xs font-bold text-amber-500 hover:text-amber-600 transition-colors"
                        >
                          <span className={`text-xl ${!hintVisible ? 'animate-pulse' : ''}`}>💡</span>
                          {hintVisible ? 'Hide Expert Tip' : 'Need a Tip?'}
                        </button>
                        {hintVisible && (
                          <div className="absolute top-8 right-0 bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-lg text-xs shadow-lg w-64 z-20 animate-fade-in-up">
                            <strong>Expert Tip:</strong> {result.retraining.exercises[activeExercise].hint}
                          </div>
                        )}
                      </div>

                      <h4 className="text-xl font-bold text-slate-800 mb-6 leading-snug">
                        {result.retraining.exercises[activeExercise].question}
                      </h4>

                      {/* Original Context (If Available) */}
                      {result.retraining.exercises[activeExercise].originalContext && (
                        <div className="mb-6 bg-slate-50 border-l-4 border-slate-300 p-3 text-sm text-slate-600 italic rounded-r">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase not-italic mb-1">Target Context</span>
                          "{result.retraining.exercises[activeExercise].originalContext}"
                        </div>
                      )}
                      {result.retraining.exercises[activeExercise].mandatoryKeywords && result.retraining.exercises[activeExercise].mandatoryKeywords.length > 0 && (
                        <div className="mb-4 animate-fade-in-up">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-2 flex items-center gap-1">
                            <span>🗝️</span> 必须使用的词汇 (Mandatory Keywords)</span>
                          <div className="flex flex-wrap gap-2">
                            {result.retraining.exercises[activeExercise].mandatoryKeywords.map((kw, i) => (
                              <span
                                key={i}
                                onClick={() => handleInputChange({ target: { value: (userInputs[activeExercise] || '') + kw + ' ' } } as any)}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 rounded-lg text-sm font-bold font-mono cursor-pointer transition-colors shadow-sm select-none"
                                title="点击插入到输入框"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Interactive Area */}
                      {!showResult ? (
                        <div className="space-y-4 flex-grow flex flex-col">
                          <textarea
                            value={userInputs[activeExercise] || ''}
                            onChange={handleInputChange}
                            placeholder="在此尝试应用范文技法进行改写..."
                            className="w-full h-32 p-4 bg-slate-50 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none resize-none text-slate-700 transition-all placeholder-slate-400 text-sm"
                          />


                          <button
                            onClick={handleEvaluateAndCompare}
                            disabled={!userInputs[activeExercise]?.trim() || isEvaluating}
                            className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition-colors flex items-center justify-center gap-2 mt-auto
                                  ${!userInputs[activeExercise]?.trim() || isEvaluating
                                ? 'bg-slate-300 cursor-not-allowed'
                                : 'bg-blue-900 hover:bg-blue-950'}`}
                          >
                            {isEvaluating ? (
                              <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                <span>AI 正在阅卷 (Evaluating)...</span>
                              </>
                            ) : (
                              <><span>✨</span> 提交并对比 (Submit & Compare)</>
                            )}
                          </button>
                        </div>
                      ) : (
                        /* 3-Way Comparison Result */
                        <div className="animate-fade-in-up space-y-4 flex-grow">
                          {evalResult && (
                            <div className={`p-5 rounded-xl border-l-4 shadow-sm flex flex-col md:flex-row gap-4 items-start animate-fade-in-up
        ${evalResult.status === 'pass' ? 'bg-emerald-50 border-emerald-500' :
                                evalResult.status === 'partial' ? 'bg-amber-50 border-amber-500' :
                                  'bg-rose-50 border-rose-500'}`}>

                              <div className="flex-shrink-0">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2
              ${evalResult.status === 'pass' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' :
                                    evalResult.status === 'partial' ? 'bg-amber-100 border-amber-200 text-amber-600' :
                                      'bg-rose-100 border-rose-200 text-rose-600'}`}>
                                  {evalResult.status === 'pass' ? '🎉' : evalResult.status === 'partial' ? '🤔' : '💪'}
                                </div>
                              </div>

                              <div>
                                <h4 className={`font-bold text-base mb-1
              ${evalResult.status === 'pass' ? 'text-emerald-800' :
                                    evalResult.status === 'partial' ? 'text-amber-800' :
                                      'text-rose-800'}`}>
                                  {evalResult.status === 'pass' ? 'Perfect Execution! 策略应用完美' :
                                    evalResult.status === 'partial' ? 'Almost There! 策略应用尚有瑕疵' :
                                      'Needs Improvement 尚未掌握该策略'}
                                </h4>
                                <p className={`text-sm leading-relaxed
              ${evalResult.status === 'pass' ? 'text-emerald-700' :
                                    evalResult.status === 'partial' ? 'text-amber-700' :
                                      'text-rose-700'}`}>
                                  {evalResult.feedback}
                                </p>
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* User Input */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">你的改写 (Your Draft)</span>
                              <p className="text-slate-700 font-medium text-sm">{userInputs[activeExercise]}</p>
                            </div>
                            {/* Model Answer */}
                            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-2">范文参考 (Model Clone)</span>
                              <p className="text-emerald-900 font-serif text-sm">{result.retraining.exercises[activeExercise].referenceAnswer}</p>
                            </div>
                          </div>

                          {/* Explanation */}
                          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-900 leading-relaxed">
                            <span className="font-bold mr-2">🎯 认知跃升:</span>
                            {result.retraining.exercises[activeExercise].explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer: Navigation */}
                  <div className="bg-slate-50 px-8 py-5 border-t border-slate-100 flex justify-between mt-auto">
                    <button
                      onClick={handlePrevExercise}
                      disabled={activeExercise === 0}
                      className={`text-sm font-bold px-4 py-2 rounded-lg transition-colors ${activeExercise === 0 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-200'}`}
                    >
                      ← Previous
                    </button>

                    {/* Only show Next if Result is visible or if user wants to skip (maybe handle skip differently, but standard nav for now) */}
                    <button
                      onClick={handleNextExercise}
                      disabled={activeExercise === result.retraining.exercises.length - 1}
                      className={`text-sm font-bold px-6 py-2 rounded-lg transition-colors shadow-sm flex items-center gap-2
                           ${activeExercise === result.retraining.exercises.length - 1
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                          : showResult
                            ? 'bg-blue-900 text-white hover:bg-blue-950'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                    >
                      Next Challenge →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No exercises generated.
                </div>
              )}
            </div>

            {/* Materials Section (Kept as is) */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-serif font-bold text-lg text-slate-800 flex items-center gap-2">
                  <span>🔑</span> 必背语料 (Key Expressions)
                </h3>
                <div className="flex gap-2">
                  <button onClick={() => handleCopyMaterials(result.retraining.materials)} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded text-slate-600 font-bold transition-colors">{copyStatus === 'copied' ? 'Copied!' : 'Copy All'}</button>
                  <button onClick={() => handleExportCSV(result.retraining.materials)} className="text-xs bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded text-blue-900 font-bold transition-colors">Export CSV</button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                    <tr><th className="px-6 py-3">Expression</th><th className="px-6 py-3">Meaning</th><th className="px-6 py-3">Example</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.retraining.materials.map((m, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-blue-900">{m.wordOrPhrase}</td>
                        <td className="px-6 py-4 text-slate-600">{m.definition}</td>
                        <td className="px-6 py-4 text-slate-500 italic font-serif">"{m.example}"</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GradingReport;
