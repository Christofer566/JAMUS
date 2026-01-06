'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { NoteData } from '@/types/note';
import { OutputInstrument, ConversionState, INITIAL_CONVERSION_STATE } from '@/types/instrument';
import { getSharedAudioContext } from '@/utils/sharedAudioContext';

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
  previewNote: (pitch: string, duration?: number) => Promise<void>;
  cleanup: () => void;
  isModelSupported: () => boolean;
}

/**
 * Synth 생성 헬퍼 함수
 */
function createSynth(instrument: OutputInstrument): Tone.PolySynth | null {
  if (instrument === 'piano') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle', partialCount: 3 },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 1 }
    }).toDestination();
  } else if (instrument === 'guitar') {
    return new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth', partialCount: 8 },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.8 }
    }).toDestination();
  }
  return null;
}

export function useVoiceToInstrument(): UseVoiceToInstrumentReturn {
  const [conversionState, setConversionState] = useState<ConversionState>(INITIAL_CONVERSION_STATE);
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const currentInstrumentRef = useRef<OutputInstrument | null>(null);
  const contextInitialized = useRef(false);

  /**
   * Tone.js를 공유 AudioContext에 연결 (타이밍 동기화)
   */
  useEffect(() => {
    if (typeof window === 'undefined' || contextInitialized.current) return;

    try {
      const sharedContext = getSharedAudioContext();
      Tone.setContext(sharedContext);
      contextInitialized.current = true;
      console.log('🎹 [Tone.js] 공유 AudioContext에 연결됨 - 타이밍 동기화 완료');
    } catch (error) {
      console.error('🎹 [Tone.js] AudioContext 연결 실패:', error);
    }
  }, []);

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

      synthRef.current = createSynth(instrument);
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
   *
   * 수직선 동기화:
   * - 수직선은 webAudio.currentTime 기준으로 표시됨
   * - Tone.js는 Tone.now() 기준으로 예약됨
   * - 두 클럭 간 지연이 있으므로 SYNC_DELAY_SEC를 추가하여 보정
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

      const secondsPerBeat = 60 / bpm;
      const now = Tone.now();

      // 수직선과 Tone.js 동기화 (0: 정확한 비트에 재생)
      const SYNC_DELAY_SLOTS = 0;
      const SYNC_DELAY_SEC = (SYNC_DELAY_SLOTS / 4) * secondsPerBeat;

      // startTime(초)을 beat으로 변환
      const startBeat = startTime / secondsPerBeat;

      let scheduledCount = 0;
      let skippedCount = 0;

      // 🔍 첫 5개 음표의 상세 타이밍 디버깅
      console.log('🔍 [DEBUG] 첫 5개 음표 타이밍:', {
        now: now.toFixed(3),
        startTime: startTime.toFixed(3),
        startBeat: startBeat.toFixed(3),
        secondsPerBeat: secondsPerBeat.toFixed(3),
        syncDelay: SYNC_DELAY_SEC.toFixed(3)
      });

      notes.slice(0, 5).forEach((note, i) => {
        const triggerTime = now + (note.beat - startBeat) * secondsPerBeat + SYNC_DELAY_SEC;
        const delay = triggerTime - now;
        console.log(`  [${i}] ${note.pitch} (beat=${note.beat.toFixed(2)}, measure=${note.measureIndex}):`, {
          triggerTime: triggerTime.toFixed(3),
          delay: delay.toFixed(3) + 's',
          willSkip: delay < 0
        });
      });

      notes.forEach(note => {
        // 음표의 트리거 시간 계산 (현재 재생 위치 기준 + 동기화 지연)
        const triggerTime = now + (note.beat - startBeat) * secondsPerBeat + SYNC_DELAY_SEC;
        const delay = triggerTime - now;

        // 너무 지난 음표는 스킵 (1비트 이상 지남)
        if (delay < -secondsPerBeat) {
          skippedCount++;
          return;
        }

        const durationInBeats = durationToBeats(note.duration);
        const durationInSeconds = durationInBeats * secondsPerBeat;

        // 약간 지난 음표(SYNC_DELAY로 인한)는 즉시 재생
        const actualTriggerTime = triggerTime < now ? now + 0.01 : triggerTime;

        synthRef.current?.triggerAttackRelease(
          note.pitch,
          durationInSeconds,
          actualTriggerTime
        );
        scheduledCount++;
      });

      console.log('🎹 [Tone.js] 음표 재생 시작', {
        totalNotes: notes.length,
        scheduled: scheduledCount,
        skipped: skippedCount,
        bpm,
        startTime: startTime.toFixed(2) + 's',
        startBeat: startBeat.toFixed(1),
        syncDelay: SYNC_DELAY_SEC.toFixed(3) + 's'
      });

    } catch (error) {
      console.error('🎹 [Tone.js] 재생 중 에러:', error);
    }
  }, []);

  /**
   * 재생 중지
   * - releaseAll()은 현재 재생 중인 음표만 중지
   * - 미래에 예약된 음표를 취소하려면 synth를 dispose하고 재생성해야 함
   */
  const stopFallbackPlayback = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.releaseAll();
      synthRef.current.dispose();

      // 즉시 재생성 (미래 예약 이벤트 모두 취소됨)
      if (currentInstrumentRef.current && currentInstrumentRef.current !== 'raw') {
        synthRef.current = createSynth(currentInstrumentRef.current);
        console.log('🎹 [Tone.js] 재생 중지 및 synth 재생성');
      } else {
        synthRef.current = null;
        console.log('🎹 [Tone.js] 재생 중지');
      }
    }
  }, []);

  /**
   * 음표 미리듣기 (짧게 재생)
   */
  const previewNote = useCallback(async (pitch: string, duration: number = 0.3) => {
    if (!synthRef.current) {
      console.warn('🎹 [Preview] 신디사이저가 로드되지 않음');
      return;
    }

    try {
      // AudioContext 활성화 후 재생 (첫 클릭에서 필요)
      await Tone.start();
      synthRef.current.triggerAttackRelease(pitch, duration);
      console.log(`🎹 [Preview] ${pitch} 미리듣기 (${duration}s)`);
    } catch (error) {
      console.error('🎹 [Preview] 재생 중 에러:', error);
    }
  }, []);

  /**
   * 리소스 정리
   */
  const cleanup = useCallback(() => {
    if (synthRef.current) {
      try {
        synthRef.current.dispose();
      } catch (e) {
        // 무시
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
    previewNote,
    cleanup,
    isModelSupported,
  };
}

export default useVoiceToInstrument;
