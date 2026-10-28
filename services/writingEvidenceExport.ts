import { isArgumentativeProcess } from './argumentativeCtrlRubric'

const today = () => new Date().toISOString().slice(0, 10)

const downloadText = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 1000)
}

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const md = (value: unknown) => clean(value).replace(/\r?\n/g, '\n\n')
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const array = (value: unknown): any[] => Array.isArray(value) ? value : []
const safeFilename = (value: string) => value.replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')

const modeLabel = (process: any) => isArgumentativeProcess(process) === false ? '记叙文' : '议论文'

const assembledText = (essay: any) => {
  if (!essay || typeof essay !== 'object') return ''
  return [essay.introduction, ...array(essay.bodyParagraphs).map((part: any) => part?.draft), essay.conclusion]
    .map(clean).filter(Boolean).join('\n\n')
}

/** 单篇学生作文导出：只导出最终作品和批改结果，不包含内部过程。 */
export const downloadFinalEssayRecord = (item: { topic?: string; timestamp?: number; data: any }) => {
  const data = item.data || {}
  const result = data.result || {}
  const content = [
    `# ${clean(item.topic) || '未命名作文'}`,
    '',
    `- 文体：${data.writingMode === 'narrative' ? '记叙文' : '议论文'}`,
    `- 完成时间：${item.timestamp ? new Date(item.timestamp).toLocaleString('zh-CN') : ''}`,
    `- 作文得分：${result.totalScore ?? '—'} / 15`,
    '',
    '## 最终作文',
    '',
    md(data.essay) || '（暂无作文正文）',
    '',
    '## 批改反馈',
    '',
    clean(result.generalComment) || '（暂无总评）',
    '',
    '### 分项得分',
    '',
    `- 内容与思辨：${result.subScores?.content ?? '—'} / 4`,
    `- 组织与逻辑：${result.subScores?.organization ?? '—'} / 3`,
    `- 语言纯熟度：${result.subScores?.proficiency ?? '—'} / 5`,
    `- 表达清晰度：${result.subScores?.clarity ?? '—'} / 3`,
    '',
    '### 逐项反馈',
    '',
    ...(Array.isArray(result.critiques) ? result.critiques.map((item: any) => `- ${item.category || '反馈'}：${item.comment || item.feedback || ''}`) : []),
  ].join('\n')
  downloadText(content, safeFilename(`作文_${clean(item.topic).slice(0, 36) || '未命名'}_${today()}.md`), 'text/markdown;charset=utf-8')
}

const toEvidenceRecord = (process: any, student?: any) => {
  const cards = array(process.inspiration_cards).filter(card => card && typeof card === 'object')
  const ideas = object(process.user_ideas)
  const validations = object(process.validation_results)
  const drafts = object(process.dimension_drafts)
  return {
    student: student ? { name: student.name || '', studentId: student.student_id || '', className: student.class_name || '' } : undefined,
    processId: process.id,
    topic: process.topic || '',
    writingMode: modeLabel(process),
    status: process.status || '',
    createdAt: process.created_at || '',
    submittedAt: process.updated_at || process.created_at || '',
    initialIdeas: cards.map((card: any) => ({
      dimension: card.dimension || card.narrativeRole || card.id || '',
      idea: ideas[card.id] || validations[card.id]?.initialIdea || '',
    })).filter((item: any) => clean(item.idea)),
    coaching: cards.map((card: any) => {
      const validation = object(validations[card.id])
      return {
        dimension: card.dimension || card.narrativeRole || card.id || '',
        diagnosis: validation.gapDiagnosis || null,
        analysis: validation.analysis || '',
        progressSummary: validation.progressSummary || '',
        conversation: array(validation.conversation).map((entry: any, index: number) => {
          const turn = object(entry)
          return ({
          round: index + 1,
          question: turn.question || '',
          studentResponse: turn.studentResponse || '',
          coachFeedback: turn.coachFeedback || '',
        }) }),
      }
    }).filter((item: any) => item.analysis || item.diagnosis || item.conversation.length),
    drafts: Object.values(drafts).map((entry: any) => {
      const draft = object(entry)
      return ({
      dimension: draft.dimension || draft.cardId || '',
      draft: draft.draft || '',
      scaffoldUsed: array(object(draft.scaffoldData).vocabulary).map((entry: any) => {
        const item = object(entry)
        return typeof entry === 'string' ? entry : item.word || item.en || ''
      }).filter(Boolean),
    }) }).filter((item: any) => clean(item.draft)),
    finalEssay: process.assembled_essay || null,
    scores: {
      writingGrade: process.essay_grade || null,
      legacyCtrl: process.ctrl_score || null,
      argumentativeV2: process.ctrl_score_argumentative_v2 || null,
    },
  }
}

