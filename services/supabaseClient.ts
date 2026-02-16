/**
 * Supabase Client Configuration
 * 用于前端与 Supabase 数据库交互
 */

import { createClient } from '@supabase/supabase-js'

// 从环境变量读取配置
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 验证环境变量
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Missing Supabase environment variables!\n' +
    'Please create .env.local file with:\n' +
    '  VITE_SUPABASE_URL=your-project-url\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key'
  )
}

// 创建 Supabase 客户端（学生端使用）
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
})

// 教师端客户端（使用 service_role key，未来实现）
// export const supabaseAdmin = createClient(
//   supabaseUrl,
//   import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
// )

/**
 * 辅助函数：获取当前用户
 */
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) {
    console.error('获取用户失败:', error)
    return null
  }
  return user
}

/**
 * 辅助函数：获取当前用户的完整信息（包含 role）
 */
export const getCurrentUserProfile = async () => {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('wc_users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('获取用户资料失败:', error)
    return null
  }

  return data
}

/**
 * 辅助函数：登出
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('登出失败:', error)
    throw error
  }
}

export default supabase
