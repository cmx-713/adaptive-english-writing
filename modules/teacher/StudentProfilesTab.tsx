import React, { useState, useMemo } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import ThinkingProcessView from '../../components/ThinkingProcessView';

interface StudentProfilesTabProps {
    students: any[];
    essays: any[];
    drills: any[];
    scaffolds: any[];
    thinkingProcesses: any[];
    isLoading: boolean;
}

const StudentProfilesTab: React.FC<StudentProfilesTabProps> = ({ students, essays, drills, scaffolds, thinkingProcesses, isLoading }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<'name' | 'essays' | 'avg' | 'recent'>('recent');

    const studentProfiles = useMemo(() => {
        return students.map((s: any) => {
            const sEssays = essays.filter((e: any) => e.user_id === s.id);
            const sDrills = drills.filter((d: any) => d.user_id === s.id);
            const sScaffolds = scaffolds.filter((sc: any) => sc.user_id === s.id);
            const sThinkingProcesses = thinkingProcesses.filter((tp: any) => tp.user_id === s.id);
            const avgScore = sEssays.length > 0
                ? +(sEssays.reduce((sum: number, e: any) => sum + (e.total_score || 0), 0) / sEssays.length).toFixed(1)
                : 0;
            const lastActive = [...sEssays, ...sDrills, ...sScaffolds]
                .map((r: any) => new Date(r.created_at).getTime())
                .sort((a, b) => b - a)[0] || new Date(s.created_at).getTime();

            // 四维平均
            const dims = ['content_score', 'organization_score', 'proficiency_score', 'clarity_score'];
            const dimLabels = ['内容 (/4)', '组织 (/3)', '语言 (/5)', '清晰 (/3)'];
            const dimFullMarks = [4, 3, 5, 3];
            const radarData = dimLabels.map((label, i) => ({
                subject: label,
                个人: sEssays.length > 0 ? +(sEssays.reduce((sum: number, e: any) => sum + (e[dims[i]] || 0), 0) / sEssays.length).toFixed(1) : 0,
                班级: essays.length > 0 ? +(essays.reduce((sum: number, e: any) => sum + (e[dims[i]] || 0), 0) / essays.length).toFixed(1) : 0,
                fullMark: dimFullMarks[i],
            }));

            // 常见错误
            const errorCounts: Record<string, number> = {};
            sEssays.forEach((e: any) => {
                if (e.critiques && Array.isArray(e.critiques)) {
                    e.critiques.forEach((c: any) => {
                        const cat = c.category || 'Other';
                        errorCounts[cat] = (errorCounts[cat] || 0) + 1;
                    });
                }
            });
            const topErrors = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

            return {
                ...s,
                essayCount: sEssays.length,
                drillCount: sDrills.length,
                scaffoldCount: sScaffolds.length,
                avgScore,
                lastActive,
                radarData,
                topErrors,
                scores: sEssays.map((e: any) => e.total_score || 0).reverse(),
                thinkingProcesses: sThinkingProcesses,
                thinkingProcessCount: sThinkingProcesses.length,
            };
        });
    }, [students, essays, drills, scaffolds, thinkingProcesses]);

    const sortedProfiles = useMemo(() => {
        const sorted = [...studentProfiles];
        switch (sortKey) {
            case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
            case 'essays': sorted.sort((a, b) => b.essayCount - a.essayCount); break;
            case 'avg': sorted.sort((a, b) => b.avgScore - a.avgScore); break;
            case 'recent': sorted.sort((a, b) => b.lastActive - a.lastActive); break;
        }
        return sorted;
    }, [studentProfiles, sortKey]);

    if (isLoading) {
        return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-4 border-[#1e2d4a] border-t-transparent rounded-full"></div></div>;
    }

    return (
        <div className="space-y-4 animate-fade-in-up">
            {/* 排序 */}
            <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <span className="text-sm text-slate-500 font-medium">排序：</span>
                {[
                    { key: 'recent', label: '最近活跃' },
                    { key: 'avg', label: '平均分' },
                    { key: 'essays', label: '批改次数' },
                    { key: 'name', label: '姓名' },
                ].map(opt => (
                    <button key={opt.key} onClick={() => setSortKey(opt.key as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${sortKey === opt.key ? 'bg-[#1e2d4a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >{opt.label}</button>
                ))}
            </div>

            {/* 学生列表 */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 font-bold text-slate-600">姓名</th>
                            <th className="text-left py-3 px-4 font-bold text-slate-600">学号</th>
                            <th className="text-center py-3 px-4 font-bold text-slate-600">批改</th>
                            <th className="text-center py-3 px-4 font-bold text-slate-600">特训</th>
                            <th className="text-center py-3 px-4 font-bold text-slate-600">平均分</th>
                            <th className="text-center py-3 px-4 font-bold text-slate-600">最近活跃</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedProfiles.map((s) => (
                            <React.Fragment key={s.id}>
                                <tr
                                    className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                                >
                                    <td className="py-3 px-4 font-medium text-slate-800">
                                        <span className="mr-2">{expandedId === s.id ? '▼' : '▶'}</span>
                                        {s.name}
                                    </td>
                                    <td className="py-3 px-4 text-slate-500 font-mono text-xs">{s.student_id}</td>
                                    <td className="py-3 px-4 text-center">{s.essayCount}</td>
                                    <td className="py-3 px-4 text-center">{s.drillCount}</td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`font-bold ${s.avgScore >= 12 ? 'text-emerald-600' : s.avgScore >= 9 ? 'text-blue-600' : s.avgScore >= 6 ? 'text-amber-600' : 'text-rose-600'}`}>
                                            {s.avgScore || '-'}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center text-xs text-slate-400">
                                        {new Date(s.lastActive).toLocaleDateString('zh-CN')}
                                    </td>
                                </tr>

                                {/* 展开详情 */}
                                {expandedId === s.id && (
                                    <tr>
                                        <td colSpan={6} className="bg-slate-50 p-6">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                {/* 雷达图 */}
                                                <div className="bg-white rounded-xl border border-slate-200 p-4">
                                                    <h4 className="text-sm font-bold text-slate-700 mb-2">🎯 能力对比（个人 vs 班级）</h4>
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <RadarChart data={s.radarData}>
                                                            <PolarGrid stroke="#e2e8f0" />
                                                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#475569' }} />
                                                            <PolarRadiusAxis domain={[0, 5]} tick={false} />
                                                            <Radar name="个人" dataKey="个人" stroke="#1e2d4a" fill="#1e2d4a" fillOpacity={0.3} strokeWidth={2} />
                                                            <Radar name="班级" dataKey="班级" stroke="#94a3b8" fill="none" strokeWidth={1} strokeDasharray="5 5" />
                                                            <Tooltip />
                                                        </RadarChart>
                                                    </ResponsiveContainer>
                                                </div>

                                                {/* 分数趋势 */}
                                                <div className="bg-white rounded-xl border border-slate-200 p-4">
                                                    <h4 className="text-sm font-bold text-slate-700 mb-2">📈 成绩趋势</h4>
                                                    {s.scores.length > 0 ? (
                                                        <div className="flex items-end gap-1 h-[180px] pt-4">
                                                            {s.scores.map((score: number, i: number) => (
                                                                <div key={i} className="flex-1 flex flex-col items-center justify-end">
                                                                    <span className="text-[10px] text-slate-500 mb-1">{score}</span>
                                                                    <div
                                                                        className={`w-full rounded-t-md transition-all ${score >= 12 ? 'bg-emerald-400' : score >= 9 ? 'bg-blue-400' : score >= 6 ? 'bg-amber-400' : 'bg-rose-400'}`}
                                                                        style={{ height: `${(score / 15) * 140}px` }}
                                                                    ></div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="h-[180px] flex items-center justify-center text-slate-400 text-sm">暂无数据</div>
                                                    )}
                                                </div>

                                                {/* 错误类型 + 完成度 */}
                                                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                                                    <div>
                                                        <h4 className="text-sm font-bold text-slate-700 mb-2">⚠️ 常见问题</h4>
                                                        {s.topErrors.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {s.topErrors.map(([name, count]: [string, number], i: number) => (
                                                                    <span key={i} className="px-2 py-1 bg-rose-50 text-rose-700 text-xs rounded-full font-medium">
                                                                        {name} ({count})
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">暂无</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-bold text-slate-700 mb-2">📋 模块完成度</h4>
                                                        <div className="space-y-2 text-xs">
                                                            <div className="flex justify-between"><span className="text-slate-600">🧠 思维训练</span><span className="font-bold">{s.scaffoldCount} 次</span></div>
                                                            <div className="flex justify-between"><span className="text-slate-600">✍️ 作文批改</span><span className="font-bold">{s.essayCount} 次</span></div>
                                                            <div className="flex justify-between"><span className="text-slate-600">🏋️ 句子特训</span><span className="font-bold">{s.drillCount} 次</span></div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 思维训练过程 */}
                                                {s.thinkingProcesses && s.thinkingProcesses.length > 0 && (
                                                    <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-4">
                                                        <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                                            🧠 思维训练过程
                                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">
                                                                {s.thinkingProcessCount} 次
                                                            </span>
                                                        </h4>
                                                        <ThinkingProcessView processes={s.thinkingProcesses} />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
                {sortedProfiles.length === 0 && (
                    <div className="text-center text-slate-400 py-12">暂无学生数据</div>
                )}
            </div>
        </div>
    );
};

export default StudentProfilesTab;
