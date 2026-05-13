-- ==========================================
-- 审辨写作训练系统 · 全表显式 GRANT 脚本
-- 应对 Supabase Data API 策略变更（2026-05-30 / 2026-10-30）
-- 确保 supabase-js (anon / authenticated) 可正常访问所有 wc_* 表
--
-- 使用方式：在 Supabase SQL Editor 中直接运行整个脚本
-- 幂等：多次运行无副作用
-- ==========================================

-- 用户表
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_users              TO anon, authenticated;

-- 班级名单表
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_class_roster       TO anon, authenticated;

-- 思维训练 · 支架记录
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_scaffold_history   TO anon, authenticated;

-- 思维训练 · 灵感卡记录
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_inspiration_history TO anon, authenticated;

-- 思维训练 · 完整思维过程（含审辨信度）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_thinking_process   TO anon, authenticated;

-- 作文批改记录
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_essay_grades       TO anon, authenticated;

-- 句子特训记录
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_drill_history      TO anon, authenticated;

-- 使用日志
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_agent_usage_logs   TO anon, authenticated;

-- 词汇银行（新建表，需要显式 GRANT）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_vocabulary_bank    TO anon, authenticated;

-- 地道搭配银行（新建表，需要显式 GRANT）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_collocation_bank   TO anon, authenticated;
