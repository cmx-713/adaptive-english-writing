# 议论文审辨信度新量规实施计划

**目标：** 用学生可观察的论证思维行为评价议论文写作过程；保存旧四维分数，支持已提交议论文按新版重评；不改变记叙文评分与作文批改。

**架构：** 新增独立的 `argumentative-ct-v2` 评分函数与 Supabase JSONB 字段 `ctrl_score_argumentative_v2`。原 `ctrl_score` 保留旧议论文评分及现行记叙文评分。界面和导出按文体、版本读取相应字段；教师端只对符合条件的议论文执行新版批量重评。

**技术栈：** React、TypeScript、Supabase/Postgres、现有大模型调用接口。数据库改动需在实际 Supabase 项目执行 SQL 后才可启用云端保存。

---

## 一、评分契约

新版议论文三项能力等权，各项满分 10 分：

| 字段 | 学生可观察行为 | 主要证据 |
| --- | --- | --- |
| `argumentEvidence`（论点与依据辨识） | 明确主张；从事实、案例或可核查信息中选择相关依据；区分事实与自己的推断 | 初步观点、对导师追问的回答、学生草稿 |
| `reasoningConditions`（推理与条件审查） | 解释依据怎样支持主张；检查前提、适用条件和边界；情境适合时考虑其他解释 | 追问回答、学生草稿、学生自己写的终稿 |
| `argumentRevision`（自我监控与有据修订） | 发现原观点或论证缺口；有依据地补充、修改，或说明为何保留原判断 | 原始构想、学生回答、学生明确表达的修订理由及后续文本 |

每项采用相同的四档：9–10（清楚且有具体过程证据）、6–8（基本做到，解释仍可深化）、3–5（仅有局部表现）、0–2（现有学生回答明确显示该能力缺失）。每档在评分提示词中写入该维度的具体锚点，禁止用篇幅、过渡词、英语水平或是否采纳 AI 建议代替思维证据。

缺少过程记录时返回 `score: null`、`evidenceStatus: insufficient`，并解释缺少哪类材料；不能默认填 5 分或把“未记录”判作 0 分。三项都有分数才计算总分，保留一位小数。允许学生有理由地维持原观点；不要求每篇文章都写反方观点。

建议存储结构：

```ts
type ArgumentativeCtrlV2 = {
  rubricVersion: 'argumentative-ct-v2';
  writingMode: 'argumentative';
  dimensions: Record<'argumentEvidence' | 'reasoningConditions' | 'argumentRevision', {
    score: number | null;
    evidenceStatus: 'sufficient' | 'insufficient';
    evidence: Array<{ source: 'initial_idea' | 'student_answer' | 'student_draft' | 'student_final' | 'student_reflection'; cardId?: string; quote: string }>;
    explanation: string;
  }>;
  total: number | null;
  overallComment: string;
  analyzedAt: string;
  source: 'auto' | 'teacher_manual';
  reviewed: boolean;
};
```

引用必须能在所标明的学生文本中找到。导师问题、导师反馈、AI 拓展建议、AI 自动整理的路线图和未被学生明确改写的 AI 范例均不能作为能力证据。只有终稿、没有先后过程时，不能判定“有据修订”。

## 二、执行任务

### 任务 1：确认旧记录可重评范围与安全边界

**检查：** `create-thinking-process-table.sql`、`add-ctrl-score-column.sql`、`services/supabaseDataService.ts`、实际 Supabase 表结构与授权。

1. 统计 `wc_thinking_process` 中议论文已提交记录数量，以及 `user_ideas`、`validation_results`、`dimension_drafts`、`assembled_essay` 的非空率；单独列出只有终稿或仅有旧 `ctrl_score` 的记录。
2. 核对生产环境的 `writing_mode`、`ctrl_score` 列及现行 RLS/GRANT；代码中的 SQL 文件不能代替云端结构核对。
3. 抽取脱敏的议论文样例，覆盖“一轮完成”“两轮追问”“有理由保留观点”“无导师回答”“只存终稿”；另抽取记叙文样例作隔离检查。

**产出：** 可重评、部分可评、证据不足三类数量和样例清单。不改动任何旧分数。

### 任务 2：冻结量规与证据判定

**修改：** 新建 `services/argumentativeCtrlRubric.ts`；修改 `services/geminiService.ts` 的议论文评分分支。

1. 将三项能力的四档描述、必要证据与不适用条件写成一个版本常量 `argumentative-ct-v2`。
2. 新增 `analyzeArgumentativeCtrlScoreV2`，只接收学生实际填写的构思、回答、草稿、终稿和可确认由学生输入的自检说明。沿用现有底层模型接口，单独设置响应 schema。
3. 用可验证的原文引用做后处理：引文找不到、模型把 AI 内容当学生内容、某一项证据不足时，将该项标为 `insufficient`，不生成猜测分数；输出字段校验失败时提示重试，不写入半成品。
4. 旧四维量规与记叙文 `narrative-ct-v2` 的评分函数、字段和权重保持原状，供旧记录展示与记叙文使用。

**验收：** 同一学生文本可以追溯每项分数的原文依据；仅把文章写长或采用 AI 建议不会自动提高分数。

### 任务 3：新增独立存储，保留历史分数

**新建：** `add-argumentative-ctrl-v2-column.sql`。

