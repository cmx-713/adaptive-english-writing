# 受控记叙文写作智能体改造计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将记叙文的卡片角色、追问轮次和问题边界从提示词约定提升为可校验的程序规则，同时保持议论文路径不变。

**Architecture:** 记叙文卡片携带唯一的 `scene`、`response`、`outcome` 角色。模型负责生成题目相关内容，应用层负责角色唯一性、单焦点问题和最多两轮的校验；不合格输出使用角色对应的保守兜底问题。旧记录通过标题和顺序推断角色。

**Tech Stack:** React, TypeScript, Gemini structured JSON output, Vite.

---

### Task 1: 固定记叙文角色数据

**Files:** `types.ts`, `services/geminiService.ts`

为 `InspirationCard` 增加可选 `narrativeRole`，要求卡片生成返回三个互不重复的角色，并为旧数据提供推断逻辑。

### Task 2: 约束追问和兜底

**Files:** `services/geminiService.ts`, `components/PhaseOneCards.tsx`

让验证和续问接口接收角色；按角色检查复合问句和角色漂移，必要时使用场景、行动或结果对应的单焦点问题。保持最多两轮和空问题结束语义。

### Task 3: 验证与回归检查

**Files:** `package.json` build output only

运行 `npm run build` 和 `git diff --check`。确认议论文调用仍使用原函数，记叙文语言支架和历史记录类型继续兼容。
