
import React, { useEffect, useState } from 'react';
import { User } from '../types';
import { getActiveRosterClassLabels } from '../services/supabaseDataService';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

type TabType = 'student' | 'teacher' | 'external';

const INPUT_CLS =
  'w-full px-4 py-3 rounded-xl border border-slate-200 bg-[#f4f6f9] focus:bg-white focus:border-[#1e2d4a]/30 focus:ring-4 focus:ring-[#1e2d4a]/5 outline-none transition-all text-slate-800 placeholder-slate-300';
const LABEL_CLS =
  'block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wider';

const SELECT_CLS =
  INPUT_CLS +
  ' appearance-none cursor-pointer';
const SELECT_STYLE: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '1.25em 1.25em',
  paddingRight: '2.5rem',
};

/** 预设四个固定班级，始终出现在本校下拉最前面 */
const PRESET_CLASSES = ['2024级A甲6', '2024级A乙6', '2025级A甲2', '2025级A乙2'];

const Spinner = () => (
  <svg
    className="animate-spin h-5 w-5 text-white"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [tab, setTab] = useState<TabType>('student');

  // ── 本校学生字段 ──
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [className, setClassName] = useState('');

  // ── 教师字段 ──
  const [teacherName, setTeacherName] = useState('');
  const [password, setPassword] = useState('');

  // ── 外校用户字段 ──
  const [extName, setExtName] = useState('');
  const [extId, setExtId] = useState('');
  const [extClass, setExtClass] = useState('');

  // ── 班级选项（动态）──
  const [extraSchoolClasses, setExtraSchoolClasses] = useState<string[]>([]);
  const [externalClasses, setExternalClasses] = useState<string[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 登录页加载时拉取名单班级
  useEffect(() => {
    let cancelled = false;
    setClassesLoading(true);
    Promise.all([
      getActiveRosterClassLabels('student'),
      getActiveRosterClassLabels('external_student'),
    ]).then(([schoolLabels, extLabels]) => {
      if (cancelled) return;
      // 剔除已在预设四班中的项，避免重复
      const presetSet = new Set(PRESET_CLASSES);
      setExtraSchoolClasses(schoolLabels.filter((c) => !presetSet.has(c)));
      setExternalClasses(extLabels);
      setClassesLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const schoolClassOptions = [...PRESET_CLASSES, ...extraSchoolClasses];

  const switchTab = (t: TabType) => {
    setTab(t);
    setError('');
    setName(''); setStudentId(''); setClassName('');
    setTeacherName(''); setPassword('');
    setExtName(''); setExtId(''); setExtClass('');
  };

  // ── 本校学生提交 ──
  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('请输入姓名'); return; }
    if (!studentId.trim()) { setError('请输入学号'); return; }
    if (!className) { setError('请选择班级'); return; }
    setIsLoading(true); setError('');
    try {
      await onLogin({ name: name.trim(), studentId: studentId.trim(), className });
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // ── 教师提交 ──
  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName.trim()) { setError('请输入姓名'); return; }
    if (!password.trim()) { setError('请输入密码'); return; }
    setIsLoading(true); setError('');
    try {
      await onLogin({ name: teacherName.trim(), studentId: password.trim(), className: undefined });
    } catch {
      setError('登录失败，请检查姓名或密码');
    } finally {
      setIsLoading(false);
    }
  };

  // ── 外校用户提交 ──
  const handleExtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extClass) { setError('请选择所属课程/班级'); return; }
    if (!extName.trim()) { setError('请输入姓名'); return; }
    if (!extId.trim()) { setError('请输入学号'); return; }
    setIsLoading(true); setError('');
    try {
      await onLogin({
        name: extName.trim(),
        studentId: extId.trim(),
        className: extClass,
        role: 'external_student',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-[#1e2d4a]/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#1e2d4a]/5 rounded-full translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-1/4 right-1/4 w-4 h-4 bg-[#1e2d4a]/10 rounded-full" />
        <div className="absolute bottom-1/3 left-1/5 w-3 h-3 bg-[#1e2d4a]/8 rounded-full" />
      </div>

      <div className="relative z-10 max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="h-1.5 bg-[#1e2d4a]" />

          <div className="p-8 md:p-10">
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-[#1e2d4a] rounded-xl flex items-center justify-center text-white font-serif font-bold text-2xl shadow-lg mx-auto mb-5 ring-4 ring-[#1e2d4a]/10">
                C
              </div>
              <h1 className="font-serif font-bold text-2xl text-slate-800 tracking-tight">
                审辨写作训练
              </h1>
              <p className="text-slate-400 text-sm mt-2 tracking-wide">英语写作审辨思维培养系统</p>
            </div>

            {/* Tab 切换 */}
            <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1 gap-1 mb-6">
              {(
                [
                  { key: 'student', label: '🎓 本校用户' },
                  { key: 'teacher', label: '👨‍🏫 教师' },
                  { key: 'external', label: '🌐 外校用户' },
                ] as { key: TabType; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchTab(key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    tab === key
                      ? 'bg-[#1e2d4a] text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ─────────── 本校用户 Tab ─────────── */}
            {tab === 'student' && (
              <form onSubmit={handleStudentSubmit} className="space-y-5">
                <div>
                  <label className={LABEL_CLS}>
                    班级 <span className="text-slate-400 normal-case">(Class)</span>
                  </label>
                  <select
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    className={SELECT_CLS}
                    style={SELECT_STYLE}
                    disabled={classesLoading}
                  >
                    <option value="">
                      {classesLoading ? '加载中…' : '请选择班级'}
                    </option>
                    {schoolClassOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>
                    姓名 <span className="text-slate-400 normal-case">(Name)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="请输入您的真实姓名"
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>
                    学号 <span className="text-slate-400 normal-case">(Student ID)</span>
                  </label>
                  <input
                    type="text"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="请输入您的学号"
                    className={INPUT_CLS}
                  />
                </div>
                {error && (
                  <div className="text-rose-600 text-sm bg-rose-50 p-3 rounded-lg text-center font-medium border border-rose-100">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-3.5 rounded-xl font-bold text-white bg-[#1e2d4a] hover:bg-[#162240] shadow-lg shadow-[#1e2d4a]/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-base tracking-wide ${
                    isLoading ? 'opacity-80 cursor-not-allowed hover:translate-y-0' : ''
                  }`}
                >
                  {isLoading ? <><Spinner /> 登录中…</> : '开始学习 (Start Learning)'}
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-1">
                  * 账号由任课教师统一管理，如无法登录请联系教师添加。
                </p>
              </form>
            )}

            {/* ─────────── 教师 Tab ─────────── */}
            {tab === 'teacher' && (
              <form onSubmit={handleTeacherSubmit} className="space-y-5">
                <div>
                  <label className={LABEL_CLS}>
                    姓名 <span className="text-slate-400 normal-case">(Name)</span>
                  </label>
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="请输入您的真实姓名"
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>
                    密码 <span className="text-slate-400 normal-case">(Password)</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入教师密码"
                    autoComplete="current-password"
                    className={INPUT_CLS}
                  />
                </div>
                {error && (
                  <div className="text-rose-600 text-sm bg-rose-50 p-3 rounded-lg text-center font-medium border border-rose-100">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-3.5 rounded-xl font-bold text-white bg-[#1e2d4a] hover:bg-[#162240] shadow-lg shadow-[#1e2d4a]/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-base tracking-wide ${
                    isLoading ? 'opacity-80 cursor-not-allowed hover:translate-y-0' : ''
                  }`}
                >
                  {isLoading ? <><Spinner /> 登录中…</> : '进入教师后台'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                  教师账号由管理员配置，如无法登录请联系系统管理员。
                </p>
              </form>
            )}

            {/* ─────────── 外校用户 Tab ─────────── */}
            {tab === 'external' && (
              <form onSubmit={handleExtSubmit} className="space-y-5">
                <div>
                  <label className={LABEL_CLS}>
                    所属课程 / 班级 <span className="text-slate-400 normal-case">(Class)</span>
                  </label>
                  {externalClasses.length > 0 ? (
                    <select
                      value={extClass}
                      onChange={(e) => setExtClass(e.target.value)}
                      className={SELECT_CLS}
                      style={SELECT_STYLE}
                      disabled={classesLoading}
                    >
                      <option value="">请选择所属课程/班级</option>
                      {externalClasses.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : classesLoading ? (
                    <div className="px-4 py-3 rounded-xl border border-slate-200 bg-[#f4f6f9] text-slate-400 text-sm">
                      加载中…
                    </div>
                  ) : (
                    <div className="px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm">
                      暂无可用课程，请联系任课教师确认是否已在系统中开班。
                    </div>
                  )}
                </div>
                <div>
                  <label className={LABEL_CLS}>
                    姓名 <span className="text-slate-400 normal-case">(Name)</span>
                  </label>
                  <input
                    type="text"
                    value={extName}
                    onChange={(e) => setExtName(e.target.value)}
                    placeholder="请输入您的真实姓名"
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>
                    学号 <span className="text-slate-400 normal-case">(Student ID)</span>
                  </label>
                  <input
                    type="text"
                    value={extId}
                    onChange={(e) => setExtId(e.target.value)}
                    placeholder="请输入您的学号"
                    className={INPUT_CLS}
                  />
                </div>
                {error && (
                  <div className="text-rose-600 text-sm bg-rose-50 p-3 rounded-lg text-center font-medium border border-rose-100">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading || (externalClasses.length === 0 && !classesLoading)}
                  className={`w-full py-3.5 rounded-xl font-bold text-white bg-[#1e2d4a] hover:bg-[#162240] shadow-lg shadow-[#1e2d4a]/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-base tracking-wide ${
                    isLoading || (externalClasses.length === 0 && !classesLoading)
                      ? 'opacity-50 cursor-not-allowed hover:translate-y-0'
                      : ''
                  }`}
                >
                  {isLoading ? <><Spinner /> 登录中…</> : '开始学习 (Start Learning)'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                  * 账号由任课教师统一管理，如无法登录请确认姓名、学号与名单一致，或联系教师。
                </p>
              </form>
            )}

            {/* Footer */}
            <div className="mt-6 text-center border-t border-slate-100 pt-5">
              <p className="text-[11px] text-slate-400 tracking-wide">
                * 系统将自动记录学习时长与进度，请如实填写信息。
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold">
            审辨写作训练系统
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
