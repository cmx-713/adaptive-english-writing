
import React, { useState } from 'react';

interface ThinkingProcessViewProps {
    processes: any[];
}

const ThinkingProcessView: React.FC<ThinkingProcessViewProps> = ({ processes }) => {
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
