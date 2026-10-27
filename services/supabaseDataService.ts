/**
 * Supabase Data Service
 * 封装所有学习数据的 CRUD 操作（写入 Supabase 数据库）
 * 
 * 表名映射（public schema，wc_ 前缀）：
 * - wc_users: 用户表
 * - wc_scaffold_history: 思维训练记录
 * - wc_essay_grades: 作文批改记录
 * - wc_drill_history: 句子特训记录
 * - wc_inspiration_history: 灵感卡片记录
 * - wc_agent_usage_logs: 使用统计
 */

import { supabase } from './supabaseClient'
import {
  ScaffoldContent,
  EssayGradeResult,
  DrillMode,
  DrillItem,
  InspirationCard,
  WritingMode,
} from '../types'
import { isArgumentativeProcess, type ArgumentativeCtrlV2, type ArgumentReflection } from './argumentativeCtrlRubric'

// ==========================================
// 1. 用户管理（quickSignIn 模式）
// ==========================================

/**
 * 快速登录/注册：根据学号查找或创建用户
 * 保持与 authService.quickSignIn 相同的逻辑
 */
export const quickSignInSupabase = async (studentId: string, name: string, className?: string) => {
  try {
    // 查找已存在的用户
    const { data: existingUser, error: findError } = await supabase
      .from('wc_users')
      .select('*')
      .eq('student_id', studentId)
      .single()

    if (findError && findError.code !== 'PGRST116') {
      console.error('[Supabase] 查找用户失败:', findError)
      return { data: null, error: findError }
    }

    if (existingUser) {
      // 名单校验仅针对普通学生，教师和外校用户不走此路径
      if (existingUser.role === 'student') {
        const targetClass = className || existingUser.class_name || undefined
        if (targetClass) {
          const ok = await matchStudentRosterForClass(targetClass, studentId, name)
          if (!ok) return { data: null, error: ROSTER_DENIED_SCHOOL_ERROR }
        }
      }
      // 如果传入了 className 且与当前不同，则更新
      if (className && existingUser.class_name !== className) {
        await supabase
          .from('wc_users')
          .update({ class_name: className })
          .eq('id', existingUser.id)
        existingUser.class_name = className
      }
      return { data: existingUser, error: null }
    }

    // 新用户默认为学生，做名单校验
    const insertClass = className || null
    if (insertClass) {
      const ok = await matchStudentRosterForClass(insertClass, studentId, name)
      if (!ok) return { data: null, error: ROSTER_DENIED_SCHOOL_ERROR }
    }

    // 不存在则创建新用户
    const { data: newUser, error: insertError } = await supabase
      .from('wc_users')
      .insert({
        student_id: studentId,
        name,
        email: `${studentId}@student.local`,
        role: 'student',
        class_name: insertClass,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Supabase] 创建用户失败:', insertError)
      return { data: null, error: insertError }
    }

    return { data: newUser, error: null }
  } catch (err) {
    console.error('[Supabase] quickSignIn 异常:', err)
    return { data: null, error: err }
  }
}

// ==========================================
// 外校用户（external_student）快速登录
// ==========================================

/**
 * 外校用户快速登录/创建：按 student_id 查找或新建
 * 与内部学生的 quickSignInSupabase 逻辑一致，但 role = 'external_student'
 */
export const quickSignInExternal = async (
  studentId: string,
  name: string,
  classLabel: string
) => {
  // 加 ext_ 前缀，避免与内部学生的 student_id 冲突（全局唯一约束）
  const externalId = `ext_${studentId}`

  if (!classLabel.trim()) {
    return { data: null, error: ROSTER_DENIED_EXTERNAL_ERROR }
  }
  const matchedRoster = await matchExternalRosterEntryByClass(classLabel, studentId, name)
  if (!matchedRoster) {
    return { data: null, error: ROSTER_DENIED_EXTERNAL_ERROR }
  }
  const rosterClass = norm(classLabel)
  const rosterSchool = norm(matchedRoster.school)

  try {
    // 查找已存在的外校用户
    const { data: existing, error: findEx } = await supabase
      .from('wc_users')
      .select('*')
      .eq('student_id', externalId)
      .single()

    if (findEx && findEx.code !== 'PGRST116') {
      console.error('[Supabase] 查找外校用户失败:', findEx)
      return { data: null, error: findEx }
    }

    if (existing) {
      if (rosterClass && existing.class_name !== rosterClass) {
        const { error: clsErr } = await supabase
          .from('wc_users')
          .update({ class_name: rosterClass })
          .eq('id', existing.id)
        if (clsErr) console.error('[Supabase] 更新外校用户班级失败:', clsErr)
        else existing.class_name = rosterClass
      }
      // 以名单中的学校信息为准（仅用于管理展示，不参与登录输入）
      if (rosterSchool && existing.school !== rosterSchool) {
        const { error: updateError } = await supabase
          .from('wc_users')
          .update({ school: rosterSchool })
          .eq('id', existing.id)
        if (updateError) {
          console.error('[Supabase] 更新外校用户 school 失败:', updateError)
        } else {
          existing.school = rosterSchool
        }
      }
      return { data: existing, error: null }
    }

    // 不存在则创建
    const { data: newUser, error: insertError } = await supabase
      .from('wc_users')
      .insert({
        student_id: externalId,
        name,
        school: rosterSchool || null,
        email: `${externalId}@external.local`,
        role: 'external_student',
        class_name: rosterClass,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Supabase] 创建外校用户失败:', insertError)
      return { data: null, error: insertError }
    }

    return { data: newUser, error: null }
  } catch (err) {
    console.error('[Supabase] quickSignInExternal 异常:', err)
    return { data: null, error: err }
  }
}

