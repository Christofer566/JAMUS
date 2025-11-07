'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요')
      return
    }

    if (!validateEmail(email)) {
      setError('올바른 이메일 형식이 아닙니다')
      return
    }

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다')
      return
    }

    setLoading(true)

    try {
      if (isSignUp) {
        console.log('회원가입 시작...')
        // 회원가입
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        
        console.log('회원가입 성공, 로그인 시도...')
        // 회원가입 성공 - 바로 로그인 시도
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        
        console.log('로그인 성공, / 이동')
        window.location.href = '/'
      } else {
        console.log('로그인 시작...')
        // 로그인
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        
        console.log('로그인 성공, / 이동')
        window.location.href = '/'
      }
    } catch (error: any) {
      console.error('Auth error:', error)
      setError(error.message || '오류가 발생했습니다')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1E1F2B] px-4">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-[#F7F8FB] mb-2">JAMUS</h1>
          <p className="text-[#D8D8D8]">리듬이 비지 않는 곳</p>
        </div>

        {/* Login/SignUp Form */}
        <div className="bg-[#2A2B3A] rounded-3xl p-8 shadow-xl">
          <h2 className="text-2xl font-semibold text-[#F7F8FB] mb-6">
            {isSignUp ? '회원가입' : '로그인'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium text-[#D8D8D8] mb-2"
              >
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={loading}
                className="w-full px-4 py-3 bg-[#1E1F2B] border border-[#666666] rounded-2xl 
                         text-[#F7F8FB] placeholder-[#A0A0A0]
                         focus:outline-none focus:border-[#1E6FFB] focus:ring-2 focus:ring-[#1E6FFB]/20
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
              />
            </div>

            {/* Password Input */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-[#D8D8D8] mb-2"
              >
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
                disabled={loading}
                className="w-full px-4 py-3 bg-[#1E1F2B] border border-[#666666] rounded-2xl 
                         text-[#F7F8FB] placeholder-[#A0A0A0]
                         focus:outline-none focus:border-[#1E6FFB] focus:ring-2 focus:ring-[#1E6FFB]/20
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#1E6FFB] text-white font-medium rounded-2xl
                       hover:bg-[#1557D0] active:scale-98
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 shadow-lg shadow-[#1E6FFB]/20"
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
                  처리 중...
                </span>
              ) : (
                isSignUp ? '회원가입' : '로그인'
              )}
            </button>
          </form>

          {/* Toggle Sign Up / Login */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError('')
              }}
              className="text-sm text-[#1E6FFB] hover:text-[#1557D0] transition-colors"
            >
              {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
