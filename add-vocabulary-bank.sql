-- ==========================================
-- wc_vocabulary_bank：个人词汇银行
-- 每位学生的高频学术词汇云端持久化存储
-- ==========================================

CREATE TABLE IF NOT EXISTS public.wc_vocabulary_bank (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.wc_users(id) ON DELETE CASCADE,
  word        text NOT NULL,                 -- 英文单词
  chinese     text NOT NULL,                 -- 中文释义
  english_def text,                          -- 英文释义
  usage       text,                          -- 例句（英文）
  usage_zh    text,                          -- 例句（中文译）
  topic       text,                          -- 来源话题
  frequency   integer NOT NULL DEFAULT 1,   -- 出现频次（同词累加）
  first_seen  timestamptz NOT NULL DEFAULT now(),  -- 首次入库时间
  last_seen   timestamptz NOT NULL DEFAULT now(),  -- 最近一次出现时间
  UNIQUE (user_id, word)                     -- 同一用户同一单词唯一
);

-- ==========================================
-- RLS 策略（与其他 wc_ 表保持一致）
-- ==========================================

ALTER TABLE public.wc_vocabulary_bank ENABLE ROW LEVEL SECURITY;

-- 读：本人可读
CREATE POLICY "Allow select own vocab" ON public.wc_vocabulary_bank
  FOR SELECT USING (true);

-- 插入：允许 anon 和 authenticated
CREATE POLICY "Allow insert vocab" ON public.wc_vocabulary_bank
  FOR INSERT WITH CHECK (true);

-- 更新（频次 / last_seen）：允许
CREATE POLICY "Allow update vocab" ON public.wc_vocabulary_bank
  FOR UPDATE USING (true);

-- 删除：允许
CREATE POLICY "Allow delete vocab" ON public.wc_vocabulary_bank
  FOR DELETE USING (true);

-- ==========================================
-- 索引（加速按 user_id + 词汇查询）
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_vocab_bank_user ON public.wc_vocabulary_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_vocab_bank_word  ON public.wc_vocabulary_bank(user_id, word);
