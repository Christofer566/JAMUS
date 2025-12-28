import { NoteData } from '@/types/note';

// ============================================
// Types
// ============================================

export interface ComparisonResult {
  noteIndex: number;
  auto: NoteData | null;        // 자동 감지 음표
  manual: NoteData | null;      // 수동 입력 음표

  // 차이 분석
  pitchDiff: number;            // 반음 차이 (0 = 일치, ±12 = 옥타브)
  timingDiff: number;           // 슬롯 차이 (0 = 일치)
  durationDiff: number;         // 길이 차이 (슬롯 단위)

  // 매칭 유형
  matchType: 'exact' | 'pitch_only' | 'timing_only' | 'missed' | 'extra';
}

export interface GapAnalysis {
  totalAutoNotes: number;
  totalManualNotes: number;

  // 정확도 지표
  pitchAccuracy: number;        // 음정 일치율 (%)
  timingAccuracy: number;       // 타이밍 일치율 (%)
  durationAccuracy: number;     // 길이 일치율 (%)
  overallAccuracy: number;      // 전체 일치율 (%)

  // 오류 패턴
  missedNotes: number;          // 자동이 놓친 음표
  extraNotes: number;           // 자동이 잘못 추가한 음표
  octaveErrors: number;         // 옥타브 오류 (±12 반음)
  pitchErrors: number;          // 음정 오류 (옥타브 제외)
  timingErrors: number;         // 타이밍 오류
  durationErrors: number;       // 길이 오류

  // 상세 결과
  comparisons: ComparisonResult[];
}

// ============================================
// Helper: 음정을 MIDI 번호로 변환
// ============================================

const PITCH_MAP: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

