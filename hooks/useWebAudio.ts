'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// AudioUrls 타입 정의
export interface AudioUrls {
  intro: string;
  chorus: string;
  outro: string;
}

// 훅 반환 타입
export interface UseWebAudioReturn {
  isLoading: boolean;
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  loadAudio: (urls: AudioUrls) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  stop: () => void;
}

// Safari 호환 AudioContext 타입
type AudioContextType = AudioContext | typeof window.webkitAudioContext;

// window 타입 확장 (Safari용)
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

/**
 * Web Audio API 기반 오디오 재생 훅
 * intro + chorus×4 + outro를 하나의 연속 버퍼로 합성하여 재생
 */
export function useWebAudio(): UseWebAudioReturn {
  // 상태
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const combinedBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0); // AudioContext.currentTime at play start
  const pauseOffsetRef = useRef<number>(0); // 일시정지 시 위치
  const animationFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false); // isPlaying의 ref 버전 (콜백에서 사용)
  const durationRef = useRef(0); // duration의 ref 버전

  // isPlaying 상태와 ref 동기화
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // duration 상태와 ref 동기화
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  /**
   * AudioContext 초기화 (Safari 폴백 포함)
   */
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    return audioContextRef.current;
  }, []);

  /**
   * URL에서 AudioBuffer 로드
   */
  const fetchAudioBuffer = useCallback(async (
    context: AudioContext,
    url: string
  ): Promise<AudioBuffer> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return context.decodeAudioData(arrayBuffer);
  }, []);

  /**
   * 여러 AudioBuffer를 하나로 합성
   * intro + chorus×4 + outro
   */
  const combineBuffers = useCallback((
    context: AudioContext,
    intro: AudioBuffer,
    chorus: AudioBuffer,
    outro: AudioBuffer
  ): AudioBuffer => {
    // 총 길이 계산: intro + chorus×4 + outro
    const totalLength = intro.length + (chorus.length * 4) + outro.length;
    const sampleRate = intro.sampleRate;
    const numberOfChannels = Math.max(intro.numberOfChannels, chorus.numberOfChannels, outro.numberOfChannels);

    // 🧪 디버깅 로그
    console.log('🎵 [combineBuffers] Buffer info:', {
      intro: { length: intro.length, duration: intro.duration.toFixed(2) + 's' },
      chorus: { length: chorus.length, duration: chorus.duration.toFixed(2) + 's' },
      outro: { length: outro.length, duration: outro.duration.toFixed(2) + 's' },
      totalLength,
      expectedTotal: intro.length + (chorus.length * 4) + outro.length,
      numberOfChannels,
      sampleRate,
    });

    // 새 버퍼 생성
    const combined = context.createBuffer(numberOfChannels, totalLength, sampleRate);

    // 각 채널에 데이터 복사
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const outputData = combined.getChannelData(channel);

      // 각 채널마다 offset을 0부터 시작 (이전 버그: offset이 채널 간 누적됨)
      let offset = 0;

      // 1. Intro 복사
      const introData = channel < intro.numberOfChannels
        ? intro.getChannelData(channel)
        : intro.getChannelData(0);
      console.log(`🎵 [combineBuffers] Ch${channel} - Intro: offset=${offset}, length=${introData.length}`);
      outputData.set(introData, offset);
      offset += intro.length;

      // 2. Chorus × 4 복사
      const chorusData = channel < chorus.numberOfChannels
        ? chorus.getChannelData(channel)
        : chorus.getChannelData(0);
      for (let i = 0; i < 4; i++) {
        console.log(`🎵 [combineBuffers] Ch${channel} - Chorus[${i}]: offset=${offset}, length=${chorusData.length}`);
        outputData.set(chorusData, offset);
        offset += chorus.length;
      }

      // 3. Outro 복사
      const outroData = channel < outro.numberOfChannels
        ? outro.getChannelData(channel)
        : outro.getChannelData(0);
      console.log(`🎵 [combineBuffers] Ch${channel} - Outro: offset=${offset}, length=${outroData.length}`);
      outputData.set(outroData, offset);
      offset += outro.length;

      console.log(`🎵 [combineBuffers] Ch${channel} - Final offset=${offset}, totalLength=${totalLength}`);
    }

    return combined;
  }, []);

  /**
   * 현재 재생 시간 업데이트 (requestAnimationFrame)
   */
  const updateCurrentTime = useCallback(() => {
    if (!audioContextRef.current || !isPlaying) return;

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const newTime = pauseOffsetRef.current + elapsed;

    // duration을 넘지 않도록 제한
    if (newTime >= duration && duration > 0) {
      setCurrentTime(duration);
      setIsPlaying(false);
      pauseOffsetRef.current = 0;
      return;
    }

    setCurrentTime(newTime);
    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, [isPlaying, duration]);

  /**
   * 오디오 파일 로드 및 합성
   */
  const loadAudio = useCallback(async (urls: AudioUrls): Promise<void> => {
    console.log('🎵 [loadAudio] Starting audio load...', urls);

    setIsLoading(true);
    setIsReady(false);
    setCurrentTime(0);
    setDuration(0);
    pauseOffsetRef.current = 0;
    isPlayingRef.current = false;
    setIsPlaying(false);

    // 이전 재생 완전 정지 및 버퍼 초기화
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null; // 콜백 제거
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // 이미 정지됨
      }
      sourceNodeRef.current = null;
    }

    // 이전 버퍼 초기화 (중요: 새 곡 로드 전 기존 버퍼 제거)
    combinedBufferRef.current = null;
    console.log('🎵 [loadAudio] 이전 버퍼 초기화 완료');

    try {
      // Step 1: AudioContext 초기화
      console.log('🎵 [loadAudio] Step 1: Getting AudioContext...');
      const context = getAudioContext();
      console.log('🎵 [loadAudio] AudioContext state:', context.state, 'sampleRate:', context.sampleRate);

      // AudioContext가 suspended 상태여도 진행 (파일 로드/디코딩은 가능)
      // resume은 play() 시점에 처리
      if (context.state === 'suspended') {
        console.log('🎵 [loadAudio] AudioContext is suspended - will resume on play()');
      }

      // Step 2: 파일 fetch
      console.log('🎵 [loadAudio] Step 2: Fetching audio files...');

      let introResponse: Response, chorusResponse: Response, outroResponse: Response;
      try {
        [introResponse, chorusResponse, outroResponse] = await Promise.all([
          fetch(urls.intro),
          fetch(urls.chorus),
          fetch(urls.outro),
        ]);
        console.log('🎵 [loadAudio] Fetch results:', {
          intro: { ok: introResponse.ok, status: introResponse.status, size: introResponse.headers.get('content-length') },
          chorus: { ok: chorusResponse.ok, status: chorusResponse.status, size: chorusResponse.headers.get('content-length') },
          outro: { ok: outroResponse.ok, status: outroResponse.status, size: outroResponse.headers.get('content-length') },
        });
      } catch (fetchError) {
        console.error('🔴 [loadAudio] Fetch failed:', fetchError);
        throw fetchError;
      }

      if (!introResponse.ok || !chorusResponse.ok || !outroResponse.ok) {
        const errorMsg = `Fetch failed: intro=${introResponse.status}, chorus=${chorusResponse.status}, outro=${outroResponse.status}`;
        console.error('🔴 [loadAudio]', errorMsg);
        throw new Error(errorMsg);
      }

      // Step 3: ArrayBuffer 변환
      console.log('🎵 [loadAudio] Step 3: Converting to ArrayBuffer...');
      let introArrayBuffer: ArrayBuffer, chorusArrayBuffer: ArrayBuffer, outroArrayBuffer: ArrayBuffer;
      try {
        [introArrayBuffer, chorusArrayBuffer, outroArrayBuffer] = await Promise.all([
          introResponse.arrayBuffer(),
          chorusResponse.arrayBuffer(),
          outroResponse.arrayBuffer(),
        ]);
        console.log('🎵 [loadAudio] ArrayBuffer sizes:', {
          intro: (introArrayBuffer.byteLength / 1024).toFixed(1) + 'KB',
          chorus: (chorusArrayBuffer.byteLength / 1024).toFixed(1) + 'KB',
          outro: (outroArrayBuffer.byteLength / 1024).toFixed(1) + 'KB',
        });
      } catch (bufferError) {
        console.error('🔴 [loadAudio] ArrayBuffer conversion failed:', bufferError);
        throw bufferError;
      }

      // Step 4: AudioBuffer 디코딩
      console.log('🎵 [loadAudio] Step 4: Decoding audio data...');
      let introBuffer: AudioBuffer, chorusBuffer: AudioBuffer, outroBuffer: AudioBuffer;
      try {
        [introBuffer, chorusBuffer, outroBuffer] = await Promise.all([
          context.decodeAudioData(introArrayBuffer),
          context.decodeAudioData(chorusArrayBuffer),
          context.decodeAudioData(outroArrayBuffer),
        ]);
        console.log('🎵 [loadAudio] Decoded AudioBuffers:', {
          intro: { duration: introBuffer.duration.toFixed(2) + 's', channels: introBuffer.numberOfChannels, sampleRate: introBuffer.sampleRate },
          chorus: { duration: chorusBuffer.duration.toFixed(2) + 's', channels: chorusBuffer.numberOfChannels, sampleRate: chorusBuffer.sampleRate },
          outro: { duration: outroBuffer.duration.toFixed(2) + 's', channels: outroBuffer.numberOfChannels, sampleRate: outroBuffer.sampleRate },
        });
      } catch (decodeError) {
        console.error('🔴 [loadAudio] decodeAudioData failed:', decodeError);
        throw decodeError;
      }

      // Step 5: 버퍼 합성
      console.log('🎵 [loadAudio] Step 5: Combining buffers (intro + chorus×4 + outro)...');
      let combined: AudioBuffer;
      try {
        combined = combineBuffers(context, introBuffer, chorusBuffer, outroBuffer);
        console.log('🎵 [loadAudio] Combined buffer:', {
          duration: combined.duration.toFixed(2) + 's',
          channels: combined.numberOfChannels,
          length: combined.length,
          sampleRate: combined.sampleRate,
        });
      } catch (combineError) {
        console.error('🔴 [loadAudio] Buffer combining failed:', combineError);
        throw combineError;
      }

      combinedBufferRef.current = combined;

      // duration 설정 (초 단위)
      setDuration(combined.duration);
      setIsReady(true);

      console.log('✅ [loadAudio] Audio load complete!', {
        intro: introBuffer.duration.toFixed(2) + 's',
        chorus: chorusBuffer.duration.toFixed(2) + 's × 4',
        outro: outroBuffer.duration.toFixed(2) + 's',
        total: combined.duration.toFixed(2) + 's',
      });
    } catch (error) {
      console.error('🔴 [loadAudio] Failed to load audio:', error);
      if (error instanceof Error) {
        console.error('🔴 [loadAudio] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }
      setIsReady(false);
    } finally {
      setIsLoading(false);
    }
  }, [getAudioContext, combineBuffers]);

  /**
   * 재생 시작 (async - AudioContext resume 대기, ref 기반)
   */
  const play = useCallback(async () => {
    if (!combinedBufferRef.current || !audioContextRef.current) {
      console.warn('🔴 [play] Audio not ready');
      return;
    }

    const context = audioContextRef.current;
    console.log('🎵 [play] Starting playback, AudioContext state:', context.state);

    // AudioContext가 suspended 상태면 resume (사용자 인터랙션 필요)
    if (context.state === 'suspended') {
      console.log('🎵 [play] Resuming suspended AudioContext...');
      try {
        await context.resume();
        console.log('🎵 [play] AudioContext resumed, state:', context.state);
      } catch (error) {
        console.error('🔴 [play] Failed to resume AudioContext:', error);
        return;
      }
    }

    // 이전 sourceNode 정리
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null; // 콜백 제거
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // 이미 정지됨
      }
      sourceNodeRef.current = null;
    }

    // 새 sourceNode 생성
    const source = context.createBufferSource();
    source.buffer = combinedBufferRef.current;
    source.connect(context.destination);

    // 재생 완료 시 처리 (ref 기반) - 반복 재생
    source.onended = () => {
      // ref로 현재 상태 확인 (클로저 문제 방지)
      if (isPlayingRef.current && sourceNodeRef.current === source) {
        console.log('🎵 [play:onended] 재생 완료 → 반복 재생');

        // 처음부터 다시 재생
        pauseOffsetRef.current = 0;
        setCurrentTime(0);

        // 새 source 생성하여 반복 재생
        const ctx = audioContextRef.current;
        const buffer = combinedBufferRef.current;
        if (ctx && buffer) {
          const newSource = ctx.createBufferSource();
          newSource.buffer = buffer;
          newSource.connect(ctx.destination);

          // 새 source에도 같은 onended 핸들러 연결 (재귀적 반복)
          newSource.onended = source.onended;

          startTimeRef.current = ctx.currentTime;
          newSource.start(0, 0);
          sourceNodeRef.current = newSource;
          console.log('🎵 [play:onended] 반복 재생 시작');
        }
      }
    };

    // 현재 위치에서 재생 시작
    startTimeRef.current = context.currentTime;
    source.start(0, pauseOffsetRef.current);
    sourceNodeRef.current = source;
    console.log('🎵 [play] Playback started at offset:', pauseOffsetRef.current.toFixed(2) + 's');

    setIsPlaying(true);
    isPlayingRef.current = true;
  }, []); // 의존성 제거 - ref 사용

  /**
   * 일시정지 (더 안전하게)
   */
  const pause = useCallback(() => {
    console.log('🎵 [pause] 호출됨, isPlaying:', isPlayingRef.current);

    if (!audioContextRef.current) {
      console.log('🎵 [pause] AudioContext 없음');
      return;
    }

    // 현재 위치 저장
    if (isPlayingRef.current) {
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
      pauseOffsetRef.current += elapsed;
      console.log('🎵 [pause] 저장된 위치:', pauseOffsetRef.current.toFixed(2) + 's');
    }

    // sourceNode 정지
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null; // 콜백 제거
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // 이미 정지됨
      }
      sourceNodeRef.current = null;
    }

    setIsPlaying(false);
    isPlayingRef.current = false;
    console.log('🎵 [pause] 완료');
  }, []);

  /**
   * 특정 위치로 이동 (ref 기반으로 안전하게)
   */
  const seek = useCallback((time: number) => {
    const dur = durationRef.current;
    const clampedTime = Math.max(0, Math.min(time, dur));

    console.log('🎵 [seek]', { time, clampedTime, isPlaying: isPlayingRef.current });

    pauseOffsetRef.current = clampedTime;
    setCurrentTime(clampedTime);

    // 재생 중이면 새 위치에서 재시작
    if (isPlayingRef.current && combinedBufferRef.current && audioContextRef.current) {
      // 현재 재생 중지
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.onended = null; // 콜백 제거 (중복 호출 방지)
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch {
          // 이미 정지됨
        }
        sourceNodeRef.current = null;
      }

      // 새 위치에서 재생
      const context = audioContextRef.current;
      const source = context.createBufferSource();
      source.buffer = combinedBufferRef.current;
      source.connect(context.destination);

      source.onended = () => {
        // ref로 현재 상태 확인 (클로저 문제 방지) - 반복 재생
        if (isPlayingRef.current && sourceNodeRef.current === source) {
          console.log('🎵 [seek:onended] 재생 완료 → 반복 재생');

          // 처음부터 다시 재생
          pauseOffsetRef.current = 0;
          setCurrentTime(0);

          // 새 source 생성하여 반복 재생
          const ctx = audioContextRef.current;
          const buffer = combinedBufferRef.current;
          if (ctx && buffer) {
            const newSource = ctx.createBufferSource();
            newSource.buffer = buffer;
            newSource.connect(ctx.destination);

            // 새 source에도 같은 onended 핸들러 연결 (재귀적 반복)
            newSource.onended = source.onended;

            startTimeRef.current = ctx.currentTime;
            newSource.start(0, 0);
            sourceNodeRef.current = newSource;
            console.log('🎵 [seek:onended] 반복 재생 시작');
          }
        }
      };

      startTimeRef.current = context.currentTime;
      source.start(0, clampedTime);
      sourceNodeRef.current = source;
    }
  }, []); // 의존성 없음 - ref 사용

  /**
   * 정지 + 처음으로 (더 안전하게)
   */
  const stop = useCallback(() => {
    console.log('🎵 [stop] 호출됨');

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null; // 콜백 제거
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // 이미 정지됨
      }
      sourceNodeRef.current = null;
    }

    pauseOffsetRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
    isPlayingRef.current = false;
    console.log('🎵 [stop] 완료');
  }, []);

  // currentTime 업데이트 effect
  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, updateCurrentTime]);

  // 컴포넌트 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      // sourceNode 정리
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch {
          // 이미 정지됨
        }
      }

      // AudioContext 정리
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      // animationFrame 정리
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    isLoading,
    isReady,
    isPlaying,
    currentTime,
    duration,
    loadAudio,
    play,
    pause,
    seek,
    stop,
  };
}

export default useWebAudio;
