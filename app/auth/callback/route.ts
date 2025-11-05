import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const cookieStore = cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options })
          },
        },
      }
    )

    await supabase.auth.exchangeCodeForSession(code)

    // 로그인 성공 후 profile 확인
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      // profiles 테이블에서 nickname 확인
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', user.id)
        .single()

      // nickname이 없으면 설정 페이지로
      if (profile && !profile.nickname) {
        return NextResponse.redirect(new URL('/auth/setup-profile', requestUrl.origin))
      }
    }
  }

  // nickname이 있거나 에러 시 메인 페이지로
  return NextResponse.redirect(new URL('/', requestUrl.origin))
}
