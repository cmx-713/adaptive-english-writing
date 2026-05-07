-- ==========================================
-- Migration: 为 wc_users 表添加 class_name 字段
-- Created: 2026-03-07
-- ==========================================

ALTER TABLE wc_users ADD COLUMN IF NOT EXISTS class_name TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_users_class_name ON wc_users(class_name);

COMMENT ON COLUMN wc_users.class_name IS '班级名称，如 2024级A甲6';
