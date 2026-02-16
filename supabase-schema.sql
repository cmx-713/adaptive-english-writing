-- ==========================================
-- Supabase Schema for Adaptive English Writing Coach
-- Created: 2026-02-10
-- ==========================================

-- ==========================================
-- 1. USERS TABLE (用户表)
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT UNIQUE NOT NULL, -- 学号（唯一标识）
  name TEXT NOT NULL, -- 学生姓名
  email TEXT UNIQUE, -- 邮箱（可选，用于登录）
  password_hash TEXT, -- 密码哈希（Supabase Auth 会自动处理）
  role TEXT NOT NULL DEFAULT 'student', -- 角色：'student' 或 'teacher'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_users_student_id ON users(student_id);
CREATE INDEX idx_users_role ON users(role);

-- ==========================================
-- 2. SCAFFOLD_HISTORY TABLE (思维训练记录)
-- ==========================================
CREATE TABLE IF NOT EXISTS scaffold_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL, -- 写作主题
  selected_dimension TEXT NOT NULL, -- 选择的维度（Content/Organization/Proficiency/Clarity）
  user_idea TEXT NOT NULL, -- 学生的初始想法
  vocabulary JSONB NOT NULL DEFAULT '[]', -- VocabularyItem[]
  collocations JSONB NOT NULL DEFAULT '[]', -- CollocationItem[]
  frames JSONB NOT NULL DEFAULT '[]', -- SentenceFrame[]
  draft TEXT, -- 学生写的草稿（可选）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_scaffold_user_id ON scaffold_history(user_id);
CREATE INDEX idx_scaffold_created_at ON scaffold_history(created_at DESC);
CREATE INDEX idx_scaffold_dimension ON scaffold_history(selected_dimension);

-- ==========================================
-- 3. ESSAY_GRADES TABLE (作文批改记录)
-- ==========================================
CREATE TABLE IF NOT EXISTS essay_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL, -- 作文主题
  essay TEXT NOT NULL, -- 学生提交的作文
  total_score NUMERIC(4,1) NOT NULL, -- 总分 0-15
  content_score NUMERIC(3,1) NOT NULL, -- 内容分 0-4
  organization_score NUMERIC(3,1) NOT NULL, -- 组织分 0-3
  proficiency_score NUMERIC(3,1) NOT NULL, -- 语言分 0-5
  clarity_score NUMERIC(3,1) NOT NULL, -- 清晰度分 0-3
  general_comment TEXT, -- 总体评价
  critiques JSONB NOT NULL DEFAULT '[]', -- SentenceCritique[]
  contrastive_learning JSONB NOT NULL DEFAULT '[]', -- ContrastivePoint[]
  retraining JSONB NOT NULL DEFAULT '{}', -- { exercises: [], materials: [] }
  polished_essay TEXT, -- 润色后的范文
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_essay_user_id ON essay_grades(user_id);
CREATE INDEX idx_essay_created_at ON essay_grades(created_at DESC);
CREATE INDEX idx_essay_total_score ON essay_grades(total_score);

-- ==========================================
-- 4. DRILL_HISTORY TABLE (句子特训记录)
-- ==========================================
CREATE TABLE IF NOT EXISTS drill_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL, -- 'grammar_doctor' | 'elevation_lab' | 'structure_architect'
  score INTEGER NOT NULL, -- 得分
  total_questions INTEGER NOT NULL, -- 总题数
  drill_items JSONB NOT NULL DEFAULT '[]', -- DrillItem[]（完整题目和答案，用于教师端复盘）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_drill_user_id ON drill_history(user_id);
CREATE INDEX idx_drill_created_at ON drill_history(created_at DESC);
CREATE INDEX idx_drill_mode ON drill_history(mode);

-- ==========================================
-- 5. AGENT_USAGE_LOGS TABLE (智能体使用统计，用于主站)
-- ==========================================
CREATE TABLE IF NOT EXISTS agent_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL, -- 智能体名称（如 '写作系统'、'扣子智能体1'）
  agent_type TEXT NOT NULL, -- 智能体类型（'writing_system' | 'coze_agent' | 'custom'）
  session_duration INTEGER, -- 会话时长（秒）
  actions_count INTEGER DEFAULT 1, -- 交互次数
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_usage_user_id ON agent_usage_logs(user_id);
CREATE INDEX idx_usage_agent_name ON agent_usage_logs(agent_name);
CREATE INDEX idx_usage_created_at ON agent_usage_logs(created_at DESC);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) 策略
-- ==========================================

-- 启用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scaffold_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE essay_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_usage_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS 策略：USERS 表
-- ==========================================

-- 学生只能读取自己的信息
CREATE POLICY "Students can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id AND role = 'student');

-- 教师可以查看所有学生信息
CREATE POLICY "Teachers can view all users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- 学生可以更新自己的信息
CREATE POLICY "Students can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id AND role = 'student');

-- ==========================================
-- RLS 策略：SCAFFOLD_HISTORY 表
-- ==========================================

-- 学生可以插入自己的记录
CREATE POLICY "Students can insert own scaffold history"
  ON scaffold_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 学生可以查看自己的记录
CREATE POLICY "Students can view own scaffold history"
  ON scaffold_history FOR SELECT
  USING (auth.uid() = user_id);

-- 教师可以查看所有学生的记录
CREATE POLICY "Teachers can view all scaffold history"
  ON scaffold_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ==========================================
-- RLS 策略：ESSAY_GRADES 表
-- ==========================================

-- 学生可以插入自己的记录
CREATE POLICY "Students can insert own essay grades"
  ON essay_grades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 学生可以查看自己的记录
CREATE POLICY "Students can view own essay grades"
  ON essay_grades FOR SELECT
  USING (auth.uid() = user_id);

-- 教师可以查看所有学生的记录
CREATE POLICY "Teachers can view all essay grades"
  ON essay_grades FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ==========================================
-- RLS 策略：DRILL_HISTORY 表
-- ==========================================

-- 学生可以插入自己的记录
CREATE POLICY "Students can insert own drill history"
  ON drill_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 学生可以查看自己的记录
CREATE POLICY "Students can view own drill history"
  ON drill_history FOR SELECT
  USING (auth.uid() = user_id);

-- 教师可以查看所有学生的记录
CREATE POLICY "Teachers can view all drill history"
  ON drill_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ==========================================
-- RLS 策略：AGENT_USAGE_LOGS 表
-- ==========================================

-- 学生可以插入自己的使用记录
CREATE POLICY "Students can insert own usage logs"
  ON agent_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 学生可以查看自己的使用记录
CREATE POLICY "Students can view own usage logs"
  ON agent_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- 教师可以查看所有学生的使用记录
CREATE POLICY "Teachers can view all usage logs"
  ON agent_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- ==========================================
-- 辅助函数：获取用户角色
-- ==========================================
CREATE OR REPLACE FUNCTION get_user_role(user_uuid UUID)
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = user_uuid;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ==========================================
-- 触发器：自动更新 updated_at
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 数据库表结构说明
-- ==========================================

COMMENT ON TABLE users IS '用户表：存储学生和教师信息';
COMMENT ON TABLE scaffold_history IS '思维训练记录：存储语言支架生成历史';
COMMENT ON TABLE essay_grades IS '作文批改记录：存储作文批改结果';
COMMENT ON TABLE drill_history IS '句子特训记录：存储特训历史';
COMMENT ON TABLE agent_usage_logs IS '智能体使用统计：用于主站教师端展示';

-- ==========================================
-- 完成！
-- ==========================================
