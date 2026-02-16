# 数据库设计文档

## 📊 数据库概览

本系统使用 **Supabase (PostgreSQL)** 作为后端数据库，采用关系型数据库设计。

### 核心设计理念
1. **用户隔离**：通过 Row Level Security (RLS) 确保学生只能访问自己的数据
2. **教师可见**：教师角色可以查看所有学生数据，用于教学分析
3. **JSONB 存储**：复杂结构（如词汇列表、批改反馈）使用 JSONB 格式存储
4. **时间戳追踪**：所有表都有 `created_at`，便于追踪学习历程

---

## 📋 表结构详解

### 1. `users` 表（用户表）

**用途**：存储学生和教师的基本信息

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 用户唯一标识（Supabase Auth 自动生成） | PRIMARY KEY |
| `student_id` | TEXT | 学号（学生）或工号（教师） | UNIQUE, NOT NULL |
| `name` | TEXT | 姓名 | NOT NULL |
| `email` | TEXT | 邮箱（用于登录） | UNIQUE |
| `password_hash` | TEXT | 密码哈希（Supabase Auth 管理） | - |
| `role` | TEXT | 用户角色：`student` 或 `teacher` | NOT NULL, DEFAULT 'student' |
| `created_at` | TIMESTAMPTZ | 账号创建时间 | DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | 最后更新时间 | DEFAULT NOW() |

**索引**：
- `idx_users_student_id`：加速学号查询
- `idx_users_role`：加速角色筛选

**RLS 策略**：
- 学生只能查看/更新自己的信息
- 教师可以查看所有用户信息

---

### 2. `scaffold_history` 表（思维训练记录）

**用途**：存储学生在"思维训练"模块中的语言支架生成历史

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 记录唯一标识 | PRIMARY KEY |
| `user_id` | UUID | 关联用户 | FOREIGN KEY → users(id) |
| `topic` | TEXT | 写作主题 | NOT NULL |
| `selected_dimension` | TEXT | 选择的维度（Content/Organization/Proficiency/Clarity） | NOT NULL |
| `user_idea` | TEXT | 学生的初始想法 | NOT NULL |
| `vocabulary` | JSONB | 核心词汇列表（`VocabularyItem[]`） | DEFAULT '[]' |
| `collocations` | JSONB | 地道搭配列表（`CollocationItem[]`） | DEFAULT '[]' |
| `frames` | JSONB | 句型框架列表（`SentenceFrame[]`） | DEFAULT '[]' |
| `draft` | TEXT | 学生写的草稿（可选） | - |
| `created_at` | TIMESTAMPTZ | 记录创建时间 | DEFAULT NOW() |

**JSONB 字段示例**：

```json
// vocabulary
[
  {
    "word": "data leakage",
    "chinese": "数据泄露",
    "englishDefinition": "When training data accidentally contains information from test data",
    "usage": "Avoid data leakage by separating datasets properly.",
    "usageChinese": "通过适当分离数据集来避免数据泄露。"
  }
]

// collocations
[
  { "en": "pose a threat", "zh": "构成威胁" }
]

// frames
[
  {
    "patternName": "Not only...but also...",
    "patternNameZh": "不仅……而且还……",
    "template": "Not only do [培养什么能力], but...",
    "modelSentence": "Not only do these activities foster critical thinking, but..."
  }
]
```

**索引**：
- `idx_scaffold_user_id`：加速用户历史查询
- `idx_scaffold_created_at`：支持时间排序
- `idx_scaffold_dimension`：支持维度统计

**RLS 策略**：
- 学生可以插入/查看自己的记录
- 教师可以查看所有记录

---

### 3. `essay_grades` 表（作文批改记录）

