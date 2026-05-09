-- 班级受邀名单：教师导入后，仅名单内学号可登录（外校 / 本校学生均可）
-- 在 Supabase SQL Editor 中执行一次

CREATE TABLE IF NOT EXISTS wc_class_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_label TEXT NOT NULL,
  student_plain_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  school TEXT,
  role_kind TEXT NOT NULL DEFAULT 'external_student'
    CHECK (role_kind IN ('external_student', 'student')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_label, student_plain_id)
);

CREATE INDEX IF NOT EXISTS idx_wc_class_roster_role_active
  ON wc_class_roster (role_kind, is_active);

CREATE INDEX IF NOT EXISTS idx_wc_class_roster_class
  ON wc_class_roster (class_label);

COMMENT ON TABLE wc_class_roster IS '教师导入的受邀名单；外校登录在存在任意外校名单记录时强制校验；本校学生在对应班级存在本校名单记录时强制校验';

-- 与 fix-rls-for-quicklogin.sql 一致：anon 可读写（应用层 quickSignIn）
ALTER TABLE public.wc_class_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select roster"
  ON public.wc_class_roster FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon insert roster"
  ON public.wc_class_roster FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow anon update roster"
  ON public.wc_class_roster FOR UPDATE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon delete roster"
  ON public.wc_class_roster FOR DELETE
  TO anon, authenticated
  USING (true);
