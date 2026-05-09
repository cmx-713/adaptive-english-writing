
import React, { useState, useEffect } from 'react';
import { analyzeCtrlScore, CtrlScore } from '../services/geminiService';
import { saveCtrlScore, markCtrlReviewed } from '../services/supabaseDataService';

interface ThinkingProcessViewProps {
    processes: any[];
    /** 写入 Supabase 成功后回调，用于教师端全局同步 thinkingProcesses，切换学生不丢 */
    onThinkingProcessCtrlSaved?: (processId: string, ctrlScore: CtrlScore) => void;
}

const CTRL_DIMS = [
    { key: 'opinionConsistency',  label: '观点一致性', weight: 25, color: '#3b82f6' },
    { key: 'argumentProgression', label: '论证递进性', weight: 30, color: '#10b981' },
    { key: 'linguisticAutonomy',  label: '语言自主性', weight: 25, color: '#f59e0b' },
    { key: 'thoughtExpansion',    label: '观点拓展度', weight: 20, color: '#8b5cf6' },
] as const;

const CtrlScorePanel: React.FC<{
    processId: string;
    ctrlScore: CtrlScore | null;
    processData: any;
    onCtrlPersisted?: (processId: string, next: CtrlScore) => void;
}> = ({ processId, ctrlScore, processData, onCtrlPersisted }) => {
    const [score, setScore] = useState<CtrlScore | null>(ctrlScore);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState('');
    const [isMarking, setIsMarking] = useState(false);

    useEffect(() => {
        setScore(ctrlScore);
    }, [ctrlScore]);

    const source: string = (score as any)?.source || 'teacher_manual';
    const reviewed: boolean = (score as any)?.reviewed === true;

    const handleMarkReviewed = async () => {
        setIsMarking(true);
        try {
            const { error: saveErr } = await markCtrlReviewed(processId);
            if (saveErr) {
                setError(typeof saveErr === 'object' && saveErr && 'message' in saveErr
                    ? String((saveErr as Error).message)
                    : '标记失败，请重试');
                return;
            }
            const next = score ? ({ ...score, reviewed: true } as CtrlScore & { reviewed?: boolean }) : score;
            if (next) {
                setScore(next);
                onCtrlPersisted?.(processId, next as CtrlScore);
            }
        } finally {
            setIsMarking(false);
        }
    };

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setError('');
        const prev = score;
        try {
            const result = await analyzeCtrlScore({
                topic: processData.topic,
                inspirationCards: processData.inspiration_cards || [],
                userIdeas: processData.user_ideas || {},
                validationResults: processData.validation_results || {},
                personalizedExpansions: processData.personalized_expansions || {},
                dimensionDrafts: processData.dimension_drafts || {},
                assembledEssay: processData.assembled_essay,
            });
            const prevAny = prev as any;
            const payload: CtrlScore & { source?: string; reviewed?: boolean } = {
                ...result,
                source: prevAny?.source ?? 'teacher_manual',
                reviewed: prevAny?.reviewed === true,
            };
            setScore(payload);
            const { error: saveErr } = await saveCtrlScore(processId, payload);
            if (saveErr) {
                setScore(prev);
                setError('保存到服务器失败，分数未更新，请检查网络后重试');
                console.error('[CtrlScorePanel] saveCtrlScore:', saveErr);
                return;
            }
            onCtrlPersisted?.(processId, payload);
        } catch (e: any) {
            setError(e?.message || '分析失败，请重试');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const totalColor = (t: number) =>
        t >= 8 ? '#10b981' : t >= 6 ? '#3b82f6' : t >= 4 ? '#f59e0b' : '#ef4444';

    if (!score) {
        return (
            <div className="mt-3 border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-slate-600">审辨信度分析</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            基于学生三阶段完整思维过程，AI 评估批判性思维表现
                        </p>
                    </div>
                    <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${isAnalyzing
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-[#1e2d4a] text-white hover:bg-[#162240] hover:-translate-y-0.5'
                        }`}
                    >
                        {isAnalyzing ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                AI 分析中...
                            </>
                        ) : '🔍 分析审辨信度'}
                    </button>
                </div>
                {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
            </div>
        );
    }

    return (
        <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden bg-white">
            {/* 标题栏 + 总分 */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-700">🔍 审辨信度</span>
                    {/* 来源标签 */}
                    {reviewed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                            ✓ 教师已复核
                        </span>
                    ) : source === 'auto' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            🤖 自动生成
                        </span>
                    ) : null}
                    <span className="text-[10px] text-slate-400">
                        {score.analyzedAt ? new Date(score.analyzedAt).toLocaleDateString('zh-CN') : ''}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-right">
                        <div className="text-2xl font-bold font-serif" style={{ color: totalColor(score.total) }}>
                            {score.total.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-slate-400">/ 10</div>
                    </div>
                    {/* 标记已复核按钮（仅自动生成且未复核时显示） */}
                    {source === 'auto' && !reviewed && (
                        <button
                            onClick={handleMarkReviewed}
                            disabled={isMarking}
                            className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium transition-colors disabled:opacity-50"
                        >
                            {isMarking ? '标记中...' : '✓ 标记已复核'}
                        </button>
                    )}
                    <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                        {isAnalyzing ? '分析中...' : '重新分析'}
                    </button>
                </div>
            </div>

            {/* 四维评分 */}
            <div className="p-4 space-y-3">
                {CTRL_DIMS.map(({ key, label, weight, color }) => {
                    const val = score[key as keyof CtrlScore] as number;
                    const expl = score.explanations?.[key as keyof typeof score.explanations] || '';
                    return (
                        <div key={key}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-700">{label}</span>
                                    <span className="text-[10px] text-slate-400">×{weight}%</span>
                                </div>
                                <span className="text-sm font-bold" style={{ color }}>
                                    {typeof val === 'number' ? val.toFixed(1) : '—'}
                                </span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${((val || 0) / 10) * 100}%`, backgroundColor: color }}
                                />
                            </div>
                            {expl && <p className="text-[11px] text-slate-500 leading-relaxed">{expl}</p>}
                        </div>
                    );
                })}
            </div>

            {/* 总体评语 */}
            {score.overallComment && (
                <div className="px-4 pb-4">
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">总体评语</p>
                        <p className="text-xs text-slate-600 leading-relaxed">{score.overallComment}</p>
                    </div>
                </div>
            )}

            {/* 公式说明 */}
            <div className="px-4 pb-3">
                        <p className="text-[10px] text-slate-300 text-center">
                            审辨信度 = 观点一致性×25% + 论证递进性×30% + 语言自主性×25% + 观点拓展度×20%
                        </p>
                        <p className="text-[10px] text-slate-300 text-center mt-0.5">
                            论证递进性考察：①中文观点→英语段落的展开质量；②多段落在终稿中的结构整合（过渡/引言/结论）
                        </p>
            </div>
        </div>
    );
};

