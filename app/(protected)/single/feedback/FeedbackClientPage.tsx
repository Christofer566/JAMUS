'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw } from 'lucide-react';
import SingleScore from '@/components/single/SingleScore';
import SinglePlayerBar from '@/components/single/SinglePlayerBar';
import { useWebAudio } from '@/hooks/useWebAudio';
import { useToast } from '@/contexts/ToastContext';
import { useFeedbackLoader } from '@/hooks/useFeedbackLoader';
import { GRADE_COLORS, GRADE_EMOJIS } from '@/types/feedback';

const TEST_AUDIO_URLS = {
    intro: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/intro.mp3",
    chorus: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/chorus.mp3",
    outro: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/outro.mp3"
};

const mockSections = [
    { id: 'intro', label: 'Intro', isJamSection: false, measures: Array(8).fill({ chord: 'Cm7' }) },
    { id: 'chorus', label: 'Chorus', isJamSection: true, measures: Array(32).fill({ chord: 'F7' }) },
    { id: 'outro', label: 'Outro', isJamSection: false, measures: Array(8).fill({ chord: 'Gm' }) }
];

const MOCK_SONG = {
    id: 'autumn-leaves', // song ID for storage
    bpm: 142,
    time_signature: '4/4',
    title: "Autumn Leaves",
    artist: "Jazz Standard"
};

const calculateMeasureDuration = (bpm: number, timeSignature: string): number => {
    const [beatsPerMeasure] = timeSignature.split('/').map(Number);
    return (60 / bpm) * beatsPerMeasure;
};

