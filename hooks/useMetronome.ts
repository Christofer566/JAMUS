'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { getSharedAudioContext, resumeAudioContext } from './useAudioContext';

export interface UseMetronomeOptions {
    bpm: number;
    timeSignature?: number; // 박자 (기본값 4)
}

export interface UseMetronomeReturn {
    start: () => Promise<void>;
    stop: () => void;
    setBpm: (bpm: number) => void;
    setMuted: (muted: boolean) => void;
    seekTo: (audioTime: number) => void; // 음원 시간에 동기화
    isMuted: boolean;
    isRunning: boolean;
}

/**
 * AudioContext 기반 메트로놈 훅 (음원과 동기화)
 *
 * 원리:
 * 1. 공유 AudioContext를 사용하여 음원과 동일한 타임라인 유지
 * 2. requestAnimationFrame 기반 스케줄링으로 정밀한 박자 유지
 * 3. seekTo로 음원 이동 시 메트로놈도 동기화
 * 4. 기본 음소거 상태 (D키로 토글)
 *
 * @param options - bpm, timeSignature
 */
export function useMetronome(options: UseMetronomeOptions): UseMetronomeReturn {
    const { bpm, timeSignature = 4 } = options;

    // State
    const [isMuted, setIsMutedState] = useState(true); // 기본값: 음소거
    const [isRunning, setIsRunning] = useState(false);

    // Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const isRunningRef = useRef(false);
    const isMutedRef = useRef(true);
    const bpmRef = useRef(bpm);
    const timeSignatureRef = useRef(timeSignature);

    // 동기화를 위한 refs
    const audioStartTimeRef = useRef(0); // 음원 재생 시작 시간 (초)
    const contextStartTimeRef = useRef(0); // AudioContext 기준 시작 시간
    const schedulerIdRef = useRef<number | null>(null);
    const lastScheduledBeatRef = useRef(-1);

    // BPM/timeSignature 변경 시 ref 업데이트
    useEffect(() => {
        bpmRef.current = bpm;
    }, [bpm]);

    useEffect(() => {
        timeSignatureRef.current = timeSignature;
    }, [timeSignature]);

    // 클릭 사운드 생성
    const playClick = useCallback((isDownbeat: boolean) => {
        if (!audioContextRef.current || !gainNodeRef.current) return;
        if (isMutedRef.current) return;

        const ctx = audioContextRef.current;
        const now = ctx.currentTime;

        // 오실레이터 생성
        const oscillator = ctx.createOscillator();
        const clickGain = ctx.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.value = isDownbeat ? 1000 : 800; // 다운비트: 높은 음

        // 짧은 클릭 엔벨로프
        clickGain.gain.setValueAtTime(0.3, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        oscillator.connect(clickGain);
        clickGain.connect(gainNodeRef.current);

        oscillator.start(now);
        oscillator.stop(now + 0.05);
    }, []);

    // 스케줄러: 현재 음원 시간 기준으로 박자 체크
    const scheduler = useCallback(() => {
        if (!isRunningRef.current || !audioContextRef.current) return;

        const ctx = audioContextRef.current;
        const currentContextTime = ctx.currentTime;

        // 현재 음원 시간 계산 (AudioContext 시간 기준)
        const elapsed = currentContextTime - contextStartTimeRef.current;
        const currentAudioTime = audioStartTimeRef.current + elapsed;

        // BPM 기반 박자 계산
        const secondsPerBeat = 60 / bpmRef.current;
        const currentBeat = Math.floor(currentAudioTime / secondsPerBeat);

        // 새로운 박자에 도달했으면 클릭
        if (currentBeat > lastScheduledBeatRef.current && currentBeat >= 0) {
            lastScheduledBeatRef.current = currentBeat;
            const isDownbeat = currentBeat % timeSignatureRef.current === 0;
            playClick(isDownbeat);
        }

        schedulerIdRef.current = requestAnimationFrame(scheduler);
    }, [playClick]);

    /**
     * 메트로놈 시작 (음원 시간과 동기화)
     */
    const start = useCallback(async () => {
        if (isRunningRef.current) return;

        // AudioContext 초기화
        audioContextRef.current = getSharedAudioContext();
        await resumeAudioContext();

        // GainNode 생성 (볼륨 제어용)
        if (!gainNodeRef.current) {
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
            gainNodeRef.current.gain.value = 0.5;
        }

        // 시작 시간 기록
        contextStartTimeRef.current = audioContextRef.current.currentTime;
        lastScheduledBeatRef.current = Math.floor(audioStartTimeRef.current / (60 / bpmRef.current)) - 1;

        isRunningRef.current = true;
        setIsRunning(true);

        // 스케줄러 시작
        schedulerIdRef.current = requestAnimationFrame(scheduler);

        console.log('🥁 [Metronome] Started at audio time:', audioStartTimeRef.current);
    }, [scheduler]);

    /**
     * 메트로놈 정지
     */
    const stop = useCallback(() => {
        if (schedulerIdRef.current) {
            cancelAnimationFrame(schedulerIdRef.current);
            schedulerIdRef.current = null;
        }

        isRunningRef.current = false;
        setIsRunning(false);
        lastScheduledBeatRef.current = -1;

        console.log('🥁 [Metronome] Stopped');
    }, []);

    /**
     * 음원 시간에 동기화 (seek 시 호출)
     */
    const seekTo = useCallback((audioTime: number) => {
        audioStartTimeRef.current = audioTime;

        if (audioContextRef.current) {
            contextStartTimeRef.current = audioContextRef.current.currentTime;
        }

        // 현재 박자 위치 재계산
        const secondsPerBeat = 60 / bpmRef.current;
        lastScheduledBeatRef.current = Math.floor(audioTime / secondsPerBeat) - 1;

        console.log('🥁 [Metronome] Seeked to:', audioTime, 'beat:', lastScheduledBeatRef.current + 1);
    }, []);

    /**
     * 음소거 설정
     */
    const setMuted = useCallback((muted: boolean) => {
        isMutedRef.current = muted;
        setIsMutedState(muted);
        console.log('🥁 [Metronome] Muted:', muted);
    }, []);

    /**
     * BPM 변경
     */
    const setBpm = useCallback((newBpm: number) => {
        bpmRef.current = newBpm;
        // 박자 위치 재계산
        if (audioContextRef.current && isRunningRef.current) {
            const secondsPerBeat = 60 / newBpm;
            lastScheduledBeatRef.current = Math.floor(audioStartTimeRef.current / secondsPerBeat) - 1;
        }
        console.log('🥁 [Metronome] BPM changed to:', newBpm);
    }, []);

    // 클린업
    useEffect(() => {
        return () => {
            if (schedulerIdRef.current) {
                cancelAnimationFrame(schedulerIdRef.current);
            }
        };
    }, []);

    return {
        start,
        stop,
        setBpm,
        setMuted,
        seekTo,
        isMuted,
        isRunning
    };
}

export default useMetronome;
