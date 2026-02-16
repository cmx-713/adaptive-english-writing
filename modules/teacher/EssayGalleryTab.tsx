import React, { useState } from 'react';

interface EssayGalleryTabProps {
    essays: any[];
    isLoading: boolean;
}

const EssayGalleryTab: React.FC<EssayGalleryTabProps> = ({ essays, isLoading }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    if (isLoading) {
        return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-4 border-[#1e2d4a] border-t-transparent rounded-full"></div></div>;
    }

    return (
        <div className="space-y-4 animate-fade-in-up">
            {essays.length === 0 ? (
                <div className="text-center text-slate-400 py-20">暂无作文批改记录</div>
            ) : (
                essays.map((essay: any) => {
                    const isExpanded = expandedId === essay.id;
                    const studentName = essay.wc_users?.name || '未知学生';
                    const studentId = essay.wc_users?.student_id || '';

                    return (
                        <div key={essay.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
                            {/* 头部（始终显示） */}
                            <div
                                className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => setExpandedId(isExpanded ? null : essay.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                                    <div>
                                        <h4 className="font-bold text-slate-800">{essay.topic || '未知题目'}</h4>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {studentName} ({studentId}) · {new Date(essay.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className={`text-2xl font-bold font-serif ${(essay.total_score || 0) >= 12 ? 'text-emerald-600' :
                                        (essay.total_score || 0) >= 9 ? 'text-blue-600' :
                                            (essay.total_score || 0) >= 6 ? 'text-amber-600' : 'text-rose-600'
                                        }`}>
                                        {essay.total_score || 0}
                                    </div>
                                    <span className="text-xs text-slate-400">/15</span>
                                </div>
                            </div>

                            {/* 展开详情 */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 p-6 space-y-6">
                                    {/* 四维分数条 */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { label: '内容 Content', score: essay.content_score, max: 4, color: 'bg-blue-500' },
                                            { label: '组织 Organization', score: essay.organization_score, max: 3, color: 'bg-purple-500' },
                                            { label: '语言 Proficiency', score: essay.proficiency_score, max: 5, color: 'bg-emerald-500' },
                                            { label: '清晰 Clarity', score: essay.clarity_score, max: 3, color: 'bg-amber-500' },
                                        ].map((dim, i) => (
                                            <div key={i}>
                                                <div className="flex justify-between mb-1">
                                                    <span className="text-xs text-slate-600">{dim.label}</span>
                                                    <span className="text-xs font-bold text-slate-800">{dim.score || 0}/{dim.max}</span>
                                                </div>
                                                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full ${dim.color} rounded-full transition-all`} style={{ width: `${((dim.score || 0) / dim.max) * 100}%` }}></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* 总评 */}
                                    {essay.general_comment && (
                                        <div className="bg-slate-50 rounded-xl p-4">
                                            <h5 className="text-sm font-bold text-slate-700 mb-2">📋 总评</h5>
                                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{essay.general_comment}</p>
                                        </div>
                                    )}

                                    {/* 原文 vs 范文 */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <div className="bg-rose-50/50 rounded-xl p-4 border border-rose-100">
                                            <h5 className="text-sm font-bold text-rose-700 mb-2 flex items-center gap-2">
                                                <span className="w-2 h-2 bg-rose-400 rounded-full"></span>
                                                学生原文
                                            </h5>
                                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line font-serif">
                                                {essay.essay || '(无原文)'}
                                            </p>
                                        </div>
                                        <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
                                            <h5 className="text-sm font-bold text-emerald-700 mb-2 flex items-center gap-2">
                                                <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                                                升格范文
                                            </h5>
                                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line font-serif">
                                                {(essay.polished_essay || '(无范文)').replace(/\[.*?\]/g, '').replace(/<[^>]+>/g, '')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 关键批注 */}
                                    {essay.critiques && Array.isArray(essay.critiques) && essay.critiques.length > 0 && (
                                        <div>
                                            <h5 className="text-sm font-bold text-slate-700 mb-3">⚠️ 批改要点 ({essay.critiques.length})</h5>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                                {essay.critiques.slice(0, 6).map((c: any, i: number) => (
                                                    <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">{c.category}</span>
                                                        </div>
                                                        <p className="text-xs text-rose-600 line-through">{c.original}</p>
                                                        <p className="text-xs text-emerald-700 mt-1">→ {c.corrected}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default EssayGalleryTab;
