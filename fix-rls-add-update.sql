-- ==========================================
-- 修复：添加 UPDATE 权限到 RLS 策略
-- 
-- 原因：updateScaffoldDraft 和 saveAssembledEssayToSupabase
--       需要 UPDATE 权限，之前只创建了 INSERT 和 SELECT
--
-- 执行方式：在 Supabase SQL Editor 中执行此脚本
-- ==========================================

-- wc_scaffold_history 表：允许更新（用于保存草稿）
CREATE POLICY "Allow anon update scaffold"
  ON public.wc_scaffold_history FOR UPDATE
  TO anon, authenticated
  USING (true);

-- wc_inspiration_history 表：允许更新（用于保存组合成文）
CREATE POLICY "Allow anon update inspiration"
  ON public.wc_inspiration_history FOR UPDATE
  TO anon, authenticated
  USING (true);

-- 验证
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('wc_scaffold_history', 'wc_inspiration_history')
ORDER BY tablename, cmd;
