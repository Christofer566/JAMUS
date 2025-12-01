'use client';

import { useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';

export interface UseMetronomeOptions {
    bpm: number;
    timeSignature?: number; // 박자 (기본값 4)
}

export interface UseMetronomeReturn {
    start: () => Promise<void>;
    stop: () => void;
    setBpm: (bpm: number) => void;
    setMuted: (muted: boolean) => void;
    isMuted: boolean;
    isRunning: boolean;
}

/**
 * Tone.js 기반 메트로놈 훅
 *
 * 원리:
 * 1. Tone.Transport를 BPM에 맞춰 설정
 * 2. Tone.Loop로 매 박자마다 신디사이저 트리거
 * 3. 첫 박(다운비트)은 높은 음, 나머지는 낮은 음
 *
 * @param options - bpm, timeSignature
 */
export function useMetronome(options: UseMetronomeOptions): UseMetronomeReturn {
    const { bpm, timeSignature = 4 } = options;

    // Refs
    const synthRef = useRef<Tone.Synth | null>(null);
    const loopRef = useRef<Tone.Loop | null>(null);
    const beatCountRef = useRef(0);
    const isRunningRef = useRef(false);
    const isMutedRef = useRef(true); // 기본값: 음소거

    // 신디사이저 초기화 (컴포넌트 마운트 시 한 번)
    useEffect(() => {
        // 메트로놈용 짧은 클릭 소리 신디사이저
        synthRef.current = new Tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: {
                attack: 0.001,
                decay: 0.1,
                sustain: 0,
                release: 0.1
            }
        }).toDestination();

        // 볼륨 조절 (너무 크지 않게)
        synthRef.current.volume.value = -10;

        return () => {
            // 클린업
            if (loopRef.current) {
                loopRef.current.stop();
                loopRef.current.dispose();
            }
            if (synthRef.current) {
                synthRef.current.dispose();
            }
        };
    }, []);

    // BPM 변경 시 Transport 업데이트
    useEffect(() => {
        Tone.Transport.bpm.value = bpm;
    }, [bpm]);

    /**
     * 메트로놈 시작
     */
    const start = useCallback(async () => {
        if (isRunningRef.current) return;

        // Tone.js는 사용자 인터랙션 후 시작 필요 (Safari 정책)
        await Tone.start();

        // 기존 루프 정리
        if (loopRef.current) {
            loopRef.current.stop();
            loopRef.current.dispose();
        }

        // BPM 설정
        Tone.Transport.bpm.value = bpm;
        beatCountRef.current = 0;

        // 매 박자마다 실행되는 루프
        loopRef.current = new Tone.Loop((time) => {
            if (!synthRef.current) return;

            // 음소거 상태가 아닐 때만 소리 재생
            if (!isMutedRef.current) {
                // 첫 박(다운비트) vs 나머지 박
                const isDownbeat = beatCountRef.current % timeSignature === 0;
                const note = isDownbeat ? 'C5' : 'G4'; // 높은 음 vs 낮은 음
                const duration = '32n'; // 짧은 클릭

                synthRef.current.triggerAttackRelease(note, duration, time);
            }

            beatCountRef.current++;
        }, '4n'); // 4분음표 간격

        // 시작
        loopRef.current.start(0);
        Tone.Transport.start();
        isRunningRef.current = true;
    }, [bpm, timeSignature]);

    /**
     * 음소거 설정
     */
    const setMuted = useCallback((muted: boolean) => {
        isMutedRef.current = muted;
    }, []);

    /**
     * 메트로놈 정지
     */
    const stop = useCallback(() => {
        if (loopRef.current) {
            loopRef.current.stop();
        }
        Tone.Transport.stop();
        Tone.Transport.position = 0;
        beatCountRef.current = 0;
        isRunningRef.current = false;
    }, []);

    /**
     * BPM 변경
     */
    const setBpm = useCallback((newBpm: number) => {
        Tone.Transport.bpm.value = newBpm;
    }, []);

    return {
        start,
        stop,
        setBpm,
        setMuted,
        isMuted: isMutedRef.current,
        isRunning: isRunningRef.current
    };
}

export default useMetronome;
