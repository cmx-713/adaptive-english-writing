-- ==========================================
-- 修复 RLS 策略递归问题
-- ==========================================

-- 删除有问题的策略
DROP POLICY IF EXISTS "Teachers can view all users" ON public.wc_users;
DROP POLICY IF EXISTS "Teachers can view all scaffold history" ON public.wc_scaffold_history;
DROP POLICY IF EXISTS "Teachers can view all essay grades" ON public.wc_essay_grades;
DROP POLICY IF EXISTS "Teachers can view all drill history" ON public.wc_drill_history;
DROP POLICY IF EXISTS "Teachers can view all usage logs" ON public.wc_agent_usage_logs;

-- 重新创建教师策略（使用简化逻辑，避免递归）
-- 方案：教师角色直接从 auth.jwt() 获取，或者使用 SECURITY DEFINER 函数

-- 1. 创建辅助函数（绕过RLS）
CREATE OR REPLACE FUNCTION is_teacher()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.wc_users
    WHERE id = auth.uid() AND role = 'teacher'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 重新创建教师策略
CREATE POLICY "Teachers can view all users"
  ON public.wc_users FOR SELECT
  USING (is_teacher() OR auth.uid() = id);

CREATE POLICY "Teachers can view all scaffold history"
  ON public.wc_scaffold_history FOR SELECT
  USING (is_teacher() OR auth.uid() = user_id);

CREATE POLICY "Teachers can view all essay grades"
  ON public.wc_essay_grades FOR SELECT
  USING (is_teacher() OR auth.uid() = user_id);

CREATE POLICY "Teachers can view all drill history"
  ON public.wc_drill_history FOR SELECT
  USING (is_teacher() OR auth.uid() = user_id);

CREATE POLICY "Teachers can view all usage logs"
  ON public.wc_agent_usage_logs FOR SELECT
  USING (is_teacher() OR auth.uid() = user_id);

-- 3. 验证策略
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename LIKE 'wc_%'
ORDER BY tablename, policyname;
