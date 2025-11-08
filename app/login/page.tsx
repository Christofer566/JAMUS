'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const resetFeedback = () => {
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    resetFeedback()

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

      if (password.length < 8) {
        setError('비밀번호는 8자 이상이어야 합니다')
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

        router.push('/')
        router.refresh()
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })

        if (error) throw error

        router.push('/auth/verify?email=' + encodeURIComponent(email))
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

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#05060F] px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(82,108,255,0.22),_transparent_58%),_radial-gradient(circle_at_bottom,_rgba(123,76,255,0.16),_transparent_52%)]" />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-10 text-center">
          <h1 className="text-[44px] font-black tracking-tight text-white">JAMUS</h1>
          <p className="mt-3 text-base text-[#A2ABCA]">당신의 무대가 기다립니다</p>
        </div>

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
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-[#C9D0F8]">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={loading}
                autoComplete="email"
                className="w-full rounded-2xl border border-white/10 bg-[#0B1223]/60 px-4 py-3 text-white placeholder-[#6E7898] transition-all duration-200 focus:border-[#526CFF] focus:outline-none focus:ring-2 focus:ring-[#526CFF]/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-[#C9D0F8]">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                disabled={loading}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full rounded-2xl border border-white/10 bg-[#0B1223]/60 px-4 py-3 text-white placeholder-[#6E7898] transition-all duration-200 focus:border-[#526CFF] focus:outline-none focus:ring-2 focus:ring-[#526CFF]/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

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
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-white/10 bg-[#0B1223]/60 px-4 py-3 text-white placeholder-[#6E7898] transition-all duration-200 focus:border-[#526CFF] focus:outline-none focus:ring-2 focus:ring-[#526CFF]/30 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#5368FF] via-[#645BFF] to-[#7B4CFF] px-4 py-3 text-base font-semibold text-white transition-transform duration-200 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#6A5DFF]/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24">
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

          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[#D3D7F4] transition-colors duration-200 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#1A1C2D]">
                G
              </span>
              Google로 계속하기
            </button>
            <button
              type="button"
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[#D3D7F4] transition-colors duration-200 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#1A1C2D]">
                GH
              </span>
              GitHub로 계속하기
            </button>
            <button
              type="button"
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[#D3D7F4] transition-colors duration-200 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#1A1C2D]">
                AP
              </span>
              Apple로 계속하기
            </button>
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-[#7A82A6]">
          {mode === 'login' ? (
            <>
              계정이 없으신가요?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup')
                  resetFeedback()
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
                  resetFeedback()
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
