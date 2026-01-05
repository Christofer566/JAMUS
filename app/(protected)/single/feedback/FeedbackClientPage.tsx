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
import { convertToNotes, generateSuggestedRanges } from '@/utils/pitchToNote';
import { distributeNotesToMeasures } from '@/utils/distributeNotesToMeasures';
import { useRecordingStore } from '@/stores/recordingStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { NoteData } from '@/types/note';
import { GRADE_COLORS, GRADE_EMOJIS } from '@/types/feedback';
import EditToolPanel from '@/components/single/feedback/EditToolPanel';
import { ChevronRight } from 'lucide-react';
import { DEFAULT_SONG } from '@/data/songs';
import { useVoiceToInstrument } from '@/hooks/useVoiceToInstrument';
import { OutputInstrument } from '@/types/instrument';
import { compareNotes, analyzeGap, logGapAnalysis } from '@/utils/noteComparison';
import { GROUND_TRUTH_NOTES } from '@/utils/groundTruthNotes';
import '@/utils/selfRefiningTest'; // Self-Refining Test 유틸리티 로드

// 곡 데이터에서 가져오기
const CURRENT_SONG = DEFAULT_SONG;
const TEST_AUDIO_URLS = CURRENT_SONG.audioUrls;
const songSections = CURRENT_SONG.sections;
const SONG_META = CURRENT_SONG.meta;

const calculateMeasureDuration = (bpm: number, timeSignature: string): number => {
    const [beatsPerMeasure] = timeSignature.split('/').map(Number);
    return (60 / bpm) * beatsPerMeasure;
};

// 음정 변경 헬퍼 (미리듣기용)
const NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MIN_OCTAVE = 2;
const MAX_OCTAVE = 6;

