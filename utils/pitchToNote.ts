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

// ============================================
// Self-Refining: 런타임 조정 가능 파라미터 시스템
// ============================================
export interface TunableParams {
  // ========================================
  // 1. 저음 복원 파라미터
  // ========================================
  LOW_FREQ_RECOVERY_MAX: number;      // 70-150Hz (현재 120)
  LOW_SOLO_THRESHOLD: number;         // 100-150Hz (현재 150)
  LOW_FREQ_CONFIDENCE_MIN: number;    // 0.10-0.30 (현재 0.15)

  // ========================================
  // 2. 점유율 파라미터
  // ========================================
  OCCUPANCY_MIN: number;              // 0.50-0.80 (현재 0.75)
  OCCUPANCY_HIGH: number;             // 0.60-0.80 (현재 0.70) - 새로 추가
  OCCUPANCY_SUSTAIN: number;          // 0.30-0.60 (현재 0.55)

  // ========================================
  // 3. 에너지 피크 파라미터
  // ========================================
  ENERGY_PEAK_CONFIDENCE_MIN: number; // 0.50-0.90 (현재 0.80)
  ENERGY_PEAK_OCCUPANCY_MIN: number;  // 0.70-0.95 (현재 0.95)

  // ========================================
  // 4. 음표 길이 파라미터
  // ========================================
  MIN_NOTE_DURATION_SLOTS: number;    // 1-3 (현재 1)
  MAX_MERGE_SLOTS: number;            // 6-16 (현재 8)

  // ========================================
  // 5. 그리드 분석 파라미터 (새로 추가)
  // ========================================
  PITCH_CONFIDENCE_MIN: number;       // 0.20-0.50 (현재 0.35) - 프레임 레벨 신뢰도
  GRID_SNAP_TOLERANCE: number;        // 0.10-0.25 (현재 0.15) - 박자 스냅 허용
  TIMING_OFFSET_SLOTS: number;        // 1-5 (현재 3) - 타이밍 보정 오프셋

  // ========================================
  // 6. 음역대별 차별화 파라미터 (새로 추가)
  // ========================================
  MID_FREQ_MIN: number;               // 150-250Hz (현재 200) - 중음역대 시작
  HIGH_FREQ_MIN: number;              // 400-600Hz (현재 500) - 고음역대 시작
  LOW_FREQ_OCCUPANCY_BONUS: number;   // 0.0-0.15 (현재 0.10) - 저음 점유율 보너스

  // ========================================
  // 7. Onset Detection 파라미터 (Phase 77)
  // ========================================
  ONSET_ENERGY_RATIO: number;         // 1.5-3.0 (현재 2.0) - 에너지 급증 비율 임계값
  ONSET_CONFIDENCE_JUMP: number;      // 0.2-0.5 (현재 0.3) - confidence 급증 임계값
  ONSET_DETECTION_ENABLED: boolean;   // true/false - 온셋 검출 활성화

  // ========================================
  // 8. Pitch Stability Filter (Phase 80)
  // ========================================
  PITCH_STABILITY_THRESHOLD: number;  // 0.15-0.30 (현재 0.20) - 변동계수 허용 임계값
  PITCH_STABILITY_ENABLED: boolean;   // true/false - 음정 안정성 필터 활성화
}

// 기본값 (goldenSettings75.json 3차와 동기화 - 82.7% 달성, Phase 97)
const DEFAULT_PARAMS: TunableParams = {
  // 1. 저음 복원 (2옥타브 지원 강화)
  LOW_FREQ_RECOVERY_MAX: 180,      // 저음 복구 상한 (F#3까지)
  LOW_SOLO_THRESHOLD: 200,         // G3=196Hz까지 보호
  LOW_FREQ_CONFIDENCE_MIN: 0.12,   // 저음 confidence 임계값

  // 2. 점유율 (goldenSettings75 3차와 동기화)
  OCCUPANCY_MIN: 0.18,             // 최소 점유율
  OCCUPANCY_HIGH: 0.38,            // high 판정 기준
  OCCUPANCY_SUSTAIN: 0.25,         // sustain 기준

  // 3. 에너지 피크
  ENERGY_PEAK_CONFIDENCE_MIN: 0.75, // 에너지 피크 confidence
  ENERGY_PEAK_OCCUPANCY_MIN: 0.90,  // 에너지 피크 occupancy

  // 4. 음표 길이
  MIN_NOTE_DURATION_SLOTS: 1,      // 1슬롯 음표 허용
  MAX_MERGE_SLOTS: 6,              // 병합 허용 범위 (Phase 97)

  // 5. 그리드 분석
  PITCH_CONFIDENCE_MIN: 0.15,      // 프레임 confidence 임계값
  GRID_SNAP_TOLERANCE: 0.15,       // 박자 스냅 허용
  TIMING_OFFSET_SLOTS: 3,          // 타이밍 보정 오프셋

  // 6. 음역대별 차별화
  MID_FREQ_MIN: 250,               // 중음역대 시작 (B3까지 저음 보너스)
  HIGH_FREQ_MIN: 500,              // 고음역대 시작 (B4)
  LOW_FREQ_OCCUPANCY_BONUS: 0.15,  // 저음 점유율 보너스

  // 7. Onset Detection (Phase 97) - 활성화 (1.05/0.03 임계값)
  ONSET_ENERGY_RATIO: 1.05,        // 에너지 급증 비율 임계값
  ONSET_CONFIDENCE_JUMP: 0.03,     // confidence 급증 임계값
  ONSET_DETECTION_ENABLED: true,   // 활성화

  // 8. Pitch Stability Filter (Phase 80) - 비활성화: 효과 없음
  PITCH_STABILITY_THRESHOLD: 0.20, // 주파수 표준편차 / 평균 (변동계수) 허용 임계값
  PITCH_STABILITY_ENABLED: false   // 비활성화 (변화 없음)
};

