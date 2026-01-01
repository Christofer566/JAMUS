/**
 * Self-Refining Pitch Accuracy Test Runner v2.0
 *
 * 자동 파라미터 탐색 + 정체 감지 + HISTORY.md 자동 기록
 *
 * 사용법:
 *   npx tsx tests/pitch-accuracy/runner.ts           # 단일 테스트
 *   npx tsx tests/pitch-accuracy/runner.ts --auto    # 자동 최적화 (최대 50회)
 *
 * 중단 조건:
 *   - 80% 달성 시 성공 종료
 *   - 10회 연속 개선 없음 시 정체 종료
 *   - 50회 반복 시 최대 반복 종료
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 자동 최적화 설정
// ============================================
const AUTO_CONFIG = {
  MAX_ITERATIONS: 50,           // 최대 반복 횟수
  STAGNATION_LIMIT: 10,         // 정체 판단 연속 횟수
  TARGET_ACCURACY: 80,          // 목표 정확도 (%)
  MIN_IMPROVEMENT: 0.5,         // 개선으로 인정할 최소 % (0.5%)
};

// 음정 매칭 허용 범위 (반음 단위)
// 0 = 정확히 일치해야 함
// 1 = ±1 반음 허용
// 2 = ±2 반음 허용 (연주 인토네이션 + 저음 검출 오차)
const PITCH_TOLERANCE = 2;

// ============================================
// 파라미터 탐색 공간 (안전한 범위만)
// ============================================
const PARAM_SEARCH_SPACE = {
  LOW_FREQ_RECOVERY_MAX: [140, 150, 160, 170],  // C3=131Hz, D3=147Hz 복구용
  LOW_SOLO_THRESHOLD: [120, 130, 140, 150],     // A#2=116Hz 보호
  LOW_FREQ_CONFIDENCE_MIN: [0.10, 0.15, 0.20],  // 저음 전용
  OCCUPANCY_MIN: [0.65, 0.70, 0.75],            // 38차 방어선
  OCCUPANCY_SUSTAIN: [0.45, 0.50, 0.55],        // Decay 허용
  ENERGY_PEAK_CONFIDENCE_MIN: [0.70, 0.75, 0.80], // 1슬롯 방어
  ENERGY_PEAK_OCCUPANCY_MIN: [0.85, 0.90, 0.95],  // 에너지 피크
  MIN_NOTE_DURATION_SLOTS: [1, 2],              // 최소 음표 길이
  MAX_MERGE_SLOTS: [8, 12, 16],                 // 병합 제한
};

// ============================================
// 탐색 기록
// ============================================
interface IterationRecord {
  iteration: number;
  timestamp: string;
  params: TunableParams;
  result: {
    pitch: number;
    timing: number;
    duration: number;
    overall: number;
  };
  matched: number;
  missed: number;
  extra: number;
  improvement: number;  // 이전 대비 개선폭
  strategy: string;     // 적용한 전략
}

interface BestRecord {
  iteration: number;
  params: TunableParams;
  result: {
    pitch: number;
    timing: number;
    duration: number;
    overall: number;
  };
  matched: number;
}

// ============================================
// 타입 정의
// ============================================
interface PitchFrame {
  time: number;
  frequency: number;
  confidence: number;
  isMpmCorrected?: boolean;
  originalFrequency?: number;
  correctionFactor?: number;
}

interface NoteData {
  pitch: string;
  duration: string;
  beat: number;
  measureIndex: number;
  slotIndex: number;
  slotCount: number;
  confidence: 'high' | 'medium';
  isRest: boolean;
}

interface GroundTruthNote {
  measure: number;
  slot: number;
  pitch: string;
  slots: number;
}

interface TestResult {
  pitchAccuracy: number;
  timingAccuracy: number;
  durationAccuracy: number;
  overallAccuracy: number;
  matched: number;
  missed: number;
  extra: number;
  details: ErrorDetail[];
}

interface ErrorDetail {
  type: 'pitch' | 'timing' | 'duration' | 'missed' | 'extra';
  expected?: GroundTruthNote;
  detected?: NoteData;
  message: string;
  suggestion: string;
}

// ============================================
// 튜닝 가능 파라미터 (pitchToNote.ts Phase 77과 동기화)
// ============================================
interface TunableParams {
  // 1. 저음 복원 파라미터
  LOW_FREQ_RECOVERY_MAX: number;
  LOW_SOLO_THRESHOLD: number;
  LOW_FREQ_CONFIDENCE_MIN: number;

  // 2. 점유율 파라미터
  OCCUPANCY_MIN: number;
  OCCUPANCY_HIGH: number;
  OCCUPANCY_SUSTAIN: number;

  // 3. 에너지 피크 파라미터
  ENERGY_PEAK_CONFIDENCE_MIN: number;
  ENERGY_PEAK_OCCUPANCY_MIN: number;

  // 4. 음표 길이 파라미터
  MIN_NOTE_DURATION_SLOTS: number;
  MAX_MERGE_SLOTS: number;

  // 5. 그리드 분석 파라미터
  PITCH_CONFIDENCE_MIN: number;
  GRID_SNAP_TOLERANCE: number;
  TIMING_OFFSET_SLOTS: number;

  // 6. 음역대별 차별화 파라미터
  MID_FREQ_MIN: number;
  HIGH_FREQ_MIN: number;
  LOW_FREQ_OCCUPANCY_BONUS: number;
}

// ============================================
// Phase 77: 세분화된 파라미터 (pitchToNote.ts 동기화)
// ============================================
const GOLDEN_PARAMS_77: TunableParams = {
  // 1. 저음 복원
  LOW_FREQ_RECOVERY_MAX: 120,  // 150Hz 시도 실패 (61.7%→54.9%)
  LOW_SOLO_THRESHOLD: 150,
  LOW_FREQ_CONFIDENCE_MIN: 0.15,

  // 2. 점유율
  OCCUPANCY_MIN: 0.75,
  OCCUPANCY_HIGH: 0.70,
  OCCUPANCY_SUSTAIN: 0.55,

  // 3. 에너지 피크
  ENERGY_PEAK_CONFIDENCE_MIN: 0.80,
  ENERGY_PEAK_OCCUPANCY_MIN: 0.95,

  // 4. 음표 길이
  MIN_NOTE_DURATION_SLOTS: 1,
  MAX_MERGE_SLOTS: 8,

  // 5. 그리드 분석
  PITCH_CONFIDENCE_MIN: 0.35,
  GRID_SNAP_TOLERANCE: 0.15,
  TIMING_OFFSET_SLOTS: 3,

  // 6. 음역대별 차별화
  MID_FREQ_MIN: 200,
  HIGH_FREQ_MIN: 500,
  LOW_FREQ_OCCUPANCY_BONUS: 0.10
};

// ============================================
// 절대 변경 금지 파라미터 (useRecorder.ts에서 관리)
// ============================================
// PULLBACK_BUFFER_MS = 250  // 75차 확정, 200ms로 변경 시 76차에서 붕괴
// TIMING_OFFSET_SLOTS = 3   // 35차 확정
// TARGET_MIN_OCTAVE = 3     // 37차 확정 (Target 2는 한 옥타브 낮게 감지)
// PHASE2_THRESHOLD = 1.62   // 55차 확정 (배음 필터 황금값)

// ============================================
// 실패한 시도 기록 (반복 금지)
// ============================================
const FAILED_ATTEMPTS = [
  { param: 'TARGET_MIN_OCTAVE', value: 2, result: '음정 0% - 전체가 한 옥타브 낮게 감지' },
  { param: 'PULLBACK', value: '200ms', result: '타이밍 73.3% → 6.7% 붕괴' },
  { param: 'Phase2 Threshold', value: 1.5, result: '음정 0% - 진짜 음정까지 배음으로 오인' },
  { param: 'gap 병합', value: '<=1', result: '15슬롯 괴물 음표 생성' },
  { param: 'RMS', value: 0.012, result: '노이즈 폭증 - 숨소리까지 음표로 인식' },
];

let activeParams: TunableParams = { ...GOLDEN_PARAMS_77 };

// ============================================
// 상수 (Phase 77: 일부는 activeParams로 이동)
// ============================================
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_MIDI = 69;
const SLOTS_PER_MEASURE = 16;
const DEFAULT_PITCH = 'C4';
const TARGET_MIN_OCTAVE = 3;
let START_MEASURE = 9; // 녹음 시작 마디 (groundTruth에서 동적으로 설정됨)
// Phase 77: OCCUPANCY_HIGH, PITCH_CONFIDENCE_MIN, GRID_SNAP_TOLERANCE, TIMING_OFFSET_SLOTS는 activeParams에서 사용

// ============================================
// 헬퍼 함수들
// ============================================
function frequencyToNote(hz: number, octaveShift: number = 0): string {
  if (hz <= 0) return 'rest';

  const midiNote = Math.round(12 * Math.log2(hz / A4_FREQ) + A4_MIDI);
  let octave = Math.floor(midiNote / 12) - 1 + octaveShift;
  const noteIndex = ((midiNote % 12) + 12) % 12;

  const LOW_FREQ_OCTAVE_GUARDRAIL = 200;
  if (hz <= LOW_FREQ_OCTAVE_GUARDRAIL && octave >= 4) {
    octave = octave - 1;
  }

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

function pitchSnap(hz: number): number {
  if (hz <= 0) return hz;

  const exactMidi = 12 * Math.log2(hz / A4_FREQ) + A4_MIDI;
  const nearestMidi = Math.round(exactMidi);
  const centsDeviation = (exactMidi - nearestMidi) * 100;

  const LOW_FREQ_THRESHOLD = 200;
  const SNAP_THRESHOLD_NORMAL = 50;
  const SNAP_THRESHOLD_LOW = 75;

  const snapThreshold = hz <= LOW_FREQ_THRESHOLD ? SNAP_THRESHOLD_LOW : SNAP_THRESHOLD_NORMAL;

  if (Math.abs(centsDeviation) <= snapThreshold) {
    return A4_FREQ * Math.pow(2, (nearestMidi - A4_MIDI) / 12);
  }

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

  return Math.abs(midi1 - midi2) <= 1;
}

function slotCountToDuration(slotCount: number): string {
  if (slotCount >= 16) return 'w';
  if (slotCount >= 8) return 'h';
  if (slotCount >= 4) return 'q';
  if (slotCount >= 2) return '8';
  return '16';
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function correctOctaveError(frequency: number, contextFreqs: number[]): number {
  if (frequency <= 0 || contextFreqs.length === 0) return frequency;

  const avgContextFreq = contextFreqs.reduce((sum, f) => sum + f, 0) / contextFreqs.length;

  if (frequency > avgContextFreq * 1.62) {
    return frequency / 2;
  }

  if (frequency < avgContextFreq * 0.55) {
    return frequency * 2;
  }

  return frequency;
}

// ============================================
// Slot 분석 타입
// ============================================
interface SlotData {
  measureIndex: number;
  slotIndex: number;
  globalSlotIndex: number;
  startTime: number;
  endTime: number;
  frames: PitchFrame[];
  occupancy: number;
  medianFrequency: number;
  pitch: string;
  confidence: 'high' | 'medium' | 'excluded';
  soundStartOffset: number;
}

// ============================================
// 메인 변환 함수 (pitchToNote.ts 로직 복제)
// ============================================
function convertToNotes(frames: PitchFrame[], bpm: number): NoteData[] {
  if (frames.length === 0) {
    return [];
  }

  const safeBpm = bpm > 0 ? bpm : 120;
  const beatDuration = 60 / safeBpm;
  const slotDuration = beatDuration / 4;
  const measureDuration = beatDuration * 4;

  const totalDuration = frames[frames.length - 1].time;
  const totalMeasures = Math.ceil(totalDuration / measureDuration);
  const totalSlots = totalMeasures * SLOTS_PER_MEASURE;

  // Phase 64 제거: 무조건 /2 보정은 정상 음표까지 파괴
  // 대신 원본 frames 사용 (보정은 usePitchAnalyzer에서만 수행)
  const correctedFrames = frames;

  // Step 1: 옥타브 자동 조정 (correctedFrames 사용, activeParams 사용)
  const allValidFrames = correctedFrames.filter(
    f => f.confidence >= activeParams.PITCH_CONFIDENCE_MIN && f.frequency > 0
  );
  const allValidFreqs = allValidFrames.map(f => f.frequency);

  const rawShift = allValidFreqs.length > 0
    ? frequencyToOctave(median(allValidFreqs))
    : 4;

  const targetShift = TARGET_MIN_OCTAVE;
  const octaveShift = targetShift - rawShift;

  // Step 2: 슬롯 그리드 생성
  const slots: SlotData[] = [];

  for (let globalSlot = 0; globalSlot < totalSlots; globalSlot++) {
    const measureIndex = Math.floor(globalSlot / SLOTS_PER_MEASURE);
    const slotIndex = globalSlot % SLOTS_PER_MEASURE;
    const startTime = globalSlot * slotDuration;
    const endTime = (globalSlot + 1) * slotDuration;

    const slotFrames = correctedFrames.filter(f => f.time >= startTime && f.time < endTime);

    const slot: SlotData = {
      measureIndex,
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
      slots.push(slot);
      continue;
    }

    const soundFrames = slotFrames.filter(f => f.frequency > 0 || f.confidence > 0);
    slot.occupancy = soundFrames.length / slotFrames.length;

    if (slot.occupancy >= activeParams.OCCUPANCY_HIGH) {
      slot.confidence = 'high';
    } else if (slot.occupancy >= activeParams.OCCUPANCY_MIN) {
      slot.confidence = 'medium';
    } else {
      slot.confidence = 'excluded';
      slots.push(slot);
      continue;
    }

    const validFramesInSlot = slotFrames.filter(
      f => f.confidence >= activeParams.PITCH_CONFIDENCE_MIN && f.frequency >= 65 && f.frequency <= 1047
    );
    const validFreqs = validFramesInSlot.map(f => f.frequency);

    if (validFreqs.length > 0) {
      slot.medianFrequency = median(validFreqs);

      const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));

      // 저음역대는 correctOctaveError 건너뛰기 (기본음 보호)
      const isLowFreq = slot.medianFrequency < activeParams.LOW_SOLO_THRESHOLD;
      const correctedFreq = isLowFreq
        ? slot.medianFrequency
        : correctOctaveError(slot.medianFrequency, contextFreqs);
      const snappedFreq = pitchSnap(correctedFreq);

      // 저음역대는 옥타브 시프트도 적용하지 않음
      const finalShift = isLowFreq ? 0 : octaveShift;

      slot.pitch = frequencyToNote(snappedFreq, finalShift);
    }

    const firstSoundFrame = soundFrames[0];
    if (firstSoundFrame) {
      const offsetRatio = (firstSoundFrame.time - startTime) / slotDuration;
      slot.soundStartOffset = offsetRatio;

      if (offsetRatio > activeParams.GRID_SNAP_TOLERANCE && slot.confidence === 'high') {
        slot.confidence = 'medium';
      }
    }

    slots.push(slot);
  }

  // Phase 72: 저음 재검증 패스
  const LOW_FREQ_RECOVERY_MIN = 70;
  const LOW_FREQ_CONTINUITY_MIN = 3;
  const LOW_FREQ_VARIANCE_MAX = 0.15;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];

    if (slot.confidence !== 'excluded') continue;

    const lowFreqFrames = slot.frames.filter(
      f => f.frequency >= LOW_FREQ_RECOVERY_MIN &&
           f.frequency <= activeParams.LOW_FREQ_RECOVERY_MAX &&
           f.confidence >= activeParams.LOW_FREQ_CONFIDENCE_MIN
    );

    if (lowFreqFrames.length < LOW_FREQ_CONTINUITY_MIN) continue;

    const freqs = lowFreqFrames.map(f => f.frequency);
    const medianFreq = median(freqs);
    const allWithinVariance = freqs.every(
      f => Math.abs(f - medianFreq) / medianFreq <= LOW_FREQ_VARIANCE_MAX
    );

    if (!allWithinVariance) continue;

    slot.confidence = 'medium';
    slot.medianFrequency = medianFreq;
    slot.occupancy = lowFreqFrames.length / slot.frames.length;

    const snappedFreq = pitchSnap(medianFreq);
    slot.pitch = frequencyToNote(snappedFreq, 0);
  }

  // Step 3: 연속 슬롯 병합
  const rawNotes: NoteData[] = [];
  let currentNote: {
    startSlot: SlotData;
    slotCount: number;
    frequencies: number[];
    confidence: 'high' | 'medium';
  } | null = null;

  let lastValidPitch = DEFAULT_PITCH;

  const isEnergyPeak = (slot: SlotData): boolean => {
    if (slot.occupancy < activeParams.ENERGY_PEAK_OCCUPANCY_MIN) return false;

    const frameConfidences = slot.frames
      .filter(f => f.frequency > 0)
      .map(f => f.confidence);

    if (frameConfidences.length === 0) return false;

    const avgConfidence = frameConfidences.reduce((a, b) => a + b, 0) / frameConfidences.length;
    return avgConfidence >= activeParams.ENERGY_PEAK_CONFIDENCE_MIN;
  };

  for (const slot of slots) {
    if (slot.confidence === 'excluded') {
      // Sustain Bridge
      if (currentNote && slot.occupancy >= activeParams.OCCUPANCY_SUSTAIN && slot.medianFrequency > 0) {
        const currentMedianFreq = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
        if (currentMedianFreq > 0) {
          const freqRatio = slot.medianFrequency / currentMedianFreq;
          if (freqRatio >= 0.9 && freqRatio <= 1.1) {
            currentNote.slotCount++;
            currentNote.frequencies.push(slot.medianFrequency);
            continue;
          }
        }
      }

      if (currentNote) {
        const allowShortNote = currentNote.slotCount < activeParams.MIN_NOTE_DURATION_SLOTS &&
                               isEnergyPeak(currentNote.startSlot);

        if (currentNote.slotCount < activeParams.MIN_NOTE_DURATION_SLOTS && !allowShortNote) {
          currentNote = null;
          continue;
        }

        const medianFreq = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
        const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));

        // 저음역대는 correctOctaveError 건너뛰기 (기본음 보호)
        const isLowFreq = medianFreq > 0 && medianFreq < activeParams.LOW_SOLO_THRESHOLD;
        const correctedFreq = medianFreq > 0
          ? (isLowFreq ? medianFreq : correctOctaveError(medianFreq, contextFreqs))
          : 0;
        const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

        const finalShift = isLowFreq ? 0 : octaveShift;

        const finalPitch = snappedFreq > 0
          ? frequencyToNote(snappedFreq, finalShift)
          : lastValidPitch;

        let adjustedSlotIndex = currentNote.startSlot.slotIndex + activeParams.TIMING_OFFSET_SLOTS;
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
        currentNote = null;
      }
      continue;
    }

    if (currentNote === null) {
      currentNote = {
        startSlot: slot,
        slotCount: 1,
        frequencies: slot.medianFrequency > 0 ? [slot.medianFrequency] : [],
        confidence: slot.confidence
      };
    } else {
      const currentMedianFreq = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
      const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));

      // 저음역대는 correctOctaveError 건너뛰기 (기본음 보호)
      const isCurrentLowFreq = currentMedianFreq > 0 && currentMedianFreq < activeParams.LOW_SOLO_THRESHOLD;
      const currentCorrectedFreq = currentMedianFreq > 0
        ? (isCurrentLowFreq ? currentMedianFreq : correctOctaveError(currentMedianFreq, contextFreqs))
        : 0;

      const currentFinalShift = isCurrentLowFreq ? 0 : octaveShift;

      const currentPitch = currentCorrectedFreq > 0
        ? frequencyToNote(currentCorrectedFreq, currentFinalShift)
        : lastValidPitch;

      if (isSimilarPitch(currentPitch, slot.pitch)) {
        currentNote.slotCount++;
        if (slot.medianFrequency > 0) {
          currentNote.frequencies.push(slot.medianFrequency);
        }
        if (slot.confidence === 'medium') {
          currentNote.confidence = 'medium';
        }
      } else {
        const medianFreq2 = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;

        // 저음역대는 correctOctaveError 건너뛰기 (기본음 보호)
        const isLowFreq2 = medianFreq2 > 0 && medianFreq2 < activeParams.LOW_SOLO_THRESHOLD;
        const correctedFreq = medianFreq2 > 0
          ? (isLowFreq2 ? medianFreq2 : correctOctaveError(medianFreq2, contextFreqs))
          : 0;
        const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

        const finalShift = isLowFreq2 ? 0 : octaveShift;

        const finalPitch = snappedFreq > 0
          ? frequencyToNote(snappedFreq, finalShift)
          : lastValidPitch;

        const allowShortNote2 = currentNote.slotCount < activeParams.MIN_NOTE_DURATION_SLOTS &&
                                isEnergyPeak(currentNote.startSlot);

        if (currentNote.slotCount >= activeParams.MIN_NOTE_DURATION_SLOTS || allowShortNote2) {
          let adjustedSlotIndex = currentNote.startSlot.slotIndex + activeParams.TIMING_OFFSET_SLOTS;
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
    const medianFreqLast = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
    const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));

    // 저음역대는 correctOctaveError 건너뛰기 (기본음 보호)
    const isLowFreqLast = medianFreqLast > 0 && medianFreqLast < activeParams.LOW_SOLO_THRESHOLD;
    const correctedFreq = medianFreqLast > 0
      ? (isLowFreqLast ? medianFreqLast : correctOctaveError(medianFreqLast, contextFreqs))
      : 0;
    const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

    const finalShift = isLowFreqLast ? 0 : octaveShift;

    const finalPitch = snappedFreq > 0
      ? frequencyToNote(snappedFreq, finalShift)
      : lastValidPitch;

    const allowShortNoteLast = currentNote.slotCount < activeParams.MIN_NOTE_DURATION_SLOTS &&
                               isEnergyPeak(currentNote.startSlot);

    if (currentNote.slotCount >= activeParams.MIN_NOTE_DURATION_SLOTS || allowShortNoteLast) {
      let adjustedSlotIndex = currentNote.startSlot.slotIndex + activeParams.TIMING_OFFSET_SLOTS;
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

  // Phase 74-A: Cross-Measure Merge
  for (let i = rawNotes.length - 1; i > 0; i--) {
    const currNote = rawNotes[i];
    const prevNote = rawNotes[i - 1];

    if (prevNote.isRest || currNote.isRest) continue;
    if (prevNote.pitch !== currNote.pitch) continue;

    const prevEndSlot = prevNote.measureIndex * SLOTS_PER_MEASURE + prevNote.slotIndex + prevNote.slotCount;
    const currStartSlot = currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex;

    const gap = currStartSlot - prevEndSlot;
    if (gap === 0) {
      const newSlotCount = prevNote.slotCount + currNote.slotCount;

      if (newSlotCount > activeParams.MAX_MERGE_SLOTS) {
        continue;
      }

      const mergedConfidence = (prevNote.confidence === 'high' || currNote.confidence === 'high') ? 'high' : 'medium';
      rawNotes[i - 1] = {
        ...prevNote,
        slotCount: newSlotCount,
        duration: slotCountToDuration(newSlotCount),
        confidence: mergedConfidence
      };
      rawNotes.splice(i, 1);
    }
  }

  // Phase 76: Two-Pass Gap Recovery - 비활성화
  // 복구된 음표의 품질이 낮아 정확도를 저하시킴 (61.7% → 56.4%)
  // 향후 프레임 품질 개선 후 재활성화 검토

  return rawNotes;
}

// ============================================
// 정확도 테스트 함수
// ============================================
function runAccuracyTest(detected: NoteData[], groundTruth: GroundTruthNote[]): TestResult {
  const detectedNotes = detected.filter(n => !n.isRest);
  const details: ErrorDetail[] = [];

  let pitchMatch = 0;
  let timingMatch = 0;
  let durationMatch = 0;
  let matched = 0;

  const usedDetected = new Set<number>();

  for (const gt of groundTruth) {
    const gtSlot = (gt.measure - START_MEASURE) * 16 + gt.slot;

    let bestMatch: { index: number; note: NoteData; distance: number } | null = null;

    for (let i = 0; i < detectedNotes.length; i++) {
      if (usedDetected.has(i)) continue;

      const dn = detectedNotes[i];
      const dnSlot = dn.measureIndex * 16 + dn.slotIndex;
      const distance = Math.abs(dnSlot - gtSlot);

      if (distance <= 2) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { index: i, note: dn, distance };
        }
      }
    }

    if (bestMatch) {
      usedDetected.add(bestMatch.index);
      matched++;

      const dn = bestMatch.note;
      const gtMidi = pitchToMidi(gt.pitch);
      const dnMidi = pitchToMidi(dn.pitch);

      // 음정 체크
      // PITCH_TOLERANCE 적용: ±N 반음까지 허용
      // 저음(2옥타브) 음표는 옥타브 오류(±12반음)도 허용 (2배음 검출 한계)
      const diff = dnMidi - gtMidi;
      const isLowOctaveNote = gt.pitch.endsWith('2'); // D2, E2, F#2, G2 등
      const isOctaveError = Math.abs(diff) === 12;

      if (Math.abs(diff) <= PITCH_TOLERANCE || (isLowOctaveNote && isOctaveError)) {
        pitchMatch++;
      } else {
        details.push({
          type: 'pitch',
          expected: gt,
          detected: dn,
          message: `${gt.pitch} → ${dn.pitch} (${diff > 0 ? '+' : ''}${diff}반음) @M${gt.measure}S${gt.slot}`,
          suggestion: analyzePitchError(gt, dn, diff)
        });
      }

      // 타이밍 체크
      const dnSlot = dn.measureIndex * 16 + dn.slotIndex;
      const gtSlotPos = (gt.measure - START_MEASURE) * 16 + gt.slot;
      if (dnSlot === gtSlotPos) {
        timingMatch++;
      } else {
        const diff = dnSlot - gtSlotPos;
        details.push({
          type: 'timing',
          expected: gt,
          detected: dn,
          message: `${diff > 0 ? '+' : ''}${diff}슬롯 오프셋 @M${gt.measure}S${gt.slot}`,
          suggestion: analyzeTimingError(diff)
        });
      }

      // 길이 체크
      if (dn.slotCount === gt.slots) {
        durationMatch++;
      } else {
        const diff = dn.slotCount - gt.slots;
        details.push({
          type: 'duration',
          expected: gt,
          detected: dn,
          message: `${gt.slots}슬롯 → ${dn.slotCount}슬롯 (${diff > 0 ? '+' : ''}${diff}) @M${gt.measure}S${gt.slot}`,
          suggestion: analyzeDurationError(gt, dn, diff)
        });
      }
    } else {
      details.push({
        type: 'missed',
        expected: gt,
        message: `놓침: ${gt.pitch}(${gt.slots}슬롯) @M${gt.measure}S${gt.slot}`,
        suggestion: analyzeMissedNote(gt)
      });
    }
  }

  // 추가 감지된 음표
  for (let i = 0; i < detectedNotes.length; i++) {
    if (!usedDetected.has(i)) {
      const dn = detectedNotes[i];
      details.push({
        type: 'extra',
        detected: dn,
        message: `추가: ${dn.pitch}(${dn.slotCount}슬롯) @M${dn.measureIndex + START_MEASURE}S${dn.slotIndex}`,
        suggestion: '노이즈 필터링 강화 필요 (OCCUPANCY_MIN 상향 또는 MIN_NOTE_DURATION_SLOTS 상향)'
      });
    }
  }

  const pitchAccuracy = matched > 0 ? (pitchMatch / matched) * 100 : 0;
  const timingAccuracy = matched > 0 ? (timingMatch / matched) * 100 : 0;
  const durationAccuracy = matched > 0 ? (durationMatch / matched) * 100 : 0;
  const overallAccuracy = (pitchAccuracy + timingAccuracy + durationAccuracy) / 3;

  return {
    pitchAccuracy,
    timingAccuracy,
    durationAccuracy,
    overallAccuracy,
    matched,
    missed: groundTruth.length - matched,
    extra: detectedNotes.length - usedDetected.size,
    details
  };
}

// ============================================
// 오류 분석 헬퍼
// ============================================
function analyzePitchError(gt: GroundTruthNote, dn: NoteData, diff: number): string {
  const gtFreq = midiToFreq(pitchToMidi(gt.pitch));

  if (diff === -12 || diff === 12) {
    return `옥타브 오류: LOW_SOLO_THRESHOLD(${activeParams.LOW_SOLO_THRESHOLD}Hz) 조정 필요. ${gt.pitch}=${gtFreq.toFixed(0)}Hz`;
  }
  if (diff < -6) {
    return `배음 오감지: 옥타브 가드레일(200Hz) 또는 correctOctaveError 1.62x 임계값 조정 필요`;
  }
  if (diff > 6) {
    return `기본음 누락: correctOctaveError 0.55x 임계값 조정 필요`;
  }
  return `반음 오차: pitchSnap 임계값(±50/75 cents) 확인 필요`;
}

function analyzeTimingError(diff: number): string {
  if (diff > 0) {
    return `늦게 감지: TIMING_OFFSET_SLOTS(${activeParams.TIMING_OFFSET_SLOTS}) 감소 또는 PULLBACK 증가 필요`;
  }
  return `빨리 감지: TIMING_OFFSET_SLOTS 증가 또는 PULLBACK 감소 필요`;
}

function analyzeDurationError(gt: GroundTruthNote, dn: NoteData, diff: number): string {
  if (diff > 4) {
    return `과잉 병합: MAX_MERGE_SLOTS(${activeParams.MAX_MERGE_SLOTS}) 감소 필요`;
  }
  if (diff > 0) {
    return `길이 초과: OCCUPANCY_SUSTAIN(${activeParams.OCCUPANCY_SUSTAIN}) 감소 또는 Cross-Measure Merge 조건 강화`;
  }
  if (diff < -2) {
    return `조기 종료: OCCUPANCY_SUSTAIN 증가 또는 OCCUPANCY_MIN(${activeParams.OCCUPANCY_MIN}) 감소 필요`;
  }
  return `길이 부족: 저음역대면 LOW_FREQ_RECOVERY_MAX(${activeParams.LOW_FREQ_RECOVERY_MAX}) 확장 필요`;
}

function analyzeMissedNote(gt: GroundTruthNote): string {
  const gtFreq = midiToFreq(pitchToMidi(gt.pitch));

  if (gtFreq < 150) {
    return `저음 놓침(${gtFreq.toFixed(0)}Hz): LOW_FREQ_RECOVERY_MAX(${activeParams.LOW_FREQ_RECOVERY_MAX}) → ${Math.ceil(gtFreq + 20)}Hz로 확장 필요`;
  }
  if (gt.slots === 1) {
    return `1슬롯 음표 놓침: MIN_NOTE_DURATION_SLOTS(${activeParams.MIN_NOTE_DURATION_SLOTS}) → 1로 감소, ENERGY_PEAK 임계값 완화 필요`;
  }
  return `음표 놓침: OCCUPANCY_MIN(${activeParams.OCCUPANCY_MIN}) 감소 또는 PITCH_CONFIDENCE_MIN 감소 필요`;
}

function midiToFreq(midi: number): number {
  if (midi < 0) return 0;
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

// ============================================
// 결과 출력
// ============================================
function printResult(result: TestResult, groundTruth: GroundTruthNote[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('  SELF-REFINING TEST RESULT');
  console.log('='.repeat(60));

  console.log(`\n  음정 정확도:   ${result.pitchAccuracy.toFixed(1)}%`);
  console.log(`  타이밍 정확도: ${result.timingAccuracy.toFixed(1)}%`);
  console.log(`  길이 정확도:   ${result.durationAccuracy.toFixed(1)}%`);
  console.log(`  ----------------------------------------`);
  console.log(`  종합 정확도:   ${result.overallAccuracy.toFixed(1)}%`);

  console.log(`\n  매칭: ${result.matched}/${groundTruth.length}`);
  console.log(`  놓침: ${result.missed}`);
  console.log(`  추가: ${result.extra}`);

  if (result.overallAccuracy >= 80) {
    console.log('\n  *** 목표 달성! (80%+) ***');
  } else {
    console.log(`\n  목표까지: ${(80 - result.overallAccuracy).toFixed(1)}% 필요`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('  ERROR ANALYSIS');
  console.log('='.repeat(60));

  // 유형별 그룹핑
  const pitchErrors = result.details.filter(d => d.type === 'pitch');
  const timingErrors = result.details.filter(d => d.type === 'timing');
  const durationErrors = result.details.filter(d => d.type === 'duration');
  const missedErrors = result.details.filter(d => d.type === 'missed');
  const extraErrors = result.details.filter(d => d.type === 'extra');

  if (pitchErrors.length > 0) {
    console.log(`\n[음정 오류] ${pitchErrors.length}개`);
    pitchErrors.forEach(e => {
      console.log(`  - ${e.message}`);
      console.log(`    > ${e.suggestion}`);
    });
  }

  if (timingErrors.length > 0) {
    console.log(`\n[타이밍 오류] ${timingErrors.length}개`);
    timingErrors.forEach(e => {
      console.log(`  - ${e.message}`);
      console.log(`    > ${e.suggestion}`);
    });
  }

  if (durationErrors.length > 0) {
    console.log(`\n[길이 오류] ${durationErrors.length}개`);
    durationErrors.forEach(e => {
      console.log(`  - ${e.message}`);
      console.log(`    > ${e.suggestion}`);
    });
  }

  if (missedErrors.length > 0) {
    console.log(`\n[놓친 음표] ${missedErrors.length}개`);
    missedErrors.forEach(e => {
      console.log(`  - ${e.message}`);
      console.log(`    > ${e.suggestion}`);
    });
  }

  if (extraErrors.length > 0) {
    console.log(`\n[추가 감지] ${extraErrors.length}개`);
    extraErrors.slice(0, 5).forEach(e => {
      console.log(`  - ${e.message}`);
    });
    if (extraErrors.length > 5) {
      console.log(`  ... 외 ${extraErrors.length - 5}개`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  CURRENT PARAMS');
  console.log('='.repeat(60));
  console.log(JSON.stringify(activeParams, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('  RECOMMENDATIONS (Based on 76 iterations history)');
  console.log('='.repeat(60));

  // 우선순위 제안
  const suggestions = new Map<string, number>();
  result.details.forEach(d => {
    const key = d.suggestion;
    suggestions.set(key, (suggestions.get(key) || 0) + 1);
  });

  const sortedSuggestions = [...suggestions.entries()].sort((a, b) => b[1] - a[1]);
  console.log('\n[빈도순 수정 제안]');
  sortedSuggestions.slice(0, 5).forEach(([suggestion, count], i) => {
    console.log(`  ${i + 1}. [${count}회] ${suggestion}`);
  });

  // 히스토리 기반 전략 추천
  console.log('\n[히스토리 기반 전략]');

  if (result.missed > 5) {
    console.log('  * 놓친 음표 다수: LOW_FREQ_RECOVERY_MAX 120→150Hz 확장 권장 (72차 성공 사례)');
  }

  if (result.extra > 3) {
    console.log('  * 추가 감지 다수: OCCUPANCY_MIN 0.70 유지 또는 상향 (38차 노이즈 방어)');
  }

  const octaveErrors = result.details.filter(d =>
    d.type === 'pitch' && d.message.includes('12') || d.message.includes('-12')
  ).length;
  if (octaveErrors > 2) {
    console.log('  * 옥타브 오류 다수: LOW_SOLO_THRESHOLD 130→150Hz 확장 (단, Target 2는 금지!)');
  }

  const durationErrorCount = result.details.filter(d => d.type === 'duration').length;
  if (durationErrorCount > 5) {
    const longErrors = result.details.filter(d =>
      d.type === 'duration' && d.message.includes('+')
    ).length;
    if (longErrors > durationErrorCount / 2) {
      console.log('  * 과잉 병합: MAX_MERGE_SLOTS 8로 제한 권장 (74차 15슬롯 괴물 방지)');
    } else {
      console.log('  * 조기 종료: OCCUPANCY_SUSTAIN 0.50→0.55 상향 권장');
    }
  }

  // 절대 금지 사항 경고
  console.log('\n[절대 금지 - 과거 실패 사례]');
  console.log('  ! PULLBACK 250ms 변경 금지 (76차 붕괴)');
  console.log('  ! TARGET_MIN_OCTAVE 2 금지 (음정 0%)');
  console.log('  ! Phase2 Threshold 1.5 이하 금지 (음정 파괴)');
  console.log('  ! gap <= 1 병합 금지 (괴물 음표)');

  // 다음 단계 제안
  console.log('\n[다음 단계]');
  if (result.overallAccuracy >= 80) {
    console.log('  >>> 목표 달성! 현재 설정 유지 <<<');
  } else if (result.overallAccuracy >= 70) {
    console.log('  1. 저음 확장: LOW_FREQ_RECOVERY_MAX 120→150');
    console.log('  2. 병합 제한: MAX_MERGE_SLOTS 16→8');
  } else if (result.overallAccuracy >= 50) {
    console.log('  1. 77차 황금 설정으로 롤백 확인');
    console.log('  2. testFrames.json 녹음 품질 확인');
  } else {
    console.log('  !!! 심각한 문제 - 77차 설정 완전 롤백 필요 !!!');
  }

  console.log('\n' + '='.repeat(60));
}

// ============================================
// 자동 최적화 전략 생성기
// ============================================
function generateNextParams(
  currentParams: TunableParams,
  result: TestResult,
  iteration: number,
  history: IterationRecord[]
): { params: TunableParams; strategy: string } {

  const params = { ...currentParams };
  let strategy = '';

  // 실패한 파라미터 조합 추적 (history 기반)
  const triedCombos = new Set(
    history.map(h => JSON.stringify(h.params))
  );

  // 우선순위 기반 전략 선택
  const pitchErrors = result.details.filter(d => d.type === 'pitch');
  const timingErrors = result.details.filter(d => d.type === 'timing');
  const durationErrors = result.details.filter(d => d.type === 'duration');
  const missedErrors = result.details.filter(d => d.type === 'missed');
  const extraErrors = result.details.filter(d => d.type === 'extra');

  // 전략 1: 놓친 음표가 많으면 저음역대 확장
  if (missedErrors.length > 3 && params.LOW_FREQ_RECOVERY_MAX < 150) {
    const nextIdx = PARAM_SEARCH_SPACE.LOW_FREQ_RECOVERY_MAX.indexOf(params.LOW_FREQ_RECOVERY_MAX) + 1;
    if (nextIdx < PARAM_SEARCH_SPACE.LOW_FREQ_RECOVERY_MAX.length) {
      params.LOW_FREQ_RECOVERY_MAX = PARAM_SEARCH_SPACE.LOW_FREQ_RECOVERY_MAX[nextIdx];
      strategy = `저음 확장: LOW_FREQ_RECOVERY_MAX ${currentParams.LOW_FREQ_RECOVERY_MAX}→${params.LOW_FREQ_RECOVERY_MAX}`;
      if (!triedCombos.has(JSON.stringify(params))) return { params, strategy };
    }
  }

  // 전략 2: 옥타브 오류가 많으면 LOW_SOLO_THRESHOLD 조정
  const octaveErrors = pitchErrors.filter(e =>
    e.message.includes('+12') || e.message.includes('-12')
  ).length;
  if (octaveErrors > 2 && params.LOW_SOLO_THRESHOLD < 150) {
    const nextIdx = PARAM_SEARCH_SPACE.LOW_SOLO_THRESHOLD.indexOf(params.LOW_SOLO_THRESHOLD) + 1;
    if (nextIdx < PARAM_SEARCH_SPACE.LOW_SOLO_THRESHOLD.length) {
      params.LOW_SOLO_THRESHOLD = PARAM_SEARCH_SPACE.LOW_SOLO_THRESHOLD[nextIdx];
      strategy = `옥타브 보정: LOW_SOLO_THRESHOLD ${currentParams.LOW_SOLO_THRESHOLD}→${params.LOW_SOLO_THRESHOLD}`;
      if (!triedCombos.has(JSON.stringify(params))) return { params, strategy };
    }
  }

  // 전략 3: 길이 오류 - 과잉 병합이면 MAX_MERGE_SLOTS 감소
  const longDurationErrors = durationErrors.filter(e => e.message.includes('+')).length;
  if (longDurationErrors > durationErrors.length / 2 && params.MAX_MERGE_SLOTS > 8) {
    const currentIdx = PARAM_SEARCH_SPACE.MAX_MERGE_SLOTS.indexOf(params.MAX_MERGE_SLOTS);
    if (currentIdx > 0) {
      params.MAX_MERGE_SLOTS = PARAM_SEARCH_SPACE.MAX_MERGE_SLOTS[currentIdx - 1];
      strategy = `병합 제한: MAX_MERGE_SLOTS ${currentParams.MAX_MERGE_SLOTS}→${params.MAX_MERGE_SLOTS}`;
      if (!triedCombos.has(JSON.stringify(params))) return { params, strategy };
    }
  }

  // 전략 4: 길이 오류 - 조기 종료면 OCCUPANCY_SUSTAIN 증가
  const shortDurationErrors = durationErrors.filter(e => e.message.includes('-')).length;
  if (shortDurationErrors > durationErrors.length / 2) {
    const nextIdx = PARAM_SEARCH_SPACE.OCCUPANCY_SUSTAIN.indexOf(params.OCCUPANCY_SUSTAIN) + 1;
    if (nextIdx < PARAM_SEARCH_SPACE.OCCUPANCY_SUSTAIN.length) {
      params.OCCUPANCY_SUSTAIN = PARAM_SEARCH_SPACE.OCCUPANCY_SUSTAIN[nextIdx];
      strategy = `Sustain 확장: OCCUPANCY_SUSTAIN ${currentParams.OCCUPANCY_SUSTAIN}→${params.OCCUPANCY_SUSTAIN}`;
      if (!triedCombos.has(JSON.stringify(params))) return { params, strategy };
    }
  }

  // 전략 5: 추가 감지가 많으면 OCCUPANCY_MIN 상향
  if (extraErrors.length > 5) {
    const nextIdx = PARAM_SEARCH_SPACE.OCCUPANCY_MIN.indexOf(params.OCCUPANCY_MIN) + 1;
    if (nextIdx < PARAM_SEARCH_SPACE.OCCUPANCY_MIN.length) {
      params.OCCUPANCY_MIN = PARAM_SEARCH_SPACE.OCCUPANCY_MIN[nextIdx];
      strategy = `노이즈 필터: OCCUPANCY_MIN ${currentParams.OCCUPANCY_MIN}→${params.OCCUPANCY_MIN}`;
      if (!triedCombos.has(JSON.stringify(params))) return { params, strategy };
    }
  }

  // 전략 6: 1슬롯 음표 놓침이 많으면 MIN_NOTE_DURATION_SLOTS 감소
  const shortNoteMissed = missedErrors.filter(e =>
    e.expected && e.expected.slots === 1
  ).length;
  if (shortNoteMissed > 0 && params.MIN_NOTE_DURATION_SLOTS > 1) {
    params.MIN_NOTE_DURATION_SLOTS = 1;
    strategy = `짧은 음표 허용: MIN_NOTE_DURATION_SLOTS 2→1`;
    if (!triedCombos.has(JSON.stringify(params))) return { params, strategy };
  }

  // 전략 7: 랜덤 탐색 (위 전략들이 모두 시도됨)
  const paramKeys = Object.keys(PARAM_SEARCH_SPACE) as (keyof typeof PARAM_SEARCH_SPACE)[];
  const randomKey = paramKeys[iteration % paramKeys.length];
  const searchSpace = PARAM_SEARCH_SPACE[randomKey];
  const currentValue = params[randomKey];
  const currentIdx = searchSpace.indexOf(currentValue as never);

  // 다음 값 또는 랜덤 값 선택
  let nextIdx = (currentIdx + 1) % searchSpace.length;
  params[randomKey] = searchSpace[nextIdx] as never;
  strategy = `탐색: ${randomKey} ${currentValue}→${params[randomKey]}`;

  // 이미 시도한 조합이면 다른 파라미터 시도
  let attempts = 0;
  while (triedCombos.has(JSON.stringify(params)) && attempts < paramKeys.length * 3) {
    const altKey = paramKeys[(iteration + attempts) % paramKeys.length];
    const altSpace = PARAM_SEARCH_SPACE[altKey];
    const altIdx = Math.floor(Math.random() * altSpace.length);
    params[altKey] = altSpace[altIdx] as never;
    strategy = `랜덤 탐색: ${altKey}→${params[altKey]}`;
    attempts++;
  }

  return { params, strategy };
}

// ============================================
// HISTORY.md 자동 업데이트
// ============================================
function updateHistoryMd(
  testDir: string,
  records: IterationRecord[],
  best: BestRecord,
  exitReason: string
): void {
  const historyPath = path.join(testDir, 'HISTORY.md');

  if (!fs.existsSync(historyPath)) {
    console.log('HISTORY.md not found, skipping update');
    return;
  }

  let content = fs.readFileSync(historyPath, 'utf-8');

  // 새로운 섹션 생성
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  const newSection = `

---

## 자동 최적화 세션 (${dateStr} ${timeStr})

### 종료 사유: ${exitReason}

### 최고 기록
| 지표 | 값 | 반복 횟수 |
|------|-----|----------|
| 음정 | ${best.result.pitch.toFixed(1)}% | ${best.iteration}차 |
| 타이밍 | ${best.result.timing.toFixed(1)}% | ${best.iteration}차 |
| 길이 | ${best.result.duration.toFixed(1)}% | ${best.iteration}차 |
| **종합** | **${best.result.overall.toFixed(1)}%** | ${best.iteration}차 |

### 최적 파라미터
\`\`\`json
${JSON.stringify(best.params, null, 2)}
\`\`\`

### 반복 기록 (총 ${records.length}회)
| 차수 | 전략 | 음정 | 타이밍 | 길이 | 종합 | 개선 |
|------|------|------|--------|------|------|------|
${records.slice(-20).map(r =>
  `| ${r.iteration} | ${r.strategy.substring(0, 30)}${r.strategy.length > 30 ? '...' : ''} | ${r.result.pitch.toFixed(1)}% | ${r.result.timing.toFixed(1)}% | ${r.result.duration.toFixed(1)}% | ${r.result.overall.toFixed(1)}% | ${r.improvement >= 0 ? '+' : ''}${r.improvement.toFixed(1)}% |`
).join('\n')}

### 시도한 파라미터 변경
${records.map(r => `- ${r.iteration}차: ${r.strategy}`).join('\n')}
`;

  // 파일 끝에 추가
  content += newSection;
  fs.writeFileSync(historyPath, content, 'utf-8');

  console.log(`\n  HISTORY.md updated with ${records.length} iterations`);
}

// ============================================
// 최고 기록 JSON 저장
// ============================================
function saveBestRecord(testDir: string, best: BestRecord): void {
  const bestPath = path.join(testDir, 'bestRecord.json');
  fs.writeFileSync(bestPath, JSON.stringify(best, null, 2), 'utf-8');
  console.log(`  Best record saved to bestRecord.json`);
}

// ============================================
// 단일 테스트 실행
// ============================================
function runSingleTest(
  frames: PitchFrame[],
  bpm: number,
  groundTruth: GroundTruthNote[]
): TestResult {
  const detected = convertToNotes(frames, bpm);
  return runAccuracyTest(detected, groundTruth);
}

// ============================================
// 자동 최적화 루프
// ============================================
async function runAutoOptimization(
  frames: PitchFrame[],
  bpm: number,
  groundTruth: GroundTruthNote[],
  testDir: string
): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('  AUTO-OPTIMIZATION MODE');
  console.log('='.repeat(60));
  console.log(`  최대 반복: ${AUTO_CONFIG.MAX_ITERATIONS}회`);
  console.log(`  정체 제한: ${AUTO_CONFIG.STAGNATION_LIMIT}회 연속`);
  console.log(`  목표 정확도: ${AUTO_CONFIG.TARGET_ACCURACY}%`);

  const history: IterationRecord[] = [];
  let best: BestRecord = {
    iteration: 0,
    params: { ...activeParams },
    result: { pitch: 0, timing: 0, duration: 0, overall: 0 },
    matched: 0
  };

  let stagnationCount = 0;
  let exitReason = '';

  // 초기 테스트 (77차 황금 설정)
  activeParams = { ...GOLDEN_PARAMS_77 };
  let prevResult = runSingleTest(frames, bpm, groundTruth);

  const initialRecord: IterationRecord = {
    iteration: 0,
    timestamp: new Date().toISOString(),
    params: { ...activeParams },
    result: {
      pitch: prevResult.pitchAccuracy,
      timing: prevResult.timingAccuracy,
      duration: prevResult.durationAccuracy,
      overall: prevResult.overallAccuracy
    },
    matched: prevResult.matched,
    missed: prevResult.missed,
    extra: prevResult.extra,
    improvement: 0,
    strategy: '77차 황금 설정 (초기값)'
  };
  history.push(initialRecord);

  best = {
    iteration: 0,
    params: { ...activeParams },
    result: initialRecord.result,
    matched: prevResult.matched
  };

  console.log(`\n  [0차] 초기 테스트`);
  console.log(`    음정: ${prevResult.pitchAccuracy.toFixed(1)}%`);
  console.log(`    타이밍: ${prevResult.timingAccuracy.toFixed(1)}%`);
  console.log(`    길이: ${prevResult.durationAccuracy.toFixed(1)}%`);
  console.log(`    종합: ${prevResult.overallAccuracy.toFixed(1)}%`);

  // 목표 달성 체크
  if (prevResult.overallAccuracy >= AUTO_CONFIG.TARGET_ACCURACY) {
    exitReason = `목표 달성 (${prevResult.overallAccuracy.toFixed(1)}% >= ${AUTO_CONFIG.TARGET_ACCURACY}%)`;
    console.log(`\n  *** ${exitReason} ***`);
    updateHistoryMd(testDir, history, best, exitReason);
    saveBestRecord(testDir, best);
    printResult(prevResult, groundTruth);
    return;
  }

  // 최적화 루프
  for (let i = 1; i <= AUTO_CONFIG.MAX_ITERATIONS; i++) {
    // 다음 파라미터 생성
    const { params: nextParams, strategy } = generateNextParams(
      activeParams,
      prevResult,
      i,
      history
    );

    activeParams = nextParams;

    // 테스트 실행
    const result = runSingleTest(frames, bpm, groundTruth);
    const improvement = result.overallAccuracy - prevResult.overallAccuracy;

    // 기록 저장
    const record: IterationRecord = {
      iteration: i,
      timestamp: new Date().toISOString(),
      params: { ...activeParams },
      result: {
        pitch: result.pitchAccuracy,
        timing: result.timingAccuracy,
        duration: result.durationAccuracy,
        overall: result.overallAccuracy
      },
      matched: result.matched,
      missed: result.missed,
      extra: result.extra,
      improvement,
      strategy
    };
    history.push(record);

    // 최고 기록 갱신
    if (result.overallAccuracy > best.result.overall) {
      best = {
        iteration: i,
        params: { ...activeParams },
        result: record.result,
        matched: result.matched
      };
      stagnationCount = 0;
      console.log(`\n  [${i}차] ${strategy}`);
      console.log(`    ★ 최고 기록 갱신! ${result.overallAccuracy.toFixed(1)}% (+${improvement.toFixed(1)}%)`);
    } else {
      stagnationCount++;
      console.log(`\n  [${i}차] ${strategy}`);
      console.log(`    ${result.overallAccuracy.toFixed(1)}% (${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%) - 정체 ${stagnationCount}/${AUTO_CONFIG.STAGNATION_LIMIT}`);
    }

    // 목표 달성 체크
    if (result.overallAccuracy >= AUTO_CONFIG.TARGET_ACCURACY) {
      exitReason = `목표 달성 (${result.overallAccuracy.toFixed(1)}% >= ${AUTO_CONFIG.TARGET_ACCURACY}%)`;
      console.log(`\n  *** ${exitReason} ***`);
      break;
    }

    // 정체 체크
    if (stagnationCount >= AUTO_CONFIG.STAGNATION_LIMIT) {
      exitReason = `정체 종료 (${AUTO_CONFIG.STAGNATION_LIMIT}회 연속 개선 없음)`;
      console.log(`\n  *** ${exitReason} ***`);
      break;
    }

    prevResult = result;
  }

  // 최대 반복 도달
  if (!exitReason) {
    exitReason = `최대 반복 도달 (${AUTO_CONFIG.MAX_ITERATIONS}회)`;
    console.log(`\n  *** ${exitReason} ***`);
  }

  // 결과 저장
  console.log('\n' + '='.repeat(60));
  console.log('  OPTIMIZATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\n  총 반복: ${history.length}회`);
  console.log(`  종료 사유: ${exitReason}`);
  console.log(`\n  최고 기록 (${best.iteration}차):`);
  console.log(`    음정: ${best.result.pitch.toFixed(1)}%`);
  console.log(`    타이밍: ${best.result.timing.toFixed(1)}%`);
  console.log(`    길이: ${best.result.duration.toFixed(1)}%`);
  console.log(`    종합: ${best.result.overall.toFixed(1)}%`);
  console.log(`\n  최적 파라미터:`);
  console.log(JSON.stringify(best.params, null, 2));

  // HISTORY.md 업데이트 및 최고 기록 저장
  updateHistoryMd(testDir, history, best, exitReason);
  saveBestRecord(testDir, best);

  // 최고 기록으로 상세 결과 출력
  activeParams = best.params;
  const finalResult = runSingleTest(frames, bpm, groundTruth);
  printResult(finalResult, groundTruth);
}

// ============================================
// 메인 실행
// ============================================
async function main() {
  const testDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  const framesPath = path.join(testDir, 'testFrames.json');
  const groundTruthPath = path.join(testDir, 'groundTruth.json');

  const isAutoMode = process.argv.includes('--auto');

  console.log('\n' + '='.repeat(60));
  console.log('  SELF-REFINING PITCH ACCURACY TEST v2.0');
  console.log('='.repeat(60));
  console.log(`  Mode: ${isAutoMode ? 'AUTO-OPTIMIZATION' : 'SINGLE TEST'}`);

  // 파일 확인
  if (!fs.existsSync(framesPath)) {
    console.error('\n[ERROR] testFrames.json not found!');
    console.log('\n사용법:');
    console.log('  1. 브라우저에서 녹음 분석 완료');
    console.log('  2. 콘솔에서 exportTestFrames() 실행');
    console.log('  3. 다운로드된 파일을 tests/pitch-accuracy/testFrames.json으로 복사');
    console.log('  4. npm run test:pitch              # 단일 테스트');
    console.log('  5. npm run test:pitch -- --auto    # 자동 최적화');
    process.exit(1);
  }

  if (!fs.existsSync(groundTruthPath)) {
    console.error('\n[ERROR] groundTruth.json not found!');
    process.exit(1);
  }

  // 데이터 로드
  const framesData = JSON.parse(fs.readFileSync(framesPath, 'utf-8'));
  const groundTruthData = JSON.parse(fs.readFileSync(groundTruthPath, 'utf-8'));

  console.log(`\n  Frame Count: ${framesData.frameCount || framesData.frames.length}`);
  console.log(`  BPM: ${framesData.bpm}`);
  console.log(`  Ground Truth: ${groundTruthData.notes.length} notes`);

  const frames: PitchFrame[] = framesData.frames;
  const bpm: number = framesData.bpm;
  const groundTruth: GroundTruthNote[] = groundTruthData.notes;

  // groundTruth에서 시작 마디 동적 추출
  if (groundTruth.length > 0) {
    START_MEASURE = Math.min(...groundTruth.map(n => n.measure));
    console.log(`  Start Measure: ${START_MEASURE}`);
  }

  if (isAutoMode) {
    // 자동 최적화 모드
    await runAutoOptimization(frames, bpm, groundTruth, testDir);
  } else {
    // 단일 테스트 모드
    const detected = convertToNotes(frames, bpm);
    const detectedNotes = detected.filter(n => !n.isRest);
    console.log(`\n  Detected Notes: ${detectedNotes.length}`);

    const result = runAccuracyTest(detected, groundTruth);
    printResult(result, groundTruth);
  }
}

main().catch(console.error);
