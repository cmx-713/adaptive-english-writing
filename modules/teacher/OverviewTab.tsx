import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Cell, LabelList,
} from 'recharts';

interface OverviewTabProps {
    students: any[];
    essays: any[];
    drills: any[];
    scaffolds: any[];
    isLoading: boolean;
    selectedClass?: string;
    allStudents?: any[];
    allEssays?: any[];
}

const StatCard: React.FC<{
    label: string; value: string | number; icon: string; sub?: string; accent?: string;
}> = ({ label, value, icon, sub, accent = 'bg-[#1e2d4a]' }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-4">
            <div className={`w-12 h-12 ${accent} rounded-xl flex items-center justify-center text-2xl shadow-sm`}>
                {icon}
            </div>
            {sub && <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full font-bold">{sub}</span>}
        </div>
        <div className="text-3xl font-bold text-slate-800 font-serif">{value}</div>
        <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
);

// 班级颜色映射（固定 4 个班）
const CLASS_COLORS: Record<string, string> = {
    '2024级A甲6': '#1e2d4a',
    '2024级A乙6': '#3b82f6',
    '2025级A甲2': '#10b981',
    '2025级A乙2': '#f59e0b',
};
const getClassColor = (cls: string) => CLASS_COLORS[cls] || '#94a3b8';

const OverviewTab: React.FC<OverviewTabProps> = ({
    students, essays, drills, scaffolds, isLoading,
    selectedClass = 'all', allStudents = [], allEssays = [],
}) => {
    // 班级对比数据（只在"全部班级"视图下计算）
    const classComparisonData = useMemo(() => {
        if (selectedClass !== 'all' || allStudents.length === 0) return [];
        const classMap: Record<string, { studentIds: Set<string>; essays: any[] }> = {};
        allStudents.forEach((s: any) => {
            const cls = s.class_name || '未分班';
            if (!classMap[cls]) classMap[cls] = { studentIds: new Set(), essays: [] };
            classMap[cls].studentIds.add(s.id);
        });
        allEssays.forEach((e: any) => {
            Object.values(classMap).forEach((v) => {
                if (v.studentIds.has(e.user_id)) v.essays.push(e);
            });
        });
        return Object.entries(classMap)
            .map(([cls, { studentIds, essays: cEssays }]) => ({
                班级: cls,
                学生人数: studentIds.size,
                平均分: cEssays.length > 0
                    ? +(cEssays.reduce((s: number, e: any) => s + (e.total_score || 0), 0) / cEssays.length).toFixed(1)
                    : 0,
                批改篇数: cEssays.length,
            }))
            .sort((a, b) => a.班级.localeCompare(b.班级));
    }, [selectedClass, allStudents, allEssays]);

    // 计算统计数据
    const stats = useMemo(() => {
        const totalStudents = students.length;
        const totalEssays = essays.length;
        const totalDrills = drills.length;
        const avgScore = essays.length > 0
            ? (essays.reduce((sum: number, e: any) => sum + (e.total_score || 0), 0) / essays.length).toFixed(1)
            : '0';

        // 成绩分布
        const scoreDistribution = [
            { range: '0-5', count: 0, fill: '#ef4444' },
            { range: '6-8', count: 0, fill: '#f59e0b' },
            { range: '9-11', count: 0, fill: '#3b82f6' },
            { range: '12-15', count: 0, fill: '#10b981' },
        ];
        essays.forEach((e: any) => {
            const s = e.total_score || 0;
            if (s <= 5) scoreDistribution[0].count++;
            else if (s <= 8) scoreDistribution[1].count++;
            else if (s <= 11) scoreDistribution[2].count++;
            else scoreDistribution[3].count++;
        });

        // 四维雷达
        const radarData = essays.length > 0 ? [
            { subject: '内容 Content (/4)', score: +(essays.reduce((s: number, e: any) => s + (e.content_score || 0), 0) / essays.length).toFixed(1), fullMark: 4 },
            { subject: '组织 Organization (/3)', score: +(essays.reduce((s: number, e: any) => s + (e.organization_score || 0), 0) / essays.length).toFixed(1), fullMark: 3 },
            { subject: '语言 Proficiency (/5)', score: +(essays.reduce((s: number, e: any) => s + (e.proficiency_score || 0), 0) / essays.length).toFixed(1), fullMark: 5 },
            { subject: '清晰 Clarity (/3)', score: +(essays.reduce((s: number, e: any) => s + (e.clarity_score || 0), 0) / essays.length).toFixed(1), fullMark: 3 },
        ] : [];

        // 错误类型统计
        const errorCounts: Record<string, number> = {};
        essays.forEach((e: any) => {
            if (e.critiques && Array.isArray(e.critiques)) {
                e.critiques.forEach((c: any) => {
                    const cat = c.category || 'Other';
                    errorCounts[cat] = (errorCounts[cat] || 0) + 1;
                });
            }
        });
        const topErrors = Object.entries(errorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        // 近期动态
        const recentActivities = [
            ...essays.slice(0, 3).map((e: any) => ({
                type: '作文批改',
                icon: '✍️',
                name: e.wc_users?.name || '学生',
                detail: `${e.topic || '未知题目'} — ${e.total_score}分`,
                time: e.created_at,
            })),
            ...drills.slice(0, 2).map((d: any) => ({
                type: '句子特训',
                icon: '🏋️',
                name: d.wc_users?.name || '学生',
                detail: `${d.mode} — ${d.score}/${d.total_questions}`,
                time: d.created_at,
            })),
        ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5);

        return { totalStudents, totalEssays, totalDrills, avgScore, scoreDistribution, radarData, topErrors, recentActivities };
    }, [students, essays, drills, scaffolds]);

    const avgScoreLabel = selectedClass === 'all' ? '全体平均分' : `${selectedClass} 均分`;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin w-8 h-8 border-4 border-[#1e2d4a] border-t-transparent rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon="👥" value={stats.totalStudents} label="注册学生" sub="总计" />
                <StatCard icon="✍️" value={stats.totalEssays} label="批改篇数" sub="累计" accent="bg-blue-600" />
                <StatCard icon="📊" value={stats.avgScore} label={avgScoreLabel} sub="/15分" accent="bg-emerald-600" />
                <StatCard icon="🏋️" value={stats.totalDrills} label="特训次数" sub="累计" accent="bg-amber-600" />
            </div>

            {/* 班级横向对比（仅"全部班级"时显示） */}
            {selectedClass === 'all' && classComparisonData.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-1">🏫 班级横向对比</h3>
                    <p className="text-xs text-slate-400 mb-5">各班平均分（满分 15 分）与参与人数</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {classComparisonData.map((cls) => (
                            <div key={cls.班级} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getClassColor(cls.班级) }}></span>
                                    <span className="text-xs font-bold text-slate-700 truncate">{cls.班级}</span>
                                </div>
                                <div className="text-2xl font-bold font-serif text-slate-800">{cls.平均分 || '—'}</div>
                                <div className="text-[11px] text-slate-400 mt-1">{cls.学生人数} 人 · {cls.批改篇数} 篇</div>
                            </div>
                        ))}
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={classComparisonData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="班级" tick={{ fontSize: 11, fill: '#64748b' }} />
                            <YAxis domain={[0, 15]} tick={{ fontSize: 11, fill: '#64748b' }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                                formatter={(value: any, name: string) => [value, name]}
                            />
                            <Bar dataKey="平均分" name="平均分" radius={[8, 8, 0, 0]} maxBarSize={60}>
                                {classComparisonData.map((entry) => (
                                    <Cell key={entry.班级} fill={getClassColor(entry.班级)} />
                                ))}
                                <LabelList dataKey="平均分" position="top" style={{ fontSize: 12, fontWeight: 700, fill: '#475569' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* 图表区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 成绩分布 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">📊 成绩分布</h3>
                    {stats.scoreDistribution.some(d => d.count > 0) ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={stats.scoreDistribution}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#64748b' }} />
                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                                />
                                <Bar dataKey="count" name="人数" radius={[8, 8, 0, 0]}>
                                    {stats.scoreDistribution.map((entry, index) => (
                                        <rect key={index} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[250px] flex items-center justify-center text-slate-400">暂无数据</div>
                    )}
                </div>

                {/* 四维雷达 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">🎯 四维能力雷达</h3>
                    {stats.radarData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <RadarChart data={stats.radarData}>
                                <PolarGrid stroke="#e2e8f0" />
                                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#475569' }} />
                                <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Radar name="班级平均" dataKey="score" stroke="#1e2d4a" fill="#1e2d4a" fillOpacity={0.3} strokeWidth={2} />
                            </RadarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[250px] flex items-center justify-center text-slate-400">暂无数据</div>
                    )}
                </div>
            </div>

            {/* 底部两列 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 高频错误 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">⚠️ 常见错误类型 TOP 5</h3>
                    {stats.topErrors.length > 0 ? (
                        <div className="space-y-3">
                            {stats.topErrors.map((err, i) => {
                                const maxCount = stats.topErrors[0].count;
                                const pct = maxCount > 0 ? (err.count / maxCount) * 100 : 0;
                                return (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="text-xs font-mono text-slate-400 w-5">{i + 1}</span>
                                        <div className="flex-1">
                                            <div className="flex justify-between mb-1">
                                                <span className="text-sm font-medium text-slate-700">{err.name}</span>
                                                <span className="text-xs text-slate-500">{err.count} 次</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#1e2d4a] rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-slate-400 text-center py-8">暂无数据</div>
                    )}
                </div>

                {/* 近期动态 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">🕐 近期动态</h3>
                    {stats.recentActivities.length > 0 ? (
                        <div className="space-y-3">
                            {stats.recentActivities.map((act, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                                    <span className="text-lg">{act.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-slate-700">{act.name}</span>
                                            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{act.type}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5 truncate">{act.detail}</p>
                                    </div>
                                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                        {act.time ? new Date(act.time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-slate-400 text-center py-8">暂无动态</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OverviewTab;
