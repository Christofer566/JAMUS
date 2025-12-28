/**
 * 16슬롯 그리드 기반 Hybrid Pitch Tracking
 *
 * 핵심 개념:
 * - 1마디 = 16슬롯 (16분음표 단위)
 * - 각 슬롯의 점유율과 음정을 분석하여 음표 생성
 * - confidence: high(70%+), medium(50-70%), 제외(50%-)
 */

import { PitchFrame } from '@/types/pitch';
import { NoteData } from '@/types/note';

// ============================================
// Constants
// ============================================
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_MIDI = 69;

// 그리드 분석 파라미터
const SLOTS_PER_MEASURE = 16;           // 1마디 = 16슬롯
const RMS_THRESHOLD = 0.018;            // Phase 40: 0.02 → 0.018 (Missed 음표 구출, Gemini 제안)
const OCCUPANCY_HIGH = 0.70;            // 70% 이상 = 확실
const OCCUPANCY_MIN = 0.70;             // Phase 40: 0.65 → 0.70 (38차 복귀, 노이즈 방어)
const PITCH_CONFIDENCE_MIN = 0.35;      // Phase 40: 0.5 → 0.35 (음정 구출 강화, Gemini 제안)
const GRID_SNAP_TOLERANCE = 0.15;       // 박자 경계 ±15% 허용
const DEFAULT_PITCH = 'C4';             // 음정 감지 실패 시 기본값
const TIMING_OFFSET_SLOTS = 3;          // Phase 35: 2 → 3 (32차 +1슬롯 패턴 보정, Gemini 제안)
const MIN_NOTE_DURATION_SLOTS = 2;      // Phase 1: 최소 음표 길이 (2슬롯)

// 악보 표시 적정 범위 (오선지 중심)
// Phase 15: 4 → 3 (남자 키 정답지 C3-C4 영역에 맞춤)
// Phase 24: 3 → 2 (옥타브 강제 견인 - 배음 오감지 억제, 52.9% 달성!)
// Phase 28: 2 → 3 (복구 시도 → 28차 -12반음 오류 발생)
// Phase 29: 3 → 2 (24차 성공 구조 복귀, Gemini 제안)
// Phase 30: 2 → 3 (TARGET=2 음정 0.0% 실패 → 복구, threshold 1.6으로 배음 억제)
// Phase 32: 3 → 2 (24차 황금 설정 복귀 + 하드웨어 지연 보정 유지, Claude & Gemini 합의)
// Phase 37: 2 → 3 (35차 타이밍 66.7% 복귀 + threshold 1.55 배음 필터 강화, Claude & Gemini 합의)
// Phase 48: 3 → 2 (저음역대 정확도 개선 시도 → 실패, 모든 음이 1옥타브 낮게 감지)
// Phase 49: 2 → 3 (롤백 + 저음역대 피치 보정 강화로 대응)
const TARGET_MIN_OCTAVE = 3;
const TARGET_MAX_OCTAVE = 5;

