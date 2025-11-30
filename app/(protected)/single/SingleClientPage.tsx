'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import SingleScore from '@/components/single/SingleScore';
import SinglePlayerBar from '@/components/single/SinglePlayerBar';
import SingleController from '@/components/single/SingleController';

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

// Mock 상수
const MOCK_BPM = 120;
const MOCK_BEATS_PER_MEASURE = 4;
const MEASURE_DURATION = (60 / MOCK_BPM) * MOCK_BEATS_PER_MEASURE; // 2초

export default function SingleClientPage() {
    const router = useRouter();
    const [selectedMeasures, setSelectedMeasures] = useState<{ start: number; end: number } | null>(null);

    // 재생 상태
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isJamming, setIsJamming] = useState(false);
    const [jamOnlyMode, setJamOnlyMode] = useState(false);
    const [metronomeOn, setMetronomeOn] = useState(false);
    const [pressedKey, setPressedKey] = useState<string | null>(null);

    // Mock Data
    const songTitle = "Summer Breeze";
    const artist = "The Melodics";

    // 전체 마디 수 및 duration 계산
    const totalMeasures = useMemo(() =>
        mockSections.reduce((acc, s) => acc + s.measures.length, 0),
        []
    );
    const duration = totalMeasures * MEASURE_DURATION;

    // 섹션별 시간 계산 (PlayerBar용)
    const playerBarSections = useMemo(() => {
        let accumulatedMeasures = 0;
        return mockSections.map(section => {
            const startTime = accumulatedMeasures * MEASURE_DURATION;
            accumulatedMeasures += section.measures.length;
            const endTime = accumulatedMeasures * MEASURE_DURATION;
            return {
                id: section.id,
                label: section.label,
                startTime,
                endTime,
                isJamSection: section.isJamSection,
            };
        });
    }, []);

    // 현재 섹션 인덱스 계산
    const currentSectionIndex = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < mockSections.length; i++) {
            const sectionDuration = mockSections[i].measures.length * MEASURE_DURATION;
            if (currentTime < accumulatedTime + sectionDuration) {
                return i;
            }
            accumulatedTime += sectionDuration;
        }
        return mockSections.length - 1;
    }, [currentTime]);

    // 현재 섹션 내 마디 계산
    const currentMeasureInSection = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            accumulatedTime += mockSections[i].measures.length * MEASURE_DURATION;
        }
        const timeInSection = currentTime - accumulatedTime;
        return Math.floor(timeInSection / MEASURE_DURATION);
    }, [currentTime, currentSectionIndex]);

    // 마디 내 진행률
    const measureProgress = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            accumulatedTime += mockSections[i].measures.length * MEASURE_DURATION;
        }
        const timeInSection = currentTime - accumulatedTime;
        const measureTime = timeInSection % MEASURE_DURATION;
        return measureTime / MEASURE_DURATION;
    }, [currentTime, currentSectionIndex]);

    // 현재 섹션 정보
    const currentSection = mockSections[currentSectionIndex];
    const isJamSection = currentSection?.isJamSection || false;

    // 전역 마디 번호 계산
    const globalMeasure = useMemo(() => {
        let total = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            total += mockSections[i].measures.length;
        }
        return total + currentMeasureInSection + 1;
    }, [currentSectionIndex, currentMeasureInSection]);

    // 시간 포맷
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // 재생/정지 토글
    const handlePlayPause = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);

    // 시간 변경 (seek)
    const handleTimeChange = useCallback((newTime: number) => {
        setCurrentTime(Math.max(0, Math.min(newTime, duration)));
    }, [duration]);

    // 마디 단위 이동
    const handleSeekByMeasures = useCallback((offset: number) => {
        const currentMeasureNum = Math.floor(currentTime / MEASURE_DURATION);
        const targetMeasure = Math.max(0, Math.min(currentMeasureNum + offset, totalMeasures - 1));
        setCurrentTime(targetMeasure * MEASURE_DURATION);
    }, [currentTime, totalMeasures]);

    // JAM 토글
    const handleToggleJam = useCallback(() => {
        setIsJamming(prev => !prev);
    }, []);

    // 저장
    const handleSave = useCallback(() => {
        console.log('Save clicked');
        // TODO: 실제 저장 로직
    }, []);

    // 재생 시뮬레이션
    useEffect(() => {
        if (!isPlaying) return;

        const interval = setInterval(() => {
            setCurrentTime(prev => {
                const next = prev + 0.1;
                if (next >= duration) {
                    setIsPlaying(false);
                    return 0;
                }
                return next;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [isPlaying, duration]);

    // 키보드 단축키
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    setPressedKey('space');
                    handlePlayPause();
                    break;
                case 'KeyZ':
                    e.preventDefault();
                    setPressedKey('z');
                    handleSeekByMeasures(-1);
                    break;
                case 'KeyX':
                    e.preventDefault();
                    setPressedKey('x');
                    handleSeekByMeasures(1);
                    break;
                case 'KeyS':
                    e.preventDefault();
                    setJamOnlyMode(prev => !prev);
                    break;
            }
        };

        const handleKeyUp = () => {
            setPressedKey(null);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handlePlayPause, handleSeekByMeasures]);

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
                                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                                <span>{currentSection?.label} - {globalMeasure}/{totalMeasures} 마디</span>
                            </div>
                            <div className={`text-sm font-bold flex items-center gap-2 ${isJamSection ? 'text-[#FF7B7B]' : 'text-gray-500'}`}>
                                {isJamSection && <div className="w-2 h-2 rounded-full bg-[#FF7B7B] animate-pulse" />}
                                JAM SECTION
                            </div>
                        </div>
                    </div>

                    {/* Center: Score Area - 플래그 아래에 연결 (FEED와 동일한 배경색) */}
                    <div className="h-full pt-12 rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 overflow-hidden">
                        <SingleScore
                            sections={mockSections}
                            currentSectionIndex={currentSectionIndex}
                            currentMeasure={currentMeasureInSection}
                            measureProgress={measureProgress}
                            selectedMeasures={selectedMeasures}
                            onSelectionChange={setSelectedMeasures}
                        />
                    </div>
                </div>

                {/* Bottom: PlayerBar + Controller */}
                <div className="mt-6 flex-shrink-0 rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 p-4 space-y-4">
                    {/* 재생바 */}
                    <SinglePlayerBar
                        currentTime={currentTime}
                        duration={duration}
                        sections={playerBarSections}
                        onTimeChange={handleTimeChange}
                    />

                    {/* 컨트롤러 */}
                    <SingleController
                        isPlaying={isPlaying}
                        onPlayPause={handlePlayPause}
                        onSeekBackward={() => handleSeekByMeasures(-1)}
                        onSeekForward={() => handleSeekByMeasures(1)}
                        isJamming={isJamming}
                        onToggleJam={handleToggleJam}
                        jamOnlyMode={jamOnlyMode}
                        onToggleJamOnly={setJamOnlyMode}
                        metronomeOn={metronomeOn}
                        onToggleMetronome={setMetronomeOn}
                        onSave={handleSave}
                        currentTime={currentTime}
                        duration={duration}
                        pressedKey={pressedKey}
                    />
                </div>
            </div>
        </div>
    );
}
