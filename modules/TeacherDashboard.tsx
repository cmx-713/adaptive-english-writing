import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from '../types';
import {
    getAllStudents, getAllEssayGrades, getAllDrillHistory,
    getAllScaffoldHistory, getAgentUsageSummary, getAllThinkingProcesses,
    updateStudentClass, getExternalUsers, getBatchCtrlCandidates, getBatchWritingTopics, saveCtrlScore, getActiveRosterClassLabels,
} from '../services/supabaseDataService';
import { analyzeCtrlScore, CtrlScore } from '../services/geminiService';
import type { ArgumentativeCtrlV2 } from '../services/argumentativeCtrlRubric';
import { isArgumentativeProcess } from '../services/argumentativeCtrlRubric';
import BatchArgumentativeCtrlV2Modal from '../components/BatchArgumentativeCtrlV2Modal';
import BatchTopicPicker, { type BatchTopicOption } from '../components/BatchTopicPicker';
import ProcessEvidenceExportModal from '../components/ProcessEvidenceExportModal';
import EssaySubmissionTab from './teacher/EssaySubmissionTab';

/** 本校固定班顺序 + 数据库已有 class_name（含外校虚拟班等），去重排序 */
function mergeTeacherClassOptions(predefined: string[], allUsers: any[]): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const c of predefined) {
        const t = (c || '').trim();
        if (t && !seen.has(t)) {
            seen.add(t);
            ordered.push(t);
        }
    }
    const extras = new Set<string>();
    for (const s of allUsers) {
        const c = (s?.class_name || '').trim();
        if (c && !seen.has(c)) extras.add(c);
    }
    const sortedExtras = [...extras].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return [...ordered, ...sortedExtras];
}

