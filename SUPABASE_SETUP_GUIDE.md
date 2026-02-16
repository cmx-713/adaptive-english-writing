# Supabase 数据库创建与配置指南

## 📋 第一步：创建 Supabase 项目

### 1. 注册/登录 Supabase
1. 访问 [https://supabase.com](https://supabase.com)
2. 点击 "Start your project" 或 "Sign In"
3. 使用 GitHub 账号登录（推荐）

### 2. 创建新项目
1. 点击 "New Project"
2. 填写项目信息：
   - **Name**: `adaptive-english-coach`（或任意名称）
   - **Database Password**: 设置一个强密码（务必保存！）
   - **Region**: 选择 `Northeast Asia (Tokyo)` 或 `Southeast Asia (Singapore)`（离中国最近）
   - **Pricing Plan**: 选择 `Free`（足够初期使用）
3. 点击 "Create new project"，等待 1-2 分钟初始化

---

## 📋 第二步：执行 SQL Schema

### 1. 进入 SQL Editor
1. 在项目侧边栏找到 **"SQL Editor"**
2. 点击 "+ New query"

### 2. 复制并执行 Schema
1. 打开项目根目录的 `supabase-schema.sql` 文件
2. 复制**全部内容**
3. 粘贴到 Supabase SQL Editor
4. 点击右下角 **"Run"** 按钮
5. 等待执行完成（应该显示 "Success"）

### 3. 验证表创建
1. 在侧边栏找到 **"Table Editor"**
2. 应该看到 5 个表：
   - ✅ `users`
   - ✅ `scaffold_history`
   - ✅ `essay_grades`
   - ✅ `drill_history`
   - ✅ `agent_usage_logs`

---

## 📋 第三步：获取 API Keys

### 1. 进入 Project Settings
1. 点击左下角 **齿轮图标** (Settings)
2. 选择 **"API"**

### 2. 复制关键信息
复制以下信息并保存到安全的地方：

```
Project URL: https://xxxxx.supabase.co
anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（仅教师端使用，学生端禁用）
```

**重要**：
- `anon public key`：用于前端（学生端），安全
- `service_role key`：用于管理操作（教师端），**绝对不要泄露！**

---

## 📋 第四步：配置环境变量（本地开发）

### 1. 创建 `.env.local` 文件
在项目根目录创建 `.env.local` 文件：

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 仅教师端使用（不要提交到 Git）
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. 更新 `.gitignore`
确保 `.env.local` 在 `.gitignore` 中：

```
.env.local
.env*.local
```

---

## 📋 第五步：创建测试用户（可选，用于测试）

### 1. 手动插入学生用户
在 SQL Editor 中执行：

```sql
-- 插入测试学生（需要先在 Supabase Auth 中创建用户）
-- 方式1：通过 Auth UI 注册
-- 方式2：使用 SQL 直接插入（仅测试）

INSERT INTO users (id, student_id, name, email, role)
VALUES (
  gen_random_uuid(), 
  '2024001', 
  '张三', 
  'student1@test.com', 
  'student'
);
```

### 2. 手动插入教师用户

```sql
INSERT INTO users (id, student_id, name, email, role)
VALUES (
  gen_random_uuid(), 
  'TEACHER001', 
  '李老师', 
  'teacher@test.com', 
  'teacher'
);
```

**注意**：实际使用时，用户应该通过 Supabase Auth 注册，上述 SQL 仅用于测试。

---

## 📋 第六步：测试数据库连接（Node.js）

### 1. 安装 Supabase 客户端

在项目根目录执行：

```bash
npm install @supabase/supabase-js
```

### 2. 创建测试脚本

创建 `test-supabase-connection.js`：

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xxxxx.supabase.co' // 替换为你的 URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // 替换为你的 anon key

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  // 测试：查询 users 表
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .limit(5)
  
  if (error) {
    console.error('❌ 连接失败:', error)
  } else {
    console.log('✅ 连接成功！用户数据:', data)
  }
}

testConnection()
```

### 3. 运行测试

```bash
node test-supabase-connection.js
```

应该看到：
```
✅ 连接成功！用户数据: [ ... ]
```

---

## 📋 第七步：启用 Email 认证（可选）

### 1. 配置 Auth Providers
1. 进入 **Authentication** → **Providers**
2. 启用 **Email**
3. 配置邮件模板（可选）

### 2. 配置 Site URL（重要）
1. 进入 **Authentication** → **URL Configuration**
2. 设置：
   - **Site URL**: `http://localhost:5173`（本地开发）
   - **Redirect URLs**: `http://localhost:5173/**`（允许所有本地路由）

---

## ✅ 完成检查清单

在进入下一阶段前，请确认：

- [ ] Supabase 项目已创建
- [ ] 5 个表已成功创建（users, scaffold_history, essay_grades, drill_history, agent_usage_logs）
- [ ] RLS 策略已启用
- [ ] API Keys 已保存到 `.env.local`
- [ ] `.env.local` 已添加到 `.gitignore`
- [ ] `@supabase/supabase-js` 已安装
- [ ] 数据库连接测试成功

---

## 🔒 安全注意事项

1. **绝对不要**将 `service_role key` 暴露在前端代码中
2. **绝对不要**将 `.env.local` 提交到 Git
3. RLS 策略确保学生只能访问自己的数据
4. 教师端使用 `service_role key` 时，必须在服务器端（未来可能需要 Cloudflare Workers 或 Edge Functions）

---

## 📞 遇到问题？

常见问题：
1. **SQL 执行失败**：检查是否有语法错误，确保完整复制
2. **RLS 阻止访问**：确保用户已登录，且 `auth.uid()` 正确
3. **连接超时**：检查 Region 选择，尝试其他地区

---

## 🎯 下一步

完成后，请告知我：
1. Supabase 项目 URL（如 `https://xxxxx.supabase.co`）
2. 表是否创建成功
3. 是否遇到任何错误

然后我们将进入**阶段2：前端接入 Supabase**！
