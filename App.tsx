
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SocraticCoach from './modules/SocraticCoach';
import EssayGrader from './modules/EssayGrader';
import SentenceDrills from './modules/SentenceDrills';
import ProfileCenter from './modules/ProfileCenter';
import TeacherDashboard from './modules/TeacherDashboard';
import LoginScreen from './components/LoginScreen';
import SettingsModal from './components/SettingsModal';
import { User, ApiConfig, Tab } from './types';
import { quickSignInSupabase } from './services/supabaseDataService';

const DEFAULT_CONFIG: ApiConfig = {
  provider: 'google',
  apiKey: '', // Will fall back to env var if empty in service
  modelName: 'gemini-3-flash-preview'
};

const TAB_PATHS: Record<string, Tab> = {
  '/coach': 'coach',
  '/grader': 'grader',
  '/drills': 'drills',
  '/profile': 'profile',
};

const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: Tab = TAB_PATHS[location.pathname] || 'coach';
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(DEFAULT_CONFIG);

  // 跨模块传递：从思维训练发送作文到作文批改
  const [prefillGraderData, setPrefillGraderData] = useState<{ topic: string; essay: string } | null>(null);

  const handleSendToGrader = (topic: string, essay: string) => {
    setPrefillGraderData({ topic, essay });
    navigate('/grader');
  };

  useEffect(() => {
    const restoreSession = async () => {
      // Check for saved user session on mount
      const savedUser = localStorage.getItem('cet_student_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser) as User;
          // 如果已有 Supabase id，直接恢复
          if (parsed.id) {
            setUser(parsed);
          } else {
            // 旧格式用户：补充 Supabase id
            const { data } = await quickSignInSupabase(parsed.studentId, parsed.name);
            const enrichedUser: User = {
              ...parsed,
              id: data?.id || undefined,
              role: data?.role || 'student',
            };
            localStorage.setItem('cet_student_user', JSON.stringify(enrichedUser));
            setUser(enrichedUser);
          }
        } catch (e) {
          console.error("Failed to parse user data");
          localStorage.removeItem('cet_student_user');
        }
      }

      // Load API Config
      const savedConfig = localStorage.getItem('cet_api_config');
      if (savedConfig) {
        try {
          setApiConfig(JSON.parse(savedConfig));
        } catch (e) {
          console.error("Failed to parse api config");
        }
      }

      setIsLoadingUser(false);
    };

    restoreSession();
  }, []);

  const handleLogin = async (newUser: User) => {
    // 在 Supabase 中查找或创建用户，获取 UUID
    const { data } = await quickSignInSupabase(newUser.studentId, newUser.name);
    const enrichedUser: User = {
      ...newUser,
      id: data?.id || undefined,
      role: data?.role || 'student',
    };
    localStorage.setItem('cet_student_user', JSON.stringify(enrichedUser));
    setUser(enrichedUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('cet_student_user');
    setUser(null);
  };

  const handleSaveConfig = (newConfig: ApiConfig) => {
    setApiConfig(newConfig);
    localStorage.setItem('cet_api_config', JSON.stringify(newConfig));
  };

  // While checking local storage, show nothing (or a spinner if desired) to prevent flash
  if (isLoadingUser) {
    return null;
  }

  // If no user, show login screen
  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // If teacher, show teacher dashboard
  if (user.role === 'teacher') {
    return <TeacherDashboard user={user} onLogout={handleLogout} />;
  }

  // 确保首次访问根路径时重定向到 /coach
  if (location.pathname === '/' || !TAB_PATHS[location.pathname]) {
    // 使用 replaceState 避免浏览器历史堆积
    if (location.pathname !== '/coach') {
      navigate('/coach', { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-brand-100 selection:text-brand-900">
      {/* Global Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/90 no-print">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center text-white font-serif font-bold text-2xl shadow-lg">
              C
            </div>
            <h1 className="font-serif font-bold text-2xl text-slate-800 tracking-tight hidden md:block">
              CET-4/6 <span className="text-slate-500 text-lg">Coach</span>
            </h1>
          </div>

          {/* Navigation Tabs (Desktop) */}
          <nav className="hidden md:flex items-center bg-slate-100 p-1.5 rounded-xl gap-1">
            <button
              onClick={() => navigate('/coach')}
              className={`px-6 py-2.5 rounded-lg text-lg font-bold transition-all ${activeTab === 'coach'
                ? 'bg-white text-blue-900 shadow-sm ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
            >
              🧠 思维训练
            </button>
            <button
              onClick={() => navigate('/grader')}
              className={`px-6 py-2.5 rounded-lg text-lg font-bold transition-all ${activeTab === 'grader'
                ? 'bg-white text-blue-900 shadow-sm ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
            >
              ✍️ 作文批改
            </button>
            <button
              onClick={() => navigate('/drills')}
              className={`px-6 py-2.5 rounded-lg text-lg font-bold transition-all ${activeTab === 'drills'
                ? 'bg-white text-blue-900 shadow-sm ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
            >
              🏋️ 句子特训
            </button>
            <button
              onClick={() => navigate('/profile')}
              className={`px-6 py-2.5 rounded-lg text-lg font-bold transition-all ${activeTab === 'profile'
                ? 'bg-white text-blue-900 shadow-sm ring-1 ring-black/5'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
            >
              📊 学习中心
            </button>
          </nav>

          {/* User Profile / Settings */}
          <div className="flex items-center gap-4">
            {/* Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
              title="API Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>

            <div className="flex flex-col items-end border-l border-slate-200 pl-4">
              <span className="text-sm font-bold text-slate-800">{user.name}</span>
              <span className="text-[10px] text-slate-400 font-mono">{user.studentId}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-rose-500 font-medium underline decoration-slate-200 hover:decoration-rose-200"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Mobile Navigation Tabs (Shown below header on small screens) */}
        <div className="md:hidden border-t border-slate-100 p-3 overflow-x-auto bg-slate-50/50 backdrop-blur-sm">
          <div className="flex justify-center gap-3 min-w-max">
            <button
              onClick={() => navigate('/coach')}
              className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${activeTab === 'coach' ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'text-slate-500 bg-white border border-slate-100'
                }`}
            >
              🧠 思维训练
            </button>
            <button
              onClick={() => navigate('/grader')}
              className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${activeTab === 'grader' ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'text-slate-500 bg-white border border-slate-100'
                }`}
            >
              ✍️ 作文批改
            </button>
            <button
              onClick={() => navigate('/drills')}
              className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${activeTab === 'drills' ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'text-slate-500 bg-white border border-slate-100'
                }`}
            >
              🏋️ 句子特训
            </button>
            <button
              onClick={() => navigate('/profile')}
              className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${activeTab === 'profile' ? 'bg-blue-50 text-blue-900 border border-blue-200' : 'text-slate-500 bg-white border border-slate-100'
                }`}
            >
              📊 学习中心
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12 min-h-[calc(100vh-10rem)]">

        {/* Module 1: Socratic Coach */}
        <div className={activeTab === 'coach' ? 'block' : 'hidden'}>
          <SocraticCoach onSendToGrader={handleSendToGrader} supabaseUserId={user?.id} />
        </div>

        {/* Module 2: Essay Grader */}
        <div className={activeTab === 'grader' ? 'block' : 'hidden'}>
          <EssayGrader prefillData={prefillGraderData} onPrefillConsumed={() => setPrefillGraderData(null)} supabaseUserId={user?.id} />
        </div>

        {/* Module 3: Sentence Drills */}
        <div className={activeTab === 'drills' ? 'block' : 'hidden'}>
          <SentenceDrills supabaseUserId={user?.id} />
        </div>

        {/* Module 4: Learning Center */}
        <div className={activeTab === 'profile' ? 'block' : 'hidden'}>
          <ProfileCenter
            isActive={activeTab === 'profile'}
            onNavigate={(path: string) => navigate(path)}
          />
        </div>

      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={apiConfig}
        onSave={handleSaveConfig}
      />

      {/* Global Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-auto no-print">
        <div className="max-w-4xl mx-auto px-4 text-center text-slate-400 text-sm">
          <p>© {new Date().getFullYear()} CET-4/6 Writing Platform. Powered by {apiConfig.provider === 'google' ? 'Google Gemini' : apiConfig.provider} AI.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
