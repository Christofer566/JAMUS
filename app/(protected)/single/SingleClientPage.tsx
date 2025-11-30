'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import SingleScore from '@/components/single/SingleScore';

// Mock 섹션 데이터 (FEED와 동일한 구조)
const mockSections = [
    {
        id: 'intro',
        label: 'Intro',
        isJamSection: false,
        measures: [
            { chord: 'C' }, { chord: 'G' }, { chord: 'Am' }, { chord: 'F' },
            { chord: 'C' }, { chord: 'G' }, { chord: 'Am' }, { chord: 'F' },
        ]
    },
    {
        id: 'chorus',
        label: 'Chorus',
        isJamSection: true,
        measures: [
            { chord: 'C' }, { chord: 'G' }, { chord: 'Am' }, { chord: 'F' },
            { chord: 'C' }, { chord: 'G' }, { chord: 'Am' }, { chord: 'F' },
            { chord: 'Dm' }, { chord: 'G' }, { chord: 'C' }, { chord: 'Am' },
            { chord: 'Dm' }, { chord: 'G' }, { chord: 'C' }, { chord: 'C' },
            { chord: 'F' }, { chord: 'G' }, { chord: 'Am' }, { chord: 'Em' },
            { chord: 'F' }, { chord: 'G' }, { chord: 'C' }, { chord: 'C' },
            { chord: 'Am' }, { chord: 'Em' }, { chord: 'F' }, { chord: 'G' },
            { chord: 'Am' }, { chord: 'Em' }, { chord: 'F' }, { chord: 'G' },
        ]
    },
    {
        id: 'outro',
        label: 'Outro',
        isJamSection: false,
        measures: [
            { chord: 'C' }, { chord: 'G' }, { chord: 'Am' }, { chord: 'F' },
            { chord: 'C' }, { chord: 'G' }, { chord: 'C' }, { chord: 'C' },
        ]
    }
];

export default function SingleClientPage() {
    const router = useRouter();
    const [selectedMeasures, setSelectedMeasures] = useState<{ start: number; end: number } | null>(null);

    // Mock Data
    const songTitle = "Summer Breeze";
    const artist = "The Melodics";
    const currentTime = "0:00";
    const totalTime = "2:24";
    const currentSectionIndex = 0;
    const currentMeasure = 0;
    const measureProgress = 0;

    // 현재 섹션 정보 계산
    const currentSection = mockSections[currentSectionIndex];
    const totalMeasures = mockSections.reduce((acc, s) => acc + s.measures.length, 0);
    const isJamSection = currentSection?.isJamSection || false;

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden">
            <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden px-8 py-8">
                {/* Header Area */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                    {/* Line 1: 뒤로가기 + 곡 정보 + SINGLE MODE */}
                    <div className="flex justify-between items-center text-white">
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
                <div className="flex-1 mt-4 relative min-h-0">
                    {/* Line 2: 시간 + 섹션/마디 + JAM SECTION - 플래그/책갈피 스타일 */}
                    <div className="absolute -top-0 left-0 right-0 z-10 px-4 py-3 rounded-t-xl border border-b-0 border-gray-700 bg-[#0F172A]">
                        <div className="flex justify-between items-center text-white">
                            <div className="flex gap-6 text-sm font-mono text-gray-300">
                                <span>{currentTime} / {totalTime}</span>
                                <span>{currentSection?.label} - {currentMeasure + 1}/{totalMeasures} 마디</span>
                            </div>
                            <div className={`text-sm font-bold flex items-center gap-2 ${isJamSection ? 'text-[#1E6FFB]' : 'text-gray-500'}`}>
                                {isJamSection && <div className="w-2 h-2 rounded-full bg-[#1E6FFB] animate-pulse" />}
                                JAM SECTION
                            </div>
                        </div>
                    </div>

                    {/* Center: Score Area - 플래그 아래에 연결 (FEED와 동일한 배경색) */}
                    <div className="h-full pt-12 rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 overflow-hidden">
                        <SingleScore
                            sections={mockSections}
                            currentSectionIndex={currentSectionIndex}
                            currentMeasure={currentMeasure}
                            measureProgress={measureProgress}
                            selectedMeasures={selectedMeasures}
                            onSelectionChange={setSelectedMeasures}
                        />
                    </div>
                </div>

                {/* Bottom: Controller Placeholder (Phase 3) */}
                <div className="h-24 mt-6 flex-shrink-0 bg-[#1E293B]/50 rounded-xl border border-gray-700 flex items-center justify-center">
                    <span className="text-gray-500 text-lg">컨트롤러 영역 (Phase 3)</span>
                </div>
            </div>
        </div>
    );
}
