-- ==========================================
-- 修复 RLS 策略：适配 writing_coach schema
-- 执行时间：2026-02-10
-- ==========================================

-- ==========================================
-- 1. 删除旧的 RLS 策略（public schema 的）
-- ==========================================

-- USERS 表策略
DROP POLICY IF EXISTS "Students can view own profile" ON writing_coach.users;
DROP POLICY IF EXISTS "Teachers can view all users" ON writing_coach.users;
DROP POLICY IF EXISTS "Students can update own profile" ON writing_coach.users;

-- SCAFFOLD_HISTORY 表策略
DROP POLICY IF EXISTS "Students can insert own scaffold history" ON writing_coach.scaffold_history;
DROP POLICY IF EXISTS "Students can view own scaffold history" ON writing_coach.scaffold_history;
DROP POLICY IF EXISTS "Teachers can view all scaffold history" ON writing_coach.scaffold_history;

-- ESSAY_GRADES 表策略
DROP POLICY IF EXISTS "Students can insert own essay grades" ON writing_coach.essay_grades;
DROP POLICY IF EXISTS "Students can view own essay grades" ON writing_coach.essay_grades;
DROP POLICY IF EXISTS "Teachers can view all essay grades" ON writing_coach.essay_grades;

-- DRILL_HISTORY 表策略
DROP POLICY IF EXISTS "Students can insert own drill history" ON writing_coach.drill_history;
DROP POLICY IF EXISTS "Students can view own drill history" ON writing_coach.drill_history;
DROP POLICY IF EXISTS "Teachers can view all drill history" ON writing_coach.drill_history;

-- AGENT_USAGE_LOGS 表策略
DROP POLICY IF EXISTS "Students can insert own usage logs" ON writing_coach.agent_usage_logs;
DROP POLICY IF EXISTS "Students can view own usage logs" ON writing_coach.agent_usage_logs;
DROP POLICY IF EXISTS "Teachers can view all usage logs" ON writing_coach.agent_usage_logs;

-- ==========================================
-- 2. 重新创建 RLS 策略（使用正确的 schema 引用）
-- ==========================================

-- ==========================================
-- RLS 策略：USERS 表
-- ==========================================

-- 学生只能读取自己的信息
CREATE POLICY "Students can view own profile"
  ON writing_coach.users FOR SELECT
  USING (auth.uid() = id AND role = 'student');

-- 教师可以查看所有学生信息
CREATE POLICY "Teachers can view all users"
  ON writing_coach.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM writing_coach.users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- 学生可以更新自己的信息
CREATE POLICY "Students can update own profile"
  ON writing_coach.users FOR UPDATE
  USING (auth.uid() = id AND role = 'student');

-- ==========================================
-- RLS 策略：SCAFFOLD_HISTORY 表
-- ==========================================

-- 学生可以插入自己的记录
CREATE POLICY "Students can insert own scaffold history"
  ON writing_coach.scaffold_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 学生可以查看自己的记录
CREATE POLICY "Students can view own scaffold history"
  ON writing_coach.scaffold_history FOR SELECT
  USING (auth.uid() = user_id);

-- 教师可以查看所有学生的记录
CREATE POLICY "Teachers can view all scaffold history"
  ON writing_coach.scaffold_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM writing_coach.users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ==========================================
-- RLS 策略：ESSAY_GRADES 表
-- ==========================================

-- 学生可以插入自己的记录
CREATE POLICY "Students can insert own essay grades"
  ON writing_coach.essay_grades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 学生可以查看自己的记录
CREATE POLICY "Students can view own essay grades"
  ON writing_coach.essay_grades FOR SELECT
  USING (auth.uid() = user_id);

-- 教师可以查看所有学生的记录
CREATE POLICY "Teachers can view all essay grades"
  ON writing_coach.essay_grades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM writing_coach.users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ==========================================
-- RLS 策略：DRILL_HISTORY 表
-- ==========================================

-- 学生可以插入自己的记录
CREATE POLICY "Students can insert own drill history"
  ON writing_coach.drill_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 学生可以查看自己的记录
CREATE POLICY "Students can view own drill history"
  ON writing_coach.drill_history FOR SELECT
  USING (auth.uid() = user_id);

-- 教师可以查看所有学生的记录
CREATE POLICY "Teachers can view all drill history"
  ON writing_coach.drill_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM writing_coach.users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ==========================================
-- RLS 策略：AGENT_USAGE_LOGS 表
-- ==========================================

-- 学生可以插入自己的使用记录
CREATE POLICY "Students can insert own usage logs"
  ON writing_coach.agent_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 学生可以查看自己的使用记录
CREATE POLICY "Students can view own usage logs"
  ON writing_coach.agent_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- 教师可以查看所有学生的使用记录
CREATE POLICY "Teachers can view all usage logs"
  ON writing_coach.agent_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM writing_coach.users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ==========================================
-- 3. 授权 writing_coach schema 的访问权限
-- ==========================================

GRANT USAGE ON SCHEMA writing_coach TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA writing_coach TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA writing_coach TO anon, authenticated;

-- 未来新增表时自动授权
ALTER DEFAULT PRIVILEGES IN SCHEMA writing_coach GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA writing_coach GRANT ALL ON SEQUENCES TO anon, authenticated;

-- ==========================================
-- 4. 验证 RLS 策略
-- ==========================================

-- 查看所有策略
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'writing_coach'
ORDER BY tablename, policyname;

-- ==========================================
-- 完成！
-- ==========================================
