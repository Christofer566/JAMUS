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
  // 저음 복원 파라미터
  LOW_FREQ_RECOVERY_MAX: number;      // 70-150Hz (현재 120)
  LOW_SOLO_THRESHOLD: number;         // 100-150Hz (현재 130)
  LOW_FREQ_CONFIDENCE_MIN: number;    // 0.10-0.30 (현재 0.15)

  // 점유율 파라미터
  OCCUPANCY_MIN: number;              // 0.50-0.80 (현재 0.70)
  OCCUPANCY_SUSTAIN: number;          // 0.30-0.60 (현재 0.50)

  // 에너지 피크 파라미터
  ENERGY_PEAK_CONFIDENCE_MIN: number; // 0.50-0.90 (현재 0.75)
  ENERGY_PEAK_OCCUPANCY_MIN: number;  // 0.70-0.95 (현재 0.90)

  // 음표 길이 파라미터
  MIN_NOTE_DURATION_SLOTS: number;    // 1-3 (현재 2)

  // Cross-Measure Merge 최대 슬롯 (과잉 병합 방지)
  MAX_MERGE_SLOTS: number;            // 6-12 (현재 무제한→8 추천)
}

// 기본값 (자동 최적화 7차 최고 기록: 63.8%)
const DEFAULT_PARAMS: TunableParams = {
  LOW_FREQ_RECOVERY_MAX: 120,
  LOW_SOLO_THRESHOLD: 150,         // 130→150: D3=147Hz까지 보호
  LOW_FREQ_CONFIDENCE_MIN: 0.15,
  OCCUPANCY_MIN: 0.75,             // 0.70→0.75: 노이즈 필터링 강화
  OCCUPANCY_SUSTAIN: 0.55,         // 0.50→0.55: Sustain 확장
  ENERGY_PEAK_CONFIDENCE_MIN: 0.80, // 0.75→0.80: 엄격한 피크 감지
  ENERGY_PEAK_OCCUPANCY_MIN: 0.95, // 0.90→0.95: 엄격한 피크 점유율
  MIN_NOTE_DURATION_SLOTS: 1,      // 2→1: 1슬롯 음표 허용
  MAX_MERGE_SLOTS: 8               // 16→8: 과잉 병합 방지
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
const OCCUPANCY_HIGH = 0.70;            // 70% 이상 = 확실
const PITCH_CONFIDENCE_MIN = 0.35;      // Phase 40: 0.5 → 0.35 (음정 구출 강화, Gemini 제안)
const GRID_SNAP_TOLERANCE = 0.15;       // 박자 경계 ±15% 허용
const DEFAULT_PITCH = 'C4';             // 음정 감지 실패 시 기본값
const TIMING_OFFSET_SLOTS = 3;          // Phase 35: 2 → 3 (32차 +1슬롯 패턴 보정, Gemini 제안)

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

    // 점유율에 따른 confidence 판정 (activeParams 사용)
    if (slot.occupancy >= OCCUPANCY_HIGH) {
      slot.confidence = 'high';
      highCount++;
    } else if (slot.occupancy >= activeParams.OCCUPANCY_MIN) {
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
          // 주파수 차이가 ±10% 이내면 연장 (Decay 상태로 간주)
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
        const contextFreqs = allValidFreqs.slice(0, Math.min(100, allValidFreqs.length));
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

      // Low Solo 보호 (Phase 75: activeParams 사용)
      let currentFinalShift = octaveShift;
      if (currentMedianFreq > 0 && currentMedianFreq < activeParams.LOW_SOLO_THRESHOLD) {
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
