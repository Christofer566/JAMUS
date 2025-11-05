import { createClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const cookieStore = cookies()
    const supabase = createClient()

    // Magic Link 코드를 세션으로 교환
    await supabase.auth.exchangeCodeForSession(code)
  }

  // 로그인 성공 후 메인 페이지로 리다이렉트
  // (메인 페이지가 자동으로 /login으로 보내거나, 나중에 Feed로 보낼 예정)
  return NextResponse.redirect(new URL('/', requestUrl.origin))
}
