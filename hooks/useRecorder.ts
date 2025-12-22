'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { getSharedAudioContext } from '@/utils/sharedAudioContext';

// ============================================
// Types
// ============================================
export type RecordingState = 'idle' | 'recording' | 'recorded';
export type PermissionState = 'prompt' | 'granted' | 'denied';

export interface RecordingSegment {
    id: string;
    blob: Blob;
    url: string;
    startTime: number;
    endTime: number;
    startMeasure: number;
    endMeasure: number;
    prerollDuration: number; // blob 앞부분 건너뛸 시간 (초)
}

export interface UseRecorderOptions {
    onError?: (error: string) => void;
    onStateChange?: (state: RecordingState) => void;
}

export interface UseRecorderReturn {
    state: RecordingState;
    permissionState: PermissionState;
    segments: RecordingSegment[];
    recordedMeasures: number[];
    isProcessing: boolean;
    isPaused: boolean;
    error: string | null;
    // For save - combined blob of all segments
    audioBlob: Blob | null;
    recordingRange: { startTime: number; endTime: number; startMeasure: number; endMeasure: number } | null;
    requestPermission: () => Promise<boolean>;
    prepareRecording: () => Promise<boolean>; // MediaRecorder 미리 시작 (preroll)
    startRecording: (startTime: number, startMeasure: number) => Promise<boolean>;
    stopRecording: (endTime: number, endMeasure: number) => Promise<void>;
    pauseJamming: () => void;
    resumeJamming: () => void;
    playRecordingsAtTime: (fromTime: number) => Promise<void>;
    pauseRecordings: () => void;
    resetRecording: () => void;
    hasRecordingAt: (time: number) => boolean;
    getOverlappingSegment: (startMeasure: number, endMeasure: number) => RecordingSegment | null;
}

// ============================================
// Helper: Get supported MIME type
// ============================================
function getSupportedMimeType(): string {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg'
    ];

    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }

    return 'audio/webm';
}

// ============================================
// Helper: Add silence padding to audio
// ============================================
async function addSilencePadding(
    audioBlob: Blob,
    silenceDuration: number
): Promise<Blob> {
    const audioContext = getSharedAudioContext();

    try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const recordedBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const sampleRate = recordedBuffer.sampleRate;
        const silenceSamples = Math.floor(silenceDuration * sampleRate);
        const totalSamples = silenceSamples + recordedBuffer.length;
        const numberOfChannels = recordedBuffer.numberOfChannels;

        const offlineContext = new OfflineAudioContext(
            numberOfChannels,
            totalSamples,
            sampleRate
        );

        const combinedBuffer = offlineContext.createBuffer(
            numberOfChannels,
            totalSamples,
            sampleRate
        );

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const combinedData = combinedBuffer.getChannelData(channel);
            const recordedData = recordedBuffer.getChannelData(channel);

            for (let i = 0; i < recordedBuffer.length; i++) {
                combinedData[silenceSamples + i] = recordedData[i];
            }
        }

        const source = offlineContext.createBufferSource();
        source.buffer = combinedBuffer;
        source.connect(offlineContext.destination);
        source.start();

        const renderedBuffer = await offlineContext.startRendering();
        const wavBlob = audioBufferToWavBlob(renderedBuffer);

        return wavBlob;
    } finally {
        // 공유 AudioContext는 닫지 않음
    }
}

// ============================================
// Helper: Convert AudioBuffer to WAV Blob
// ============================================
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

    writeString(0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    const channelData: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
        channelData.push(buffer.getChannelData(i));
    }

    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// ============================================