/**
 * 批量审辨信度：查询指定班级中已有组合成文的思维过程记录
 * @param includeExistingCtrl 为 true 时包含已有 ctrl_score 的记录（用于量规更新后按新标准重算）
 */
export interface BatchWritingScope {
  topic: string
  topicVariants?: string[]
  fromDate?: string
  toDate?: string
}

const applyBatchWritingScope = (query: any, scope: BatchWritingScope) => {
  query = query.in('topic', scope.topicVariants?.length ? scope.topicVariants : [scope.topic])
  if (scope.fromDate) query = query.gte('created_at', new Date(`${scope.fromDate}T00:00:00`).toISOString())
  if (scope.toDate) {
    const nextDay = new Date(`${scope.toDate}T00:00:00`)
    nextDay.setDate(nextDay.getDate() + 1)
    query = query.lt('created_at', nextDay.toISOString())
  }
  return query
}

/** 列出班级内有成文记录的题目；议论文仅显示已经送批改的写作。 */
export const getBatchWritingTopics = async (className: string, mode: 'narrative' | 'argumentative') => {
  const { data: students, error: studentError } = await supabase
    .from('wc_users')
    .select('id')
    .eq('class_name', className)
    .in('role', ['student', 'external_student'])
  if (studentError || !students?.length) return { data: [] as Array<{ topic: string; count: number; variants: string[]; batches: Array<{ key: string; label: string; count: number }> }>, error: studentError }

  const studentIds = students.map(student => student.id)
  const normalizeTopic = (value: string) => value.normalize('NFKC').replace(/[“”‘’]/g, "'").replace(/\s+/g, ' ').replace(/\s*([,:;!?。！？])\s*/g, '$1').replace(/[.!?。！？]+$/, '').trim().toLocaleLowerCase()
  const grouped = new Map<string, { topic: string; count: number; variants: Map<string, number>; batches: Map<string, number> }>()
  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from('wc_thinking_process')
      .select('topic, writing_mode, inspiration_cards, created_at')
      .in('user_id', studentIds)
      .not('assembled_essay', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + 499)
    if (mode === 'argumentative') query = query.eq('status', 'sent_to_grader')
    const { data: page, error } = await query
    if (error) return { data: [] as Array<{ topic: string; count: number; variants: string[]; batches: Array<{ key: string; label: string; count: number }> }>, error }
    for (const process of page || []) {
      if (isArgumentativeProcess(process) !== (mode === 'argumentative')) continue
      if (!process.topic?.trim()) continue
      const original = process.topic.trim()
      const entry = grouped.get(normalizeTopic(original)) || { topic: original, count: 0, variants: new Map(), batches: new Map() }
      entry.count += 1
      entry.variants.set(original, (entry.variants.get(original) || 0) + 1)
      const batchKey = typeof process.created_at === 'string' ? process.created_at.slice(0, 10) : '未标注日期'
      entry.batches.set(batchKey, (entry.batches.get(batchKey) || 0) + 1)
      if ((entry.variants.get(original) || 0) > (entry.variants.get(entry.topic) || 0)) entry.topic = original
      grouped.set(normalizeTopic(original), entry)
    }
    if (!page || page.length < 500) break
  }
  const data = [...grouped.values()].map(entry => ({
    topic: entry.topic,
    count: entry.count,
    variants: [...entry.variants.keys()],
    batches: [...entry.batches.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, count]) => ({ key, label: key === '未标注日期' ? key : `${key}（${count} 篇）`, count })),
  })).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, 'zh-CN'))
  return { data, error: null }
}

