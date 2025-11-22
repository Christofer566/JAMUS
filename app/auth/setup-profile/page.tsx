'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

export default function SetupProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
    }
    getUser()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요')
      return
    }

    if (nickname.length < 2 || nickname.length > 20) {
      setError('닉네임은 2-20자 사이여야 합니다')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ nickname: nickname.trim() })
        .eq('id', user?.id)

      if (updateError) throw updateError

      // 성공 후 Feed로
      router.push('/')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage || '닉네임 저장 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1E1F2B]">
        <div className="text-[#F7F8FB]">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1E1F2B] px-4">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-[#F7F8FB] mb-2">JAMUS</h1>
          <p className="text-[#D8D8D8]">리듬이 비지 않는 곳</p>
        </div>

        {/* Setup Card */}
        <div className="bg-[#2A2B3A] rounded-3xl p-8 shadow-xl">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-[#F7F8FB] mb-2">
              환영합니다! 🎵
            </h2>
            <p className="text-[#D8D8D8] text-sm">
              JAMUS에서 사용할 닉네임을 설정해주세요
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Nickname Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[#D8D8D8] mb-2">
                닉네임
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="2-20자 사이로 입력해주세요"
                className="w-full px-4 py-3 bg-[#1E1F2B] border-2 border-[#666666] rounded-2xl
                         text-[#F7F8FB] placeholder-[#A0A0A0]
                         focus:border-[#1E6FFB] focus:outline-none
                         transition-colors"
                maxLength={20}
                disabled={loading}
              />
              {error && (
                <p className="mt-2 text-sm text-red-400">{error}</p>
              )}
              <p className="mt-2 text-xs text-[#A0A0A0]">
                {nickname.length}/20
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !nickname.trim()}
              className="w-full py-3 bg-[#1E6FFB] text-white font-medium rounded-2xl
                       hover:bg-[#1557CC]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle 
                      className="opacity-25" 
                      cx="12" 
                      cy="12" 
                      r="10" 
                      stroke="currentColor" 
                      strokeWidth="4"
                      fill="none"
                    />
                    <path 
                      className="opacity-75" 
                      fill="currentColor" 
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  저장 중...
                </span>
              ) : (
                '시작하기'
              )}
            </button>
          </form>
        </div>

        {/* Help Text */}
        <p className="mt-6 text-center text-xs text-[#A0A0A0]">
          닉네임은 나중에 프로필 설정에서 변경할 수 있어요
        </p>
      </div>
    </div>
  )
}