**用途**：存储学生提交的作文及批改结果

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 记录唯一标识 | PRIMARY KEY |
| `user_id` | UUID | 关联用户 | FOREIGN KEY → users(id) |
| `topic` | TEXT | 作文主题 | NOT NULL |
| `essay` | TEXT | 学生提交的作文 | NOT NULL |
| `total_score` | NUMERIC(4,1) | 总分（0-15） | NOT NULL |
| `content_score` | NUMERIC(3,1) | 内容分（0-4） | NOT NULL |
| `organization_score` | NUMERIC(3,1) | 组织分（0-3） | NOT NULL |
| `proficiency_score` | NUMERIC(3,1) | 语言分（0-5） | NOT NULL |
| `clarity_score` | NUMERIC(3,1) | 清晰度分（0-3） | NOT NULL |
| `general_comment` | TEXT | 总体评价 | - |
| `critiques` | JSONB | 句子级批注（`SentenceCritique[]`） | DEFAULT '[]' |
| `contrastive_learning` | JSONB | 对比学习要点（`ContrastivePoint[]`） | DEFAULT '[]' |
| `retraining` | JSONB | 针对性训练（`{ exercises: [], materials: [] }`） | DEFAULT '{}' |
| `polished_essay` | TEXT | 润色后的范文 | - |
| `created_at` | TIMESTAMPTZ | 批改时间 | DEFAULT NOW() |

**JSONB 字段示例**：

```json
// critiques
[
  {
    "original": "fames,adulations",
    "context": "However humanbeings are not classified by fames,adulations...",
    "revised": "fame and adulation",
    "category": "Proficiency",
    "severity": "critical",
    "explanation": "拼写错误且缺少连词"
  }
]

// retraining
{
  "exercises": [
    {
      "type": "Academic Upgrade",
      "question": "请改写下面的句子，使用更学术的表达...",
      "hint": "使用 'contribute to' 替代 'help'",
      "mandatoryKeywords": ["contribute to", "academic"],
      "referenceAnswer": "...",
      "explanation": "学术写作需要避免口语化表达"
    }
  ],
  "materials": [
    {
      "wordOrPhrase": "contribute to",
      "definition": "有助于，促进",
      "example": "Regular exercise contributes to better health."
    }
  ]
}
```

**索引**：
- `idx_essay_user_id`：加速用户历史查询
- `idx_essay_created_at`：支持时间排序
- `idx_essay_total_score`：支持分数筛选

**RLS 策略**：
- 学生可以插入/查看自己的记录
- 教师可以查看所有记录

---

### 4. `drill_history` 表（句子特训记录）

**用途**：存储学生在"句子特训"模块中的练习历史

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 记录唯一标识 | PRIMARY KEY |
| `user_id` | UUID | 关联用户 | FOREIGN KEY → users(id) |
| `mode` | TEXT | 特训模式（`grammar_doctor` \| `elevation_lab` \| `structure_architect`） | NOT NULL |
| `score` | INTEGER | 得分 | NOT NULL |
| `total_questions` | INTEGER | 总题数 | NOT NULL |
| `drill_items` | JSONB | 完整题目和答案（`DrillItem[]`），用于教师端复盘 | DEFAULT '[]' |
| `created_at` | TIMESTAMPTZ | 记录创建时间 | DEFAULT NOW() |

**索引**：
- `idx_drill_user_id`：加速用户历史查询
- `idx_drill_created_at`：支持时间排序
- `idx_drill_mode`：支持模式统计

**RLS 策略**：
- 学生可以插入/查看自己的记录
- 教师可以查看所有记录

---

### 5. `agent_usage_logs` 表（智能体使用统计）

**用途**：记录学生使用各个智能体的次数和时长，用于主站教师端统计

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 记录唯一标识 | PRIMARY KEY |
| `user_id` | UUID | 关联用户 | FOREIGN KEY → users(id) |
| `agent_name` | TEXT | 智能体名称（如 '写作系统'、'扣子智能体1'） | NOT NULL |
| `agent_type` | TEXT | 智能体类型（`writing_system` \| `coze_agent` \| `custom`） | NOT NULL |
| `session_duration` | INTEGER | 会话时长（秒） | - |
| `actions_count` | INTEGER | 交互次数 | DEFAULT 1 |
| `created_at` | TIMESTAMPTZ | 使用时间 | DEFAULT NOW() |

