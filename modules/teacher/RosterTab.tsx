import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    getAllRosterEntries,
    upsertRosterRows,
    deleteRosterEntry,
    setRosterEntryActive,
    RosterRowInput,
} from '../../services/supabaseDataService';

/** 每行：学号,姓名[,学校]。学校仅外校建议填写，与登录页「学校/学院」一致。 */
function parseRosterPaste(
    raw: string,
    classLabel: string,
    roleKind: 'external_student' | 'student'
): { rows: RosterRowInput[]; errors: string[] } {
    const rows: RosterRowInput[] = [];
    const errors: string[] = [];
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const cls = classLabel.trim();
    if (!cls) {
        errors.push('请先填写班级名称（须与学生登录所选班级一致）。');
        return { rows, errors };
    }
    lines.forEach((line, i) => {
        const parts = line.split(/[,，]/).map((s) => s.trim()).filter((s) => s.length > 0);
        if (parts.length < 2) {
            errors.push(`第 ${i + 1} 行格式无效，需至少「学号,姓名」。`);
            return;
        }
        const student_plain_id = parts[0];
        const full_name = parts[1];
        const school = parts.length >= 3 ? parts.slice(2).join(' ') : null;
        if (roleKind === 'student' && school) {
            errors.push(`第 ${i + 1} 行：本校名单无需学校字段，请只用「学号,姓名」。`);
            return;
        }
        rows.push({
            class_label: cls,
            student_plain_id,
            full_name,
            school: roleKind === 'external_student' ? school : null,
            role_kind: roleKind,
        });
    });
    return { rows, errors };
}

interface RosterTabProps {
    classOptions: string[];
}

