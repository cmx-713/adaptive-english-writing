import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import {
    getAllStudents, getAllEssayGrades, getAllDrillHistory,
    getAllScaffoldHistory, getAgentUsageSummary, getAllThinkingProcesses,
    updateStudentClass, getExternalUsers,
} from '../services/supabaseDataService';
// 外校用户列表组件（内联）
const ExternalUsersTab: React.FC<{ users: any[]; isLoading: boolean }> = ({ users, isLoading }) => {
    const [search, setSearch] = useState('');
    const filtered = users.filter(u =>
        u.name?.includes(search) || u.school?.includes(search) || u.email?.includes(search)
    );
    if (isLoading) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-4 border-[#1e2d4a] border-t-transparent rounded-full" /></div>;
    return (
        <div className="space-y-5 animate-fade-in-up">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">🌐 外校注册用户</h2>
                    <p className="text-sm text-slate-500 mt-0.5">共 <strong>{users.length}</strong> 位外校用户注册，仅可使用学生端功能，无法访问教师后台。</p>
                </div>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="搜索姓名 / 学校 / 邮箱"
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:border-[#1e2d4a]/30 w-56" />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-3 px-4 font-bold text-slate-600">姓名</th>
                            <th className="text-left py-3 px-4 font-bold text-slate-600">学校 / 学院</th>
                            <th className="text-left py-3 px-4 font-bold text-slate-600">邮箱</th>
                            <th className="text-center py-3 px-4 font-bold text-slate-600">注册时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((u, i) => (
                            <tr key={u.id || i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                <td className="py-3 px-4 font-medium text-slate-800">{u.name}</td>
                                <td className="py-3 px-4 text-slate-600">{u.school || <span className="text-slate-300">—</span>}</td>
                                <td className="py-3 px-4 text-slate-500 font-mono text-xs">{u.email}</td>
                                <td className="py-3 px-4 text-center text-xs text-slate-400">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && (
                    <div className="text-center text-slate-400 py-12">
                        {users.length === 0 ? '暂无外校用户注册' : '没有匹配的结果'}
                    </div>
                )}
            </div>
        </div>
    );
};

import OverviewTab from './teacher/OverviewTab';

// 预定义的班级列表（固定，不依赖数据库动态提取）
const PREDEFINED_CLASSES = ['2024级A甲6', '2024级A乙6', '2025级A甲2', '2025级A乙2'];
import AnalyticsTab from './teacher/AnalyticsTab';
import StudentProfilesTab from './teacher/StudentProfilesTab';
import EssayGalleryTab from './teacher/EssayGalleryTab';
import UsageTab from './teacher/UsageTab';

type TeacherTab = 'overview' | 'analytics' | 'students' | 'essays' | 'usage' | 'external';

interface TeacherDashboardProps {
    user: User;
    onLogout: () => void;
}

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
    const [activeTab, setActiveTab] = useState<TeacherTab>('overview');
    const [isLoading, setIsLoading] = useState(true);
    const [students, setStudents] = useState<any[]>([]);
    const [essays, setEssays] = useState<any[]>([]);
    const [drills, setDrills] = useState<any[]>([]);
    const [scaffolds, setScaffolds] = useState<any[]>([]);
    const [usageLogs, setUsageLogs] = useState<any[]>([]);
    const [thinkingProcesses, setThinkingProcesses] = useState<any[]>([]);
    const [externalUsers, setExternalUsers] = useState<any[]>([]);

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            try {
                const [studentsRes, essaysRes, drillsRes, scaffoldsRes, usageRes, thinkingRes, externalRes] = await Promise.all([
                    getAllStudents(),
                    getAllEssayGrades(500),
                    getAllDrillHistory(500),
                    getAllScaffoldHistory(500),
                    getAgentUsageSummary(),
                    getAllThinkingProcesses(500),
                    getExternalUsers(),
                ]);
                setStudents(studentsRes.data || []);
                setEssays(essaysRes.data || []);
                setDrills(drillsRes.data || []);
                setScaffolds(scaffoldsRes.data || []);
                setUsageLogs(usageRes.data || []);
                setThinkingProcesses(thinkingRes.data || []);
                setExternalUsers(externalRes.data || []);
            } catch (err) {
                console.error('[Teacher] 数据加载失败:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAll();
    }, []);

    // 班级过滤
    const [selectedClass, setSelectedClass] = useState<string>('all');

    // 固定使用预定义班级列表，不依赖数据库动态提取
    const classList = PREDEFINED_CLASSES;

    // 教师在后台直接为学生分配班级
    const handleUpdateStudentClass = async (userId: string, className: string) => {
        const { error } = await updateStudentClass(userId, className || null);
        if (!error) {
            setStudents(prev => prev.map((s: any) =>
                s.id === userId ? { ...s, class_name: className || null } : s
            ));
        }
    };

    // 根据选中班级过滤所有数据
    const filtered = useMemo(() => {
        if (selectedClass === 'all') {
            return { students, essays, drills, scaffolds, thinkingProcesses, usageLogs };
        }
        const filteredStudents = students.filter((s: any) => s.class_name === selectedClass);
        const studentIds = new Set(filteredStudents.map((s: any) => s.id));
        return {
            students: filteredStudents,
            essays: essays.filter((e: any) => studentIds.has(e.user_id)),
            drills: drills.filter((d: any) => studentIds.has(d.user_id)),
            scaffolds: scaffolds.filter((s: any) => studentIds.has(s.user_id)),
            thinkingProcesses: thinkingProcesses.filter((t: any) => studentIds.has(t.user_id)),
            usageLogs: usageLogs.filter((u: any) => studentIds.has(u.user_id)),
        };
    }, [selectedClass, students, essays, drills, scaffolds, thinkingProcesses, usageLogs]);

    const tabs: { key: TeacherTab; label: string; icon: string }[] = [
        { key: 'overview', label: '教学概览', icon: '📊' },
        { key: 'analytics', label: '学情分析', icon: '📈' },
        { key: 'students', label: '学生档案', icon: '👤' },
        { key: 'essays', label: '作文详情', icon: '📝' },
        { key: 'usage', label: '使用统计', icon: '🔥' },
        { key: 'external', label: '外校用户', icon: '🌐' },
    ];

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            {/* Header */}
            <header className="bg-[#1e2d4a] text-white sticky top-0 z-50 shadow-lg">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-serif font-bold text-lg backdrop-blur-sm">
                            C
                        </div>
                        <div>
                            <h1 className="font-serif font-bold text-lg tracking-tight">
                                CET Coach <span className="text-white/60 text-sm font-normal">教师端</span>
                            </h1>
                        </div>
                    </div>

                    {/* User */}
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-sm font-bold">{user.name}</div>
                            <div className="text-[10px] text-white/50">教师</div>
                        </div>
                        <button
                            onClick={onLogout}
                            className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg transition-colors font-medium"
                        >
                            退出
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="max-w-7xl mx-auto px-4">
                    <nav className="flex gap-1 -mb-px overflow-x-auto">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-5 py-3 text-sm font-bold whitespace-nowrap transition-all border-b-2 ${activeTab === tab.key
                                    ? 'border-white text-white'
                                    : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/30'
                                    }`}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-7xl mx-auto px-4 py-8">

                {/* 当前班级 Banner */}
                <div className="mb-6 flex items-center gap-3 px-5 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${selectedClass === 'all' ? 'bg-slate-400' : 'bg-[#1e2d4a]'}`}></div>
                    <span className="text-sm font-bold text-slate-700">
                        {selectedClass === 'all' ? '全部班级' : selectedClass}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-sm text-slate-500">
                        {filtered.students.length} 名学生
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-sm text-slate-500">
                        {filtered.essays.length} 篇作文
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-sm text-slate-500">
                        {filtered.drills.length} 次特训
                    </span>
                    {selectedClass !== 'all' && (
                        <>
                            <span className="text-slate-300">·</span>
                            <span className="text-sm text-slate-500">
                                均分 <strong className="text-slate-700">
                                    {filtered.essays.length > 0
                                        ? (filtered.essays.reduce((s: number, e: any) => s + (e.total_score || 0), 0) / filtered.essays.length).toFixed(1)
                                        : '—'}
                                </strong> / 15
                            </span>
                        </>
                    )}
                    <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                        <span className="text-xs text-slate-400 mr-1">筛选班级：</span>
                        <button
                            onClick={() => setSelectedClass('all')}
                            className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${selectedClass === 'all'
                                ? 'bg-[#1e2d4a] text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            全部
                        </button>
                        {classList.map(cls => (
                            <button
                                key={cls}
                                onClick={() => setSelectedClass(cls)}
                                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${selectedClass === cls
                                    ? 'bg-[#1e2d4a] text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {cls}
                            </button>
                        ))}
                    </div>
                </div>

                {activeTab === 'overview' && (
                    <OverviewTab
                        students={filtered.students} essays={filtered.essays}
                        drills={filtered.drills} scaffolds={filtered.scaffolds}
                        isLoading={isLoading}
                        selectedClass={selectedClass}
                        allStudents={students}
                        allEssays={essays}
                    />
                )}
                {activeTab === 'analytics' && (
                    <AnalyticsTab essays={filtered.essays} students={filtered.students} isLoading={isLoading} />
                )}
                {activeTab === 'students' && (
                    <StudentProfilesTab
                        students={filtered.students} essays={filtered.essays}
                        drills={filtered.drills} scaffolds={filtered.scaffolds}
                        thinkingProcesses={filtered.thinkingProcesses}
                        isLoading={isLoading}
                        selectedClass={selectedClass}
                        onUpdateStudentClass={handleUpdateStudentClass}
                    />
                )}
                {activeTab === 'essays' && (
                    <EssayGalleryTab essays={filtered.essays} isLoading={isLoading} />
                )}
                {activeTab === 'usage' && (
                    <UsageTab essays={filtered.essays} drills={filtered.drills} scaffolds={filtered.scaffolds} usageLogs={filtered.usageLogs} isLoading={isLoading} />
                )}
                {activeTab === 'external' && (
                    <ExternalUsersTab users={externalUsers} isLoading={isLoading} />
                )}
            </main>

            {/* Footer */}
            <footer className="border-t border-slate-200 py-6 text-center">
                <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold">
                    Adaptive English Writing Coach — Teacher Dashboard
                </p>
            </footer>
        </div>
    );
};

export default TeacherDashboard;
