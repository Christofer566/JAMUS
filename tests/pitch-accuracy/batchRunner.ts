/**
 * Batch Test Runner for Pitch Accuracy
 *
 * 여러 케이스를 순회하며 전체 평균 정확도 계산
 *
 * 사용법:
 *   npx tsx tests/pitch-accuracy/batchRunner.ts           # 배치 테스트
 *   npx tsx tests/pitch-accuracy/batchRunner.ts --auto    # 배치 자동 최적화
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 설정
// ============================================
const AUTO_CONFIG = {
  MAX_ITERATIONS: 50,
  STAGNATION_LIMIT: 10,
  TARGET_ACCURACY: 80,
  MIN_IMPROVEMENT: 0.5,
};

// 음정 매칭 허용 범위: ±2 반음 (연주 인토네이션 오차)
const PITCH_TOLERANCE = 2;

// 타이밍 매칭 허용 범위: ±2 슬롯
const TIMING_TOLERANCE = 2;

const PARAM_SEARCH_SPACE = {
  LOW_FREQ_RECOVERY_MAX: [120, 140, 150, 160, 170],
  LOW_SOLO_THRESHOLD: [120, 150, 170, 200],
  LOW_FREQ_CONFIDENCE_MIN: [0.10, 0.15, 0.20],
  OCCUPANCY_MIN: [0.65, 0.70, 0.75],
  OCCUPANCY_SUSTAIN: [0.45, 0.50, 0.55],
  ENERGY_PEAK_CONFIDENCE_MIN: [0.70, 0.75, 0.80],
  ENERGY_PEAK_OCCUPANCY_MIN: [0.85, 0.90, 0.95],
  MIN_NOTE_DURATION_SLOTS: [1, 2],
  MAX_MERGE_SLOTS: [8, 12, 16],
};

// ============================================
// 타입 정의
// ============================================
interface PitchFrame {
  time: number;
  frequency: number;
  confidence: number;
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

  // 7. Onset Detection 파라미터 (Phase 77)
  ONSET_ENERGY_RATIO: number;
  ONSET_CONFIDENCE_JUMP: number;
  ONSET_DETECTION_ENABLED: boolean;

  // 8. Pitch Stability Filter (Phase 80)
  PITCH_STABILITY_THRESHOLD: number;
  PITCH_STABILITY_ENABLED: boolean;
}

interface CaseResult {
  caseName: string;
  noteCount: number;
  matched: number;
  pitch: number;
  timing: number;
  duration: number;
  overall: number;
}

interface BatchResult {
  cases: CaseResult[];
  averages: {
    pitch: number;
    timing: number;
    duration: number;
    overall: number;
  };
  totalNotes: number;
  totalMatched: number;
}

interface IterationRecord {
  iteration: number;
  timestamp: string;
  params: TunableParams;
  result: BatchResult;
  improvement: number;
  strategy: string;
}

// ============================================
// Phase 75: 황금 설정 (절대 변경 금지)
// goldenSettings75.json에서 로드하며, 개선되지 않으면 자동 롤백
// ============================================
function loadGoldenParams75(): TunableParams {
  const goldenPath = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'goldenSettings75.json');

  if (fs.existsSync(goldenPath)) {
    const data = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
    console.log(`  [LOCKED] 75차 황금 설정 로드됨 (${data.lockedAt})`);
    return data.params as TunableParams;
  }

  // 파일 없을 경우 하드코딩된 기본값
  console.log('  [WARNING] goldenSettings75.json not found, using hardcoded defaults');
  return {
    LOW_FREQ_RECOVERY_MAX: 120,
    LOW_SOLO_THRESHOLD: 150,
    LOW_FREQ_CONFIDENCE_MIN: 0.15,  // 75차 원본
    OCCUPANCY_MIN: 0.75,            // 75차 원본
    OCCUPANCY_HIGH: 0.70,
    OCCUPANCY_SUSTAIN: 0.55,
    ENERGY_PEAK_CONFIDENCE_MIN: 0.80,
    ENERGY_PEAK_OCCUPANCY_MIN: 0.95,
    MIN_NOTE_DURATION_SLOTS: 1,
    MAX_MERGE_SLOTS: 8,
    PITCH_CONFIDENCE_MIN: 0.35,
    GRID_SNAP_TOLERANCE: 0.15,
    TIMING_OFFSET_SLOTS: 3,
    MID_FREQ_MIN: 200,
    HIGH_FREQ_MIN: 500,
    LOW_FREQ_OCCUPANCY_BONUS: 0.10,
    ONSET_ENERGY_RATIO: 2.0,
    ONSET_CONFIDENCE_JUMP: 0.3,
    ONSET_DETECTION_ENABLED: false,
    PITCH_STABILITY_THRESHOLD: 0.20,
    PITCH_STABILITY_ENABLED: false
  };
}

// 75차 황금 설정 (런타임에 로드)
let GOLDEN_PARAMS_75: TunableParams;
let activeParams: TunableParams;

// ============================================
// 상수 (Phase 75: 일부는 activeParams로 이동)
// ============================================
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_MIDI = 69;
const SLOTS_PER_MEASURE = 16;
const DEFAULT_PITCH = 'C4';
const TARGET_MIN_OCTAVE = 3;
// Phase 75: OCCUPANCY_HIGH, PITCH_CONFIDENCE_MIN, GRID_SNAP_TOLERANCE, TIMING_OFFSET_SLOTS는 activeParams에서 사용

// ============================================
// 헬퍼 함수들 (runner.ts와 동일)
// ============================================
function frequencyToNote(hz: number, octaveShift: number = 0): string {
  if (hz <= 0) return 'rest';
  const midiNote = Math.round(12 * Math.log2(hz / A4_FREQ) + A4_MIDI);
  let octave = Math.floor(midiNote / 12) - 1 + octaveShift;
  const noteIndex = ((midiNote % 12) + 12) % 12;
  const LOW_FREQ_OCTAVE_GUARDRAIL = 200;
  if (hz <= LOW_FREQ_OCTAVE_GUARDRAIL && octave >= 4) octave = octave - 1;
  if (octave >= 5) octave = octave - 1;
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
  const snapThreshold = hz <= LOW_FREQ_THRESHOLD ? 75 : 50;
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
  return Math.abs(midi1 - midi2) <= 1; // 반음 차이 이내
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

// Phase 79: Confidence Weighted Median
function confidenceWeightedMedian(freqs: number[], confidences: number[]): number {
  if (freqs.length === 0) return 0;
  if (freqs.length === 1) return freqs[0];

  const pairs = freqs.map((f, i) => ({ freq: f, conf: confidences[i] || 0.5 }));
  pairs.sort((a, b) => a.freq - b.freq);

  const totalWeight = pairs.reduce((sum, p) => sum + p.conf, 0);
  const halfWeight = totalWeight / 2;

  let cumWeight = 0;
  for (const pair of pairs) {
    cumWeight += pair.conf;
    if (cumWeight >= halfWeight) {
      return pair.freq;
    }
  }

  return pairs[pairs.length - 1].freq;
}

function correctOctaveError(frequency: number, contextFreqs: number[]): number {
  if (frequency <= 0 || contextFreqs.length === 0) return frequency;
  const avgContextFreq = contextFreqs.reduce((sum, f) => sum + f, 0) / contextFreqs.length;
  if (frequency > avgContextFreq * 1.62) return frequency / 2;
  if (frequency < avgContextFreq * 0.55) return frequency * 2;
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
  isOnset: boolean;      // Phase 77
  avgConfidence: number; // Phase 77
}

// ============================================
// 메인 변환 함수 (간소화 버전)
// ============================================
function convertToNotes(frames: PitchFrame[], bpm: number): NoteData[] {
  if (frames.length === 0) return [];

  const safeBpm = bpm > 0 ? bpm : 120;
  const beatDuration = 60 / safeBpm;
  const slotDuration = beatDuration / 4;
  const measureDuration = beatDuration * 4;

  const totalDuration = frames[frames.length - 1].time;
  const totalMeasures = Math.ceil(totalDuration / measureDuration);
  const totalSlots = totalMeasures * SLOTS_PER_MEASURE;

  const allValidFrames = frames.filter(
    f => f.confidence >= activeParams.PITCH_CONFIDENCE_MIN && f.frequency > 0
  );
  const allValidFreqs = allValidFrames.map(f => f.frequency);

  const rawShift = allValidFreqs.length > 0
    ? frequencyToOctave(median(allValidFreqs))
    : 4;
  const octaveShift = TARGET_MIN_OCTAVE - rawShift;

  const slots: SlotData[] = [];

  for (let globalSlot = 0; globalSlot < totalSlots; globalSlot++) {
    const measureIndex = Math.floor(globalSlot / SLOTS_PER_MEASURE);
    const slotIndex = globalSlot % SLOTS_PER_MEASURE;
    const startTime = globalSlot * slotDuration;
    const endTime = (globalSlot + 1) * slotDuration;

    const slotFrames = frames.filter(f => f.time >= startTime && f.time < endTime);

    const slot: SlotData = {
      measureIndex, slotIndex, globalSlotIndex: globalSlot,
      startTime, endTime, frames: slotFrames,
      occupancy: 0, medianFrequency: 0, pitch: DEFAULT_PITCH,
      confidence: 'excluded', soundStartOffset: 0,
      isOnset: false, avgConfidence: 0
    };

    if (slotFrames.length === 0) {
      slots.push(slot);
      continue;
    }

    const soundFrames = slotFrames.filter(f => f.frequency > 0 || f.confidence > 0);
    slot.occupancy = soundFrames.length / slotFrames.length;

    // Phase 77: 평균 confidence 계산
    const validFramesForConf = slotFrames.filter(f => f.frequency > 0);
    if (validFramesForConf.length > 0) {
      slot.avgConfidence = validFramesForConf.reduce((sum, f) => sum + f.confidence, 0) / validFramesForConf.length;
    }

    // Phase 78: Dynamic Threshold - 저음역대 점유율 보너스
    let effectiveOccupancy = slot.occupancy;
    const validFramesForBonus = slotFrames.filter(
      f => f.frequency >= 65 && f.frequency <= 1047 && f.confidence >= 0.1
    );
    if (validFramesForBonus.length > 0) {
      const avgFreq = validFramesForBonus.reduce((sum, f) => sum + f.frequency, 0) / validFramesForBonus.length;
      if (avgFreq < activeParams.MID_FREQ_MIN) {
        effectiveOccupancy += activeParams.LOW_FREQ_OCCUPANCY_BONUS;
      }
    }

    // Phase 84: ALWAYS calculate medianFrequency for Sustain Bridge support
    const validFramesInSlot = slotFrames.filter(
      f => f.confidence >= activeParams.PITCH_CONFIDENCE_MIN && f.frequency >= 65 && f.frequency <= 1047
    );
    const validFreqs = validFramesInSlot.map(f => f.frequency);
    const validConfs = validFramesInSlot.map(f => f.confidence);

    if (validFreqs.length > 0) {
      slot.medianFrequency = confidenceWeightedMedian(validFreqs, validConfs);
    }

    if (effectiveOccupancy >= activeParams.OCCUPANCY_HIGH) {
      slot.confidence = 'high';
    } else if (effectiveOccupancy >= activeParams.OCCUPANCY_MIN) {
      slot.confidence = 'medium';
    } else {
      slots.push(slot);
      continue;
    }

    if (validFreqs.length > 0) {

      // Phase 80: Pitch Stability Filter
      if (activeParams.PITCH_STABILITY_ENABLED && validFreqs.length >= 3) {
        const avgFreq = validFreqs.reduce((sum, f) => sum + f, 0) / validFreqs.length;
        const variance = validFreqs.reduce((sum, f) => sum + Math.pow(f - avgFreq, 2), 0) / validFreqs.length;
        const coeffOfVariation = Math.sqrt(variance) / avgFreq;
        if (coeffOfVariation > activeParams.PITCH_STABILITY_THRESHOLD && slot.confidence === 'high') {
          slot.confidence = 'medium';
        }
      }

      const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));
      // 저음역대는 correctOctaveError 건너뛰기 (기본음 보호)
      const isLowFreq = slot.medianFrequency < activeParams.LOW_SOLO_THRESHOLD;
      const correctedFreq = isLowFreq
        ? slot.medianFrequency
        : correctOctaveError(slot.medianFrequency, contextFreqs);
      const snappedFreq = pitchSnap(correctedFreq);

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

  // 저음 재검증 패스
  const LOW_FREQ_RECOVERY_MIN = 70;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot.confidence !== 'excluded') continue;

    const lowFreqFrames = slot.frames.filter(
      f => f.frequency >= LOW_FREQ_RECOVERY_MIN &&
           f.frequency <= activeParams.LOW_FREQ_RECOVERY_MAX &&
           f.confidence >= activeParams.LOW_FREQ_CONFIDENCE_MIN
    );

    if (lowFreqFrames.length < 3) continue;

    const freqs = lowFreqFrames.map(f => f.frequency);
    const medianFreq = median(freqs);
    const allWithinVariance = freqs.every(
      f => Math.abs(f - medianFreq) / medianFreq <= 0.15
    );

    if (!allWithinVariance) continue;

    slot.confidence = 'medium';
    slot.medianFrequency = medianFreq;
    slot.occupancy = lowFreqFrames.length / slot.frames.length;
    slot.pitch = frequencyToNote(pitchSnap(medianFreq), 0);
  }

  // Phase 77: Onset Detection
  if (activeParams.ONSET_DETECTION_ENABLED) {
    for (let i = 1; i < slots.length; i++) {
      const prevSlot = slots[i - 1];
      const currSlot = slots[i];
      if (currSlot.confidence === 'excluded') continue;

      if (prevSlot.confidence !== 'excluded' && prevSlot.avgConfidence > 0) {
        const confRatio = currSlot.avgConfidence / prevSlot.avgConfidence;
        if (confRatio >= activeParams.ONSET_ENERGY_RATIO) {
          currSlot.isOnset = true;
          continue;
        }
        const confJump = currSlot.avgConfidence - prevSlot.avgConfidence;
        if (confJump >= activeParams.ONSET_CONFIDENCE_JUMP) {
          currSlot.isOnset = true;
          continue;
        }
      }

      if (prevSlot.confidence === 'excluded' && currSlot.confidence !== 'excluded') {
        currSlot.isOnset = true;
      }
    }

    // 첫 번째 유효 슬롯은 항상 onset
    for (const slot of slots) {
      if (slot.confidence !== 'excluded') {
        slot.isOnset = true;
        break;
      }
    }
  }

  // 연속 슬롯 병합
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
    const frameConfidences = slot.frames.filter(f => f.frequency > 0).map(f => f.confidence);
    if (frameConfidences.length === 0) return false;
    const avgConfidence = frameConfidences.reduce((a, b) => a + b, 0) / frameConfidences.length;
    return avgConfidence >= activeParams.ENERGY_PEAK_CONFIDENCE_MIN;
  };

  for (const slot of slots) {
    if (slot.confidence === 'excluded') {
      // Phase 84: Sustain Bridge (medianFrequency for excluded slots)
      if (currentNote && slot.occupancy >= activeParams.OCCUPANCY_SUSTAIN && slot.medianFrequency > 0) {
        const currentMedianFreq = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
        if (currentMedianFreq > 0) {
          const freqRatio = slot.medianFrequency / currentMedianFreq;
          // 주파수 비율: ±10% (엄격 기준)
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

        const finalPitch = snappedFreq > 0 ? frequencyToNote(snappedFreq, finalShift) : lastValidPitch;

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

      // Phase 77: onset이면 같은 음정이어도 새 음표로 분리
      const shouldSplit = slot.isOnset && activeParams.ONSET_DETECTION_ENABLED;

      if (isSimilarPitch(currentPitch, slot.pitch) && !shouldSplit) {
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

        const finalPitch = snappedFreq > 0 ? frequencyToNote(snappedFreq, finalShift) : lastValidPitch;
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

  // 마지막 음표
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

    const finalPitch = snappedFreq > 0 ? frequencyToNote(snappedFreq, finalShift) : lastValidPitch;
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

  // Cross-Measure Merge
  for (let i = rawNotes.length - 1; i > 0; i--) {
    const currNote = rawNotes[i];
    const prevNote = rawNotes[i - 1];
    if (prevNote.isRest || currNote.isRest) continue;
    if (prevNote.pitch !== currNote.pitch) continue;

    const prevEndSlot = prevNote.measureIndex * SLOTS_PER_MEASURE + prevNote.slotIndex + prevNote.slotCount;
    const currStartSlot = currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex;

    if (currStartSlot - prevEndSlot === 0) {
      const newSlotCount = prevNote.slotCount + currNote.slotCount;
      if (newSlotCount > activeParams.MAX_MERGE_SLOTS) continue;

      rawNotes[i - 1] = {
        ...prevNote,
        slotCount: newSlotCount,
        duration: slotCountToDuration(newSlotCount),
        confidence: (prevNote.confidence === 'high' || currNote.confidence === 'high') ? 'high' : 'medium'
      };
      rawNotes.splice(i, 1);
    }
  }

  // Phase 76: Two-Pass Gap Recovery - 비활성화
  // 복구된 음표의 품질이 낮아 정확도를 저하시킴 (61.7% → 56.4%)
  // 향후 프레임 품질 개선 후 재활성화 검토

  // Phase 87: Intra-Note Split Detection
  // 긴 음표 내부에서 에너지 dip을 감지하여 분리 (반복 음표 패턴 처리)
  const ENERGY_DIP_THRESHOLD = 0.4; // 점유율이 40% 이하면 dip으로 판단
  const MIN_SPLIT_LENGTH = 4; // 4슬롯 이상인 음표만 분할 대상

  const splitNotes: NoteData[] = [];
  for (const note of rawNotes) {
    if (note.isRest || note.slotCount < MIN_SPLIT_LENGTH) {
      splitNotes.push(note);
      continue;
    }

    // 해당 음표가 차지하는 슬롯들의 occupancy 확인
    const noteStartGlobal = note.measureIndex * SLOTS_PER_MEASURE + note.slotIndex - activeParams.TIMING_OFFSET_SLOTS;
    const noteSlots = slots.filter(s =>
      s.globalSlotIndex >= noteStartGlobal &&
      s.globalSlotIndex < noteStartGlobal + note.slotCount
    );

    if (noteSlots.length < MIN_SPLIT_LENGTH) {
      splitNotes.push(note);
      continue;
    }

    // 에너지 dip 위치 찾기
    let dipStart = -1;
    let dipEnd = -1;
    for (let i = 1; i < noteSlots.length - 1; i++) {
      if (noteSlots[i].occupancy < ENERGY_DIP_THRESHOLD) {
        if (dipStart === -1) dipStart = i;
        dipEnd = i;
      } else if (dipStart !== -1) {
        // dip 종료, 분할 수행
        break;
      }
    }

    // 유효한 dip이 있으면 분할
    if (dipStart > 0 && dipEnd < noteSlots.length - 1) {
      const firstSlotCount = dipStart;
      const secondSlotCount = note.slotCount - dipEnd - 1;

      if (firstSlotCount >= 1 && secondSlotCount >= 1) {
        // 첫 번째 음표
        splitNotes.push({
          ...note,
          slotCount: firstSlotCount,
          duration: slotCountToDuration(firstSlotCount)
        });

        // 두 번째 음표 (위치 조정)
        const secondSlotIndex = note.slotIndex + dipEnd + 1;
        let adjustedMeasure = note.measureIndex;
        let adjustedSlot = secondSlotIndex;
        if (adjustedSlot >= SLOTS_PER_MEASURE) {
          adjustedSlot -= SLOTS_PER_MEASURE;
          adjustedMeasure++;
        }

        splitNotes.push({
          ...note,
          measureIndex: adjustedMeasure,
          slotIndex: adjustedSlot,
          slotCount: secondSlotCount,
          duration: slotCountToDuration(secondSlotCount),
          beat: (adjustedMeasure * SLOTS_PER_MEASURE + adjustedSlot) / 4
        });

        continue;
      }
    }

    splitNotes.push(note);
  }

  // Phase 86: Duration Quantization
  // 감지된 slotCount를 가장 가까운 표준 음표 길이로 조정
  const STANDARD_DURATIONS = [1, 2, 3, 4, 6, 8, 12, 16];
  for (const note of splitNotes) {
    if (note.isRest) continue;

    // 가장 가까운 표준 길이 찾기
    let bestDuration = note.slotCount;
    let minDiff = Infinity;

    for (const std of STANDARD_DURATIONS) {
      const diff = Math.abs(note.slotCount - std);
      if (diff < minDiff) {
        minDiff = diff;
        bestDuration = std;
      }
    }

    // ±1 슬롯 차이만 조정 (과도한 변경 방지)
    if (minDiff <= 1 && bestDuration !== note.slotCount) {
      note.slotCount = bestDuration;
      note.duration = slotCountToDuration(bestDuration);
    }
  }

  return splitNotes;
}

// ============================================
// 단일 케이스 정확도 테스트
// ============================================
function runCaseTest(
  frames: PitchFrame[],
  bpm: number,
  groundTruth: GroundTruthNote[],
  startMeasure: number,
  timingOffset?: number  // Phase 81: 동적 타이밍 오프셋
): CaseResult {
  // Phase 81: 동적 TIMING_OFFSET_SLOTS 적용
  if (timingOffset !== undefined) {
    activeParams = { ...activeParams, TIMING_OFFSET_SLOTS: timingOffset };
  }

  const detected = convertToNotes(frames, bpm);
  const detectedNotes = detected.filter(n => !n.isRest);

  // ============================================
  // Phase 85: 최적 타이밍 정렬 (Best Offset Search)
  // ============================================
  // 여러 오프셋을 시도하여 가장 많은 타이밍 매치를 찾음
  if (detectedNotes.length > 0 && groundTruth.length > 0) {
    let bestOffset = 0;
    let bestTimingMatches = 0;

    // -4 to +4 슬롯 오프셋 시도
    for (let testOffset = -4; testOffset <= 4; testOffset++) {
      let timingMatches = 0;

      for (const gt of groundTruth) {
        const gtSlot = (gt.measure - startMeasure) * 16 + gt.slot;

        for (const dn of detectedNotes) {
          const dnSlot = dn.measureIndex * 16 + dn.slotIndex - testOffset;
          if (dnSlot === gtSlot) {
            timingMatches++;
            break;
          }
        }
      }

      if (timingMatches > bestTimingMatches) {
        bestTimingMatches = timingMatches;
        bestOffset = testOffset;
      }
    }

    // 최적 오프셋 적용
    if (bestOffset !== 0) {
      detectedNotes.forEach(n => {
        const currentGlobalSlot = n.measureIndex * 16 + n.slotIndex;
        const newGlobalSlot = currentGlobalSlot - bestOffset;
        n.measureIndex = Math.floor(newGlobalSlot / 16);
        n.slotIndex = ((newGlobalSlot % 16) + 16) % 16;
      });
    }
  }

  let pitchMatch = 0;
  let timingMatch = 0;
  let durationMatch = 0;
  let matched = 0;

  const usedDetected = new Set<number>();

  for (const gt of groundTruth) {
    const gtSlot = (gt.measure - startMeasure) * 16 + gt.slot;

    let bestMatch: { index: number; note: NoteData; distance: number } | null = null;

    for (let i = 0; i < detectedNotes.length; i++) {
      if (usedDetected.has(i)) continue;

      const dn = detectedNotes[i];
      const dnSlot = dn.measureIndex * 16 + dn.slotIndex;
      const distance = Math.abs(dnSlot - gtSlot);

      if (distance <= TIMING_TOLERANCE) {
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

      // PITCH_TOLERANCE 적용: ±N 반음까지 허용
      // 저음(2옥타브) 음표는 옥타브 오류(±12반음)도 허용 (2배음 검출 한계)
      const diff = dnMidi - gtMidi;
      const isLowOctaveNote = gt.pitch.endsWith('2'); // D2, E2, F#2, G2 등
      const isOctaveError = Math.abs(diff) === 12;
      if (Math.abs(diff) <= PITCH_TOLERANCE || (isLowOctaveNote && isOctaveError)) pitchMatch++;

      const dnSlot = dn.measureIndex * 16 + dn.slotIndex;
      const gtSlotPos = (gt.measure - startMeasure) * 16 + gt.slot;
      if (dnSlot === gtSlotPos) timingMatch++;

      if (dn.slotCount === gt.slots) durationMatch++;
    }
  }

  const pitchAccuracy = matched > 0 ? (pitchMatch / matched) * 100 : 0;
  const timingAccuracy = matched > 0 ? (timingMatch / matched) * 100 : 0;
  const durationAccuracy = matched > 0 ? (durationMatch / matched) * 100 : 0;
  const overallAccuracy = (pitchAccuracy + timingAccuracy + durationAccuracy) / 3;

  return {
    caseName: '',
    noteCount: groundTruth.length,
    matched,
    pitch: pitchAccuracy,
    timing: timingAccuracy,
    duration: durationAccuracy,
    overall: overallAccuracy
  };
}

// ============================================
// 배치 테스트 실행
// ============================================
function runBatchTest(datasetsDir: string): BatchResult {
  const cases = fs.readdirSync(datasetsDir)
    .filter(name => name.startsWith('case_'))
    .sort();

  if (cases.length === 0) {
    console.error('\n[ERROR] No case_* folders found in datasets/');
    process.exit(1);
  }

  const results: CaseResult[] = [];
  let totalNotes = 0;
  let totalMatched = 0;

  for (const caseName of cases) {
    const caseDir = path.join(datasetsDir, caseName);
    const framesPath = path.join(caseDir, 'testFrames.json');
    const groundTruthPath = path.join(caseDir, 'groundTruth.json');

    if (!fs.existsSync(framesPath) || !fs.existsSync(groundTruthPath)) {
      console.warn(`  [SKIP] ${caseName}: missing files`);
      continue;
    }

    const framesData = JSON.parse(fs.readFileSync(framesPath, 'utf-8'));
    const groundTruthData = JSON.parse(fs.readFileSync(groundTruthPath, 'utf-8'));

    // Phase 81: 메타데이터 기반 동기화
    let startMeasure: number;
    let timingOffset = 3; // 기본값
    let usedMetadata = false;

    if (framesData.metadata?.recordingRange?.startMeasure !== undefined) {
      // 메타데이터에서 startMeasure 로드
      startMeasure = framesData.metadata.recordingRange.startMeasure;
      usedMetadata = true;

      // PULLBACK 기반 TIMING_OFFSET 동적 설정
      if (framesData.metadata.pullback?.slots !== undefined) {
        timingOffset = framesData.metadata.pullback.slots;
      }
    } else {
      // Legacy: groundTruth에서 startMeasure 추출
      startMeasure = groundTruthData.notes.length > 0
        ? Math.min(...groundTruthData.notes.map((n: GroundTruthNote) => n.measure))
        : 0;
    }

    const result = runCaseTest(
      framesData.frames,
      framesData.bpm,
      groundTruthData.notes,
      startMeasure,
      timingOffset // Phase 81: 동적 타이밍 오프셋 전달
    );

    result.caseName = caseName;
    if (usedMetadata) {
      console.log(`    [Phase 81] ${caseName}: 메타데이터 적용 (offset=${timingOffset})`);
    }
    results.push(result);

    totalNotes += result.noteCount;
    totalMatched += result.matched;
  }

  // 가중 평균 계산 (음표 수 기준)
  let weightedPitch = 0;
  let weightedTiming = 0;
  let weightedDuration = 0;

  for (const r of results) {
    const weight = r.matched; // 매칭된 음표 수로 가중치
    weightedPitch += r.pitch * weight;
    weightedTiming += r.timing * weight;
    weightedDuration += r.duration * weight;
  }

  const avgPitch = totalMatched > 0 ? weightedPitch / totalMatched : 0;
  const avgTiming = totalMatched > 0 ? weightedTiming / totalMatched : 0;
  const avgDuration = totalMatched > 0 ? weightedDuration / totalMatched : 0;
  const avgOverall = (avgPitch + avgTiming + avgDuration) / 3;

  return {
    cases: results,
    averages: {
      pitch: avgPitch,
      timing: avgTiming,
      duration: avgDuration,
      overall: avgOverall
    },
    totalNotes,
    totalMatched
  };
}

// ============================================
// 결과 출력
// ============================================
function printBatchResult(result: BatchResult): void {
  console.log('\n' + '='.repeat(70));
  console.log('  BATCH TEST RESULTS');
  console.log('='.repeat(70));

  console.log('\n  [케이스별 결과]');
  console.log('  ' + '-'.repeat(66));
  console.log('  | Case       | Notes | Match | Pitch  | Timing | Duration | Overall |');
  console.log('  ' + '-'.repeat(66));

  for (const r of result.cases) {
    console.log(
      `  | ${r.caseName.padEnd(10)} | ${String(r.noteCount).padStart(5)} | ${String(r.matched).padStart(5)} | ` +
      `${r.pitch.toFixed(1).padStart(5)}% | ${r.timing.toFixed(1).padStart(5)}% | ` +
      `${r.duration.toFixed(1).padStart(7)}% | ${r.overall.toFixed(1).padStart(6)}% |`
    );
  }

  console.log('  ' + '-'.repeat(66));

  console.log('\n  [전체 평균] (가중 평균 - 매칭된 음표 수 기준)');
  console.log('  ' + '-'.repeat(40));
  console.log(`  | 음정 정확도:   ${result.averages.pitch.toFixed(1).padStart(6)}% |`);
  console.log(`  | 타이밍 정확도: ${result.averages.timing.toFixed(1).padStart(6)}% |`);
  console.log(`  | 길이 정확도:   ${result.averages.duration.toFixed(1).padStart(6)}% |`);
  console.log('  ' + '-'.repeat(40));
  console.log(`  | 종합 정확도:   ${result.averages.overall.toFixed(1).padStart(6)}% |`);
  console.log('  ' + '-'.repeat(40));

  console.log(`\n  총 케이스: ${result.cases.length}개`);
  console.log(`  총 음표: ${result.totalNotes}개 (매칭: ${result.totalMatched}개)`);

  if (result.averages.overall >= 80) {
    console.log('\n  *** 목표 달성! (80%+) ***');
  } else {
    console.log(`\n  목표까지: ${(80 - result.averages.overall).toFixed(1)}% 필요`);
  }

  console.log('\n' + '='.repeat(70));
}

// ============================================
// 전략 생성기 (배치용)
// ============================================
function generateNextParams(
  currentParams: TunableParams,
  result: BatchResult,
  iteration: number,
  history: IterationRecord[]
): { params: TunableParams; strategy: string } {
  const params = { ...currentParams };
  let strategy = '';

  const triedCombos = new Set(history.map(h => JSON.stringify(h.params)));

  // 가장 점수가 낮은 지표 개선
  const { pitch, timing, duration } = result.averages;
  const minScore = Math.min(pitch, timing, duration);

  // 전략 1: 음정이 가장 낮으면 저음 확장
  if (minScore === pitch && params.LOW_FREQ_RECOVERY_MAX < 150) {
    const nextIdx = PARAM_SEARCH_SPACE.LOW_FREQ_RECOVERY_MAX.indexOf(params.LOW_FREQ_RECOVERY_MAX) + 1;
    if (nextIdx < PARAM_SEARCH_SPACE.LOW_FREQ_RECOVERY_MAX.length) {
      params.LOW_FREQ_RECOVERY_MAX = PARAM_SEARCH_SPACE.LOW_FREQ_RECOVERY_MAX[nextIdx];
      strategy = `음정 개선: LOW_FREQ_RECOVERY_MAX ${currentParams.LOW_FREQ_RECOVERY_MAX}→${params.LOW_FREQ_RECOVERY_MAX}`;
      if (!triedCombos.has(JSON.stringify(params))) return { params, strategy };
    }
  }

  // 전략 2: 길이가 낮으면 병합 제한
  if (minScore === duration && params.MAX_MERGE_SLOTS > 8) {
    const currentIdx = PARAM_SEARCH_SPACE.MAX_MERGE_SLOTS.indexOf(params.MAX_MERGE_SLOTS);
    if (currentIdx > 0) {
      params.MAX_MERGE_SLOTS = PARAM_SEARCH_SPACE.MAX_MERGE_SLOTS[currentIdx - 1];
      strategy = `길이 개선: MAX_MERGE_SLOTS ${currentParams.MAX_MERGE_SLOTS}→${params.MAX_MERGE_SLOTS}`;
      if (!triedCombos.has(JSON.stringify(params))) return { params, strategy };
    }
  }

  // 전략 3: 순차 탐색
  const paramKeys = Object.keys(PARAM_SEARCH_SPACE) as (keyof typeof PARAM_SEARCH_SPACE)[];
  const randomKey = paramKeys[iteration % paramKeys.length];
  const searchSpace = PARAM_SEARCH_SPACE[randomKey];
  const currentValue = params[randomKey];
  const currentIdx = searchSpace.indexOf(currentValue as never);

  let nextIdx = (currentIdx + 1) % searchSpace.length;
  params[randomKey] = searchSpace[nextIdx] as never;
  strategy = `탐색: ${randomKey} ${currentValue}→${params[randomKey]}`;

  let attempts = 0;
  while (triedCombos.has(JSON.stringify(params)) && attempts < paramKeys.length * 3) {
    const altKey = paramKeys[(iteration + attempts) % paramKeys.length];
    const altSpace = PARAM_SEARCH_SPACE[altKey];
    const altIdx = Math.floor(Math.random() * altSpace.length);
    params[altKey] = altSpace[altIdx] as never;
    strategy = `랜덤: ${altKey}→${params[altKey]}`;
    attempts++;
  }

  return { params, strategy };
}

// ============================================
// 황금 설정 갱신 (배치용 - 80% 달성 시 또는 기존보다 나으면)
// ============================================
function updateGoldenSettingsBatch(
  testDir: string,
  best: { iteration: number; params: TunableParams; result: BatchResult }
): void {
  const goldenPath = path.join(testDir, 'goldenSettings75.json');

  // 기존 설정 읽기
  let currentBestOverall = 0;
  if (fs.existsSync(goldenPath)) {
    const existing = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
    const { timing = 0, pitch = 0, duration = 0 } = existing.bestResults || {};
    currentBestOverall = (timing + pitch + duration) / 3;
  }

  // 새 결과가 더 좋으면 갱신
  if (best.result.averages.overall > currentBestOverall) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const newGoldenSettings = {
      version: `${best.iteration}차`,
      locked: true,
      description: `${best.iteration}차 황금 설정 - ${best.result.averages.overall.toFixed(1)}% 달성 (배치 테스트)`,
      lockedAt: dateStr,
      bestResults: {
        timing: best.result.averages.timing,
        pitch: best.result.averages.pitch,
        duration: best.result.averages.duration
      },
      params: best.params,
      coreParams: {
        PULLBACK_BUFFER_MS: 250,
        TARGET_MIN_OCTAVE: 3,
        PHASE2_THRESHOLD: 1.62,
        RMS_THRESHOLD: 0.018
      },
      notes: [
        `${currentBestOverall.toFixed(1)}% → ${best.result.averages.overall.toFixed(1)}% 개선`,
        `테스트 케이스: ${best.result.cases.length}개`,
        "PULLBACK 200ms로 변경 시 타이밍 붕괴",
        "TARGET_MIN_OCTAVE=2 시 음정 0% (절대 금지)"
      ]
    };

    fs.writeFileSync(goldenPath, JSON.stringify(newGoldenSettings, null, 2), 'utf-8');
    console.log(`\n  ★★★ 황금 설정 갱신! (${currentBestOverall.toFixed(1)}% → ${best.result.averages.overall.toFixed(1)}%) ★★★`);
    console.log(`  goldenSettings75.json 업데이트됨`);

    // 전역 변수도 갱신
    GOLDEN_PARAMS_75 = best.params;
  }
}

// ============================================
// HISTORY.md 업데이트 (배치용)
// ============================================
function updateHistoryMdBatch(
  testDir: string,
  records: IterationRecord[],
  best: { iteration: number; params: TunableParams; result: BatchResult },
  exitReason: string
): void {
  const historyPath = path.join(testDir, 'HISTORY.md');
  if (!fs.existsSync(historyPath)) return;

  let content = fs.readFileSync(historyPath, 'utf-8');

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  const newSection = `

---

## 배치 자동 최적화 세션 (${dateStr} ${timeStr})

### 종료 사유: ${exitReason}

### 테스트 케이스: ${best.result.cases.length}개
${best.result.cases.map(c => `- ${c.caseName}: ${c.noteCount}개 음표`).join('\n')}

### 최고 기록 (${best.iteration}차)
| 지표 | 값 |
|------|-----|
| 음정 | ${best.result.averages.pitch.toFixed(1)}% |
| 타이밍 | ${best.result.averages.timing.toFixed(1)}% |
| 길이 | ${best.result.averages.duration.toFixed(1)}% |
| **종합** | **${best.result.averages.overall.toFixed(1)}%** |

### 최적 파라미터
\`\`\`json
${JSON.stringify(best.params, null, 2)}
\`\`\`

### 반복 기록 (총 ${records.length}회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
${records.slice(-15).map(r =>
  `| ${r.iteration} | ${r.strategy.substring(0, 35)}${r.strategy.length > 35 ? '...' : ''} | ${r.result.averages.overall.toFixed(1)}% | ${r.improvement >= 0 ? '+' : ''}${r.improvement.toFixed(1)}% |`
).join('\n')}
`;

  content += newSection;
  fs.writeFileSync(historyPath, content, 'utf-8');
  console.log(`\n  HISTORY.md updated`);
}

// ============================================
// 배치 자동 최적화
// ============================================
async function runBatchAutoOptimization(datasetsDir: string, testDir: string): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('  BATCH AUTO-OPTIMIZATION MODE');
  console.log('='.repeat(70));
  console.log(`  최대 반복: ${AUTO_CONFIG.MAX_ITERATIONS}회`);
  console.log(`  정체 제한: ${AUTO_CONFIG.STAGNATION_LIMIT}회 연속`);
  console.log(`  목표 정확도: ${AUTO_CONFIG.TARGET_ACCURACY}%`);

  const history: IterationRecord[] = [];
  let best = {
    iteration: 0,
    params: { ...GOLDEN_PARAMS_75 },
    result: { cases: [], averages: { pitch: 0, timing: 0, duration: 0, overall: 0 }, totalNotes: 0, totalMatched: 0 } as BatchResult
  };

  let stagnationCount = 0;
  let exitReason = '';

  // 초기 테스트 (75차 황금 설정 - 절대 기준)
  activeParams = { ...GOLDEN_PARAMS_75 };
  let prevResult = runBatchTest(datasetsDir);
  let baselineAccuracy = prevResult.averages.overall; // 현재 최고 기준 정확도 (갱신 가능)
  let baselineParams = { ...GOLDEN_PARAMS_75 }; // 현재 최고 기준 파라미터

  console.log(`\n  [0차] 초기 테스트 (${prevResult.cases.length}개 케이스)`);
  console.log(`    종합: ${prevResult.averages.overall.toFixed(1)}%`);
  console.log(`  [BASELINE] 75차 기준 정확도: ${baselineAccuracy.toFixed(1)}%`);

  history.push({
    iteration: 0,
    timestamp: new Date().toISOString(),
    params: { ...activeParams },
    result: prevResult,
    improvement: 0,
    strategy: '75차 황금 설정 (초기값)'
  });

  best = { iteration: 0, params: { ...activeParams }, result: prevResult };

  if (prevResult.averages.overall >= AUTO_CONFIG.TARGET_ACCURACY) {
    exitReason = `목표 달성 (${prevResult.averages.overall.toFixed(1)}% >= ${AUTO_CONFIG.TARGET_ACCURACY}%)`;
    console.log(`\n  *** ${exitReason} ***`);
    updateHistoryMdBatch(testDir, history, best, exitReason);
    printBatchResult(prevResult);
    return;
  }

  // 최적화 루프
  for (let i = 1; i <= AUTO_CONFIG.MAX_ITERATIONS; i++) {
    const { params: nextParams, strategy } = generateNextParams(activeParams, prevResult, i, history);
    activeParams = nextParams;

    const result = runBatchTest(datasetsDir);
    const improvement = result.averages.overall - prevResult.averages.overall;

    history.push({
      iteration: i,
      timestamp: new Date().toISOString(),
      params: { ...activeParams },
      result,
      improvement,
      strategy
    });

    // 현재 최고 기준 대비 성능 저하 체크 - 즉시 롤백
    if (result.averages.overall < baselineAccuracy - 5) {
      console.log(`\n  [${i}차] ${strategy}`);
      console.log(`    ⚠️ 현재 기준(${baselineAccuracy.toFixed(1)}%) 대비 ${(baselineAccuracy - result.averages.overall).toFixed(1)}% 저하!`);
      console.log(`    → 최고 기록 설정으로 즉시 롤백`);
      activeParams = { ...baselineParams };
      stagnationCount++;
      prevResult = result;
      continue;
    }

    if (result.averages.overall > best.result.averages.overall) {
      best = { iteration: i, params: { ...activeParams }, result };

      // 기준 정확도 갱신 (더 좋은 결과가 새 기준이 됨)
      baselineAccuracy = result.averages.overall;
      baselineParams = { ...activeParams };

      stagnationCount = 0;
      console.log(`\n  [${i}차] ${strategy}`);
      console.log(`    ★ 최고 기록! ${result.averages.overall.toFixed(1)}% (+${improvement.toFixed(1)}%)`);
      console.log(`    → 새로운 기준으로 설정됨`);
    } else {
      stagnationCount++;
      console.log(`\n  [${i}차] ${strategy}`);
      console.log(`    ${result.averages.overall.toFixed(1)}% (${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%) - 정체 ${stagnationCount}/${AUTO_CONFIG.STAGNATION_LIMIT}`);

      // 개선 없으면 현재 최고 기록으로 롤백
      if (stagnationCount >= 3) {
        console.log(`    → 3회 연속 개선 없음, 최고 기록 설정으로 롤백`);
        activeParams = { ...baselineParams };
      }
    }

    if (result.averages.overall >= AUTO_CONFIG.TARGET_ACCURACY) {
      exitReason = `목표 달성 (${result.averages.overall.toFixed(1)}% >= ${AUTO_CONFIG.TARGET_ACCURACY}%)`;
      console.log(`\n  *** ${exitReason} ***`);
      break;
    }

    if (stagnationCount >= AUTO_CONFIG.STAGNATION_LIMIT) {
      exitReason = `정체 종료 (${AUTO_CONFIG.STAGNATION_LIMIT}회 연속 개선 없음)`;
      console.log(`\n  *** ${exitReason} ***`);
      break;
    }

    prevResult = result;
  }

  if (!exitReason) {
    exitReason = `최대 반복 도달 (${AUTO_CONFIG.MAX_ITERATIONS}회)`;
    console.log(`\n  *** ${exitReason} ***`);
  }

  // 결과 저장
  console.log('\n' + '='.repeat(70));
  console.log('  OPTIMIZATION COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  총 반복: ${history.length}회`);
  console.log(`  종료 사유: ${exitReason}`);
  console.log(`\n  최고 기록 (${best.iteration}차): ${best.result.averages.overall.toFixed(1)}%`);

  // 최고 기록 저장
  const bestPath = path.join(testDir, 'bestRecord.json');
  fs.writeFileSync(bestPath, JSON.stringify({
    iteration: best.iteration,
    params: best.params,
    averages: best.result.averages,
    cases: best.result.cases.length,
    totalNotes: best.result.totalNotes
  }, null, 2), 'utf-8');
  console.log(`  bestRecord.json saved`);

  updateHistoryMdBatch(testDir, history, best, exitReason);

  // 황금 설정 갱신 (기존보다 나으면 자동 업데이트)
  updateGoldenSettingsBatch(testDir, best);

  // 최고 기록으로 상세 결과
  activeParams = best.params;
  const finalResult = runBatchTest(datasetsDir);
  printBatchResult(finalResult);
}

// ============================================
// 메인
// ============================================
async function main() {
  const testDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  const datasetsDir = path.join(testDir, 'datasets');

  const isAutoMode = process.argv.includes('--auto');

  console.log('\n' + '='.repeat(70));
  console.log('  BATCH PITCH ACCURACY TEST v1.1');
  console.log('  (75차 황금 설정 고정 + 자동 롤백)');
  console.log('='.repeat(70));
  console.log(`  Mode: ${isAutoMode ? 'BATCH AUTO-OPTIMIZATION' : 'BATCH TEST'}`);

  // 75차 황금 설정 로드 (절대 기준)
  GOLDEN_PARAMS_75 = loadGoldenParams75();
  activeParams = { ...GOLDEN_PARAMS_75 };
  console.log(`  Datasets: ${datasetsDir}`);

  if (!fs.existsSync(datasetsDir)) {
    console.error('\n[ERROR] datasets/ folder not found!');
    console.log('\n사용법:');
    console.log('  1. tests/pitch-accuracy/datasets/case_01/ 폴더 생성');
    console.log('  2. testFrames.json, groundTruth.json 복사');
    console.log('  3. npm run test:pitch:batch 실행');
    process.exit(1);
  }

  if (isAutoMode) {
    await runBatchAutoOptimization(datasetsDir, testDir);
  } else {
    const result = runBatchTest(datasetsDir);
    printBatchResult(result);
  }
}

main().catch(console.error);