function pitchToMidi(pitch: string): number {
  const match = pitch.match(/^([A-G][#b]?)(\d)$/);
  if (!match) return -1;

  const [, note, octave] = match;
  const pitchClass = PITCH_MAP[note];
  if (pitchClass === undefined) return -1;

  return pitchClass + (parseInt(octave) + 1) * 12;
}

// ============================================
// 함수: 두 음정 간 반음 차이 계산
// ============================================

export function getPitchDifference(pitch1: string, pitch2: string): number {
  const midi1 = pitchToMidi(pitch1);
  const midi2 = pitchToMidi(pitch2);

  if (midi1 === -1 || midi2 === -1) return 999; // 파싱 실패

  return midi2 - midi1;
}

// ============================================
// 함수: globalSlotIndex 계산
// ============================================

function getGlobalSlotIndex(note: NoteData): number {
  return note.measureIndex * 16 + note.slotIndex;
}

// ============================================
// 함수: 음표 비교 (1:1 매칭)
// ============================================

// 헬퍼: 가장 가까운 수동 음표 찾기
function findBestMatch(
  autoSlot: number,
  sortedManual: NoteData[],
  matchedIndices: Set<number>,
  tolerance: number
): { note: NoteData; index: number; distance: number } | null {
  let bestMatch: { note: NoteData; index: number; distance: number } | null = null;

  for (let manualIndex = 0; manualIndex < sortedManual.length; manualIndex++) {
    if (matchedIndices.has(manualIndex)) continue;

    const manualNote = sortedManual[manualIndex];
    const manualSlot = getGlobalSlotIndex(manualNote);
    const distance = Math.abs(autoSlot - manualSlot);

    if (distance <= tolerance) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { note: manualNote, index: manualIndex, distance };
      }
    }
  }

  return bestMatch;
}

export function compareNotes(
  autoNotes: NoteData[],
  manualNotes: NoteData[],
  startMeasure: number = 0
): ComparisonResult[] {
  // 1. 자동 감지 음표의 measureIndex 정규화 (상대값 → 절대값)
  const normalizedAuto = autoNotes
    .filter(n => !n.isRest) // 쉼표 제외
    .map(n => ({
      ...n,
      measureIndex: n.measureIndex + startMeasure
    }));

  // 2. 수동 입력 음표 (쉼표 제외)
  const normalizedManual = manualNotes.filter(n => !n.isRest);

  // ============================================
  // Phase 43: 동적 타이밍 오프셋 (Dynamic Auto-Alignment)
  // ============================================
  // 정답지(수동)의 첫 음표와 자동 감지의 첫 음표 시점을 비교하여
  // 하드웨어 지연으로 인한 전체 밀림을 자동 보정
  if (normalizedAuto.length > 0 && normalizedManual.length > 0) {
    // 첫 음표 찾기 (시간순 정렬)
    const autoSorted = [...normalizedAuto].sort(
      (a, b) => getGlobalSlotIndex(a) - getGlobalSlotIndex(b)
    );
    const manualSorted = [...normalizedManual].sort(
      (a, b) => getGlobalSlotIndex(a) - getGlobalSlotIndex(b)
    );

    const autoFirstSlot = getGlobalSlotIndex(autoSorted[0]);
    const manualFirstSlot = getGlobalSlotIndex(manualSorted[0]);
    const timingDelta = autoFirstSlot - manualFirstSlot;

    // 오프셋이 ±4슬롯 이내일 때만 보정 (너무 큰 차이는 의도적일 수 있음)
    if (Math.abs(timingDelta) > 0 && Math.abs(timingDelta) <= 4) {
      console.log(`[Phase 43] 🎯 동적 타이밍 오프셋 적용: ${timingDelta > 0 ? '+' : ''}${timingDelta}슬롯`);
      console.log(`  자동 첫 음표: 마디 ${autoSorted[0].measureIndex}, 슬롯 ${autoSorted[0].slotIndex}`);
      console.log(`  수동 첫 음표: 마디 ${manualSorted[0].measureIndex}, 슬롯 ${manualSorted[0].slotIndex}`);

      // 전체 자동 음표에 delta 적용 (슬롯 시프트)
      normalizedAuto.forEach(n => {
        const currentGlobalSlot = getGlobalSlotIndex(n);
        const newGlobalSlot = currentGlobalSlot - timingDelta;
        n.measureIndex = Math.floor(newGlobalSlot / 16);
        n.slotIndex = ((newGlobalSlot % 16) + 16) % 16; // 음수 처리
      });

      console.log(`  → 전체 ${normalizedAuto.length}개 음표 시프트 완료`);
    } else if (timingDelta !== 0) {
      console.log(`[Phase 43] ⚠️ 타이밍 차이 ${timingDelta}슬롯 - 보정 범위 초과 (±4슬롯)`);
    }
  }

  // 3. globalSlotIndex로 정렬
  const sortedAuto = normalizedAuto.sort(
    (a, b) => getGlobalSlotIndex(a) - getGlobalSlotIndex(b)
  );
  const sortedManual = normalizedManual.sort(
    (a, b) => getGlobalSlotIndex(a) - getGlobalSlotIndex(b)
  );

  // 4. 매칭 결과 저장
  const results: ComparisonResult[] = [];
  const matchedManualIndices = new Set<number>();
  const TIMING_TOLERANCE = 2; // ±2 슬롯 이내

  // 5. 자동 음표를 기준으로 매칭
  sortedAuto.forEach((autoNote, autoIndex) => {
    const autoSlot = getGlobalSlotIndex(autoNote);

    // 가장 가까운 수동 음표 찾기 (±2 슬롯 이내)
    const bestMatch = findBestMatch(autoSlot, sortedManual, matchedManualIndices, TIMING_TOLERANCE);

    if (bestMatch !== null) {
      // 매칭 성공
      matchedManualIndices.add(bestMatch.index);

      const pitchDiff = getPitchDifference(autoNote.pitch, bestMatch.note.pitch);
      const timingDiff = getGlobalSlotIndex(bestMatch.note) - getGlobalSlotIndex(autoNote);
      const durationDiff = bestMatch.note.slotCount - autoNote.slotCount;

      let matchType: ComparisonResult['matchType'];
      if (pitchDiff === 0 && timingDiff === 0 && durationDiff === 0) {
        matchType = 'exact';
      } else if (pitchDiff === 0) {
        matchType = 'pitch_only';
      } else if (timingDiff === 0) {
        matchType = 'timing_only';
      } else {
        matchType = 'pitch_only'; // 일단 pitch_only로 분류
      }

      results.push({
        noteIndex: autoIndex,
        auto: autoNote,
        manual: bestMatch.note,
        pitchDiff,
        timingDiff,
        durationDiff,
        matchType
      });
    } else {
      // 매칭 실패 (자동이 잘못 추가한 음표)
      results.push({
        noteIndex: autoIndex,
        auto: autoNote,
        manual: null,
        pitchDiff: 999,
        timingDiff: 999,
        durationDiff: 999,
        matchType: 'extra'
      });
    }
  });

  // 6. 매칭되지 않은 수동 음표 (자동이 놓친 음표)
  sortedManual.forEach((manualNote, manualIndex) => {
    if (!matchedManualIndices.has(manualIndex)) {
      results.push({
        noteIndex: results.length,
        auto: null,
        manual: manualNote,
        pitchDiff: 999,
        timingDiff: 999,
        durationDiff: 999,
        matchType: 'missed'
      });
    }
  });

  return results;
}

// ============================================
// 함수: Gap 통계 분석
// ============================================

export function analyzeGap(comparisons: ComparisonResult[]): GapAnalysis {
  const totalComparisons = comparisons.length;
  if (totalComparisons === 0) {
    return {
      totalAutoNotes: 0,
      totalManualNotes: 0,
      pitchAccuracy: 0,
      timingAccuracy: 0,
      durationAccuracy: 0,
      overallAccuracy: 0,
      missedNotes: 0,
      extraNotes: 0,
      octaveErrors: 0,
      pitchErrors: 0,
      timingErrors: 0,
      durationErrors: 0,
      comparisons
    };
  }

  // 기본 카운트
  const totalAutoNotes = comparisons.filter(c => c.auto !== null).length;
  const totalManualNotes = comparisons.filter(c => c.manual !== null).length;
  const missedNotes = comparisons.filter(c => c.matchType === 'missed').length;
  const extraNotes = comparisons.filter(c => c.matchType === 'extra').length;

  // 매칭된 음표만 분석 (missed, extra 제외)
  const matched = comparisons.filter(c => c.auto !== null && c.manual !== null);
  const matchedCount = matched.length;

  if (matchedCount === 0) {
    return {
      totalAutoNotes,
      totalManualNotes,
      pitchAccuracy: 0,
      timingAccuracy: 0,
      durationAccuracy: 0,
      overallAccuracy: 0,
      missedNotes,
      extraNotes,
      octaveErrors: 0,
      pitchErrors: 0,
      timingErrors: 0,
      durationErrors: 0,
      comparisons
    };
  }

  // 정확도 계산
  const pitchCorrect = matched.filter(c => c.pitchDiff === 0).length;
  const timingCorrect = matched.filter(c => c.timingDiff === 0).length;
  const durationCorrect = matched.filter(c => c.durationDiff === 0).length;
  const exactMatch = matched.filter(c => c.matchType === 'exact').length;

  const pitchAccuracy = (pitchCorrect / matchedCount) * 100;
  const timingAccuracy = (timingCorrect / matchedCount) * 100;
  const durationAccuracy = (durationCorrect / matchedCount) * 100;
  const overallAccuracy = (exactMatch / matchedCount) * 100;

  // 오류 패턴 분석
  const octaveErrors = matched.filter(c =>
    Math.abs(c.pitchDiff) === 12 || Math.abs(c.pitchDiff) === 24
  ).length;
  const pitchErrors = matched.filter(c =>
    c.pitchDiff !== 0 && Math.abs(c.pitchDiff) !== 12 && Math.abs(c.pitchDiff) !== 24
  ).length;
  const timingErrors = matched.filter(c => c.timingDiff !== 0).length;
  const durationErrors = matched.filter(c => c.durationDiff !== 0).length;

  return {
    totalAutoNotes,
    totalManualNotes,
    pitchAccuracy,
    timingAccuracy,
    durationAccuracy,
    overallAccuracy,
    missedNotes,
    extraNotes,
    octaveErrors,
    pitchErrors,
    timingErrors,
    durationErrors,
    comparisons
  };
}

// ============================================
// 함수: 콘솔 출력용 포맷팅
// ============================================

export function logGapAnalysis(analysis: GapAnalysis): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 자동 피치 감지 vs 수동 입력 Gap 분석');
  console.log('='.repeat(60));

  console.log('\n📈 전체 통계:');
  console.log(`  - 자동 감지 음표: ${analysis.totalAutoNotes}개`);
  console.log(`  - 수동 입력 음표: ${analysis.totalManualNotes}개`);
  console.log(`  - 매칭된 음표: ${analysis.totalAutoNotes - analysis.extraNotes}개`);

  console.log('\n✅ 정확도:');
  console.log(`  - 전체 일치율: ${analysis.overallAccuracy.toFixed(1)}%`);
  console.log(`  - 음정 정확도: ${analysis.pitchAccuracy.toFixed(1)}%`);
  console.log(`  - 타이밍 정확도: ${analysis.timingAccuracy.toFixed(1)}%`);
  console.log(`  - 길이 정확도: ${analysis.durationAccuracy.toFixed(1)}%`);

  console.log('\n❌ 오류 패턴:');
  console.log(`  - 놓친 음표 (Missed): ${analysis.missedNotes}개`);
  console.log(`  - 잘못 추가 (Extra): ${analysis.extraNotes}개`);
  console.log(`  - 옥타브 오류: ${analysis.octaveErrors}개`);
  console.log(`  - 음정 오류: ${analysis.pitchErrors}개`);
  console.log(`  - 타이밍 오류: ${analysis.timingErrors}개`);
  console.log(`  - 길이 오류: ${analysis.durationErrors}개`);

  console.log('\n🔍 상세 비교 (수정된 음표만):');
  const modified = analysis.comparisons.filter(c =>
    c.matchType !== 'exact' && c.auto !== null && c.manual !== null
  );

  if (modified.length === 0) {
    console.log('  수정된 음표가 없습니다. 자동 감지가 완벽합니다! 🎉');
  } else {
    modified.forEach((c, idx) => {
      console.log(`\n  [${idx + 1}] 마디 ${c.auto!.measureIndex}, 슬롯 ${c.auto!.slotIndex}`);
      console.log(`      자동: ${c.auto!.pitch} (${c.auto!.slotCount}슬롯, ${c.auto!.confidence})`);
      console.log(`      수동: ${c.manual!.pitch} (${c.manual!.slotCount}슬롯)`);

      if (c.pitchDiff !== 0) {
        const octave = Math.abs(c.pitchDiff) === 12 ? ' (옥타브 오류)' : '';
        console.log(`      → 음정 차이: ${c.pitchDiff > 0 ? '+' : ''}${c.pitchDiff}반음${octave}`);
      }
      if (c.timingDiff !== 0) {
        console.log(`      → 타이밍 차이: ${c.timingDiff > 0 ? '+' : ''}${c.timingDiff}슬롯`);
      }
      if (c.durationDiff !== 0) {
        console.log(`      → 길이 차이: ${c.durationDiff > 0 ? '+' : ''}${c.durationDiff}슬롯`);
      }
    });
  }

  // Missed notes
  const missed = analysis.comparisons.filter(c => c.matchType === 'missed');
  if (missed.length > 0) {
    console.log('\n  📌 놓친 음표 (자동 감지 실패):');
    missed.forEach((c, idx) => {
      console.log(`    [${idx + 1}] 마디 ${c.manual!.measureIndex}, 슬롯 ${c.manual!.slotIndex}: ${c.manual!.pitch} (${c.manual!.slotCount}슬롯)`);
    });
  }

  // Extra notes
  const extra = analysis.comparisons.filter(c => c.matchType === 'extra');
  if (extra.length > 0) {
    console.log('\n  📌 잘못 추가된 음표 (노이즈 감지):');
    extra.forEach((c, idx) => {
      console.log(`    [${idx + 1}] 마디 ${c.auto!.measureIndex}, 슬롯 ${c.auto!.slotIndex}: ${c.auto!.pitch} (${c.auto!.slotCount}슬롯, ${c.auto!.confidence})`);
    });
  }

  console.log('\n' + '='.repeat(60) + '\n');
}