export const getBatchCtrlCandidates = async (
  className: string,
  options: { scope: BatchWritingScope; includeExistingCtrl?: boolean; narrativeOnly?: boolean }
) => {
  try {
    if (!options.scope.topic.trim()) return { data: [], error: new Error('请先选择写作题目') }
    const includeExistingCtrl = options?.includeExistingCtrl === true
    // Step 1: 获取该班所有学生 ID
    const { data: students, error: stuError } = await supabase
      .from('wc_users')
      .select('id, name, student_id')
      .eq('class_name', className)
      .in('role', ['student', 'external_student'])

    if (stuError || !students || students.length === 0) {
      return { data: [], error: stuError }
    }

    const studentIds = students.map((s: any) => s.id)
    const studentMap: Record<string, any> = {}
    students.forEach((s: any) => { studentMap[s.id] = s })

    // 每页读取同一题目，避免人数较多时只取得 Supabase 默认的前 1000 条。
    const processes: any[] = []
    for (let offset = 0; ; offset += 500) {
      let procQuery = applyBatchWritingScope(supabase
        .from('wc_thinking_process')
        .select('id, topic, writing_mode, user_ideas, validation_results, personalized_expansions, dimension_drafts, assembled_essay, inspiration_cards, user_id, ctrl_score')
        .in('user_id', studentIds)
        .not('assembled_essay', 'is', null), options.scope)
      if (!includeExistingCtrl) procQuery = procQuery.is('ctrl_score', null)
      const { data: page, error: procError } = await procQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + 499)
      if (procError) return { data: [], error: procError }
      processes.push(...(page || []))
      if (!page || page.length < 500) break
    }

    const result = processes.filter((p: any) => !options.narrativeOnly || isArgumentativeProcess(p) === false).map((p: any) => ({
      ...p,
      studentName: studentMap[p.user_id]?.name || '未知',
      studentId: studentMap[p.user_id]?.student_id || '',
    }))

    return { data: result, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

/** 仅选已送批改的议论文，供新版三维量规追溯评分。 */
export const getBatchArgumentativeCtrlV2Candidates = async (
  className: string,
  options: { scope: BatchWritingScope; includeExisting?: boolean }
) => {
  if (!options.scope.topic.trim()) return { data: [] as any[], excluded: { narrative: 0, unknownMode: 0, emptyEssay: 0 }, error: new Error('请先选择写作题目') }
  const { data: students, error: studentError } = await supabase
    .from('wc_users')
    .select('id, name, student_id')
    .eq('class_name', className)
    .in('role', ['student', 'external_student'])
  if (studentError || !students?.length) return { data: [] as any[], excluded: { narrative: 0, unknownMode: 0, emptyEssay: 0 }, error: studentError }

  const processes: any[] = []
  for (let offset = 0; ; offset += 500) {
    const query = applyBatchWritingScope(supabase
      .from('wc_thinking_process')
      .select('id, user_id, topic, writing_mode, status, inspiration_cards, user_ideas, validation_results, dimension_drafts, assembled_essay, argument_reflection, ctrl_score, ctrl_score_argumentative_v2')
      .in('user_id', students.map(student => student.id))
      .eq('status', 'sent_to_grader'), options.scope)
    const { data: page, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + 499)
    if (error) return { data: [] as any[], excluded: { narrative: 0, unknownMode: 0, emptyEssay: 0 }, error }
    processes.push(...(page || []))
    if (!page || page.length < 500) break
  }

  const studentMap = new Map(students.map(student => [student.id, student]))
  const excluded = { narrative: 0, unknownMode: 0, emptyEssay: 0 }
  const data = processes.filter((process: any) => {
    const mode = isArgumentativeProcess(process)
    if (mode === false) { excluded.narrative++; return false }
    if (mode === null) { excluded.unknownMode++; return false }
    const essay = process.assembled_essay as { introduction?: string; conclusion?: string; bodyParagraphs?: Array<{ draft?: string }> } | null
    const text = [essay?.introduction, ...(essay?.bodyParagraphs || []).map(part => part.draft), essay?.conclusion]
      .filter(part => typeof part === 'string' && part.trim()).join('')
    if (!text) { excluded.emptyEssay++; return false }
    return options.includeExisting || !process.ctrl_score_argumentative_v2
  }).map((process: any) => ({
    ...process,
    studentName: studentMap.get(process.user_id)?.name || '未知',
    studentId: studentMap.get(process.user_id)?.student_id || '',
  }))
  return { data, excluded, error: null }
}

/**
 * 教师端：查询所有外校注册用户
 */
export const getExternalUsers = async () => {
  const { data, error } = await supabase
    .from('wc_users')
    .select('id, name, email, school, created_at')
    .eq('role', 'external_student')
    .order('created_at', { ascending: false })
  return { data, error }
}

/**
 * 教师端：更新学生所在班级
 */
export const updateStudentClass = async (userId: string, className: string | null) => {
  try {
    const { error } = await supabase
      .from('wc_users')
      .update({ class_name: className || null })
      .eq('id', userId)

    if (error) {
      console.error('[Supabase] 更新学生班级失败:', error)
    }
    return { error }
  } catch (err) {
    console.error('[Supabase] 更新学生班级异常:', err)
    return { error: err }
  }
}

// ==========================================
// 班级受邀名单（wc_class_roster）
// ==========================================

export const ROSTER_DENIED_SCHOOL_ERROR = {
  code: 'ROSTER_DENIED' as const,
  message: '您不在所选班级的名单中，请联系任课教师添加账号。',
}

export const ROSTER_DENIED_EXTERNAL_ERROR = {
  code: 'ROSTER_DENIED' as const,
  message: '您不在所选课程的受邀名单中，请确认学号、姓名及学校信息是否与教师导入的名单一致，或联系教师。',
}

/** @deprecated 保留兼容旧引用，统一用上方两个具名错误 */
export const ROSTER_DENIED_ERROR = ROSTER_DENIED_SCHOOL_ERROR

const norm = (s: string | null | undefined) => (s || '').trim()

/**
 * 获取名单中有效班级标签列表，供登录页班级下拉使用。
 * 表不存在或查询失败时返回空数组（不阻断登录页渲染）。
 */
export const getActiveRosterClassLabels = async (
  roleKind: 'external_student' | 'student'
): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('wc_class_roster')
      .select('class_label')
      .eq('is_active', true)
      .eq('role_kind', roleKind)
    if (error || !data) return []
    const seen = new Set<string>()
    const result: string[] = []
    for (const row of data) {
      if (row.class_label && !seen.has(row.class_label)) {
        seen.add(row.class_label)
        result.push(row.class_label)
      }
    }
    return result.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  } catch {
    return []
  }
}

