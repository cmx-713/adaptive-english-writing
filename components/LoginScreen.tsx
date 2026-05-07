
import React, { useState } from 'react';
import { User } from '../types';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

type TabType = 'student' | 'teacher' | 'external';

const INPUT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 bg-[#f4f6f9] focus:bg-white focus:border-[#1e2d4a]/30 focus:ring-4 focus:ring-[#1e2d4a]/5 outline-none transition-all text-slate-800 placeholder-slate-300";
const LABEL_CLS = "block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wider";

const CLASS_OPTIONS = ['2024级A甲6', '2024级A乙6', '2025级A甲2', '2025级A乙2'];

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [tab, setTab] = useState<TabType>('student');

  // ── 学生/教师字段 ──
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [className, setClassName] = useState('');

  // ── 外校用户字段 ──
  const [extName, setExtName] = useState('');
  const [extId, setExtId] = useState('');
  const [extSchool, setExtSchool] = useState('');

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const switchTab = (t: TabType) => {
    setTab(t);
    setError('');
    setName(''); setStudentId(''); setPassword(''); setClassName('');
    setExtName(''); setExtId(''); setExtSchool('');
  };

  // ── 学生 / 教师 提交 ──
  const handleInternalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('请输入姓名'); return; }

    if (tab === 'teacher') {
      if (!password.trim()) { setError('请输入密码'); return; }
      setIsLoading(true); setError('');
      try {
        await onLogin({ name: name.trim(), studentId: password.trim(), className: undefined });
      } catch { setError('登录失败，请检查姓名或密码'); }
      finally { setIsLoading(false); }
    } else {
      if (!studentId.trim()) { setError('请输入学号'); return; }
      if (!className) { setError('请选择班级'); return; }
      setIsLoading(true); setError('');
      try {
        await onLogin({ name: name.trim(), studentId: studentId.trim(), className });
      } catch { setError('登录失败，请重试'); }
      finally { setIsLoading(false); }
    }
  };

  // ── 外校用户 直接登录 ──
  const handleExtLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extName.trim()) { setError('请输入姓名'); return; }
    if (!extId.trim()) { setError('请输入学号/工号'); return; }
    if (!extSchool.trim()) { setError('请输入学校/学院'); return; }
    setIsLoading(true); setError('');
    try {
      await onLogin({
        name: extName.trim(),
        studentId: extId.trim(),
        school: extSchool.trim(),
        role: 'external_student',
      });
    } catch { setError('登录失败，请重试'); }
    finally { setIsLoading(false); }
  };

  const spinnerSvg = (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-[#1e2d4a]/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#1e2d4a]/5 rounded-full translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-1/4 right-1/4 w-4 h-4 bg-[#1e2d4a]/10 rounded-full" />
        <div className="absolute bottom-1/3 left-1/5 w-3 h-3 bg-[#1e2d4a]/8 rounded-full" />
      </div>

      <div className="relative z-10 max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-fade-in-up">
          <div className="h-1.5 bg-[#1e2d4a]" />

          <div className="p-8 md:p-10">
            {/* Logo */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-[#1e2d4a] rounded-xl flex items-center justify-center text-white font-serif font-bold text-2xl shadow-lg mx-auto mb-5 ring-4 ring-[#1e2d4a]/10">C</div>
              <h1 className="font-serif font-bold text-2xl text-slate-800 tracking-tight">
                CET-4/6 <span className="text-[#4a6289] text-lg">Coach</span>
              </h1>
              <p className="text-slate-400 text-sm mt-2 tracking-wide">大学英语四六级写作辅助系统</p>
            </div>

            {/* Tab 切换 */}
            <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1 gap-1 mb-6">
              {([
                { key: 'student', label: '🎓 学生' },
                { key: 'teacher', label: '👨‍🏫 教师' },
                { key: 'external', label: '🌐 外校用户' },
              ] as { key: TabType; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchTab(key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === key ? 'bg-[#1e2d4a] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ─────────── 学生 Tab ─────────── */}
            {tab === 'student' && (
              <form onSubmit={handleInternalSubmit} className="space-y-5">
                <div>
                  <label className={LABEL_CLS}>姓名 <span className="text-slate-400 normal-case">(Name)</span></label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="请输入您的真实姓名" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>学号 <span className="text-slate-400 normal-case">(Student ID)</span></label>
                  <input type="text" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="请输入您的学号" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>班级 <span className="text-slate-400 normal-case">(Class)</span></label>
                  <select value={className} onChange={e => setClassName(e.target.value)} className={INPUT_CLS + ' appearance-none'}
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em', paddingRight: '2.5rem' }}>
                    <option value="">请选择班级</option>
                    {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {error && <div className="text-rose-600 text-sm bg-rose-50 p-3 rounded-lg text-center font-medium border border-rose-100">{error}</div>}
                <button type="submit" disabled={isLoading}
                  className={`w-full py-3.5 rounded-xl font-bold text-white bg-[#1e2d4a] hover:bg-[#162240] shadow-lg shadow-[#1e2d4a]/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-base tracking-wide ${isLoading ? 'opacity-80 cursor-not-allowed hover:translate-y-0' : ''}`}>
                  {isLoading ? <>{spinnerSvg} 登录中...</> : '开始学习 (Start Learning)'}
                </button>
              </form>
            )}

            {/* ─────────── 教师 Tab ─────────── */}
            {tab === 'teacher' && (
              <form onSubmit={handleInternalSubmit} className="space-y-5">
                <div>
                  <label className={LABEL_CLS}>姓名 <span className="text-slate-400 normal-case">(Name)</span></label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="请输入您的真实姓名" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>密码 <span className="text-slate-400 normal-case">(Password)</span></label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入教师密码" autoComplete="current-password" className={INPUT_CLS} />
                </div>
                {error && <div className="text-rose-600 text-sm bg-rose-50 p-3 rounded-lg text-center font-medium border border-rose-100">{error}</div>}
                <button type="submit" disabled={isLoading}
                  className={`w-full py-3.5 rounded-xl font-bold text-white bg-[#1e2d4a] hover:bg-[#162240] shadow-lg shadow-[#1e2d4a]/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-base tracking-wide ${isLoading ? 'opacity-80 cursor-not-allowed hover:translate-y-0' : ''}`}>
                  {isLoading ? <>{spinnerSvg} 登录中...</> : '进入教师后台'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">教师账号由管理员配置，如无法登录请联系系统管理员。</p>
              </form>
            )}

            {/* ─────────── 外校用户 Tab ─────────── */}
            {tab === 'external' && (
              <form onSubmit={handleExtLogin} className="space-y-5">
                <div>
                  <label className={LABEL_CLS}>姓名 <span className="text-slate-400 normal-case">(Name)</span></label>
                  <input type="text" value={extName} onChange={e => setExtName(e.target.value)} placeholder="请输入您的真实姓名" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>学号 / 工号 <span className="text-slate-400 normal-case">(ID)</span></label>
                  <input type="text" value={extId} onChange={e => setExtId(e.target.value)} placeholder="请输入您的学号或工号" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>学校 / 学院 <span className="text-slate-400 normal-case">(School)</span></label>
                  <input type="text" value={extSchool} onChange={e => setExtSchool(e.target.value)} placeholder="如：XX大学外国语学院" className={INPUT_CLS} />
                </div>
                {error && <div className="text-rose-600 text-sm bg-rose-50 p-3 rounded-lg text-center font-medium border border-rose-100">{error}</div>}
                <button type="submit" disabled={isLoading}
                  className={`w-full py-3.5 rounded-xl font-bold text-white bg-[#1e2d4a] hover:bg-[#162240] shadow-lg shadow-[#1e2d4a]/20 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 text-base tracking-wide ${isLoading ? 'opacity-80 cursor-not-allowed hover:translate-y-0' : ''}`}>
                  {isLoading ? <>{spinnerSvg} 登录中...</> : '开始学习 (Start Learning)'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">* 系统将自动记录学习进度，再次访问时填写相同信息即可继续。</p>
              </form>
            )}

            {/* Footer */}
            {tab !== 'external' && (
              <div className="mt-8 text-center border-t border-slate-100 pt-5">
                <p className="text-[11px] text-slate-400 tracking-wide">
                  * 系统将自动记录学习时长与进度，请如实填写信息。
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-[10px] text-slate-300 uppercase tracking-widest font-bold">
            Adaptive English Writing Coach
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
