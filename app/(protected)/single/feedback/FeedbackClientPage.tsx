'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Play, Pause, RotateCcw, RotateCw } from 'lucide-react';
import SingleScore from '@/components/single/SingleScore';
import SinglePlayerBar from '@/components/single/SinglePlayerBar';
import { useWebAudio } from '@/hooks/useWebAudio';
import { useToast } from '@/contexts/ToastContext';
import { useFeedbackLoader } from '@/hooks/useFeedbackLoader';
import { usePitchAnalyzer } from '@/hooks/usePitchAnalyzer';
import { convertToNotes } from '@/utils/pitchToNote';
import { distributeNotesToMeasures } from '@/utils/distributeNotesToMeasures';
import { useRecordingStore } from '@/stores/recordingStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { NoteData } from '@/types/note';
import { GRADE_COLORS, GRADE_EMOJIS } from '@/types/feedback';
import EditToolPanel from '@/components/single/feedback/EditToolPanel';
import { ChevronRight } from 'lucide-react';

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
    const [myRecordingOnlyMode, setMyRecordingOnlyMode] = useState(false);
    const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
    const [isEditingNotes, setIsEditingNotes] = useState(false);

    // Pitch Analysis State
    const [recordedNotesByMeasure, setRecordedNotesByMeasure] = useState<Record<number, NoteData[]>>({});
    const { analyzeAudio, isAnalyzing: isAnalyzingPitch, error: pitchError } = usePitchAnalyzer();

    // Zustand store에서 녹음 데이터 가져오기
    const { audioBlob: storedAudioBlob, recordingRange: storedRecordingRange, clearRecording } = useRecordingStore();

    // 편집 모드 스토어
    const {
        isEditMode,
        showEditPanel,
        selectedNoteIndices,
        undoStack,
        redoStack,
        setEditMode,
        toggleEditPanel,
        updateNotePitch,
        updateNotePosition,
        updateSelectedNotesDuration,
        deleteSelectedNotes,
        clearSelection,
        undo,
        redo,
        reset,
        initializeNotes,
        editedNotes,
        getCleanedNotes
    } = useFeedbackStore();


    // User recording playback
    const userAudioRef = useRef<HTMLAudioElement | null>(null);
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);

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

    // 재생 중 녹음 범위 진입/이탈 감지
    const isInRecordingRange = useMemo(() => {
        if (!storedRecordingRange) return false;
        return currentTime >= storedRecordingRange.startTime &&
               currentTime < storedRecordingRange.endTime;
    }, [currentTime, storedRecordingRange]);

    // 녹음 범위 진입/이탈 시에만 재생/정지 (isInRecordingRange 변경 시)
    const wasInRangeRef = useRef(false);

    useEffect(() => {
        const userAudio = userAudioRef.current;
        if (!userAudio || !storedRecordingRange || !isPlaying) {
            wasInRangeRef.current = false;
            return;
        }

        const justEnteredRange = isInRecordingRange && !wasInRangeRef.current;
        const justLeftRange = !isInRecordingRange && wasInRangeRef.current;

        if (justEnteredRange) {
            // 범위 진입 시 - 곡 시간 기준으로 재생
            userAudio.currentTime = currentTime;
            userAudio.play().catch(() => {});
        } else if (justLeftRange) {
            userAudio.pause();
        }

        wasInRangeRef.current = isInRecordingRange;
    }, [isInRecordingRange, isPlaying, currentTime, storedRecordingRange]);

    // 실제 녹음 범위에서 구간 가져오기 (Zustand store 사용)
    const recordedRanges = useMemo(() => {
        if (!storedRecordingRange) return [];
        return [{
            start: storedRecordingRange.startTime,
            end: storedRecordingRange.endTime
        }];
    }, [storedRecordingRange]);

    // recordedMeasures 계산 (악보에 표시용) - 실제 녹음 범위 사용
    const recordedMeasures = useMemo(() => {
        if (!storedRecordingRange || !measureDuration) return [];
        const measures: number[] = [];
        for (let m = storedRecordingRange.startMeasure; m <= storedRecordingRange.endMeasure; m++) {
            measures.push(m);
        }
        return measures;
    }, [storedRecordingRange, measureDuration]);

    // 녹음 오디오 동기화 헬퍼 함수
    const syncUserAudio = useCallback((songTime: number, shouldPlay: boolean) => {
        const userAudio = userAudioRef.current;
        if (!userAudio || !storedRecordingRange) return;

        const isInRange = songTime >= storedRecordingRange.startTime &&
                          songTime < storedRecordingRange.endTime;

        if (isInRange) {
            userAudio.currentTime = songTime;
            if (shouldPlay && userAudio.paused) {
                userAudio.play().catch(() => {});
            }
        } else if (!userAudio.paused) {
            userAudio.pause();
        }
    }, [storedRecordingRange]);

    const handlePlayPause = useCallback(async () => {
        const userAudio = userAudioRef.current;
        if (isPlaying) {
            webAudio.pause();
            userAudio?.pause();
            setIsPlaying(false);
        } else {
            if (myRecordingOnlyMode) {
                webAudio.setVolume(0);
            } else {
                webAudio.setVolume(1);
            }
            await webAudio.play();

            // 녹음 오디오 동기화
            syncUserAudio(webAudio.currentTime, true);
            setIsPlaying(true);
        }
    }, [webAudio, isPlaying, myRecordingOnlyMode, syncUserAudio]);

    const handleTimeChange = useCallback((newTime: number) => {
        let clampedTime = Math.max(0, Math.min(newTime, duration));
        webAudio.seek(clampedTime);
        syncUserAudio(clampedTime, isPlaying);
        setCurrentTime(clampedTime);
    }, [duration, webAudio, syncUserAudio, isPlaying]);

    const handleSeekByMeasures = useCallback((offset: number) => {
        const newTime = currentTime + (offset * measureDuration);
        handleTimeChange(newTime);
    }, [currentTime, measureDuration, handleTimeChange]);

    const handleMeasureClick = useCallback((globalMeasureIndex: number) => {
        const targetTime = globalMeasureIndex * measureDuration;
        handleTimeChange(targetTime);
    }, [measureDuration, handleTimeChange]);
    
    // ============================================
    // Pitch Analysis & Note Grouping
    // ============================================
    // 녹음 데이터 분석 (ref로 중복 실행 방지)
    const audioUrlCreatedRef = useRef(false);

    useEffect(() => {
        if (!storedAudioBlob || !storedRecordingRange) return;
        if (audioUrlCreatedRef.current) return;

        audioUrlCreatedRef.current = true;

        // 녹음 재생용 URL 생성
        const url = URL.createObjectURL(storedAudioBlob);
        setUserAudioUrl(url);

        // 비동기 분석
        const performAnalysis = async () => {
            const pitchFrames = await analyzeAudio(storedAudioBlob);
            const beatsPerMeasure = Number(MOCK_SONG.time_signature.split('/')[0]);
            const beatDuration = 60 / MOCK_SONG.bpm;
            const measureDurationSec = beatDuration * beatsPerMeasure;

            // 16슬롯 그리드 기반 음표 변환
            // measureIndex는 오디오 블롭 시작 기준 (0부터)
            const notes = convertToNotes(pitchFrames, MOCK_SONG.bpm);

            // 오디오 블롭은 addSilencePadding으로 startTime만큼 무음이 앞에 추가됨
            // 따라서 Grid 시간 = 곡 시간 (무음 패딩으로 정렬됨)
            // prerollMeasures = startTime을 마디로 변환한 값
            const prerollMeasures = Math.floor(storedRecordingRange.startTime / measureDurationSec);

            // 디버그: 원본 음표들의 measureIndex 분포 확인
            const originalMeasureIndices = notes
                .filter(n => !n.isRest)
                .map(n => n.measureIndex);
            const uniqueOriginalMeasures = [...new Set(originalMeasureIndices)].sort((a, b) => a - b);

            console.log('[Pitch Analysis] 상세 오프셋 계산:', {
                bpm: MOCK_SONG.bpm,
                measureDurationSec: measureDurationSec.toFixed(3),
                startTime: storedRecordingRange.startTime.toFixed(3),
                startMeasure: storedRecordingRange.startMeasure,
                prerollMeasures,
                expectedFirstMeasure: prerollMeasures,
                originalMeasureRange: uniqueOriginalMeasures.length > 0
                    ? `${uniqueOriginalMeasures[0]} ~ ${uniqueOriginalMeasures[uniqueOriginalMeasures.length - 1]}`
                    : 'none',
                calculation: `originalMeasure - ${prerollMeasures} + ${storedRecordingRange.startMeasure} = finalMeasure`
            });

            // measureIndex에서 prerollMeasures를 빼서 보정
            // 예: startTime=16초, measureDuration=2초 → prerollMeasures=8
            // note.measureIndex가 8이면 → 8 - 8 = 0 (녹음 시작 지점)
            const adjustedNotes = notes
                .filter(note => !note.isRest)
                .map(note => ({
                    ...note,
                    measureIndex: note.measureIndex - prerollMeasures
                }))
                .filter(note => note.measureIndex >= 0); // 녹음 시작 전 데이터 제외

            const groupedNotes = distributeNotesToMeasures(adjustedNotes, {
                bpm: MOCK_SONG.bpm,
                beatsPerMeasure,
                startMeasure: storedRecordingRange.startMeasure
            });

            // 디버그 로그: 변환 결과
            const adjustedMeasureIndices = adjustedNotes.map(n => n.measureIndex);
            const uniqueAdjustedMeasures = [...new Set(adjustedMeasureIndices)].sort((a, b) => a - b);
            const finalMeasures = Object.keys(groupedNotes).map(Number).sort((a, b) => a - b);

            console.log('[Pitch Analysis] 변환 결과:', {
                totalNotes: notes.filter(n => !n.isRest).length,
                adjustedNotes: adjustedNotes.length,
                adjustedMeasureRange: uniqueAdjustedMeasures.length > 0
                    ? `${uniqueAdjustedMeasures[0]} ~ ${uniqueAdjustedMeasures[uniqueAdjustedMeasures.length - 1]}`
                    : 'none',
                finalMeasureRange: finalMeasures.length > 0
                    ? `${finalMeasures[0]} ~ ${finalMeasures[finalMeasures.length - 1]}`
                    : 'none',
                finalMeasures
            });

            // 첫 3개 음표의 상세 변환 과정
            if (notes.filter(n => !n.isRest).length > 0) {
                const firstThreeNotes = notes.filter(n => !n.isRest).slice(0, 3);
                console.log('[Pitch Analysis] 첫 3개 음표 변환 과정:');
                firstThreeNotes.forEach((note, i) => {
                    const adjusted = note.measureIndex - prerollMeasures;
                    const final = adjusted + storedRecordingRange.startMeasure;
                    console.log(`  [${i}] ${note.pitch}: original=${note.measureIndex} - preroll=${prerollMeasures} = adjusted=${adjusted} + startMeasure=${storedRecordingRange.startMeasure} = final=${final}`);
                });
            }

            setRecordedNotesByMeasure(groupedNotes);

            // 편집 스토어 초기화 - 모든 음표를 flat array로 변환
            const allNotes: NoteData[] = [];
            Object.entries(groupedNotes).forEach(([measureNum, notes]) => {
                notes.forEach(note => {
                    allNotes.push(note);
                });
            });
            initializeNotes(allNotes);
        };

        performAnalysis();
    }, [storedAudioBlob, storedRecordingRange, analyzeAudio, initializeNotes]);

    // Helper to create a WAV blob from an AudioBuffer (for mocking)
    function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const dataLength = buffer.length * blockAlign;
        const bufferLength = 44 + dataLength;
        const arrayBuffer = new ArrayBuffer(bufferLength);
        const view = new DataView(arrayBuffer);
        const writeString = (offset: number, str: string) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };
        writeString(0, 'RIFF'); view.setUint32(4, bufferLength - 8, true); writeString(8, 'WAVE');
        writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true); writeString(36, 'data'); view.setUint32(40, dataLength, true);
        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true); offset += 2;
            }
        }
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    const handleToggleMyRecordingOnly = useCallback((enabled: boolean) => {
        setMyRecordingOnlyMode(enabled);
        webAudio.setVolume(enabled ? 0 : 1);
    }, [webAudio]);

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

            // 편집 모드 키보드 단축키
            if (isEditMode) {
                console.log('[Keyboard] Edit mode key:', e.code);
                switch (e.code) {
                    case 'ArrowUp':
                        e.preventDefault();
                        console.log('[Keyboard] Pitch up');
                        updateNotePitch('up');
                        return;
                    case 'ArrowDown':
                        e.preventDefault();
                        console.log('[Keyboard] Pitch down');
                        updateNotePitch('down');
                        return;
                    case 'ArrowLeft':
                        e.preventDefault();
                        if (e.shiftKey) {
                            console.log('[Keyboard] Duration decrease (Shift+Left)');
                            updateSelectedNotesDuration('decrease');
                        } else {
                            console.log('[Keyboard] Move left');
                            updateNotePosition('left');
                        }
                        return;
                    case 'ArrowRight':
                        e.preventDefault();
                        if (e.shiftKey) {
                            console.log('[Keyboard] Duration increase (Shift+Right)');
                            updateSelectedNotesDuration('increase');
                        } else {
                            console.log('[Keyboard] Move right');
                            updateNotePosition('right');
                        }
                        return;
                    case 'Delete':
                    case 'Backspace':
                        e.preventDefault();
                        console.log('[Keyboard] Delete pressed');
                        deleteSelectedNotes();
                        return;
                    case 'Escape':
                        e.preventDefault();
                        console.log('[Keyboard] Escape - clear selection');
                        clearSelection();
                        return;
                    case 'KeyZ':
                        if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            undo();
                            return;
                        }
                        break;
                    case 'KeyX':
                        if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            redo();
                            return;
                        }
                        break;
                }
            }

            // 기본 재생 단축키
            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    await handlePlayPause();
                    break;
                case 'KeyZ': e.preventDefault(); handleSeekByMeasures(-1); break;
                case 'KeyX': e.preventDefault(); handleSeekByMeasures(1); break;
                case 'KeyF':
                    e.preventDefault();
                    handleToggleJamOnly(!jamOnlyMode);
                    break;
                case 'KeyS':
                    e.preventDefault();
                    handleToggleMyRecordingOnly(!myRecordingOnlyMode);
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
    }, [handlePlayPause, handleSeekByMeasures, handleToggleJamOnly, jamOnlyMode, handleToggleMyRecordingOnly, myRecordingOnlyMode, isEditMode, updateNotePitch, updateNotePosition, updateSelectedNotesDuration, deleteSelectedNotes, clearSelection, undo, redo]);
    
    const [isUserAudioReady, setIsUserAudioReady] = useState(false);
    const audioCreatedRef = useRef(false);

    useEffect(() => {
        if (!userAudioUrl) return;
        if (audioCreatedRef.current) return;

        audioCreatedRef.current = true;

        const audio = new Audio(userAudioUrl);
        audio.volume = 1.0;
        audio.preload = 'auto';

        audio.addEventListener('canplaythrough', () => {
            setIsUserAudioReady(true);
        });

        audio.addEventListener('error', (e) => {
            console.error('User audio error:', audio.error?.message);
        });

        audio.load();
        userAudioRef.current = audio;
    }, [userAudioUrl]);

    useEffect(() => {
        return () => {
            // 컴포넌트 완전 언마운트 시에만 정리
            if (userAudioRef.current) {
                userAudioRef.current.pause();
            }
            webAudioRef.current.stop();
        };
    }, []);

    const handleBack = useCallback(() => {
        router.back();
    }, [router]);

    const handleShare = () => console.log('공유하기 클릭');
    const handleReJam = () => router.push('/single');

    // 편집 확정: 정리된 음표+쉼표를 recordedNotesByMeasure에 반영
    const handleConfirmEdit = useCallback(() => {
        // 겹침 제거 + 연속 쉼표 병합된 깨끗한 데이터 가져오기
        const cleanedNotes = getCleanedNotes();

        // measure별로 그룹화
        const newNotesByMeasure: Record<number, NoteData[]> = {};

        cleanedNotes.forEach(note => {
            const measureIndex = note.measureIndex;
            if (!newNotesByMeasure[measureIndex]) {
                newNotesByMeasure[measureIndex] = [];
            }
            newNotesByMeasure[measureIndex].push(note);
        });

        console.log('[Edit Confirm] cleanedNotes:', cleanedNotes.length);
        console.log('[Edit Confirm] notes:', cleanedNotes.filter(n => !n.isRest).length, 'rests:', cleanedNotes.filter(n => n.isRest).length);

        // recordedNotesByMeasure 업데이트
        setRecordedNotesByMeasure(newNotesByMeasure);

        // 편집 모드 종료
        setIsEditPanelOpen(false);
        setEditMode(false);

        showToast('success', '편집이 확정되었습니다');
    }, [getCleanedNotes, setEditMode, showToast]);

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

                <div className="flex-1 mt-3 relative min-h-0">
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
                            recordedNotes={recordedNotesByMeasure}
                            isEditMode={isEditMode}
                        />
                    </div>
                </div>

                {/* New Layout Sections */}
                <div className="mt-3 flex flex-col gap-3">
                    {/* 영역 2: 평가 또는 편집 도구 */}
                    {isEditMode ? (
                        /* 편집 도구 패널 (인라인) */
                        <EditToolPanel
                            onClose={() => {
                                setIsEditPanelOpen(false);
                                setEditMode(false);
                            }}
                            onUndo={undo}
                            onRedo={redo}
                            onReset={reset}
                            onConfirm={handleConfirmEdit}
                            canUndo={undoStack.length > 0}
                            canRedo={redoStack.length > 0}
                        />
                    ) : (
                        /* 평가 카드 (컴팩트) */
                        <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-5">
                                <div className="text-center">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Score</p>
                                    <p className="text-4xl font-bold" style={{ color: gradeColor }}>{displayFeedback.score}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-semibold" style={{ color: gradeColor }}>{displayFeedback.grade}</span>
                                    <span className="text-xl">{GRADE_EMOJIS[displayFeedback.grade]}</span>
                                </div>
                                <p className="text-base text-gray-400 italic hidden sm:block">"{displayFeedback.comment}"</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsEditPanelOpen(true);
                                    setEditMode(true);
                                }}
                                className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <span className="text-sm">편집모드</span>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}

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
                            {/* 내 녹음만 듣기 Toggle - 좌측 정렬 */}
                            <button
                                type="button"
                                onClick={() => handleToggleMyRecordingOnly(!myRecordingOnlyMode)}
                                className={`relative flex flex-col items-center px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-w-[120px] ${
                                    myRecordingOnlyMode ? 'bg-[#FF7B7B]/20 border border-[#FF7B7B] text-[#FF7B7B]' : 'border border-gray-600 text-gray-300 hover:bg-white/10'
                                }`}
                                title="내 녹음만 듣기 (S)"
                            >
                                내 녹음만 듣기
                                <span className="absolute -bottom-5 text-xs font-medium text-[#9B9B9B]">S</span>
                            </button>

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