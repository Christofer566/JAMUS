'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

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
    const audioContext = new AudioContext();

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
        await audioContext.close();
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
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
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
    // Start Recording
    // ========================================
    const startRecording = useCallback(async (
        startTime: number,
        startMeasure: number
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

            mediaRecorder.start(100);
            setState('recording');
            setError(null);

            console.log('🎤 Recording started:', {
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
                        endMeasure
                    };

                    // Web Audio API: Blob을 AudioBuffer로 디코딩 (정확한 타이밍 동기화)
                    const decodeAudioBuffer = async () => {
                        try {
                            // AudioContext 생성 (없으면)
                            if (!audioContextRef.current) {
                                const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                                audioContextRef.current = new AudioContextClass();
                                gainNodeRef.current = audioContextRef.current.createGain();
                                gainNodeRef.current.connect(audioContextRef.current.destination);
                            }

                            const arrayBuffer = await rawBlob.arrayBuffer();
                            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                            audioBuffersRef.current.set(segmentId, audioBuffer);
                            console.log('🎤 AudioBuffer decoded for segment:', segmentId, 'duration:', audioBuffer.duration.toFixed(2) + 's');
                        } catch (err) {
                            console.error('🎤 Failed to decode audio buffer:', err);
                        }
                    };
                    decodeAudioBuffer();

                    // Add to segments (trimming overlapping ones instead of removing)
                    setSegments(prev => {
                        const result: RecordingSegment[] = [];

                        for (const seg of prev) {
                            const overlaps = !(endMeasure < seg.startMeasure || startMeasure > seg.endMeasure);

                            if (!overlaps) {
                                // No overlap, keep as-is
                                result.push(seg);
                            } else {
                                // Overlap detected - trim instead of delete
                                // Case 1: New recording starts after existing segment start
                                // Keep the part before the new recording
                                if (seg.startMeasure < startMeasure) {
                                    // Trim existing segment to end before new recording starts
                                    const trimmedSeg: RecordingSegment = {
                                        ...seg,
                                        endMeasure: startMeasure - 1,
                                        endTime: startTime // Use new recording's start time as end
                                    };
                                    console.log('🎤 Trimming segment', seg.id, 'from', seg.startMeasure, '-', seg.endMeasure, 'to', trimmedSeg.startMeasure, '-', trimmedSeg.endMeasure);
                                    result.push(trimmedSeg);
                                }
                                // Case 2: New recording ends before existing segment end
                                // Keep the part after the new recording (less common case)
                                else if (seg.endMeasure > endMeasure) {
                                    // Trim existing segment to start after new recording ends
                                    const trimmedSeg: RecordingSegment = {
                                        ...seg,
                                        startMeasure: endMeasure + 1,
                                        startTime: endTime // Use new recording's end time as start
                                    };
                                    console.log('🎤 Trimming segment', seg.id, 'from', seg.startMeasure, '-', seg.endMeasure, 'to', trimmedSeg.startMeasure, '-', trimmedSeg.endMeasure);
                                    result.push(trimmedSeg);
                                }
                                // Case 3: New recording completely covers existing segment
                                else {
                                    // Remove entirely
                                    console.log('🎤 Removing completely overlapped segment', seg.id);
                                    URL.revokeObjectURL(seg.url);
                                    // Web Audio API 정리
                                    const source = sourceNodesRef.current.get(seg.id);
                                    if (source) {
                                        try {
                                            source.stop();
                                            source.disconnect();
                                        } catch {
                                            // 이미 정지됨
                                        }
                                        sourceNodesRef.current.delete(seg.id);
                                    }
                                    audioBuffersRef.current.delete(seg.id);
                                }
                            }
                        }

                        return [...result, newSegment];
                    });

                    setState('recorded');

                    console.log('🎤 Recording complete:', {
                        id: segmentId,
                        duration: endTime - startTime,
                        measures: `${startMeasure}-${endMeasure}`,
                        blobSize: rawBlob.size,
                        note: '무음 패딩 없음'
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
            const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioContextRef.current = new AudioContextClass();
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

            // 블롭 내 오프셋 계산 (무음 패딩 없음)
            // 블롭 시간 0 = 곡 시간 startTime
            const offset = Math.max(0, fromTime - seg.startTime);

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
        sourceNodesRef.current.forEach((source, id) => {
            try {
                source.stop();
                source.disconnect();
            } catch {
                // 이미 정지됨
            }
        });
        sourceNodesRef.current.clear();
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
