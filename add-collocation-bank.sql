-- ==========================================
-- wc_collocation_bank：个人地道搭配银行
-- 每位学生的高频学术搭配云端持久化存储
-- ==========================================

CREATE TABLE IF NOT EXISTS public.wc_collocation_bank (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.wc_users(id) ON DELETE CASCADE,
  en          text NOT NULL,                 -- 英文搭配
  zh          text NOT NULL,                 -- 中文释义
  topic       text,                          -- 首次来源话题
  frequency   integer NOT NULL DEFAULT 1,   -- 出现频次（同搭配累加）
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, en)                       -- 同一用户同一搭配唯一
);

-- ==========================================
-- RLS 策略（与 wc_vocabulary_bank 保持一致）
-- ==========================================

ALTER TABLE public.wc_collocation_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select collocation" ON public.wc_collocation_bank
  FOR SELECT USING (true);

CREATE POLICY "Allow insert collocation" ON public.wc_collocation_bank
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update collocation" ON public.wc_collocation_bank
  FOR UPDATE USING (true);

CREATE POLICY "Allow delete collocation" ON public.wc_collocation_bank
  FOR DELETE USING (true);

-- ==========================================
-- 显式 GRANT（应对 Supabase Data API 策略变更）
-- ==========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_collocation_bank TO anon, authenticated;

-- ==========================================
-- 索引
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_collocation_bank_user ON public.wc_collocation_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_collocation_bank_en   ON public.wc_collocation_bank(user_id, en);
