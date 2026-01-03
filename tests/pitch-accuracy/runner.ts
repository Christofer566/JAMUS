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
// pitchToNote.ts에서 핵심 로직 import (동기화)
// ============================================
import {
  convertToNotes,
  setTunableParams,
  getTunableParams,
  TunableParams,
  frequencyToNote,
  pitchToMidi
} from '../../utils/pitchToNote';
import { PitchFrame } from '../../types/pitch';
import { NoteData } from '../../types/note';

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
// 타입 정의 (PitchFrame, NoteData는 import됨)
// ============================================
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
// TunableParams는 pitchToNote.ts에서 import됨
// ============================================

// ============================================
// Phase 75: 황금 설정 (절대 변경 금지)
// goldenSettings75.json에서 로드하며, 개선되지 않으면 자동 롤백
// pitchToNote.ts의 setTunableParams()를 사용하여 동기화
// ============================================
function loadGoldenParams75(): TunableParams {
  const goldenPath = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'goldenSettings75.json');

  let params: Partial<TunableParams>;

  if (fs.existsSync(goldenPath)) {
    const data = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
    console.log(`  [LOCKED] 75차 황금 설정 로드됨 (${data.lockedAt})`);
    params = data.params as Partial<TunableParams>;
  } else {
    // 파일 없을 경우 하드코딩된 기본값
    console.log('  [WARNING] goldenSettings75.json not found, using hardcoded defaults');
    params = {
      LOW_FREQ_RECOVERY_MAX: 120,
      LOW_SOLO_THRESHOLD: 150,
      LOW_FREQ_CONFIDENCE_MIN: 0.15,
      OCCUPANCY_MIN: 0.75,
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
      // Phase 77-80 파라미터
      ONSET_ENERGY_RATIO: 2.0,
      ONSET_CONFIDENCE_JUMP: 0.3,
      ONSET_DETECTION_ENABLED: false,
      PITCH_STABILITY_THRESHOLD: 0.20,
      PITCH_STABILITY_ENABLED: false
    };
  }

  // pitchToNote.ts의 activeParams와 동기화
  setTunableParams(params);
  return getTunableParams();
}

// 75차 황금 설정 (런타임에 로드)
let GOLDEN_PARAMS_75: TunableParams;

// 현재 활성 파라미터 (getTunableParams()로 초기화, setTunableParams()로 변경)
// pitchToNote.ts와 동기화된 activeParams 로컬 복사본
let activeParams: TunableParams;

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

// ============================================
// 상수 (테스트 전용)
// ============================================
const SLOTS_PER_MEASURE = 16;
const A4_FREQ = 440;
const A4_MIDI = 69;
let START_MEASURE = 9; // 녹음 시작 마디 (groundTruth에서 동적으로 설정됨)

// ============================================
// 헬퍼 함수들 (frequencyToNote, pitchToMidi는 pitchToNote.ts에서 import)
// ============================================
// midiToFreq는 오류 분석에만 사용 (테스트 전용)
// convertToNotes는 pitchToNote.ts에서 import됨

