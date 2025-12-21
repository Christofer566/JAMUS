'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { getSharedAudioContext, resumeAudioContext } from '@/utils/sharedAudioContext';

// AudioUrls 타입 정의
export interface AudioUrls {
  intro: string;
  chorus: string;
  outro: string;
}

// 훅 옵션 타입
export interface UseWebAudioOptions {
  chorusRepeat?: number; // chorus 반복 횟수 (기본값: 4, Single은 1)
}

// 훅 반환 타입
export interface UseWebAudioReturn {
  isLoading: boolean;
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  loadAudio: (urls: AudioUrls) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  stop: () => void;
  setVolume: (value: number) => void;
}

/**
 * Web Audio API 기반 오디오 재생 훅
 * intro + chorus×N + outro를 하나의 연속 버퍼로 합성하여 재생
 *
 * @param options.chorusRepeat - chorus 반복 횟수 (기본값: 4 for Feed, 1 for Single)
 */
export function useWebAudio(options: UseWebAudioOptions = {}): UseWebAudioReturn {
  const { chorusRepeat = 4 } = options;
  // 상태
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1); // 0~1 범위

  // refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const combinedBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null); // 볼륨 조절용
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
   * 공유 AudioContext 획득 (싱글톤)
   */
  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = getSharedAudioContext();

      // GainNode 생성 (볼륨 조절용) - 이 훅 전용
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.connect(audioContextRef.current.destination);
      gainNodeRef.current.gain.value = volume;
    }
    return audioContextRef.current;
  }, [volume]);

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
   * intro + chorus×N + outro
   */
  const combineBuffers = useCallback((
    context: AudioContext,
    intro: AudioBuffer,
    chorus: AudioBuffer,
    outro: AudioBuffer
  ): AudioBuffer => {
    // 총 길이 계산: intro + chorus×N + outro
    const totalLength = intro.length + (chorus.length * chorusRepeat) + outro.length;
    const sampleRate = intro.sampleRate;
    const numberOfChannels = Math.max(intro.numberOfChannels, chorus.numberOfChannels, outro.numberOfChannels);

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
      outputData.set(introData, offset);
      offset += intro.length;

      // 2. Chorus × N 복사
      const chorusData = channel < chorus.numberOfChannels
        ? chorus.getChannelData(channel)
        : chorus.getChannelData(0);
      for (let i = 0; i < chorusRepeat; i++) {
        outputData.set(chorusData, offset);
        offset += chorus.length;
      }

      // 3. Outro 복사
      const outroData = channel < outro.numberOfChannels
        ? outro.getChannelData(channel)
        : outro.getChannelData(0);
      outputData.set(outroData, offset);
      offset += outro.length;
    }

    return combined;
  }, [chorusRepeat]);

  /**
   * 현재 재생 시간 업데이트 (requestAnimationFrame)
   * ref 기반으로 stale closure 문제 해결
   */
  const updateCurrentTime = useCallback(() => {
    if (!isPlayingRef.current) return;

    if (!audioContextRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
      return;
    }

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const newTime = pauseOffsetRef.current + elapsed;
    const dur = durationRef.current;

    if (newTime >= dur && dur > 0) {
      setCurrentTime(dur);
      setIsPlaying(false);
      isPlayingRef.current = false;
      pauseOffsetRef.current = 0;
      return;
    }

    setCurrentTime(newTime);
    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, []);

  /**
   * 오디오 파일 로드 및 합성
   */
  const loadAudio = useCallback(async (urls: AudioUrls): Promise<void> => {
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
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // 이미 정지됨
      }
      sourceNodeRef.current = null;
    }
    combinedBufferRef.current = null;

    try {
      const context = getAudioContext();

      const [introResponse, chorusResponse, outroResponse] = await Promise.all([
        fetch(urls.intro),
        fetch(urls.chorus),
        fetch(urls.outro),
      ]);

      if (!introResponse.ok || !chorusResponse.ok || !outroResponse.ok) {
        throw new Error(`Fetch failed: intro=${introResponse.status}, chorus=${chorusResponse.status}, outro=${outroResponse.status}`);
      }

      const [introArrayBuffer, chorusArrayBuffer, outroArrayBuffer] = await Promise.all([
        introResponse.arrayBuffer(),
        chorusResponse.arrayBuffer(),
        outroResponse.arrayBuffer(),
      ]);

      const [introBuffer, chorusBuffer, outroBuffer] = await Promise.all([
        context.decodeAudioData(introArrayBuffer),
        context.decodeAudioData(chorusArrayBuffer),
        context.decodeAudioData(outroArrayBuffer),
      ]);

      const combined = combineBuffers(context, introBuffer, chorusBuffer, outroBuffer);
      combinedBufferRef.current = combined;
      setDuration(combined.duration);
      setIsReady(true);
    } catch (error) {
      console.error('[loadAudio] Failed:', error);
      setIsReady(false);
    } finally {
      setIsLoading(false);
    }
  }, [getAudioContext, combineBuffers]);

  /**
   * 재생 시작 (async - AudioContext resume 대기, ref 기반)
   */
  const play = useCallback(async () => {
    if (!combinedBufferRef.current || !audioContextRef.current) return;

    const context = audioContextRef.current;

    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch (error) {
        console.error('[play] Failed to resume AudioContext:', error);
        return;
      }
    }

    // 이전 sourceNode 정리
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
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
    if (gainNodeRef.current) {
      source.connect(gainNodeRef.current);
    } else {
      source.connect(context.destination);
    }

    // 재생 완료 시 반복 재생 처리
    source.onended = () => {
      if (isPlayingRef.current && sourceNodeRef.current === source) {
        pauseOffsetRef.current = 0;
        setCurrentTime(0);

        const ctx = audioContextRef.current;
        const buffer = combinedBufferRef.current;
        if (ctx && buffer) {
          const newSource = ctx.createBufferSource();
          newSource.buffer = buffer;
          if (gainNodeRef.current) {
            newSource.connect(gainNodeRef.current);
          } else {
            newSource.connect(ctx.destination);
          }
          newSource.onended = source.onended;
          startTimeRef.current = ctx.currentTime;
          newSource.start(0, 0);
          sourceNodeRef.current = newSource;
        }
      }
    };

    startTimeRef.current = context.currentTime;
    source.start(0, pauseOffsetRef.current);
    sourceNodeRef.current = source;
    isPlayingRef.current = true;
    setIsPlaying(true);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const tick = () => {
      if (!isPlayingRef.current) return;

      const ctx = audioContextRef.current;
      if (!ctx) {
        animationFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const elapsed = ctx.currentTime - startTimeRef.current;
      const newTime = pauseOffsetRef.current + elapsed;
      const dur = durationRef.current;

      if (newTime >= dur && dur > 0) {
        setCurrentTime(dur);
        setIsPlaying(false);
        isPlayingRef.current = false;
        pauseOffsetRef.current = 0;
        return;
      }

      setCurrentTime(newTime);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, []);

  /**
   * 일시정지 (더 안전하게)
   */
  const pause = useCallback(() => {
    if (!audioContextRef.current) return;

    if (isPlayingRef.current) {
      const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
      pauseOffsetRef.current += elapsed;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // 이미 정지됨
      }
      sourceNodeRef.current = null;
    }

    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  /**
   * 특정 위치로 이동 (ref 기반으로 안전하게)
   */
  const seek = useCallback((time: number) => {
    const dur = durationRef.current;
    const clampedTime = Math.max(0, Math.min(time, dur));

    pauseOffsetRef.current = clampedTime;
    setCurrentTime(clampedTime);

    if (isPlayingRef.current && combinedBufferRef.current && audioContextRef.current) {
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.onended = null;
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch {
          // 이미 정지됨
        }
        sourceNodeRef.current = null;
      }

      const context = audioContextRef.current;
      const source = context.createBufferSource();
      source.buffer = combinedBufferRef.current;
      if (gainNodeRef.current) {
        source.connect(gainNodeRef.current);
      } else {
        source.connect(context.destination);
      }

      source.onended = () => {
        if (isPlayingRef.current && sourceNodeRef.current === source) {
          pauseOffsetRef.current = 0;
          setCurrentTime(0);

          const ctx = audioContextRef.current;
          const buffer = combinedBufferRef.current;
          if (ctx && buffer) {
            const newSource = ctx.createBufferSource();
            newSource.buffer = buffer;
            if (gainNodeRef.current) {
              newSource.connect(gainNodeRef.current);
            } else {
              newSource.connect(ctx.destination);
            }
            newSource.onended = source.onended;
            startTimeRef.current = ctx.currentTime;
            newSource.start(0, 0);
            sourceNodeRef.current = newSource;
          }
        }
      };

      startTimeRef.current = context.currentTime;
      source.start(0, clampedTime);
      sourceNodeRef.current = source;
    }
  }, []);

  /**
   * 정지 + 처음으로 (더 안전하게)
   */
  const stop = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
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
  }, []);

  /**
   * 볼륨 설정 (0~1 범위)
   */
  const setVolume = useCallback((value: number) => {
    const clampedVolume = Math.max(0, Math.min(1, value));
    setVolumeState(clampedVolume);

    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(
        clampedVolume,
        audioContextRef.current.currentTime,
        0.015
      );
    }
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.onended = null;
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch {
          // 이미 정지됨
        }
        sourceNodeRef.current = null;
      }

      if (gainNodeRef.current) {
        try {
          gainNodeRef.current.disconnect();
        } catch {
          // 이미 연결 해제됨
        }
        gainNodeRef.current = null;
      }

      // 공유 AudioContext는 닫지 않음 - ref만 초기화
      audioContextRef.current = null;

      combinedBufferRef.current = null;
    };
  }, []);

  return {
    isLoading,
    isReady,
    isPlaying,
    currentTime,
    duration,
    volume,
    loadAudio,
    play,
    pause,
    seek,
    stop,
    setVolume,
  };
}

export default useWebAudio;