const ThinkingProcessView: React.FC<ThinkingProcessViewProps> = ({ processes, onThinkingProcessCtrlSaved }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    if (!processes || processes.length === 0) {
        return (
            <div className="text-center text-slate-400 py-6 text-sm">
                暂无思维训练过程数据
            </div>
        );
    }

    const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
        in_progress: { label: '进行中', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: '⏳' },
        completed: { label: '已完成', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '✅' },
        sent_to_grader: { label: '已送批改', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: '📝' },
    };

    const validationStatusConfig: Record<string, { icon: string; color: string }> = {
        exceptional: { icon: '🌟', color: 'text-purple-700 bg-purple-50 border-purple-200' },
        valid: { icon: '✅', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
        weak: { icon: '💡', color: 'text-amber-700 bg-amber-50 border-amber-200' },
        off_topic: { icon: '🧭', color: 'text-rose-700 bg-rose-50 border-rose-200' },
    };

    return (
        <div className="space-y-3">
            {processes.map((proc: any) => {
                const isExpanded = expandedId === proc.id;
                const effectiveCtrl =
                    proc.ctrl_score && typeof proc.ctrl_score === 'object' ? proc.ctrl_score : null;
                const status = statusConfig[proc.status] || statusConfig.in_progress;
                const cards = proc.inspiration_cards || [];
                const userIdeas = proc.user_ideas || {};
                const validations = proc.validation_results || {};
                const expansions = proc.personalized_expansions || {};
                const drafts = proc.dimension_drafts || {};
                const assembled = proc.assembled_essay;

                // 计算完成阶段数
                const hasIdeas = Object.keys(userIdeas).length > 0;
                const hasValidations = Object.keys(validations).length > 0;
                const hasDrafts = Object.keys(drafts).length > 0;
                const hasEssay = !!assembled;
                const stages = [hasIdeas, hasValidations, hasDrafts, hasEssay].filter(Boolean).length;

                return (
                    <div key={proc.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        {/* Header - clickable */}
                        <div
                            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => setExpandedId(isExpanded ? null : proc.id)}
                        >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <span className={`text-xs transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-800 text-sm truncate">{proc.topic}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                        {new Date(proc.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {/* 阶段进度 */}
                                <div className="flex gap-0.5">
                                    {['构思', '追问', '支架', '成文'].map((label, i) => (
                                        <div
                                            key={i}
                                            className={`w-1.5 h-4 rounded-full transition-colors ${i < stages ? 'bg-[#1e2d4a]' : 'bg-slate-200'}`}
                                            title={label}
                                        />
                                    ))}
                                </div>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.color}`}>
                                    {status.icon} {status.label}
                                </span>
                            </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                            <div className="border-t border-slate-100 px-4 py-4 space-y-4 animate-fade-in-up">
                                {/* 审辨信度面板 */}
                                <CtrlScorePanel
                                    processId={proc.id}
                                    ctrlScore={effectiveCtrl}
                                    processData={proc}
                                    onCtrlPersisted={(id, next) => onThinkingProcessCtrlSaved?.(id, next)}
                                />
                                {/* 时间线 */}
                                <div className="relative">
                                    {/* 竖线 */}
                                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200" />

                                    {/* Phase 1: 观点构思 */}
                                    <TimelineSection
                                        icon="💡"
                                        title="Phase 1: 观点构思"
                                        subtitle={`${cards.length} 个维度卡片`}
                                        isActive={hasIdeas}
                                    >
                                        {cards.length > 0 && (
                                            <div className="space-y-3">
                                                {cards.map((card: any) => {
                                                    const idea = userIdeas[card.id];
                                                    const validation = validations[card.id];
                                                    const expansion = expansions[card.id];
                                                    const vConfig = validation ? validationStatusConfig[validation.status] : null;

                                                    return (
                                                        <div key={card.id} className="border border-slate-100 rounded-lg p-3 bg-white">
                                                            {/* 维度名称 */}
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-bold text-slate-600">{card.dimension}</span>
                                                                {validation && vConfig && (
                                                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${vConfig.color}`}>
                                                                        {vConfig.icon} {validation.feedbackTitle}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* 学生观点 */}
                                                            {idea ? (
                                                                <div className="bg-blue-50 rounded p-2 mb-2">
                                                                    <span className="text-[10px] font-bold text-blue-500 uppercase block mb-0.5">学生观点</span>
                                                                    <p className="text-xs text-blue-900 leading-relaxed">{idea}</p>
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs text-slate-300 italic mb-2">（未填写）</p>
                                                            )}

                                                            {/* AI 验证反馈 */}
                                                            {validation && (
                                                                <div className={`rounded p-2 mb-2 border ${vConfig?.color || ''}`}>
                                                                    <span className="text-[10px] font-bold uppercase block mb-0.5 opacity-70">苏格拉底反馈</span>
                                                                    <p className="text-xs leading-relaxed opacity-90">{validation.analysis}</p>
                                                                </div>
                                                            )}

                                                            {/* 个性化拓展 */}
                                                            {expansion && expansion.length > 0 && (
                                                                <div className="bg-teal-50 rounded p-2 border border-teal-100">
                                                                    <span className="text-[10px] font-bold text-teal-600 uppercase block mb-1">个性化思路拓展</span>
                                                                    <ul className="space-y-0.5">
                                                                        {expansion.map((point: string, i: number) => (
                                                                            <li key={i} className="text-xs text-teal-800 flex items-start gap-1">
                                                                                <span className="text-teal-400 mt-0.5">•</span>
                                                                                <span>{point}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </TimelineSection>

                                    {/* Phase 2: 语言支架 + 草稿 */}
                                    <TimelineSection
                                        icon="🏗️"
                                        title="Phase 2: 语言支架 + 草稿"
                                        subtitle={`${Object.keys(drafts).length} 个维度有草稿`}
                                        isActive={hasDrafts}
                                    >
                                        {Object.keys(drafts).length > 0 ? (
                                            <div className="space-y-3">
                                                {Object.values(drafts).map((d: any) => (
                                                    <div key={d.cardId || d.dimension} className="border border-slate-100 rounded-lg p-3 bg-white">
                                                        <div className="text-xs font-bold text-slate-600 mb-2">{d.dimension}</div>

                                                        {/* 语言支架摘要 */}
                                                        {d.scaffoldData && (
                                                            <div className="bg-amber-50 rounded p-2 mb-2 border border-amber-100">
                                                                <span className="text-[10px] font-bold text-amber-600 uppercase block mb-1">语言支架</span>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {(d.scaffoldData.vocabulary || []).slice(0, 4).map((v: any, i: number) => (
                                                                        <span key={i} className="px-1.5 py-0.5 bg-white text-amber-700 text-[10px] rounded border border-amber-200">
                                                                            {typeof v === 'string' ? v : v.word || v.en}
                                                                        </span>
                                                                    ))}
                                                                    {(d.scaffoldData.vocabulary || []).length > 4 && (
                                                                        <span className="text-[10px] text-amber-400">+{(d.scaffoldData.vocabulary || []).length - 4} more</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* 学生草稿 */}
                                                        {d.draft ? (
                                                            <div className="bg-slate-50 rounded p-2 border border-slate-100">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">学生草稿</span>
                                                                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{d.draft}</p>
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-slate-300 italic">（未写草稿）</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-300 italic">（未进入该阶段）</p>
                                        )}
                                    </TimelineSection>

                                    {/* Phase 3: 组合成文 */}
                                    <TimelineSection
                                        icon="📄"
                                        title="Phase 3: 组合成文"
                                        subtitle={hasEssay ? '已完成' : '未到达'}
                                        isActive={hasEssay}
                                        isLast
                                    >
                                        {assembled ? (
                                            <div className="border border-slate-100 rounded-lg p-3 bg-white space-y-2">
                                                {assembled.introduction && (
                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Introduction</span>
                                                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{assembled.introduction}</p>
                                                    </div>
                                                )}
                                                {assembled.bodyParagraphs && assembled.bodyParagraphs.map((p: any, i: number) => (
                                                    <div key={i}>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">
                                                            Body — {p.dimension}
                                                        </span>
                                                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{p.draft}</p>
                                                    </div>
                                                ))}
                                                {assembled.conclusion && (
                                                    <div>
                                                        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Conclusion</span>
                                                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{assembled.conclusion}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-300 italic">（未到达该阶段）</p>
                                        )}
                                    </TimelineSection>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// 时间线节点组件
const TimelineSection: React.FC<{
    icon: string;
    title: string;
    subtitle: string;
    isActive: boolean;
    isLast?: boolean;
    children: React.ReactNode;
}> = ({ icon, title, subtitle, isActive, isLast, children }) => (
    <div className={`relative pl-8 ${isLast ? '' : 'pb-4'}`}>
        {/* 圆点 */}
        <div className={`absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center text-xs z-10 ${isActive ? 'bg-[#1e2d4a] text-white shadow-sm' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
            {icon}
        </div>
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-2">
            <h5 className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{title}</h5>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${isActive ? 'bg-slate-100 text-slate-500' : 'text-slate-300'}`}>{subtitle}</span>
        </div>
        {/* 内容 */}
        <div className="ml-0">
            {children}
        </div>
    </div>
);

export default ThinkingProcessView;
