'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function VerifyContent() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // URL 파라미터에서 이메일 가져오기
  useEffect(() => {
    const emailParam = searchParams?.get('email')
    if (emailParam) {
      setEmail(emailParam)
    } else {
      // 이메일이 없으면 로그인 페이지로 리다이렉트
      router.push('/login')
    }
  }, [searchParams, router])

  // 카운트다운 타이머
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  // Toast 자동 숨김
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [showToast])

  const showToastMessage = (message: string) => {
    setToastMessage(message)
    setShowToast(true)
  }

  const handleResendEmail = async () => {
    if (countdown > 0) return

    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error

      showToastMessage('✅ 이메일이 재전송되었습니다')
      setCountdown(60) // 60초 쿨다운 시작
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      showToastMessage('❌ ' + (errorMessage || '이메일 전송 중 오류가 발생했습니다'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1E1F2B] px-4">
      {/* Toast 알림 */}
      {showToast && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 
                      bg-[#2A2B3A] border border-[#666666] rounded-2xl px-6 py-4 shadow-2xl
                      animate-fade-in">
          <p className="text-[#F7F8FB] text-sm font-medium">{toastMessage}</p>
        </div>
      )}

      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-[#F7F8FB] mb-2">JAMUS</h1>
          <p className="text-[#D8D8D8]">리듬이 비지 않는 곳</p>
        </div>

        {/* Verify Card */}
        <div className="bg-[#2A2B3A] rounded-3xl p-8 shadow-xl">
          {/* Email Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-[#1E6FFB]/10 rounded-full flex items-center justify-center">
              <svg 
                className="w-8 h-8 text-[#1E6FFB]" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" 
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-semibold text-[#F7F8FB] mb-4 text-center">
            이메일을 확인해주세요
          </h2>

          {/* Description */}
          <div className="mb-8">
            <p className="text-[#D8D8D8] text-center mb-2">
              <span className="text-[#1E6FFB] font-medium">{email}</span>
              <span className="block mt-1">으로 로그인 링크를 보냈습니다</span>
            </p>
            <p className="text-[#A0A0A0] text-sm text-center mt-4">
              이메일함을 확인하고 로그인 링크를 클릭해주세요
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-[#666666]/30 my-6"></div>

          {/* Resend Section */}
          <div className="text-center">
            <p className="text-[#A0A0A0] text-sm mb-4">
              이메일이 오지 않았나요?
            </p>
            
            <button
              onClick={handleResendEmail}
              disabled={loading || countdown > 0}
              className="w-full py-3 bg-[#2A2B3A] border-2 border-[#1E6FFB] text-[#1E6FFB] font-medium rounded-2xl
                       hover:bg-[#1E6FFB] hover:text-white
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#2A2B3A] disabled:hover:text-[#1E6FFB]
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
                  전송 중...
                </span>
              ) : countdown > 0 ? (
                `${countdown}초 후 재시도 가능`
              ) : (
                '다시 보내기'
              )}
            </button>
          </div>
        </div>

        {/* Back to Login */}
        <button
          onClick={() => router.push('/login')}
          className="mt-6 w-full text-center text-sm text-[#A0A0A0] hover:text-[#1E6FFB] transition-colors"
        >
          ← 로그인 페이지로 돌아가기
        </button>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#1E1F2B]">
        <div className="text-[#F7F8FB]">로딩 중...</div>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}
