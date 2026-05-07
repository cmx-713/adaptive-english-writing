-- 外校用户支持：在 wc_users 表新增字段
-- 执行一次即可，现有数据不受影响

-- 学校/学院名称（外校用户注册时填写）
ALTER TABLE wc_users ADD COLUMN IF NOT EXISTS school TEXT;

-- 关联 Supabase Auth 的 UUID（外校用户使用邮箱密码登录时填写）
ALTER TABLE wc_users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