/** 统计某类受邀记录条数（内部工具函数） */
const countActiveRosterByRole = async (
  roleKind: 'external_student' | 'student',
  classLabel?: string
) => {
  try {
    let q = supabase
      .from('wc_class_roster')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('role_kind', roleKind)
    if (classLabel) q = q.eq('class_label', classLabel)
    const { count, error } = await q
    if (error) return { count: 0, error: null }
    return { count: count ?? 0, error: null }
  } catch {
    return { count: 0, error: null }
  }
}

/**
 * 本校学生：指定班级内严格校验学号+姓名。
 * 无论该班级是否有名单记录，一律强制校验——无记录即视为未被授权。
 */
export const matchStudentRosterForClass = async (
  classLabel: string,
  plainId: string,
  fullName: string
): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('wc_class_roster')
      .select('id')
      .eq('is_active', true)
      .eq('role_kind', 'student')
      .eq('class_label', classLabel)
      .eq('student_plain_id', norm(plainId))
      .eq('full_name', norm(fullName))
      .limit(1)
    if (error) return false
    return !!(data && data.length > 0)
  } catch {
    return false
  }
}

/**
 * 外校学生：在指定班级（class_label）内校验学号+姓名；
 * 若名单行填了 school，还须与登录填写的 school 匹配。
 */
export const matchExternalRosterEntryByClass = async (
  classLabel: string,
  plainId: string,
  fullName: string
): Promise<any | null> => {
  try {
    const { data, error } = await supabase
      .from('wc_class_roster')
      .select('*')
      .eq('is_active', true)
      .eq('role_kind', 'external_student')
      .eq('class_label', classLabel)
      .eq('student_plain_id', norm(plainId))
    if (error || !data?.length) return null
    const sn = norm(fullName)
    const row = data.find((r: any) => norm(r.full_name) === sn)
    return row || null
  } catch {
    return null
  }
}

/** @deprecated 旧全局外校校验，由 matchExternalRosterEntryByClass 替代 */
export const matchExternalRosterEntry = async (
  plainId: string,
  fullName: string,
  school: string
): Promise<{ row: any | null; enforcement: boolean }> => {
  const { count } = await countActiveRosterByRole('external_student')
  const enforcement = count > 0
  if (!enforcement) return { row: null, enforcement: false }
  try {
    const { data, error } = await supabase
      .from('wc_class_roster')
      .select('*')
      .eq('is_active', true)
      .eq('role_kind', 'external_student')
      .eq('student_plain_id', norm(plainId))
    if (error || !data?.length) return { row: null, enforcement: true }
    const sn = norm(fullName)
    const sc = norm(school)
    const row = data.find((r: any) => {
      if (norm(r.full_name) !== sn) return false
      const rs = norm(r.school)
      if (rs && rs !== sc) return false
      return true
    })
    return { row: row || null, enforcement: true }
  } catch {
    return { row: null, enforcement: true }
  }
}

