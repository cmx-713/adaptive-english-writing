import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';

interface AnalyticsTabProps {
    essays: any[];
    students: any[];
    isLoading: boolean;
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ essays, students, isLoading }) => {
    const analytics = useMemo(() => {
        // 分数区间分布
        const bands = [
            { range: '0-5 (待提高)', count: 0, fill: '#ef4444' },
            { range: '6-8 (基础)', count: 0, fill: '#f59e0b' },
            { range: '9-11 (良好)', count: 0, fill: '#3b82f6' },
            { range: '12-15 (优秀)', count: 0, fill: '#10b981' },
        ];
        essays.forEach((e: any) => {
            const s = e.total_score || 0;
            if (s <= 5) bands[0].count++;
            else if (s <= 8) bands[1].count++;
            else if (s <= 11) bands[2].count++;
            else bands[3].count++;
        });

        // 四维对比（班级 vs 满分参考线）
        const dims = ['content_score', 'organization_score', 'proficiency_score', 'clarity_score'];
        const dimLabels = ['内容 Content (/4)', '组织 Organization (/3)', '语言 Proficiency (/5)', '清晰 Clarity (/3)'];
        const dimFullMarks = [4, 3, 5, 3];
        const radarData = dimLabels.map((label, i) => {
            const avg = essays.length > 0
                ? +(essays.reduce((s: number, e: any) => s + (e[dims[i]] || 0), 0) / essays.length).toFixed(1)
                : 0;
            return { subject: label, 班级平均: avg, 满分标准: dimFullMarks[i] };
        });

        // 进步追踪：找出有 2+ 次批改的学生，比较首次和最后一次分数
        const userEssays: Record<string, any[]> = {};
        essays.forEach((e: any) => {
            const uid = e.user_id;
            if (!userEssays[uid]) userEssays[uid] = [];
            userEssays[uid].push(e);
        });
        const progressData: { name: string; first: number; latest: number; delta: number }[] = [];
        Object.entries(userEssays).forEach(([uid, arr]) => {
            if (arr.length >= 2) {
                const sorted = [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                const first = sorted[0].total_score || 0;
                const latest = sorted[sorted.length - 1].total_score || 0;
                const student = students.find((s: any) => s.id === uid);
                progressData.push({
                    name: student?.name || uid.slice(0, 6),
                    first,
                    latest,
                    delta: latest - first,
                });
            }
        });
        progressData.sort((a, b) => b.delta - a.delta);

        // 薄弱环节：每个学生的 4 维平均，找出低于班级平均的维度
        const weaknessCounts: Record<string, number> = {};
        const classAvgs = dims.map((d) =>
            essays.length > 0 ? essays.reduce((s: number, e: any) => s + (e[d] || 0), 0) / essays.length : 0
        );
        Object.entries(userEssays).forEach(([uid, arr]) => {
            dims.forEach((d, i) => {
                const studentAvg = arr.reduce((s: number, e: any) => s + (e[d] || 0), 0) / arr.length;
                if (studentAvg < classAvgs[i] * 0.8) {
                    weaknessCounts[dimLabels[i]] = (weaknessCounts[dimLabels[i]] || 0) + 1;
                }
            });
        });
        const weaknessData = dimLabels.map((label) => ({
            name: label,
            薄弱人数: weaknessCounts[label] || 0,
        }));

        return { bands, radarData, progressData, weaknessData };
    }, [essays, students]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin w-8 h-8 border-4 border-[#1e2d4a] border-t-transparent rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* 分数分布 + 四维雷达 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">📊 分数区间分布</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={analytics.bands}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748b' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                            <Bar dataKey="count" name="学生人数" radius={[8, 8, 0, 0]}>
                                {analytics.bands.map((entry, index) => (
                                    <rect key={index} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">🎯 四维能力 — 班级 vs 满分</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <RadarChart data={analytics.radarData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#475569' }} />
                            <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <Radar name="班级平均" dataKey="班级平均" stroke="#1e2d4a" fill="#1e2d4a" fillOpacity={0.3} strokeWidth={2} />
                            <Radar name="满分标准" dataKey="满分标准" stroke="#e2e8f0" fill="none" strokeWidth={1} strokeDasharray="5 5" />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 进步追踪 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">📈 进步追踪（多次批改学生）</h3>
                {analytics.progressData.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100">
                                    <th className="text-left py-3 px-4 font-bold text-slate-600">学生</th>
                                    <th className="text-center py-3 px-4 font-bold text-slate-600">首次得分</th>
                                    <th className="text-center py-3 px-4 font-bold text-slate-600">最新得分</th>
                                    <th className="text-center py-3 px-4 font-bold text-slate-600">变化</th>
                                    <th className="text-left py-3 px-4 font-bold text-slate-600 w-48">进步可视化</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.progressData.map((p, i) => (
                                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                        <td className="py-3 px-4 font-medium text-slate-800">{p.name}</td>
                                        <td className="py-3 px-4 text-center text-slate-600">{p.first}</td>
                                        <td className="py-3 px-4 text-center font-bold text-slate-800">{p.latest}</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${p.delta > 0 ? 'bg-emerald-50 text-emerald-700' : p.delta < 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {p.delta > 0 ? `↑ +${p.delta}` : p.delta < 0 ? `↓ ${p.delta}` : '→ 0'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 bg-slate-200 rounded-full flex-1 overflow-hidden">
                                                    <div className="h-full bg-slate-400 rounded-full" style={{ width: `${(p.first / 15) * 100}%` }}></div>
                                                </div>
                                                <span className="text-slate-400">→</span>
                                                <div className="h-2 bg-slate-200 rounded-full flex-1 overflow-hidden">
                                                    <div className={`h-full rounded-full ${p.delta > 0 ? 'bg-emerald-500' : 'bg-[#1e2d4a]'}`} style={{ width: `${(p.latest / 15) * 100}%` }}></div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-slate-400 text-center py-8">暂无多次批改数据，无法追踪进步</div>
                )}
            </div>

            {/* 薄弱环节 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">🔍 薄弱环节分析</h3>
                <p className="text-xs text-slate-500 mb-4">统计各维度中低于班级平均 80% 的学生人数</p>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={analytics.weaknessData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} width={120} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                        <Bar dataKey="薄弱人数" fill="#ef4444" radius={[0, 8, 8, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default AnalyticsTab;
