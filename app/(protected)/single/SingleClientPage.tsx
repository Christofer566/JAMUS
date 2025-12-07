'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import SingleScore from '@/components/single/SingleScore';
import SinglePlayerBar from '@/components/single/SinglePlayerBar';
import SingleController from '@/components/single/SingleController';
import { useWebAudio } from '@/hooks/useWebAudio';
import { useMetronome } from '@/hooks/useMetronome';
import { useRecorder } from '@/hooks/useRecorder';
import { useToast } from '@/contexts/ToastContext';
import { uploadJamRecording } from '@/lib/jamStorage';

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

export default function SingleClientPage() {
    const router = useRouter();
    const { showToast } = useToast();
    const [selectedMeasures, setSelectedMeasures] = useState<{ start: number; end: number } | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isJamming, setIsJamming] = useState(false);
    const [jamOnlyMode, setJamOnlyMode] = useState(false);
    const [metronomeOn, setMetronomeOn] = useState(false);
    const [pressedKey, setPressedKey] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Recording state from useRecorder
    const recorder = useRecorder({
        onError: (error) => showToast('error', error),
        onStateChange: (state) => console.log('🎤 Recording state:', state)
    });

    const webAudio = useWebAudio({ chorusRepeat: 1 });
    const webAudioRef = useRef(webAudio);
    webAudioRef.current = webAudio;

    const metronome = useMetronome({ bpm: MOCK_SONG.bpm });

    const measureDuration = useMemo(() => calculateMeasureDuration(MOCK_SONG.bpm, MOCK_SONG.time_signature), []);
    const totalMeasures = useMemo(() => mockSections.reduce((acc, s) => acc + s.measures.length, 0), []);
    const duration = webAudio.isReady ? webAudio.duration : totalMeasures * measureDuration;

    const { introEndTime, jamSectionRange } = useMemo(() => {
        let accumulatedMeasures = 0;
        let jamStart = 0;
        let jamEnd = 0;
        let jamStartMeasure = 0;
        let jamEndMeasure = 0;

        for (const section of mockSections) {
            const sectionStart = accumulatedMeasures;
            accumulatedMeasures += section.measures.length;

            if (section.isJamSection) {
                jamStart = sectionStart * measureDuration;
                jamEnd = accumulatedMeasures * measureDuration;
                jamStartMeasure = sectionStart + 1; // 1-based
                jamEndMeasure = accumulatedMeasures;
            }
        }

        return {
            introEndTime: (mockSections[0].measures.length) * measureDuration,
            jamSectionRange: {
                startTime: jamStart,
                endTime: jamEnd,
                startMeasure: jamStartMeasure,
                endMeasure: jamEndMeasure
            }
        };
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

    // 현재 마디의 시작 시간을 계산 (마디 경계에 맞춤)
    const currentMeasureStartTime = useMemo(() => {
        return (globalMeasure - 1) * measureDuration;
    }, [globalMeasure, measureDuration]);

    const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

    // 녹음 중에는 마디 선택 차단
    const handleSelectionChange = useCallback((selection: { start: number; end: number } | null) => {
        if (isJamming) {
            showToast('warning', '녹음 중에는 이동할 수 없습니다');
            return;
        }
        setSelectedMeasures(selection);
    }, [isJamming, showToast]);

    useEffect(() => { webAudioRef.current.loadAudio(TEST_AUDIO_URLS); }, []);
    useEffect(() => { if (webAudio.isPlaying) setCurrentTime(webAudio.currentTime); }, [webAudio.currentTime, webAudio.isPlaying]);

    // 재생 중 녹음 구간 진입 시 녹음 재생 시작 + 볼륨 조절
    const prevHasRecordingRef = useRef(false);
    useEffect(() => {
        if (!webAudio.isPlaying || recorder.state !== 'recorded' || recorder.segments.length === 0) {
            prevHasRecordingRef.current = false;
            return;
        }

        const hasRecording = recorder.hasRecordingAt(currentTime);

        // 녹음 구간에 처음 진입했을 때만 재생 시작
        if (hasRecording && !prevHasRecordingRef.current) {
            console.log('🎵 Entered recording range, starting playback at', currentTime);
            webAudio.setVolume(0.3); // 원곡 볼륨 낮춤
            recorder.playRecordingsAtTime(currentTime);
        }
        // 녹음 구간을 벗어났을 때 정지
        else if (!hasRecording && prevHasRecordingRef.current) {
            console.log('🎵 Left recording range, pausing playback');
            webAudio.setVolume(1.0); // 원곡 볼륨 복구
            recorder.pauseRecordings();
        }

        prevHasRecordingRef.current = hasRecording;
    }, [currentTime, webAudio, recorder]);

    // Recording ranges derived from recorder segments (복수 녹음 지원)
    const recordedRanges = useMemo(() => {
        return recorder.segments.map(seg => ({
            start: seg.startTime,
            end: seg.endTime
        }));
    }, [recorder.segments]);

    // Check if current position is within JAM section
    const isInJamSection = useMemo(() => {
        return currentTime >= jamSectionRange.startTime && currentTime < jamSectionRange.endTime;
    }, [currentTime, jamSectionRange]);

    const handlePlayPause = useCallback(async () => {
        console.log('🎵 handlePlayPause called', {
            isPlaying: webAudio.isPlaying,
            recorderState: recorder.state,
            segmentCount: recorder.segments.length,
            currentTime
        });

        if (webAudio.isPlaying) {
            webAudio.pause();
            metronome.stop();
            recorder.pauseRecordings(); // 녹음 재생도 일시정지
            setIsPlaying(false);
        } else {
            await webAudio.play();
            if(metronomeOn) await metronome.start();
            // 녹음이 완료된 상태이고, 현재 시간이 녹음 구간 내라면 녹음도 재생
            if (recorder.state === 'recorded' && recorder.hasRecordingAt(currentTime)) {
                console.log('🎵 Starting recording playback at', currentTime);
                webAudio.setVolume(0.3);
                recorder.playRecordingsAtTime(currentTime);
            }
            setIsPlaying(true);
        }
    }, [webAudio, metronome, metronomeOn, recorder, currentTime]);

    const handleToggleJam = useCallback(async () => {
        console.log('🎤 handleToggleJam called', { isJamming, isInJamSection, currentTime, jamSectionRange });

        if (isJamming) {
            // STOP JAM: 녹음 종료 - 현재 마디 끝 시간으로 맞춤
            const currentMeasureEndTime = currentMeasureStartTime + measureDuration;
            console.log('🎤 Stopping recording at measure end:', {
                currentTime,
                currentMeasureEndTime,
                globalMeasure
            });

            setIsJamming(false);
            await recorder.stopRecording(currentMeasureEndTime, globalMeasure);
            webAudio.pause();
            webAudio.setVolume(1); // 볼륨 복구
            metronome.stop();
            setIsPlaying(false);

            showToast('success', '녹음이 완료되었습니다');
        } else {
            // START JAM: JAM 섹션인지 확인
            if (!isInJamSection) {
                console.log('🎤 Not in JAM section, showing toast');
                showToast('warning', 'JAM 섹션에서만 녹음할 수 있습니다');
                return;
            }

            // 현재 마디에 겹치는 기존 녹음이 있는지 확인
            const overlapping = recorder.getOverlappingSegment(globalMeasure, globalMeasure);
            if (overlapping) {
                const confirmed = window.confirm(
                    `마디 ${overlapping.startMeasure}-${overlapping.endMeasure}에 기존 녹음이 있습니다. 덮어쓰시겠습니까?`
                );
                if (!confirmed) return;
                // 새 녹음이 기존 겹치는 녹음을 자동으로 대체함
            }

            // 권한 요청
            const hasPermission = await recorder.requestPermission();
            if (!hasPermission) return;

            // 녹음 시작 - 마디 경계에 맞춤 (currentMeasureStartTime 사용)
            console.log('🎤 Starting recording at measure boundary:', {
                currentTime,
                currentMeasureStartTime,
                globalMeasure
            });
            const started = await recorder.startRecording(currentMeasureStartTime, globalMeasure);
            if (!started) return;

            setIsJamming(true);

            // 오디오도 마디 경계로 seek 후 재생 (볼륨 낮춤)
            webAudio.seek(currentMeasureStartTime);
            setCurrentTime(currentMeasureStartTime);
            webAudio.setVolume(0.3);
            await webAudio.play();
            if (metronomeOn) await metronome.start();
            setIsPlaying(true);
        }
    }, [isJamming, recorder, currentTime, currentMeasureStartTime, measureDuration, globalMeasure, jamSectionRange, isInJamSection, webAudio, metronome, metronomeOn, showToast]);

    const handleTimeChange = useCallback((newTime: number) => {
        // 녹음 중에는 seek 차단
        if (isJamming) {
            showToast('warning', '녹음 중에는 이동할 수 없습니다');
            return;
        }
        const clampedTime = Math.max(0, Math.min(newTime, duration));

        // 녹음 재생 중이면 일시정지 후 새 위치에서 재시작
        if (recorder.state === 'recorded') {
            recorder.pauseRecordings();

            // 만약 재생 중이고 새 위치가 녹음 구간 내라면, 녹음도 새 위치에서 재생
            if (webAudio.isPlaying && recorder.hasRecordingAt(clampedTime)) {
                webAudio.setVolume(0.3);
                // 약간의 딜레이 후 재생 시작 (seek 완료 대기)
                setTimeout(() => {
                    recorder.playRecordingsAtTime(clampedTime);
                }, 50);
            } else if (!recorder.hasRecordingAt(clampedTime)) {
                // 녹음 구간 밖으로 이동하면 볼륨 복구
                webAudio.setVolume(1.0);
            }
        }

        webAudio.seek(clampedTime);
        setCurrentTime(clampedTime);
    }, [duration, webAudio, isJamming, showToast, recorder]);

    const handleSeekByMeasures = useCallback((offset: number) => {
        // 녹음 중에는 seek 차단
        if (isJamming) {
            showToast('warning', '녹음 중에는 이동할 수 없습니다');
            return;
        }
        const newTime = webAudio.currentTime + (offset * measureDuration);
        handleTimeChange(newTime);
    }, [webAudio, measureDuration, handleTimeChange, isJamming, showToast]);

    // 마디 클릭 시 해당 마디 처음으로 이동
    const handleMeasureClick = useCallback((globalMeasureIndex: number) => {
        // 녹음 중에는 이동 차단
        if (isJamming) {
            showToast('warning', '녹음 중에는 이동할 수 없습니다');
            return;
        }
        // globalMeasureIndex는 0-based이므로 그대로 사용
        const targetTime = globalMeasureIndex * measureDuration;
        handleTimeChange(targetTime);
    }, [measureDuration, handleTimeChange, isJamming, showToast]);

    const handleToggleJamOnly = useCallback((enabled: boolean) => {
        setJamOnlyMode(enabled);
        if (enabled && webAudio.currentTime < introEndTime) {
            handleTimeChange(introEndTime);
        }
    }, [webAudio, introEndTime, handleTimeChange]);

    const handleToggleMetronome = useCallback((enabled: boolean) => {
        setMetronomeOn(enabled);
        metronome.setMuted(!enabled);
        if(enabled && isPlaying) metronome.start();
        else metronome.stop();
    }, [metronome, isPlaying]);

    const handleSave = useCallback(async () => {
        if (!recorder.audioBlob || !recorder.recordingRange) {
            showToast('warning', '저장할 녹음이 없습니다');
            return;
        }

        // 디버깅: 저장할 데이터 출력
        console.log('🎵 [handleSave] recordingRange:', recorder.recordingRange);
        console.log('🎵 [handleSave] segments:', recorder.segments);

        setIsSaving(true);
        try {
            const saveParams = {
                songId: MOCK_SONG.id,
                audioBlob: recorder.audioBlob,
                startMeasure: recorder.recordingRange.startMeasure,
                endMeasure: recorder.recordingRange.endMeasure,
                startTime: recorder.recordingRange.startTime,
                endTime: recorder.recordingRange.endTime
            };
            console.log('🎵 [handleSave] uploadJamRecording params:', {
                ...saveParams,
                audioBlob: `Blob(${saveParams.audioBlob.size} bytes)`
            });

            const result = await uploadJamRecording(saveParams);

            if (result.success) {
                showToast('success', 'JAM이 저장되었습니다!');
                recorder.resetRecording();
            } else {
                showToast('error', result.error || '저장에 실패했습니다');
            }
        } catch (error) {
            console.error('Save error:', error);
            showToast('error', '저장 중 오류가 발생했습니다');
        } finally {
            setIsSaving(false);
        }
    }, [recorder, showToast]);

    // 녹음 일시정지/재개 핸들러
    const handlePauseResumeJamming = useCallback(() => {
        if (recorder.isPaused) {
            // 재개
            recorder.resumeJamming();
            webAudio.play();
            if (metronomeOn) metronome.start();
            setIsPlaying(true);
        } else {
            // 일시정지
            recorder.pauseJamming();
            webAudio.pause();
            metronome.stop();
            setIsPlaying(false);
        }
    }, [recorder, webAudio, metronome, metronomeOn]);

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            setPressedKey(e.code);
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    // 녹음 중이면 일시정지/재개
                    if (isJamming) {
                        handlePauseResumeJamming();
                    } else {
                        await handlePlayPause();
                    }
                    break;
                case 'KeyZ': e.preventDefault(); handleSeekByMeasures(-1); break;
                case 'KeyX': e.preventDefault(); handleSeekByMeasures(1); break;
                case 'KeyS': e.preventDefault(); handleToggleJamOnly(!jamOnlyMode); break;
                case 'KeyM': e.preventDefault(); handleToggleMetronome(!metronomeOn); break;
            }
        };
        const handleKeyUp = () => setPressedKey(null);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handlePlayPause, handlePauseResumeJamming, handleSeekByMeasures, handleToggleJamOnly, handleToggleMetronome, jamOnlyMode, metronomeOn, isJamming]);

    useEffect(() => () => { webAudioRef.current.stop(); }, []);

    // 페이지 이탈 경고 (녹음 중 또는 저장되지 않은 녹음이 있을 때)
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isJamming || recorder.audioBlob) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isJamming, recorder.audioBlob]);

    // 뒤로가기 버튼 핸들러 (확인 후 이동)
    const handleBack = useCallback(() => {
        if (isJamming || recorder.audioBlob) {
            const confirmed = window.confirm(
                isJamming
                    ? '녹음 중입니다. 정말 나가시겠습니까?'
                    : '저장되지 않은 녹음이 있습니다. 정말 나가시겠습니까?'
            );
            if (!confirmed) return;
        }
        router.back();
    }, [isJamming, recorder.audioBlob, router]);

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
                            <div className="px-3 py-1 border border-gray-600 rounded-full text-xs font-medium text-gray-300">SINGLE MODE</div>
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
                                {metronomeOn && <span className="text-[#FFD166]">♪ {MOCK_SONG.bpm} BPM</span>}
                            </div>
                            {/* Recording/Processing Status */}
                            <div className="flex items-center gap-3">
                                {recorder.isProcessing && (
                                    <div className="text-sm flex items-center gap-2 text-yellow-400">
                                        <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                                        처리 중...
                                    </div>
                                )}
                                {isJamming && (
                                    <div className={`text-sm font-bold flex items-center gap-2 text-[#FF7B7B] ${recorder.isPaused ? '' : 'animate-pulse'}`}>
                                        <div className="w-2 h-2 rounded-full bg-[#FF7B7B]" />
                                        {recorder.isPaused ? 'PAUSED' : 'JAMMING'}
                                    </div>
                                )}
                                {recorder.state === 'recorded' && !isJamming && (
                                    <div className="text-sm flex items-center gap-2 text-green-400">
                                        <div className="w-2 h-2 rounded-full bg-green-400" />
                                        녹음 완료
                                    </div>
                                )}
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
                            recordedMeasures={recorder.recordedMeasures}
                        />
                    </div>
                </div>

                <div className="mt-6 flex-shrink-0 rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 p-4 space-y-4">
                    <SinglePlayerBar
                        currentTime={currentTime}
                        duration={duration}
                        sections={playerBarSections}
                        onTimeChange={handleTimeChange}
                        recordedRanges={recordedRanges}
                    />
                    <SingleController
                        isPlaying={isPlaying}
                        onPlayPause={handlePlayPause}
                        onToggleJam={handleToggleJam}
                        isJamming={isJamming}
                        onSeekBackward={() => handleSeekByMeasures(-1)}
                        onSeekForward={() => handleSeekByMeasures(1)}
                        jamOnlyMode={jamOnlyMode}
                        onToggleJamOnly={handleToggleJamOnly}
                        metronomeOn={metronomeOn}
                        onToggleMetronome={handleToggleMetronome}
                        onSave={handleSave}
                        currentTime={currentTime}
                        duration={duration}
                        pressedKey={pressedKey}
                        isSaving={isSaving}
                        hasRecording={recorder.state === 'recorded'}
                    />
                </div>
            </div>
        </div>
    );
}