const recordMarkdown = (record: any, index?: number) => {
  const heading = index == null ? '# 教学过程证据记录' : `## 记录 ${index + 1}`
  const lines = [heading, '', `- 学生：${record.student?.name || '未提供'}`, `- 班级：${record.student?.className || '未提供'}`, `- 题目：${record.topic}`, `- 文体：${record.writingMode}`, `- 创建时间：${record.createdAt}`, '', '### 初始构想', '']
  record.initialIdeas.forEach((item: any) => lines.push(`**${item.dimension}**\n\n${md(item.idea)}\n`))
  lines.push('### 导师追问与学生回答', '')
  record.coaching.forEach((item: any) => {
    lines.push(`#### ${item.dimension}`)
    if (item.analysis) lines.push(`\n诊断：${md(item.analysis)}`)
    if (item.diagnosis) lines.push(`\n缺口：${md(item.diagnosis.label || item.diagnosis.whyItMatters || '')}`)
    item.conversation.forEach((turn: any) => lines.push(`\n**第${turn.round}轮导师提问**：${md(turn.question)}\n\n**学生回答**：${md(turn.studentResponse)}\n\n**导师反馈**：${md(turn.coachFeedback)}`))
    lines.push('')
  })
  lines.push('### 草稿与语言支架', '')
  record.drafts.forEach((item: any) => lines.push(`**${item.dimension}**\n\n${md(item.draft)}\n\n使用支架：${item.scaffoldUsed.join('、') || '未记录'}\n`))
  lines.push('### 最终作文', '', md(assembledText(record.finalEssay)) || '（未形成完整作文）', '', '### 评价结果', '', `- 作文批改：${record.scores.writingGrade?.totalScore ?? '—'}`, `- 审辨信度：${record.scores.argumentativeV2?.total ?? record.scores.legacyCtrl?.total ?? '—'}`, '')
  if (record.scores.writingGrade?.generalComment) lines.push('#### 作文批改总评', '', md(record.scores.writingGrade.generalComment), '')
  if (Array.isArray(record.scores.writingGrade?.critiques) && record.scores.writingGrade.critiques.length) {
    lines.push('#### 作文批改明细', '')
    record.scores.writingGrade.critiques.forEach((item: any) => {
      const critique = object(item)
      lines.push(`- ${clean(critique.category) || '反馈'}：${md(critique.comment || critique.feedback || critique.explanation)}`)
    })
    lines.push('')
  }
  const ctrl = record.scores.argumentativeV2 || record.scores.legacyCtrl
  if (ctrl?.overallComment) lines.push('#### 审辨思维总评', '', md(ctrl.overallComment), '')
  if (ctrl?.dimensions && typeof ctrl.dimensions === 'object') {
    lines.push('#### 思维能力分项证据', '')
    Object.entries(object(ctrl.dimensions)).forEach(([key, raw]) => {
      const dimension = object(raw)
      lines.push(`- ${key}：${dimension.score ?? '证据不足'}；${md(dimension.explanation)}；学生原文：${array(dimension.evidence).map((item: any) => clean(object(item).quote)).filter(Boolean).join(' / ') || '未记录'}`)
    })
    lines.push('')
  }
  return lines.join('\n')
}

/** 教师端单篇过程证据导出。 */
export const downloadProcessEvidence = (process: any, student?: any) => {
  const record = toEvidenceRecord(process, student)
  const base = safeFilename(`过程证据_${clean(record.topic).slice(0, 36) || '未命名'}_${today()}`)
  downloadText(recordMarkdown(record), `${base}.md`, 'text/markdown;charset=utf-8')
}

/** 教师端批量过程证据包，一次下载一个可阅读的完整 Markdown 文件。 */
export const downloadProcessEvidenceBundle = (processes: any[], students: any[], scopeLabel = '当前筛选范围') => {
  const safeProcesses = Array.isArray(processes) ? processes.filter(Boolean) : []
  const safeStudents = Array.isArray(students) ? students.filter(Boolean) : []
  const studentMap = new Map(safeStudents.map(student => [student.id, student]))
  const records = safeProcesses.map(process => toEvidenceRecord(process, studentMap.get(process.user_id)))
  const base = safeFilename(`教学过程证据包_${scopeLabel.slice(0, 30)}_${today()}`)
  const markdown = [`# 教学过程证据包`, '', `- 导出范围：${scopeLabel}`, `- 记录数：${records.length}`, `- 导出时间：${new Date().toLocaleString('zh-CN')}`, '', ...records.map((record, index) => recordMarkdown(record, index))].join('\n\n---\n\n')
  downloadText(markdown, `${base}.md`, 'text/markdown;charset=utf-8')
}

/** 结构化备份使用独立按钮下载，避免浏览器拦截同一次点击触发的第二个文件。 */
export const downloadProcessEvidenceJsonBundle = (processes: any[], students: any[], scopeLabel = '当前筛选范围') => {
  const studentMap = new Map(array(students).filter(Boolean).map(student => [student.id, student]))
  const records = array(processes).filter(Boolean).map(process => toEvidenceRecord(process, studentMap.get(process.user_id)))
  const payload = { schemaVersion: 'writing-process-evidence-v1', exportedAt: new Date().toISOString(), scope: scopeLabel, records }
  const base = safeFilename(`教学过程数据_${scopeLabel.slice(0, 30)}_${today()}`)
  downloadText(JSON.stringify(payload, null, 2), `${base}.json`, 'application/json;charset=utf-8')
}
