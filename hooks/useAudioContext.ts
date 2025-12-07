'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

// Safari 호환 AudioContext 타입
declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

// 싱글톤 AudioContext 인스턴스
let sharedAudioContext: AudioContext | null = null;

/**
 * AudioContext 싱글톤 획득
 * 페이지 전체에서 하나의 AudioContext를 공유
 */
export function getSharedAudioContext(): AudioContext {
    if (!sharedAudioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        sharedAudioContext = new AudioContextClass();
    }
    return sharedAudioContext;
}

/**
 * AudioContext 상태 resume (사용자 인터랙션 후 필요)
 */
export async function resumeAudioContext(): Promise<void> {
    const ctx = getSharedAudioContext();
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
}

/**
 * AudioContext 싱글톤 훅
 * - 페이지 전체에서 하나의 AudioContext 공유
 * - 메트로놈과 음원이 동일한 타임라인 사용
 */
export function useAudioContext() {
    const [isReady, setIsReady] = useState(false);
    const contextRef = useRef<AudioContext | null>(null);

    useEffect(() => {
        contextRef.current = getSharedAudioContext();
        setIsReady(contextRef.current.state === 'running');

        const handleStateChange = () => {
            setIsReady(contextRef.current?.state === 'running');
        };

        contextRef.current.addEventListener('statechange', handleStateChange);

        return () => {
            contextRef.current?.removeEventListener('statechange', handleStateChange);
        };
    }, []);

    const resume = useCallback(async () => {
        await resumeAudioContext();
        setIsReady(true);
    }, []);

    const getCurrentTime = useCallback((): number => {
        return contextRef.current?.currentTime ?? 0;
    }, []);

    return {
        context: contextRef.current,
        isReady,
        resume,
        getCurrentTime
    };
}

export default useAudioContext;