**索引**：
- `idx_usage_user_id`：加速用户统计
- `idx_usage_agent_name`：支持智能体筛选
- `idx_usage_created_at`：支持时间排序

**RLS 策略**：
- 学生可以插入/查看自己的记录
- 教师可以查看所有记录

---

## 🔐 Row Level Security (RLS) 策略总结

### 学生权限
- ✅ **SELECT**：只能查看自己的数据
- ✅ **INSERT**：可以插入自己的数据
- ❌ **UPDATE/DELETE**：暂不开放（避免篡改历史）

### 教师权限
- ✅ **SELECT**：可以查看所有学生的数据
- ❌ **INSERT/UPDATE/DELETE**：暂不开放（教师端只读）

### RLS 实现原理
使用 `auth.uid()` 函数获取当前登录用户的 UUID，与表中的 `user_id` 对比：

```sql
-- 学生策略示例
CREATE POLICY "Students can view own data"
  ON scaffold_history FOR SELECT
  USING (auth.uid() = user_id);

-- 教师策略示例
CREATE POLICY "Teachers can view all data"
  ON scaffold_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );
```

---

## 📈 数据关系图

```
users (用户表)
  ├─→ scaffold_history (思维训练)
  ├─→ essay_grades (作文批改)
  ├─→ drill_history (句子特训)
  └─→ agent_usage_logs (使用统计)
```

**外键约束**：所有表都通过 `user_id` 关联到 `users` 表，级联删除（`ON DELETE CASCADE`）。

---

## 🎯 教师端数据查询示例

### 1. 查询班级平均分数趋势

```sql
SELECT 
  DATE(created_at) as date,
  AVG(total_score) as avg_score,
  AVG(content_score) as avg_content,
  AVG(organization_score) as avg_organization,
  AVG(proficiency_score) as avg_proficiency,
  AVG(clarity_score) as avg_clarity
FROM essay_grades
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

### 2. 查询学生弱点分布

```sql
SELECT 
  user_id,
  COUNT(*) FILTER (WHERE content_score < 2) as weak_content,
  COUNT(*) FILTER (WHERE organization_score < 1.5) as weak_organization,
  COUNT(*) FILTER (WHERE proficiency_score < 2.5) as weak_proficiency,
  COUNT(*) FILTER (WHERE clarity_score < 1.5) as weak_clarity
FROM essay_grades
GROUP BY user_id;
```

### 3. 查询智能体使用排行

```sql
SELECT 
  agent_name,
  COUNT(*) as usage_count,
  COUNT(DISTINCT user_id) as unique_users
FROM agent_usage_logs
GROUP BY agent_name
ORDER BY usage_count DESC;
```

---

## ⚡ 性能优化建议

1. **定期清理旧数据**：超过1年的历史记录可以归档
2. **JSONB 索引**：如果需要频繁查询 JSONB 字段，可以创建 GIN 索引
3. **分区表**：如果数据量超过百万级，考虑按时间分区

---

## 🔄 未来扩展方向

1. **添加班级表**：`classes` 表，支持班级管理
2. **添加作业表**：`assignments` 表，教师发布作业，学生提交
3. **添加评论表**：`comments` 表，教师可以对学生作文添加批注
4. **添加标签系统**：为学生打标签（如"语法薄弱"、"逻辑强"）

---

## ✅ 完成确认

阅读完本文档后，请确保理解：
- [ ] 5 个表的用途和字段含义
- [ ] RLS 策略如何保护数据
- [ ] JSONB 字段的数据格式
- [ ] 表之间的关联关系

如有疑问，请在执行 SQL 前提出！
