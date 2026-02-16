-- ==========================================
-- 将表从 writing_coach schema 移回 public schema
-- 并添加表名前缀 wc_
-- ==========================================

-- 1. 移动表回 public schema 并重命名
ALTER TABLE writing_coach.agent_usage_logs SET SCHEMA public;
ALTER TABLE writing_coach.drill_history SET SCHEMA public;
ALTER TABLE writing_coach.essay_grades SET SCHEMA public;
ALTER TABLE writing_coach.scaffold_history SET SCHEMA public;
ALTER TABLE writing_coach.users SET SCHEMA public;

-- 2. 添加前缀重命名（用于区分）
ALTER TABLE public.agent_usage_logs RENAME TO wc_agent_usage_logs;
ALTER TABLE public.drill_history RENAME TO wc_drill_history;
ALTER TABLE public.essay_grades RENAME TO wc_essay_grades;
ALTER TABLE public.scaffold_history RENAME TO wc_scaffold_history;
ALTER TABLE public.users RENAME TO wc_users;

-- 3. 删除旧的 RLS 策略
DROP POLICY IF EXISTS "Students can view own profile" ON public.wc_users;
DROP POLICY IF EXISTS "Teachers can view all users" ON public.wc_users;
DROP POLICY IF EXISTS "Students can update own profile" ON public.wc_users;

DROP POLICY IF EXISTS "Students can insert own scaffold history" ON public.wc_scaffold_history;
DROP POLICY IF EXISTS "Students can view own scaffold history" ON public.wc_scaffold_history;
DROP POLICY IF EXISTS "Teachers can view all scaffold history" ON public.wc_scaffold_history;

DROP POLICY IF EXISTS "Students can insert own essay grades" ON public.wc_essay_grades;
DROP POLICY IF EXISTS "Students can view own essay grades" ON public.wc_essay_grades;
DROP POLICY IF EXISTS "Teachers can view all essay grades" ON public.wc_essay_grades;

DROP POLICY IF EXISTS "Students can insert own drill history" ON public.wc_drill_history;
DROP POLICY IF EXISTS "Students can view own drill history" ON public.wc_drill_history;
DROP POLICY IF EXISTS "Teachers can view all drill history" ON public.wc_drill_history;

DROP POLICY IF EXISTS "Students can insert own usage logs" ON public.wc_agent_usage_logs;
DROP POLICY IF EXISTS "Students can view own usage logs" ON public.wc_agent_usage_logs;
DROP POLICY IF EXISTS "Teachers can view all usage logs" ON public.wc_agent_usage_logs;

-- 4. 重新创建 RLS 策略（使用新表名）
CREATE POLICY "Students can view own profile"
  ON public.wc_users FOR SELECT
  USING (auth.uid() = id AND role = 'student');

CREATE POLICY "Teachers can view all users"
  ON public.wc_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wc_users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

CREATE POLICY "Students can update own profile"
  ON public.wc_users FOR UPDATE
  USING (auth.uid() = id AND role = 'student');

CREATE POLICY "Students can insert own scaffold history"
  ON public.wc_scaffold_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can view own scaffold history"
  ON public.wc_scaffold_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view all scaffold history"
  ON public.wc_scaffold_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wc_users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

CREATE POLICY "Students can insert own essay grades"
  ON public.wc_essay_grades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can view own essay grades"
  ON public.wc_essay_grades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view all essay grades"
  ON public.wc_essay_grades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wc_users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

CREATE POLICY "Students can insert own drill history"
  ON public.wc_drill_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can view own drill history"
  ON public.wc_drill_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view all drill history"
  ON public.wc_drill_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wc_users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

CREATE POLICY "Students can insert own usage logs"
  ON public.wc_agent_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can view own usage logs"
  ON public.wc_agent_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view all usage logs"
  ON public.wc_agent_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wc_users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- 5. 验证
SELECT schemaname, tablename FROM pg_tables 
WHERE tablename LIKE 'wc_%' 
ORDER BY tablename;
