'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

    if (isSignUp && password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다')
      return
    }

    setLoading(true)

    try {
      if (isSignUp) {
        console.log('회원가입 시작...')
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        
        console.log('회원가입 성공, 로그인 시도...')
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        
        console.log('로그인 성공, / 이동')
        window.location.href = '/'
      } else {
        console.log('로그인 시작...')
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

  const handleSocialLogin = (provider: string) => {
    alert(`${provider} 로그인은 준비 중입니다`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#000000] to-[#1a1a1a] px-4">
      <div className="w-full max-w-md">
        {/* Logo & Brand Section */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">
            JAMUS
          </h1>
          <p className="text-[#D8D8D8] text-lg">
            당신의 무대가 기다립니다
          </p>
          {/* 캐릭터 영역 - 추후 추가 예정 */}
          <div className="mt-6 h-16 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#3DDF85]/20 to-[#1E6FFB]/20 flex items-center justify-center">
              <span className="text-2xl">🎵</span>
            </div>
          </div>
        </div>

        {/* Auth Form Container */}
        <div className="bg-[#1E1F2B]/80 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-white/5">
          {/* Toggle Tabs */}
          <div className="flex gap-2 mb-6 bg-[#14151C] rounded-2xl p-1">
            <button
              onClick={() => {
                setIsSignUp(false)
                setError('')
                setConfirmPassword('')
              }}
              className={`flex-1 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                !isSignUp
                  ? 'bg-[#1E6FFB] text-white shadow-lg shadow-[#1E6FFB]/30'
                  : 'text-[#A0A0A0] hover:text-white'
              }`}
            >
              로그인
            </button>
            <button
              onClick={() => {
                setIsSignUp(true)
                setError('')
              }}
              className={`flex-1 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                isSignUp
                  ? 'bg-[#1E6FFB] text-white shadow-lg shadow-[#1E6FFB]/30'
                  : 'text-[#A0A0A0] hover:text-white'
              }`}
            >
              회원가입
            </button>
          </div>

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
                className="w-full px-4 py-3 bg-[#14151C] border border-[#2A2B39] rounded-xl 
                         text-white placeholder-[#666666]
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
                placeholder="••••••"
                disabled={loading}
                className="w-full px-4 py-3 bg-[#14151C] border border-[#2A2B39] rounded-xl 
                         text-white placeholder-[#666666]
                         focus:outline-none focus:border-[#1E6FFB] focus:ring-2 focus:ring-[#1E6FFB]/20
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
              />
            </div>

            {/* Confirm Password (회원가입 시에만) */}
            {isSignUp && (
              <div>
                <label 
                  htmlFor="confirmPassword" 
                  className="block text-sm font-medium text-[#D8D8D8] mb-2"
                >
                  비밀번호 확인
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••"
                  disabled={loading}
                  className="w-full px-4 py-3 bg-[#14151C] border border-[#2A2B39] rounded-xl 
                           text-white placeholder-[#666666]
                           focus:outline-none focus:border-[#1E6FFB] focus:ring-2 focus:ring-[#1E6FFB]/20
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200"
                />
              </div>
            )}

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
              className="w-full py-3.5 bg-gradient-to-r from-[#1E6FFB] to-[#5B8DEF] text-white font-semibold rounded-xl
                       hover:shadow-lg hover:shadow-[#1E6FFB]/50 active:scale-98
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
                  처리 중...
                </span>
              ) : (
                isSignUp ? '회원가입' : '로그인'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2A2B39]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-[#1E1F2B]/80 text-[#666666]">또는</span>
            </div>
          </div>

          {/* Social Login Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleSocialLogin('Google')}
              className="w-full py-3 bg-white text-gray-800 font-medium rounded-xl
                       flex items-center justify-center gap-3
                       hover:bg-gray-100 transition-all duration-200 shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google로 계속하기
            </button>

            <button
              onClick={() => handleSocialLogin('GitHub')}
              className="w-full py-3 bg-[#24292F] text-white font-medium rounded-xl
                       flex items-center justify-center gap-3
                       hover:bg-[#2F353D] transition-all duration-200 shadow-sm"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub로 계속하기
            </button>

            <button
              onClick={() => handleSocialLogin('Naver')}
              className="w-full py-3 bg-[#03C75A] text-white font-medium rounded-xl
                       flex items-center justify-center gap-3
                       hover:bg-[#02B350] transition-all duration-200 shadow-sm"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z"/>
              </svg>
              Naver로 계속하기
            </button>
          </div>

          {/* Footer Text */}
          <p className="mt-6 text-center text-xs text-[#666666]">
            계속 진행하면 JAMUS의 이용약관과 개인정보처리방침에 동의하는 것으로 간주됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