export default function FeedbackClientPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { showToast } = useToast();
    const [selectedMeasures, setSelectedMeasures] = useState<{ start: number; end: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [pressedKey, setPressedKey] = useState<string | null>(null);
    const [jamOnlyMode, setJamOnlyMode] = useState(false);

    // AI 피드백 로더 (3.5초 로딩 후 Mock 데이터 표시)
    const { isLoading: isFeedbackLoading, feedback } = useFeedbackLoader();

    const webAudio = useWebAudio({ chorusRepeat: 1 });
    const webAudioRef = useRef(webAudio);
    webAudioRef.current = webAudio;

    const measureDuration = useMemo(() => calculateMeasureDuration(MOCK_SONG.bpm, MOCK_SONG.time_signature), []);
    const totalMeasures = useMemo(() => mockSections.reduce((acc, s) => acc + s.measures.length, 0), []);
    const duration = webAudio.isReady ? webAudio.duration : totalMeasures * measureDuration;

    const introEndTime = useMemo(() => { // Re-add introEndTime calculation
        let accumulatedMeasures = 0;
        for (const section of mockSections) {
            accumulatedMeasures += section.measures.length;
            if (!section.isJamSection) { // Assuming intro is the first non-jam section
                return accumulatedMeasures * measureDuration;
            }
        }
        return 0; // Default if no intro
    }, [measureDuration]);

    const playerBarSections = useMemo(() => {
        let accumulatedMeasures = 0;
        return mockSections.map(section => {
            const startTime = accumulatedMeasures * measureDuration;
            accumulatedMeasures += section.measures.length;
            const endTime = accumulatedMeasures * measureDuration;
            return { id: section.id, label: section.label, startTime, endTime, isJamSection: section.isJamSection };
        });
    }, [measureDuration]);

    const currentSectionIndex = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < mockSections.length; i++) {
            if (currentTime < accumulatedTime + (mockSections[i].measures.length * measureDuration)) return i;
            accumulatedTime += mockSections[i].measures.length * measureDuration;
        }
        return mockSections.length - 1;
    }, [currentTime, measureDuration]);

    const currentMeasureInSection = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            accumulatedTime += mockSections[i].measures.length * measureDuration;
        }
        return Math.floor((currentTime - accumulatedTime) / measureDuration);
    }, [currentTime, currentSectionIndex, measureDuration]);

    const measureProgress = useMemo(() => {
        if (!playerBarSections[currentSectionIndex]) return 0;
        const timeInSection = currentTime - playerBarSections[currentSectionIndex].startTime;
        return (timeInSection % measureDuration) / measureDuration;
    }, [currentTime, currentSectionIndex, playerBarSections, measureDuration]);

    const currentSection = mockSections[currentSectionIndex];
    const globalMeasure = useMemo(() => {
        let total = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            total += mockSections[i].measures.length;
        }
        return total + currentMeasureInSection + 1;
    }, [currentSectionIndex, currentMeasureInSection]);

    const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

    const handleSelectionChange = useCallback((selection: { start: number; end: number } | null) => {
        setSelectedMeasures(selection);
    }, []);

    useEffect(() => { webAudioRef.current.loadAudio(TEST_AUDIO_URLS); }, []);
    useEffect(() => { setCurrentTime(webAudio.currentTime); }, [webAudio.currentTime]);

    // feedback 데이터에서 녹음 구간 가져오기
    const recordedRanges = useMemo(() => {
        if (!feedback?.recordedSegments || feedback.recordedSegments.length === 0) return [];
        return feedback.recordedSegments.map(seg => ({
            start: seg.startTime,
            end: seg.endTime
        }));
    }, [feedback]);

    // recordedMeasures 계산 (악보에 표시용)
    const recordedMeasures = useMemo(() => {
        if (!feedback?.recordedSegments || feedback.recordedSegments.length === 0 || !measureDuration) return [];
        const measures: number[] = [];
        feedback.recordedSegments.forEach(seg => {
            const startMeasure = Math.floor(seg.startTime / measureDuration) + 1;
            const endMeasure = Math.ceil(seg.endTime / measureDuration);
            for (let m = startMeasure; m <= endMeasure; m++) {
                if (!measures.includes(m)) measures.push(m);
            }
        });
        return measures.sort((a, b) => a - b);
    }, [feedback, measureDuration]);

    const handlePlayPause = useCallback(async () => {
        if (webAudio.isPlaying) {
            webAudio.pause();
            setIsPlaying(false);
        } else {
            await webAudio.play();
            setIsPlaying(true);
        }
    }, [webAudio]);

    const handleTimeChange = useCallback((newTime: number) => {
        let clampedTime = Math.max(0, Math.min(newTime, duration));
        webAudio.seek(clampedTime);
        setCurrentTime(clampedTime);
    }, [duration, webAudio]);

    const handleSeekByMeasures = useCallback((offset: number) => {
        const newTime = webAudio.currentTime + (offset * measureDuration);
        handleTimeChange(newTime);
    }, [webAudio, measureDuration, handleTimeChange]);

    const handleMeasureClick = useCallback((globalMeasureIndex: number) => {
        const targetTime = globalMeasureIndex * measureDuration;
        handleTimeChange(targetTime);
    }, [measureDuration, handleTimeChange]);
    
    const handleToggleJamOnly = useCallback((enabled: boolean) => {
        setJamOnlyMode(enabled);
        if (enabled && webAudio.currentTime < introEndTime) {
            handleTimeChange(introEndTime);
        }
    }, [webAudio, introEndTime, handleTimeChange]);
    
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            setPressedKey(e.code);
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    await handlePlayPause();
                    break;
                case 'KeyZ': e.preventDefault(); handleSeekByMeasures(-1); break;
                case 'KeyX': e.preventDefault(); handleSeekByMeasures(1); break;
                case 'KeyF': // F키 - JAM만 듣기 토글
                    e.preventDefault();
                    handleToggleJamOnly(!jamOnlyMode);
                    break;
            }
        };
        const handleKeyUp = () => setPressedKey(null);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handlePlayPause, handleSeekByMeasures, handleToggleJamOnly, jamOnlyMode]);

    useEffect(() => {
        return () => {
            webAudioRef.current.stop();
        };
    }, []);

    const handleBack = useCallback(() => {
        router.back();
    }, [router]);

    const handleShare = () => console.log('공유하기 클릭');
    const handleReJam = () => router.push('/single');

    // AI 로딩 화면
    if (isFeedbackLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-[#0A0B0F]">
                <div className="flex flex-col items-center gap-6">
                    {/* 로딩 애니메이션 */}
                    <div className="relative w-24 h-24">
                        <div className="absolute inset-0 rounded-full border-4 border-[#7BA7FF]/20" />
                        <div className="absolute inset-0 rounded-full border-4 border-t-[#7BA7FF] animate-spin" />
                        <div className="absolute inset-3 rounded-full border-4 border-[#FF7B7B]/20" />
                        <div className="absolute inset-3 rounded-full border-4 border-t-[#FF7B7B] animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                    </div>

                    {/* 로딩 텍스트 */}
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-white mb-2">AI가 당신의 연주를 조율 중입니다…</h2>
                        <p className="text-gray-400 text-sm">잠시만 기다려 주세요...</p>
                    </div>

                    {/* 분석 중 표시 */}
                    <div className="flex items-center gap-2 text-[#7BA7FF] text-sm">
                        <span className="animate-pulse">♪</span>
                        <span>리듬 분석 중</span>
                        <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>♪</span>
                        <span>음정 확인 중</span>
                        <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>♪</span>
                    </div>
                </div>
            </div>
        );
    }

    // feedback이 없는 경우 (직접 URL 접근 등)
    const displayFeedback = feedback || {
        score: 0,
        grade: 'Learning' as const,
        comment: '피드백을 불러올 수 없습니다',
        recordedSegments: []
    };
    const gradeColor = GRADE_COLORS[displayFeedback.grade];

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden">
            <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden px-8 py-8">
                <div className="flex flex-col gap-2 flex-shrink-0">
                    <div className="flex justify-between items-center text-white">
                        <div className="flex items-center gap-4">
                            <button onClick={handleBack} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ChevronLeft size={24} /></button>
                            <div>
                                <h1 className="text-2xl font-bold leading-none">{MOCK_SONG.title}</h1>
                                <span className="text-sm text-gray-400">{MOCK_SONG.artist}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {webAudio.isLoading && <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />로딩 중...</div>}
                            <div className="px-3 py-1 border border-gray-600 rounded-full text-xs font-medium text-gray-300">SINGLE FEEDBACK</div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 mt-4 relative min-h-0">
                    <div className="absolute -top-0 left-0 right-0 z-10 px-4 py-3 rounded-t-xl border border-b-0 border-gray-700 bg-[#0F172A]">
                        <div className="flex justify-between items-center text-white">
                            <div className="flex gap-6 text-sm font-mono text-gray-300">
                                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                                <span>{currentSection?.label} - {globalMeasure}/{totalMeasures} 마디</span>
                                {jamOnlyMode && <span className="text-[#7BA7FF]">JAM ONLY</span>}
                            </div>
                        </div>
                    </div>

                    <div className="h-full pt-12 rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 overflow-hidden">
                        <SingleScore
                            sections={mockSections}
                            currentSectionIndex={currentSectionIndex}
                            currentMeasure={currentMeasureInSection}
                            measureProgress={measureProgress}
                            selectedMeasures={selectedMeasures}
                            onSelectionChange={handleSelectionChange}
                            onMeasureClick={handleMeasureClick}
                            recordedMeasures={recordedMeasures}
                        />
                    </div>
                </div>

                {/* New Layout Sections */}
                <div className="mt-4 flex flex-col gap-4">
                    {/* 영역 2: 평가 - 새 카드 */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
                        <p className="text-sm text-gray-400">Total Score</p>
                        <div className="flex items-center justify-center gap-4 mt-2">
                           <p className="text-6xl font-bold" style={{ color: gradeColor }}>{displayFeedback.score}</p>
                           <div className="flex items-center">
                               <span className="text-xl font-semibold" style={{ color: gradeColor }}>{displayFeedback.grade}</span>
                               <span className="ml-2 text-xl">{GRADE_EMOJIS[displayFeedback.grade]}</span>
                           </div>
                        </div>
                        <p className="mt-4 text-gray-400">"{displayFeedback.comment}"</p>
                    </div>

                    {/* 영역 3: 버튼 - 별도 영역 */}
                    <div className="flex gap-4">
                        <button onClick={handleShare} className="flex-1 bg-[#FF7B7B] text-white px-8 py-3 rounded-lg hover:opacity-90 transition-opacity">공유하기 (Feed)</button>
                        <button onClick={handleReJam} className="flex-1 border border-gray-600 text-gray-300 px-8 py-3 rounded-lg hover:bg-gray-700 transition-colors">Re-JAM</button>
                    </div>

                    {/* 영역 4: 재생바 - 새 카드 */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                        <SinglePlayerBar
                            currentTime={currentTime}
                            duration={duration}
                            sections={playerBarSections}
                            onTimeChange={handleTimeChange}
                            recordedRanges={recordedRanges}
                        />
                        {/* Feed 스타일의 컨트롤러 영역 */}
                        <div className="flex items-center justify-between pt-4">
                            {/* Left spacer for balance */}
                            <div className="min-w-[120px]"></div>

                            {/* 중앙: 재생 컨트롤 */}
                            <div className="flex items-center gap-3">
                                {/* Previous Measure */}
                                <button
                                    type="button"
                                    onClick={() => handleSeekByMeasures(-1)}
                                    className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
                                      pressedKey === 'KeyZ' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''
                                    }`}
                                    title="이전 마디 (Z)"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    <span className="absolute -bottom-5 text-xs font-medium text-[#9B9B9B]">Z</span>
                                </button>

                                {/* Play/Pause */}
                                <button
                                    type="button"
                                    onClick={handlePlayPause}
                                    className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-all duration-200 ${
                                      pressedKey === 'Space' ? 'scale-95' : ''
                                    }`}
                                    style={{
                                      backgroundColor: '#7BA7FF', // BLUE_COLOR from FeedPlayerBar
                                      boxShadow: '0 4px 14px #7BA7FF40',
                                    }}
                                    title={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
                                >
                                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                                </button>

                                {/* Next Measure */}
                                <button
                                    type="button"
                                    onClick={() => handleSeekByMeasures(1)}
                                    className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
                                      pressedKey === 'KeyX' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''
                                    }`}
                                    title="다음 마디 (X)"
                                >
                                    <RotateCw className="h-4 w-4" />
                                    <span className="absolute -bottom-5 text-xs font-medium text-[#9B9B9B]">X</span>
                                </button>
                            </div>
                            
                            {/* JAM만 듣기 Toggle - 우측 정렬 */}
                            <button
                                type="button"
                                onClick={() => handleToggleJamOnly(!jamOnlyMode)}
                                className={`relative flex flex-col items-center px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-w-[120px]
                                    ${jamOnlyMode ? 'bg-[#7BA7FF]/20 border border-[#7BA7FF] text-[#7BA7FF]' : 'border border-gray-600 text-gray-300 hover:bg-white/10'}`}
                            >
                                JAM만 듣기
                                <span className="absolute -bottom-5 text-xs font-medium text-[#9B9B9B]">F</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}