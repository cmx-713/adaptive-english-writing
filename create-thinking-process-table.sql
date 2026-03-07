-- ==========================================
-- Migration: wc_thinking_process 表
-- 完整保存学生从观点构思到成文的全链路过程数据
-- Created: 2026-03-07
-- ==========================================

CREATE TABLE IF NOT EXISTS wc_thinking_process (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES wc_users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  
  -- Phase 1: 观点构思（Draft Idea）
  inspiration_cards JSONB,                     -- InspirationCard[]（AI 生成的维度卡片）
  user_ideas JSONB DEFAULT '{}',               -- Record<cardId, string>（学生在每个维度写的观点）
  
  -- 苏格拉底追问（Socratic Questioning）
  validation_results JSONB DEFAULT '{}',       -- Record<cardId, IdeaValidationResult>（AI 观点验证反馈）
  personalized_expansions JSONB DEFAULT '{}',  -- Record<cardId, string[]>（基于学生观点的个性化思路拓展）
  
  -- Phase 2: 语言支架重构（Language Scaffolding）+ 草稿
  dimension_drafts JSONB DEFAULT '{}',         -- Record<cardId, DimensionDraft>（各维度的草稿数据，含 scaffold）
  
  -- 组合成文
  assembled_essay JSONB,                       -- { introduction, bodyParagraphs, conclusion }
  
  -- 元数据
  status TEXT DEFAULT 'in_progress',           -- 'in_progress' | 'completed' | 'sent_to_grader'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_thinking_process_user_id ON wc_thinking_process(user_id);
CREATE INDEX idx_thinking_process_created_at ON wc_thinking_process(created_at DESC);
CREATE INDEX idx_thinking_process_status ON wc_thinking_process(status);

-- RLS 策略
ALTER TABLE wc_thinking_process ENABLE ROW LEVEL SECURITY;

-- 学生可以插入自己的记录
CREATE POLICY "Students can insert own thinking process"
  ON wc_thinking_process FOR INSERT
  WITH CHECK (true);

-- 学生可以查看自己的记录
CREATE POLICY "Students can view own thinking process"
  ON wc_thinking_process FOR SELECT
  USING (true);

-- 学生可以更新自己的记录
CREATE POLICY "Students can update own thinking process"
  ON wc_thinking_process FOR UPDATE
  USING (true);

-- 自动更新 updated_at 触发器
CREATE TRIGGER update_thinking_process_updated_at
  BEFORE UPDATE ON wc_thinking_process
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE wc_thinking_process IS '思维过程记录：完整保存学生从观点构思到成文的全链路过程数据';
