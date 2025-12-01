'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import SingleScore from '@/components/single/SingleScore';
import SinglePlayerBar from '@/components/single/SinglePlayerBar';
import SingleController from '@/components/single/SingleController';
import { useWebAudio } from '@/hooks/useWebAudio';
import { useMetronome } from '@/hooks/useMetronome';

// 🧪 임시 테스트용 audio_urls (Feed와 동일)
const TEST_AUDIO_URLS = {
    intro: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/intro.mp3",
    chorus: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/chorus.mp3",
    outro: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/outro.mp3"
};

// Autumn Leaves 섹션 데이터 (Gm key - 재즈 스탠다드)
// Single 구조: Intro 8마디 + Chorus 32마디 + Outro 8마디 = 48마디
const mockSections = [
    {
        id: 'intro',
        label: 'Intro',
        isJamSection: false,
        measures: [
            // Intro: 8마디 (2-5-1 진행 반복)
            { chord: 'Cm7' }, { chord: 'F7' }, { chord: 'Bbmaj7' }, { chord: 'Ebmaj7' },
            { chord: 'Am7b5' }, { chord: 'D7' }, { chord: 'Gm' }, { chord: 'Gm' },
        ]
    },
    {
        id: 'chorus',
        label: 'Chorus',
        isJamSection: true,
        measures: [
            // A Section (8마디) - ii-V-I in Bb, then ii-V-i in Gm
            { chord: 'Cm7' }, { chord: 'F7' }, { chord: 'Bbmaj7' }, { chord: 'Ebmaj7' },
            { chord: 'Am7b5' }, { chord: 'D7' }, { chord: 'Gm' }, { chord: 'Gm' },
            // A' Section (8마디) - 같은 진행 반복
            { chord: 'Cm7' }, { chord: 'F7' }, { chord: 'Bbmaj7' }, { chord: 'Ebmaj7' },
            { chord: 'Am7b5' }, { chord: 'D7' }, { chord: 'Gm' }, { chord: 'Gm' },
            // B Section (8마디) - 변형
            { chord: 'Am7b5' }, { chord: 'D7' }, { chord: 'Gm' }, { chord: 'Gm' },
            { chord: 'Cm7' }, { chord: 'F7' }, { chord: 'Bbmaj7' }, { chord: 'Ebmaj7' },
            // C Section (8마디) - 마무리
            { chord: 'Am7b5' }, { chord: 'D7' }, { chord: 'Gm' }, { chord: 'C7' },
            { chord: 'Am7b5' }, { chord: 'D7' }, { chord: 'Gm' }, { chord: 'Gm' },
        ]
    },
    {
        id: 'outro',
        label: 'Outro',
        isJamSection: false,
        measures: [
            // Outro: 8마디 (ending)
            { chord: 'Cm7' }, { chord: 'F7' }, { chord: 'Bbmaj7' }, { chord: 'Ebmaj7' },
            { chord: 'Am7b5' }, { chord: 'D7' }, { chord: 'Gm' }, { chord: 'Gm' },
        ]
    }
];

// Autumn Leaves 곡 데이터 (Supabase 기준)
const MOCK_SONG = {
    bpm: 142,  // Autumn Leaves BPM
    time_signature: '4/4',
    title: "Autumn Leaves",
    artist: "Jazz Standard"
};

// 마디 길이 계산 함수
const calculateMeasureDuration = (bpm: number, timeSignature: string): number => {
    const [beatsPerMeasure] = timeSignature.split('/').map(Number);
    return (60 / bpm) * beatsPerMeasure;
};

