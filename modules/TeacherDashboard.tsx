import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import {
    getAllStudents, getAllEssayGrades, getAllDrillHistory,
    getAllScaffoldHistory, getAgentUsageSummary, getAllThinkingProcesses,
    updateStudentClass, getExternalUsers, getBatchCtrlCandidates, saveCtrlScore,
} from '../services/supabaseDataService';
import { analyzeCtrlScore } from '../services/geminiService';
// 批量审辨信度生成 Modal
const BatchCtrlModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const CLASSES = ['2024级A甲6', '2024级A乙6', '2025级A甲2', '2025级A乙2'];
    const [selectedClass, setSelectedClass] = useState('');
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [done, setDone] = useState(0);
    const [failed, setFailed] = useState(0);
    const [finished, setFinished] = useState(false);
    const abortRef = useState({ cancelled: false })[0];

    const handleSelectClass = async (cls: string) => {
        setSelectedClass(cls);
        setCandidates([]);
        setFinished(false);
        setProgress(0);
        if (!cls) return;
        setLoadingCandidates(true);
        const { data } = await getBatchCtrlCandidates(cls);
        setCandidates(data || []);
        setLoadingCandidates(false);
    };

    const handleStart = async () => {
        if (candidates.length === 0) return;
        setRunning(true);
        setProgress(0);
        setDone(0);
        setFailed(0);
        abortRef.cancelled = false;

        for (let i = 0; i < candidates.length; i++) {
            if (abortRef.cancelled) break;
            const rec = candidates[i];
            try {
                const result = await analyzeCtrlScore({
                    topic: rec.topic || '',
                    inspirationCards: rec.inspiration_cards || [],
                    userIdeas: rec.user_ideas || {},
                    validationResults: rec.validation_results || {},
                    personalizedExpansions: rec.personalized_expansions || {},
                    dimensionDrafts: rec.dimension_drafts || {},
                    assembledEssay: rec.assembled_essay,
                });
                await saveCtrlScore(rec.id, { ...result, source: 'auto', reviewed: false });
                setDone(d => d + 1);
            } catch {
                setFailed(f => f + 1);
            }
            setProgress(i + 1);
            // 避免请求过于密集，每条间隔 1.5s
            if (i < candidates.length - 1) await new Promise(r => setTimeout(r, 1500));
        }
        setRunning(false);
        setFinished(true);
    };

    const handleStop = () => { abortRef.cancelled = true; };

    const pct = candidates.length > 0 ? Math.round((progress / candidates.length) * 100) : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 overflow-hidden">
                <div className="bg-[#1e2d4a] text-white px-6 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-lg">批量生成历史审辨信度</h2>
                        <p className="text-white/60 text-xs mt-0.5">对已完成组合成文但尚未分析的记录批量生成</p>
                    </div>
                    <button onClick={onClose} disabled={running} className="text-white/60 hover:text-white text-xl disabled:opacity-30">✕</button>
                </div>

                <div className="p-6 space-y-5">
                    {/* 班级选择 */}
                    <div>
                        <p className="text-sm font-bold text-slate-600 mb-2">选择班级</p>
                        <div className="grid grid-cols-2 gap-2">
                            {CLASSES.map(cls => (
                                <button key={cls}
                                    onClick={() => handleSelectClass(cls)}
                                    disabled={running}
                                    className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left ${selectedClass === cls ? 'bg-[#1e2d4a] text-white border-[#1e2d4a]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                    {cls}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 待分析记录数 */}
                    {selectedClass && (
                        <div className={`rounded-xl p-4 border ${loadingCandidates ? 'bg-slate-50 border-slate-200' : candidates.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                            {loadingCandidates ? (
                                <p className="text-sm text-slate-500 flex items-center gap-2">
                                    <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                    正在统计待分析记录...
                                </p>
                            ) : candidates.length > 0 ? (
                                <p className="text-sm font-medium text-amber-800">
                                    📋 {selectedClass} 共有 <strong>{candidates.length}</strong> 条记录待分析
                                </p>
                            ) : (
                                <p className="text-sm font-medium text-emerald-700">✅ {selectedClass} 所有记录均已分析</p>
                            )}
                        </div>
                    )}

                    {/* 进度条 */}
                    {(running || finished) && (
                        <div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                                <span>{finished ? '分析完成' : `正在分析 ${progress} / ${candidates.length}`}</span>
                                <span>{pct}%</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${finished ? 'bg-emerald-500' : 'bg-[#1e2d4a]'}`}
                                    style={{ width: `${pct}%` }} />
                            </div>
                            {finished && (
                                <p className="text-xs text-slate-500 mt-2 text-center">
                                    ✅ 成功 {done} 条 {failed > 0 ? `· ⚠️ 失败 ${failed} 条` : ''}
                                </p>
                            )}
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex gap-3 pt-2">
                        {!running && !finished && (
                            <button onClick={handleStart}
                                disabled={candidates.length === 0 || loadingCandidates}
                                className="flex-1 py-3 rounded-xl font-bold text-white bg-[#1e2d4a] hover:bg-[#162240] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                🚀 开始批量分析
                            </button>
                        )}
                        {running && (
                            <button onClick={handleStop}
                                className="flex-1 py-3 rounded-xl font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all">
                                ⏹ 停止
                            </button>
                        )}
                        {finished && (
                            <button onClick={onClose}
                                className="flex-1 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all">
                                完成，关闭
                            </button>
                        )}
                        {!running && !finished && (
                            <button onClick={onClose} className="px-5 py-3 rounded-xl text-slate-500 hover:bg-slate-100 transition-all">取消</button>
                        )}
                    </div>

                    <p className="text-[10px] text-slate-400 text-center">每条记录间隔 1.5 秒，请保持页面开启直到完成</p>
                </div>
            </div>
        </div>
    );
};

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

    // ── CSV 导出工具 ──────────────────────────────
    const downloadCSV = (rows: string[][], filename: string) => {
        const BOM = '\uFEFF'; // Excel 正确显示中文
        const csv = BOM + rows.map(r =>
            r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
        ).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    };

    // 导出①：学生学习汇总（当前班级筛选）
    const exportStudentSummary = () => {
        const studentMap: Record<string, any> = {};
        filtered.students.forEach((s: any) => { studentMap[s.id] = s; });

        const rows: string[][] = [
            ['姓名', '学号', '班级', '作文批改次数', '平均分', '最高分', '最低分', '句子特训次数', '思维训练次数', '审辨信度均分'],
        ];

        filtered.students.forEach((s: any) => {
            const sEssays = filtered.essays.filter((e: any) => e.user_id === s.id);
            const sDrills = filtered.drills.filter((d: any) => d.user_id === s.id);
            const sProcesses = filtered.thinkingProcesses.filter((t: any) => t.user_id === s.id);
            const scores = sEssays.map((e: any) => e.total_score || 0);
            const avg = scores.length > 0 ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : '';
            const max = scores.length > 0 ? Math.max(...scores) : '';
            const min = scores.length > 0 ? Math.min(...scores) : '';
            const ctrlScores = sProcesses.filter((t: any) => t.ctrl_score?.total != null).map((t: any) => t.ctrl_score.total);
            const ctrlAvg = ctrlScores.length > 0 ? (ctrlScores.reduce((a: number, b: number) => a + b, 0) / ctrlScores.length).toFixed(1) : '';
            rows.push([s.name, s.student_id, s.class_name || '', String(sEssays.length), String(avg), String(max), String(min), String(sDrills.length), String(sProcesses.length), String(ctrlAvg)]);
        });

        const label = selectedClass === 'all' ? '全部班级' : selectedClass;
        downloadCSV(rows, `学生学习汇总_${label}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.csv`);
    };

    // 导出②：审辨信度明细（仅已分析记录）
    const exportCtrlScores = () => {
        const studentMap: Record<string, any> = {};
        filtered.students.forEach((s: any) => { studentMap[s.id] = s; });

        const rows: string[][] = [
            ['姓名', '学号', '班级', '写作题目', '完成状态', '观点一致性', '论证递进性', '语言自主性', '观点拓展度', '审辨信度总分', '分析时间', '观点一致性评语', '论证递进性评语', '语言自主性评语', '观点拓展度评语', '总体评语'],
        ];

        filtered.thinkingProcesses
            .filter((t: any) => t.ctrl_score?.total != null)
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .forEach((t: any) => {
                const s = studentMap[t.user_id] || {};
                const cs = t.ctrl_score;
                rows.push([
                    s.name || '', s.student_id || '', s.class_name || '',
                    t.topic || '', t.status || '',
                    String(cs.opinionConsistency ?? ''), String(cs.argumentProgression ?? ''),
                    String(cs.linguisticAutonomy ?? ''), String(cs.thoughtExpansion ?? ''),
                    String(cs.total ?? ''),
                    cs.analyzedAt ? new Date(cs.analyzedAt).toLocaleString('zh-CN') : '',
                    cs.explanations?.opinionConsistency || '',
                    cs.explanations?.argumentProgression || '',
                    cs.explanations?.linguisticAutonomy || '',
                    cs.explanations?.thoughtExpansion || '',
                    cs.overallComment || '',
                ]);
            });

        if (rows.length === 1) { alert('当前筛选范围内暂无已分析的审辨信度记录'); return; }
        const label = selectedClass === 'all' ? '全部班级' : selectedClass;
        downloadCSV(rows, `审辨信度明细_${label}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.csv`);
    };

    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showBatchCtrl, setShowBatchCtrl] = useState(false);

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
                    <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                        {/* 批量审辨信度 */}
                        <button
                            onClick={() => setShowBatchCtrl(true)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold bg-purple-500 text-white hover:bg-purple-600 transition-all shadow-sm"
                        >
                            🔍 批量审辨信度
                        </button>

                        {/* 导出按钮 */}
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(v => !v)}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-sm"
                            >
                                📥 导出数据
                            </button>
                            {showExportMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                                    <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-slate-200 py-1 min-w-[160px]">
                                        <button
                                            onClick={() => { exportStudentSummary(); setShowExportMenu(false); }}
                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium"
                                        >
                                            👥 学生学习汇总
                                        </button>
                                        <button
                                            onClick={() => { exportCtrlScores(); setShowExportMenu(false); }}
                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium"
                                        >
                                            🔍 审辨信度明细
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
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

            {/* 批量审辨信度 Modal */}
            {showBatchCtrl && <BatchCtrlModal onClose={() => setShowBatchCtrl(false)} />}

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