// 현재 활성 파라미터 (런타임 조정 가능)
let activeParams: TunableParams = { ...DEFAULT_PARAMS };

// 파라미터 조정 API
export function setTunableParams(params: Partial<TunableParams>): void {
  activeParams = { ...activeParams, ...params };
  console.log('[Self-Refining] 파라미터 업데이트:', activeParams);
}

export function getTunableParams(): TunableParams {
  return { ...activeParams };
}

export function resetTunableParams(): void {
  activeParams = { ...DEFAULT_PARAMS };
  console.log('[Self-Refining] 파라미터 초기화 (75차 기본값)');
}

// 그리드 분석 파라미터 (고정)
const SLOTS_PER_MEASURE = 16;           // 1마디 = 16슬롯
const RMS_THRESHOLD = 0.018;            // Phase 40: 0.02 → 0.018 (Missed 음표 구출, Gemini 제안)
const DEFAULT_PITCH = 'C4';             // 음정 감지 실패 시 기본값
// Phase 77: OCCUPANCY_HIGH, PITCH_CONFIDENCE_MIN, GRID_SNAP_TOLERANCE, TIMING_OFFSET_SLOTS
//           는 activeParams로 이동 (런타임 튜닝 가능)

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

export function pitchToMidi(pitch: string): number {
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
 * Phase 79: Confidence Weighted Median
 * 높은 confidence 프레임에 가중치를 부여한 중앙값 계산
 * - 각 주파수를 confidence 기준으로 정렬 후 가중 중앙값 사용
 */
function confidenceWeightedMedian(freqs: number[], confidences: number[]): number {
  if (freqs.length === 0) return 0;
  if (freqs.length === 1) return freqs[0];

  // (freq, confidence) 쌍 생성 후 주파수로 정렬
  const pairs = freqs.map((f, i) => ({ freq: f, conf: confidences[i] || 0.5 }));
  pairs.sort((a, b) => a.freq - b.freq);

  // 가중 중앙값: confidence 합의 50%에 도달하는 지점의 주파수
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
 * Phase 93: 저음역대 배음 필터 강화
 * Phase 94: 서브하모닉 보정 (100Hz 미만 → 옥타브 올림)
 */
function correctOctaveError(frequency: number, contextFreqs: number[]): number {
  if (frequency <= 0 || contextFreqs.length === 0) return frequency;

  const avgContextFreq = contextFreqs.reduce((sum, f) => sum + f, 0) / contextFreqs.length;

  // Phase 94: 서브하모닉 보정 (Phase 96에서 조건 완화)
  // 100Hz 미만의 매우 낮은 주파수는 서브하모닉일 가능성이 높음
  // 단, context 평균이 저음(150Hz 이하)이면 2옥타브 의도적 연주로 간주
  // Phase 96: avgContextFreq < 150Hz 조건 추가 (2옥타브 지원)
  if (frequency < 100 && frequency > 65 && avgContextFreq >= 150) {
    return frequency * 2;
  }

  // Phase 93: 저음역대 배음 필터 강화
  // context 평균이 저음역대(200Hz 미만)인데 감지 주파수가 높으면 배음일 가능성
  if (avgContextFreq < 200 && frequency > 250) {
    // 감지 주파수가 context의 1.5배 이상이면 옥타브 내림
    if (frequency > avgContextFreq * 1.5) {
      return frequency / 2;
    }
  }

  // Phase 96: 2옥타브 배음 보정
  // 160-200Hz 영역은 E2(82Hz), F#2(93Hz), G2(98Hz)의 2배 배음일 수 있음
  // 직전/직후 context에 70-80Hz(D2 영역) 프레임이 있으면 배음으로 간주
  const hasLowContext = contextFreqs.some(f => f >= 70 && f <= 85);
  if (hasLowContext && frequency >= 160 && frequency <= 200) {
    // 2배 배음을 원래 주파수로 복원
    return frequency / 2;
  }

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
  isOnset: boolean;        // Phase 77: 에너지 급증에 의한 온셋 감지 여부
  avgConfidence: number;   // Phase 77: 슬롯 내 평균 confidence
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
    f => f.confidence >= activeParams.PITCH_CONFIDENCE_MIN && f.frequency > 0
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
      soundStartOffset: 0,
      isOnset: false,           // Phase 77: 초기값
      avgConfidence: 0          // Phase 77: 초기값
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

    // Phase 77: 평균 confidence 계산 (유효 프레임만)
    const validFramesForConf = slotFrames.filter(f => f.frequency > 0);
    if (validFramesForConf.length > 0) {
      slot.avgConfidence = validFramesForConf.reduce((sum, f) => sum + f.confidence, 0) / validFramesForConf.length;
    }

    // Phase 78: Dynamic Threshold - 저음역대 점유율 보너스 적용
    // 저음(< MID_FREQ_MIN)은 자연적으로 confidence가 낮으므로 보너스 적용
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

    // 점유율에 따른 confidence 판정 (activeParams 사용)
    if (effectiveOccupancy >= activeParams.OCCUPANCY_HIGH) {
      slot.confidence = 'high';
      highCount++;
    } else if (effectiveOccupancy >= activeParams.OCCUPANCY_MIN) {
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
    if (validFreqs.length > 0) {

      // Phase 80: Pitch Stability Filter - 슬롯 내 음정 변동이 심하면 confidence 하향
      if (activeParams.PITCH_STABILITY_ENABLED && validFreqs.length >= 3) {
        const avgFreq = validFreqs.reduce((sum, f) => sum + f, 0) / validFreqs.length;
        const variance = validFreqs.reduce((sum, f) => sum + Math.pow(f - avgFreq, 2), 0) / validFreqs.length;
        const stdDev = Math.sqrt(variance);
        const coeffOfVariation = stdDev / avgFreq; // 변동계수 (CV)

        // 변동계수가 임계값을 초과하면 confidence를 medium으로 하향
        if (coeffOfVariation > activeParams.PITCH_STABILITY_THRESHOLD && slot.confidence === 'high') {
          slot.confidence = 'medium';
          highCount--;
          mediumCount++;
        }
      }

      // Phase 2: 옥타브 자동 보정 (주변 문맥 기반)
      const contextFreqs = allValidFreqs; // Phase 96: 전체 context 사용 (2옥타브 배음 보정)
      const correctedFreq = correctOctaveError(slot.medianFrequency, contextFreqs);

      // Phase 44: Pitch Snap 적용 (±50 cents 범위 내 반음 스냅)
      const snappedFreq = pitchSnap(correctedFreq);

      // Low Solo 보호: 초저음 솔로 멜로디는 원음 보존
      // Phase 75: activeParams 사용 (130Hz 기본값)
      let finalShift = octaveShift;

      if (slot.medianFrequency < activeParams.LOW_SOLO_THRESHOLD) {
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
      if (offsetRatio > activeParams.GRID_SNAP_TOLERANCE && slot.confidence === 'high') {
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
  // Phase 72: 저음 재검증 패스 (Low Frequency Recovery)
  // ========================================
  // 70-150Hz 대역에서 confidence 미달로 탈락한 슬롯을 재검증
  // 연속된 저음 프레임이 일정 pitch를 유지하면 음표로 복원
  const LOW_FREQ_RECOVERY_MIN = 70;   // D2 ~= 73Hz
  // activeParams.LOW_FREQ_RECOVERY_MAX 사용 (기본값 120Hz)
  const LOW_FREQ_CONTINUITY_MIN = 3;  // 최소 연속 프레임 수
  const LOW_FREQ_VARIANCE_MAX = 0.15; // 주파수 편차 허용 범위 (±15%)

  let recoveredCount = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];

    // 이미 유효한 슬롯은 스킵
    if (slot.confidence !== 'excluded') continue;

    // 해당 슬롯의 저음역대 프레임 수집 (낮은 confidence 허용, activeParams 사용)
    const lowFreqFrames = slot.frames.filter(
      f => f.frequency >= LOW_FREQ_RECOVERY_MIN &&
           f.frequency <= activeParams.LOW_FREQ_RECOVERY_MAX &&
           f.confidence >= activeParams.LOW_FREQ_CONFIDENCE_MIN
    );

    // 최소 연속 프레임 수 충족 확인
    if (lowFreqFrames.length < LOW_FREQ_CONTINUITY_MIN) continue;

    // 주파수 일관성 검사 (median 기준 ±15% 이내)
    const freqs = lowFreqFrames.map(f => f.frequency);
    const medianFreq = median(freqs);
    const allWithinVariance = freqs.every(
      f => Math.abs(f - medianFreq) / medianFreq <= LOW_FREQ_VARIANCE_MAX
    );

    if (!allWithinVariance) continue;

    // 저음 복원: 슬롯을 유효한 음표로 승격
    slot.confidence = 'medium';
    slot.medianFrequency = medianFreq;
    slot.occupancy = lowFreqFrames.length / slot.frames.length;

    // 저음은 옥타브 시프트 없이 원음 유지
    const snappedFreq = pitchSnap(medianFreq);
    slot.pitch = frequencyToNote(snappedFreq, 0); // finalShift = 0

    recoveredCount++;
    emptyCount--;
    mediumCount++;
  }

  if (recoveredCount > 0) {
    console.log(`[Phase 72] 저음 복원: ${recoveredCount}개 슬롯 복구 (70-120Hz 대역)`);
    console.log('[Grid] 슬롯 분포 (복원 후):', { high: highCount, medium: mediumCount, empty: emptyCount });
  }

  // ========================================
  // Phase 92: 인접 슬롯 연속성 복구 (Hysteresis Occupancy)
  // ========================================
  // 앞 또는 뒤 슬롯이 유효한데 현재가 excluded이면, 낮은 임계값으로 재검증
  // 음표 누락을 방지하고 연속된 멜로디를 살림
  // 여러 번 반복하여 점진적으로 복구 (파급 효과)
  const HYSTERESIS_OCCUPANCY_MIN = 0.08; // 인접 슬롯이 있을 때 완화된 임계값
  let hysteresisRecoveredTotal = 0;
  const MAX_HYSTERESIS_PASSES = 5; // 최대 5회 반복

  for (let pass = 0; pass < MAX_HYSTERESIS_PASSES; pass++) {
    let passRecovered = 0;

    for (let i = 0; i < slots.length; i++) {
      const currSlot = slots[i];

      // 이미 유효한 슬롯은 스킵
      if (currSlot.confidence !== 'excluded') continue;

      // 앞 또는 뒤 슬롯이 유효한지 확인
      const prevSlot = i > 0 ? slots[i - 1] : null;
      const nextSlot = i < slots.length - 1 ? slots[i + 1] : null;
      const hasPrev = prevSlot && prevSlot.confidence !== 'excluded';
      const hasNext = nextSlot && nextSlot.confidence !== 'excluded';

      // 앞 또는 뒤에 유효한 슬롯이 있어야 함
      if (!hasPrev && !hasNext) continue;

      // 완화된 임계값으로 재검증 (occupancy가 낮아도 프레임이 있으면 검토)
      const validFrames = currSlot.frames.filter(
        f => f.confidence >= 0.10 && // 매우 낮은 임계값
             f.frequency >= 65 && f.frequency <= 1047
      );

      if (validFrames.length >= 1) {
        const freqs = validFrames.map(f => f.frequency);
        const confs = validFrames.map(f => f.confidence);
        const medianFreq = confidenceWeightedMedian(freqs, confs);

        // 인접 슬롯 음정과 비슷한지 확인 (±4반음 이내)
        let isReasonable = false;
        const currMidi = 12 * Math.log2(medianFreq / A4_FREQ) + A4_MIDI;

        if (hasPrev && prevSlot.pitch) {
          const prevMidi = pitchToMidi(prevSlot.pitch);
          if (Math.abs(Math.round(currMidi) - prevMidi) <= 4) isReasonable = true;
        }
        if (hasNext && nextSlot.pitch) {
          const nextMidi = pitchToMidi(nextSlot.pitch);
          if (Math.abs(Math.round(currMidi) - nextMidi) <= 4) isReasonable = true;
        }

        // 또는 occupancy가 최소 임계값 이상이면 무조건 복구
        if (currSlot.occupancy >= HYSTERESIS_OCCUPANCY_MIN) {
          isReasonable = true;
        }

        if (isReasonable && validFrames.length >= 1) {
          currSlot.confidence = 'medium';
          currSlot.medianFrequency = medianFreq;
          const snappedFreq = pitchSnap(medianFreq);
          currSlot.pitch = frequencyToNote(snappedFreq, octaveShift);

          passRecovered++;
          emptyCount--;
          mediumCount++;
        }
      }
    }

    hysteresisRecoveredTotal += passRecovered;
    if (passRecovered === 0) break; // 더 이상 복구할 게 없으면 종료
  }

  if (hysteresisRecoveredTotal > 0) {
    console.log(`[Phase 92] 인접 연속성 복구: ${hysteresisRecoveredTotal}개 슬롯 복구`);
    console.log('[Grid] 슬롯 분포 (연속성 복구 후):', { high: highCount, medium: mediumCount, empty: emptyCount });
  }

  // ========================================
  // Phase 95: Gap Filling (빈 슬롯 채우기)
  // ========================================
  // 앞뒤 유효 슬롯 사이에 excluded 슬롯이 있으면 강제로 음표로 간주
  // 긴 음표 중간에 끊긴 부분을 살려서 회수율 향상
  const MAX_GAP_SIZE = 3; // Phase 97: 3슬롯 (균형점 - 4슬롯 이상 gap은 유지)
  let gapFilledCount = 0;

  // 유효한 슬롯들의 인덱스 수집
  const validIndices: number[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].confidence !== 'excluded') {
      validIndices.push(i);
    }
  }

  // 연속된 유효 슬롯 사이의 gap 채우기
  for (let v = 0; v < validIndices.length - 1; v++) {
    const startIdx = validIndices[v];
    const endIdx = validIndices[v + 1];
    const gapSize = endIdx - startIdx - 1;

    // gap이 있고, 크기가 허용 범위 내인 경우
    if (gapSize > 0 && gapSize <= MAX_GAP_SIZE) {
      const startSlot = slots[startIdx];
      const endSlot = slots[endIdx];

      // 앞뒤 슬롯의 음정이 비슷한지 확인 (±7반음 이내 = 완전5도)
      if (startSlot.pitch && endSlot.pitch) {
        const startMidi = pitchToMidi(startSlot.pitch);
        const endMidi = pitchToMidi(endSlot.pitch);
        const pitchDiff = Math.abs(startMidi - endMidi);

        // 같은 음이거나 가까운 음이면 gap 채우기
        if (pitchDiff <= 7) {
          for (let g = startIdx + 1; g < endIdx; g++) {
            const gapSlot = slots[g];

            // 이미 유효한 슬롯은 스킵
            if (gapSlot.confidence !== 'excluded') continue;

            // gap 슬롯을 무조건 채우기 (프레임 체크 제거)
            // 앞 슬롯의 음정을 상속
            gapSlot.confidence = 'medium';
            gapSlot.pitch = startSlot.pitch;
            gapSlot.medianFrequency = startSlot.medianFrequency;

            gapFilledCount++;
            emptyCount--;
            mediumCount++;
          }
        }
      }
    }
  }

  if (gapFilledCount > 0) {
    console.log(`[Phase 95] Gap Filling: ${gapFilledCount}개 슬롯 복구`);
    console.log('[Grid] 슬롯 분포 (Gap Filling 후):', { high: highCount, medium: mediumCount, empty: emptyCount });
  }

  // ========================================
  // Phase 77: Onset Detection (에너지 급증 감지)
  // ========================================
  // 연속된 슬롯 사이에서 에너지/confidence가 급증하면 새 음표 시작점으로 표시
  // 이 정보는 Step 3에서 같은 피치여도 강제로 분리하는 데 사용
  if (activeParams.ONSET_DETECTION_ENABLED) {
    let onsetCount = 0;

    for (let i = 1; i < slots.length; i++) {
      const prevSlot = slots[i - 1];
      const currSlot = slots[i];

      // 현재 슬롯이 유효한 음표인 경우에만 검사
      if (currSlot.confidence === 'excluded') continue;

      // 이전 슬롯과 현재 슬롯 모두 유효해야 의미있는 비교
      if (prevSlot.confidence !== 'excluded' && prevSlot.avgConfidence > 0) {
        // Confidence 급증 체크
        const confRatio = currSlot.avgConfidence / prevSlot.avgConfidence;
        if (confRatio >= activeParams.ONSET_ENERGY_RATIO) {
          currSlot.isOnset = true;
          onsetCount++;
          continue;
        }

        // Confidence 점프 체크 (절대값)
        const confJump = currSlot.avgConfidence - prevSlot.avgConfidence;
        if (confJump >= activeParams.ONSET_CONFIDENCE_JUMP) {
          currSlot.isOnset = true;
          onsetCount++;
          continue;
        }
      }

      // 이전 슬롯이 excluded이고 현재가 유효하면 = 새 음표 시작
      // (currSlot.confidence !== 'excluded'는 661줄에서 이미 검증됨)
      if (prevSlot.confidence === 'excluded') {
        currSlot.isOnset = true;
        onsetCount++;
      }
    }

    // 첫 번째 유효한 슬롯은 항상 onset
    for (const slot of slots) {
      if (slot.confidence !== 'excluded') {
        slot.isOnset = true;
        onsetCount++;
        break;
      }
    }

    if (onsetCount > 0) {
      console.log(`[Phase 77] Onset Detection: ${onsetCount}개 onset 감지`);
    }
  }

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

  // ========================================
  // Phase 73: 에너지 피크 검출용 (activeParams 사용)
  // Phase 75: 임계값 상향 (1슬롯 과잉 검출 방지)
  // ========================================

  // 에너지 피크 판정 헬퍼 함수 (activeParams 사용)
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
      // Phase 75: Sustain Bridge - 진행 중인 음표는 낮은 occupancy에서도 연장 가능 (activeParams)
      if (currentNote && slot.occupancy >= activeParams.OCCUPANCY_SUSTAIN && slot.medianFrequency > 0) {
        // 현재 음표의 피치와 비교
        const currentMedianFreq = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
        if (currentMedianFreq > 0) {
          const freqRatio = slot.medianFrequency / currentMedianFreq;
          // Phase 84: 주파수 비율 ±10% (엄격 기준)
          if (freqRatio >= 0.9 && freqRatio <= 1.1) {
            currentNote.slotCount++;
            currentNote.frequencies.push(slot.medianFrequency);
            console.log(`[Phase 75] Sustain Bridge: ${slot.measureIndex}:${slot.slotIndex} (occupancy=${(slot.occupancy * 100).toFixed(0)}%)`);
            continue;
          }
        }
      }

      // 현재 음표 종료
      if (currentNote) {
        // Phase 73: 에너지 피크 예외 적용한 최소 길이 필터링 (activeParams)
        const allowShortNote = currentNote.slotCount < activeParams.MIN_NOTE_DURATION_SLOTS &&
                               isEnergyPeak(currentNote.startSlot);

        if (currentNote.slotCount < activeParams.MIN_NOTE_DURATION_SLOTS && !allowShortNote) {
          currentNote = null;
          continue;
        }

        if (allowShortNote) {
          console.log(`[Phase 73] 에너지 피크 검출: 1슬롯 음표 허용`);
        }

        // Phase 63 복구: median 사용 (66차 Mode 필터 비활성화)
        const medianFreq = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
        const contextFreqs = allValidFreqs; // Phase 96: 전체 context 사용 (2옥타브 배음 보정)
        const correctedFreq = medianFreq > 0 ? correctOctaveError(medianFreq, contextFreqs) : 0;

        // Phase 44: Pitch Snap 적용
        const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

        // Low Solo 보호 (Phase 75: activeParams 사용)
        let finalShift = octaveShift;
        if (medianFreq > 0 && medianFreq < activeParams.LOW_SOLO_THRESHOLD) {
          finalShift = 0;
        }

        const finalPitch = snappedFreq > 0
          ? frequencyToNote(snappedFreq, finalShift)
          : lastValidPitch;

        // Phase 1: 타이밍 오프셋 적용 (activeParams 사용)
        let adjustedSlotIndex = currentNote.startSlot.slotIndex + activeParams.TIMING_OFFSET_SLOTS;
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
      const contextFreqs = allValidFreqs; // Phase 96: 전체 context 사용 (2옥타브 배음 보정)
      const currentCorrectedFreq = currentMedianFreq > 0 ? correctOctaveError(currentMedianFreq, contextFreqs) : 0;

      // Low Solo 보호 (Phase 75: activeParams 사용)
      let currentFinalShift = octaveShift;
      if (currentMedianFreq > 0 && currentMedianFreq < activeParams.LOW_SOLO_THRESHOLD) {
        currentFinalShift = 0;
      }

      const currentPitch = currentCorrectedFreq > 0
        ? frequencyToNote(currentCorrectedFreq, currentFinalShift)
        : lastValidPitch;

      // Phase 77: onset 플래그가 있으면 같은 음정이어도 새 음표로 분리
      const shouldSplit = slot.isOnset && activeParams.ONSET_DETECTION_ENABLED;

      if (isSimilarPitch(currentPitch, slot.pitch) && !shouldSplit) {
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
        const contextFreqs = allValidFreqs; // Phase 96: 전체 context 사용 (2옥타브 배음 보정)
        const correctedFreq = medianFreq2 > 0 ? correctOctaveError(medianFreq2, contextFreqs) : 0;

        // Phase 44: Pitch Snap 적용
        const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

        // Low Solo 보호 (Phase 75: activeParams 사용)
        let finalShift = octaveShift;
        if (medianFreq2 > 0 && medianFreq2 < activeParams.LOW_SOLO_THRESHOLD) {
          finalShift = 0;
        }

        const finalPitch = snappedFreq > 0
          ? frequencyToNote(snappedFreq, finalShift)
          : lastValidPitch;

        // Phase 73: 에너지 피크 예외 적용한 최소 길이 필터링 (activeParams)
        const allowShortNote2 = currentNote.slotCount < activeParams.MIN_NOTE_DURATION_SLOTS &&
                                isEnergyPeak(currentNote.startSlot);

        if (currentNote.slotCount >= activeParams.MIN_NOTE_DURATION_SLOTS || allowShortNote2) {
          if (allowShortNote2) {
            console.log(`[Phase 73] 에너지 피크 검출: 1슬롯 음표 허용`);
          }

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
    // Phase 63 복구: median 사용 (66차 Mode 필터 비활성화)
    const medianFreqLast = currentNote.frequencies.length > 0 ? median(currentNote.frequencies) : 0;
    const contextFreqs = allValidFreqs; // Phase 96: 전체 context 사용 (2옥타브 배음 보정)
    const correctedFreq = medianFreqLast > 0 ? correctOctaveError(medianFreqLast, contextFreqs) : 0;

    // Phase 44: Pitch Snap 적용
    const snappedFreq = correctedFreq > 0 ? pitchSnap(correctedFreq) : 0;

    // Low Solo 보호 (Phase 75: activeParams 사용)
    let finalShift = octaveShift;
    if (medianFreqLast > 0 && medianFreqLast < activeParams.LOW_SOLO_THRESHOLD) {
      finalShift = 0;
    }

    const finalPitch = snappedFreq > 0
      ? frequencyToNote(snappedFreq, finalShift)
      : lastValidPitch;

    // Phase 73: 에너지 피크 예외 적용한 최소 길이 필터링 (activeParams)
    const allowShortNoteLast = currentNote.slotCount < activeParams.MIN_NOTE_DURATION_SLOTS &&
                               isEnergyPeak(currentNote.startSlot);

    if (currentNote.slotCount >= activeParams.MIN_NOTE_DURATION_SLOTS || allowShortNoteLast) {
      if (allowShortNoteLast) {
        console.log(`[Phase 73] 에너지 피크 검출: 1슬롯 음표 허용`);
      }

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

  // ========================================
  // Phase 71: 첫 음 강제 정렬 완전 비활성화
  // ========================================
  // 연주자의 의도적 공백(쉼표)을 존중
  // 하드웨어 지연은 Pull-back으로만 보정
  if (rawNotes.length > 0) {
    const firstNote = rawNotes[0];
    const firstNoteGlobalSlot = firstNote.measureIndex * SLOTS_PER_MEASURE + firstNote.slotIndex;
    console.log(`[Phase 71] 첫 음 위치 존중: ${firstNoteGlobalSlot}슬롯 (강제 정렬 비활성화)`);
  }

  // ========================================
  // Phase 74-A: Cross-Measure Merge (마디 경계 연결음 병합)
  // ========================================
  // 마디를 넘어가는 Tie 음표들이 끊어지는 문제 해결
  // 같은 피치의 음표가 마디 경계에서 연속되면 병합
  let crossMeasureMergeCount = 0;
  for (let i = rawNotes.length - 1; i > 0; i--) {
    const currNote = rawNotes[i];
    const prevNote = rawNotes[i - 1];

    if (prevNote.isRest || currNote.isRest) continue;

    // 같은 피치인지 확인
    if (prevNote.pitch !== currNote.pitch) continue;

    // 이전 음의 끝 슬롯과 현재 음의 시작 슬롯 계산
    const prevEndSlot = prevNote.measureIndex * SLOTS_PER_MEASURE + prevNote.slotIndex + prevNote.slotCount;
    const currStartSlot = currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex;

    // Phase 75: gap=0인 경우만 병합 (과잉 병합 방지)
    // 74차에서 gap<=1 허용 시 15슬롯 괴물 음표 발생
    const gap = currStartSlot - prevEndSlot;
    if (gap === 0) {
      // 이전 음표에 현재 음표 길이 흡수
      const newSlotCount = prevNote.slotCount + gap + currNote.slotCount;

      // MAX_MERGE_SLOTS 제한 체크 (과잉 병합 방지, activeParams)
      if (newSlotCount > activeParams.MAX_MERGE_SLOTS) {
        console.log(`[Phase 74-A] Cross-Measure Merge 스킵: ${newSlotCount}슬롯 > ${activeParams.MAX_MERGE_SLOTS}슬롯 제한`);
        continue;
      }

      // confidence는 'high' | 'medium' 문자열 - 둘 중 높은 것 선택
      const mergedConfidence = (prevNote.confidence === 'high' || currNote.confidence === 'high') ? 'high' : 'medium';
      rawNotes[i - 1] = {
        ...prevNote,
        slotCount: newSlotCount,
        duration: slotCountToDuration(newSlotCount),
        confidence: mergedConfidence
      };
      rawNotes.splice(i, 1); // 현재 음표 제거
      crossMeasureMergeCount++;
      console.log(`[Phase 74-A] Cross-Measure Merge: ${prevNote.pitch} (${prevNote.slotCount}→${newSlotCount}슬롯, gap=${gap})`);
    }
  }
  console.log(`[Phase 74-A] Cross-Measure Merge 완료: ${crossMeasureMergeCount}개 병합`);

  // ========================================
  // Phase 74-B: Legato Smoothing (미세 쉼표 메우기)
  // ========================================
  // 같은 피치 음표 사이의 1슬롯 미세 쉼표를 메워서 레가토 표현 개선
  // Cross-Measure Merge 이후에도 남은 미세 끊김 처리
  let legatoSmoothCount = 0;
  for (let i = rawNotes.length - 1; i > 0; i--) {
    const currNote = rawNotes[i];
    const prevNote = rawNotes[i - 1];

    if (prevNote.isRest || currNote.isRest) continue;
    if (prevNote.pitch !== currNote.pitch) continue;

    const prevEndSlot = prevNote.measureIndex * SLOTS_PER_MEASURE + prevNote.slotIndex + prevNote.slotCount;
    const currStartSlot = currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex;
    const gap = currStartSlot - prevEndSlot;

    // 1슬롯 갭이면 앞 음표를 늘려서 채움
    if (gap === 1) {
      rawNotes[i - 1] = {
        ...prevNote,
        slotCount: prevNote.slotCount + 1,
        duration: slotCountToDuration(prevNote.slotCount + 1)
      };
      legatoSmoothCount++;
      console.log(`[Phase 74-B] Legato Smoothing: ${prevNote.pitch} (${prevNote.slotCount}→${prevNote.slotCount + 1}슬롯)`);
    }
  }
  console.log(`[Phase 74-B] Legato Smoothing 완료: ${legatoSmoothCount}개 보정`);

  // ========================================
  // Phase 74-C: Duration Normalization (짧은 음표 정규화)
  // ========================================
  // 1슬롯 미만으로 검출된 음표들을 최소 1슬롯으로 정규화
  // Low Frequency Recovery로 복구된 저음 등의 짧은 검출 보정
  let durationNormCount = 0;
  for (let i = 0; i < rawNotes.length; i++) {
    const note = rawNotes[i];
    if (note.isRest) continue;

    // slotCount가 1 미만이면 1로 정규화
    if (note.slotCount < 1) {
      rawNotes[i] = {
        ...note,
        slotCount: 1,
        duration: slotCountToDuration(1)
      };
      durationNormCount++;
      console.log(`[Phase 74-C] Duration Normalization: ${note.pitch} (${note.slotCount}→1슬롯)`);
    }
  }
  console.log(`[Phase 74-C] Duration Normalization 완료: ${durationNormCount}개 정규화`);

  // ========================================
  // Phase 87: Intra-Note Split Detection
  // ========================================
  // 긴 음표 내부에서 에너지 dip을 감지하여 분리 (반복 음표 패턴 처리)
  const ENERGY_DIP_THRESHOLD = 0.4;
  const MIN_SPLIT_LENGTH = 4;

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
        break;
      }
    }

    // 유효한 dip이 있으면 분할
    if (dipStart > 0 && dipEnd < noteSlots.length - 1) {
      const firstSlotCount = dipStart;
      const secondSlotCount = note.slotCount - dipEnd - 1;

      if (firstSlotCount >= 1 && secondSlotCount >= 1) {
        splitNotes.push({
          ...note,
          slotCount: firstSlotCount,
          duration: slotCountToDuration(firstSlotCount)
        });

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

  // ========================================
  // Phase 86: Duration Quantization
  // ========================================
  // 감지된 slotCount를 가장 가까운 표준 음표 길이로 조정
  // ±1 슬롯 오류를 줄여 duration 정확도 개선
  const STANDARD_DURATIONS = [1, 2, 3, 4, 6, 8, 12, 16];
  let quantizeCount = 0;
  for (let i = 0; i < splitNotes.length; i++) {
    const note = splitNotes[i];
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
    if (minDiff === 1 && bestDuration !== note.slotCount) {
      splitNotes[i] = {
        ...note,
        slotCount: bestDuration,
        duration: slotCountToDuration(bestDuration)
      };
      quantizeCount++;
    }
  }
  if (quantizeCount > 0) {
    console.log(`[Phase 86] Duration Quantization: ${quantizeCount}개 음표 조정`);
  }

  // ========================================
  // Phase 76: Two-Pass Gap Recovery - 비활성화
  // ========================================
  // 복구된 음표의 품질이 낮아 정확도를 저하시킴 (61.7% → 56.4%)
  // 향후 프레임 품질 개선 후 재활성화 검토
  /*

  for (let i = 0; i < rawNotes.length - 1; i++) {
    const currNote = rawNotes[i];
    const nextNote = rawNotes[i + 1];

    if (currNote.isRest || nextNote.isRest) continue;

    // 현재 음표 끝 슬롯과 다음 음표 시작 슬롯 계산 (rawNotes는 TIMING_OFFSET_SLOTS 이동됨)
    const currEndSlot = currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex + currNote.slotCount;
    const nextStartSlot = nextNote.measureIndex * SLOTS_PER_MEASURE + nextNote.slotIndex;
    const gapSize = nextStartSlot - currEndSlot;

    // gap이 충분히 크면 복구 시도
    if (gapSize >= GAP_RECOVERY_MIN_SLOTS) {
      // 원본 slots 위치로 역산 (TIMING_OFFSET_SLOTS 빼기)
      const origCurrEndSlot = currEndSlot - TIMING_OFFSET_SLOTS;
      const origNextStartSlot = nextStartSlot - TIMING_OFFSET_SLOTS;

      console.log(`[Phase 76] Gap 발견: size=${gapSize}, origRange=[${origCurrEndSlot}-${origNextStartSlot}]`);

      // gap 구간의 슬롯들 재분석 (원본 slots 배열 기준)
      const gapSlots = slots.filter(s => {
        const slotPos = s.measureIndex * SLOTS_PER_MEASURE + s.slotIndex;
        return slotPos >= origCurrEndSlot && slotPos < origNextStartSlot;
      });

      console.log(`[Phase 76] gapSlots: ${gapSlots.length}개`);

      // 완화된 기준으로 유효 슬롯 찾기
      const validGapSlots = gapSlots.filter(s => {
        if (s.frames.length === 0) return false;

        // 완화된 기준: occupancy 또는 유효 프레임 비율
        const soundFrames = s.frames.filter(f => f.frequency > 0 || f.confidence > 0);
        const relaxedOccupancy = soundFrames.length / s.frames.length;
        if (relaxedOccupancy < GAP_RECOVERY_OCCUPANCY) return false;

        // 유효 주파수 프레임 확인 (완화된 confidence)
        const validFrames = s.frames.filter(
          f => f.confidence >= GAP_RECOVERY_CONFIDENCE && f.frequency >= 65 && f.frequency <= 1047
        );
        return validFrames.length >= 2; // 최소 2프레임 (품질 보장)
      });

      console.log(`[Phase 76] validGapSlots: ${validGapSlots.length}개`);

      if (validGapSlots.length === 0) continue;

      // 연속된 유효 슬롯 그룹핑
      let groupStart = validGapSlots[0];
      let groupSlotCount = 1;
      let groupFreqs: number[] = [];

      const collectFreqs = (slot: SlotData): number[] => {
        return slot.frames
          .filter(f => f.confidence >= GAP_RECOVERY_CONFIDENCE && f.frequency >= 65 && f.frequency <= 1047)
          .map(f => f.frequency);
      };

      groupFreqs.push(...collectFreqs(groupStart));

      for (let j = 1; j < validGapSlots.length; j++) {
        const prevSlot = validGapSlots[j - 1];
        const currSlot = validGapSlots[j];
        const prevPos = prevSlot.measureIndex * SLOTS_PER_MEASURE + prevSlot.slotIndex;
        const currPos = currSlot.measureIndex * SLOTS_PER_MEASURE + currSlot.slotIndex;

        if (currPos === prevPos + 1) {
          // 연속 슬롯: 그룹에 추가
          groupSlotCount++;
          groupFreqs.push(...collectFreqs(currSlot));
        } else {
          // 연속 끊김: 이전 그룹으로 음표 생성
          if (groupSlotCount >= 1 && groupFreqs.length >= 2) {
            const medianFreq = median(groupFreqs);
            const snappedFreq = pitchSnap(medianFreq);

            // Low Solo 보호 (150Hz 이하는 옥타브 시프트 없음)
            let finalShift = octaveShift;
            if (medianFreq < activeParams.LOW_SOLO_THRESHOLD) {
              finalShift = 0;
            }

            const recoveredPitch = frequencyToNote(snappedFreq, finalShift);

            // 타이밍 오프셋 적용
            let adjustedSlotIndex = groupStart.slotIndex + TIMING_OFFSET_SLOTS;
            let adjustedMeasureIndex = groupStart.measureIndex;
            if (adjustedSlotIndex >= SLOTS_PER_MEASURE) {
              adjustedSlotIndex -= SLOTS_PER_MEASURE;
              adjustedMeasureIndex++;
            }

            recoveredNotes.push({
              pitch: recoveredPitch,
              duration: slotCountToDuration(groupSlotCount),
              beat: (adjustedMeasureIndex * SLOTS_PER_MEASURE + adjustedSlotIndex) / 4,
              measureIndex: adjustedMeasureIndex,
              slotIndex: adjustedSlotIndex,
              slotCount: groupSlotCount,
              confidence: 'medium',
              isRest: false
            });
            gapRecoveryCount++;
            console.log(`[Phase 76] Gap Recovery: ${recoveredPitch} (${groupSlotCount}슬롯) at orig gap [${origCurrEndSlot}-${origNextStartSlot}]`);
          }

          // 새 그룹 시작
          groupStart = currSlot;
          groupSlotCount = 1;
          groupFreqs = collectFreqs(currSlot);
        }
      }

      // 마지막 그룹 처리
      if (groupSlotCount >= 1 && groupFreqs.length >= 2) {
        const medianFreq = median(groupFreqs);
        const snappedFreq = pitchSnap(medianFreq);

        let finalShift = octaveShift;
        if (medianFreq < activeParams.LOW_SOLO_THRESHOLD) {
          finalShift = 0;
        }

        const recoveredPitch = frequencyToNote(snappedFreq, finalShift);

        let adjustedSlotIndex = groupStart.slotIndex + TIMING_OFFSET_SLOTS;
        let adjustedMeasureIndex = groupStart.measureIndex;
        if (adjustedSlotIndex >= SLOTS_PER_MEASURE) {
          adjustedSlotIndex -= SLOTS_PER_MEASURE;
          adjustedMeasureIndex++;
        }

        recoveredNotes.push({
          pitch: recoveredPitch,
          duration: slotCountToDuration(groupSlotCount),
          beat: (adjustedMeasureIndex * SLOTS_PER_MEASURE + adjustedSlotIndex) / 4,
          measureIndex: adjustedMeasureIndex,
          slotIndex: adjustedSlotIndex,
          slotCount: groupSlotCount,
          confidence: 'medium',
          isRest: false
        });
        gapRecoveryCount++;
        console.log(`[Phase 76] Gap Recovery: ${recoveredPitch} (${groupSlotCount}슬롯) at orig gap [${origCurrEndSlot}-${origNextStartSlot}]`);
      }
    }
  }

  // 복구된 음표 추가
  if (recoveredNotes.length > 0) {
    rawNotes.push(...recoveredNotes);
    // 다시 슬롯 순서로 정렬
    rawNotes.sort((a, b) => {
      const slotA = a.measureIndex * SLOTS_PER_MEASURE + a.slotIndex;
      const slotB = b.measureIndex * SLOTS_PER_MEASURE + b.slotIndex;
      return slotA - slotB;
    });
    console.log(`[Phase 76] Gap Recovery 완료: ${gapRecoveryCount}개 음표 복구`);
  } else {
    console.log('[Phase 76] Gap Recovery: 복구할 음표 없음');
  }
  */

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

  for (const note of splitNotes) {
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