export const getAllRosterEntries = async (limit: number = 5000) => {
  const { data, error } = await supabase
    .from('wc_class_roster')
    .select('*')
    .order('class_label', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

export type RosterRowInput = {
  class_label: string
  student_plain_id: string
  full_name: string
  school?: string | null
  role_kind: 'external_student' | 'student'
}

export const upsertRosterRows = async (rows: RosterRowInput[]) => {
  if (rows.length === 0) return { data: null as any, error: null }
  const { data, error } = await supabase
    .from('wc_class_roster')
    .upsert(
      rows.map((r) => ({
        class_label: norm(r.class_label),
        student_plain_id: norm(r.student_plain_id),
        full_name: norm(r.full_name),
        school: r.school != null && norm(r.school) ? norm(r.school) : null,
        role_kind: r.role_kind,
        is_active: true,
      })),
      { onConflict: 'class_label,student_plain_id' }
    )
    .select()
  return { data, error }
}

export const deleteRosterEntry = async (id: string) => {
  return supabase.from('wc_class_roster').delete().eq('id', id)
}

export const setRosterEntryActive = async (id: string, is_active: boolean) => {
  return supabase.from('wc_class_roster').update({ is_active }).eq('id', id)
}

// ==========================================
// 2. 思维训练记录（wc_scaffold_history）
// ==========================================

/**
 * 保存思维训练（语言支架）数据到 Supabase
 */
export const saveScaffoldToSupabase = async (
  userId: string,
  topic: string,
  scaffoldData: ScaffoldContent,
  writingMode: WritingMode = scaffoldData.writingMode || 'argumentative'
) => {
  try {
    const { data, error } = await supabase
      .from('wc_scaffold_history')
      .insert({
        user_id: userId,
        topic,
        selected_dimension: scaffoldData.selectedDimension,
        user_idea: scaffoldData.userIdea,
        writing_mode: writingMode,
        vocabulary: scaffoldData.vocabulary,
        collocations: scaffoldData.collocations,
        frames: scaffoldData.frames,
      })
      .select()
      .single()

    if (error) {
      console.error('[Supabase] 保存支架数据失败:', error)
      return { data: null, error }
    }

    console.log('[Supabase] ✅ 支架数据已保存:', data?.id)
    return { data, error: null }
  } catch (err) {
    console.error('[Supabase] 保存支架数据异常:', err)
    return { data: null, error: err }
  }
}

/**
 * 更新思维训练记录的草稿内容
 * 在学生从实战演练返回维度选择时调用
 */
export const updateScaffoldDraft = async (
  userId: string,
  topic: string,
  selectedDimension: string,
  draft: string
) => {
  try {
    // Step 1: 找到最新的匹配记录的 ID
    const { data: found, error: findError } = await supabase
      .from('wc_scaffold_history')
      .select('id')
      .eq('user_id', userId)
      .eq('topic', topic)
      .eq('selected_dimension', selectedDimension)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (findError || !found) {
      console.error('[Supabase] 未找到匹配的支架记录:', findError)
      return { data: null, error: findError }
    }

    // Step 2: 按 ID 更新 draft
    const { data, error } = await supabase
      .from('wc_scaffold_history')
      .update({ draft })
      .eq('id', found.id)
      .select()
      .single()

    if (error) {
      console.error('[Supabase] 更新草稿失败:', error)
      return { data: null, error }
    }

    console.log('[Supabase] ✅ 草稿已更新:', selectedDimension)
    return { data, error: null }
  } catch (err) {
    console.error('[Supabase] 更新草稿异常:', err)
    return { data: null, error: err }
  }
}

// ==========================================
// 3. 作文批改记录（wc_essay_grades）
// ==========================================

/**
 * 保存作文批改结果到 Supabase
 */
export const saveEssayGradeToSupabase = async (
  userId: string,
  topic: string,
  essay: string,
  result: EssayGradeResult,
  writingMode: WritingMode = 'argumentative'
) => {
  try {
    const { data, error } = await supabase
      .from('wc_essay_grades')
      .insert({
        user_id: userId,
        topic,
        essay,
        writing_mode: writingMode,
        total_score: result.totalScore,
        content_score: result.subScores.content,
        organization_score: result.subScores.organization,
        proficiency_score: result.subScores.proficiency,
        clarity_score: result.subScores.clarity,
        general_comment: result.generalComment,
        critiques: result.critiques,
        contrastive_learning: result.contrastiveLearning,
        retraining: result.retraining,
        polished_essay: result.polishedEssay,
      })
      .select()
      .single()

    if (error) {
      console.error('[Supabase] 保存作文批改失败:', error)
      return { data: null, error }
    }

    console.log('[Supabase] ✅ 作文批改已保存:', data?.id)
    return { data, error: null }
  } catch (err) {
    console.error('[Supabase] 保存作文批改异常:', err)
    return { data: null, error: err }
  }
}

// ==========================================
// 4. 句子特训记录（wc_drill_history）
// ==========================================

/**
 * 保存句子特训结果到 Supabase
 */
export const saveDrillResultToSupabase = async (
  userId: string,
  mode: DrillMode,
  score: number,
  totalQuestions: number,
  drillItems: DrillItem[]
) => {
  try {
    const { data, error } = await supabase
      .from('wc_drill_history')
      .insert({
        user_id: userId,
        mode,
        score,
        total_questions: totalQuestions,
        drill_items: drillItems,
      })
      .select()
      .single()

    if (error) {
      console.error('[Supabase] 保存特训数据失败:', error)
      return { data: null, error }
    }

    console.log('[Supabase] ✅ 特训数据已保存:', data?.id)
    return { data, error: null }
  } catch (err) {
    console.error('[Supabase] 保存特训数据异常:', err)
    return { data: null, error: err }
  }
}

// ==========================================
// 5. 灵感卡片记录（wc_inspiration_history）
// ==========================================

/**
 * 保存灵感卡片（Phase 1）数据到 Supabase
 */
export const saveInspirationToSupabase = async (
  userId: string,
  topic: string,
  cards: InspirationCard[],
  userInputs: Record<string, string>,
  writingMode: WritingMode = 'argumentative'
) => {
  try {
    const { data, error } = await supabase
      .from('wc_inspiration_history')
      .insert({
        user_id: userId,
        topic,
        writing_mode: writingMode,
        cards,
        user_inputs: userInputs,
      })
      .select()
      .single()

    if (error) {
      console.error('[Supabase] 保存灵感数据失败:', error)
      return { data: null, error }
    }

    console.log('[Supabase] ✅ 灵感数据已保存:', data?.id)
    return { data, error: null }
  } catch (err) {
    console.error('[Supabase] 保存灵感数据异常:', err)
    return { data: null, error: err }
  }
}

/**
 * 保存组合成文到 Supabase
 * 更新 wc_inspiration_history 的 user_inputs 字段，添加 assembled_essay
 */
export const saveAssembledEssayToSupabase = async (
  userId: string,
  topic: string,
  assembledEssay: string,
  writingMode: WritingMode = 'argumentative'
) => {
  try {
    // 查找该用户该 topic 最新的 inspiration 记录
    const { data: existing, error: findError } = await supabase
      .from('wc_inspiration_history')
      .select('id, user_inputs')
      .eq('user_id', userId)
      .eq('topic', topic)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (findError || !existing) {
      // 没有找到对应的 inspiration 记录，直接插入新记录
      const { error: insertError } = await supabase
        .from('wc_inspiration_history')
        .insert({
          user_id: userId,
          topic,
          writing_mode: writingMode,
          cards: [],
          user_inputs: { assembled_essay: assembledEssay },
        })

      if (insertError) {
        console.error('[Supabase] 保存组合成文失败:', insertError)
        return { data: null, error: insertError }
      }
    } else {
      // 更新已有记录的 user_inputs，合并 assembled_essay
      const updatedInputs = {
        ...(existing.user_inputs as Record<string, any> || {}),
        assembled_essay: assembledEssay,
      }

      const { error: updateError } = await supabase
        .from('wc_inspiration_history')
        .update({ user_inputs: updatedInputs, writing_mode: writingMode })
        .eq('id', existing.id)

      if (updateError) {
        console.error('[Supabase] 更新组合成文失败:', updateError)
        return { data: null, error: updateError }
      }
    }

    console.log('[Supabase] ✅ 组合成文已保存')
    return { data: true, error: null }
  } catch (err) {
    console.error('[Supabase] 保存组合成文异常:', err)
    return { data: null, error: err }
  }
}

// ==========================================
// 6. 使用统计日志（wc_agent_usage_logs）
// ==========================================

/**
 * 记录智能体使用日志
 */
export const logAgentUsage = async (
  userId: string,
  agentName: string,
  agentType: 'writing_system' | 'coze_agent' | 'custom' = 'writing_system',
  sessionDuration?: number,
  actionsCount: number = 1
) => {
  try {
    const { error } = await supabase
      .from('wc_agent_usage_logs')
      .insert({
        user_id: userId,
        agent_name: agentName,
        agent_type: agentType,
        session_duration: sessionDuration,
        actions_count: actionsCount,
      })

    if (error) {
      console.error('[Supabase] 记录使用日志失败:', error)
    }
  } catch (err) {
    console.error('[Supabase] 记录使用日志异常:', err)
  }
}

// ==========================================
// 7. 教师端查询函数（阶段2使用）
// ==========================================

/**
 * 获取所有学生列表
 */
export const getAllStudents = async () => {
  const { data, error } = await supabase
    .from('wc_users')
    .select('*')
    .in('role', ['student', 'external_student'])
    .order('created_at', { ascending: false })

  return { data, error }
}

/**
 * 获取所有作文批改记录（教师端）
 */
export const getAllEssayGrades = async (limit: number = 100) => {
  const { data, error } = await supabase
    .from('wc_essay_grades')
    .select(`
      *,
      wc_users!inner(name, student_id)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data, error }
}

/**
 * 获取所有特训记录（教师端）
 */
export const getAllDrillHistory = async (limit: number = 100) => {
  const { data, error } = await supabase
    .from('wc_drill_history')
    .select(`
      *,
      wc_users!inner(name, student_id)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data, error }
}

/**
 * 获取所有支架记录（教师端）
 */
export const getAllScaffoldHistory = async (limit: number = 100) => {
  const { data, error } = await supabase
    .from('wc_scaffold_history')
    .select(`
      *,
      wc_users!inner(name, student_id)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data, error }
}

/**
 * 获取使用统计汇总（教师端）
 */
export const getAgentUsageSummary = async () => {
  const { data, error } = await supabase
    .from('wc_agent_usage_logs')
    .select(`
      *,
      wc_users!inner(name, student_id)
    `)
    .order('created_at', { ascending: false })

  return { data, error }
}

/**
 * 获取单个学生的详情及所有学习记录
 */
export const getStudentDetail = async (userId: string) => {
  const [essays, drills, scaffolds, thinkingProcesses] = await Promise.all([
    supabase
      .from('wc_essay_grades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('wc_drill_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('wc_scaffold_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('wc_thinking_process')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  return {
    essays: essays.data || [],
    drills: drills.data || [],
    scaffolds: scaffolds.data || [],
    thinkingProcesses: thinkingProcesses.data || [],
    error: essays.error || drills.error || scaffolds.error || thinkingProcesses.error,
  }
}

/**
 * 获取指定学生的所有作文批改记录
 */
export const getEssayGradesByUser = async (userId: string) => {
  const { data, error } = await supabase
    .from('wc_essay_grades')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return { data, error }
}

// ==========================================
// 8. 思维过程数据（wc_thinking_process）
// ==========================================

/**
 * 创建思维过程记录（学生提交新 topic 时调用）
 * 返回新记录的 id，后续通过 id 更新
 */
export const createThinkingProcess = async (
  userId: string,
  topic: string,
  inspirationCards: any[],
  writingMode: WritingMode = 'argumentative'
) => {
  try {
    const { data, error } = await supabase
      .from('wc_thinking_process')
      .insert({
        user_id: userId,
        topic,
        writing_mode: writingMode,
        inspiration_cards: inspirationCards,
        coaching_turns: {},
        status: 'in_progress',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Supabase] 创建思维过程记录失败:', error)
      return { id: null, error }
    }

    console.log('[Supabase] ✅ 思维过程记录已创建:', data?.id)
    return { id: data?.id || null, error: null }
  } catch (err) {
    console.error('[Supabase] 创建思维过程记录异常:', err)
    return { id: null, error: err }
  }
}

/**
 * 增量更新思维过程记录（按 id 更新指定字段）
 * 只传入需要更新的字段，不会覆盖其他字段
 */
export const updateThinkingProcess = async (
  processId: string,
  updates: {
    writing_mode?: WritingMode
    inspiration_cards?: any[]
    user_ideas?: Record<string, string>
    validation_results?: Record<string, any>
    coaching_turns?: Record<string, any[]>
    personalized_expansions?: Record<string, string[]>
    dimension_drafts?: Record<string, any>
    assembled_essay?: any
    argument_reflection?: ArgumentReflection | null
    status?: 'in_progress' | 'completed' | 'sent_to_grader'
  }
) => {
  try {
    const { error } = await supabase
      .from('wc_thinking_process')
      .update(updates)
      .eq('id', processId)

    if (error) {
      console.error('[Supabase] 更新思维过程记录失败:', error)
    }
    return { error }
  } catch (err) {
    console.error('[Supabase] 更新思维过程记录异常:', err)
    return { error: err }
  }
}

/** 延迟自动保存只允许写入未提交记录，避免覆盖提交快照。 */
export const updateThinkingProcessDraft = async (
  processId: string,
  updates: { assembled_essay?: any; argument_reflection?: ArgumentReflection | null; status?: 'completed' }
) => {
  const { error } = await supabase
    .from('wc_thinking_process')
    .update(updates)
    .eq('id', processId)
    .in('status', ['in_progress', 'completed'])
  return { error }
}

/**
 * 获取所有思维过程记录（教师端）
 */
export const getAllThinkingProcesses = async (limit: number = 200) => {
  const { data, error } = await supabase
    .from('wc_thinking_process')
    .select(`
      *,
      wc_users!inner(name, student_id)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data, error }
}

/**
 * 教师标记审辨信度为"已复核"
 */
export const markCtrlReviewed = async (processId: string) => {
  try {
    const { data } = await supabase
      .from('wc_thinking_process')
      .select('ctrl_score')
      .eq('id', processId)
      .single()
    if (!data?.ctrl_score) return { error: 'no ctrl_score' }
    const { error } = await supabase
      .from('wc_thinking_process')
      .update({ ctrl_score: { ...data.ctrl_score, reviewed: true } })
      .eq('id', processId)
    return { error }
  } catch (err) {
    return { error: err }
  }
}

/**
 * 保存审辨信度评分结果到 wc_thinking_process
 */
export const saveCtrlScore = async (processId: string, ctrlScore: object) => {
  try {
    const { error } = await supabase
      .from('wc_thinking_process')
      .update({ ctrl_score: ctrlScore })
      .eq('id', processId)
    if (error) console.error('[Supabase] 保存审辨信度失败:', error)
    return { error }
  } catch (err) {
    console.error('[Supabase] 保存审辨信度异常:', err)
    return { error: err }
  }
}

/** 新版议论文分数只写独立字段，保留旧 ctrl_score。 */
export const saveArgumentativeCtrlScoreV2 = async (processId: string, score: ArgumentativeCtrlV2) => {
  if (score.rubricVersion !== 'argumentative-ct-v2' || score.writingMode !== 'argumentative') {
    return { error: new Error('议论文新版评分版本不匹配') }
  }
  const { data: process, error: readError } = await supabase
    .from('wc_thinking_process')
    .select('writing_mode, inspiration_cards')
    .eq('id', processId)
    .maybeSingle()
  if (readError || !process || isArgumentativeProcess(process) !== true) {
    return { error: readError || new Error('未找到可写入的议论文过程记录') }
  }
  const { error } = await supabase
    .from('wc_thinking_process')
    .update({ ctrl_score_argumentative_v2: score })
    .eq('id', processId)
  if (error) console.error('[Supabase] 保存议论文新版审辨信度失败:', error)
  return { error }
}

export const markArgumentativeCtrlV2Reviewed = async (processId: string) => {
  const { data, error: readError } = await supabase
    .from('wc_thinking_process')
    .select('ctrl_score_argumentative_v2')
    .eq('id', processId)
    .maybeSingle()
  if (readError || !data?.ctrl_score_argumentative_v2) return { error: readError || new Error('暂无议论文新版评分') }
  const { error } = await supabase
    .from('wc_thinking_process')
    .update({ ctrl_score_argumentative_v2: { ...data.ctrl_score_argumentative_v2, reviewed: true } })
    .eq('id', processId)
  return { error }
}

// ==========================================
// 词汇银行（wc_vocabulary_bank）
// ==========================================

export interface VocabBankEntry {
  id: string
  user_id: string
  word: string
  chinese: string
  english_def: string | null
  usage: string | null
  usage_zh: string | null
  topic: string | null
  frequency: number
  first_seen: string
  last_seen: string
}

/**
 * 批量 upsert 词汇到词汇银行
 * 若单词已存在则累加 frequency 并更新 last_seen；否则插入新行
 * @param userId  当前用户 Supabase id
 * @param words   VocabularyItem 数组（来自 scaffold 结果）
 * @param topic   当次训练话题（用于记录词汇来源）
 */
export const upsertVocabularyBank = async (
  userId: string,
  words: { word: string; chinese: string; englishDefinition?: string; usage?: string; usageChinese?: string }[],
  topic: string
) => {
  if (!words || words.length === 0) return

  try {
    // 先查询该用户已存在的词汇（批量）
    const wordList = words.map(w => w.word.toLowerCase())
    const { data: existing } = await supabase
      .from('wc_vocabulary_bank')
      .select('id, word, frequency')
      .eq('user_id', userId)
      .in('word', wordList)

    const existingMap = new Map<string, { id: string; frequency: number }>(
      (existing || []).map((r: any) => [r.word.toLowerCase(), { id: r.id, frequency: r.frequency }])
    )

    const now = new Date().toISOString()
    const toInsert: any[] = []
    const toUpdate: { id: string; frequency: number }[] = []

    for (const w of words) {
      const key = w.word.toLowerCase()
      const found = existingMap.get(key)
      if (found) {
        toUpdate.push({ id: found.id, frequency: found.frequency + 1 })
      } else {
        toInsert.push({
          user_id: userId,
          word: w.word,
          chinese: w.chinese,
          english_def: w.englishDefinition || null,
          usage: w.usage || null,
          usage_zh: w.usageChinese || null,
          topic,
          frequency: 1,
          first_seen: now,
          last_seen: now,
        })
      }
    }

    // 批量插入新词汇
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('wc_vocabulary_bank').insert(toInsert)
      if (insErr) console.error('[VocabBank] 插入词汇失败:', insErr)
    }

    // 逐条更新已存在词汇的频次
    for (const u of toUpdate) {
      await supabase
        .from('wc_vocabulary_bank')
        .update({ frequency: u.frequency, last_seen: now })
        .eq('id', u.id)
    }
  } catch (err) {
    console.error('[VocabBank] upsert 异常:', err)
  }
}

/**
 * 获取指定用户的词汇银行列表
 * 按 frequency 降序排列，支持分页
 */
export const getVocabularyBank = async (userId: string, limit = 200, offset = 0) => {
  const { data, error } = await supabase
    .from('wc_vocabulary_bank')
    .select('*')
    .eq('user_id', userId)
    .order('frequency', { ascending: false })
    .order('last_seen', { ascending: false })
    .range(offset, offset + limit - 1)

  return { data: (data || []) as VocabBankEntry[], error }
}

/**
 * 删除词汇银行中的某条词汇（按 id）
 */
export const deleteVocabBankEntry = async (entryId: string) => {
  const { error } = await supabase
    .from('wc_vocabulary_bank')
    .delete()
    .eq('id', entryId)

  if (error) console.error('[VocabBank] 删除词汇失败:', error)
  return { error }
}

// ==========================================
// 地道搭配银行（wc_collocation_bank）
// ==========================================

export interface CollocationBankEntry {
  id: string
  user_id: string
  en: string
  zh: string
  topic: string | null
  frequency: number
  first_seen: string
  last_seen: string
}

/**
 * 批量 upsert 搭配到地道搭配银行
 * 已存在则累加 frequency + 更新 last_seen，否则插入新行
 */
export const upsertCollocationBank = async (
  userId: string,
  collocations: { en: string; zh: string }[],
  topic: string
) => {
  if (!collocations || collocations.length === 0) return

  try {
    const enList = collocations.map(c => c.en.toLowerCase())
    const { data: existing } = await supabase
      .from('wc_collocation_bank')
      .select('id, en, frequency')
      .eq('user_id', userId)
      .in('en', enList)

    const existingMap = new Map<string, { id: string; frequency: number }>(
      (existing || []).map((r: any) => [r.en.toLowerCase(), { id: r.id, frequency: r.frequency }])
    )

    const now = new Date().toISOString()
    const toInsert: any[] = []
    const toUpdate: { id: string; frequency: number }[] = []

    for (const c of collocations) {
      const key = c.en.toLowerCase()
      const found = existingMap.get(key)
      if (found) {
        toUpdate.push({ id: found.id, frequency: found.frequency + 1 })
      } else {
        toInsert.push({
          user_id: userId,
          en: c.en,
          zh: c.zh,
          topic,
          frequency: 1,
          first_seen: now,
          last_seen: now,
        })
      }
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('wc_collocation_bank').insert(toInsert)
      if (insErr) console.error('[CollocationBank] 插入搭配失败:', insErr)
    }

    for (const u of toUpdate) {
      await supabase
        .from('wc_collocation_bank')
        .update({ frequency: u.frequency, last_seen: now })
        .eq('id', u.id)
    }
  } catch (err) {
    console.error('[CollocationBank] upsert 异常:', err)
  }
}

/**
 * 获取指定用户的搭配银行列表（按频次降序）
 */
export const getCollocationBank = async (userId: string, limit = 200, offset = 0) => {
  const { data, error } = await supabase
    .from('wc_collocation_bank')
    .select('*')
    .eq('user_id', userId)
    .order('frequency', { ascending: false })
    .order('last_seen', { ascending: false })
    .range(offset, offset + limit - 1)

  return { data: (data || []) as CollocationBankEntry[], error }
}

/**
 * 删除搭配银行中的某条（按 id）
 */
export const deleteCollocationBankEntry = async (entryId: string) => {
  const { error } = await supabase
    .from('wc_collocation_bank')
    .delete()
    .eq('id', entryId)

  if (error) console.error('[CollocationBank] 删除搭配失败:', error)
  return { error }
}

/**
 * 获取指定学生的思维过程记录
 */
export const getThinkingProcessByUser = async (userId: string) => {
  const { data, error } = await supabase
    .from('wc_thinking_process')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return { data, error }
}

/**
 * 获取学生最近一条尚未提交批改的写作过程，用于恢复中途退出的草稿。
 * completed 表示已进入组合成文编辑区，仍然属于可恢复状态；只有
 * sent_to_grader 才表示本次写作已经交给批改流程。
 */
export const getLatestUnfinishedThinkingProcess = async (userId: string) => {
  const { data, error } = await supabase
    .from('wc_thinking_process')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'sent_to_grader')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return { data, error }
}
