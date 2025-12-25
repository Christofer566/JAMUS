'use client';

import { useState, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { NoteData } from '@/types/note';
import { OutputInstrument, ConversionState, INITIAL_CONVERSION_STATE } from '@/types/instrument';

/**
 * ========================================
 * [ACTIVE] Tone.js 기반 폴백 재생
 * ========================================
 * - PolySynth를 사용하여 음표를 악기 소리로 재생
 * - 실시간 오디오 변환은 없음 (폴백 모드)
 */

/**
 * ========================================
 * [TODO] Magenta.js 구현 (미래)
 * ========================================
 * 계획:
 * 1. @magenta/music 패키지 사용
 * 2. DDSP 모델 로드 (piano/guitar 음색 변환)
 * 3. 오디오 → MIDI 변환
 * 4. MIDI → 악기 음색 변환
 *
 * 참고:
 * - https://github.com/magenta/magenta-js
 * - https://magenta.tensorflow.org/ddsp
 * ========================================
 */

interface UseVoiceToInstrumentReturn {
  conversionState: ConversionState;
  loadModel: (instrument: OutputInstrument) => Promise<boolean>;
  convertAudio: (audioBlob: Blob) => Promise<Blob | null>;
  playNotesAsFallback: (notes: NoteData[], bpm: number, startTime?: number) => Promise<void>;
  stopFallbackPlayback: () => void;
  cleanup: () => void;
  isModelSupported: () => boolean;
}

export function useVoiceToInstrument(): UseVoiceToInstrumentReturn {
  const [conversionState, setConversionState] = useState<ConversionState>(INITIAL_CONVERSION_STATE);
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const currentInstrumentRef = useRef<OutputInstrument | null>(null);

  /**
   * 브라우저 오디오 지원 확인
   */
  const isModelSupported = useCallback((): boolean => {
    return typeof window !== 'undefined' && typeof AudioContext !== 'undefined';
  }, []);

  /**
   * Tone.js 신디사이저 로드
   */
  const loadModel = useCallback(async (instrument: OutputInstrument): Promise<boolean> => {
    if (instrument === 'raw') {
      return true;
    }

    try {
      console.log(`🎹 [Tone.js] ${instrument} 신디사이저 로드 중...`);

      // PolySynth 생성
      synthRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
      currentInstrumentRef.current = instrument;

      console.log(`🎹 [Tone.js] ${instrument} 신디사이저 로드 완료`);
      return true;

    } catch (error) {
      console.error('🎹 [Tone.js] 모델 로드 실패:', error);
      return false;
    }
  }, []);

  /**
   * 오디오 변환 (폴백 모드에서는 불필요)
   */
  const convertAudio = useCallback(async (audioBlob: Blob): Promise<Blob | null> => {
    console.log('🎹 [Tone.js] 폴백 모드 - 오디오 변환 없음');
    return null;
  }, []);

  /**
   * duration 문자열을 beat 단위로 변환
   * "w" = 4, "h" = 2, "q" = 1, "8" = 0.5, "16" = 0.25
   */
  const durationToBeats = (duration: string): number => {
    const durationMap: Record<string, number> = {
      'w': 4,   // whole note
      'h': 2,   // half note
      'q': 1,   // quarter note
      '8': 0.5, // eighth note
      '16': 0.25 // sixteenth note
    };
    return durationMap[duration] || 1; // 기본값은 quarter note
  };

  /**
   * 음표를 Tone.js로 재생
   */
  const playNotesAsFallback = useCallback(async (
    notes: NoteData[],
    bpm: number,
    startTime: number = 0
  ): Promise<void> => {
    if (!synthRef.current) {
      console.warn('🎹 [Tone.js] 신디사이저가 로드되지 않음');
      return;
    }

    try {
      await Tone.start();
      console.log('🎹 [Tone.js] 음표 재생 시작', { notes: notes.length, bpm, startTime });

      const secondsPerBeat = 60 / bpm;
      const now = Tone.now();

      notes.forEach(note => {
        // beat을 초 단위로 변환
        const triggerTime = now + (note.beat - startTime) * secondsPerBeat;
        const durationInBeats = durationToBeats(note.duration);
        const durationInSeconds = durationInBeats * secondsPerBeat;

        synthRef.current?.triggerAttackRelease(
          note.pitch,
          durationInSeconds,
          triggerTime
        );
      });

    } catch (error) {
      console.error('🎹 [Tone.js] 재생 중 에러:', error);
    }
  }, []);

  /**
   * 재생 중지
   */
  const stopFallbackPlayback = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.releaseAll();
      console.log('🎹 [Tone.js] 재생 중지');
    }
  }, []);

  /**
   * 리소스 정리
   */
  const cleanup = useCallback(() => {
    console.log('🎹 [Tone.js] 리소스 정리');

    if (synthRef.current) {
      try {
        synthRef.current.dispose();
      } catch (e) {
        console.log('🎹 [Tone.js] 정리 중 에러 (무시):', e);
      }
      synthRef.current = null;
    }

    setConversionState(INITIAL_CONVERSION_STATE);
    currentInstrumentRef.current = null;
  }, []);

  return {
    conversionState,
    loadModel,
    convertAudio,
    playNotesAsFallback,
    stopFallbackPlayback,
    cleanup,
    isModelSupported,
  };
}

export default useVoiceToInstrument;
