-- 议论文审辨信度 v2。先在 Supabase SQL Editor 执行，再部署读取新版字段的代码。
-- 旧 ctrl_score 保留；记叙文评分和作文批改数据不受本迁移影响。
ALTER TABLE public.wc_thinking_process
  ADD COLUMN IF NOT EXISTS ctrl_score_argumentative_v2 JSONB,
  ADD COLUMN IF NOT EXISTS argument_reflection JSONB;

COMMENT ON COLUMN public.wc_thinking_process.ctrl_score_argumentative_v2 IS
  '议论文过程审辨评价 argumentative-ct-v2；旧版和记叙文评分仍保存在 ctrl_score';
COMMENT ON COLUMN public.wc_thinking_process.argument_reflection IS
  '学生本人填写的议论文自检记录 {text, updatedAt}';
