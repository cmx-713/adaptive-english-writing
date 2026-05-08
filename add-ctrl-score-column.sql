-- 审辨信度（CTRL Score）：在 wc_thinking_process 表新增 ctrl_score 列
-- 执行一次即可，现有数据不受影响

ALTER TABLE wc_thinking_process ADD COLUMN IF NOT EXISTS ctrl_score JSONB;

-- ctrl_score 字段结构（JSON）：
-- {
--   "opinionConsistency": 8,        -- 观点一致性 (0-10)
--   "argumentProgression": 7,       -- 论证递进性 (0-10)
--   "linguisticAutonomy": 9,        -- 语言自主性 (0-10)
--   "thoughtExpansion": 6,          -- 观点拓展度 (0-10)
--   "total": 7.55,                  -- 加权总分
--   "explanations": {
--     "opinionConsistency": "...",
--     "argumentProgression": "...",
--     "linguisticAutonomy": "...",
--     "thoughtExpansion": "..."
--   },
--   "overallComment": "...",
--   "analyzedAt": "2026-05-07T14:00:00Z"
-- }
