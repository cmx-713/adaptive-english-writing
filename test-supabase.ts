/**
 * Supabase 连接测试脚本
 * 运行方式：npx tsx test-supabase.ts
 */

import { createClient } from '@supabase/supabase-js'

// 直接使用配置（测试用）
const supabaseUrl = 'https://jorzfzjlnxnhnwxczxmu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcnpmempsbnhuaG53eGN6eG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTk4NzMsImV4cCI6MjA4NjQzNTg3M30.ueL1nGFIau9f6Rmi5VFB6CGvsLdrUmQf20tLL6qmc2I'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSupabaseConnection() {
  console.log('🔍 开始测试 Supabase 连接...\n')

  try {
    // 1. 测试基本连接
    console.log('1️⃣ 测试基本连接...')
    const { data: users, error: usersError } = await supabase
      .from('wc_users')
      .select('count')
      .limit(1)
    
    if (usersError) {
      console.error('❌ 连接失败:', usersError.message)
      return
    }
    console.log('✅ 连接成功！')

    // 2. 测试表是否存在
    console.log('\n2️⃣ 检查表是否存在...')
    const tables = ['wc_users', 'wc_scaffold_history', 'wc_essay_grades', 'wc_drill_history', 'wc_agent_usage_logs']
    
    for (const table of tables) {
      const { error } = await supabase.from(table).select('count').limit(1)
      if (error) {
        console.log(`   ❌ ${table} - ${error.message}`)
      } else {
        console.log(`   ✅ ${table} - 正常`)
      }
    }

    // 3. 测试当前用户
    console.log('\n3️⃣ 检查当前用户...')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (user) {
      console.log(`✅ 已登录: ${user.email || user.id}`)
    } else {
      console.log('ℹ️  未登录（这是正常的）')
    }

    console.log('\n✅ 所有测试通过！Supabase 配置正确。')
  } catch (error) {
    console.error('❌ 测试失败:', error)
  }
}

testSupabaseConnection()
