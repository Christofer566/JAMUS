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
    startTime: number; // 음악 타임라인 기준 시작 시간
    endTime: number;   // 음악 타임라인 기준 종료 시간
    startMeasure: number;
    endMeasure: number;
    // prerollDuration 제거 - 마커 기반 추출로 더 이상 필요 없음
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
    // Phase 52: Warm-up 상태
    isWarmedUp: boolean;
    measuredLatency: number; // 측정된 고정 지연 (ms)
    requestPermission: () => Promise<boolean>;
    // Phase 52: Warm-up - 페이지 진입 시 마이크 통로 사전 활성화
    warmUp: () => Promise<boolean>;
    startRecording: (startTime: number, startMeasure: number) => Promise<boolean>;
    markActualStart: (timeDelta?: number) => void; // 카운트다운 완료 시 실제 녹음 시작 마커 찍기 (timeDelta: 하드웨어 지연 보정값)
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
    // Phase 52: Warm-up 상태
    const [isWarmedUp, setIsWarmedUp] = useState(false);
    const [measuredLatency, setMeasuredLatency] = useState(0); // 측정된 고정 지연 (ms)

    // Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const pendingRangeRef = useRef<{ startTime: number; startMeasure: number } | null>(null);
    // 마커 기반 녹음
    const recordingBlobStartRef = useRef<number>(0); // blob 0초 시점 (performance.now, MediaRecorder.start() 호출 시점)
    const actualStartMarkerRef = useRef<number>(0); // 실제 녹음 시작 마커 (blob 기준 상대 시간, 초)
    const recordingStopTimeRef = useRef<number>(0); // 녹음 종료 시점 (performance.now)
    // Phase 52: Calibration - 고정 지연 측정
    const firstDataTimestampRef = useRef<number>(0); // 첫 번째 ondataavailable 이벤트 시점
    const staticLatencyRef = useRef<number>(0); // 측정된 고정 지연 (ms)

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
    // Phase 52: Warm-up - 마이크 통로 사전 활성화
    // 페이지 진입 시 호출하여 MediaRecorder 하드웨어 지연을 미리 해소
    // ========================================
    const warmUp = useCallback(async (): Promise<boolean> => {
        console.log('🔥 [Phase 52 Warm-up] 마이크 워밍업 시작...');

        // 1. 권한 확보
        if (permissionState !== 'granted') {
            const granted = await requestPermission();
            if (!granted) {
                console.warn('🔥 [Warm-up] 마이크 권한 없음');
                return false;
            }
        }

        if (!streamRef.current) {
            const granted = await requestPermission();
            if (!granted) return false;
        }

        try {
            // 2. AudioContext 미리 활성화
            if (!audioContextRef.current) {
                audioContextRef.current = getSharedAudioContext();
                gainNodeRef.current = audioContextRef.current.createGain();
                gainNodeRef.current.connect(audioContextRef.current.destination);
            }

            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
                console.log('🔥 [Warm-up] AudioContext resumed');
            }

            // 3. MediaRecorder 짧게 시작/정지 (하드웨어 초기화)
            const mimeType = getSupportedMimeType();
            const warmupRecorder = new MediaRecorder(streamRef.current!, { mimeType });

            return new Promise((resolve) => {
                const warmupStartTime = performance.now();
                let firstDataTime = 0;

                warmupRecorder.ondataavailable = (event) => {
                    if (firstDataTime === 0 && event.data.size > 0) {
                        firstDataTime = performance.now();
                        const latency = firstDataTime - warmupStartTime;

                        // 고정 지연 측정 및 저장
                        staticLatencyRef.current = latency;
                        setMeasuredLatency(latency);

                        console.log('🔥 [Warm-up] 고정 지연 측정 완료:', {
                            startTime: warmupStartTime.toFixed(0) + 'ms',
                            firstDataTime: firstDataTime.toFixed(0) + 'ms',
                            staticLatency: latency.toFixed(1) + 'ms',
                            note: '이 값만큼 추출 시 Pull-back 적용됨'
                        });
                    }
                };

                warmupRecorder.onstop = () => {
                    // Phase 53: 지연 측정 실패 시 기본값 사용
                    // 일반적인 하드웨어 지연 250ms (브라우저/기기마다 다름)
                    const DEFAULT_STATIC_LATENCY_MS = 250;

                    if (staticLatencyRef.current === 0) {
                        staticLatencyRef.current = DEFAULT_STATIC_LATENCY_MS;
                        setMeasuredLatency(DEFAULT_STATIC_LATENCY_MS);
                        console.log('🔥 [Phase 53 Warm-up] 고정 지연 측정 실패, 기본값 사용:', DEFAULT_STATIC_LATENCY_MS + 'ms');
                    }

                    setIsWarmedUp(true);
                    console.log('🔥 [Phase 52 Warm-up] 완료! 마이크 통로 활성화됨, 최종 지연:', staticLatencyRef.current.toFixed(1) + 'ms');
                    resolve(true);
                };

                warmupRecorder.start(50); // 50ms timeslice로 빠르게 데이터 수집

                // 300ms 후 정지 (충분히 데이터 수집)
                setTimeout(() => {
                    if (warmupRecorder.state === 'recording') {
                        warmupRecorder.stop();
                    }
                }, 300);
            });
        } catch (err) {
            console.error('🔥 [Warm-up] 실패:', err);
            return false;
        }
    }, [permissionState, requestPermission]);

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

    // prepareRecording 제거 - 마커 기반 방식으로 불필요

    // ========================================
    // Start Recording (마커 기반 녹음 시작)
    // R키 첫 번째 누를 때 호출 - MediaRecorder 시작 + blob 시작점 기록
    // ========================================
    const startRecording = useCallback(async (
        startTime: number,      // 음악 타임라인 기준 녹음 시작 시간 (카운트다운 끝나는 시점)
        startMeasure: number    // 녹음 시작 마디
    ): Promise<boolean> => {
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

            const mediaRecorder = new MediaRecorder(streamRef.current!, { mimeType });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            // blob 시작 시점 기록 (MediaRecorder.start() 시점)
            const blobStartTime = performance.now();
            recordingBlobStartRef.current = blobStartTime;
            actualStartMarkerRef.current = 0; // 아직 실제 시작 안 함, markActualStart()에서 설정
            pendingRangeRef.current = { startTime, startMeasure };

            mediaRecorder.start(100); // 100ms timeslice
            setState('recording');
            setError(null);

            console.log('🎤 [Marker Recording] MediaRecorder.start():', {
                blobStartTime: blobStartTime.toFixed(0) + 'ms',
                targetMeasure: startMeasure,
                targetTime: startTime.toFixed(3) + 's',
                note: '카운트다운 끝나면 markActualStart() 호출 필요'
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
    // Mark Actual Start (카운트다운 완료 시 실제 녹음 시작 마커 찍기)
    // Phase 31: 하드웨어 지연 보정 (목표 시간 vs 실제 오디오 시간 차이 반영)
    // ========================================
    const markActualStart = useCallback((timeDelta: number = 0) => {
        // MediaRecorder의 실제 상태로 체크 (React state 업데이트 지연 문제 해결)
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
            console.warn('🎤 [markActualStart] MediaRecorder가 녹음 중이 아닙니다:', {
                hasRecorder: !!mediaRecorderRef.current,
                recorderState: mediaRecorderRef.current?.state,
                reactState: state
            });
            return;
        }

        const now = performance.now();
        const markerTime = (now - recordingBlobStartRef.current) / 1000; // blob 기준 상대 시간 (초)

        // Phase 31: 하드웨어 지연 보정 적용
        // timeDelta = 목표 시간 - 실제 오디오 시간 (예: 13.521 - 13.512 = 0.009s)
        // markerTime에 더하면 blob에서 추출할 시작점이 앞당겨짐 (지연 상쇄)
        const correctedMarkerTime = markerTime + timeDelta;
        actualStartMarkerRef.current = correctedMarkerTime;

        console.log('🎤 [Marker] 실제 녹음 시작 마커 설정 (하드웨어 지연 보정):', {
            blobStartTime: recordingBlobStartRef.current.toFixed(0) + 'ms',
            currentTime: now.toFixed(0) + 'ms',
            원본마커: markerTime.toFixed(3) + 's (blob 기준)',
            지연보정: timeDelta.toFixed(3) + 's',
            최종마커: correctedMarkerTime.toFixed(3) + 's (보정 후)',
            note: 'Phase 31 - 목표 vs 실제 오디오 시간 차이 반영'
        });
    }, []); // 의존성 제거 - mediaRecorderRef 사용으로 state 업데이트 지연 문제 해결

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
                console.log('🎤 [Marker Recording] MediaRecorder stopped, processing...');
                setIsProcessing(true);

                try {
                    // 종료 마커 기록 (blob 기준 상대 시간)
                    const now = performance.now();
                    const endMarker = (now - recordingBlobStartRef.current) / 1000; // 초

                    const rawBlob = new Blob(chunksRef.current, {
                        type: mediaRecorder.mimeType
                    });

                    const startTime = pendingRangeRef.current?.startTime || 0;
                    const startMeasure = pendingRangeRef.current?.startMeasure || 1;
                    const rawStartMarker = actualStartMarkerRef.current; // 카운트다운 끝난 시점 (blob 기준)

                    // ========================================
                    // Phase 55: Pull-back (황금 설정 - 타이밍 83.3%, 피치 61.1%)
                    // 고정 지연 + 추가 버퍼로 단순하고 안정적인 싱크
                    // Phase 75: 타이밍 92.9% 달성 (황금 설정)
                    // ========================================
                    const PULLBACK_BUFFER_MS = 250; // 추가 버퍼 (250)
                    const pullbackSeconds = (staticLatencyRef.current + PULLBACK_BUFFER_MS) / 1000;
                    const startMarker = Math.max(0, rawStartMarker - pullbackSeconds);

                    console.log('🎤 [Phase 55 Pull-back] 적용:', {
                        원본마커: rawStartMarker.toFixed(3) + 's',
                        측정된고정지연: staticLatencyRef.current.toFixed(1) + 'ms',
                        추가버퍼: PULLBACK_BUFFER_MS + 'ms',
                        총당김량: (pullbackSeconds * 1000).toFixed(1) + 'ms',
                        보정마커: startMarker.toFixed(3) + 's'
                    });

                    console.log('🎤 [Marker] 마커 정보:', {
                        blobStartTime: recordingBlobStartRef.current.toFixed(0) + 'ms',
                        startMarker: startMarker.toFixed(3) + 's (blob 기준)',
                        endMarker: endMarker.toFixed(3) + 's (blob 기준)',
                        extractDuration: (endMarker - startMarker).toFixed(3) + 's',
                        musicTimelineStart: startTime.toFixed(3) + 's',
                        musicTimelineEnd: endTime.toFixed(3) + 's',
                        measures: `${startMeasure}-${endMeasure}`
                    });

                    const segmentId = `seg-${Date.now()}`;

                    // ========================================
                    // 마커 기반 구간 추출 (단순하고 정확함)
                    // ========================================
                    // AudioContext 생성 (없으면)
                    if (!audioContextRef.current) {
                        audioContextRef.current = getSharedAudioContext();
                        gainNodeRef.current = audioContextRef.current.createGain();
                        gainNodeRef.current.connect(audioContextRef.current.destination);
                    }

                    const arrayBuffer = await rawBlob.arrayBuffer();
                    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

                    const blobDuration = audioBuffer.duration;
                    console.log('🎤 [Extract] Blob 전체 길이:', blobDuration.toFixed(3) + 's');

                    // startMarker ~ endMarker 구간만 추출
                    const sampleRate = audioBuffer.sampleRate;
                    const startSample = Math.floor(startMarker * sampleRate);
                    const endSample = Math.floor(endMarker * sampleRate);
                    const extractLength = endSample - startSample;

                    if (extractLength <= 0) {
                        throw new Error('추출할 구간이 없습니다. startMarker >= endMarker');
                    }

                    console.log('🎤 [Extract] 구간 추출 준비:', {
                        startSample,
                        endSample,
                        extractLength,
                        extractDuration: (extractLength / sampleRate).toFixed(3) + 's'
                    });

                    // OfflineAudioContext로 구간 추출
                    const offlineCtx = new OfflineAudioContext(
                        audioBuffer.numberOfChannels,
                        extractLength,
                        sampleRate
                    );

                    const source = offlineCtx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(offlineCtx.destination);
                    source.start(0, startMarker, endMarker - startMarker); // startMarker부터 (endMarker-startMarker) 길이만큼

                    const extractedBuffer = await offlineCtx.startRendering();

                    console.log('🎤 [Extract] 추출 완료:', {
                        원본길이: blobDuration.toFixed(3) + 's',
                        추출길이: extractedBuffer.duration.toFixed(3) + 's',
                        startMarker: startMarker.toFixed(3) + 's',
                        endMarker: endMarker.toFixed(3) + 's'
                    });

                    // WAV로 변환
                    const wavBlob = audioBufferToWavBlob(extractedBuffer);
                    const url = URL.createObjectURL(wavBlob);

                    // AudioBuffer 저장 (재생용)
                    audioBuffersRef.current.set(segmentId, extractedBuffer);

                    // ========================================
                    // Phase 53: Segment startTime에도 Pull-back 적용
                    // Pull-back으로 blob 앞부분을 더 추출하면, 그만큼 startTime도 앞당겨야
                    // 재생 시 offset 계산이 정확해짐
                    // ========================================
                    const adjustedStartTime = startTime - pullbackSeconds;

                    console.log('🎤 [Phase 53] Segment 시간 조정:', {
                        원본startTime: startTime.toFixed(3) + 's',
                        조정startTime: adjustedStartTime.toFixed(3) + 's',
                        pullback: (pullbackSeconds * 1000).toFixed(1) + 'ms',
                        note: '재생 시 offset 계산 정확도 향상'
                    });

                    // Segment 생성
                    const newSegment: RecordingSegment = {
                        id: segmentId,
                        blob: wavBlob,
                        url,
                        startTime: adjustedStartTime,  // Phase 53: Pull-back 적용
                        endTime,
                        startMeasure,
                        endMeasure
                    };

                    // 기존 겹치는 segment 처리 + 새 segment 추가
                    setSegments(prev => {
                        const result: RecordingSegment[] = [];

                        for (const seg of prev) {
                            const overlaps = !(endMeasure < seg.startMeasure || startMeasure > seg.endMeasure);

                            if (!overlaps) {
                                result.push(seg);
                            } else {
                                // 겹치는 segment 정리
                                console.log('🎤 Removing overlapped segment:', seg.id, `(${seg.startMeasure}-${seg.endMeasure})`);
                                URL.revokeObjectURL(seg.url);
                                const sourceNode = sourceNodesRef.current.get(seg.id);
                                if (sourceNode) {
                                    try {
                                        sourceNode.stop();
                                        sourceNode.disconnect();
                                    } catch { /* 이미 정지됨 */ }
                                    sourceNodesRef.current.delete(seg.id);
                                }
                                audioBuffersRef.current.delete(seg.id);
                            }
                        }

                        return [...result, newSegment];
                    });

                    setState('recorded');

                    console.log('🎤 [Marker Recording] 완료:', {
                        segmentId,
                        measures: `${startMeasure}-${endMeasure}`,
                        duration: extractedBuffer.duration.toFixed(3) + 's',
                        blobSize: wavBlob.size,
                        note: '마커 기반 추출 완료 - preroll 없음'
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

        // AudioContext.currentTime 기반 즉시 재생 (배경음악과 정확히 동기화)
        const scheduleTime = context.currentTime; // 즉시 재생 (0ms lookahead)

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

            // 블롭 내 오프셋 계산 (마커 기반 - preroll 없음)
            // fromTime - seg.startTime: 곡 시간 내 오프셋
            const offset = Math.max(0, fromTime - seg.startTime);

            // 새 source node 생성
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            if (gainNodeRef.current) {
                source.connect(gainNodeRef.current);
            } else {
                source.connect(context.destination);
            }

            // AudioContext.currentTime 기반 정확한 스케줄링 (배경음악과 동기화)
            source.start(scheduleTime, offset);
            sourceNodesRef.current.set(seg.id, source);

            console.log('🎤 [Web Audio] 재생 시작 (스케줄링):', {
                segId: seg.id,
                fromTime,
                segStartTime: seg.startTime,
                offset: offset.toFixed(3),
                scheduleTime: scheduleTime.toFixed(3),
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
        // Phase 52: Warm-up 상태
        isWarmedUp,
        measuredLatency,
        requestPermission,
        // Phase 52: Warm-up 함수
        warmUp,
        startRecording,
        markActualStart,
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