export default function SingleClientPage() {
    const router = useRouter();
    const [selectedMeasures, setSelectedMeasures] = useState<{ start: number; end: number } | null>(null);

    // UI 상태
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isJamming, setIsJamming] = useState(false);
    const [jamOnlyMode, setJamOnlyMode] = useState(false);
    const [metronomeOn, setMetronomeOn] = useState(false);
    const [pressedKey, setPressedKey] = useState<string | null>(null);

    // ✅ useWebAudio 훅 (Single은 chorus 1회만)
    const webAudio = useWebAudio({ chorusRepeat: 1 });
    const webAudioRef = useRef(webAudio);
    webAudioRef.current = webAudio;

    // ✅ useMetronome 훅
    const metronome = useMetronome({ bpm: MOCK_SONG.bpm });

    // 마디 길이 계산
    const measureDuration = useMemo(() =>
        calculateMeasureDuration(MOCK_SONG.bpm, MOCK_SONG.time_signature),
        []
    );

    // 전체 마디 수 및 duration
    const totalMeasures = useMemo(() =>
        mockSections.reduce((acc, s) => acc + s.measures.length, 0),
        []
    );

    // webAudio duration 사용 (로드 후 실제 값)
    const duration = webAudio.isReady ? webAudio.duration : totalMeasures * measureDuration;

    // JAM 섹션 범위 계산 (JAM만 듣기용)
    // 구조: Intro(8) + Chorus(32) + Outro(8) = 48마디
    const { introEndTime, outroStartTime } = useMemo(() => {
        const introMeasures = mockSections[0].measures.length; // 8
        // Chorus 전체 마디 수 (32마디)
        const totalChorusMeasures = mockSections
            .filter(s => s.isJamSection)
            .reduce((acc, s) => acc + s.measures.length, 0);

        return {
            introEndTime: introMeasures * measureDuration,
            outroStartTime: (introMeasures + totalChorusMeasures) * measureDuration
        };
    }, [measureDuration]);

    // 섹션별 시간 계산 (PlayerBar용)
    const playerBarSections = useMemo(() => {
        let accumulatedMeasures = 0;
        return mockSections.map(section => {
            const startTime = accumulatedMeasures * measureDuration;
            accumulatedMeasures += section.measures.length;
            const endTime = accumulatedMeasures * measureDuration;
            return {
                id: section.id,
                label: section.label,
                startTime,
                endTime,
                isJamSection: section.isJamSection,
            };
        });
    }, [measureDuration]);

    // 현재 섹션 인덱스 계산
    const currentSectionIndex = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < mockSections.length; i++) {
            const sectionDuration = mockSections[i].measures.length * measureDuration;
            if (currentTime < accumulatedTime + sectionDuration) {
                return i;
            }
            accumulatedTime += sectionDuration;
        }
        return mockSections.length - 1;
    }, [currentTime, measureDuration]);

    // 현재 섹션 내 마디 계산
    const currentMeasureInSection = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            accumulatedTime += mockSections[i].measures.length * measureDuration;
        }
        const timeInSection = currentTime - accumulatedTime;
        return Math.floor(timeInSection / measureDuration);
    }, [currentTime, currentSectionIndex, measureDuration]);

    // 마디 내 진행률
    const measureProgress = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            accumulatedTime += mockSections[i].measures.length * measureDuration;
        }
        const timeInSection = currentTime - accumulatedTime;
        const measureTime = timeInSection % measureDuration;
        return measureTime / measureDuration;
    }, [currentTime, currentSectionIndex, measureDuration]);

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

    // ========================================
    // ✅ Step 3-1: 오디오 로드 (컴포넌트 마운트 시)
    // ========================================
    useEffect(() => {
        console.log('🎵 [Single] 오디오 로드 시작');
        webAudioRef.current.loadAudio(TEST_AUDIO_URLS);
    }, []);

    // ========================================
    // ✅ Step 3-2: webAudio currentTime → UI 동기화
    // ========================================
    useEffect(() => {
        if (webAudio.isPlaying) {
            setCurrentTime(webAudio.currentTime);
        }
    }, [webAudio.currentTime, webAudio.isPlaying]);

    // ========================================
    // ✅ Step 3-3: 재생/정지 토글
    // ========================================
    const handlePlayPause = useCallback(async () => {
        console.log('🎵 [Single] handlePlayPause', {
            isPlaying: webAudio.isPlaying,
            metronomeOn
        });

        if (webAudio.isPlaying) {
            // 정지
            webAudio.pause();
            metronome.stop(); // 메트로놈도 항상 정지
            setIsPlaying(false);
        } else {
            // 재생
            await webAudio.play();
            await metronome.start(); // 메트로놈도 항상 시작 (음소거 상태는 유지)
            setIsPlaying(true);
        }
    }, [webAudio, metronome, metronomeOn]);

    // ========================================
    // ✅ Step 3-4: 시간 변경 (seek)
    // ========================================
    const handleTimeChange = useCallback((newTime: number) => {
        const clampedTime = Math.max(0, Math.min(newTime, duration));
        webAudio.seek(clampedTime);
        setCurrentTime(clampedTime);
    }, [duration, webAudio]);

    // ========================================
    // ✅ Step 3-5: 마디 단위 이동
    // ========================================
    const handleSeekByMeasures = useCallback((offset: number) => {
        const newTime = webAudio.currentTime + (offset * measureDuration);
        const clampedTime = Math.max(0, Math.min(newTime, duration));

        console.log('🎵 [Single] seekByMeasure', {
            offset,
            measureDuration: measureDuration.toFixed(2) + 's',
            currentTime: webAudio.currentTime.toFixed(2) + 's',
            newTime: clampedTime.toFixed(2) + 's',
        });

        webAudio.seek(clampedTime);
        setCurrentTime(clampedTime);
    }, [webAudio, measureDuration, duration]);

    // ========================================
    // ✅ Step 3-6: JAM만 듣기 모드 감시
    // ========================================
    useEffect(() => {
        if (!jamOnlyMode || !webAudio.isPlaying) return;

        const currentPos = webAudio.currentTime;

        // Intro 구간에 있으면 Chorus 시작으로 이동
        if (currentPos < introEndTime) {
            console.log('🎵 [JAM Only] Intro 감지 → Chorus로 이동');
            webAudio.seek(introEndTime);
            return;
        }

        // Outro 진입 시 Chorus로 돌아가기 (루프)
        if (currentPos >= outroStartTime) {
            console.log('🎵 [JAM Only] Outro 감지 → Chorus로 루프');
            webAudio.seek(introEndTime);
            return;
        }
    }, [jamOnlyMode, webAudio.isPlaying, webAudio.currentTime, introEndTime, outroStartTime, webAudio]);

    // ========================================
    // ✅ Step 3-7: JAM만 듣기 토글 핸들러
    // ========================================
    const handleToggleJamOnly = useCallback((enabled: boolean) => {
        setJamOnlyMode(enabled);

        // JAM-only 활성화 시 Intro에 있으면 Chorus로 이동
        if (enabled && webAudio.currentTime < introEndTime) {
            console.log('🎵 [JAM Only] 활성화 → Intro에서 Chorus로 이동');
            webAudio.seek(introEndTime);
            setCurrentTime(introEndTime);
        }
    }, [webAudio, introEndTime]);

    // ========================================
    // ✅ Step 3-8: 메트로놈 토글 핸들러 (음소거만 제어)
    // ========================================
    const handleToggleMetronome = useCallback((enabled: boolean) => {
        setMetronomeOn(enabled);
        metronome.setMuted(!enabled); // enabled=true면 muted=false (소리 켜짐)
    }, [metronome]);

    // JAM 토글 (기존 유지)
    const handleToggleJam = useCallback(() => {
        setIsJamming(prev => !prev);
    }, []);

    // 저장 (기존 유지)
    const handleSave = useCallback(() => {
        console.log('Save clicked');
        // TODO: 실제 저장 로직
    }, []);

    // ========================================
    // ✅ Step 3-9: 키보드 단축키 (실제 오디오 제어)
    // ========================================
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    setPressedKey('space');
                    await handlePlayPause();
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
                    setPressedKey('s');
                    handleToggleJamOnly(!jamOnlyMode);
                    break;
                case 'KeyM':
                    e.preventDefault();
                    setPressedKey('m');
                    handleToggleMetronome(!metronomeOn);
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
    }, [handlePlayPause, handleSeekByMeasures, handleToggleJamOnly, handleToggleMetronome, jamOnlyMode, metronomeOn]);

    // ========================================
    // ✅ 컴포넌트 언마운트 시 정리
    // ========================================
    useEffect(() => {
        const webAudioInstance = webAudioRef.current;
        return () => {
            webAudioInstance.stop();
        };
    }, []);

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden">
            <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden px-8 py-8">
                {/* Header Area */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                    <div className="flex justify-between items-center text-white">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.back()}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <div className="flex flex-col">
                                <h1 className="text-2xl font-bold leading-none">{MOCK_SONG.title}</h1>
                                <span className="text-sm text-gray-400">{MOCK_SONG.artist}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* 로딩 상태 표시 */}
                            {webAudio.isLoading && (
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                    로딩 중...
                                </div>
                            )}
                            <div className="px-3 py-1 border border-gray-600 rounded-full text-xs font-medium text-gray-300">
                                SINGLE MODE
                            </div>
                        </div>
                    </div>
                </div>

                {/* 악보 영역 + 플래그 영역 컨테이너 */}
                <div className="flex-1 mt-4 relative min-h-0">
                    {/* 상단 플래그 */}
                    <div className="absolute -top-0 left-0 right-0 z-10 px-4 py-3 rounded-t-xl border border-b-0 border-gray-700 bg-[#0F172A]">
                        <div className="flex justify-between items-center text-white">
                            <div className="flex gap-6 text-sm font-mono text-gray-300">
                                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                                <span>{currentSection?.label} - {globalMeasure}/{totalMeasures} 마디</span>
                                {jamOnlyMode && (
                                    <span className="text-[#7BA7FF]">JAM ONLY</span>
                                )}
                                {metronomeOn && (
                                    <span className="text-[#FFD166]">♪ {MOCK_SONG.bpm} BPM</span>
                                )}
                            </div>
                            <div className={`text-sm font-bold flex items-center gap-2 ${isJamSection ? 'text-[#FF7B7B]' : 'text-gray-500'}`}>
                                {isJamSection && <div className="w-2 h-2 rounded-full bg-[#FF7B7B] animate-pulse" />}
                                JAM SECTION
                            </div>
                        </div>
                    </div>

                    {/* 악보 영역 */}
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

                {/* 하단: PlayerBar + Controller */}
                <div className="mt-6 flex-shrink-0 rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 p-4 space-y-4">
                    <SinglePlayerBar
                        currentTime={currentTime}
                        duration={duration}
                        sections={playerBarSections}
                        onTimeChange={handleTimeChange}
                    />

                    <SingleController
                        isPlaying={isPlaying}
                        onPlayPause={handlePlayPause}
                        onSeekBackward={() => handleSeekByMeasures(-1)}
                        onSeekForward={() => handleSeekByMeasures(1)}
                        isJamming={isJamming}
                        onToggleJam={handleToggleJam}
                        jamOnlyMode={jamOnlyMode}
                        onToggleJamOnly={handleToggleJamOnly}
                        metronomeOn={metronomeOn}
                        onToggleMetronome={handleToggleMetronome}
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
