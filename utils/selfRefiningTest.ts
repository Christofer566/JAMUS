/**
 * Self-Refining Pitch Accuracy Test Utility
 *
 * 브라우저 콘솔에서 자동 테스트 및 파라미터 최적화 수행
 *
 * 사용법:
 * 1. 피드백 페이지에서 녹음 분석 완료 후
 * 2. 콘솔에서 window.runSelfRefiningTest() 호출
 * 3. 자동 최적화: window.runAutoOptimize() 호출
 */

import { convertToNotes, setTunableParams, resetTunableParams, getTunableParams, TunableParams } from './pitchToNote';
import { PitchFrame } from '@/types/pitch';
import { NoteData } from '@/types/note';

// 정답지 (Ground Truth)
const GROUND_TRUTH = [
  { measure: 9, slot: 12, pitch: 'G3', slots: 4 },
  { measure: 9, slot: 14, pitch: 'A#3', slots: 4 },
  { measure: 10, slot: 4, pitch: 'F3', slots: 4 },
  { measure: 10, slot: 8, pitch: 'D3', slots: 4 },
  { measure: 10, slot: 12, pitch: 'A3', slots: 4 },
  { measure: 10, slot: 14, pitch: 'F3', slots: 4 },
  { measure: 11, slot: 0, pitch: 'F3', slots: 4 },
  { measure: 11, slot: 11, pitch: 'C3', slots: 1 },
  { measure: 11, slot: 12, pitch: 'D3', slots: 3 },
  { measure: 11, slot: 15, pitch: 'A#2', slots: 5 },
  { measure: 12, slot: 11, pitch: 'C3', slots: 1 },
  { measure: 12, slot: 12, pitch: 'D3', slots: 3 },
  { measure: 12, slot: 15, pitch: 'D#3', slots: 9 },
  { measure: 13, slot: 12, pitch: 'C3', slots: 4 },
  { measure: 14, slot: 0, pitch: 'D3', slots: 4 },
  { measure: 14, slot: 4, pitch: 'D2', slots: 4 },
  { measure: 14, slot: 8, pitch: 'E2', slots: 4 },
  { measure: 14, slot: 12, pitch: 'F#2', slots: 4 },
  { measure: 15, slot: 0, pitch: 'G2', slots: 4 },
  { measure: 15, slot: 4, pitch: 'A2', slots: 4 },
  { measure: 15, slot: 8, pitch: 'A#2', slots: 4 },
  { measure: 15, slot: 12, pitch: 'C3', slots: 4 },
  { measure: 16, slot: 0, pitch: 'D3', slots: 4 },
  { measure: 16, slot: 4, pitch: 'F#3', slots: 4 },
  { measure: 16, slot: 8, pitch: 'G3', slots: 4 },
  { measure: 16, slot: 12, pitch: 'D3', slots: 4 },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const START_MEASURE = 9; // 녹음 시작 마디

interface TestResult {
  pitchAccuracy: number;
  timingAccuracy: number;
  durationAccuracy: number;
  overallAccuracy: number;
  matched: number;
  missed: number;
  extra: number;
  errors: string[];
}

function pitchToMidi(pitch: string): number {
  if (pitch === 'rest') return -1;
  const match = pitch.match(/^([A-G]#?)(\d)$/);
  if (!match) return -1;
  const note = match[1];
  const octave = parseInt(match[2]);
  const noteIndex = NOTE_NAMES.indexOf(note);
  if (noteIndex === -1) return -1;
  return (octave + 1) * 12 + noteIndex;
}

export function runAccuracyTest(detected: NoteData[]): TestResult {
  const detectedNotes = detected.filter(n => !n.isRest);
  const errors: string[] = [];

  let pitchMatch = 0;
  let timingMatch = 0;
  let durationMatch = 0;
  let matched = 0;

  const usedDetected = new Set<number>();

  for (const gt of GROUND_TRUTH) {
    const gtSlot = (gt.measure - START_MEASURE) * 16 + gt.slot;

    // 가장 가까운 매칭 찾기 (±2슬롯)
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

      // 음정
      if (gtMidi === dnMidi) {
        pitchMatch++;
      } else {
        const diff = dnMidi - gtMidi;
        errors.push(`[음정] ${gt.pitch}→${dn.pitch} (${diff > 0 ? '+' : ''}${diff}) @M${gt.measure}S${gt.slot}`);
      }

      // 타이밍
      const dnSlot = dn.measureIndex * 16 + dn.slotIndex;
      const gtSlotPos = (gt.measure - START_MEASURE) * 16 + gt.slot;
      if (dnSlot === gtSlotPos) {
        timingMatch++;
      } else {
        const diff = dnSlot - gtSlotPos;
        errors.push(`[타이밍] ${diff > 0 ? '+' : ''}${diff}슬롯 @M${gt.measure}S${gt.slot}`);
      }

      // 길이
      if (dn.slotCount === gt.slots) {
        durationMatch++;
      } else {
        const diff = gt.slots - dn.slotCount;
        errors.push(`[길이] ${gt.slots}→${dn.slotCount} (${diff > 0 ? '+' : ''}${diff}) @M${gt.measure}S${gt.slot}`);
      }
    } else {
      errors.push(`[놓침] ${gt.pitch}(${gt.slots}슬롯) @M${gt.measure}S${gt.slot}`);
    }
  }

  const extra = detectedNotes.length - usedDetected.size;

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
    missed: GROUND_TRUTH.length - matched,
    extra,
    errors
  };
}

export function printTestResult(result: TestResult): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Self-Refining Test Result');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 음정 정확도: ${result.pitchAccuracy.toFixed(1)}%`);
  console.log(`📊 타이밍 정확도: ${result.timingAccuracy.toFixed(1)}%`);
  console.log(`📊 길이 정확도: ${result.durationAccuracy.toFixed(1)}%`);
  console.log(`📊 종합 정확도: ${result.overallAccuracy.toFixed(1)}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 매칭: ${result.matched}/${GROUND_TRUTH.length}`);
  console.log(`❌ 놓침: ${result.missed}`);
  console.log(`⚠️ 추가: ${result.extra}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (result.overallAccuracy >= 80) {
    console.log('🎉 목표 달성! (80%+)');
  } else {
    console.log(`📈 목표까지: ${(80 - result.overallAccuracy).toFixed(1)}% 필요`);
    console.log('\n주요 오류:');
    result.errors.slice(0, 10).forEach(e => console.log(`  ${e}`));
    if (result.errors.length > 10) {
      console.log(`  ... 외 ${result.errors.length - 10}개`);
    }
  }
}

// ============================================
// 자동 최적화 시스템
// ============================================

interface ParamVariant {
  name: string;
  params: Partial<TunableParams>;
}

// 테스트할 파라미터 조합들
const PARAM_VARIANTS: ParamVariant[] = [
  // 기본값 (75차)
  { name: 'Base (75차)', params: {} },

  // Version A: 저음 확장
  {
    name: 'A: Low Freq Extension',
    params: {
      LOW_FREQ_RECOVERY_MAX: 150,
      LOW_SOLO_THRESHOLD: 150,
      LOW_FREQ_CONFIDENCE_MIN: 0.12
    }
  },

  // Version B: 짧은 음표 집중
  {
    name: 'B: Short Note Focus',
    params: {
      MIN_NOTE_DURATION_SLOTS: 1,
      ENERGY_PEAK_CONFIDENCE_MIN: 0.60,
      ENERGY_PEAK_OCCUPANCY_MIN: 0.80
    }
  },

  // Version C: 밸런스 (권장)
  {
    name: 'C: Balanced Hybrid',
    params: {
      LOW_FREQ_RECOVERY_MAX: 150,
      LOW_SOLO_THRESHOLD: 140,
      LOW_FREQ_CONFIDENCE_MIN: 0.12,
      OCCUPANCY_MIN: 0.65,
      OCCUPANCY_SUSTAIN: 0.45,
      ENERGY_PEAK_CONFIDENCE_MIN: 0.65,
      ENERGY_PEAK_OCCUPANCY_MIN: 0.85,
      MIN_NOTE_DURATION_SLOTS: 1,
      MAX_MERGE_SLOTS: 8
    }
  },

  // Version C+: 더 공격적인 저음 복원
  {
    name: 'C+: Aggressive Low Freq',
    params: {
      LOW_FREQ_RECOVERY_MAX: 160,
      LOW_SOLO_THRESHOLD: 160,
      LOW_FREQ_CONFIDENCE_MIN: 0.10,
      OCCUPANCY_MIN: 0.60,
      OCCUPANCY_SUSTAIN: 0.40,
      ENERGY_PEAK_CONFIDENCE_MIN: 0.60,
      ENERGY_PEAK_OCCUPANCY_MIN: 0.80,
      MIN_NOTE_DURATION_SLOTS: 1,
      MAX_MERGE_SLOTS: 6
    }
  }
];

interface OptimizationResult {
  variant: string;
  params: Partial<TunableParams>;
  result: TestResult;
}

function runOptimization(frames: PitchFrame[], bpm: number): OptimizationResult[] {
  const results: OptimizationResult[] = [];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔬 Self-Refining Optimization Start');
  console.log(`   ${PARAM_VARIANTS.length}개 파라미터 조합 테스트`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const variant of PARAM_VARIANTS) {
    // 파라미터 초기화 후 적용
    resetTunableParams();
    if (Object.keys(variant.params).length > 0) {
      setTunableParams(variant.params);
    }

    // 테스트 실행
    const notes = convertToNotes(frames, bpm);
    const result = runAccuracyTest(notes);

    results.push({
      variant: variant.name,
      params: variant.params,
      result
    });

    console.log(`\n📊 ${variant.name}`);
    console.log(`   음정: ${result.pitchAccuracy.toFixed(1)}% | 타이밍: ${result.timingAccuracy.toFixed(1)}% | 길이: ${result.durationAccuracy.toFixed(1)}%`);
    console.log(`   종합: ${result.overallAccuracy.toFixed(1)}% | 매칭: ${result.matched}/${GROUND_TRUTH.length} | 추가: ${result.extra}`);
  }

  // 결과 정렬 (종합 점수 기준)
  results.sort((a, b) => b.result.overallAccuracy - a.result.overallAccuracy);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 최적화 결과 순위');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  results.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    const target = r.result.overallAccuracy >= 80 ? '✅' : '❌';
    console.log(`${medal} ${i + 1}. ${r.variant}: ${r.result.overallAccuracy.toFixed(1)}% ${target}`);
  });

  // 최고 결과 적용
  const best = results[0];
  if (best) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🎯 최적 파라미터 자동 적용: ${best.variant}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    resetTunableParams();
    if (Object.keys(best.params).length > 0) {
      setTunableParams(best.params);
    }

    console.log('현재 활성 파라미터:', getTunableParams());

    if (best.result.overallAccuracy >= 80) {
      console.log('\n🎉 목표 달성! 80%+ 정확도');
    } else {
      console.log(`\n📈 목표까지 ${(80 - best.result.overallAccuracy).toFixed(1)}% 더 필요`);
      console.log('💡 팁: 수동으로 파라미터를 조정하려면 setTunableParams({...}) 사용');
    }
  }

  return results;
}

// ============================================
// 데이터 저장/로드 시스템 (localStorage 기반)
// ============================================
const STORAGE_KEY = 'selfRefiningTestData';

interface StoredTestData {
  frames: PitchFrame[];
  bpm: number;
  savedAt: string;
  frameCount: number;
}

function saveTestData(frames: PitchFrame[], bpm: number): void {
  const data: StoredTestData = {
    frames,
    bpm,
    savedAt: new Date().toISOString(),
    frameCount: frames.length
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  console.log(`💾 테스트 데이터 저장 완료: ${frames.length}개 프레임, BPM=${bpm}`);
}

function loadTestData(): StoredTestData | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as StoredTestData;
  } catch {
    return null;
  }
}

function getTestFrames(): { frames: PitchFrame[]; bpm: number } | null {
  // 1. 먼저 메모리에서 확인 (방금 녹음한 경우)
  const memFrames = (window as any).__testPitchFrames as PitchFrame[] | undefined;
  const memBpm = (window as any).__testBpm as number | undefined;

  if (memFrames && memBpm) {
    return { frames: memFrames, bpm: memBpm };
  }

  // 2. localStorage에서 로드
  const stored = loadTestData();
  if (stored) {
    console.log(`📂 저장된 테스트 데이터 로드: ${stored.frameCount}개 프레임 (저장: ${stored.savedAt})`);
    return { frames: stored.frames, bpm: stored.bpm };
  }

  return null;
}

// 브라우저 전역에 등록
if (typeof window !== 'undefined') {
  // 페이지 로드 시 저장된 데이터 자동 복원
  const stored = loadTestData();
  if (stored) {
    (window as any).__testPitchFrames = stored.frames;
    (window as any).__testBpm = stored.bpm;
    console.log(`📂 [자동 복원] 저장된 테스트 데이터: ${stored.frameCount}개 프레임 (${stored.savedAt})`);
  }

  // 테스트 데이터 저장 (녹음 후 호출)
  (window as any).saveTestData = () => {
    const frames = (window as any).__testPitchFrames as PitchFrame[] | undefined;
    const bpm = (window as any).__testBpm as number | undefined;

    if (!frames || !bpm) {
      console.error('❌ 저장할 테스트 데이터가 없습니다.');
      return;
    }

    saveTestData(frames, bpm);
  };

  // 저장된 데이터 삭제
  (window as any).clearTestData = () => {
    localStorage.removeItem(STORAGE_KEY);
    (window as any).__testPitchFrames = undefined;
    (window as any).__testBpm = undefined;
    console.log('🗑️ 테스트 데이터 삭제 완료');
  };

  (window as any).runSelfRefiningTest = () => {
    const data = getTestFrames();

    if (!data) {
      console.error('❌ 테스트 데이터가 없습니다. 먼저 녹음 분석을 완료하세요.');
      return;
    }

    console.log(`🔄 테스트 실행 중... (${data.frames.length} 프레임)`);

    const notes = convertToNotes(data.frames, data.bpm);
    const result = runAccuracyTest(notes);
    printTestResult(result);

    return result;
  };

  (window as any).getTestResult = () => {
    const data = getTestFrames();
    if (!data) return null;

    const notes = convertToNotes(data.frames, data.bpm);
    return runAccuracyTest(notes);
  };

  // 자동 최적화 함수
  (window as any).runAutoOptimize = () => {
    const data = getTestFrames();

    if (!data) {
      console.error('❌ 테스트 데이터가 없습니다. 먼저 녹음 분석을 완료하세요.');
      return null;
    }

    return runOptimization(data.frames, data.bpm);
  };

  // 파라미터 조정 API 노출
  (window as any).setTunableParams = setTunableParams;
  (window as any).getTunableParams = getTunableParams;
  (window as any).resetTunableParams = resetTunableParams;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Self-Refining Test System');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📌 사용법:');
  console.log('  1. 녹음 분석 완료 후 → saveTestData()');
  console.log('  2. 이후 페이지 새로고침해도 데이터 유지');
  console.log('  3. runAutoOptimize() 로 자동 최적화');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 명령어:');
  console.log('  saveTestData()      - 현재 녹음 데이터 저장');
  console.log('  runAutoOptimize()   - 자동 파라미터 최적화');
  console.log('  runSelfRefiningTest() - 현재 설정으로 테스트');
  console.log('  clearTestData()     - 저장된 데이터 삭제');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

export { GROUND_TRUTH };