const RosterTab: React.FC<RosterTabProps> = ({ classOptions }) => {
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [classLabel, setClassLabel] = useState('');
    const [roleKind, setRoleKind] = useState<'external_student' | 'student'>('external_student');
    const [paste, setPaste] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [expandedClassKeys, setExpandedClassKeys] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        setLoading(true);
        setMsg(null);
        const { data, error } = await getAllRosterEntries();
        if (error) {
            setMsg('加载名单失败：请确认已在 Supabase 执行 wc_class_roster 建表 SQL。');
            setEntries([]);
        } else {
            setEntries(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const q = filterClass.trim();
        if (!q) return entries;
        return entries.filter((e) => (e.class_label || '').includes(q));
    }, [entries, filterClass]);

    const groupedByClass = useMemo(() => {
        const grouped = new Map<string, any[]>();
        for (const item of filtered) {
            const key = (item.class_label || '未命名班级').trim() || '未命名班级';
            const arr = grouped.get(key) || [];
            arr.push(item);
            grouped.set(key, arr);
        }
        return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));
    }, [filtered]);

    useEffect(() => {
        if (groupedByClass.length === 0) {
            setExpandedClassKeys(new Set());
            return;
        }
        setExpandedClassKeys((prev) => {
            if (prev.size > 0) return prev;
            return new Set([groupedByClass[0][0]]);
        });
    }, [groupedByClass]);

    const handleImport = async () => {
        const { rows, errors } = parseRosterPaste(paste, classLabel, roleKind);
        if (errors.length > 0) {
            setMsg(errors.join(' '));
            return;
        }
        if (rows.length === 0) {
            setMsg('没有可导入的行。');
            return;
        }
        setBusy(true);
        setMsg(null);
        const { error } = await upsertRosterRows(rows);
        setBusy(false);
        if (error) {
            setMsg(`导入失败：${error.message || String(error)}`);
            return;
        }
        setMsg(`已导入 / 更新 ${rows.length} 条记录。`);
        setPaste('');
        await load();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('确定从名单中删除该条？')) return;
        setBusy(true);
        await deleteRosterEntry(id);
        setBusy(false);
        await load();
    };

    const handleToggle = async (id: string, next: boolean) => {
        setBusy(true);
        await setRosterEntryActive(id, next);
        setBusy(false);
        await load();
    };

    const toggleClassFold = (classKey: string) => {
        setExpandedClassKeys((prev) => {
            const next = new Set(prev);
            if (next.has(classKey)) next.delete(classKey);
            else next.add(classKey);
            return next;
        });
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-bold text-slate-800 mb-1">班级受邀名单</h2>
                <p className="text-sm text-slate-500 mb-4">
                    导入后：外校在存在任意外校名单时仅允许名单内学号登录；本校学生在对应班级存在「本校」名单时，仅允许该班名单内学号登录。
                    班级名称须与学生在登录页选择的班级（<code className="text-xs bg-slate-100 px-1 rounded">class_name</code>）一致。
                </p>

                {msg && (
                    <div className={`mb-4 text-sm px-4 py-2 rounded-lg ${msg.startsWith('已导入') ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                        {msg}
                    </div>
                )}

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">班级名称</label>
                        <input
                            list="roster-class-suggestions"
                            value={classLabel}
                            onChange={(e) => setClassLabel(e.target.value)}
                            placeholder="与登录页班级一致，如 2024级A甲6"
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#1e2d4a]/40"
                        />
                        <datalist id="roster-class-suggestions">
                            {classOptions.map((c) => (
                                <option key={c} value={c} />
                            ))}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">名单类型</label>
                        <select
                            value={roleKind}
                            onChange={(e) => setRoleKind(e.target.value as 'external_student' | 'student')}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#1e2d4a]/40"
                        >
                            <option value="external_student">外校学生</option>
                            <option value="student">本校学生</option>
                        </select>
                    </div>
                </div>

                <label className="block text-xs font-bold text-slate-500 mb-1">
                    批量粘贴（每行：学号,姓名{roleKind === 'external_student' ? ',学校（可选）' : ''}）
                </label>
                <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    rows={8}
                    placeholder={'例如：\n2024001,张三,某某大学\n2024002,李四'}
                    className="w-full text-sm font-mono border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#1e2d4a]/40 mb-3"
                />
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={handleImport}
                        className="px-4 py-2 rounded-lg text-sm font-bold bg-[#1e2d4a] text-white hover:opacity-90 disabled:opacity-50"
                    >
                        导入 / 更新名单
                    </button>
                    <button
                        type="button"
                        disabled={busy || loading}
                        onClick={load}
                        className="px-4 py-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                    >
                        刷新列表
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-x-auto">
                <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-base font-bold text-slate-800">当前名单</h3>
                    <input
                        type="search"
                        value={filterClass}
                        onChange={(e) => setFilterClass(e.target.value)}
                        placeholder="按班级筛选…"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#1e2d4a]/40 ml-auto max-w-xs"
                    />
                </div>
                {loading ? (
                    <p className="text-slate-400 text-sm">加载中…</p>
                ) : (
                    <div className="space-y-3">
                        {groupedByClass.map(([classKey, items]) => {
                            const open = expandedClassKeys.has(classKey);
                            const activeCount = items.filter((x) => x.is_active).length;
                            return (
                                <div key={classKey} className="border border-slate-200 rounded-xl overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => toggleClassFold(classKey)}
                                        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between text-left"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="font-bold text-slate-800 truncate">{classKey}</span>
                                            <span className="text-xs text-slate-500 whitespace-nowrap">
                                                共 {items.length} 人 / 生效 {activeCount} 人
                                            </span>
                                        </div>
                                        <span className="text-slate-500 text-sm">{open ? '▾ 收起' : '▸ 展开'}</span>
                                    </button>
                                    {open && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                                                        <th className="pb-2 pr-3 pl-4 pt-3">类型</th>
                                                        <th className="pb-2 pr-3 pt-3">学号</th>
                                                        <th className="pb-2 pr-3 pt-3">姓名</th>
                                                        <th className="pb-2 pr-3 pt-3">学校</th>
                                                        <th className="pb-2 pr-3 pt-3">状态</th>
                                                        <th className="pb-2 pr-4 pt-3">操作</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {items.map((e) => (
                                                        <tr key={e.id} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/80">
                                                            <td className="py-2 pr-3 pl-4 text-slate-600">{e.role_kind === 'student' ? '本校' : '外校'}</td>
                                                            <td className="py-2 pr-3 font-mono text-xs text-slate-600">{e.student_plain_id}</td>
                                                            <td className="py-2 pr-3 text-slate-700">{e.full_name}</td>
                                                            <td className="py-2 pr-3 text-slate-500 text-xs">{e.school || '—'}</td>
                                                            <td className="py-2 pr-3">
                                                                <span className={e.is_active ? 'text-emerald-600' : 'text-slate-400'}>
                                                                    {e.is_active ? '生效' : '已停用'}
                                                                </span>
                                                            </td>
                                                            <td className="py-2 pr-4 space-x-2 whitespace-nowrap">
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    onClick={() => handleToggle(e.id, !e.is_active)}
                                                                    className="text-xs font-bold text-[#1e2d4a] hover:underline disabled:opacity-50"
                                                                >
                                                                    {e.is_active ? '停用' : '启用'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    onClick={() => handleDelete(e.id)}
                                                                    className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
                                                                >
                                                                    删除
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                {!loading && filtered.length === 0 && (
                    <p className="text-center text-slate-400 py-8 text-sm">暂无记录或筛选无结果</p>
                )}
            </div>
        </div>
    );
};

export default RosterTab;