**修改：** `services/supabaseDataService.ts`。

1. 为 `wc_thinking_process` 增加 `ctrl_score_argumentative_v2 JSONB` 和 `argument_reflection JSONB`，不更新原 `ctrl_score`。生产环境执行 SQL 前先确认表名、列名和权限；迁移本身不回填评分。
2. 新增 `saveArgumentativeCtrlScoreV2(processId, score)`，只写新版字段。保留当前 `saveCtrlScore` 给记叙文和旧记录操作使用。
3. 写入时核对过程记录属于议论文，避免把新版议论文结果写到记叙文过程。

**验收：** 同一议论文过程可同时读到旧四维评分与新三维评分；记叙文记录及 `wc_essay_grades` 不发生变化。

### 任务 4：补齐未来记录中的学生自检证据

**修改：** `components/PhaseOneCards.tsx`、`modules/SocraticCoach.tsx`、`services/supabaseDataService.ts`，必要时扩展 `types.ts`。

1. 议论文在送批改前提供一条简短的自检记录：“这次我补充、调整或保留了什么判断？依据是什么？”学生可跳过，不阻止交稿。
2. 将学生原文和输入时间写入新增的 `argument_reflection JSONB`（`{ text, updatedAt }`），与 AI 自动生成的 `revisedIdea` 分开存储。现有 `validation_results` 中的学生追问回答继续作为主要过程证据。
3. 保存和恢复该输入，确保刷新、从历史返回后内容仍在；记叙文页面不显示此输入。

**验收：** 自检记录确由学生输入；跳过时作文仍可提交，评分结果对缺少的能力证据如实标注。

### 任务 5：调整新作文评分时机

**修改：** `modules/SocraticCoach.tsx`。

1. 移除议论文“进入组合成文即评分”的触发点；此时引言、结论尚为空。
2. 学生点击“发送到作文批改”时先保存提交快照，再以该快照触发新版议论文评分并写入 `ctrl_score_argumentative_v2`；评分异步进行，不阻塞批改页面。保存或评分失败须可见并可重试。
3. 记叙文现行提交后评分路径保持不变。

**验收：** 新议论文评分依据的是提交时的版本；编辑组合成文期间不会生成一个提前评分。

### 任务 6：按文体和版本展示，不混算趋势

**修改：** `components/ThinkingProcessView.tsx`、`modules/ProfileCenter.tsx`、`modules/TeacherDashboard.tsx` 及其导出字段。

1. 议论文过程优先展示新版三项能力；旧四维记录明确标“旧版量规”，允许教师查看旧分；记叙文仍显示 `narrative-ct-v2` 三项能力。
2. 证据不足的维度显示“证据不足”，不显示 0.0，也不画作零长度能力条。新版总分为空时不进入分数趋势和均分。
3. 趋势按“文体 + 量规版本”分别计算。教师 CSV 含文体、量规版本、三项分数、证据状态和分析时间；旧版议论文分数单独保留，不参与新版平均值。
4. 教师复核标记分别对应所查看的评分版本，不能把旧评分的复核状态误套到新版。

**验收：** 学生和教师能辨认每个分数采用的量规；记叙文、旧议论文、新议论文互不连成同一增长趋势。

### 任务 7：仅重评可追溯的历史议论文

**修改：** `services/supabaseDataService.ts` 的候选查询、`modules/TeacherDashboard.tsx` 的批量重评弹窗。

1. 增加“议论文新版量规”专用候选集：`status = sent_to_grader`、文体为议论文、组合成文有实际内容。查询时显式读取 `writing_mode`、`argument_reflection` 和新版评分字段；旧记录缺少文体标记时用卡片角色辅助识别，无法判定者跳过并列出。
2. 默认只选尚无 `ctrl_score_argumentative_v2` 的记录；再次重评需教师主动选择。预览可重评、部分证据不足、无法判定文体三类数量与原因。
3. 分批调用评分服务，记录成功、证据不足、失败数量；每条成功保存后更新当前教师视图。保留停止和失败重试能力。
4. 重评不写原 `ctrl_score`，不触碰记叙文评分；教师可从一个记录中对照旧新版结果。

**验收：** 对一个混合文体班级进行候选预览时，批次中没有记叙文；重复执行默认不会再次覆盖新版结果。

### 任务 8：核验与发布顺序

1. 用任务 1 的脱敏样例人工核查：每项引用来自学生原文；“解释合理但未修订”和“缺少过程记录”不会被误判；新旧分数允许变化，但理由必须能回溯。
2. 做针对性代码检查：议论文与记叙文的文体路由、旧版/新版显示、空证据处理、批量候选过滤、旧分保留。运行 `npm run build`；如新增纯函数测试，只覆盖这些关键边界。
3. 手动走通：新议论文从追问到提交、历史议论文重评、记叙文提交与查看、作文批改、学生中心趋势、教师端导出。
4. 先执行 Supabase 迁移，再部署读取与写入新版字段的代码，最后预览历史候选并小批量重评。核验通过后再分批处理剩余记录。

**完成标准：** 新议论文使用 `argumentative-ct-v2`；旧评分仍可追溯；历史重评仅覆盖具备必要写作过程的议论文；记叙文评分和作文批改行为保持正常。若生产数据库尚未执行迁移，云端新版评分不得宣称已可用。
