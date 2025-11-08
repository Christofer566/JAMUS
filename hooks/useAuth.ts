'use client'

import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // 초기 사용자 확인
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    getUser()

    // Auth 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  const signOut = async () => {
    try {
      console.log('로그아웃 시작...')
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('로그아웃 에러:', error)
        throw error
      }
      console.log('로그아웃 성공, /login으로 이동')
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('로그아웃 실패:', error)
    }
  }

  return {
    user,
    loading,
    signOut,
  }
}
