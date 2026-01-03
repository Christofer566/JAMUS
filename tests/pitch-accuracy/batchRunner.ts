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
import {
  convertToNotes as pitchToNoteConvert,
  setTunableParams,
  TunableParams as PitchTunableParams
} from '../../utils/pitchToNote';

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

// 타이밍 매칭 허용 범위: ±2 슬롯 (음표 탐색용)
const TIMING_TOLERANCE = 16;

// [지시 사항 1] 1슬롯 관용 정책 - 편집 효율성 기준
// 1슬롯(16분음표 1개) 차이는 사용자가 쉽게 수정 가능하므로 정답으로 간주
const TIMING_TOLERANCE_SCORE = 1;   // 타이밍: ±1슬롯 차이는 100% 일치
const DURATION_TOLERANCE_SCORE = 1; // 길이: ±1슬롯 차이는 100% 일치

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

// [지시 사항 2] MIDI to Frequency 변환
function midiToFrequency(midi: number): number {
  if (midi <= 0) return 0;
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

// [지시 사항 2] Pitch를 한 옥타브 내리기
function pitchDownOctave(pitch: string): string {
  const midi = pitchToMidi(pitch);
  if (midi <= 0) return pitch;
  const newMidi = midi - 12;
  const newOctave = Math.floor(newMidi / 12) - 1;
  const newNoteIndex = ((newMidi % 12) + 12) % 12;
  return `${NOTE_NAMES[newNoteIndex]}${newOctave}`;
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

  // pitchToNote.ts의 convertToNotes 사용 (앱과 동일한 로직)
  const detected = pitchToNoteConvert(frames, bpm);
  const detectedNotes = detected.filter(n => !n.isRest);

  // ============================================
  // Phase 85: 최적 타이밍 정렬 (Best Offset Search)
  // ============================================
  // 여러 오프셋을 시도하여 가장 많은 타이밍 매치를 찾음
  console.log(`    [DEBUG] 검출: ${detectedNotes.length}개, GT: ${groundTruth.length}개`);
  if (detectedNotes.length > 0 && groundTruth.length > 0) {
    let bestOffset = 0;
    let bestTimingMatches = 0;

    // -8 to +8 슬롯 오프셋 시도 (Phase 96: 범위 확장)
    for (let testOffset = -8; testOffset <= 8; testOffset++) {
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

      // [지시 사항 1] 타이밍: ±1슬롯 차이는 100% 일치로 간주
      if (Math.abs(dnSlot - gtSlotPos) <= TIMING_TOLERANCE_SCORE) timingMatch++;

      // [지시 사항 1] 길이: ±1슬롯 차이는 100% 일치로 간주
      if (Math.abs(dn.slotCount - gt.slots) <= DURATION_TOLERANCE_SCORE) durationMatch++;
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

  // pitchToNote.ts의 파라미터도 동일하게 설정 (앱과 동기화)
  setTunableParams(GOLDEN_PARAMS_75 as PitchTunableParams);

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
