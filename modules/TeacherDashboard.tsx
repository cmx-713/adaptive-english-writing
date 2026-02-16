import React, { useState, useEffect } from 'react';
import { User } from '../types';
import {
    getAllStudents, getAllEssayGrades, getAllDrillHistory,
    getAllScaffoldHistory, getAgentUsageSummary,
} from '../services/supabaseDataService';
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

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            try {
                const [studentsRes, essaysRes, drillsRes, scaffoldsRes, usageRes] = await Promise.all([
                    getAllStudents(),
                    getAllEssayGrades(500),
                    getAllDrillHistory(500),
                    getAllScaffoldHistory(500),
                    getAgentUsageSummary(),
                ]);
                setStudents(studentsRes.data || []);
                setEssays(essaysRes.data || []);
                setDrills(drillsRes.data || []);
                setScaffolds(scaffoldsRes.data || []);
                setUsageLogs(usageRes.data || []);
            } catch (err) {
                console.error('[Teacher] 数据加载失败:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAll();
    }, []);

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
                {activeTab === 'overview' && (
                    <OverviewTab students={students} essays={essays} drills={drills} scaffolds={scaffolds} isLoading={isLoading} />
                )}
                {activeTab === 'analytics' && (
                    <AnalyticsTab essays={essays} students={students} isLoading={isLoading} />
                )}
                {activeTab === 'students' && (
                    <StudentProfilesTab students={students} essays={essays} drills={drills} scaffolds={scaffolds} isLoading={isLoading} />
                )}
                {activeTab === 'essays' && (
                    <EssayGalleryTab essays={essays} isLoading={isLoading} />
                )}
                {activeTab === 'usage' && (
                    <UsageTab essays={essays} drills={drills} scaffolds={scaffolds} usageLogs={usageLogs} isLoading={isLoading} />
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
