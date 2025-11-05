'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // 메인 페이지 접속 시 로그인 페이지로 자동 리다이렉트
    router.push('/login')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1E1F2B]">
      <div className="text-[#F7F8FB]">리다이렉트 중...</div>
    </div>
  )
}
