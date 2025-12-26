'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import SingleScore from '@/components/single/SingleScore';
import SinglePlayerBar from '@/components/single/SinglePlayerBar';
import SingleController from '@/components/single/SingleController';
import RecordingCompleteModal from '@/components/single/RecordingCompleteModal';
import { useWebAudio } from '@/hooks/useWebAudio';
import { useMetronome } from '@/hooks/useMetronome';
import { useRecorder } from '@/hooks/useRecorder';
import { useToast } from '@/contexts/ToastContext';
import { uploadJamRecording } from '@/lib/jamStorage';
import { getSharedAudioContext, resumeAudioContext } from '@/hooks/useAudioContext';
import { useRecordingStore } from '@/stores/recordingStore';
import { DEFAULT_SONG } from '@/data/songs';
import { InputInstrument, OutputInstrument, DEFAULT_INPUT_INSTRUMENT, DEFAULT_OUTPUT_INSTRUMENT } from '@/types/instrument';

// 곡 데이터에서 가져오기
const CURRENT_SONG = DEFAULT_SONG;
const TEST_AUDIO_URLS = CURRENT_SONG.audioUrls;
const songSections = CURRENT_SONG.sections;
const SONG_META = CURRENT_SONG.meta;

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
    const [inputInstrument, setInputInstrument] = useState<InputInstrument>(DEFAULT_INPUT_INSTRUMENT);
    const [outputInstrument, setOutputInstrument] = useState<OutputInstrument>(DEFAULT_OUTPUT_INSTRUMENT);

    // START JAM 관련 상태
    const [isCountingDown, setIsCountingDown] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const originalPositionRef = useRef<number>(0); // R키 누르기 전 위치 저장
    const countdownAnimationRef = useRef<number | null>(null);

    // 곡 종료 시 모달 상태
    const [showCompleteModal, setShowCompleteModal] = useState(false);

    // Recording state from useRecorder
    const recorder = useRecorder({
        onError: (error) => showToast('error', error),
        onStateChange: () => {} // 디버그 로그 제거
    });

    const webAudio = useWebAudio({ chorusRepeat: 1 });
    const webAudioRef = useRef(webAudio);
    webAudioRef.current = webAudio;

    const metronome = useMetronome({ bpm: SONG_META.bpm });

    const measureDuration = useMemo(() => calculateMeasureDuration(SONG_META.bpm, SONG_META.time_signature), []);
    const totalMeasures = useMemo(() => songSections.reduce((acc, s) => acc + s.measures.length, 0), []);
    const duration = webAudio.isReady ? webAudio.duration : totalMeasures * measureDuration;

    const { introEndTime, jamSectionRange } = useMemo(() => {
        let accumulatedMeasures = 0;
        let jamStart = 0;
        let jamEnd = 0;
        let jamStartMeasure = 0;
        let jamEndMeasure = 0;

        for (const section of songSections) {
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
            introEndTime: (songSections[0].measures.length) * measureDuration,
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
        return songSections.map(section => {
            const startTime = accumulatedMeasures * measureDuration;
            accumulatedMeasures += section.measures.length;
            const endTime = accumulatedMeasures * measureDuration;
            return { id: section.id, label: section.label, startTime, endTime, isJamSection: section.isJamSection };
        });
    }, [measureDuration]);

    const currentSectionIndex = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < songSections.length; i++) {
            if (currentTime < accumulatedTime + (songSections[i].measures.length * measureDuration)) return i;
            accumulatedTime += songSections[i].measures.length * measureDuration;
        }
        return songSections.length - 1;
    }, [currentTime, measureDuration]);

    const currentMeasureInSection = useMemo(() => {
        let accumulatedTime = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            accumulatedTime += songSections[i].measures.length * measureDuration;
        }
        return Math.floor((currentTime - accumulatedTime) / measureDuration);
    }, [currentTime, currentSectionIndex, measureDuration]);

    const measureProgress = useMemo(() => {
        const timeInSection = currentTime - playerBarSections[currentSectionIndex].startTime;
        return (timeInSection % measureDuration) / measureDuration;
    }, [currentTime, currentSectionIndex, playerBarSections, measureDuration]);
    
    const currentSection = songSections[currentSectionIndex];
    const globalMeasure = useMemo(() => {
        let total = 0;
        for (let i = 0; i < currentSectionIndex; i++) {
            total += songSections[i].measures.length;
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

    // 컴포넌트 마운트 시 이전 녹음 데이터 초기화 (Feedback 페이지에서 돌아올 때)
    useEffect(() => {
        // 이전 녹음이 있으면 초기화
        if (recorder.segments.length > 0 || recorder.state !== 'idle') {
            console.log('🎤 [Single Mount] 이전 녹음 데이터 초기화');
            recorder.resetRecording();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // 마운트 시 1회만 실행

    // webAudio.currentTime이 변경될 때마다 항상 반영 (재생 중이든 아니든)
    useEffect(() => { setCurrentTime(webAudio.currentTime); }, [webAudio.currentTime]);

    // 곡 종료 감지: 녹음이 있으면 모달 표시
    // JAM Only 모드: Chorus 끝에서 종료
    // 일반 모드: Outro 끝에서 종료
    const prevCurrentTimeRef = useRef(0);
    useEffect(() => {
        if (!webAudio.isPlaying || isJamming || isCountingDown) {
            prevCurrentTimeRef.current = currentTime;
            return;
        }

        const hasRecording = recorder.state === 'recorded' && recorder.segments.length > 0;
        if (!hasRecording) {
            prevCurrentTimeRef.current = currentTime;
            return;
        }

        // JAM Only 모드: Chorus 끝에 도달
        if (jamOnlyMode) {
            const chorusEndTime = jamSectionRange.endTime;
            const reachedChorusEnd = prevCurrentTimeRef.current < chorusEndTime && currentTime >= chorusEndTime - 0.1;

            if (reachedChorusEnd) {
                console.log('🎵 [JAM Only 종료] Chorus 끝 도달 - 모달 표시');
                webAudio.pause();
                metronome.stop();
                setIsPlaying(false);
                setShowCompleteModal(true);
            }
        } else {
            // 일반 모드: 곡 끝에 도달
            const reachedEnd = webAudio.duration > 0 &&
                              prevCurrentTimeRef.current < webAudio.duration - 0.5 &&
                              currentTime >= webAudio.duration - 0.5;

            if (reachedEnd) {
                console.log('🎵 [곡 종료] Outro 끝 도달 - 모달 표시');
                webAudio.pause();
                metronome.stop();
                setIsPlaying(false);
                setShowCompleteModal(true);
            }
        }

        prevCurrentTimeRef.current = currentTime;
    }, [webAudio, currentTime, recorder.state, recorder.segments.length, isJamming, isCountingDown, metronome, jamOnlyMode, jamSectionRange.endTime]);

    // 재생 중 녹음 구간 진입/전환 시 녹음 재생 시작 + 볼륨 조절
    const prevSegmentIdRef = useRef<string | null>(null);
    useEffect(() => {
        // isPlaying이 false면 녹음 재생 정지 (pause 호출 직후 반영)
        if (!isPlaying) {
            if (prevSegmentIdRef.current) {
                recorder.pauseRecordings();
            }
            prevSegmentIdRef.current = null;
            return;
        }

        if (!webAudio.isPlaying || recorder.state !== 'recorded' || recorder.segments.length === 0) {
            prevSegmentIdRef.current = null;
            return;
        }

        // 현재 시간에 해당하는 세그먼트 찾기
        const currentSegment = recorder.segments.find(
            seg => currentTime >= seg.startTime && currentTime <= seg.endTime
        );
        const currentSegmentId = currentSegment?.id || null;

        // 세그먼트 진입 또는 전환 감지
        if (currentSegmentId && currentSegmentId !== prevSegmentIdRef.current) {
            console.log('🎵 Segment change:', prevSegmentIdRef.current, '→', currentSegmentId, 'at', currentTime);
            // 이전 세그먼트 재생 중지 후 새 세그먼트 재생
            recorder.pauseRecordings();
            webAudio.setVolume(0.3); // 원곡 볼륨 낮춤
            recorder.playRecordingsAtTime(currentTime);
        }
        // 모든 녹음 구간을 벗어났을 때 정지
        else if (!currentSegmentId && prevSegmentIdRef.current) {
            console.log('🎵 Left all recording ranges, pausing playback');
            webAudio.setVolume(1.0); // 원곡 볼륨 복구
            recorder.pauseRecordings();
        }

        prevSegmentIdRef.current = currentSegmentId;
    }, [currentTime, webAudio, recorder, isPlaying]);

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
            webAudioIsPlaying: webAudio.isPlaying,
            localIsPlaying: isPlaying,
            recorderState: recorder.state,
            segmentCount: recorder.segments.length,
            currentTime
        });

        // webAudio.isPlaying 또는 로컬 isPlaying 중 하나라도 true면 정지
        if (webAudio.isPlaying || isPlaying) {
            console.log('🎵 [handlePlayPause] 정지 처리 시작');
            webAudio.pause();
            metronome.stop();
            recorder.pauseRecordings(); // 녹음 재생도 일시정지
            setIsPlaying(false);
            console.log('🎵 [handlePlayPause] 정지 처리 완료');
        } else {
            await webAudio.play();
            // 메트로놈: 항상 시작하되 현재 위치로 동기화, 음소거 상태 유지
            metronome.seekTo(currentTime);
            await metronome.start();
            // 녹음이 완료된 상태이고, 현재 시간이 녹음 구간 내라면 녹음도 재생
            const currentSegment = recorder.segments.find(
                seg => currentTime >= seg.startTime && currentTime <= seg.endTime
            );
            if (recorder.state === 'recorded' && currentSegment) {
                console.log('🎵 Starting recording playback at', currentTime, 'segment:', currentSegment.id);
                webAudio.setVolume(0.3);
                await recorder.playRecordingsAtTime(currentTime);
                prevSegmentIdRef.current = currentSegment.id; // 현재 세그먼트 ID 저장
            }
            setIsPlaying(true);
        }
    }, [webAudio, metronome, recorder, currentTime, isPlaying]);

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
                    `마디 ${globalMeasure}부터 녹음합니다. 기존 녹음(${overlapping.startMeasure}-${overlapping.endMeasure})은 마디 ${globalMeasure}부터 덮어씁니다.`
                );
                if (!confirmed) return;
                // 새 녹음이 기존 겹치는 부분만 덮어쓰고, 이전 마디는 유지됨
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
            // 메트로놈: 항상 시작하되 현재 위치로 동기화
            metronome.seekTo(currentMeasureStartTime);
            await metronome.start();
            setIsPlaying(true);
        }
    }, [isJamming, recorder, currentTime, currentMeasureStartTime, measureDuration, globalMeasure, jamSectionRange, isInJamSection, webAudio, metronome, showToast]);

    const handleTimeChange = useCallback((newTime: number) => {
        // 녹음 중에는 seek 차단
        if (isJamming) {
            showToast('warning', '녹음 중에는 이동할 수 없습니다');
            return;
        }

        let clampedTime = Math.max(0, Math.min(newTime, duration));

        // JAM Only 모드: Chorus 범위로 제한
        if (jamOnlyMode) {
            if (clampedTime < jamSectionRange.startTime || clampedTime >= jamSectionRange.endTime) {
                showToast('info', 'JAM만 듣기를 선택했습니다');
                // 범위 밖 클릭 시 현재 위치 유지 (이동하지 않음)
                return;
            }
        }

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
        metronome.seekTo(clampedTime); // 메트로놈도 동기화
        setCurrentTime(clampedTime);
    }, [duration, webAudio, isJamming, showToast, recorder, metronome, jamOnlyMode, jamSectionRange]);

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
        // 음소거만 토글 (메트로놈은 재생 중일 때 이미 실행 중)
        metronome.setMuted(!enabled);
        // 재생 중이 아닐 때 메트로놈 켜면 현재 위치로 동기화
        if (enabled && !metronome.isRunning) {
            metronome.seekTo(currentTime);
        }
    }, [metronome, currentTime]);

    // Zustand store에서 setRecording 가져오기
    const setRecording = useRecordingStore((state) => state.setRecording);

    // 종료(Feedback) 버튼 - store에 녹음 저장 후 Feedback 페이지로 이동
    const handleFinish = useCallback(() => {
        if (recorder.state !== 'recorded' || recorder.segments.length === 0) {
            showToast('warning', '녹음이 없습니다');
            return;
        }

        // 녹음 데이터를 store에 저장 (마커 기반 - preroll 없음)
        const firstSegment = recorder.segments[0];
        if (firstSegment && recorder.recordingRange) {
            // 저장 직전 확인 로그
            console.log('💾 저장 직전:', {
                blobSize: firstSegment.blob.size,
                blobType: firstSegment.blob.type,
                range: `${recorder.recordingRange.startMeasure}-${recorder.recordingRange.endMeasure}`,
                note: '마커 기반 추출 완료 - blobType=audio/wav'
            });
            setRecording(firstSegment.blob, recorder.recordingRange, 0, inputInstrument, outputInstrument);
        }

        // Feedback 페이지로 이동
        router.push('/single/feedback');
    }, [recorder, showToast, router, setRecording, inputInstrument, outputInstrument]);

    // ==========================================
    // START JAM (R키) 플로우 - AudioContext 기반 카운트다운
    // ==========================================

    /**
     * 2마디 전 마디 번호 계산 (무조건 2마디 전, 최소 1번 마디)
     */
    const calculateTwoMeasuresBackMeasure = useCallback((measure: number): number => {
        return Math.max(1, measure - 2);
    }, []);

    /**
     * START JAM 시작 (R키 누를 때)
     * 1. 현재 위치 저장
     * 2. 2마디 전으로 이동
     * 3. AudioContext 기반 3,2,1 카운트다운
     * 4. 녹음 시작
     */
    const handleStartJam = useCallback(async () => {
        // 현재 시간을 기반으로 마디 번호 직접 계산 (state 지연 문제 방지)
        const currentMeasureNum = Math.floor(currentTime / measureDuration) + 1;

        console.log('🎤 [handleStartJam] 시작', { currentMeasureNum, currentTime, globalMeasure, jamSectionRange });

        // JAM 섹션인지 확인 (현재 마디 기준, 2마디 전으로 이동해도 괜찮음)
        const isCurrentMeasureInJam = currentMeasureNum >= jamSectionRange.startMeasure &&
                                       currentMeasureNum <= jamSectionRange.endMeasure;
        console.log('🎤 [handleStartJam] JAM 체크:', { isCurrentMeasureInJam, currentMeasureNum, startMeasure: jamSectionRange.startMeasure, endMeasure: jamSectionRange.endMeasure });

        if (!isCurrentMeasureInJam) {
            showToast('warning', 'JAM 섹션에서만 녹음할 수 있습니다');
            return;
        }

        // 권한 요청
        const hasPermission = await recorder.requestPermission();
        console.log('🎤 [handleStartJam] 권한:', hasPermission);
        if (!hasPermission) return;

        // 현재 마디에 겹치는 기존 녹음이 있는지 확인
        const overlapping = recorder.getOverlappingSegment(currentMeasureNum, currentMeasureNum);
        if (overlapping) {
            const confirmed = window.confirm(
                `마디 ${currentMeasureNum}부터 녹음합니다. 기존 녹음(${overlapping.startMeasure}-${overlapping.endMeasure})은 마디 ${currentMeasureNum}부터 덮어씁니다.`
            );
            if (!confirmed) return;
        }

        // AudioContext 초기화
        await resumeAudioContext();
        const audioContext = getSharedAudioContext();

        // 녹음 시작 시간 계산 (마디 경계) - 현재 마디 기준
        const recordStartMeasure = currentMeasureNum;
        const recordStartTime = (recordStartMeasure - 1) * measureDuration;

        // MediaRecorder 시작 (마커 기반 녹음)
        const started = await recorder.startRecording(recordStartTime, recordStartMeasure);
        console.log('🎤 [handleStartJam] startRecording:', started);
        if (!started) return;

        // 1. 현재 위치 저장
        originalPositionRef.current = currentTime;

        // 2. 2마디 전으로 이동 (마디 경계에 맞춤)
        const targetMeasure = calculateTwoMeasuresBackMeasure(currentMeasureNum);
        const startPos = (targetMeasure - 1) * measureDuration;

        console.log(`🎤 [START JAM] 2마디 전으로 이동: 현재마디=${currentMeasureNum}, 목표마디=${targetMeasure}, 현재시간=${currentTime.toFixed(2)}, 이동위치=${startPos.toFixed(2)}`);

        webAudio.seek(startPos);
        metronome.seekTo(startPos);
        setCurrentTime(startPos);

        // 3. 음원 + 메트로놈 재생 시작 (메트로놈은 기존 상태 유지)
        webAudio.setVolume(0.3);
        await webAudio.play();
        await metronome.start();
        setIsPlaying(true);
        // 메트로놈 ON/OFF는 기존 metronomeOn 상태 유지
        metronome.setMuted(!metronomeOn);

        // 4. AudioContext 기반 카운트다운 시작
        setIsCountingDown(true);
        const countdownStartTime = audioContext.currentTime;
        const secondsPerBeat = 60 / SONG_META.bpm;

        // 실제 이동한 마디 수 계산
        const measuresBack = currentMeasureNum - targetMeasure;
        const totalBeatsToWait = measuresBack * 4; // 4/4 박자 기준

        console.log(`🎤 [START JAM] 녹음 시작 예정: 녹음시작마디=${recordStartMeasure}, 녹음시작시간=${recordStartTime.toFixed(2)}, 목표마디=${targetMeasure}, 이동마디수=${measuresBack}, 대기박자=${totalBeatsToWait}`);

        const updateCountdown = () => {
            const elapsed = audioContext.currentTime - countdownStartTime;
            const beatsElapsed = elapsed / secondsPerBeat;
            const beatsRemaining = totalBeatsToWait - beatsElapsed;

            // 마지막 4박을 4,3,2,1로 표시 (또는 남은 박자만큼)
            if (beatsRemaining > 4) {
                // 카운트다운 표시 안함 (아직 마지막 마디 아님)
                setCountdown(null);
            } else if (beatsRemaining > 3) {
                setCountdown(Math.min(4, Math.ceil(beatsRemaining)));
            } else if (beatsRemaining > 2) {
                setCountdown(3);
            } else if (beatsRemaining > 1) {
                setCountdown(2);
            } else if (beatsRemaining > 0) {
                setCountdown(1);
            } else {
                // 카운트다운 완료 → 실제 녹음 시작 마커 설정
                setCountdown(null);
                setIsCountingDown(false);
                setIsJamming(true);

                // 실제 녹음 시작 마커 찍기 (blob 내 상대 시간)
                const actualAudioTime = webAudioRef.current.currentTime;
                recorder.markActualStart();
                showToast('info', '녹음이 시작되었습니다');

                console.log('🎤 [START JAM] 녹음 시작 마커 설정:', {
                    녹음시작시간: recordStartTime.toFixed(3),
                    녹음시작마디: recordStartMeasure,
                    실제오디오시간: actualAudioTime.toFixed(3),
                    차이: (actualAudioTime - recordStartTime).toFixed(3) + 's'
                });
                return;
            }

            countdownAnimationRef.current = requestAnimationFrame(updateCountdown);
        };

        countdownAnimationRef.current = requestAnimationFrame(updateCountdown);
    }, [
        jamSectionRange, recorder, globalMeasure, currentTime, currentMeasureStartTime,
        measureDuration, webAudio, metronome, showToast, metronomeOn,
        calculateTwoMeasuresBackMeasure
    ]);

    /**
     * START JAM 취소 (카운트다운 중 R키 다시 누를 때)
     */
    const handleCancelStartJam = useCallback(() => {
        // 카운트다운 취소
        if (countdownAnimationRef.current) {
            cancelAnimationFrame(countdownAnimationRef.current);
            countdownAnimationRef.current = null;
        }

        setIsCountingDown(false);
        setCountdown(null);

        // 재생 정지
        webAudio.pause();
        metronome.stop();
        setIsPlaying(false);

        // MediaRecorder 정리 (prepareRecording으로 시작된 녹음 취소)
        recorder.resetRecording();

        // 원래 위치로 복귀
        webAudio.seek(originalPositionRef.current);
        metronome.seekTo(originalPositionRef.current);
        setCurrentTime(originalPositionRef.current);
        webAudio.setVolume(1.0);

        showToast('info', '녹음이 취소되었습니다');
        console.log('🎤 [START JAM] 취소됨, 원래 위치로 복귀:', originalPositionRef.current);
    }, [webAudio, metronome, showToast, recorder]);

    /**
     * R키 핸들러 (상태에 따라 분기)
     */
    const handleRKey = useCallback(async () => {
        if (isJamming) {
            // 녹음 중 → 녹음 종료
            const currentMeasureEndTime = currentMeasureStartTime + measureDuration;
            setIsJamming(false);
            await recorder.stopRecording(currentMeasureEndTime, globalMeasure);
            webAudio.pause();
            webAudio.setVolume(1);
            metronome.stop();
            setIsPlaying(false);
            showToast('success', '녹음이 완료되었습니다');
        } else if (isCountingDown) {
            // 카운트다운 중 → 취소
            handleCancelStartJam();
        } else {
            // 대기 중 → START JAM 시작
            await handleStartJam();
        }
    }, [
        isJamming, isCountingDown, currentMeasureStartTime, measureDuration,
        globalMeasure, recorder, webAudio, metronome, showToast,
        handleStartJam, handleCancelStartJam
    ]);

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
                    // 녹음 중이면 일시정지/재개, 카운트다운 중이면 무시
                    if (isCountingDown) {
                        // 카운트다운 중에는 Space 무시
                        return;
                    } else if (isJamming) {
                        handlePauseResumeJamming();
                    } else {
                        await handlePlayPause();
                    }
                    break;
                case 'KeyZ': e.preventDefault(); handleSeekByMeasures(-1); break;
                case 'KeyX': e.preventDefault(); handleSeekByMeasures(1); break;
                case 'KeyD': // D키 - 메트로놈 ON/OFF
                    e.preventDefault();
                    handleToggleMetronome(!metronomeOn);
                    break;
                case 'KeyF': // F키 - JAM만 듣기 토글
                    e.preventDefault();
                    handleToggleJamOnly(!jamOnlyMode);
                    break;
                case 'KeyR': // R키 - START JAM (녹음 시작/종료/취소)
                    e.preventDefault();
                    await handleRKey();
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
    }, [handlePlayPause, handlePauseResumeJamming, handleSeekByMeasures, handleToggleJamOnly, handleToggleMetronome, handleRKey, jamOnlyMode, metronomeOn, isJamming, isCountingDown]);

    // 클린업
    useEffect(() => {
        return () => {
            webAudioRef.current.stop();
            // 카운트다운 애니메이션 정리
            if (countdownAnimationRef.current) {
                cancelAnimationFrame(countdownAnimationRef.current);
            }
        };
    }, []);

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

    // 모달: "네" 버튼 - 처음으로 리셋하고 다시 재생
    const handleModalReplay = useCallback(() => {
        setShowCompleteModal(false);
        webAudio.seek(0);
        metronome.seekTo(0);
        setCurrentTime(0);
        webAudio.setVolume(1.0);
        // 바로 재생 시작
        webAudio.play();
        metronome.seekTo(0);
        metronome.start();
        setIsPlaying(true);
    }, [webAudio, metronome]);

    // 모달: "아니요(저장)" 버튼 - store에 녹음 저장 후 Feedback 페이지로 이동
    const handleModalSave = useCallback(() => {
        setShowCompleteModal(false);

        // 녹음 데이터를 store에 저장 (마커 기반 - preroll 없음)
        const firstSegment = recorder.segments[0];
        if (firstSegment && recorder.recordingRange) {
            // 저장 직전 확인 로그
            console.log('💾 저장 직전 (모달):', {
                blobSize: firstSegment.blob.size,
                blobType: firstSegment.blob.type,
                range: `${recorder.recordingRange.startMeasure}-${recorder.recordingRange.endMeasure}`,
                note: '마커 기반 추출 완료 - blobType=audio/wav'
            });
            setRecording(firstSegment.blob, recorder.recordingRange, 0, inputInstrument, outputInstrument);
        }

        // Feedback 페이지로 이동
        router.push('/single/feedback');
    }, [router, recorder, setRecording, inputInstrument, outputInstrument]);

    return (
        <div className="flex h-screen w-full flex-col overflow-hidden">
            <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden px-8 py-8">
                <div className="flex flex-col gap-2 flex-shrink-0">
                    <div className="flex justify-between items-center text-white">
                        <div className="flex items-center gap-4">
                            <button onClick={handleBack} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ChevronLeft size={24} /></button>
                            <div>
                                <h1 className="text-2xl font-bold leading-none">{SONG_META.title}</h1>
                                <span className="text-sm text-gray-400">{SONG_META.artist}</span>
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
                                {metronomeOn && <span className="text-[#FFD166]">♪ {SONG_META.bpm} BPM</span>}
                            </div>
                            {/* Recording/Processing Status */}
                            <div className="flex items-center gap-3">
                                {recorder.isProcessing && (
                                    <div className="text-sm flex items-center gap-2 text-yellow-400">
                                        <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                                        처리 중...
                                    </div>
                                )}
                                {isCountingDown && countdown === -1 && (
                                    <div className="text-sm flex items-center gap-2 text-[#FFD166]">
                                        <div className="w-3 h-3 border-2 border-[#FFD166] border-t-transparent rounded-full animate-spin" />
                                        준비 중...
                                    </div>
                                )}
                                {isCountingDown && countdown !== null && countdown > 0 && (
                                    <div className="text-2xl font-bold text-[#FFD166] animate-pulse">
                                        {countdown}
                                    </div>
                                )}
                                {isJamming && (
                                    <div className={`text-sm font-bold flex items-center gap-2 text-[#FF7B7B] ${recorder.isPaused ? '' : 'animate-pulse'}`}>
                                        <div className="w-2 h-2 rounded-full bg-[#FF7B7B]" />
                                        {recorder.isPaused ? 'PAUSED' : 'JAMMING'}
                                    </div>
                                )}
                                {recorder.state === 'recorded' && !isJamming && !isCountingDown && (
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
                            sections={songSections}
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
                        onToggleJam={handleRKey}
                        isJamming={isJamming || isCountingDown}
                        onSeekBackward={() => handleSeekByMeasures(-1)}
                        onSeekForward={() => handleSeekByMeasures(1)}
                        jamOnlyMode={jamOnlyMode}
                        onToggleJamOnly={handleToggleJamOnly}
                        metronomeOn={metronomeOn}
                        onToggleMetronome={handleToggleMetronome}
                        onFinish={handleFinish}
                        currentTime={currentTime}
                        duration={duration}
                        pressedKey={pressedKey}
                        hasRecording={recorder.state === 'recorded'}
                        inputInstrument={inputInstrument}
                        onInputInstrumentChange={setInputInstrument}
                        outputInstrument={outputInstrument}
                        onOutputInstrumentChange={setOutputInstrument}
                    />
                </div>
            </div>

            {/* 녹음 완료 모달 */}
            <RecordingCompleteModal
                isOpen={showCompleteModal}
                onReplay={handleModalReplay}
                onSave={handleModalSave}
            />
        </div>
    );
}