// ============================================
// 정확도 테스트를 위해 convertToNotes 결과에서 쉼표 제외
// (pitchToNote.ts의 convertToNotes를 그대로 사용)
// ============================================
// NOTE: convertToNotes는 이제 import된 함수를 사용합니다.
// 아래 REMOVE_BLOCK_START ~ REMOVE_BLOCK_END 사이의 중복 코드는 제거되었습니다.

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
    console.log('  1. 75차 황금 설정으로 롤백 확인');
    console.log('  2. testFrames.json 녹음 품질 확인');
  } else {
    console.log('  !!! 심각한 문제 - 75차 설정 완전 롤백 필요 !!!');
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
// 황금 설정 갱신 (80% 달성 시 또는 기존보다 나으면)
// ============================================
function updateGoldenSettings(testDir: string, best: BestRecord): void {
  const goldenPath = path.join(testDir, 'goldenSettings75.json');

  // 기존 설정 읽기
  let currentBestOverall = 0;
  if (fs.existsSync(goldenPath)) {
    const existing = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
    const { timing = 0, pitch = 0, duration = 0 } = existing.bestResults || {};
    currentBestOverall = (timing + pitch + duration) / 3;
  }

  // 새 결과가 더 좋으면 갱신
  if (best.result.overall > currentBestOverall) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    const newGoldenSettings = {
      version: `${best.iteration}차`,
      locked: true,
      description: `${best.iteration}차 황금 설정 - ${best.result.overall.toFixed(1)}% 달성`,
      lockedAt: dateStr,
      bestResults: {
        timing: best.result.timing,
        pitch: best.result.pitch,
        duration: best.result.duration
      },
      params: best.params,
      coreParams: {
        PULLBACK_BUFFER_MS: 250,
        TARGET_MIN_OCTAVE: 3,
        PHASE2_THRESHOLD: 1.62,
        RMS_THRESHOLD: 0.018
      },
      notes: [
        `${currentBestOverall.toFixed(1)}% → ${best.result.overall.toFixed(1)}% 개선`,
        "PULLBACK 200ms로 변경 시 타이밍 붕괴",
        "TARGET_MIN_OCTAVE=2 시 음정 0% (절대 금지)"
      ]
    };

    fs.writeFileSync(goldenPath, JSON.stringify(newGoldenSettings, null, 2), 'utf-8');
    console.log(`\n  ★★★ 황금 설정 갱신! (${currentBestOverall.toFixed(1)}% → ${best.result.overall.toFixed(1)}%) ★★★`);
    console.log(`  goldenSettings75.json 업데이트됨`);

    // 전역 변수도 갱신
    GOLDEN_PARAMS_75 = best.params;
  }
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

  // 초기 테스트 (75차 황금 설정 - 절대 기준)
  setTunableParams(GOLDEN_PARAMS_75);
  activeParams = getTunableParams();
  let prevResult = runSingleTest(frames, bpm, groundTruth);
  let baselineAccuracy = prevResult.overallAccuracy; // 현재 최고 기준 정확도 (갱신 가능)
  let baselineParams = { ...GOLDEN_PARAMS_75 }; // 현재 최고 기준 파라미터

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
    strategy: '75차 황금 설정 (초기값 - 롤백 기준)'
  };
  history.push(initialRecord);

  console.log(`\n  [BASELINE] 75차 기준 정확도: ${baselineAccuracy.toFixed(1)}%`);

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

    setTunableParams(nextParams);
    activeParams = getTunableParams();

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

    // 현재 최고 기준 대비 성능 저하 체크 - 즉시 롤백
    if (result.overallAccuracy < baselineAccuracy - 5) {
      console.log(`\n  [${i}차] ${strategy}`);
      console.log(`    ⚠️ 현재 기준(${baselineAccuracy.toFixed(1)}%) 대비 ${(baselineAccuracy - result.overallAccuracy).toFixed(1)}% 저하!`);
      console.log(`    → 최고 기록 설정으로 즉시 롤백`);
      setTunableParams(baselineParams);
      activeParams = getTunableParams();
      stagnationCount++;
      prevResult = result;
      continue;
    }

    // 최고 기록 갱신
    if (result.overallAccuracy > best.result.overall) {
      best = {
        iteration: i,
        params: { ...activeParams },
        result: record.result,
        matched: result.matched
      };

      // 기준 정확도 갱신 (더 좋은 결과가 새 기준이 됨)
      baselineAccuracy = result.overallAccuracy;
      baselineParams = { ...activeParams };

      stagnationCount = 0;
      console.log(`\n  [${i}차] ${strategy}`);
      console.log(`    ★ 최고 기록 갱신! ${result.overallAccuracy.toFixed(1)}% (+${improvement.toFixed(1)}%)`);
      console.log(`    → 새로운 기준으로 설정됨`);
    } else {
      stagnationCount++;
      console.log(`\n  [${i}차] ${strategy}`);
      console.log(`    ${result.overallAccuracy.toFixed(1)}% (${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%) - 정체 ${stagnationCount}/${AUTO_CONFIG.STAGNATION_LIMIT}`);

      // 개선 없으면 현재 최고 기록으로 롤백
      if (stagnationCount >= 3) {
        console.log(`    → 3회 연속 개선 없음, 최고 기록 설정으로 롤백`);
        setTunableParams(baselineParams);
        activeParams = getTunableParams();
      }
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

  // 황금 설정 갱신 (기존보다 나으면 자동 업데이트)
  updateGoldenSettings(testDir, best);

  // 최고 기록으로 상세 결과 출력
  setTunableParams(best.params);
  activeParams = getTunableParams();
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
  console.log('  SELF-REFINING PITCH ACCURACY TEST v2.2');
  console.log('  (Phase 81: 메타데이터 기반 라이브-오프라인 동기화)');
  console.log('='.repeat(60));
  console.log(`  Mode: ${isAutoMode ? 'AUTO-OPTIMIZATION' : 'SINGLE TEST'}`);

  // 75차 황금 설정 로드 (절대 기준) - setTunableParams 호출됨
  GOLDEN_PARAMS_75 = loadGoldenParams75();
  activeParams = getTunableParams(); // loadGoldenParams75()가 이미 setTunableParams 호출함

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

  // ============================================
  // Phase 81: 메타데이터 기반 동기화
  // ============================================
  if (framesData.metadata) {
    const meta = framesData.metadata;
    console.log('\n  [Phase 81] 메타데이터 감지됨 (v' + meta.version + ')');

    // 1. recordingRange에서 START_MEASURE 설정
    if (meta.recordingRange?.startMeasure !== undefined) {
      START_MEASURE = meta.recordingRange.startMeasure;
      console.log(`  → START_MEASURE: ${START_MEASURE} (메타데이터에서 로드)`);
    }

    // 2. PULLBACK 기반 TIMING_OFFSET_SLOTS 동적 계산
    if (meta.pullback?.slots !== undefined) {
      const pullbackSlots = meta.pullback.slots;
      const currentOffset = activeParams.TIMING_OFFSET_SLOTS;

      // PULLBACK slots가 현재 TIMING_OFFSET보다 크면 조정
      if (pullbackSlots !== currentOffset) {
        console.log(`  → TIMING_OFFSET_SLOTS: ${currentOffset} → ${pullbackSlots} (PULLBACK ${meta.pullback.totalMs}ms 동기화)`);
        setTunableParams({ TIMING_OFFSET_SLOTS: pullbackSlots });
        activeParams = getTunableParams();
      } else {
        console.log(`  → TIMING_OFFSET_SLOTS: ${currentOffset} (이미 동기화됨)`);
      }
    }

    // 3. 곡 정보 출력
    if (meta.song) {
      console.log(`  → Song: ${meta.song.title} (${meta.song.bpm} BPM, ${meta.song.timeSignature})`);
    }

    // 4. export 시점 정보
    if (meta.exportedAt) {
      console.log(`  → Exported: ${meta.exportedAt}`);
    }
  } else {
    // 메타데이터 없음 - 기존 방식 (groundTruth에서 추출)
    console.log('\n  [Legacy] 메타데이터 없음, groundTruth에서 START_MEASURE 추출');
    if (groundTruth.length > 0) {
      START_MEASURE = Math.min(...groundTruth.map(n => n.measure));
    }
    console.log(`  → START_MEASURE: ${START_MEASURE} (groundTruth에서 추출)`);
    console.log(`  → TIMING_OFFSET_SLOTS: ${activeParams.TIMING_OFFSET_SLOTS} (기본값)`);
    console.log('  ⚠️  Phase 81 메타데이터 없이 정확도가 낮을 수 있습니다.');
    console.log('     새로 exportTestFrames()로 내보내면 메타데이터가 포함됩니다.');
  }

  console.log(`  Start Measure: ${START_MEASURE}`);

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
