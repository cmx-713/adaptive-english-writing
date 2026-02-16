import React, { useMemo } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    BarChart, Bar,
} from 'recharts';

interface UsageTabProps {
    essays: any[];
    drills: any[];
    scaffolds: any[];
    usageLogs: any[];
    isLoading: boolean;
}

const COLORS = ['#1e2d4a', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];

const UsageTab: React.FC<UsageTabProps> = ({ essays, drills, scaffolds, usageLogs, isLoading }) => {
    const stats = useMemo(() => {
        // 模块使用占比
        const moduleData = [
            { name: '🧠 思维训练', value: scaffolds.length },
            { name: '✍️ 作文批改', value: essays.length },
            { name: '🏋️ 句子特训', value: drills.length },
        ].filter(d => d.value > 0);

        // 日活跃趋势（按天聚合所有记录）
        const dailyMap: Record<string, number> = {};
        [...essays, ...drills, ...scaffolds].forEach((r: any) => {
            const day = new Date(r.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
            dailyMap[day] = (dailyMap[day] || 0) + 1;
        });
        const dailyTrend = Object.entries(dailyMap)
            .map(([date, count]) => ({ date, 操作次数: count }))
            .slice(-14); // 最近 14 天

        // 功能使用排行（从 usage logs）
        const featureMap: Record<string, number> = {};
        usageLogs.forEach((log: any) => {
            const name = log.agent_name || 'unknown';
            featureMap[name] = (featureMap[name] || 0) + (log.actions_count || 1);
        });
        const featureRanking = Object.entries(featureMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name, 使用次数: count }));

        // 学习时长统计
        const totalDuration = usageLogs.reduce((s: number, l: any) => s + (l.session_duration || 0), 0);
        const avgDuration = usageLogs.length > 0 ? (totalDuration / usageLogs.length / 60).toFixed(1) : '0';
        const totalSessions = essays.length + drills.length + scaffolds.length;

        return { moduleData, dailyTrend, featureRanking, totalDuration, avgDuration, totalSessions };
    }, [essays, drills, scaffolds, usageLogs]);

    if (isLoading) {
        return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-4 border-[#1e2d4a] border-t-transparent rounded-full"></div></div>;
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* 统计卡片 */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-center">
                    <div className="text-3xl font-bold text-[#1e2d4a] font-serif">{stats.totalSessions}</div>
                    <div className="text-sm text-slate-500 mt-1">总操作次数</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-center">
                    <div className="text-3xl font-bold text-blue-600 font-serif">{stats.avgDuration}</div>
                    <div className="text-sm text-slate-500 mt-1">平均会话时长 (分钟)</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-center">
                    <div className="text-3xl font-bold text-emerald-600 font-serif">{(stats.totalDuration / 3600).toFixed(1)}</div>
                    <div className="text-sm text-slate-500 mt-1">总学习时长 (小时)</div>
                </div>
            </div>

            {/* 模块使用 + 日趋势 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 环形图 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">📊 模块使用占比</h3>
                    {stats.moduleData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie
                                    data={stats.moduleData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                >
                                    {stats.moduleData.map((_, index) => (
                                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[280px] flex items-center justify-center text-slate-400">暂无数据</div>
                    )}
                </div>

                {/* 日活趋势 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">📈 近 14 天活跃趋势</h3>
                    {stats.dailyTrend.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={stats.dailyTrend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                                <Area type="monotone" dataKey="操作次数" stroke="#1e2d4a" fill="#1e2d4a" fillOpacity={0.15} strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[280px] flex items-center justify-center text-slate-400">暂无数据</div>
                    )}
                </div>
            </div>

            {/* 功能排行 */}
            {stats.featureRanking.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-slate-800 mb-4">🏆 功能使用排行</h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, stats.featureRanking.length * 40)}>
                        <BarChart data={stats.featureRanking} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} width={150} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                            <Bar dataKey="使用次数" fill="#1e2d4a" radius={[0, 8, 8, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

export default UsageTab;
