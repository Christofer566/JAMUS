'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export default function SingleClientPage() {
    const router = useRouter();

    // Mock Data
    const songTitle = "Summer Breeze";
    const artist = "The Melodics";
    const currentTime = "0:00";
    const totalTime = "2:24";
    const currentSection = "Intro";
    const currentMeasure = 1;
    const totalMeasures = 32;
    const isJamSection = false; // Intro

    return (
        <div className="flex flex-col h-full text-white">
            {/* Header Area - 3줄 구조 */}
            <div className="flex flex-col gap-2 px-6 pt-6">
                {/* Line 1: 뒤로가기 + 곡 정보 + SINGLE MODE */}
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-bold leading-none">{songTitle}</h1>
                            <span className="text-sm text-gray-400">{artist}</span>
                        </div>
                    </div>
                    <div className="px-3 py-1 border border-gray-600 rounded-full text-xs font-medium text-gray-300">
                        SINGLE MODE
                    </div>
                </div>

            </div>

            {/* 악보 영역 + 플래그 영역 컨테이너 */}
            <div className="flex-1 mx-6 mt-4 relative">
                {/* Line 2: 시간 + 섹션/마디 + JAM SECTION - 플래그/책갈피 스타일 */}
                <div className="absolute -top-0 left-0 right-0 z-10 px-4 py-3 rounded-t-xl border border-b-0 border-gray-700 bg-[#0F172A]">
                    <div className="flex justify-between items-center">
                        <div className="flex gap-6 text-sm font-mono text-gray-300">
                            <span>{currentTime} / {totalTime}</span>
                            <span>{currentSection} - {currentMeasure}/{totalMeasures} 마디</span>
                        </div>
                        <div className={`text-sm font-bold flex items-center gap-2 ${isJamSection ? 'text-red-500' : 'text-gray-500'}`}>
                            {isJamSection && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                            JAM SECTION ACTIVE
                        </div>
                    </div>
                </div>

                {/* Center: Score Placeholder (Phase 2) - 플래그 아래에 연결 */}
                <div className="h-full pt-12 bg-[#1E293B] rounded-xl border border-gray-700 flex items-center justify-center">
                    <span className="text-gray-500 text-lg">악보 영역 (Phase 2)</span>
                </div>
            </div>

            {/* Bottom: Controller Placeholder (Phase 3) */}
            <div className="h-24 mx-6 my-6 bg-[#1E293B] rounded-xl border border-gray-700 flex items-center justify-center">
                <span className="text-gray-500 text-lg">컨트롤러 영역 (Phase 3)</span>
            </div>
        </div>
    );
}
