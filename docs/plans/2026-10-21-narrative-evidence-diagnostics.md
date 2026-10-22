# 记叙文有证据约束的追问诊断实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让记叙文三个故事维度根据学生全程文本中的证据决定追问目标和完成状态，同时保持议论文的判断逻辑、接口和界面行为不变。

**Architecture:** 保留现有 `scene`、`response`、`outcome` 三类叙事卡及 `IdeaValidationResult` / `CoverageState` 对外形状。为记叙文新增独立的证据抽取与确定性协调规则：模型只抽取带原文依据的叙事要素，程序按当前角色计算缺口、选择问题目标和完成状态；议论文继续走现有 `validateIdea`、`continueIdeaCoaching`、`argumentativeSlots` 和参数路径。

**Tech Stack:** React, TypeScript, Gemini structured JSON output, Vite.

---

## 设计边界

- 三张记叙文卡片继续保留：关键时刻与场景、后续行动与回应、结果与回望。
- 共享诊断循环只共享算法步骤，不共享各维度的必需内容规则。
- `scene` 检查关键事件是否清楚，以及是否有足够具体的叙事证据；即时反应按故事需要检查，不把对象、感官细节或情绪固定为必填。
- `response` 只检查锚点事件之后的行动、选择及相关即时后果，不重开场景描写。
- `outcome` 只检查结局、后续影响或事后认识，不重复追问行动过程。
- 无原文依据时不得报告某项已覆盖；学生原文已有依据时不得针对同一项再次追问。
- 低把握或证据矛盾时优先澄清；必要内容已充分时必须结束追问。模型的 `completionReady` 不直接决定程序状态。

## 实施任务

### Task 1: 固化角色专属的叙事诊断规则

**Files:**
- Create: `services/narrativeCoachingRules.ts`
- Reference only: `services/geminiService.ts`

定义叙事内部证据项、证据状态（covered / partial / missing / not_applicable / uncertain）、角色允许项、完成谓词和缺口优先级。把“场景可感知性”建模为一项可由动作、对象特征、对话或感官线索满足的证据条件；人物即时回应设为条件性证据，不做全故事强制项。为 response 和 outcome 定义各自独立的角色规则与时间边界。

### Task 2: 增加带原文依据的叙事证据抽取契约

**Files:**
- Modify: `services/geminiService.ts`

增加 narrative-only 的结构化输出 schema，让模型对当前角色的证据项返回状态、原文短引文和必要时的置信度/不确定说明。抽取输入必须包含初步构想和所有历史学生回答。验证引文能在学生文本中定位；无法定位或语义不确定的结果不得直接作为 covered。

不得复用或修改议论文的 prompt、schema、slot 列表或归一化行为。

### Task 3: 使用确定性协调器选择追问或完成

**Files:**
- Modify: `services/narrativeCoachingRules.ts`
- Modify: `services/geminiService.ts`

根据 Task 1 的角色谓词与 Task 2 的证据，程序计算 coverage 和 completion。只从当前角色尚未满足且适用的要素中选择一个最高优先级缺口；如果无真实缺口则返回空问题并标记完成。AI 生成的问题只能表达已选目标，不能更换目标；问题重复、跨角色、要求可选细节或与已覆盖证据冲突时，改用该目标的保守单焦点模板或结束追问。

保留现有每张卡最多两轮的产品限制，不改变跨维度的组合成文门槛。

### Task 4: 接回记叙文现有调用路径并保持数据兼容

**Files:**
- Modify: `services/geminiService.ts`
- Review only unless required: `components/PhaseOneCards.tsx`

仅在 `validateNarrativeIdea` 与 `continueNarrativeCoaching` 中调用新协调器。返回既有 `IdeaValidationResult` 与 `CoverageState` 字段，避免改动组件持久化格式、历史记录结构和数据库数据。确认 `PhaseOneCards.tsx` 的文体分流仍将议论文送入原函数、记叙文送入新规则。

### Task 5: 执行边界与回归验收

**Files:**
- Review: `services/geminiService.ts`
- Review: `services/narrativeCoachingRules.ts`
- Review: `components/PhaseOneCards.tsx`

验收案例至少覆盖：

- 路牌案例：初步构想加回答包含迷路事件、路牌指向不同方向、无法判断方向；不得再追问声音、光线或触感，当前场景维度应结束。
- 只有抽象事件：追问一个具体行动或可观察线索，不强迫出现关键物件。
- 没有明显情绪但行动清楚：不要求学生补写情绪。
- response 卡：只问锚点事件之后的行动或选择，不重问路牌外观。
- outcome 卡：只问结果或事后理解，不重问前面的行动过程。
- 已回答的目标、跨角色目标、无原文依据的证据均不得被系统选作追问目标。
- 对议论文路径做差异审查：`argumentativeSlots`、`validateIdea`、`continueIdeaCoaching` 及其 prompt、target 选择和返回字段无行为改动。

项目当前没有专用测试脚本；执行实现时先确认是否已有可用测试框架。若没有，不在本次计划中引入全局依赖；至少运行类型检查/构建，并用上述固定案例验证叙事服务输出。评估结论须明确区分代码静态隔离、构建通过和真实模型端到端表现。

## 非目标

- 不改记叙文三张卡片的名称、展示顺序或组合成文流程。
- 不改变议论文训练逻辑、数据结构、提示词、追问轮次和界面。
- 不承诺对任意自由文本做到零误判；通过原文证据、程序门控和不确定时澄清来限制错误追问。
