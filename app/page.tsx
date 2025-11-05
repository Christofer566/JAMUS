'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

export default function FeedPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // 로그인 상태 확인
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }
      
      setUser(user)
      setLoading(false)
    }

    checkUser()
  }, [router, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1E1F2B]">
        <div className="text-[#F7F8FB]">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1E1F2B] flex flex-col">
      {/* Header */}
      <header className="bg-[#2A2B3A] border-b border-[#666666]/30 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#F7F8FB]">JAMUS</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#D8D8D8]">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-[#A0A0A0] hover:text-[#1E6FFB] transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-8">
        {/* 임시 Feed 콘텐츠 */}
        <div className="bg-[#2A2B3A] rounded-3xl p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-[#1E6FFB]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg 
                className="w-10 h-10 text-[#1E6FFB]" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" 
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-[#F7F8FB] mb-2">
              Feed 화면 준비 중
            </h2>
            <p className="text-[#D8D8D8]">
              곧 친구들의 음악 취향을 확인할 수 있어요
            </p>
          </div>

          <div className="pt-6 border-t border-[#666666]/30">
            <p className="text-sm text-[#A0A0A0] mb-4">
              ✅ 로그인 성공! <br/>
              ✅ profiles 테이블 작동 확인 완료
            </p>
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-[#2A2B3A] border-t border-[#666666]/30">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-around">
            {/* Discover */}
            <button className="flex flex-col items-center gap-1 text-[#A0A0A0] hover:text-[#1E6FFB] transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-xs">Discover</span>
            </button>

            {/* Feed */}
            <button className="flex flex-col items-center gap-1 text-[#1E6FFB]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="text-xs font-medium">Feed</span>
            </button>

            {/* My JAM */}
            <button className="flex flex-col items-center gap-1 text-[#A0A0A0] hover:text-[#1E6FFB] transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs">My JAM</span>
            </button>

            {/* Single */}
            <button className="flex flex-col items-center gap-1 text-[#A0A0A0] hover:text-[#1E6FFB] transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="text-xs">Single</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  )
}