// ============================================
// Helper Functions
// ============================================
export function frequencyToNote(hz: number, octaveShift: number = 0): string {
  if (hz <= 0) return 'rest';

  const midiNote = Math.round(12 * Math.log2(hz / A4_FREQ) + A4_MIDI);
  let octave = Math.floor(midiNote / 12) - 1 + octaveShift;
  const noteIndex = ((midiNote % 12) + 12) % 12;

  // ========================================
  // Phase 53/66: 저음역대 옥타브 가드레일 (200Hz 설정 복구)
  // 200Hz 이하(G3 영역)에서 옥타브 4 이상은 배음으로 간주하여 강제 하향
  // ========================================
  const LOW_FREQ_OCTAVE_GUARDRAIL = 200;
  if (hz <= LOW_FREQ_OCTAVE_GUARDRAIL && octave >= 4) {
    octave = octave - 1;
  }

  // Phase 42: 옥타브 5 이상 강제 하향
  // 성민님 음역대(옥타브 2-4) 기준, 옥타브 5 이상은 배음일 가능성 높음
  if (octave >= 5) {
    octave = octave - 1;
  }

  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function frequencyToOctave(hz: number): number {
  if (hz <= 0) return -1;
  const midiNote = Math.round(12 * Math.log2(hz / A4_FREQ) + A4_MIDI);
  return Math.floor(midiNote / 12) - 1;
}

export function frequencyToMidi(hz: number): number {
  if (hz <= 0) return -1;
  return Math.round(12 * Math.log2(hz / A4_FREQ) + A4_MIDI);
}

/**
 * Phase 44: Pitch Snap (반음 단위 정밀 보정)
 * Phase 49: 저음역대(200Hz 이하) 강화 - ±75 cents로 확장
 *
 * 감지된 주파수가 특정 음계의 범위 내에 있으면
 * 해당 음의 정확한 주파수로 스냅 (Quantize)
 *
 * @param hz - 원본 주파수
 * @returns 스냅된 주파수 (범위 밖이면 원본 반환)
 */
export function pitchSnap(hz: number): number {
  if (hz <= 0) return hz;

  // 정확한 MIDI 값 계산 (소수점 포함)
  const exactMidi = 12 * Math.log2(hz / A4_FREQ) + A4_MIDI;
  const nearestMidi = Math.round(exactMidi);

  // 센트 차이 계산: 1 semitone = 100 cents
  const centsDeviation = (exactMidi - nearestMidi) * 100;

  // Phase 49: 저음역대에서는 더 넓은 범위로 스냅 (55차 설정 유지)
  const LOW_FREQ_THRESHOLD = 200; // G3(196Hz) 이하
  const SNAP_THRESHOLD_NORMAL = 50;  // 일반: ±50 cents (반음의 절반)
  const SNAP_THRESHOLD_LOW = 75;     // 저음: ±75 cents (반음의 3/4)

  const snapThreshold = hz <= LOW_FREQ_THRESHOLD ? SNAP_THRESHOLD_LOW : SNAP_THRESHOLD_NORMAL;

  if (Math.abs(centsDeviation) <= snapThreshold) {
    // 정확한 반음 주파수 계산: f = A4 * 2^((midi - 69) / 12)
    const snappedHz = A4_FREQ * Math.pow(2, (nearestMidi - A4_MIDI) / 12);
    // Phase 67: PitchSnap 로그 제거 (매우 빈번)
    return snappedHz;
  }

  // 범위 밖이면 원본 반환 (비정상적인 피치)
  // Phase 67: PitchSnap 로그 제거
  return hz;
}

function pitchToMidi(pitch: string): number {
  if (pitch === 'rest') return -1;

  const match = pitch.match(/^([A-G])([#b]?)(\d)$/);
  if (!match) return -1;

  const [, noteName, accidental, octave] = match;
  const noteIndex = NOTE_NAMES.indexOf(noteName + (accidental === '#' ? '#' : ''));
  if (noteIndex === -1) {
    const baseIndex = NOTE_NAMES.indexOf(noteName);
    if (accidental === 'b' && baseIndex > 0) {
      return (parseInt(octave) + 1) * 12 + baseIndex - 1;
    }
    return -1;
  }

  return (parseInt(octave) + 1) * 12 + noteIndex;
}

function isSimilarPitch(pitch1: string, pitch2: string): boolean {
  if (pitch1 === 'rest' || pitch2 === 'rest') return pitch1 === pitch2;

  const midi1 = pitchToMidi(pitch1);
  const midi2 = pitchToMidi(pitch2);

  if (midi1 === -1 || midi2 === -1) return false;

  return Math.abs(midi1 - midi2) <= 1; // 반음 차이 이내
}

function slotCountToDuration(slotCount: number): string {
  if (slotCount >= 16) return 'w';      // 온음표
  if (slotCount >= 8) return 'h';       // 2분음표
  if (slotCount >= 4) return 'q';       // 4분음표
  if (slotCount >= 2) return '8';       // 8분음표
  return '16';                          // 16분음표
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Phase 66: 최빈값(Mode) 함수 - 옥타브 튐 방어
 * Phase 67: 로그 제거 (현재 비활성화 상태)
 * 주파수 배열에서 가장 많이 등장한 MIDI 노트의 대표 주파수 반환
 */
function modeFrequency(arr: number[]): number {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];

  const midiCounts = new Map<number, { count: number; freqs: number[] }>();

  for (const freq of arr) {
    if (freq <= 0) continue;
    const midi = Math.round(12 * Math.log2(freq / A4_FREQ) + A4_MIDI);

    if (!midiCounts.has(midi)) {
      midiCounts.set(midi, { count: 0, freqs: [] });
    }
    const entry = midiCounts.get(midi)!;
    entry.count++;
    entry.freqs.push(freq);
  }

  if (midiCounts.size === 0) return median(arr);

  let maxCount = 0;
  let modeFreqs: number[] = [];

  for (const [, data] of midiCounts) {
    if (data.count > maxCount) {
      maxCount = data.count;
      modeFreqs = data.freqs;
    }
  }

  return median(modeFreqs);
}

/**
 * Phase 2: 옥타브 자동 보정
 * Phase 55: 1.62x threshold 황금 설정
 * Phase 67: 로그 제거
 */
function correctOctaveError(frequency: number, contextFreqs: number[]): number {
  if (frequency <= 0 || contextFreqs.length === 0) return frequency;

  const avgContextFreq = contextFreqs.reduce((sum, f) => sum + f, 0) / contextFreqs.length;

  // Phase 55: 배음 필터 (1.62x threshold - 황금 설정)
  if (frequency > avgContextFreq * 1.62) {
    return frequency / 2;
  }

  // 기본음 누락 보정
  if (frequency < avgContextFreq * 0.55) {
    return frequency * 2;
  }

  return frequency;
}

// ============================================
// Slot Analysis Types
// ============================================
interface SlotData {
  measureIndex: number;
  slotIndex: number;       // 0-15
  globalSlotIndex: number; // 전체 슬롯 인덱스
  startTime: number;
  endTime: number;
  frames: PitchFrame[];
  occupancy: number;
  medianFrequency: number;
  pitch: string;
  confidence: 'high' | 'medium' | 'excluded';
  soundStartOffset: number; // 슬롯 시작 대비 소리 시작 오프셋 (0-1)
}

// ============================================
// Main Conversion Function
// ============================================
/**
 * 오디오 프레임을 음표로 변환
 * @param frames - 피치 프레임 배열
 * @param bpm - BPM
 * @returns NoteData[] - measureIndex는 녹음 시작 기준 상대값 (0부터)
 *          실제 마디 번호는 distributeNotesToMeasures에서 startMeasure를 더해서 계산
 */
export function convertToNotes(frames: PitchFrame[], bpm: number): NoteData[] {
  console.log('[Grid] ========== 16슬롯 그리드 분석 시작 ==========');
  console.log('[Grid] 입력:', { 프레임수: frames.length, bpm });

  if (frames.length === 0) {
    console.log('[Grid] 입력 프레임 없음');
    return [];
  }

  const safeBpm = bpm > 0 ? bpm : 120;
  const beatDuration = 60 / safeBpm;                    // 1박 길이 (초)
  const slotDuration = beatDuration / 4;                // 1슬롯 = 16분음표 = 1/4박
  const measureDuration = beatDuration * 4;             // 1마디 = 4박

  console.log('[Grid] BPM:', safeBpm, '슬롯 길이:', (slotDuration * 1000).toFixed(1), 'ms');

  // 전체 오디오 길이 계산
  const totalDuration = frames[frames.length - 1].time;
  const totalMeasures = Math.ceil(totalDuration / measureDuration);
  const totalSlots = totalMeasures * SLOTS_PER_MEASURE;

  console.log('[Grid] 총 마디:', totalMeasures, '총 슬롯:', totalSlots);

  // ========================================
  // Step 1: 옥타브 자동 조정 계산 (MPM 보정 고려)
  // ========================================
  const allValidFrames = frames.filter(
    f => f.confidence >= PITCH_CONFIDENCE_MIN && f.frequency > 0
  );
  const allValidFreqs = allValidFrames.map(f => f.frequency);

  // MPM 보정 비율 계산
  const mpmCorrectedCount = allValidFrames.filter(f => f.isMpmCorrected === true).length;
  const mpmCorrectionRatio = allValidFrames.length > 0
    ? mpmCorrectedCount / allValidFrames.length
    : 0;

  // ========================================
  // Octave Shift 계산 (자동 - 모든 솔로 음역대 대응)
  // ========================================
  const rawShift = allValidFreqs.length > 0
    ? frequencyToOctave(median(allValidFreqs))
    : 4;

  const targetShift = TARGET_MIN_OCTAVE;
  const octaveShift = targetShift - rawShift;

  console.log('[Grid] Octave Shift 계산:', {
    전체평균옥타브: rawShift,
    목표옥타브: targetShift,
    MPM보정비율: `${(mpmCorrectionRatio * 100).toFixed(1)}%`,
    최종shift: octaveShift,
    설명: 'MPM 비율과 무관하게 평균 옥타브 기반 자동 계산'
  });

  // ========================================
  // Step 2: 전체 슬롯 그리드 생성 및 분석
  // ========================================
  const slots: SlotData[] = [];
  let highCount = 0, mediumCount = 0, emptyCount = 0;

  for (let globalSlot = 0; globalSlot < totalSlots; globalSlot++) {
    const measureIndex = Math.floor(globalSlot / SLOTS_PER_MEASURE);
    const slotIndex = globalSlot % SLOTS_PER_MEASURE;
    const startTime = globalSlot * slotDuration;
    const endTime = (globalSlot + 1) * slotDuration;

    // 해당 슬롯 시간 범위 내의 프레임 수집
    const slotFrames = frames.filter(f => f.time >= startTime && f.time < endTime);

    const slot: SlotData = {
      measureIndex: measureIndex,  // 녹음 시작 기준 상대값 (0부터)
      slotIndex,
      globalSlotIndex: globalSlot,
      startTime,
      endTime,
      frames: slotFrames,
      occupancy: 0,
      medianFrequency: 0,
      pitch: DEFAULT_PITCH,
      confidence: 'excluded',
      soundStartOffset: 0
    };

    if (slotFrames.length === 0) {
      slot.confidence = 'excluded';
      emptyCount++;
      slots.push(slot);
      continue;
    }

    // 점유율 계산: frequency > 0 또는 confidence > 0인 프레임 비율
    const soundFrames = slotFrames.filter(f => f.frequency > 0 || f.confidence > 0);
    slot.occupancy = soundFrames.length / slotFrames.length;

    // 점유율에 따른 confidence 판정
    if (slot.occupancy >= OCCUPANCY_HIGH) {
      slot.confidence = 'high';
      highCount++;
    } else if (slot.occupancy >= OCCUPANCY_MIN) {
      slot.confidence = 'medium';
      mediumCount++;
    } else {
      slot.confidence = 'excluded';
      emptyCount++;
      slots.push(slot);
      continue;
    }

    // 음정 결정 (유효 프레임의 중간값)
    // Phase 2: 사람 목소리 범위 (C2: 65Hz ~ C6: 1047Hz)
    const validFramesInSlot = slotFrames.filter(
      f => f.confidence >= PITCH_CONFIDENCE_MIN && f.frequency >= 65 && f.frequency <= 1047
    );
    const validFreqs = validFramesInSlot.map(f => f.frequency);

    if (validFreqs.length > 0) {
      // Phase 63 복구: median 사용 (66차 Mode 필터 비활성화)
      slot.medianFrequency = median(validFreqs);

      // Phase 2: 옥타브 자동 보정 (주변 문맥 기반)
      const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));
      const correctedFreq = correctOctaveError(slot.medianFrequency, contextFreqs);

      // Phase 44: Pitch Snap 적용 (±50 cents 범위 내 반음 스냅)
      const snappedFreq = pitchSnap(correctedFreq);

      // Low Solo 보호: 초저음 솔로 멜로디는 원음 보존
      // Phase 67: 로그 제거
      const LOW_SOLO_THRESHOLD = 90;
      let finalShift = octaveShift;

      if (slot.medianFrequency < LOW_SOLO_THRESHOLD) {
        finalShift = 0;
      }

      slot.pitch = frequencyToNote(snappedFreq, finalShift);
    }

    // 그리드 스냅 검사: 소리 시작점이 슬롯 경계 ±15% 이내인지
    const firstSoundFrame = soundFrames[0];
    if (firstSoundFrame) {
      const offsetRatio = (firstSoundFrame.time - startTime) / slotDuration;
      slot.soundStartOffset = offsetRatio;

      // 슬롯 시작 대비 15% 이상 벗어나면 confidence를 medium으로
      if (offsetRatio > GRID_SNAP_TOLERANCE && slot.confidence === 'high') {
        slot.confidence = 'medium';
        highCount--;
        mediumCount++;
      }
    }

    slots.push(slot);
  }

  // Phase 67: 상세 로그 제거, 슬롯 분포만 유지
  console.log('[Grid] 슬롯 분포:', { high: highCount, medium: mediumCount, empty: emptyCount });

  // ========================================
  // Step 3: 연속 슬롯 병합 → 음표 생성
  // ========================================
  const rawNotes: NoteData[] = [];
  let currentNote: {
    startSlot: SlotData;
    slotCount: number;
    frequencies: number[];
    confidence: 'high' | 'medium';
  } | null = null;

  let lastValidPitch = DEFAULT_PITCH;

  for (const slot of slots) {
    if (slot.confidence === 'excluded') {
      // 현재 음표 종료
      if (currentNote) {
        // Phase 1: 최소 길이 필터링
        if (currentNote.slotCount < MIN_NOTE_DURATION_SLOTS) {
          currentNote = null;
          continue;
        }

        // Phase 63 복구: median 사용 (66차 Mode 필터 비활성화)
        const medianFreq = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
        const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));
        const correctedFreq = medianFreq > 0 ? correctOctaveError(medianFreq, contextFreqs) : 0;

        // Phase 44: Pitch Snap 적용
        const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

        // Low Solo 보호 (Phase 51: 100Hz로 롤백, 49차 최적 설정)
        const LOW_SOLO_THRESHOLD = 100;
        let finalShift = octaveShift;
        if (medianFreq > 0 && medianFreq < LOW_SOLO_THRESHOLD) {
          finalShift = 0;
        }

        const finalPitch = snappedFreq > 0
          ? frequencyToNote(snappedFreq, finalShift)
          : lastValidPitch;

        // Phase 1: 타이밍 오프셋 적용
        let adjustedSlotIndex = currentNote.startSlot.slotIndex + TIMING_OFFSET_SLOTS;
        let adjustedMeasureIndex = currentNote.startSlot.measureIndex;

        // 마디 경계 처리
        if (adjustedSlotIndex >= SLOTS_PER_MEASURE) {
          adjustedSlotIndex -= SLOTS_PER_MEASURE;
          adjustedMeasureIndex++;
        }

        rawNotes.push({
          pitch: finalPitch,
          duration: slotCountToDuration(currentNote.slotCount),
          beat: (adjustedMeasureIndex * SLOTS_PER_MEASURE + adjustedSlotIndex) / 4,
          measureIndex: adjustedMeasureIndex,
          slotIndex: adjustedSlotIndex,
          slotCount: currentNote.slotCount,
          confidence: currentNote.confidence,
          isRest: false
        });

        lastValidPitch = finalPitch;
        currentNote = null;
      }
      continue;
    }

    // 음표로 판정된 슬롯
    if (currentNote === null) {
      // 새 음표 시작
      currentNote = {
        startSlot: slot,
        slotCount: 1,
        frequencies: slot.medianFrequency > 0 ? [slot.medianFrequency] : [],
        confidence: slot.confidence
      };
    } else {
      // 연속 슬롯 확인: 음정이 반음 이내면 병합
      const currentMedianFreq = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
      const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));
      const currentCorrectedFreq = currentMedianFreq > 0 ? correctOctaveError(currentMedianFreq, contextFreqs) : 0;

      // Low Solo 보호
      const LOW_SOLO_THRESHOLD = 100;
      let currentFinalShift = octaveShift;
      if (currentMedianFreq > 0 && currentMedianFreq < LOW_SOLO_THRESHOLD) {
        currentFinalShift = 0;
      }

      const currentPitch = currentCorrectedFreq > 0
        ? frequencyToNote(currentCorrectedFreq, currentFinalShift)
        : lastValidPitch;

      if (isSimilarPitch(currentPitch, slot.pitch)) {
        // 병합
        currentNote.slotCount++;
        if (slot.medianFrequency > 0) {
          currentNote.frequencies.push(slot.medianFrequency);
        }
        // confidence는 더 낮은 것으로
        if (slot.confidence === 'medium') {
          currentNote.confidence = 'medium';
        }
      } else {
        // 음정 다름 → 현재 음표 종료 후 새 음표 시작
        // Phase 63 복구: median 사용 (66차 Mode 필터 비활성화)
        const medianFreq2 = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
        const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));
        const correctedFreq = medianFreq2 > 0 ? correctOctaveError(medianFreq2, contextFreqs) : 0;

        // Phase 44: Pitch Snap 적용
        const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

        // Low Solo 보호 (Phase 51: 100Hz로 롤백, 49차 최적 설정)
        const LOW_SOLO_THRESHOLD = 100;
        let finalShift = octaveShift;
        if (medianFreq2 > 0 && medianFreq2 < LOW_SOLO_THRESHOLD) {
          finalShift = 0;
        }

        const finalPitch = snappedFreq > 0
          ? frequencyToNote(snappedFreq, finalShift)
          : lastValidPitch;

        // Phase 1: 최소 길이 필터링 + 타이밍 오프셋
        if (currentNote.slotCount >= MIN_NOTE_DURATION_SLOTS) {
          let adjustedSlotIndex = currentNote.startSlot.slotIndex + TIMING_OFFSET_SLOTS;
          let adjustedMeasureIndex = currentNote.startSlot.measureIndex;

          if (adjustedSlotIndex >= SLOTS_PER_MEASURE) {
            adjustedSlotIndex -= SLOTS_PER_MEASURE;
            adjustedMeasureIndex++;
          }

          rawNotes.push({
            pitch: finalPitch,
            duration: slotCountToDuration(currentNote.slotCount),
            beat: (adjustedMeasureIndex * SLOTS_PER_MEASURE + adjustedSlotIndex) / 4,
            measureIndex: adjustedMeasureIndex,
            slotIndex: adjustedSlotIndex,
            slotCount: currentNote.slotCount,
            confidence: currentNote.confidence,
            isRest: false
          });

          lastValidPitch = finalPitch;
        }

        currentNote = {
          startSlot: slot,
          slotCount: 1,
          frequencies: slot.medianFrequency > 0 ? [slot.medianFrequency] : [],
          confidence: slot.confidence
        };
      }
    }
  }

  // 마지막 음표 처리
  if (currentNote) {
    // Phase 63 복구: median 사용 (66차 Mode 필터 비활성화)
    const medianFreqLast = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
    const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));
    const correctedFreq = medianFreqLast > 0 ? correctOctaveError(medianFreqLast, contextFreqs) : 0;

    // Phase 44: Pitch Snap 적용
    const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

    // Low Solo 보호
    const LOW_SOLO_THRESHOLD = 100;
    let finalShift = octaveShift;
    if (medianFreqLast > 0 && medianFreqLast < LOW_SOLO_THRESHOLD) {
      finalShift = 0;
    }

    const finalPitch = snappedFreq > 0
      ? frequencyToNote(snappedFreq, finalShift)
      : lastValidPitch;

    // Phase 1: 최소 길이 필터링 + 타이밍 오프셋
    if (currentNote.slotCount >= MIN_NOTE_DURATION_SLOTS) {
      let adjustedSlotIndex = currentNote.startSlot.slotIndex + TIMING_OFFSET_SLOTS;
      let adjustedMeasureIndex = currentNote.startSlot.measureIndex;

      if (adjustedSlotIndex >= SLOTS_PER_MEASURE) {
        adjustedSlotIndex -= SLOTS_PER_MEASURE;
        adjustedMeasureIndex++;
      }

      rawNotes.push({
        pitch: finalPitch,
        duration: slotCountToDuration(currentNote.slotCount),
        beat: (adjustedMeasureIndex * SLOTS_PER_MEASURE + adjustedSlotIndex) / 4,
        measureIndex: adjustedMeasureIndex,
        slotIndex: adjustedSlotIndex,
        slotCount: currentNote.slotCount,
        confidence: currentNote.confidence,
        isRest: false
      });
    }
  }

  // ========================================
  // Phase 66: 첫 음 기준 상대 정렬 (활성화)
  // ========================================
  // 감지된 첫 번째 음표의 시작점을 슬롯 0에 맞추고 전체 타임라인 재정렬
  if (rawNotes.length > 0) {
    const firstNote = rawNotes[0];
    const firstNoteGlobalSlot = firstNote.measureIndex * SLOTS_PER_MEASURE + firstNote.slotIndex;

    // 최대 2마디(32슬롯)까지만 조정, 그 이상은 비정상
    if (firstNoteGlobalSlot > 0 && firstNoteGlobalSlot < 32) {
      // 모든 음표를 firstNoteGlobalSlot만큼 앞으로 이동
      for (let i = 0; i < rawNotes.length; i++) {
        const note = rawNotes[i];
        const currentGlobalSlot = note.measureIndex * SLOTS_PER_MEASURE + note.slotIndex;
        const newGlobalSlot = currentGlobalSlot - firstNoteGlobalSlot;

        // 음수 슬롯 방지 (안전장치)
        if (newGlobalSlot < 0) continue;

        rawNotes[i] = {
          ...note,
          measureIndex: Math.floor(newGlobalSlot / SLOTS_PER_MEASURE),
          slotIndex: newGlobalSlot % SLOTS_PER_MEASURE,
          beat: newGlobalSlot / 4
        };
      }
    }
  }

  // ========================================
  // Phase 3: 옥타브 점프 후처리 (DISABLED)
  // ========================================
  // 비활성화 이유: 재즈 솔로 등 와이드 레인지 멜로디 지원
  // - ±12 semitones 이상 점프는 유효한 음악적 표현 (에러 아님)
  // - C3 → G4 (+19반음), A4 → E3 (-17반음) 같은 점프가 자연스러움
  // - 이 로직이 제대로 감지된 높은 음(C5, A4)을 낮춤(G3, F3)으로 강제 변환
  // - 결과: "어떤 사람이든 어떤 솔로든 다 받아들이고 분석" 목표에 부합하지 않음
  //
  // for (let i = 1; i < rawNotes.length; i++) {
  //   const prevNote = rawNotes[i - 1];
  //   const currNote = rawNotes[i];
  //
  //   if (prevNote.isRest || currNote.isRest) continue;
  //
  //   const prevMidi = pitchToMidi(prevNote.pitch);
  //   const currMidi = pitchToMidi(currNote.pitch);
  //
  //   if (prevMidi === -1 || currMidi === -1) continue;
  //
  //   const jump = currMidi - prevMidi;
  //
  //   // 옥타브 이상 점프 (±12 semitones 이상)
  //   if (Math.abs(jump) >= 12) {
  //     // 현재 음을 한 옥타브 조정하여 점프를 줄일 수 있는지 확인
  //     let correctedMidi = currMidi;
  //
  //     if (jump > 12) {
  //       // 너무 높게 점프 → 한 옥타브 낮춤
  //       correctedMidi = currMidi - 12;
  //     } else if (jump < -12) {
  //       // 너무 낮게 점프 → 한 옥타브 높임
  //       correctedMidi = currMidi + 12;
  //     }
  //
  //     const correctedOctave = Math.floor(correctedMidi / 12) - 1;
  //     const noteIndex = ((correctedMidi % 12) + 12) % 12;
  //     const correctedPitch = `${NOTE_NAMES[noteIndex]}${correctedOctave}`;
  //
  //     console.log(`[Octave Jump] ${prevNote.pitch} → ${currNote.pitch} (${jump > 0 ? '+' : ''}${jump}반음) ⇒ ${correctedPitch}로 보정`);
  //
  //     rawNotes[i] = {
  //       ...currNote,
  //       pitch: correctedPitch
  //     };
  //   }
  // }

  console.log('[Phase 3] Octave Jump Correction DISABLED (와이드 레인지 멜로디 지원)');

  // ========================================
  // Step 4: 쉼표 삽입 (measureIndex는 상대값 0부터)
  // ========================================
  const finalNotes: NoteData[] = [];
  let lastEndSlot = 0; // 마지막 음표가 끝난 슬롯 (상대값)

  for (const note of rawNotes) {
    // 상대 슬롯 위치 (녹음 시작 기준)
    const noteStartSlot = note.measureIndex * SLOTS_PER_MEASURE + note.slotIndex;

    // 이전 음표와 현재 음표 사이에 빈 슬롯이 있으면 쉼표 삽입
    if (noteStartSlot > lastEndSlot) {
      const restSlots = noteStartSlot - lastEndSlot;
      let remainingSlots = restSlots;
      let currentSlot = lastEndSlot;

      while (remainingSlots > 0) {
        // 가능한 큰 쉼표부터 배치
        let restSlotCount: number;
        if (remainingSlots >= 16) restSlotCount = 16;
        else if (remainingSlots >= 8) restSlotCount = 8;
        else if (remainingSlots >= 4) restSlotCount = 4;
        else if (remainingSlots >= 2) restSlotCount = 2;
        else restSlotCount = 1;

        const restMeasure = Math.floor(currentSlot / SLOTS_PER_MEASURE);  // 상대값
        const restSlotIndex = currentSlot % SLOTS_PER_MEASURE;

        finalNotes.push({
          pitch: 'rest',
          duration: slotCountToDuration(restSlotCount),
          beat: currentSlot / 4,
          measureIndex: restMeasure,
          slotIndex: restSlotIndex,
          slotCount: restSlotCount,
          confidence: 'high',
          isRest: true
        });

        currentSlot += restSlotCount;
        remainingSlots -= restSlotCount;
      }
    }

    finalNotes.push(note);
    lastEndSlot = noteStartSlot + note.slotCount;
  }

  // ========================================
  // Step 5: 결과 로그 (Phase 67: 통계 위주로 간소화)
  // ========================================
  const noteCount = finalNotes.filter(n => !n.isRest).length;
  const restCount = finalNotes.filter(n => n.isRest).length;

  console.log('[Grid] ========== 분석 완료 ==========');
  console.log(`[Grid] 결과: 음표 ${noteCount}개, 쉼표 ${restCount}개`);

  // 데이터 증발 경고 (중요!)
  if (frames.length > 0 && noteCount === 0) {
    console.error('[Grid 경고] ⚠️ 데이터 증발! 입력:', frames.length, '프레임 → 출력: 0개 음표');
  }

  return finalNotes;
}
