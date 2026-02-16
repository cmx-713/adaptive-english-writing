/**
 * Supabase Authentication Service
 * 用户注册、登录、登出功能
 */

import { supabase } from './supabaseClient'

// ==========================================
// 1. 注册新用户
// ==========================================

export interface SignUpData {
  studentId: string // 学号
  name: string // 姓名
  email: string // 邮箱（用于登录）
  password: string // 密码
}

/**
 * 学生注册
 */
export const signUpStudent = async (data: SignUpData) => {
  try {
    // Step 1: 在 Supabase Auth 中创建用户
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    })

    if (authError) {
      console.error('注册失败（Auth）:', authError)
      throw authError
    }

    if (!authData.user) {
      throw new Error('用户创建失败')
    }

    // Step 2: 在 wc_users 表中创建用户资料
    const { error: profileError } = await supabase
      .from('wc_users')
      .insert({
        id: authData.user.id, // 使用 Supabase Auth 生成的 UUID
        student_id: data.studentId,
        name: data.name,
        email: data.email,
        role: 'student',
      })

    if (profileError) {
      console.error('创建用户资料失败:', profileError)
      // 如果资料创建失败，需要清理 Auth 用户（但 Supabase 不支持通过客户端删除）
      throw profileError
    }

    return authData.user
  } catch (error) {
    console.error('注册失败:', error)
    throw error
  }
}

// ==========================================
// 2. 登录
// ==========================================

/**
 * 学生/教师登录
 */
export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('登录失败:', error)
    throw error
  }

  // 获取用户资料（包含 role）
  const { data: profile, error: profileError } = await supabase
    .from('wc_users')
    .select('*')
    .eq('id', data.user.id)
    .single()

  if (profileError) {
    console.error('获取用户资料失败:', profileError)
    throw profileError
  }

  return {
    user: data.user,
    profile,
    session: data.session,
  }
}

// ==========================================
// 3. 登出
// ==========================================

/**
 * 登出
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('登出失败:', error)
    throw error
  }
}

// ==========================================
// 4. 检查当前登录状态
// ==========================================

/**
 * 获取当前会话
 */
export const getCurrentSession = async () => {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    console.error('获取会话失败:', error)
    return null
  }

  return data.session
}

/**
 * 监听认证状态变化
 */
export const onAuthStateChange = (callback: (session: any) => void) => {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session)
  })
}

// ==========================================
// 5. 简化登录（兼容旧的 localStorage 方式）
// ==========================================

/**
 * 简单登录（仅使用学号，不需要密码）
 * 用于快速迁移，未来应该使用完整的 email/password 认证
 */
export const quickSignIn = async (studentId: string, name: string) => {
  // 检查用户是否已存在
  const { data: existingUser } = await supabase
    .from('wc_users')
    .select('*')
    .eq('student_id', studentId)
    .single()

  if (existingUser) {
    // 用户已存在，返回用户信息（不通过 Auth）
    return existingUser
  }

  // 用户不存在，创建新用户（不通过 Auth）
  const { data: newUser, error } = await supabase
    .from('wc_users')
    .insert({
      student_id: studentId,
      name,
      email: `${studentId}@temp.local`, // 临时邮箱
      role: 'student',
    })
    .select()
    .single()

  if (error) {
    console.error('快速登录失败:', error)
    throw error
  }

  return newUser
}
