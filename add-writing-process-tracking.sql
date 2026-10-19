-- ==========================================
-- Migration: 记录议论文与记叙文的完整写作过程
-- 可重复执行：所有字段使用 IF NOT EXISTS
-- ==========================================

-- 阶段记录主表：保存文体与每轮导师追问链路
ALTER TABLE public.wc_thinking_process
  ADD COLUMN IF NOT EXISTS writing_mode TEXT NOT NULL DEFAULT 'argumentative',
  ADD COLUMN IF NOT EXISTS coaching_turns JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.wc_thinking_process
  DROP CONSTRAINT IF EXISTS wc_thinking_process_writing_mode_check;

ALTER TABLE public.wc_thinking_process
  ADD CONSTRAINT wc_thinking_process_writing_mode_check
  CHECK (writing_mode IN ('argumentative', 'narrative'));

CREATE INDEX IF NOT EXISTS idx_thinking_process_writing_mode
  ON public.wc_thinking_process(writing_mode);

COMMENT ON COLUMN public.wc_thinking_process.coaching_turns IS
  '按 cardId 保存导师每轮问题、提示、学生回答和导师反馈的完整链路';

-- 阶段性灵感卡与语言支架：便于教师按文体筛选
ALTER TABLE public.wc_inspiration_history
  ADD COLUMN IF NOT EXISTS writing_mode TEXT NOT NULL DEFAULT 'argumentative';

ALTER TABLE public.wc_scaffold_history
  ADD COLUMN IF NOT EXISTS writing_mode TEXT NOT NULL DEFAULT 'argumentative';

-- 作文批改结果：区分叙事评价与议论文评价
ALTER TABLE public.wc_essay_grades
  ADD COLUMN IF NOT EXISTS writing_mode TEXT NOT NULL DEFAULT 'argumentative';

CREATE INDEX IF NOT EXISTS idx_essay_grades_writing_mode
  ON public.wc_essay_grades(writing_mode);

COMMENT ON COLUMN public.wc_essay_grades.writing_mode IS
  '作文类型：argumentative 或 narrative';
