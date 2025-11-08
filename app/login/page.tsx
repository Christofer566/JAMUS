'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('이메일을 입력해주세요')
      return
    }

    if (!validateEmail(email)) {
      setError('올바른 이메일 형식이 아닙니다')
      return
    }

    if (!password) {
      setError('비밀번호를 입력해주세요')
      return
    }

    if (mode === 'signup') {
      if (!passwordConfirm) {
        setError('비밀번호 확인을 입력해주세요')
        return
      }

      if (password !== passwordConfirm) {
        setError('비밀번호가 일치하지 않습니다')
        return
      }

      if (password.length < 6) {
        setError('비밀번호는 6자 이상이어야 합니다')
        return
      }
    }

    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        window.location.href = '/'
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) throw error

        // 회원가입 후 자동 로그인
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) throw signInError

        window.location.href = '/'
      }
    } catch (err: any) {
      setError(
        err.message ||
          (mode === 'login'
            ? '로그인 중 오류가 발생했습니다'
            : '회원가입 중 오류가 발생했습니다')
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSocialLogin = (provider: string) => {
    alert(`${provider} 로그인은 준비 중입니다`)
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#05060F] px-6">
      {/* Background Gradient */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(82,108,255,0.15),_transparent_50%)]" />

      <div className="relative w-full max-w-[420px]">
        {/* Logo Section */}
        <div className="mb-10 text-center">
          <h1 className="text-[44px] font-black tracking-tight text-white">
            JAMUS
          </h1>
          <p className="mt-3 text-base text-[#A2ABCA]">
            당신의 무대가 기다립니다
          </p>
        </div>

        {/* Form Container */}
        <div className="rounded-[32px] border border-white/8 bg-white/[0.04] p-10 shadow-[0_35px_60px_-40px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-white">
              {mode === 'login' ? '로그인' : '회원가입'}
            </h2>
            <p className="mt-2 text-sm text-[#8C94B3]">
              {mode === 'login'
                ? '이메일과 비밀번호로 계정에 접속하세요'
                : '새로운 JAMUS 계정을 만들어 보세요'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#C9D0F8]"
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
                className="w-full rounded-2xl border border-white/10 bg-[#0B1223]/60 px-4 py-3 text-white placeholder-[#6E7898] transition-all duration-200 focus:border-[#526CFF] focus:outline-none focus:ring-2 focus:ring-[#526CFF]/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#C9D0F8]"
              >
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                disabled={loading}
                className="w-full rounded-2xl border border-white/10 bg-[#0B1223]/60 px-4 py-3 text-white placeholder-[#6E7898] transition-all duration-200 focus:border-[#526CFF] focus:outline-none focus:ring-2 focus:ring-[#526CFF]/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Password Confirm (회원가입 시에만) */}
            {mode === 'signup' && (
              <div className="space-y-2">
                <label
                  htmlFor="password-confirm"
                  className="block text-sm font-medium text-[#C9D0F8]"
                >
                  비밀번호 확인
                </label>
                <input
                  id="password-confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호를 다시 입력하세요"
                  disabled={loading}
                  className="w-full rounded-2xl border border-white/10 bg-[#0B1223]/60 px-4 py-3 text-white placeholder-[#6E7898] transition-all duration-200 focus:border-[#526CFF] focus:outline-none focus:ring-2 focus:ring-[#526CFF]/30 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="space-y-3">
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#5368FF] via-[#645BFF] to-[#7B4CFF] px-4 py-3 text-base font-semibold text-white transition-transform duration-200 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#6A5DFF]/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5 animate-spin text-white"
                      viewBox="0 0 24 24"
                    >
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
                    {mode === 'login' ? '로그인 중...' : '가입 처리 중...'}
                  </span>
                ) : mode === 'login' ? (
                  '로그인'
                ) : (
                  '계정 만들기'
                )}
              </button>

              <div className="text-center text-xs uppercase tracking-[0.2em] text-[#5A6287]">
                또는
              </div>
            </div>
          </form>

          {/* Social Login Buttons */}
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => handleSocialLogin('Google')}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[#D3D7F4] transition-colors duration-200 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Google로 계속하기
            </button>

            <button
              type="button"
              onClick={() => handleSocialLogin('GitHub')}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[#D3D7F4] transition-colors duration-200 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub로 계속하기
            </button>

            <button
              type="button"
              onClick={() => handleSocialLogin('Naver')}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[#D3D7F4] transition-colors duration-200 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" />
              </svg>
              Naver로 계속하기
            </button>
          </div>
        </div>

        {/* Toggle Link */}
        <p className="mt-10 text-center text-sm text-[#7A82A6]">
          {mode === 'login' ? (
            <>
              계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup')
                  setError('')
                  setPasswordConfirm('')
                }}
                className="text-[#6882FF] underline-offset-4 transition-colors hover:text-[#8297FF]"
              >
                회원가입
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError('')
                  setPasswordConfirm('')
                }}
                className="text-[#6882FF] underline-offset-4 transition-colors hover:text-[#8297FF]"
              >
                로그인
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