// 批量审辨信度生成 Modal
const BatchCtrlModal: React.FC<{
    onClose: () => void;
    onCtrlSaved?: (processId: string, ctrlScore: CtrlScore) => void;
    classOptions: string[];
}> = ({ onClose, onCtrlSaved, classOptions }) => {
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');
    const [topics, setTopics] = useState<BatchTopicOption[]>([]);
    const [selectedBatch, setSelectedBatch] = useState('');
    const [loadingTopics, setLoadingTopics] = useState(false);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [candidateError, setCandidateError] = useState('');
    const [includeReanalyze, setIncludeReanalyze] = useState(false);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loadedScopeKey, setLoadedScopeKey] = useState('');
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [done, setDone] = useState(0);
    const [failed, setFailed] = useState(0);
    const [finished, setFinished] = useState(false);
    const abortRef = useState({ cancelled: false })[0];

    useEffect(() => {
        if (!selectedClass) { setTopics([]); return; }
        let cancelled = false;
        setLoadingTopics(true);
        getBatchWritingTopics(selectedClass, 'narrative').then(({ data, error }) => {
            if (!cancelled) {
                setTopics(data);
                setCandidateError(error ? '读取该班写作题目失败，请重试。' : '');
            }
        }).catch(() => { if (!cancelled) setCandidateError('读取该班写作题目失败，请重试。'); })
            .finally(() => { if (!cancelled) setLoadingTopics(false); });
        return () => { cancelled = true; };
    }, [selectedClass]);

    const invalidDateRange = !!fromDate && !!toDate && fromDate > toDate;
    const scopeKey = JSON.stringify([selectedClass, selectedTopic, fromDate, toDate, includeReanalyze]);
    useEffect(() => {
        setCandidates([]);
        setLoadedScopeKey('');
        setFinished(false);
        if (!selectedClass || !selectedTopic || invalidDateRange) {
            setLoadingCandidates(false);
            return;
        }
        let cancelled = false;
        setLoadingCandidates(true);
        setCandidateError('');
        getBatchCtrlCandidates(selectedClass, {
            includeExistingCtrl: includeReanalyze, narrativeOnly: true,
            scope: { topic: selectedTopic, topicVariants: topics.find(item => item.topic === selectedTopic)?.variants, fromDate, toDate },
        }).then(({ data, error }) => {
            if (!cancelled) {
                setCandidates(data || []);
                setLoadedScopeKey(scopeKey);
                setCandidateError(error ? '读取待评分记录失败，请重试。' : '');
                setLoadingCandidates(false);
            }
        }).catch(() => {
            if (!cancelled) { setCandidateError('读取待评分记录失败，请重试。'); setLoadingCandidates(false); }
        });
        return () => { cancelled = true; };
    }, [selectedClass, selectedTopic, fromDate, toDate, invalidDateRange, includeReanalyze]);

    const handleSelectClass = (cls: string) => {
        setSelectedClass(cls);
        setSelectedTopic('');
        setSelectedBatch('');
        setTopics([]);
        setCandidates([]);
        setFromDate('');
        setToDate('');
        setFinished(false);
        setProgress(0);
    };

    const handleStart = async () => {
        if (!selectedClass || !selectedTopic || invalidDateRange || loadingCandidates || loadedScopeKey !== scopeKey || candidates.length === 0) return;
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
                    writingMode: 'narrative',
                });
                const prev = rec.ctrl_score as { source?: string; reviewed?: boolean } | null | undefined;
                const payload = {
                    ...result,
                    source: (prev?.source === 'teacher_manual' ? 'teacher_manual' : 'auto') as 'auto' | 'teacher_manual',
                    reviewed: prev?.reviewed === true,
                };
                const { error: saveErr } = await saveCtrlScore(rec.id, payload);
                if (saveErr) throw saveErr;
                onCtrlSaved?.(rec.id, payload);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35">
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-slate-50/60">
                    <div>
                        <h2 className="font-bold text-lg text-slate-800">记叙文批量审辨信度</h2>
                        <p className="text-slate-500 text-xs mt-0.5">仅处理记叙文；已有分数默认保留</p>
                    </div>

                    <button onClick={onClose} disabled={running} className="text-slate-400 hover:text-slate-700 text-xl disabled:opacity-30">✕</button>
                </div>

                <div className="p-6 space-y-5">
                    {/* 班级选择 */}
                    <div>
                        <p className="text-sm font-bold text-slate-600 mb-2">选择班级</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                            {classOptions.map(cls => (
                                <button key={cls}
                                    onClick={() => handleSelectClass(cls)}
                                    disabled={running}
                                    className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-all text-left break-words ${selectedClass === cls ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                    {cls}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-slate-600">选择写作题目</label>
                        <BatchTopicPicker topics={topics} value={selectedTopic}
                            onChange={(topic) => { setSelectedTopic(topic); setSelectedBatch(''); setFromDate(''); setToDate(''); setFinished(false); setProgress(0); }}
                            disabled={!selectedClass || loadingTopics || running} />
                        {selectedClass && !loadingTopics && topics.length === 0 && !candidateError && <p className="text-xs text-slate-500">该班暂无已完成成文的记叙文题目。</p>}
                        {selectedTopic && <div className="space-y-1">
                            <p className="text-xs text-slate-500">相同或近似题目已归并；需要指定某一批时请选择批次。</p>
                            {(topics.find(item => item.topic === selectedTopic)?.batches.length || 0) > 1 && <select value={selectedBatch} onChange={event => { const key = event.target.value; setSelectedBatch(key); setFromDate(key); setToDate(key); }} disabled={running} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
                                <option value="">全部批次（{topics.find(item => item.topic === selectedTopic)?.count || 0} 篇）</option>
                                {topics.find(item => item.topic === selectedTopic)?.batches.map(batch => <option key={batch.key} value={batch.key}>{batch.label}</option>)}
                            </select>}
                            <p className="text-xs text-slate-500">也可以用日期范围进一步限定。</p>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-xs text-slate-600">开始日期<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} disabled={running} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" /></label>
                                <label className="text-xs text-slate-600">结束日期<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} disabled={running} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2" /></label>
                            </div>
                            {invalidDateRange && <p role="alert" className="text-xs text-rose-700">结束日期不能早于开始日期。</p>}
                        </div>}
                    </div>

                    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer select-none ${running ? 'opacity-50 pointer-events-none' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                        <input
                            type="checkbox"
                            className="mt-0.5 rounded border-slate-300 text-[#1e2d4a] focus:ring-[#1e2d4a]"
                            checked={includeReanalyze}
                            onChange={(e) => setIncludeReanalyze(e.target.checked)}
                            disabled={running}
                        />
                        <span className="text-sm text-slate-700 leading-snug">
                            <span className="font-bold text-slate-800">包含已有审辨信度</span>
                            <span className="text-slate-500">（量规更新后按新标准重新批量打分，将覆盖当前分数与评语；「教师已复核」标记会保留）</span>
                        </span>
                    </label>

                    {/* 待分析记录数 */}
                    {selectedClass && selectedTopic && !invalidDateRange && (
                        <div className={`rounded-xl p-4 border ${loadingCandidates ? 'bg-slate-50 border-slate-200' : candidates.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                            {loadingCandidates ? (
                                <p className="text-sm text-slate-500 flex items-center gap-2">
                                    <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                    正在统计待分析记录...
                                </p>
                            ) : candidates.length > 0 ? (
                                <div className="text-sm font-medium text-amber-800 space-y-1">
                                    <p>
                                        {selectedClass} · {selectedTopic}：共 <strong>{candidates.length}</strong> 条记录将参与批量分析
                                        {includeReanalyze ? '（含已有分数，将重算覆盖）' : '（仅此前未分析）'}
                                    </p>
                                </div>
                            ) : includeReanalyze ? (
                                <p className="text-sm font-medium text-slate-600">该题目及所选日期范围内暂无可评分的记叙文记录。</p>
                            ) : (
                                <div className="text-sm font-medium text-emerald-700 space-y-1">
                                    <p>该题目及所选日期范围内暂无待分析记录（可能均已有审辨信度）。</p>
                                    <p className="text-xs font-normal text-emerald-800/90">若需按新评分标准重算，请勾选上方「包含已有审辨信度」后重新统计。</p>
                                </div>
                            )}
                        </div>
                    )}
                    {candidateError && <p role="alert" className="text-xs text-rose-700">{candidateError}</p>}

                    {/* 进度条 */}
                    {(running || finished) && (
                        <div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                                <span>{finished ? '分析完成' : `正在分析 ${progress} / ${candidates.length}`}</span>
                                <span>{pct}%</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${finished ? 'bg-slate-700' : 'bg-slate-900'}`}
                                    style={{ width: `${pct}%` }} />
                            </div>
                            {finished && (
                                <p className="text-xs text-slate-500 mt-2 text-center">
                                    成功 {done} 条 {failed > 0 ? `· 失败 ${failed} 条` : ''}
                                </p>
                            )}
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex gap-3 pt-2">
                        {!running && !finished && (
                            <button onClick={handleStart}
                                disabled={!selectedClass || !selectedTopic || invalidDateRange || loadedScopeKey !== scopeKey || candidates.length === 0 || loadingCandidates || !!candidateError}
                                className="flex-1 py-3 rounded-lg font-bold text-white bg-slate-900 hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                开始批量分析
                            </button>
                        )}
                        {running && (
                            <button onClick={handleStop}
                                className="flex-1 py-3 rounded-lg font-bold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-all">
                                停止
                            </button>
                        )}
                        {finished && (
                            <button onClick={onClose}
                                className="flex-1 py-3 rounded-lg font-bold text-white bg-slate-900 hover:bg-black transition-all">
                                完成，关闭
                            </button>
                        )}
                        {!running && !finished && (
                            <button onClick={onClose} className="px-5 py-3 rounded-lg text-slate-500 hover:bg-slate-100 transition-all">取消</button>
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
                    <h2 className="text-xl font-bold text-slate-800">外校注册用户</h2>
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
import RosterTab from './teacher/RosterTab';

type TeacherTab = 'overview' | 'analytics' | 'students' | 'submissions' | 'essays' | 'usage' | 'external' | 'roster';

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
    const [rosterClassLabels, setRosterClassLabels] = useState<string[]>([]);

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            try {
                const [studentsRes, essaysRes, drillsRes, scaffoldsRes, usageRes, thinkingRes, externalRes, rosterStudentClasses, rosterExternalClasses] = await Promise.all([
                    getAllStudents(),
                    getAllEssayGrades(500),
                    getAllDrillHistory(500),
                    getAllScaffoldHistory(500),
                    getAgentUsageSummary(),
                    getAllThinkingProcesses(5000),
                    getExternalUsers(),
                    getActiveRosterClassLabels('student'),
                    getActiveRosterClassLabels('external_student'),
                ]);
                setStudents(studentsRes.data || []);
                setEssays(essaysRes.data || []);
                setDrills(drillsRes.data || []);
                setScaffolds(scaffoldsRes.data || []);
                setUsageLogs(usageRes.data || []);
                setThinkingProcesses(thinkingRes.data || []);
                setExternalUsers(externalRes.data || []);
                setRosterClassLabels([...new Set([...(rosterStudentClasses || []), ...(rosterExternalClasses || [])])]);
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

    const classList = useMemo(() => {
        // 把名单里的班级也并入下拉，避免“刚导入未登录”时无法在导出中选择
        const rosterAsUsers = rosterClassLabels.map((c) => ({ class_name: c }));
        return mergeTeacherClassOptions(PREDEFINED_CLASSES, [...students, ...rosterAsUsers]);
    }, [students, rosterClassLabels]);

    // 教师在后台直接为学生分配班级
    const handleUpdateStudentClass = async (userId: string, className: string) => {
        const { error } = await updateStudentClass(userId, className || null);
        if (!error) {
            setStudents(prev => prev.map((s: any) =>
                s.id === userId ? { ...s, class_name: className || null } : s
            ));
        }
    };

    /** 审辨信度保存成功后同步到本地列表，避免切换学生后仍显示旧 ctrl_score */
    const handleThinkingProcessCtrlSaved = useCallback((processId: string, ctrlScore: CtrlScore | ArgumentativeCtrlV2, field: 'ctrl_score' | 'ctrl_score_argumentative_v2' = 'ctrl_score') => {
        setThinkingProcesses((prev) =>
            prev.map((t: any) => (t.id === processId ? { ...t, [field]: ctrlScore } : t))
        );
    }, []);

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
            ['姓名', '学号', '班级', '作文批改次数', '平均分', '最高分', '最低分', '句子特训次数', '审辨写作训练次数', '议论文旧版均分', '议论文新版均分', '记叙文旧版均分', '记叙文新版均分'],
        ];

        filtered.students.forEach((s: any) => {
            const sEssays = filtered.essays.filter((e: any) => e.user_id === s.id);
            const sDrills = filtered.drills.filter((d: any) => d.user_id === s.id);
            const sProcesses = filtered.thinkingProcesses.filter((t: any) => t.user_id === s.id);
            const scores = sEssays.map((e: any) => e.total_score || 0);
            const avg = scores.length > 0 ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : '';
            const max = scores.length > 0 ? Math.max(...scores) : '';
            const min = scores.length > 0 ? Math.min(...scores) : '';
            const mean = (values: number[]) => values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '';
            const legacyArgument = sProcesses.filter((t: any) => isArgumentativeProcess(t) === true && typeof t.ctrl_score?.total === 'number').map((t: any) => t.ctrl_score.total as number);
            const newArgument = sProcesses.filter((t: any) => isArgumentativeProcess(t) === true && typeof t.ctrl_score_argumentative_v2?.total === 'number').map((t: any) => t.ctrl_score_argumentative_v2.total as number);
            const oldNarrative = sProcesses.filter((t: any) => isArgumentativeProcess(t) === false && t.ctrl_score?.rubricVersion !== 'narrative-ct-v2' && typeof t.ctrl_score?.total === 'number').map((t: any) => t.ctrl_score.total as number);
            const newNarrative = sProcesses.filter((t: any) => isArgumentativeProcess(t) === false && t.ctrl_score?.rubricVersion === 'narrative-ct-v2' && typeof t.ctrl_score?.total === 'number').map((t: any) => t.ctrl_score.total as number);
            rows.push([s.name, s.student_id, s.class_name || '', String(sEssays.length), String(avg), String(max), String(min), String(sDrills.length), String(sProcesses.length), mean(legacyArgument), mean(newArgument), mean(oldNarrative), mean(newNarrative)]);
        });

        const label = selectedClass === 'all' ? '全部班级' : selectedClass;
        downloadCSV(rows, `学生学习汇总_${label}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.csv`);
    };

    // 每个文体与量规版本单独占一行；证据不足保留空分，便于教学复核。
    const exportVersionedCtrlScores = () => {
        const byId = new Map(filtered.students.map((student: any) => [student.id, student]));
        const rows: string[][] = [[
            '姓名', '学号', '班级', '题目', '文体', '量规版本', '总分',
            '维度1', '维度1分数', '维度1证据状态', '维度1学生原文',
            '维度2', '维度2分数', '维度2证据状态', '维度2学生原文',
            '维度3', '维度3分数', '维度3证据状态', '维度3学生原文',
            '维度4', '维度4分数', '分析时间', '教师已复核',
        ]];
        const addLegacy = (process: any, mode: 'argumentative' | 'narrative') => {
            const score = process.ctrl_score;
            if (!score || typeof score !== 'object') return;
            const isNarrativeV2 = mode === 'narrative' && score.rubricVersion === 'narrative-ct-v2';
            const labels = isNarrativeV2
                ? ['证据辨识与依据意识', '推理与行动判断', '自我监控与修订', '']
                : mode === 'narrative'
                    ? ['叙事一致性', '事件推进与连贯性', '语言自主性', '细节与回望']
                    : ['观点一致性', '论证递进性', '语言自主性', '观点拓展度'];
            const keys = isNarrativeV2
                ? ['evidenceRecognition', 'reasoningJudgment', 'selfMonitoringRevision', '']
                : ['opinionConsistency', 'argumentProgression', 'linguisticAutonomy', 'thoughtExpansion'];
            const student: any = byId.get(process.user_id) || {};
            rows.push([
                student.name || '', student.student_id || '', student.class_name || '', process.topic || '',
                mode === 'narrative' ? '记叙文' : '议论文', score.rubricVersion || `${mode}-legacy`,
                typeof score.total === 'number' ? String(score.total) : '',
                labels[0], String(score[keys[0]] ?? ''), '', '', labels[1], String(score[keys[1]] ?? ''), '', '',
                labels[2], String(score[keys[2]] ?? ''), '', '', labels[3], keys[3] ? String(score[keys[3]] ?? '') : '',
                score.analyzedAt || '', score.reviewed ? '是' : '否',
            ]);
        };
        filtered.thinkingProcesses.forEach((process: any) => {
            const mode = isArgumentativeProcess(process);
            if (mode === null) return;
            addLegacy(process, mode ? 'argumentative' : 'narrative');
            const score = mode ? process.ctrl_score_argumentative_v2 as ArgumentativeCtrlV2 | null : null;
            if (!score || score.rubricVersion !== 'argumentative-ct-v2') return;
            const student: any = byId.get(process.user_id) || {};
            const dimension = (key: keyof ArgumentativeCtrlV2['dimensions']) => score.dimensions?.[key];
            const row = [student.name || '', student.student_id || '', student.class_name || '', process.topic || '', '议论文', score.rubricVersion,
                typeof score.total === 'number' ? String(score.total) : '证据不足'];
            (['argumentEvidence', 'reasoningConditions', 'argumentRevision'] as const).forEach((key, index) => {
                const dim = dimension(key);
                row.push(['论点与依据辨识', '推理与条件审查', '自我监控与有据修订'][index],
                    typeof dim?.score === 'number' ? String(dim.score) : '', dim?.evidenceStatus || 'insufficient',
                    dim?.evidence?.map(item => item.quote).join(' | ') || '');
            });
            row.push('', '', score.analyzedAt || '', score.reviewed ? '是' : '否');
            rows.push(row);
        });
        if (rows.length === 1) { alert('当前筛选范围内暂无审辨信度记录'); return; }
        const label = selectedClass === 'all' ? '全部班级' : selectedClass;
        downloadCSV(rows, `审辨信度_按量规版本_${label}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.csv`);
    };

    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showProcessEvidenceExport, setShowProcessEvidenceExport] = useState(false);
    const [showBatchCtrl, setShowBatchCtrl] = useState(false);
    const [showBatchArgumentativeCtrl, setShowBatchArgumentativeCtrl] = useState(false);

    const tabs: { key: TeacherTab; label: string }[] = [
        { key: 'overview', label: '教学概览' },
        { key: 'analytics', label: '学情分析' },
        { key: 'students', label: '学生档案' },
        { key: 'submissions', label: '提交情况' },
        { key: 'essays', label: '作文详情' },
        { key: 'usage', label: '使用统计' },
        { key: 'roster', label: '受邀名单' },
        { key: 'external', label: '外校用户' },
    ];

    return (
        <div className="min-h-screen bg-slate-100/40 font-sans">
            {/* Header */}
            <header className="bg-white/95 backdrop-blur sticky top-0 z-50 border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-serif font-bold text-lg">
                            C
                        </div>
                        <div>
                            <h1 className="font-serif font-bold text-lg tracking-tight text-slate-900">
                                审辨写作训练 <span className="text-slate-500 text-sm font-normal">教师端</span>
                            </h1>
                        </div>
                    </div>

                    {/* User */}
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-sm font-bold text-slate-800">{user.name}</div>
                            <div className="text-[10px] text-slate-400">教师</div>
                        </div>
                        <button
                            onClick={onLogout}
                            className="px-3 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors font-medium border border-slate-200"
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
                                className={`px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${activeTab === tab.key
                                    ? 'border-slate-900 text-slate-900'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-7xl mx-auto px-4 py-6">

                {/* 当前班级 Banner */}
                <div className="mb-6 flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-slate-200 flex-wrap">

                    {/* 班级下拉 */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">筛选班级</span>
                        <select
                            value={selectedClass}
                            onChange={e => setSelectedClass(e.target.value)}
                            className="text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#1e2d4a]/40 cursor-pointer appearance-none pr-8"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.4rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.1em' }}
                        >
                            <option value="all">全部班级</option>
                            {classList.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    {/* 统计数字 */}
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span><strong className="text-slate-700">{filtered.students.length}</strong> 名学生</span>
                        <span className="text-slate-300">·</span>
                        <span><strong className="text-slate-700">{filtered.essays.length}</strong> 篇作文</span>
                        <span className="text-slate-300">·</span>
                        <span><strong className="text-slate-700">{filtered.drills.length}</strong> 次特训</span>
                        {selectedClass !== 'all' && filtered.essays.length > 0 && (
                            <>
                                <span className="text-slate-300">·</span>
                                <span>均分 <strong className="text-slate-700">
                                    {(filtered.essays.reduce((s: number, e: any) => s + (e.total_score || 0), 0) / filtered.essays.length).toFixed(1)}
                                </strong> / 15</span>
                            </>
                        )}
                    </div>

                    {/* 工具按钮组 */}
                    <div className="ml-auto flex items-center gap-2">
                        {/* 批量审辨信度 */}
                        <button
                            onClick={() => setShowBatchCtrl(true)}
                            className="text-xs px-3 py-1.5 rounded-lg font-bold bg-slate-900 text-white hover:bg-black transition-all shadow-sm whitespace-nowrap"
                        >
                            记叙文批量评分
                        </button>
                        <button onClick={() => setShowBatchArgumentativeCtrl(true)} className="text-xs px-3 py-1.5 rounded-lg font-bold bg-blue-900 text-white hover:bg-blue-950 whitespace-nowrap">议论文新版重评</button>

                        {/* 导出数据 */}
                        <div className="relative">
                            <button
                                onClick={() => setShowExportMenu(v => !v)}
                                className="text-xs px-3 py-1.5 rounded-lg font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition-all shadow-sm whitespace-nowrap"
                            >
                                导出数据 ▾
                            </button>
                            {showExportMenu && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                                    <div className="absolute right-0 top-9 z-20 bg-white rounded-xl shadow-lg border border-slate-200 py-1 min-w-[160px]">
                                        <button onClick={() => { exportStudentSummary(); setShowExportMenu(false); }}
                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium">
                                            学生学习汇总
                                        </button>
                                        <button onClick={() => { exportVersionedCtrlScores(); setShowExportMenu(false); }}
                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium">
                                            审辨信度汇总
                                        </button>
                                        <button onClick={() => { setShowProcessEvidenceExport(true); setShowExportMenu(false); }}
                                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 font-medium">
                                            教学过程证据包
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
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
                        classOptions={classList}
                        onUpdateStudentClass={handleUpdateStudentClass}
                        onThinkingProcessCtrlSaved={handleThinkingProcessCtrlSaved}
                    />
                )}
                {activeTab === 'essays' && (
                    <EssayGalleryTab essays={filtered.essays} isLoading={isLoading} />
                )}
                {activeTab === 'submissions' && !isLoading && (
                    <EssaySubmissionTab students={students} selectedClass={selectedClass} classOptions={classList} />
                )}
                {activeTab === 'usage' && (
                    <UsageTab essays={filtered.essays} drills={filtered.drills} scaffolds={filtered.scaffolds} usageLogs={filtered.usageLogs} isLoading={isLoading} />
                )}
                {activeTab === 'roster' && (
                    <RosterTab classOptions={classList} />
                )}
                {activeTab === 'external' && (
                    <ExternalUsersTab users={externalUsers} isLoading={isLoading} />
                )}
            </main>

            {/* 批量审辨信度 Modal */}
            {showBatchCtrl && (
                <BatchCtrlModal
                    onClose={() => setShowBatchCtrl(false)}
                    onCtrlSaved={handleThinkingProcessCtrlSaved}
                    classOptions={classList}
                />
            )}
            {showBatchArgumentativeCtrl && <BatchArgumentativeCtrlV2Modal
                onClose={() => setShowBatchArgumentativeCtrl(false)}
                onSaved={handleThinkingProcessCtrlSaved}
                classOptions={classList}
            />}
            {showProcessEvidenceExport && <ProcessEvidenceExportModal
                classOptions={classList}
                initialClass={selectedClass === 'all' ? '' : selectedClass}
                onClose={() => setShowProcessEvidenceExport(false)}
            />}

            {/* Footer */}
            <footer className="border-t border-slate-200 py-6 text-center">
                <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold">
                    审辨写作训练系统 — 教师端
                </p>
            </footer>
        </div>
    );
};

export default TeacherDashboard;
