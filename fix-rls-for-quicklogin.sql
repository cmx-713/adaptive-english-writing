-- ==========================================
-- 调整 RLS 策略：兼容 quickSignIn 模式（无 Supabase Auth）
-- 
-- 背景：当前系统使用"姓名+学号"快速登录，不经过 Supabase Auth，
-- 因此 auth.uid() 为 null，需要调整 RLS 策略允许 anon 角色操作。
--
-- 执行方式：在 Supabase SQL Editor 中执行此脚本
-- ==========================================

-- ==========================================
-- 1. 删除所有旧策略
-- ==========================================

-- wc_users 表
DROP POLICY IF EXISTS "Students can view own profile" ON public.wc_users;
DROP POLICY IF EXISTS "Teachers can view all users" ON public.wc_users;
DROP POLICY IF EXISTS "Students can update own profile" ON public.wc_users;

-- wc_scaffold_history 表
DROP POLICY IF EXISTS "Students can insert own scaffold history" ON public.wc_scaffold_history;
DROP POLICY IF EXISTS "Students can view own scaffold history" ON public.wc_scaffold_history;
DROP POLICY IF EXISTS "Teachers can view all scaffold history" ON public.wc_scaffold_history;

-- wc_essay_grades 表
DROP POLICY IF EXISTS "Students can insert own essay grades" ON public.wc_essay_grades;
DROP POLICY IF EXISTS "Students can view own essay grades" ON public.wc_essay_grades;
DROP POLICY IF EXISTS "Teachers can view all essay grades" ON public.wc_essay_grades;

-- wc_drill_history 表
DROP POLICY IF EXISTS "Students can insert own drill history" ON public.wc_drill_history;
DROP POLICY IF EXISTS "Students can view own drill history" ON public.wc_drill_history;
DROP POLICY IF EXISTS "Teachers can view all drill history" ON public.wc_drill_history;

-- wc_agent_usage_logs 表
DROP POLICY IF EXISTS "Students can insert own usage logs" ON public.wc_agent_usage_logs;
DROP POLICY IF EXISTS "Students can view own usage logs" ON public.wc_agent_usage_logs;
DROP POLICY IF EXISTS "Teachers can view all usage logs" ON public.wc_agent_usage_logs;

-- wc_inspiration_history 表（如果存在旧策略）
DROP POLICY IF EXISTS "Students can insert own inspiration history" ON public.wc_inspiration_history;
DROP POLICY IF EXISTS "Students can view own inspiration history" ON public.wc_inspiration_history;
DROP POLICY IF EXISTS "Teachers can view all inspiration history" ON public.wc_inspiration_history;

-- 删除可能的旧函数
DROP FUNCTION IF EXISTS is_teacher();

-- ==========================================
-- 2. 确保 RLS 是开启状态
-- ==========================================
ALTER TABLE public.wc_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_scaffold_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_essay_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_drill_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_agent_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wc_inspiration_history ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. 创建新的 RLS 策略（允许 anon 角色操作）
-- 
-- 策略理念：
-- - anon 角色（quickSignIn 模式）可以进行所有读写操作
-- - 数据隔离通过应用层 user_id 参数控制
-- - 教师端将来通过 service_role key 或登录后用
--   authenticated 角色 + is_teacher() 函数来查看全部数据
-- ==========================================

-- ==========================================
-- wc_users 表
-- ==========================================
CREATE POLICY "Allow anon select users"
  ON public.wc_users FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon insert users"
  ON public.wc_users FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anon update users"
  ON public.wc_users FOR UPDATE
  TO anon, authenticated
  USING (true);

-- ==========================================
-- wc_scaffold_history 表
-- ==========================================
CREATE POLICY "Allow anon select scaffold"
  ON public.wc_scaffold_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon insert scaffold"
  ON public.wc_scaffold_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ==========================================
-- wc_essay_grades 表
-- ==========================================
CREATE POLICY "Allow anon select essay"
  ON public.wc_essay_grades FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon insert essay"
  ON public.wc_essay_grades FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ==========================================
-- wc_drill_history 表
-- ==========================================
CREATE POLICY "Allow anon select drill"
  ON public.wc_drill_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon insert drill"
  ON public.wc_drill_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ==========================================
-- wc_agent_usage_logs 表
-- ==========================================
CREATE POLICY "Allow anon select usage"
  ON public.wc_agent_usage_logs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon insert usage"
  ON public.wc_agent_usage_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ==========================================
-- wc_inspiration_history 表
-- ==========================================
CREATE POLICY "Allow anon select inspiration"
  ON public.wc_inspiration_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon insert inspiration"
  ON public.wc_inspiration_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ==========================================
-- 4. 验证策略
-- ==========================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename LIKE 'wc_%'
ORDER BY tablename, policyname;
