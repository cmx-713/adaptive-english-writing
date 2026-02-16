-- ==========================================
-- 安全注册函数（绕过 RLS）
-- ==========================================

-- 1. 创建学生注册函数
CREATE OR REPLACE FUNCTION public.register_student(
  p_student_id TEXT,
  p_name TEXT,
  p_email TEXT
)
RETURNS TABLE(
  id UUID,
  student_id TEXT,
  name TEXT,
  email TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER -- 关键：以函数所有者权限运行，绕过 RLS
AS $$
BEGIN
  -- 检查学号是否已存在
  IF EXISTS (SELECT 1 FROM public.wc_users WHERE wc_users.student_id = p_student_id) THEN
    -- 返回现有用户
    RETURN QUERY
    SELECT wc_users.id, wc_users.student_id, wc_users.name, wc_users.email, wc_users.role, wc_users.created_at
    FROM public.wc_users
    WHERE wc_users.student_id = p_student_id;
  ELSE
    -- 创建新用户
    RETURN QUERY
    INSERT INTO public.wc_users (student_id, name, email, role)
    VALUES (p_student_id, p_name, p_email, 'student')
    RETURNING wc_users.id, wc_users.student_id, wc_users.name, wc_users.email, wc_users.role, wc_users.created_at;
  END IF;
END;
$$;

-- 2. 授权所有用户（包括匿名用户）调用此函数
GRANT EXECUTE ON FUNCTION public.register_student(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.register_student(TEXT, TEXT, TEXT) TO authenticated;

-- 3. 验证函数
SELECT * FROM public.register_student('test001', '测试学生', 'test001@temp.local');