function shiftPitch(pitch: string, direction: 'up' | 'down'): string | null {
    const match = pitch.match(/^([A-G]#?)(\d)$/);
    if (!match) return null;

    const note = match[1];
    let noteIndex = NOTE_ORDER.indexOf(note);
    let octave = parseInt(match[2]);

    if (direction === 'up') {
        noteIndex++;
        if (noteIndex >= NOTE_ORDER.length) {
            noteIndex = 0;
            octave++;
        }
    } else {
        noteIndex--;
        if (noteIndex < 0) {
            noteIndex = NOTE_ORDER.length - 1;
            octave--;
        }
    }

    if (octave < MIN_OCTAVE || octave > MAX_OCTAVE) return null;
    return `${NOTE_ORDER[noteIndex]}${octave}`;
}

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
    const [isEditConfirmed, setIsEditConfirmed] = useState(false);  // 편집 완료 후 잠금
    const [rawRecordingMode, setRawRecordingMode] = useState(false);  // Phase 78: 녹음 듣기 모드

    // 정확도 표시 State
    const [accuracyStats, setAccuracyStats] = useState<{
        pitch: number;
        timing: number;
        duration: number;
        overall: number;
        matched: number;
        total: number;
    } | null>(null);

    // 최적화 State
    const [optimizationState, setOptimizationState] = useState<{
        caseCount: number;
        completeCases: number;
        isRunning: boolean;
        result: string | null;
        error: string | null;
    }>({
        caseCount: 0,
        completeCases: 0,
        isRunning: false,
        result: null,
        error: null
    });

    // Pitch Analysis State
    const [recordedNotesByMeasure, setRecordedNotesByMeasure] = useState<Record<number, NoteData[]>>({});
    const { analyzeAudio, isAnalyzing: isAnalyzingPitch, error: pitchError } = usePitchAnalyzer();

    // Zustand store에서 녹음 데이터 가져오기
    const { audioBlob: storedAudioBlob, recordingRange: storedRecordingRange, prerollDuration: storedPrerollDuration, inputInstrument: storedInputInstrument, outputInstrument: storedOutputInstrument, clearRecording } = useRecordingStore();

    // 편집 모드 스토어
    const {
        isEditMode,
        showEditPanel,
        selectedNoteIndices,
        undoStack,
        redoStack,
        rawAutoNotes,
        setEditMode,
        toggleEditPanel,
        selectNote: storeSelectNote,
        selectPrevNote,
        selectNextNote,
        addNote,
        updateNotePitch,
        updateNotePosition,
        updateSelectedNotesDuration,
        deleteSelectedNotes,
        clearSelection,
        undo,
        redo,
        reset,
        setRawAutoNotes,
        initializeNotes,
        editedNotes,
        getCleanedNotes,
        conversionState,
        instrumentOnlyMode,
        setConversionState,
        toggleInstrumentOnlyMode,
        resetConversionState,
        setSessionMeta,
        saveFeedback,
        setSuggestedRanges
    } = useFeedbackStore();

    // 악기 변환 훅
    const voiceToInstrument = useVoiceToInstrument();


    // User recording playback
    const userAudioRef = useRef<HTMLAudioElement | null>(null);
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);

    // AI 피드백 로더 (3.5초 로딩 후 Mock 데이터 표시)
    const { isLoading: isFeedbackLoading, feedback } = useFeedbackLoader();

    const webAudio = useWebAudio({ chorusRepeat: 1 });
    const webAudioRef = useRef(webAudio);
    webAudioRef.current = webAudio;

    const measureDuration = useMemo(() => calculateMeasureDuration(SONG_META.bpm, SONG_META.time_signature), []);
    const totalMeasures = useMemo(() => songSections.reduce((acc, s) => acc + s.measures.length, 0), []);
    const duration = webAudio.isReady ? webAudio.duration : totalMeasures * measureDuration;

    const introEndTime = useMemo(() => { // Re-add introEndTime calculation
        let accumulatedMeasures = 0;
        for (const section of songSections) {
            accumulatedMeasures += section.measures.length;
            if (!section.isJamSection) { // Assuming intro is the first non-jam section
                return accumulatedMeasures * measureDuration;
            }
        }
        return 0; // Default if no intro
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
        if (!playerBarSections[currentSectionIndex]) return 0;
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

    const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

    const handleSelectionChange = useCallback((selection: { start: number; end: number } | null) => {
        setSelectedMeasures(selection);
    }, []);

    // 현재 선택된 음표 번호 계산 (쉼표 제외)
    const currentNoteInfo = useMemo(() => {
        const notesOnly = editedNotes.filter(n => !n.isRest);
        if (selectedNoteIndices.length === 0 || notesOnly.length === 0) {
            return { index: null, total: notesOnly.length };
        }
        const selectedIndex = selectedNoteIndices[0];
        const noteIndex = notesOnly.findIndex(n => editedNotes.indexOf(n) === selectedIndex);
        return { index: noteIndex !== -1 ? noteIndex : null, total: notesOnly.length };
    }, [editedNotes, selectedNoteIndices]);

    useEffect(() => { webAudioRef.current.loadAudio(TEST_AUDIO_URLS); }, []);
    useEffect(() => { setCurrentTime(webAudio.currentTime); }, [webAudio.currentTime]);

    // 편집 모드일 때 뒤로가기/새로고침 경고
    useEffect(() => {
        if (!isEditMode) return;

        // 브라우저 새로고침/닫기 경고
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
            return '';
        };

        // 뒤로가기 방지: history에 더미 state 추가
        window.history.pushState(null, '', window.location.href);

        const handlePopState = () => {
            const confirmed = window.confirm('편집 중인 내용이 있습니다. 정말 나가시겠습니까?');
            if (confirmed) {
                // 진짜 뒤로가기
                window.history.back();
            } else {
                // 취소: 다시 더미 state 추가하여 현재 페이지 유지
                window.history.pushState(null, '', window.location.href);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isEditMode]);

    // 케이스 개수 조회 (컴포넌트 마운트 시)
    useEffect(() => {
        const fetchCaseCount = async () => {
            try {
                const res = await fetch('/api/pitch-test');
                if (res.ok) {
                    const data = await res.json();
                    setOptimizationState(prev => ({
                        ...prev,
                        caseCount: data.caseCount,
                        completeCases: data.completeCases
                    }));
                }
            } catch (err) {
                console.log('[Pitch Test] 케이스 조회 실패 (로컬 개발 환경에서만 동작)');
            }
        };
        fetchCaseCount();
    }, []);

    // 최적화 실행 함수
    const runOptimization = useCallback(async (mode: 'single' | 'auto' = 'single') => {
        if (optimizationState.isRunning) return;

        setOptimizationState(prev => ({
            ...prev,
            isRunning: true,
            result: null,
            error: null
        }));

        try {
            const res = await fetch('/api/pitch-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });

            const data = await res.json();

            if (data.success) {
                setOptimizationState(prev => ({
                    ...prev,
                    isRunning: false,
                    result: data.summary || '최적화 완료'
                }));
                showToast('success', '최적화 완료!');
            } else {
                setOptimizationState(prev => ({
                    ...prev,
                    isRunning: false,
                    error: data.error || '최적화 실패'
                }));
                showToast('error', data.error || '최적화 실패');
            }
        } catch (err) {
            setOptimizationState(prev => ({
                ...prev,
                isRunning: false,
                error: '서버 연결 실패 (로컬 개발 환경에서만 동작)'
            }));
            showToast('error', '서버 연결 실패');
        }
    }, [optimizationState.isRunning, showToast]);

    // 재생 중 현재 음표 자동 선택
    useEffect(() => {
        if (!isPlaying || !storedRecordingRange || editedNotes.length === 0) return;

        // 편집 모드가 아니면 자동 선택하지 않음
        if (!isEditMode) return;

        // 현재 재생 시간이 녹음 범위 내에 있는지 확인
        if (currentTime < storedRecordingRange.startTime || currentTime >= storedRecordingRange.endTime) return;

        // 녹음 시작점 기준 상대 시간 계산
        const relativeTime = currentTime - storedRecordingRange.startTime;
        const relativeBeat = relativeTime / (60 / SONG_META.bpm);

        // 현재 재생 중인 음표 찾기 (쉼표 제외)
        const notesOnly = editedNotes.filter(n => !n.isRest);
        const currentNoteIndex = notesOnly.findIndex(note => {
            const noteEndBeat = note.beat + (note.slotCount / 4);
            return relativeBeat >= note.beat && relativeBeat < noteEndBeat;
        });

        if (currentNoteIndex !== -1) {
            const actualIndex = editedNotes.indexOf(notesOnly[currentNoteIndex]);
            // 이미 선택되어 있으면 업데이트하지 않음 (무한 루프 방지)
            if (selectedNoteIndices[0] !== actualIndex) {
                storeSelectNote(actualIndex, false);
            }
        }
    }, [isPlaying, currentTime, storedRecordingRange, editedNotes, isEditMode, selectedNoteIndices, storeSelectNote]);

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
        if (!userAudio || !storedRecordingRange) {
            wasInRangeRef.current = false;
            return;
        }

        // Phase 78: rawRecordingMode가 활성화되면 폴백 모드여도 녹음 오디오 재생
        // 폴백 모드(신디사이저)일 때는 녹음 오디오 재생하지 않음 (rawRecordingMode 제외)
        const isFallbackMode = storedOutputInstrument !== 'raw' && conversionState.isFallbackMode;
        if (isFallbackMode && !rawRecordingMode) {
            if (!userAudio.paused) {
                userAudio.pause();
                console.log('🎤 [User Audio] 폴백 모드 - 녹음 오디오 정지');
            }
            wasInRangeRef.current = false;
            return;
        }

        // 재생 중지 시 녹음 오디오도 즉시 정지
        if (!isPlaying) {
            if (!userAudio.paused) {
                userAudio.pause();
                console.log('🎤 [User Audio] 재생 중지됨 (isPlaying=false)');
            }
            wasInRangeRef.current = false;
            return;
        }

        const justEnteredRange = isInRecordingRange && !wasInRangeRef.current;
        const justLeftRange = !isInRecordingRange && wasInRangeRef.current;

        if (justEnteredRange) {
            // 범위 진입 시 - 녹음 blob은 무음 패딩 없이 0부터 시작하므로 오프셋 적용
            const recordingOffset = currentTime - storedRecordingRange.startTime;
            userAudio.currentTime = Math.max(0, recordingOffset);
            userAudio.play().catch(() => {});
            console.log('🎤 [User Audio] 재생 시작 (범위 진입)', { offset: recordingOffset.toFixed(2) });
        } else if (justLeftRange) {
            userAudio.pause();
            console.log('🎤 [User Audio] 재생 정지 (범위 이탈)');
        }

        wasInRangeRef.current = isInRecordingRange;
    }, [isInRecordingRange, isPlaying, currentTime, storedRecordingRange, storedOutputInstrument, conversionState.isFallbackMode, rawRecordingMode]);

    // Tone.js 자동 재시작: 폴백 모드에서 재생 중 녹음 범위 진입 시
    const wasInRangeForToneRef = useRef(false);
    useEffect(() => {
        const isFallbackMode = storedOutputInstrument !== 'raw' && conversionState.isFallbackMode;

        // 폴백 모드가 아니거나 재생 중이 아니면 스킵
        if (!isFallbackMode || rawRecordingMode || !isPlaying || !storedRecordingRange || editedNotes.length === 0) {
            wasInRangeForToneRef.current = isInRecordingRange;
            return;
        }

        const justEnteredRange = isInRecordingRange && !wasInRangeForToneRef.current;

        if (justEnteredRange) {
            console.log('🎹 [Tone.js Auto] 녹음 범위 진입 - 자동 재시작');

            // slotIndex 기반으로 beat 재계산
            const notesOnlyNotes = editedNotes
                .filter(n => !n.isRest)
                .map(note => {
                    const relativeMeasureIndex = note.measureIndex - storedRecordingRange.startMeasure;
                    const slotBasedBeat = (relativeMeasureIndex * 4) + (note.slotIndex / 4);
                    return { ...note, beat: slotBasedBeat };
                });

            const relativeStartTime = currentTime - storedRecordingRange.startTime;

            voiceToInstrument.stopFallbackPlayback();
            voiceToInstrument.playNotesAsFallback(
                notesOnlyNotes,
                SONG_META.bpm,
                relativeStartTime
            );
        }

        wasInRangeForToneRef.current = isInRecordingRange;
    }, [isInRecordingRange, isPlaying, currentTime, storedRecordingRange, storedOutputInstrument, conversionState.isFallbackMode, rawRecordingMode, editedNotes, voiceToInstrument]);

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
            // 녹음 blob은 무음 패딩 없이 0부터 시작하므로 오프셋 적용
            const recordingOffset = songTime - storedRecordingRange.startTime;
            userAudio.currentTime = Math.max(0, recordingOffset);
            if (shouldPlay && userAudio.paused) {
                userAudio.play().catch(() => {});
            }
        } else if (!userAudio.paused) {
            userAudio.pause();
        }
    }, [storedRecordingRange]);

    const handlePlayPause = useCallback(async () => {
        const userAudio = userAudioRef.current;
        const isFallbackMode = storedOutputInstrument !== 'raw' && conversionState.isFallbackMode;
        // Phase 78: rawRecordingMode가 활성화되면 폴백 모드여도 원본 녹음 재생
        const shouldPlayRawRecording = rawRecordingMode || storedOutputInstrument === 'raw';

        if (isPlaying) {
            console.log('🎤 [handlePlayPause] 정지 요청');
            webAudio.pause();

            // 폴백 모드: Tone.js 재생 정지 (rawRecordingMode가 아닐 때만)
            if (isFallbackMode && !rawRecordingMode) {
                voiceToInstrument.stopFallbackPlayback();
                console.log('🎹 [handlePlayPause] Tone.js 폴백 재생 정지');
            }

            if (userAudio && !userAudio.paused) {
                userAudio.pause();
                userAudio.currentTime = 0;
                console.log('🎤 [handlePlayPause] userAudio 정지됨');
            }
            setIsPlaying(false);
        } else {
            // JAM 볼륨 조정 (rawRecordingMode는 JAM 반주 유지)
            if (myRecordingOnlyMode || instrumentOnlyMode) {
                webAudio.setVolume(0);
            } else {
                webAudio.setVolume(1);
            }
            await webAudio.play();

            // Phase 78: rawRecordingMode가 활성화되면 Tone.js 대신 원본 녹음 재생
            if (shouldPlayRawRecording) {
                // 원본 재생 모드 (녹음 듣기)
                syncUserAudio(webAudio.currentTime, true);
                console.log('🎤 [handlePlayPause] 녹음 듣기 모드 - 원본 재생');
            } else if (isFallbackMode && editedNotes.length > 0 && storedRecordingRange) {
                // 폴백 모드: Tone.js로 음표 재생
                // 녹음 범위 내에 있는지 확인
                const isInRange = webAudio.currentTime >= storedRecordingRange.startTime &&
                                  webAudio.currentTime < storedRecordingRange.endTime;

                if (isInRange) {
                    // slotIndex 기반으로 beat 재계산 (수직선 위치와 동기화)
                    const notesOnlyNotes = editedNotes
                        .filter(n => !n.isRest)
                        .map(note => {
                            // measureIndex(절대) → 상대 마디 인덱스
                            const relativeMeasureIndex = note.measureIndex - storedRecordingRange.startMeasure;
                            // slotIndex 기반 beat 계산 (16슬롯 = 4박자)
                            const slotBasedBeat = (relativeMeasureIndex * 4) + (note.slotIndex / 4);
                            return {
                                ...note,
                                beat: slotBasedBeat
                            };
                        });

                    // 수직선 위치와 동기화된 재생 시작 시간 계산
                    const relativeStartTime = webAudio.currentTime - storedRecordingRange.startTime;
                    console.log('🎹 [handlePlayPause] Tone.js 폴백 재생 시작 (수직선 동기화)', {
                        notesCount: notesOnlyNotes.length,
                        currentTime: webAudio.currentTime.toFixed(2),
                        recordingStart: storedRecordingRange.startTime.toFixed(2),
                        relativeStartTime: relativeStartTime.toFixed(2),
                        isInRange: true
                    });
                    console.log('🎹 [handlePlayPause] 재생할 첫 5개 음표 pitch:', notesOnlyNotes.slice(0, 5).map(n => n.pitch));
                    console.log('🎹 [handlePlayPause] 재생할 첫 5개 음표 beat:', notesOnlyNotes.slice(0, 5).map(n => n.beat.toFixed(2)));
                    await voiceToInstrument.playNotesAsFallback(
                        notesOnlyNotes,
                        SONG_META.bpm,
                        relativeStartTime  // 녹음 시작점 기준 시간
                    );
                } else {
                    console.log('🎹 [handlePlayPause] 녹음 범위 밖 - Tone.js 재생 안함', {
                        currentTime: webAudio.currentTime.toFixed(2),
                        recordingStart: storedRecordingRange.startTime.toFixed(2),
                        recordingEnd: storedRecordingRange.endTime.toFixed(2),
                        isInRange: false
                    });
                }
            } else {
                // 기본 원본 재생 모드
                syncUserAudio(webAudio.currentTime, true);
            }

            setIsPlaying(true);
        }
    }, [webAudio, isPlaying, myRecordingOnlyMode, instrumentOnlyMode, rawRecordingMode, syncUserAudio, storedOutputInstrument, conversionState.isFallbackMode, editedNotes, storedRecordingRange, voiceToInstrument]);

    const handleTimeChange = useCallback(async (newTime: number) => {
        let clampedTime = Math.max(0, Math.min(newTime, duration));
        webAudio.seek(clampedTime);
        setCurrentTime(clampedTime);

        const isFallbackMode = storedOutputInstrument !== 'raw' && conversionState.isFallbackMode;
        // Phase 78: rawRecordingMode가 활성화되면 Tone.js 재시작 안함
        const shouldPlayRawRecording = rawRecordingMode || storedOutputInstrument === 'raw';

        // 폴백 모드이고 재생 중이면 Tone.js 재생 재시작 (rawRecordingMode 제외)
        if (isFallbackMode && !rawRecordingMode && isPlaying && editedNotes.length > 0 && storedRecordingRange) {
            // 기존 재생 중지
            voiceToInstrument.stopFallbackPlayback();

            // 녹음 범위 내에 있는지 확인
            const isInRange = clampedTime >= storedRecordingRange.startTime &&
                              clampedTime < storedRecordingRange.endTime;

            if (isInRange) {
                // slotIndex 기반으로 beat 재계산 (수직선 위치와 동기화)
                const notesOnlyNotes = editedNotes
                    .filter(n => !n.isRest)
                    .map(note => {
                        // measureIndex(절대) → 상대 마디 인덱스
                        const relativeMeasureIndex = note.measureIndex - storedRecordingRange.startMeasure;
                        // slotIndex 기반 beat 계산 (16슬롯 = 4박자)
                        const slotBasedBeat = (relativeMeasureIndex * 4) + (note.slotIndex / 4);
                        return {
                            ...note,
                            beat: slotBasedBeat
                        };
                    });

                // 수직선 위치와 동기화된 재생 시작 시간 계산 (오프셋 없음)
                const relativeStartTime = clampedTime - storedRecordingRange.startTime;

                console.log('🎹 [Seek] Tone.js 재생 재시작 (수직선 동기화)', {
                    seekTime: clampedTime.toFixed(2),
                    recordingStart: storedRecordingRange.startTime.toFixed(2),
                    relativeStartTime: relativeStartTime.toFixed(2),
                    isInRange: true
                });

                await voiceToInstrument.playNotesAsFallback(
                    notesOnlyNotes,
                    SONG_META.bpm,
                    relativeStartTime
                );
            } else {
                console.log('🎹 [Seek] 녹음 범위 밖 - Tone.js 재생 중지', {
                    seekTime: clampedTime.toFixed(2),
                    recordingStart: storedRecordingRange.startTime.toFixed(2),
                    recordingEnd: storedRecordingRange.endTime.toFixed(2),
                    isInRange: false
                });
            }
        } else if (shouldPlayRawRecording) {
            // 녹음 듣기 모드 또는 원본 모드: user audio 동기화
            syncUserAudio(clampedTime, isPlaying);
        }
    }, [duration, webAudio, isPlaying, storedOutputInstrument, conversionState.isFallbackMode, rawRecordingMode, editedNotes, storedRecordingRange, voiceToInstrument, syncUserAudio]);

    const handleSeekByMeasures = useCallback((offset: number) => {
        const newTime = currentTime + (offset * measureDuration);
        handleTimeChange(newTime);
    }, [currentTime, measureDuration, handleTimeChange]);

    const handleMeasureClick = useCallback((globalMeasureIndex: number) => {
        const targetTime = globalMeasureIndex * measureDuration;
        handleTimeChange(targetTime);
    }, [measureDuration, handleTimeChange]);

    // 편집 모드에서 선택된 음표 변경 시 수직선 동기화
    // 재생 중일 때는 수직선 이동하지 않음 (Tone.js 재시작 방지)
    const prevSelectedNoteRef = useRef<{ index: number; beat: number } | null>(null);
    useEffect(() => {
        if (!isEditMode || !storedRecordingRange || selectedNoteIndices.length === 0) {
            prevSelectedNoteRef.current = null;
            return;
        }

        // 재생 중에는 수직선 동기화 하지 않음 (Tone.js 재시작으로 인한 렉 방지)
        if (isPlaying) {
            return;
        }

        const selectedIndex = selectedNoteIndices[0];
        const selectedNote = editedNotes[selectedIndex];
        if (!selectedNote || selectedNote.isRest) {
            prevSelectedNoteRef.current = null;
            return;
        }

        // 다른 음표 선택 또는 같은 음표의 위치 변경 시 수직선 이동
        const prev = prevSelectedNoteRef.current;
        const shouldMove = !prev || prev.index !== selectedIndex || prev.beat !== selectedNote.beat;

        if (shouldMove) {
            // slotIndex 기반으로 정확한 위치 계산 (음표 박스와 동일한 기준)
            const measureDurationSec = (4 * 60) / SONG_META.bpm; // 4박자 = 1마디
            const slotDurationSec = measureDurationSec / 16; // 16슬롯/마디

            // measureIndex는 절대 마디 번호 → startMeasure를 빼서 상대 인덱스로 변환
            const relativeMeasureIndex = selectedNote.measureIndex - storedRecordingRange.startMeasure;
            // +3.5슬롯 오프셋 보정
            const noteTimeInRecording = (relativeMeasureIndex * measureDurationSec) +
                                        ((selectedNote.slotIndex + 3.5) * slotDurationSec);
            const absoluteTime = storedRecordingRange.startTime + noteTimeInRecording;
            handleTimeChange(absoluteTime);
        }
        prevSelectedNoteRef.current = { index: selectedIndex, beat: selectedNote.beat };
    }, [isEditMode, storedRecordingRange, selectedNoteIndices, editedNotes, handleTimeChange, isPlaying]);

    // ============================================
    // Pitch Analysis & Note Grouping
    // ============================================
    // 녹음 데이터 분석 (blob 변경 시 재분석)
    const lastAnalyzedBlobRef = useRef<Blob | null>(null);

    useEffect(() => {
        if (!storedAudioBlob || !storedRecordingRange) return;

        // 같은 blob이면 중복 분석 방지
        if (lastAnalyzedBlobRef.current === storedAudioBlob) return;

        lastAnalyzedBlobRef.current = storedAudioBlob;

        // 녹음 재생용 URL 생성
        const url = URL.createObjectURL(storedAudioBlob);
        setUserAudioUrl(url);

        // 비동기 분석
        const performAnalysis = async () => {
            // prerollDuration 전달: 0이면 지연 보정 생략 (트리밍된 상태)
            const pitchFrames = await analyzeAudio(storedAudioBlob, storedPrerollDuration);
            const beatsPerMeasure = Number(SONG_META.time_signature.split('/')[0]);

            // Self-Refining Test: PitchFrame 데이터 export용 전역 저장
            if (typeof window !== 'undefined') {
                (window as any).__testPitchFrames = pitchFrames;
                (window as any).__testBpm = SONG_META.bpm;

                // ============================================
                // Phase 81: 메타데이터 포함 export (라이브-오프라인 동기화)
                // ============================================
                (window as any).exportTestFrames = () => {
                    // PULLBACK 상수 (useRecorder.ts와 동일)
                    const PULLBACK_BUFFER_MS = 250;
                    const ESTIMATED_STATIC_LATENCY_MS = 250; // 일반적인 하드웨어 지연
                    const TOTAL_PULLBACK_MS = PULLBACK_BUFFER_MS + ESTIMATED_STATIC_LATENCY_MS;

                    // 슬롯 단위 계산 (동적 TIMING_OFFSET용)
                    const slotDurationMs = (60 / SONG_META.bpm / 4) * 1000;
                    const pullbackSlots = Math.round(TOTAL_PULLBACK_MS / slotDurationMs);

                    const data = {
                        // 기존 데이터
                        bpm: SONG_META.bpm,
                        frameCount: pitchFrames.length,
                        frames: pitchFrames,

                        // Phase 81: 메타데이터 추가
                        metadata: {
                            // 녹음 범위 정보
                            recordingRange: storedRecordingRange ? {
                                startMeasure: storedRecordingRange.startMeasure,
                                endMeasure: storedRecordingRange.endMeasure,
                                startTime: storedRecordingRange.startTime,
                                endTime: storedRecordingRange.endTime
                            } : null,

                            // PULLBACK 정보 (오프라인 테스트 동기화용)
                            pullback: {
                                bufferMs: PULLBACK_BUFFER_MS,
                                estimatedStaticLatencyMs: ESTIMATED_STATIC_LATENCY_MS,
                                totalMs: TOTAL_PULLBACK_MS,
                                slots: pullbackSlots,
                                note: 'TIMING_OFFSET_SLOTS를 이 값으로 설정하면 라이브와 동기화됨'
                            },

                            // 분석 정보
                            analysis: {
                                prerollDuration: storedPrerollDuration,
                                slotDurationMs: slotDurationMs,
                                measureDurationMs: measureDuration * 1000
                            },

                            // 곡 정보
                            song: {
                                title: SONG_META.title || 'Unknown',
                                bpm: SONG_META.bpm,
                                timeSignature: SONG_META.time_signature
                            },

                            // export 시점 정보
                            exportedAt: new Date().toISOString(),
                            version: '81' // Phase 81 형식
                        }
                    };

                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'testFrames.json';
                    a.click();
                    URL.revokeObjectURL(url);

                    console.log('[Test Export] testFrames.json 다운로드 완료 (Phase 81 메타데이터 포함)');
                    console.log('[Test Export] 메타데이터:', {
                        startMeasure: storedRecordingRange?.startMeasure,
                        pullbackSlots: pullbackSlots,
                        totalPullbackMs: TOTAL_PULLBACK_MS
                    });
                };
                console.log('[Test Export] window.exportTestFrames() 호출하여 프레임 데이터 저장 가능 (Phase 81: 메타데이터 포함)');
                console.log('[Test Export] window.exportGroundTruth() 호출하여 정답지 저장 가능 (편집 후 사용)');
            }

            // prerollDuration을 마디 수로 변환 (이미 0이면 보정 불필요)
            const prerollMeasures = Math.round(storedPrerollDuration / measureDuration);

            console.log('[Pitch Analysis] prerollDuration 보정:', {
                prerollDuration: storedPrerollDuration.toFixed(3) + 's',
                measureDuration: measureDuration.toFixed(3) + 's',
                prerollMeasures,
                startMeasure: storedRecordingRange.startMeasure
            });

            // 16슬롯 그리드 기반 음표 변환
            const notes = convertToNotes(pitchFrames, SONG_META.bpm);

            // prerollDuration 보정: measureIndex에서 prerollMeasures 빼기
            notes.forEach(note => {
                note.measureIndex = Math.max(0, note.measureIndex - prerollMeasures);
            });

            // 음표+쉼표 모두 포함 (처음부터 쉼표 표시)
            const notesWithRests = notes;
            // 디버그용: 음표만 필터링
            const noteOnly = notes.filter(note => !note.isRest);

            // 디버그: 보정 후 음표들의 measureIndex 분포 확인
            const adjustedMeasureIndices = noteOnly.map(n => n.measureIndex);
            const uniqueAdjustedMeasures = [...new Set(adjustedMeasureIndices)].sort((a, b) => a - b);

            console.log('[Pitch Analysis] preroll 보정 후:', {
                bpm: SONG_META.bpm,
                startMeasure: storedRecordingRange.startMeasure,
                adjustedMeasureRange: uniqueAdjustedMeasures.length > 0
                    ? `${uniqueAdjustedMeasures[0]} ~ ${uniqueAdjustedMeasures[uniqueAdjustedMeasures.length - 1]}`
                    : 'none',
                calculation: `measureIndex - ${prerollMeasures} + startMeasure = finalMeasure`
            });

            // 무음 패딩 없음: measureIndex가 이미 0부터 시작하므로
            // distributeNotesToMeasures에서 startMeasure만 더하면 됨
            // 쉼표 포함하여 전달
            const groupedNotes = distributeNotesToMeasures(notesWithRests, {
                bpm: SONG_META.bpm,
                beatsPerMeasure,
                startMeasure: storedRecordingRange.startMeasure
            });

            // 디버그 로그: 변환 결과
            const finalMeasures = Object.keys(groupedNotes).map(Number).sort((a, b) => a - b);
            const totalRests = notesWithRests.filter(n => n.isRest).length;

            console.log('[Pitch Analysis] 변환 결과:', {
                totalNotes: noteOnly.length,
                totalRests,
                finalMeasureRange: finalMeasures.length > 0
                    ? `${finalMeasures[0]} ~ ${finalMeasures[finalMeasures.length - 1]}`
                    : 'none',
                finalMeasures
            });

            // 첫 3개 음표의 상세 변환 과정
            if (noteOnly.length > 0) {
                const firstThreeNotes = noteOnly.slice(0, 3);
                console.log('[Pitch Analysis] 첫 3개 음표 변환 과정:');
                firstThreeNotes.forEach((note, i) => {
                    const final = note.measureIndex + storedRecordingRange.startMeasure;
                    console.log(`  [${i}] ${note.pitch}: measureIndex=${note.measureIndex} + startMeasure=${storedRecordingRange.startMeasure} = final=${final}`);
                });
            }

            setRecordedNotesByMeasure(groupedNotes);

            // Gap 분석용: 원본 자동 감지 음표 저장 (상대 measureIndex, 쉼표 제외)
            // distributeNotesToMeasures 이전의 noteOnly 사용 (상대 마디 인덱스)
            setRawAutoNotes(noteOnly);

            // ============================================
            // 자동 Gap 분석: 정답 음표 vs 자동 감지 비교
            // ============================================
            console.log('[Auto Gap Analysis] 자동 Gap 분석 시작');
            const comparisons = compareNotes(
                noteOnly,
                GROUND_TRUTH_NOTES,
                storedRecordingRange.startMeasure
            );
            const analysis = analyzeGap(comparisons);
            logGapAnalysis(analysis);
            console.log('[Auto Gap Analysis] 음정 정확도:', analysis.pitchAccuracy.toFixed(1) + '%');

            // 편집 스토어 초기화 - 모든 음표를 flat array로 변환
            const allNotes: NoteData[] = [];
            Object.entries(groupedNotes).forEach(([measureNum, notes]) => {
                notes.forEach(note => {
                    allNotes.push(note);
                });
            });

            initializeNotes(allNotes);

            // 피드백 수집용 세션 메타데이터 설정
            setSessionMeta({
                songId: SONG_META.id,
                bpm: SONG_META.bpm,
                key: SONG_META.key || 'unknown',
                recordingDuration: storedRecordingRange.endTime - storedRecordingRange.startTime
            });

            // Smart Guide: SuggestedRanges 생성
            const ranges = generateSuggestedRanges(pitchFrames, allNotes, SONG_META.bpm);
            setSuggestedRanges(ranges);
            console.log('[Smart Guide] SuggestedRanges 생성:', {
                totalRanges: ranges.length,
                ranges: ranges.map(r => ({
                    measure: r.measureIndex,
                    slots: `${r.startSlot}-${r.endSlot}`,
                    suggestedPitch: r.suggestedPitch
                }))
            });
        };

        performAnalysis();
    }, [storedAudioBlob, storedRecordingRange, analyzeAudio, setRawAutoNotes, initializeNotes, setSessionMeta, setSuggestedRanges]);

    // ============================================
    // Self-Refining Test: exportGroundTruth 함수 등록
    // 편집된 음표를 groundTruth.json 형식으로 내보내기
    // ============================================
    useEffect(() => {
        if (typeof window === 'undefined' || !storedRecordingRange) return;

        (window as any).exportGroundTruth = () => {
            // 현재 editedNotes 가져오기 (store에서 직접)
            const currentEditedNotes = useFeedbackStore.getState().editedNotes;
            const notesOnly = currentEditedNotes.filter((n: NoteData) => !n.isRest);

            if (notesOnly.length === 0) {
                console.error('[Test Export] 편집된 음표가 없습니다. 편집 모드에서 음표를 수정한 후 호출하세요.');
                return;
            }

            // groundTruth.json 형식으로 변환
            const groundTruthNotes = notesOnly.map((note: NoteData) => ({
                measure: note.measureIndex + storedRecordingRange.startMeasure,
                slot: note.slotIndex,
                pitch: note.pitch,
                slots: note.slotCount
            }));

            const data = {
                name: `Recording ${new Date().toISOString().split('T')[0]}`,
                bpm: SONG_META.bpm,
                description: `${notesOnly.length}개 음표, 마디 ${storedRecordingRange.startMeasure}-${storedRecordingRange.endMeasure}`,
                notes: groundTruthNotes
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'groundTruth.json';
            a.click();
            URL.revokeObjectURL(url);
            console.log('[Test Export] groundTruth.json 다운로드 완료:', {
                noteCount: notesOnly.length,
                bpm: SONG_META.bpm,
                measureRange: `${storedRecordingRange.startMeasure}-${storedRecordingRange.endMeasure}`
            });
        };

        return () => {
            if (typeof window !== 'undefined') {
                delete (window as any).exportGroundTruth;
            }
        };
    }, [storedRecordingRange]);

    // 악기 변환 모델 로드 (outputInstrument가 'raw'가 아닐 때)
    // Tone.js 기반 폴백 재생
    useEffect(() => {
        if (storedOutputInstrument === 'raw') {
            resetConversionState();
            return;
        }

        console.log(`🎹 [Feedback] ${storedOutputInstrument} 선택됨 - Tone.js로 재생`);

        let isCancelled = false;

        const loadInstrumentModel = async () => {
            try {
                console.log(`🎹 [Tone.js] ${storedOutputInstrument} 모델 로드 시작`);
                setConversionState({ isConverting: true });

                // Tone.js 모델 로드 + 최소 대기 시간 보장
                const [success] = await Promise.all([
                    voiceToInstrument.loadModel(storedOutputInstrument),
                    new Promise(resolve => setTimeout(resolve, 2500)) // 최소 2.5초 대기
                ]);

                if (isCancelled) return;

                if (success) {
                    // 완료 - 폴백 모드 활성화
                    setConversionState({
                        isConverting: false,
                        isFallbackMode: true
                    });
                    console.log(`🎹 [Tone.js] ${storedOutputInstrument} 모델 로드 완료 - 폴백 모드 활성화`);
                    showToast('success', `${storedOutputInstrument === 'piano' ? '피아노' : '기타'} 모드 준비 완료`);
                } else {
                    setConversionState({
                        isConverting: false,
                        error: '모델 로드 실패',
                        isFallbackMode: false
                    });
                    showToast('error', '악기 모델 로드에 실패했습니다');
                }

            } catch (error) {
                console.error('🎹 [Tone.js] 모델 로드 에러:', error);
                if (!isCancelled) {
                    setConversionState({
                        isConverting: false,
                        error: '에러 발생',
                        isFallbackMode: false
                    });
                    showToast('error', '악기 모델 로드 중 에러가 발생했습니다');
                }
            }
        };

        loadInstrumentModel();

        // cleanup
        return () => {
            isCancelled = true;
        };
    }, [storedOutputInstrument]); // Zustand 함수들과 voiceToInstrument는 안정적인 참조이므로 제외

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

    // Phase 78: 녹음 듣기 모드 토글 (악기 변환 상태에서 원본 녹음 재생)
    const handleToggleRawRecording = useCallback((enabled: boolean) => {
        setRawRecordingMode(enabled);
        if (enabled) {
            // 녹음 듣기 활성화 시 Tone.js 중지
            voiceToInstrument.stopFallbackPlayback();
            console.log('🎤 [녹음 듣기] Tone.js 중지 - 원본 녹음만 재생');
        } else if (isPlaying && storedRecordingRange && editedNotes.length > 0) {
            // 녹음 듣기 해제 시 Tone.js 재시작 (재생 중이고 녹음 범위 내일 때)
            const isInRange = currentTime >= storedRecordingRange.startTime &&
                              currentTime < storedRecordingRange.endTime;
            if (isInRange) {
                const notesOnlyNotes = editedNotes
                    .filter(n => !n.isRest)
                    .map(note => {
                        const relativeMeasureIndex = note.measureIndex - storedRecordingRange.startMeasure;
                        const slotBasedBeat = (relativeMeasureIndex * 4) + (note.slotIndex / 4);
                        return { ...note, beat: slotBasedBeat };
                    });
                const relativeStartTime = currentTime - storedRecordingRange.startTime;
                voiceToInstrument.playNotesAsFallback(notesOnlyNotes, SONG_META.bpm, relativeStartTime);
                console.log('🎹 [녹음 듣기 해제] Tone.js 재시작');
            }
        }
        // JAM 반주는 계속 재생 (음소거 안함)
    }, [voiceToInstrument, isPlaying, storedRecordingRange, editedNotes, currentTime]);

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

            // 편집 모드 키보드 단축키 (Phase 67: 로그 제거)
            if (isEditMode) {
                switch (e.code) {
                    case 'KeyQ':
                        e.preventDefault();
                        {
                            const newIndex = selectPrevNote();
                            if (newIndex !== null && editedNotes[newIndex]) {
                                const note = editedNotes[newIndex];
                                const isFallbackMode = storedOutputInstrument !== 'raw' && conversionState.isFallbackMode;

                                // 미리듣기 (재생 중이 아닐 때만)
                                if (!isPlaying && isFallbackMode && !note.isRest) {
                                    voiceToInstrument.previewNote(note.pitch, 0.3);
                                }

                                // 진행바 이동 (재생 중이 아닐 때만 - Tone.js 재시작 방지)
                                if (!isPlaying && storedRecordingRange) {
                                    // slotIndex 기반으로 정확한 위치 계산
                                    const measureDurationSec = (4 * 60) / SONG_META.bpm;
                                    const slotDurationSec = measureDurationSec / 16;
                                    // measureIndex는 절대 마디 번호 → 상대 인덱스로 변환
                                    const relativeMeasureIndex = note.measureIndex - storedRecordingRange.startMeasure;
                                    // +3.5슬롯 오프셋 보정
                                    const noteTimeInRecording = (relativeMeasureIndex * measureDurationSec) +
                                                                ((note.slotIndex + 3.5) * slotDurationSec);
                                    const absoluteTime = storedRecordingRange.startTime + noteTimeInRecording;
                                    handleTimeChange(absoluteTime);
                                }
                            }
                        }
                        return;
                    case 'KeyW':
                        e.preventDefault();
                        {
                            const newIndex = selectNextNote();
                            if (newIndex !== null && editedNotes[newIndex]) {
                                const note = editedNotes[newIndex];
                                const isFallbackMode = storedOutputInstrument !== 'raw' && conversionState.isFallbackMode;

                                // 미리듣기 (재생 중이 아닐 때만)
                                if (!isPlaying && isFallbackMode && !note.isRest) {
                                    voiceToInstrument.previewNote(note.pitch, 0.3);
                                }

                                // 진행바 이동 (재생 중이 아닐 때만 - Tone.js 재시작 방지)
                                if (!isPlaying && storedRecordingRange) {
                                    // slotIndex 기반으로 정확한 위치 계산
                                    const measureDurationSec = (4 * 60) / SONG_META.bpm;
                                    const slotDurationSec = measureDurationSec / 16;
                                    // measureIndex는 절대 마디 번호 → 상대 인덱스로 변환
                                    const relativeMeasureIndex = note.measureIndex - storedRecordingRange.startMeasure;
                                    // +3.5슬롯 오프셋 보정
                                    const noteTimeInRecording = (relativeMeasureIndex * measureDurationSec) +
                                                                ((note.slotIndex + 3.5) * slotDurationSec);
                                    const absoluteTime = storedRecordingRange.startTime + noteTimeInRecording;
                                    handleTimeChange(absoluteTime);
                                }
                            }
                        }
                        return;
                    case 'ArrowUp':
                        e.preventDefault();
                        // 미리듣기 (폴백 모드일 때만)
                        if (storedOutputInstrument !== 'raw' && conversionState.isFallbackMode && selectedNoteIndices.length > 0) {
                            const firstNote = editedNotes[selectedNoteIndices[0]];
                            if (firstNote && !firstNote.isRest) {
                                const newPitch = shiftPitch(firstNote.pitch, 'up');
                                if (newPitch) {
                                    voiceToInstrument.previewNote(newPitch, 0.3);
                                }
                            }
                        }
                        updateNotePitch('up');
                        return;
                    case 'ArrowDown':
                        e.preventDefault();
                        // 미리듣기 (폴백 모드일 때만)
                        if (storedOutputInstrument !== 'raw' && conversionState.isFallbackMode && selectedNoteIndices.length > 0) {
                            const firstNote = editedNotes[selectedNoteIndices[0]];
                            if (firstNote && !firstNote.isRest) {
                                const newPitch = shiftPitch(firstNote.pitch, 'down');
                                if (newPitch) {
                                    voiceToInstrument.previewNote(newPitch, 0.3);
                                }
                            }
                        }
                        updateNotePitch('down');
                        return;
                    case 'ArrowLeft':
                        e.preventDefault();
                        if (e.shiftKey) {
                            updateSelectedNotesDuration('decrease');
                        } else {
                            updateNotePosition('left');
                        }
                        return;
                    case 'ArrowRight':
                        e.preventDefault();
                        if (e.shiftKey) {
                            updateSelectedNotesDuration('increase');
                        } else {
                            updateNotePosition('right');
                        }
                        return;
                    case 'Delete':
                    case 'Backspace':
                        e.preventDefault();
                        deleteSelectedNotes();
                        return;
                    case 'Escape':
                        e.preventDefault();
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
                    case 'KeyR':
                        e.preventDefault();
                        reset();
                        return;
                    case 'KeyE':
                        e.preventDefault();
                        {
                            const result = addNote();
                            if (!result.success && result.message) {
                                showToast('error', result.message);
                            }
                        }
                        return;
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
                    // raw 모드: 내 녹음만 듣기, 폴백 모드: 악기만 듣기
                    if (storedOutputInstrument === 'raw') {
                        handleToggleMyRecordingOnly(!myRecordingOnlyMode);
                    } else {
                        toggleInstrumentOnlyMode();
                    }
                    break;
                case 'KeyD':
                    e.preventDefault();
                    // 악기 변환 모드에서만 녹음 듣기 토글
                    if (storedOutputInstrument !== 'raw') {
                        handleToggleRawRecording(!rawRecordingMode);
                    }
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
    }, [handlePlayPause, handleSeekByMeasures, handleToggleJamOnly, jamOnlyMode, handleToggleMyRecordingOnly, myRecordingOnlyMode, storedOutputInstrument, toggleInstrumentOnlyMode, instrumentOnlyMode, isEditMode, isPlaying, updateNotePitch, updateNotePosition, updateSelectedNotesDuration, deleteSelectedNotes, clearSelection, undo, redo, reset, addNote, showToast, selectPrevNote, selectNextNote, selectedNoteIndices, editedNotes, conversionState.isFallbackMode, voiceToInstrument, storedRecordingRange, handleTimeChange, handleToggleRawRecording, rawRecordingMode]);
    
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

    // 음표 선택 + 미리듣기 + 진행바 이동 (편집 모드에서만)
    const handleNoteSelect = useCallback((index: number, multiSelect: boolean = false) => {
        // 음표 선택
        storeSelectNote(index, multiSelect);

        const note = editedNotes[index];
        if (!note) return;

        // 편집 모드일 때만 진행바 이동
        if (isEditMode && storedRecordingRange) {
            // beat가 startMeasure보다 큰 경우 절대 beat → 상대 beat로 변환
            // beat가 작은 경우 이미 상대 beat → 그대로 사용
            const startMeasureBeat = storedRecordingRange.startMeasure * 4;
            const relativeBeat = note.beat >= startMeasureBeat
                ? note.beat - startMeasureBeat
                : note.beat;
            const noteTimeInRecording = relativeBeat * (60 / SONG_META.bpm);
            const absoluteTime = storedRecordingRange.startTime + noteTimeInRecording;
            handleTimeChange(absoluteTime);
        }

        // 미리듣기 (폴백 모드일 때만)
        const isFallbackMode = storedOutputInstrument !== 'raw' && conversionState.isFallbackMode;
        if (isFallbackMode && !note.isRest) {
            voiceToInstrument.previewNote(note.pitch, 0.3);
        }
    }, [storeSelectNote, storedOutputInstrument, conversionState.isFallbackMode, editedNotes, voiceToInstrument, isEditMode, storedRecordingRange, handleTimeChange]);

    // 새 음표 추가 핸들러 (충돌 검사 포함)
    const handleAddNote = useCallback(() => {
        const result = addNote();
        if (!result.success && result.message) {
            showToast('error', result.message);
        }
    }, [addNote, showToast]);

    // 편집 확정: 정리된 음표+쉼표를 recordedNotesByMeasure에 반영 + 자동 Export
    const handleConfirmEdit = useCallback(() => {
        // 이미 확정됨
        if (isEditConfirmed) {
            showToast('error', '이미 편집이 확정되었습니다');
            return;
        }

        // 겹침 제거 + 연속 쉼표 병합된 깨끗한 데이터 가져오기
        const cleanedNotes = getCleanedNotes();
        const notesOnly = cleanedNotes.filter((n: NoteData) => !n.isRest);

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
        console.log('[Edit Confirm] notes:', notesOnly.length, 'rests:', cleanedNotes.filter(n => n.isRest).length);

        // ============================================
        // 정확도 계산: 자동 감지 vs 수동 편집 비교
        // ============================================
        if (rawAutoNotes.length > 0 && storedRecordingRange) {
            const comparisons = compareNotes(
                rawAutoNotes,
                cleanedNotes,
                storedRecordingRange.startMeasure
            );
            const analysis = analyzeGap(comparisons);
            logGapAnalysis(analysis);

            // 정확도 상태 업데이트
            const matchedCount = analysis.comparisons.filter(
                c => c.matchType !== 'missed' && c.matchType !== 'extra'
            ).length;
            setAccuracyStats({
                pitch: analysis.pitchAccuracy,
                timing: analysis.timingAccuracy,
                duration: analysis.durationAccuracy,
                overall: (analysis.pitchAccuracy + analysis.timingAccuracy + analysis.durationAccuracy) / 3,
                matched: matchedCount,
                total: analysis.totalManualNotes
            });
        }

        // ============================================
        // 자동 케이스 저장 (API로 서버에 저장)
        // ============================================
        if (typeof window !== 'undefined' && storedRecordingRange) {
            const testPitchFrames = (window as any).__testPitchFrames;

            if (testPitchFrames && notesOnly.length > 0) {
                const testFramesData = {
                    bpm: SONG_META.bpm,
                    frameCount: testPitchFrames.length,
                    frames: testPitchFrames
                };

                const groundTruthNotes = notesOnly.map((note: NoteData) => ({
                    measure: note.measureIndex + storedRecordingRange.startMeasure,
                    slot: note.slotIndex,
                    pitch: note.pitch,
                    slots: note.slotCount
                }));

                const groundTruthData = {
                    name: `Recording ${new Date().toISOString().split('T')[0]}`,
                    bpm: SONG_META.bpm,
                    description: `${notesOnly.length}개 음표, 마디 ${storedRecordingRange.startMeasure}-${storedRecordingRange.endMeasure}`,
                    notes: groundTruthNotes
                };

                // API로 케이스 저장
                fetch('/api/pitch-test', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        testFrames: testFramesData,
                        groundTruth: groundTruthData
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        console.log(`[Auto Save] ${data.caseName} 저장 완료`);
                        showToast('success', `${data.caseName} 저장 완료`);
                        // 케이스 카운트 업데이트
                        setOptimizationState(prev => ({
                            ...prev,
                            caseCount: prev.caseCount + 1,
                            completeCases: prev.completeCases + 1
                        }));
                    } else {
                        console.error('[Auto Save] 저장 실패:', data.error);
                        showToast('error', '케이스 저장 실패 (로컬 개발 환경에서만 동작)');
                    }
                })
                .catch(err => {
                    console.log('[Auto Save] 서버 연결 실패 (로컬 개발 환경에서만 동작)');
                });
            }
        }

        // recordedNotesByMeasure 업데이트
        setRecordedNotesByMeasure(newNotesByMeasure);

        // editedNotes도 업데이트 (재생 시 사용)
        initializeNotes(cleanedNotes);

        // 편집 모드 종료 및 잠금
        setIsEditPanelOpen(false);
        setEditMode(false);
        setIsEditConfirmed(true);  // 편집 잠금

        // 피드백 수집: 편집 데이터 Supabase에 저장
        saveFeedback().then(result => {
            if (result.success) {
                console.log('📊 [Feedback] 편집 피드백 저장 완료');
            } else if (result.error) {
                console.warn('📊 [Feedback] 저장 실패:', result.error);
            }
        });

        showToast('success', '편집이 확정되었습니다 (재편집 불가)');
    }, [getCleanedNotes, rawAutoNotes, storedRecordingRange, initializeNotes, setEditMode, showToast, isEditConfirmed, saveFeedback]);

    // AI 로딩 화면 (M-10: 피드백 로딩 또는 악기 변환 중)
    if (isFeedbackLoading || (conversionState.isConverting && storedOutputInstrument !== 'raw')) {
        // M-11: 악기 변환 중일 때 텍스트 변경
        const isInstrumentConverting = conversionState.isConverting && storedOutputInstrument !== 'raw';

        // 디버깅 로그
        console.log('🔍 [Loading Screen]', {
            isFeedbackLoading,
            'conversionState.isConverting': conversionState.isConverting,
            storedOutputInstrument,
            isInstrumentConverting
        });

        const loadingTitle = isInstrumentConverting
            ? "악기 음색 변환 중입니다…"
            : "AI가 당신의 연주를 조율 중입니다…";
        const loadingSubtitle = isInstrumentConverting
            ? `${storedOutputInstrument === 'piano' ? '피아노' : '기타'} 샘플러를 불러오는 중...`
            : "잠시만 기다려 주세요...";

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
                        <h2 className="text-xl font-bold text-white mb-2">{loadingTitle}</h2>
                        <p className="text-gray-400 text-sm">{loadingSubtitle}</p>
                    </div>

                    {/* 무한 로딩 바 (악기 변환 중일 때만) */}
                    {isInstrumentConverting && (
                        <div className="w-64">
                            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full w-1/3 bg-[#7BA7FF] animate-indeterminate" />
                            </div>
                        </div>
                    )}

                    {/* 분석 중 표시 (AI 피드백 로딩 중일 때만) */}
                    {!isInstrumentConverting && (
                        <div className="flex items-center gap-2 text-[#7BA7FF] text-sm">
                            <span className="animate-pulse">♪</span>
                            <span>리듬 분석 중</span>
                            <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>♪</span>
                            <span>음정 확인 중</span>
                            <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>♪</span>
                        </div>
                    )}
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
                                <h1 className="text-2xl font-bold leading-none">{SONG_META.title}</h1>
                                <span className="text-sm text-gray-400">{SONG_META.artist}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {webAudio.isLoading && <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />로딩 중...</div>}

                            {/* 악기 변환 로딩 & 무한 로딩 바 */}
                            {conversionState.isConverting && (
                                <div className="flex flex-col gap-1 min-w-[200px]">
                                    <div className="flex items-center gap-2 text-xs text-[#7BA7FF]">
                                        <div className="w-3 h-3 border-2 border-[#7BA7FF] border-t-transparent rounded-full animate-spin" />
                                        악기 음색 변환 중...
                                    </div>
                                    {/* 무한 로딩 바 */}
                                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full w-1/3 bg-[#7BA7FF] animate-indeterminate" />
                                    </div>
                                </div>
                            )}

                            {/* 변환 완료 후 폴백 모드 표시 */}
                            {!conversionState.isConverting && conversionState.isFallbackMode && storedOutputInstrument !== 'raw' && (
                                <div className="flex items-center gap-2 text-xs text-[#FFD166]">
                                    <span>🎹</span>
                                    {storedOutputInstrument === 'piano' ? '피아노' : '기타'} 모드
                                </div>
                            )}
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
                            sections={songSections}
                            currentSectionIndex={currentSectionIndex}
                            currentMeasure={currentMeasureInSection}
                            measureProgress={measureProgress}
                            selectedMeasures={selectedMeasures}
                            onSelectionChange={handleSelectionChange}
                            onMeasureClick={handleMeasureClick}
                            recordedMeasures={recordedMeasures}
                            recordedNotes={recordedNotesByMeasure}
                            isEditMode={isEditMode}
                            onNoteSelect={handleNoteSelect}
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
                            onPrevNote={selectPrevNote}
                            onNextNote={selectNextNote}
                            onAddNote={handleAddNote}
                            canUndo={undoStack.length > 0}
                            canRedo={redoStack.length > 0}
                            currentNoteIndex={currentNoteInfo.index}
                            totalNotes={currentNoteInfo.total}
                        />
                    ) : (
                        /* 평가 카드 + 정확도 표시 */
                        <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3">
                            {/* 상단: 점수 + 편집 버튼 */}
                            <div className="flex items-center justify-between">
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
                                        if (isEditConfirmed) {
                                            showToast('error', '이미 편집이 확정되었습니다');
                                            return;
                                        }
                                        if (storedOutputInstrument === 'raw') {
                                            showToast('info', '악기 변환을 선택해야 편집 가능합니다');
                                            return;
                                        }
                                        setIsEditPanelOpen(true);
                                        setEditMode(true);
                                    }}
                                    className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors relative group ${
                                        isEditConfirmed
                                            ? 'bg-green-500/20 border border-green-500 text-green-400 cursor-not-allowed'
                                            : storedOutputInstrument === 'raw'
                                            ? 'bg-white/5 text-white/30 cursor-not-allowed'
                                            : 'hover:bg-white/10 text-gray-400 hover:text-white'
                                    }`}
                                    disabled={storedOutputInstrument === 'raw' || isEditConfirmed}
                                >
                                    <span className="text-sm">{isEditConfirmed ? '편집 완료' : '편집모드'}</span>
                                    {!isEditConfirmed && <ChevronRight size={16} />}
                                    {storedOutputInstrument === 'raw' && !isEditConfirmed && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block px-2 py-1 rounded bg-[#1B1C26] border border-white/20 text-white/70 text-xs whitespace-nowrap">
                                            악기 변환을 선택해야 편집 가능합니다
                                        </div>
                                    )}
                                </button>
                            </div>

                            {/* 하단: 정확도 표시 (편집 확정 후) */}
                            {accuracyStats && (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-gray-500 uppercase tracking-wide">AI 분석 정확도</span>
                                        <span className="text-xs text-gray-400">
                                            {accuracyStats.matched}/{accuracyStats.total} 음표 매칭
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-4 gap-3">
                                        {/* 음정 */}
                                        <div className="text-center p-2 rounded-lg bg-white/5">
                                            <p className="text-xs text-gray-400 mb-1">음정</p>
                                            <p className={`text-lg font-bold ${
                                                accuracyStats.pitch >= 80 ? 'text-green-400' :
                                                accuracyStats.pitch >= 60 ? 'text-yellow-400' : 'text-red-400'
                                            }`}>
                                                {accuracyStats.pitch.toFixed(1)}%
                                            </p>
                                        </div>
                                        {/* 타이밍 */}
                                        <div className="text-center p-2 rounded-lg bg-white/5">
                                            <p className="text-xs text-gray-400 mb-1">타이밍</p>
                                            <p className={`text-lg font-bold ${
                                                accuracyStats.timing >= 80 ? 'text-green-400' :
                                                accuracyStats.timing >= 60 ? 'text-yellow-400' : 'text-red-400'
                                            }`}>
                                                {accuracyStats.timing.toFixed(1)}%
                                            </p>
                                        </div>
                                        {/* 길이 */}
                                        <div className="text-center p-2 rounded-lg bg-white/5">
                                            <p className="text-xs text-gray-400 mb-1">길이</p>
                                            <p className={`text-lg font-bold ${
                                                accuracyStats.duration >= 80 ? 'text-green-400' :
                                                accuracyStats.duration >= 60 ? 'text-yellow-400' : 'text-red-400'
                                            }`}>
                                                {accuracyStats.duration.toFixed(1)}%
                                            </p>
                                        </div>
                                        {/* 종합 + 최적화 버튼 */}
                                        <div className="text-center p-2 rounded-lg bg-gradient-to-br from-[#7BA7FF]/20 to-[#FF7B7B]/20 border border-white/10 relative">
                                            <p className="text-xs text-gray-300 mb-1">종합</p>
                                            <div className="flex items-center justify-center gap-2">
                                                <p className={`text-xl font-bold ${
                                                    accuracyStats.overall >= 80 ? 'text-green-400' :
                                                    accuracyStats.overall >= 60 ? 'text-yellow-400' : 'text-red-400'
                                                }`}>
                                                    {accuracyStats.overall.toFixed(1)}%
                                                </p>
                                                {/* 최적화 버튼 */}
                                                <div className="relative group">
                                                    <button
                                                        onClick={() => runOptimization('auto')}
                                                        disabled={optimizationState.isRunning || optimizationState.completeCases === 0}
                                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                                                            optimizationState.isRunning
                                                                ? 'bg-purple-500 animate-pulse'
                                                                : optimizationState.completeCases === 0
                                                                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                                                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                                                        }`}
                                                        title="자동 최적화"
                                                    >
                                                        {optimizationState.isRunning ? '⟳' : '⚡'}
                                                    </button>
                                                    {/* 호버 패널 */}
                                                    <div className="absolute right-0 top-full mt-2 hidden group-hover:block w-64 p-3 rounded-lg bg-[#1B1C26] border border-white/20 text-left z-50 shadow-xl">
                                                        <p className="text-xs text-gray-400 mb-2">파라미터 최적화</p>
                                                        <p className="text-sm text-white mb-2">
                                                            {optimizationState.completeCases}/{optimizationState.caseCount} 케이스 준비됨
                                                        </p>
                                                        {optimizationState.result && (
                                                            <div className="p-2 rounded bg-green-500/10 border border-green-500/20 mb-2">
                                                                <p className="text-xs text-green-400 whitespace-pre-wrap">{optimizationState.result}</p>
                                                            </div>
                                                        )}
                                                        {optimizationState.error && (
                                                            <div className="p-2 rounded bg-red-500/10 border border-red-500/20 mb-2">
                                                                <p className="text-xs text-red-400">{optimizationState.error}</p>
                                                            </div>
                                                        )}
                                                        {optimizationState.caseCount === 0 && (
                                                            <p className="text-xs text-gray-500">
                                                                편집 확정 후 케이스가 자동 저장됩니다
                                                            </p>
                                                        )}
                                                        {optimizationState.completeCases > 0 && !optimizationState.isRunning && (
                                                            <p className="text-xs text-purple-400 mt-1">
                                                                클릭하여 자동 최적화 실행
                                                            </p>
                                                        )}
                                                        {optimizationState.isRunning && (
                                                            <p className="text-xs text-purple-400 animate-pulse">
                                                                최적화 실행 중...
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
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
                            {/* 좌측: 녹음/악기만 듣기 Toggle (모드에 따라 선택) */}
                            <div className="flex items-center gap-2">
                                {storedOutputInstrument === 'raw' ? (
                                    /* 원본 모드: 내 녹음만 듣기 */
                                    <button
                                        type="button"
                                        onClick={() => handleToggleMyRecordingOnly(!myRecordingOnlyMode)}
                                        className={`relative flex flex-col items-center px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-w-[90px] ${
                                            myRecordingOnlyMode ? 'bg-[#FF7B7B]/20 border border-[#FF7B7B] text-[#FF7B7B]' : 'border border-gray-600 text-gray-300 hover:bg-white/10'
                                        }`}
                                        title="내 녹음만 듣기 (S)"
                                    >
                                        내 녹음만 듣기
                                        <span className="absolute -bottom-5 text-xs font-medium text-[#9B9B9B]">S</span>
                                    </button>
                                ) : (
                                    /* 폴백 모드: 악기만 듣기 + 녹음 듣기 버튼 */
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => toggleInstrumentOnlyMode()}
                                            className={`relative flex flex-col items-center px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-w-[90px] ${
                                                instrumentOnlyMode ? 'bg-[#FFD166]/20 border border-[#FFD166] text-[#FFD166]' : 'border border-gray-600 text-gray-300 hover:bg-white/10'
                                            }`}
                                            title="악기만 듣기 (S)"
                                        >
                                            악기만 듣기
                                            <span className="absolute -bottom-5 text-xs font-medium text-[#9B9B9B]">S</span>
                                        </button>
                                        {/* Phase 78: 녹음 듣기 버튼 (악기 변환 모드에서 원본 재생) */}
                                        <button
                                            type="button"
                                            onClick={() => handleToggleRawRecording(!rawRecordingMode)}
                                            className={`relative flex flex-col items-center px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap min-w-[90px] ${
                                                rawRecordingMode ? 'bg-[#FF7B7B]/20 border border-[#FF7B7B] text-[#FF7B7B]' : 'border border-gray-600 text-gray-300 hover:bg-white/10'
                                            }`}
                                            title="녹음 듣기 (D)"
                                        >
                                            녹음 듣기
                                            <span className="absolute -bottom-5 text-xs font-medium text-[#9B9B9B]">D</span>
                                        </button>
                                    </>
                                )}
                            </div>

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