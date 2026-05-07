import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import {
    getAllStudents, getAllEssayGrades, getAllDrillHistory,
    getAllScaffoldHistory, getAgentUsageSummary, getAllThinkingProcesses,
    updateStudentClass,
} from '../services/supabaseDataService';

// 预定义的班级列表（固定，不依赖数据库动态提取）
const PREDEFINED_CLASSES = ['2024级A甲6', '2024级A乙6', '2025级A甲2', '2025级A乙2'];
import OverviewTab from './teacher/OverviewTab';
import AnalyticsTab from './teacher/AnalyticsTab';
import StudentProfilesTab from './teacher/StudentProfilesTab';
import EssayGalleryTab from './teacher/EssayGalleryTab';
import UsageTab from './teacher/UsageTab';

type TeacherTab = 'overview' | 'analytics' | 'students' | 'essays' | 'usage';

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

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            try {
                const [studentsRes, essaysRes, drillsRes, scaffoldsRes, usageRes, thinkingRes] = await Promise.all([
                    getAllStudents(),
                    getAllEssayGrades(500),
                    getAllDrillHistory(500),
                    getAllScaffoldHistory(500),
                    getAgentUsageSummary(),
                    getAllThinkingProcesses(500),
                ]);
                setStudents(studentsRes.data || []);
                setEssays(essaysRes.data || []);
                setDrills(drillsRes.data || []);
                setScaffolds(scaffoldsRes.data || []);
                setUsageLogs(usageRes.data || []);
                setThinkingProcesses(thinkingRes.data || []);
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
                        {/* 班级选择器 */}
                        <select
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            className="bg-white/10 text-white text-sm font-medium rounded-lg px-3 py-1.5 border border-white/20 outline-none hover:bg-white/20 transition-colors appearance-none cursor-pointer"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='white' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1em 1em', paddingRight: '2rem' }}
                        >
                            <option value="all" style={{ color: '#1e293b' }}>全部班级</option>
                            {classList.map(c => (
                                <option key={c} value={c} style={{ color: '#1e293b' }}>{c}</option>
                            ))}
                        </select>
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
                    <div className="ml-auto flex gap-1.5 flex-wrap justify-end">
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
                        <button
                            onClick={() => setSelectedClass('all')}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${selectedClass === 'all'
                                ? 'bg-slate-700 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            全部
                        </button>
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
