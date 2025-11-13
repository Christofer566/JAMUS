'use client';

import { useRouter } from "next/navigation";

export default function SinglePage() {
  const router = useRouter();
  return (
    <div className="flex h-screen items-center justify-center bg-[#1B1C26]">
      <div className="text-center space-y-6 max-w-md px-8">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold text-white">🎹</h1>
          <h2 className="text-3xl font-bold text-white">JAMUS Single Mode</h2>
        </div>

        <div className="space-y-3">
          <p className="text-xl text-[#E0E0E0]">Coming Soon</p>
          <p className="text-base text-gray-400">개인 연습 공간이 곧 오픈됩니다</p>
        </div>

        <button
          onClick={() => router.back()}
          className="mt-8 px-8 py-3 
                     bg-gradient-to-r from-[#7BA7FF] to-[#B38CFF]
                     hover:from-[#6A96EE] hover:to-[#A27BEE]
                     text-white font-semibold rounded-lg 
                     transition-all duration-200
                     shadow-lg hover:shadow-xl"
        >
          ← Feed로 돌아가기
        </button>
      </div>
    </div>
  );
}
