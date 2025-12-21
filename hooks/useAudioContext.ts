'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import {
    getSharedAudioContext,
    resumeAudioContext,
    getAudioContextState,
    getAudioContextCurrentTime,
    onAudioContextStateChange
} from '@/utils/sharedAudioContext';

// Re-export for backward compatibility
export { getSharedAudioContext, resumeAudioContext } from '@/utils/sharedAudioContext';

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
        setIsReady(getAudioContextState() === 'running');

        const unsubscribe = onAudioContextStateChange((state) => {
            setIsReady(state === 'running');
        });

        return unsubscribe;
    }, []);

    const resume = useCallback(async () => {
        await resumeAudioContext();
        setIsReady(true);
    }, []);

    const getCurrentTime = useCallback((): number => {
        return getAudioContextCurrentTime();
    }, []);

    return {
        context: contextRef.current,
        isReady,
        resume,
        getCurrentTime
    };
}

export default useAudioContext;
