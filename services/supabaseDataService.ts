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
} from '../types'

// ==========================================
// 1. 用户管理（quickSignIn 模式）
// ==========================================

/**
 * 快速登录/注册：根据学号查找或创建用户
 * 保持与 authService.quickSignIn 相同的逻辑
 */
export const quickSignInSupabase = async (studentId: string, name: string) => {
  try {
    // 查找已存在的用户
    const { data: existingUser, error: findError } = await supabase
      .from('wc_users')
      .select('*')
      .eq('student_id', studentId)
      .single()

    if (existingUser) {
      return { data: existingUser, error: null }
    }

    // 不存在则创建新用户
    const { data: newUser, error: insertError } = await supabase
      .from('wc_users')
      .insert({
        student_id: studentId,
        name,
        email: `${studentId}@student.local`,
        role: 'student',
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
// 2. 思维训练记录（wc_scaffold_history）
// ==========================================

/**
 * 保存思维训练（语言支架）数据到 Supabase
 */
export const saveScaffoldToSupabase = async (
  userId: string,
  topic: string,
  scaffoldData: ScaffoldContent
) => {
  try {
    const { data, error } = await supabase
      .from('wc_scaffold_history')
      .insert({
        user_id: userId,
        topic,
        selected_dimension: scaffoldData.selectedDimension,
        user_idea: scaffoldData.userIdea,
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
  result: EssayGradeResult
) => {
  try {
    const { data, error } = await supabase
      .from('wc_essay_grades')
      .insert({
        user_id: userId,
        topic,
        essay,
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
  userInputs: Record<string, string>
) => {
  try {
    const { data, error } = await supabase
      .from('wc_inspiration_history')
      .insert({
        user_id: userId,
        topic,
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
  assembledEssay: string
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
        .update({ user_inputs: updatedInputs })
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
    .eq('role', 'student')
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
  const [essays, drills, scaffolds] = await Promise.all([
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
  ])

  return {
    essays: essays.data || [],
    drills: drills.data || [],
    scaffolds: scaffolds.data || [],
    error: essays.error || drills.error || scaffolds.error,
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