// Main Hook
// ============================================
export function useRecorder(options: UseRecorderOptions = {}): UseRecorderReturn {
    const { onError, onStateChange } = options;

    // State
    const [state, setState] = useState<RecordingState>('idle');
    const [permissionState, setPermissionState] = useState<PermissionState>('prompt');
    const [segments, setSegments] = useState<RecordingSegment[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const pendingRangeRef = useRef<{ startTime: number; startMeasure: number } | null>(null);
    const recordingActualStartRef = useRef<number>(0); // 실제 녹음 시작 시점 (performance.now)
    const mediaRecorderStartRef = useRef<number>(0); // MediaRecorder.start() 호출 시점
    const prerollDurationRef = useRef<number>(0); // preroll 시간 (초)
    const actualRecordingDurationRef = useRef<number>(0); // 실제 녹음 시간 (초, wall-clock)
    const firstChunkTimeRef = useRef<number>(0); // 첫 번째 chunk 도착 시점
    const chunkCountRef = useRef<number>(0); // chunk 카운트

    // Web Audio API 기반 재생 (정확한 타이밍 동기화)
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
    const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
    const gainNodeRef = useRef<GainNode | null>(null);

    // Computed: recorded measures from all segments
    const recordedMeasures = segments.flatMap(seg => {
        const measures: number[] = [];
        for (let m = seg.startMeasure; m <= seg.endMeasure; m++) {
            measures.push(m);
        }
        return measures;
    }).filter((m, i, arr) => arr.indexOf(m) === i); // unique

    // Computed: combined blob for save (first segment for now, can be extended)
    const audioBlob = segments.length > 0 ? segments[0].blob : null;
    const recordingRange = segments.length > 0 ? {
        startTime: Math.min(...segments.map(s => s.startTime)),
        endTime: Math.max(...segments.map(s => s.endTime)),
        startMeasure: Math.min(...segments.map(s => s.startMeasure)),
        endMeasure: Math.max(...segments.map(s => s.endMeasure))
    } : null;

    // State change callback
    useEffect(() => {
        onStateChange?.(state);
    }, [state, onStateChange]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            segments.forEach(seg => URL.revokeObjectURL(seg.url));
            // Web Audio API 정리
            sourceNodesRef.current.forEach(source => {
                try {
                    source.stop();
                    source.disconnect();
                } catch {
                    // 이미 정지됨
                }
            });
            sourceNodesRef.current.clear();
            audioBuffersRef.current.clear();
            // 공유 AudioContext는 닫지 않음 - ref만 초기화
            audioContextRef.current = null;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []); // eslint-disable-line react-hooks-exhaustive-deps

    // ========================================
    // Check/Request Permission
    // ========================================
    const requestPermission = useCallback(async (): Promise<boolean> => {
        try {
            if (typeof MediaRecorder === 'undefined') {
                const msg = '이 브라우저는 녹음을 지원하지 않습니다';
                setError(msg);
                onError?.(msg);
                return false;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            setPermissionState('granted');
            setError(null);
            return true;
        } catch (err) {
            console.error('Permission denied:', err);
            setPermissionState('denied');
            const msg = '마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요';
            setError(msg);
            onError?.(msg);
            return false;
        }
    }, [onError]);

    // ========================================
    // Get overlapping segment
    // ========================================
    const getOverlappingSegment = useCallback((startMeasure: number, endMeasure: number): RecordingSegment | null => {
        return segments.find(seg => {
            // Check if ranges overlap
            return !(endMeasure < seg.startMeasure || startMeasure > seg.endMeasure);
        }) || null;
    }, [segments]);

    // ========================================
    // Has recording at time
    // ========================================
    const hasRecordingAt = useCallback((time: number): boolean => {
        return segments.some(seg => time >= seg.startTime && time <= seg.endTime);
    }, [segments]);

    // ========================================
    // Prepare Recording (Preroll - MediaRecorder 미리 시작)
    // 카운트다운 전에 호출하여 MediaRecorder 초기화 지연 해소
    // ========================================
    const prepareRecording = useCallback(async (): Promise<boolean> => {
        if (permissionState !== 'granted') {
            const granted = await requestPermission();
            if (!granted) return false;
        }

        if (!streamRef.current) {
            const granted = await requestPermission();
            if (!granted) return false;
        }

        // 이미 녹음 중이면 스킵
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            console.log('🎤 MediaRecorder already running');
            return true;
        }

        try {
            chunksRef.current = [];

            const mimeType = getSupportedMimeType();
            console.log('🎤 [Preroll] Preparing MediaRecorder with MIME type:', mimeType);

            const mediaRecorder = new MediaRecorder(streamRef.current!, { mimeType });
            mediaRecorderRef.current = mediaRecorder;

            // chunk 카운터 초기화
            chunkCountRef.current = 0;
            firstChunkTimeRef.current = 0;

            mediaRecorder.ondataavailable = (event) => {
                const now = performance.now();
                chunkCountRef.current++;

                if (event.data.size > 0) {
                    // 첫 번째 유효 chunk 시점 기록
                    if (firstChunkTimeRef.current === 0) {
                        firstChunkTimeRef.current = now;
                        console.log('🎤 [Chunk] 첫 번째 chunk 도착:', {
                            시점: now.toFixed(0) + 'ms',
                            MediaRecorder시작후: ((now - mediaRecorderStartRef.current) / 1000).toFixed(3) + 's',
                            size: event.data.size
                        });
                    }

                    // 처음 5개 chunk만 로깅
                    if (chunkCountRef.current <= 5) {
                        console.log(`🎤 [Chunk ${chunkCountRef.current}] size=${event.data.size}, elapsed=${((now - mediaRecorderStartRef.current) / 1000).toFixed(2)}s`);
                    }

                    chunksRef.current.push(event.data);
                }
            };

            // MediaRecorder 시작 시점 기록 (preroll 계산용)
            mediaRecorderStartRef.current = performance.now();
            prerollDurationRef.current = 0; // 아직 실제 시작 전

            mediaRecorder.start(100);
            setState('recording');
            setError(null);

            console.log('🎤 [Preroll] MediaRecorder.start() 호출:', {
                timestamp: mediaRecorderStartRef.current.toFixed(0) + 'ms',
                timeslice: '100ms'
            });
            return true;
        } catch (err) {
            console.error('Prepare recording error:', err);
            const msg = '녹음 준비에 실패했습니다';
            setError(msg);
            onError?.(msg);
            return false;
        }
    }, [permissionState, requestPermission, onError]);

    // ========================================
    // Start Recording (실제 녹음 시작 마킹)
    // prepareRecording 후 카운트다운 완료 시 호출
    // ========================================
    const startRecording = useCallback(async (
        startTime: number,
        startMeasure: number
    ): Promise<boolean> => {
        // MediaRecorder가 이미 준비되어 있으면 (prepareRecording 호출됨)
        // 실제 녹음 시작 시점만 마킹
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            const now = performance.now();
            prerollDurationRef.current = (now - mediaRecorderStartRef.current) / 1000; // ms → s
            recordingActualStartRef.current = now;
            pendingRangeRef.current = { startTime, startMeasure };

            // 첫 chunk 도착 시점과 비교
            const firstChunkDelay = firstChunkTimeRef.current > 0
                ? ((firstChunkTimeRef.current - mediaRecorderStartRef.current) / 1000).toFixed(3) + 's'
                : '아직 없음';
            const chunksReceived = chunkCountRef.current;

            console.log('🎤 [Actual Start] ⚠️ 타이밍 분석:', {
                prepareRecording호출후: prerollDurationRef.current.toFixed(3) + 's',
                첫ChunkDelay: firstChunkDelay,
                받은Chunks: chunksReceived,
                targetMeasure: startMeasure,
                경고: chunksReceived < 10 ? '⚠️ chunk가 적음 - MediaRecorder 지연 가능성' : 'OK'
            });
            return true;
        }

        // prepareRecording이 호출되지 않은 경우 (기존 로직)
        if (permissionState !== 'granted') {
            const granted = await requestPermission();
            if (!granted) return false;
        }

        if (!streamRef.current) {
            const granted = await requestPermission();
            if (!granted) return false;
        }

        try {
            chunksRef.current = [];

            const mimeType = getSupportedMimeType();
            console.log('🎤 Recording with MIME type:', mimeType);

            const mediaRecorder = new MediaRecorder(streamRef.current!, { mimeType });
            mediaRecorderRef.current = mediaRecorder;

            pendingRangeRef.current = { startTime, startMeasure };

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            // 실제 녹음 시작 시점 기록 (동기화 디버깅용)
            const startTimestamp = performance.now();
            recordingActualStartRef.current = startTimestamp;
            mediaRecorderStartRef.current = startTimestamp;
            prerollDurationRef.current = 0; // preroll 없음

            mediaRecorder.start(100);
            setState('recording');
            setError(null);

            console.log('🎤 Recording started (no preroll):', {
                targetTime: startTime,
                measure: startMeasure,
                actualTimestamp: startTimestamp,
                hint: '동기화 테스트: 메트로놈에 맞춰 손뼉을 치고, 재생 시 메트로놈과 손뼉이 일치하는지 확인'
            });
            return true;
        } catch (err) {
            console.error('Start recording error:', err);
            const msg = '녹음을 시작할 수 없습니다';
            setError(msg);
            onError?.(msg);
            return false;
        }
    }, [permissionState, requestPermission, onError]);

    // ========================================
    // Stop Recording
    // ========================================
    const stopRecording = useCallback(async (
        endTime: number,
        endMeasure: number
    ): Promise<void> => {
        if (!mediaRecorderRef.current || state !== 'recording') {
            return;
        }

        return new Promise((resolve) => {
            const mediaRecorder = mediaRecorderRef.current!;

            mediaRecorder.onstop = async () => {
                console.log('🎤 Recording stopped, processing...');
                setIsProcessing(true);

                try {
                    const rawBlob = new Blob(chunksRef.current, {
                        type: mediaRecorder.mimeType
                    });

                    const startTime = pendingRangeRef.current?.startTime || 0;
                    const startMeasure = pendingRangeRef.current?.startMeasure || 1;

                    // 녹음 시작 지연 보정 (MediaRecorder 초기화 + 버퍼링 지연)
                    // 이 값을 조절하여 동기화를 맞춤:
                    // - 재생 시 녹음이 빠르게 들리면: 값을 줄임 (silence padding 증가)
                    // - 재생 시 녹음이 늦게 들리면: 값을 늘림 (silence padding 감소)
                    // 테스트: 메트로놈에 맞춰 손뼉 녹음 후, 재생 시 메트로놈과 비교
                    const RECORDING_LATENCY_COMPENSATION = 0.12; // 녹음이 늦게 재생되어 보정
                    const adjustedStartTime = Math.max(0, startTime - RECORDING_LATENCY_COMPENSATION);

                    // 실제 녹음 시간과 예상 시간 비교 (디버깅용)
                    const recordingDuration = performance.now() - recordingActualStartRef.current;
                    const expectedDuration = (endTime - startTime) * 1000; // ms

                    // 실제 녹음 시간 저장 (decodeAudioBuffer에서 사용)
                    actualRecordingDurationRef.current = recordingDuration / 1000; // ms → s

                    console.log('🎤 Recording sync debug:', {
                        expectedDuration: `${expectedDuration.toFixed(0)}ms`,
                        actualDuration: `${recordingDuration.toFixed(0)}ms`,
                        difference: `${(recordingDuration - expectedDuration).toFixed(0)}ms`,
                        latencyCompensation: `${RECORDING_LATENCY_COMPENSATION * 1000}ms`,
                        adjustedStartTime: `${adjustedStartTime.toFixed(3)}s`,
                        note: '무음 패딩 제거됨 - 순수 녹음 데이터만 저장'
                    });
                    // 무음 패딩 제거: 순수 녹음 데이터만 저장
                    // 재생 시 startTime 오프셋을 사용하여 동기화
                    const url = URL.createObjectURL(rawBlob);
                    const segmentId = `seg-${Date.now()}`;

                    const newSegment: RecordingSegment = {
                        id: segmentId,
                        blob: rawBlob,  // 무음 패딩 없이 순수 녹음 데이터
                        url,
                        startTime,
                        endTime,
                        startMeasure,
                        endMeasure,
                        prerollDuration: prerollDurationRef.current // blob 앞부분 건너뛸 시간
                    };

                    // 먼저 세그먼트를 추가 (이후 트리밍에서 업데이트됨)
                    setSegments(prev => {
                        const result: RecordingSegment[] = [];

                        for (const seg of prev) {
                            const overlaps = !(endMeasure < seg.startMeasure || startMeasure > seg.endMeasure);

                            if (!overlaps) {
                                result.push(seg);
                            } else {
                                if (seg.startMeasure < startMeasure) {
                                    const trimmedSeg: RecordingSegment = {
                                        ...seg,
                                        endMeasure: startMeasure - 1,
                                        endTime: startTime
                                    };
                                    console.log('🎤 Trimming segment', seg.id, 'from', seg.startMeasure, '-', seg.endMeasure, 'to', trimmedSeg.startMeasure, '-', trimmedSeg.endMeasure);
                                    result.push(trimmedSeg);
                                } else if (seg.endMeasure > endMeasure) {
                                    const trimmedSeg: RecordingSegment = {
                                        ...seg,
                                        startMeasure: endMeasure + 1,
                                        startTime: endTime
                                    };
                                    console.log('🎤 Trimming segment', seg.id, 'from', seg.startMeasure, '-', seg.endMeasure, 'to', trimmedSeg.startMeasure, '-', trimmedSeg.endMeasure);
                                    result.push(trimmedSeg);
                                } else {
                                    console.log('🎤 Removing completely overlapped segment', seg.id);
                                    URL.revokeObjectURL(seg.url);
                                    const source = sourceNodesRef.current.get(seg.id);
                                    if (source) {
                                        try {
                                            source.stop();
                                            source.disconnect();
                                        } catch { /* 이미 정지됨 */ }
                                        sourceNodesRef.current.delete(seg.id);
                                    }
                                    audioBuffersRef.current.delete(seg.id);
                                }
                            }
                        }

                        return [...result, newSegment];
                    });

                    // Web Audio API: Blob을 AudioBuffer로 디코딩 및 트리밍
                    // await하여 트리밍이 완료된 후 'recorded' 상태로 전환
                    // 트리밍 결과를 저장할 변수
                    let finalBlobSize = rawBlob.size;
                    let finalPrerollDuration = prerollDurationRef.current;

                    await (async () => {
                        try {
                            // AudioContext 생성 (없으면)
                            if (!audioContextRef.current) {
                                audioContextRef.current = getSharedAudioContext();
                                gainNodeRef.current = audioContextRef.current.createGain();
                                gainNodeRef.current.connect(audioContextRef.current.destination);
                            }

                            const arrayBuffer = await rawBlob.arrayBuffer();
                            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                            audioBuffersRef.current.set(segmentId, audioBuffer);

                            // preroll 계산: blob 길이 - 실제 녹음 시간
                            const blobDuration = audioBuffer.duration;
                            const actualRecordingDuration = actualRecordingDurationRef.current;

                            // ========================================
                            // 트리밍 기준: 카운트다운 시간 (prepareRecording → startRecording)
                            // ========================================
                            // 이전 방식: blobDuration - actualRecordingDuration + 0.2s (불안정, RMS 의존)
                            // 새 방식: prerollDurationRef.current 직접 사용 (카운트다운 시간)
                            //
                            // 결과:
                            // - 트리밍 후 blob 0초 = 녹음 시작 마디의 0박
                            // - 사용자가 늦게 시작하면 → 앞부분이 쉼표로 표시됨
                            // - 의도적인 쉼표가 보존됨 (일관된 결과)
                            const prerollToTrim = prerollDurationRef.current;

                            // 디버깅용: 이전 방식과 비교
                            const oldBasePreroll = Math.max(0, blobDuration - actualRecordingDuration);
                            const oldPrerollToTrim = oldBasePreroll + 0.2;

                            // 첫 chunk delay 정보 추가
                    const firstChunkDelay = firstChunkTimeRef.current > 0
                        ? (firstChunkTimeRef.current - mediaRecorderStartRef.current) / 1000
                        : 0;

                    console.log('🎤 [TIMING DEBUG] 트리밍 분석:', {
                        'blob_duration': blobDuration.toFixed(2) + 's',
                        'actual_recording_duration': actualRecordingDuration.toFixed(2) + 's',
                        '카운트다운_시간(새방식)': prerollToTrim.toFixed(3) + 's',
                        '계산값(이전방식)': oldPrerollToTrim.toFixed(3) + 's',
                        '차이': (prerollToTrim - oldPrerollToTrim).toFixed(3) + 's',
                        '첫_chunk_delay': firstChunkDelay.toFixed(3) + 's'
                    });

                    // 문제 진단
                    if (firstChunkDelay > 0.5) {
                        console.warn('🎤 ⚠️ 첫 chunk delay가 500ms 이상! MediaRecorder 초기화 지연');
                    }
                    if (blobDuration > actualRecordingDuration + 1) {
                        console.warn('🎤 ⚠️ blob이 예상보다 ' + (blobDuration - actualRecordingDuration).toFixed(2) + 's 김 - 추가 무음 포함 가능');
                    }

                    // 오디오 버퍼 앞부분 RMS 분석 (무음 구간 찾기)
                    const channelData = audioBuffer.getChannelData(0);
                    const sampleRateForAnalysis = audioBuffer.sampleRate;
                    const analyzeSeconds = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 0~8초 분석
                    const rmsResults: string[] = [];

                    for (const sec of analyzeSeconds) {
                        if (sec >= blobDuration) break;
                        const startSample = Math.floor(sec * sampleRateForAnalysis);
                        const endSample = Math.min(startSample + sampleRateForAnalysis, channelData.length);
                        let sumSquares = 0;
                        for (let i = startSample; i < endSample; i++) {
                            sumSquares += channelData[i] * channelData[i];
                        }
                        const rms = Math.sqrt(sumSquares / (endSample - startSample));
                        const status = rms < 0.005 ? '🔇무음' : rms < 0.02 ? '🔈약함' : '🔊정상';
                        rmsResults.push(`${sec}s:${rms.toFixed(4)}${status}`);
                    }
                    console.log('🎤 [AUDIO RMS] 초별 RMS 분석 (트리밍 전):', rmsResults.join(' | '));

                            // preroll 부분을 잘라낸 새 AudioBuffer 생성
                            console.log('🎤 [TRIM CHECK] prerollToTrim:', prerollToTrim.toFixed(3) + 's',
                                prerollToTrim > 0.1 ? '→ 트리밍 실행' : '→ ⚠️ 트리밍 스킵 (0.1s 이하)');

                            // 경고: preroll이 비정상적으로 짧으면 prepareRecording 호출 누락 가능성
                            if (prerollToTrim < 1.0 && prerollToTrim > 0) {
                                console.warn('🎤 ⚠️ prerollToTrim이 1초 미만! prepareRecording 호출 여부 확인 필요');
                            }

                            if (prerollToTrim > 0.1) {
                                const sampleRate = audioBuffer.sampleRate;
                                const trimSamples = Math.floor(prerollToTrim * sampleRate);
                                const newLength = audioBuffer.length - trimSamples;

                                if (newLength > 0) {
                                    // OfflineAudioContext로 트리밍된 버퍼 생성
                                    const offlineCtx = new OfflineAudioContext(
                                        audioBuffer.numberOfChannels,
                                        newLength,
                                        sampleRate
                                    );

                                    const source = offlineCtx.createBufferSource();
                                    source.buffer = audioBuffer;
                                    source.connect(offlineCtx.destination);
                                    source.start(0, prerollToTrim); // preroll 이후부터 시작

                                    const trimmedBuffer = await offlineCtx.startRendering();

                                    // 트리밍된 버퍼로 교체
                                    audioBuffersRef.current.set(segmentId, trimmedBuffer);

                                    // 트리밍된 AudioBuffer를 Blob으로 변환
                                    const trimmedBlob = audioBufferToWavBlob(trimmedBuffer);
                                    const trimmedUrl = URL.createObjectURL(trimmedBlob);

                                    // 최종 값 업데이트
                                    finalBlobSize = trimmedBlob.size;
                                    finalPrerollDuration = 0;

                                    console.log('🎤 트리밍 완료:', {
                                        originalDuration: blobDuration.toFixed(2) + 's',
                                        trimmedDuration: trimmedBuffer.duration.toFixed(2) + 's',
                                        removedPreroll: prerollToTrim.toFixed(3) + 's',
                                        originalBlobSize: rawBlob.size,
                                        trimmedBlobSize: trimmedBlob.size
                                    });

                                    // 트리밍 후 RMS 분석
                                    const trimmedChannelData = trimmedBuffer.getChannelData(0);
                                    const trimmedRmsResults: string[] = [];
                                    for (const sec of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
                                        if (sec >= trimmedBuffer.duration) break;
                                        const start = Math.floor(sec * sampleRate);
                                        const end = Math.min(start + sampleRate, trimmedChannelData.length);
                                        let sum = 0;
                                        for (let i = start; i < end; i++) {
                                            sum += trimmedChannelData[i] * trimmedChannelData[i];
                                        }
                                        const rms = Math.sqrt(sum / (end - start));
                                        const status = rms < 0.005 ? '🔇무음' : rms < 0.02 ? '🔈약함' : '🔊정상';
                                        trimmedRmsResults.push(`${sec}s:${rms.toFixed(4)}${status}`);
                                    }
                                    console.log('🎤 [AUDIO RMS] 초별 RMS 분석 (트리밍 후):', trimmedRmsResults.join(' | '));

                                    // segment 업데이트: 트리밍된 blob, url, prerollDuration=0
                                    setSegments(prev => prev.map(seg => {
                                        if (seg.id === segmentId) {
                                            // 기존 URL 해제
                                            URL.revokeObjectURL(seg.url);
                                            return {
                                                ...seg,
                                                blob: trimmedBlob,
                                                url: trimmedUrl,
                                                prerollDuration: 0
                                            };
                                        }
                                        return seg;
                                    }));
                                }
                            } else {
                                // preroll이 거의 없으면 그대로 사용하되 prerollDuration은 0으로
                                finalPrerollDuration = 0;
                                setSegments(prev => prev.map(seg =>
                                    seg.id === segmentId
                                        ? { ...seg, prerollDuration: 0 }
                                        : seg
                                ));
                            }
                        } catch (err) {
                            console.error('🎤 Failed to decode audio buffer:', err);
                        }
                    })();

                    setState('recorded');

                    console.log('🎤 Recording complete:', {
                        id: segmentId,
                        duration: endTime - startTime,
                        measures: `${startMeasure}-${endMeasure}`,
                        finalBlobSize,
                        finalPrerollDuration: finalPrerollDuration.toFixed(3) + 's',
                        note: 'preroll=0이면 트리밍 완료'
                    });
                } catch (err) {
                    console.error('Processing error:', err);
                    setError('녹음 처리 중 오류가 발생했습니다');
                    onError?.('녹음 처리 중 오류가 발생했습니다');
                } finally {
                    setIsProcessing(false);
                    pendingRangeRef.current = null;
                    resolve();
                }
            };

            mediaRecorder.stop();
        });
    }, [state, onError]);

    // ========================================
    // Pause Jamming
    // ========================================
    const pauseJamming = useCallback(() => {
        if (mediaRecorderRef.current && state === 'recording' && !isPaused) {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            console.log('🎤 Recording paused');
        }
    }, [state, isPaused]);

    // ========================================
    // Resume Jamming
    // ========================================
    const resumeJamming = useCallback(() => {
        if (mediaRecorderRef.current && state === 'recording' && isPaused) {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
            console.log('🎤 Recording resumed');
        }
    }, [state, isPaused]);

    // ========================================
    // Play Recordings At Time (Web Audio API 기반 - 정확한 타이밍)
    // ========================================
    const playRecordingsAtTime = useCallback(async (fromTime: number) => {
        // Find segments that include this time
        const activeSegments = segments.filter(seg =>
            fromTime >= seg.startTime && fromTime <= seg.endTime
        );

        if (activeSegments.length === 0) {
            return;
        }

        // AudioContext 생성 (없으면)
        if (!audioContextRef.current) {
            audioContextRef.current = getSharedAudioContext();
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
        }

        const context = audioContextRef.current;

        // suspended 상태면 resume (반드시 await!)
        if (context.state === 'suspended') {
            console.log('🎤 [Web Audio] Resuming suspended AudioContext');
            await context.resume();
        }

        console.log('🎤 [Web Audio] AudioContext state:', context.state, 'gainNode:', gainNodeRef.current?.gain.value);

        // Play each active segment using Web Audio API
        activeSegments.forEach(seg => {
            const audioBuffer = audioBuffersRef.current.get(seg.id);
            if (!audioBuffer) {
                console.warn('🎤 AudioBuffer not ready for segment:', seg.id);
                return;
            }

            // 기존 source node 정리
            const existingSource = sourceNodesRef.current.get(seg.id);
            if (existingSource) {
                try {
                    existingSource.stop();
                    existingSource.disconnect();
                } catch {
                    // 이미 정지됨
                }
            }

            // 블롭 내 오프셋 계산
            // prerollDuration: blob 앞부분 건너뛸 시간 (카운트다운 동안 녹음된 부분)
            // fromTime - seg.startTime: 곡 시간 내 오프셋
            // PLAYBACK_TIMING_OFFSET: 재생 타이밍 보정 (녹음이 늦게 들리면 + 값)
            const PLAYBACK_TIMING_OFFSET = 0.2;
            const offset = seg.prerollDuration + Math.max(0, fromTime - seg.startTime) + PLAYBACK_TIMING_OFFSET;

            // 새 source node 생성
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            if (gainNodeRef.current) {
                source.connect(gainNodeRef.current);
            } else {
                source.connect(context.destination);
            }

            // 즉시 재생 (Web Audio API는 정확한 타이밍 보장)
            source.start(0, offset);
            sourceNodesRef.current.set(seg.id, source);

            console.log('🎤 [Web Audio] 재생 시작:', {
                segId: seg.id,
                fromTime,
                segStartTime: seg.startTime,
                prerollDuration: seg.prerollDuration.toFixed(3),
                offset: offset.toFixed(3),
                bufferDuration: audioBuffer.duration.toFixed(2)
            });

            // 재생 완료 시 정리
            source.onended = () => {
                sourceNodesRef.current.delete(seg.id);
            };
        });
    }, [segments]);

    // ========================================
    // Pause Recordings (Web Audio API 기반)
    // ========================================
    const pauseRecordings = useCallback(() => {
        const count = sourceNodesRef.current.size;
        console.log('🎤 [pauseRecordings] 호출됨, 활성 소스:', count);

        sourceNodesRef.current.forEach((source, id) => {
            try {
                source.stop();
                source.disconnect();
                console.log('🎤 [pauseRecordings] 소스 정지:', id);
            } catch (e) {
                console.log('🎤 [pauseRecordings] 소스 이미 정지됨:', id);
            }
        });
        sourceNodesRef.current.clear();
        console.log('🎤 [pauseRecordings] 완료, 남은 소스:', sourceNodesRef.current.size);
    }, []);

    // ========================================
    // Reset Recording
    // ========================================
    const resetRecording = useCallback(() => {
        if (mediaRecorderRef.current && state === 'recording') {
            mediaRecorderRef.current.stop();
        }

        // Clean up Web Audio API
        sourceNodesRef.current.forEach(source => {
            try {
                source.stop();
                source.disconnect();
            } catch {
                // 이미 정지됨
            }
        });
        sourceNodesRef.current.clear();
        audioBuffersRef.current.clear();

        // Revoke all URLs
        segments.forEach(seg => URL.revokeObjectURL(seg.url));

        // Reset state
        setSegments([]);
        setState('idle');
        setIsPaused(false);
        setError(null);
        chunksRef.current = [];
        pendingRangeRef.current = null;

        console.log('🎤 All recordings reset');
    }, [state, segments]);

    return {
        state,
        permissionState,
        segments,
        recordedMeasures,
        isProcessing,
        isPaused,
        error,
        audioBlob,
        recordingRange,
        requestPermission,
        prepareRecording,
        startRecording,
        stopRecording,
        pauseJamming,
        resumeJamming,
        playRecordingsAtTime,
        pauseRecordings,
        resetRecording,
        hasRecordingAt,
        getOverlappingSegment
    };
}

export default useRecorder;
