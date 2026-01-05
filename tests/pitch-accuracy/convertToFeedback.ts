/**
 * 테스트 케이스 데이터를 FeedbackSession 형식으로 변환
 *
 * 사용법: npx tsx tests/pitch-accuracy/convertToFeedback.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { convertToNotes } from '../../utils/pitchToNote';
import { compareNotes } from '../../lib/feedbackCollection';
import { NoteData } from '../../types/note';
import { PitchFrame } from '../../types/pitch';
import { NoteChange, FeedbackMetrics, FeedbackSession } from '../../types/feedbackCollection';

// ES module에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// Types
// ============================================
interface TestFramesData {
  bpm: number;
  frameCount: number;
  frames: PitchFrame[];
}

interface GroundTruthNote {
  measure: number;
  slot: number;
  pitch: string;
  slots?: number;    // case_XX 형식
  duration?: number; // synth 형식
}

interface GroundTruthData {
  name?: string;
  bpm: number;
  description?: string;
  notes: GroundTruthNote[];
}

interface ConvertedFeedback {
  caseId: string;
  session: Omit<FeedbackSession, 'userId'>;
  summary: {
    autoDetectedCount: number;
    groundTruthCount: number;
    pitchChanged: number;
    positionChanged: number;
    durationChanged: number;
    deleted: number;
    added: number;
    unchanged: number;
    accuracy: number;
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * GroundTruth 형식을 NoteData 형식으로 변환
 * @param measureOffset - 마디 오프셋 (groundTruth의 최소 마디를 0으로 맞추기 위함)
 */
function groundTruthToNoteData(gt: GroundTruthData, measureOffset: number = 0): NoteData[] {
  return gt.notes.map(note => {
    // slots 또는 duration 필드 지원 (synth 케이스는 duration 사용)
    const slotCount = note.slots ?? note.duration ?? 4;
    return {
      pitch: note.pitch,
      duration: slotCountToDuration(slotCount),
      beat: (note.measure - measureOffset) * 4 + note.slot / 4,
      measureIndex: note.measure - measureOffset,
      slotIndex: note.slot,
      slotCount,
      isRest: false,
      confidence: 'high' as const,
    };
  });
}

function slotCountToDuration(slotCount: number): string {
  if (slotCount >= 16) return 'w';
  if (slotCount >= 8) return 'h';
  if (slotCount >= 4) return 'q';
  if (slotCount >= 2) return '8';
  return '16';
}

/**
 * 테스트 케이스 하나를 FeedbackSession으로 변환
 */
function convertCase(caseDir: string, caseId: string): ConvertedFeedback | null {
  const framesPath = path.join(caseDir, 'testFrames.json');
  const truthPath = path.join(caseDir, 'groundTruth.json');

  if (!fs.existsSync(framesPath) || !fs.existsSync(truthPath)) {
    console.warn(`[${caseId}] 파일 없음: ${framesPath} 또는 ${truthPath}`);
    return null;
  }

  try {
    // 1. 데이터 로드
    const framesData: TestFramesData = JSON.parse(fs.readFileSync(framesPath, 'utf-8'));
    const truthData: GroundTruthData = JSON.parse(fs.readFileSync(truthPath, 'utf-8'));

    // 2. 자동 검출 (testFrames → convertToNotes)
    const autoDetectedNotes = convertToNotes(framesData.frames, framesData.bpm);
    const autoNotesOnly = autoDetectedNotes.filter(n => !n.isRest);

    // 3. Ground Truth 변환 (measureIndex 오프셋 보정)
    // groundTruth는 실제 마디 번호(18, 19...), convertToNotes는 0부터 시작
    // → groundTruth의 최소 마디를 기준으로 0-based로 변환
    const minMeasure = Math.min(...truthData.notes.map(n => n.measure));
    const finalEditedNotes = groundTruthToNoteData(truthData, minMeasure);

    // 3.5 슬롯 오프셋 보정
    // 피치 엔진은 실제 녹음 시작점 기준, groundTruth는 악보 기준
    // → 첫 음의 슬롯 위치 차이를 계산해서 groundTruth를 조정
    if (autoNotesOnly.length > 0 && finalEditedNotes.length > 0) {
      const autoFirstSlot = autoNotesOnly[0].measureIndex * 16 + autoNotesOnly[0].slotIndex;
      const gtFirstSlot = finalEditedNotes[0].measureIndex * 16 + finalEditedNotes[0].slotIndex;
      const slotOffset = autoFirstSlot - gtFirstSlot;

      if (slotOffset !== 0) {
        // console.log(`[${caseId}] 슬롯 오프셋 보정: ${slotOffset}슬롯`);
        for (const note of finalEditedNotes) {
          const totalSlot = note.measureIndex * 16 + note.slotIndex + slotOffset;
          note.measureIndex = Math.floor(totalSlot / 16);
          note.slotIndex = totalSlot % 16;
          note.beat = note.measureIndex * 4 + note.slotIndex / 4;
        }
      }
    }

    // 4. 비교 분석
    const { noteChanges, metrics } = compareNotes(autoNotesOnly, finalEditedNotes);

    // 5. 정확도 계산
    const accuracy = metrics.totalOriginalNotes > 0
      ? (metrics.unchangedNotes / metrics.totalOriginalNotes) * 100
      : 0;

    // 6. FeedbackSession 생성
    const session: Omit<FeedbackSession, 'userId'> = {
      songId: `test-${caseId}`,
      autoDetectedNotes: autoNotesOnly,
      finalEditedNotes,
      noteChanges,
      metrics,
      bpm: framesData.bpm,
      key: 'unknown',
      recordingDuration: framesData.frames.length > 0
        ? framesData.frames[framesData.frames.length - 1].time
        : 0,
      editDuration: 0, // 테스트 데이터는 편집 시간 없음
    };

    return {
      caseId,
      session,
      summary: {
        autoDetectedCount: autoNotesOnly.length,
        groundTruthCount: finalEditedNotes.length,
        pitchChanged: metrics.pitchChangedNotes,
        positionChanged: metrics.positionChangedNotes,
        durationChanged: metrics.durationChangedNotes,
        deleted: metrics.deletedNotes,
        added: metrics.addedNotes,
        unchanged: metrics.unchangedNotes,
        accuracy: Math.round(accuracy * 10) / 10,
      },
    };
  } catch (error) {
    console.error(`[${caseId}] 변환 실패:`, error);
    return null;
  }
}

// ============================================
// Main
// ============================================
function main() {
  console.log('========================================');
  console.log('테스트 케이스 → FeedbackSession 변환');
  console.log('========================================\n');

  const datasetsDir = path.join(__dirname, 'datasets');
  const cases = fs.readdirSync(datasetsDir).filter(d =>
    fs.statSync(path.join(datasetsDir, d)).isDirectory()
  );

  console.log(`발견된 케이스: ${cases.length}개\n`);

  const results: ConvertedFeedback[] = [];
  const pitchChangePatterns: Map<string, number> = new Map();
  const durationChangePatterns: Map<string, number> = new Map();

  for (const caseId of cases) {
    const caseDir = path.join(datasetsDir, caseId);
    const result = convertCase(caseDir, caseId);

    if (result) {
      results.push(result);

      // 패턴 수집
      for (const change of result.session.noteChanges) {
        if (change.changes.includes('pitch')) {
          const pattern = `${change.original.pitch} → ${change.final.pitch}`;
          pitchChangePatterns.set(pattern, (pitchChangePatterns.get(pattern) || 0) + 1);
        }
        if (change.changes.includes('duration')) {
          const pattern = `${change.original.slotCount}슬롯 → ${change.final.slotCount}슬롯`;
          durationChangePatterns.set(pattern, (durationChangePatterns.get(pattern) || 0) + 1);
        }
      }

      console.log(`[${caseId}] 변환 완료`);
      console.log(`  - 자동검출: ${result.summary.autoDetectedCount}개`);
      console.log(`  - 정답: ${result.summary.groundTruthCount}개`);
      console.log(`  - 변경 없음: ${result.summary.unchanged}개 (${result.summary.accuracy}%)`);

      // 디버그: 첫 번째 음표 비교
      if (result.session.autoDetectedNotes.length > 0 && result.session.finalEditedNotes.length > 0) {
        const auto0 = result.session.autoDetectedNotes[0];
        const gt0 = result.session.finalEditedNotes[0];
        console.log(`  📍 첫음 비교: 자동(m${auto0.measureIndex}:s${auto0.slotIndex} ${auto0.pitch}) vs 정답(m${gt0.measureIndex}:s${gt0.slotIndex} ${gt0.pitch})`)
      }
      console.log(`  - 음정 변경: ${result.summary.pitchChanged}개`);
      console.log(`  - 위치 변경: ${result.summary.positionChanged}개`);
      console.log(`  - 길이 변경: ${result.summary.durationChanged}개`);
      console.log(`  - 삭제: ${result.summary.deleted}개`);
      console.log(`  - 추가: ${result.summary.added}개`);
      console.log('');
    }
  }

  // ========================================
  // 전체 통계
  // ========================================
  console.log('========================================');
  console.log('전체 통계');
  console.log('========================================\n');

  const totals = results.reduce((acc, r) => ({
    autoDetected: acc.autoDetected + r.summary.autoDetectedCount,
    groundTruth: acc.groundTruth + r.summary.groundTruthCount,
    pitchChanged: acc.pitchChanged + r.summary.pitchChanged,
    positionChanged: acc.positionChanged + r.summary.positionChanged,
    durationChanged: acc.durationChanged + r.summary.durationChanged,
    deleted: acc.deleted + r.summary.deleted,
    added: acc.added + r.summary.added,
    unchanged: acc.unchanged + r.summary.unchanged,
  }), {
    autoDetected: 0, groundTruth: 0, pitchChanged: 0, positionChanged: 0,
    durationChanged: 0, deleted: 0, added: 0, unchanged: 0
  });

  const overallAccuracy = totals.autoDetected > 0
    ? (totals.unchanged / totals.autoDetected) * 100
    : 0;

  console.log(`총 케이스: ${results.length}개`);
  console.log(`총 자동검출 음표: ${totals.autoDetected}개`);
  console.log(`총 정답 음표: ${totals.groundTruth}개`);
  console.log(`총 변경 없음: ${totals.unchanged}개 (${overallAccuracy.toFixed(1)}%)`);
  console.log(`총 음정 변경: ${totals.pitchChanged}개`);
  console.log(`총 위치 변경: ${totals.positionChanged}개`);
  console.log(`총 길이 변경: ${totals.durationChanged}개`);
  console.log(`총 삭제: ${totals.deleted}개`);
  console.log(`총 추가: ${totals.added}개`);

  // ========================================
  // 패턴 분석
  // ========================================
  console.log('\n========================================');
  console.log('음정 변경 패턴 (Top 10)');
  console.log('========================================\n');

  const sortedPitchPatterns = [...pitchChangePatterns.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [pattern, count] of sortedPitchPatterns) {
    console.log(`  ${pattern}: ${count}회`);
  }

  console.log('\n========================================');
  console.log('길이 변경 패턴 (Top 10)');
  console.log('========================================\n');

  const sortedDurationPatterns = [...durationChangePatterns.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [pattern, count] of sortedDurationPatterns) {
    console.log(`  ${pattern}: ${count}회`);
  }

  // ========================================
  // JSON 출력 (Supabase 업로드용)
  // ========================================
  const outputPath = path.join(__dirname, 'feedbackSessions.json');
  const outputData = {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    totals,
    overallAccuracy: Math.round(overallAccuracy * 10) / 10,
    pitchChangePatterns: Object.fromEntries(sortedPitchPatterns),
    durationChangePatterns: Object.fromEntries(sortedDurationPatterns),
    sessions: results.map(r => r.session),
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`\n결과 저장: ${outputPath}`);

  // ========================================
  // 개선 제안
  // ========================================
  console.log('\n========================================');
  console.log('개선 제안');
  console.log('========================================\n');

  if (totals.pitchChanged > 0) {
    console.log('🎵 음정 오류 개선 포인트:');
    for (const [pattern, count] of sortedPitchPatterns.slice(0, 5)) {
      const [from, to] = pattern.split(' → ');
      const fromMidi = pitchToMidi(from);
      const toMidi = pitchToMidi(to);
      const diff = toMidi - fromMidi;
      const direction = diff > 0 ? '↑' : '↓';
      const semitones = Math.abs(diff);

      if (semitones === 12) {
        console.log(`  - ${pattern} (${count}회): 옥타브 오류 ${direction}`);
      } else if (semitones > 0) {
        console.log(`  - ${pattern} (${count}회): ${semitones}반음 ${direction}`);
      }
    }
  }

  if (totals.durationChanged > 0) {
    console.log('\n⏱️ 길이 오류 개선 포인트:');
    for (const [pattern, count] of sortedDurationPatterns.slice(0, 5)) {
      console.log(`  - ${pattern} (${count}회)`);
    }
  }

  if (totals.deleted > 0) {
    console.log(`\n🗑️ 삭제된 음표: ${totals.deleted}개`);
    console.log('  → False Positive 감소 필요 (OCCUPANCY_MIN 상향 검토)');
  }

  if (totals.added > 0) {
    console.log(`\n➕ 추가된 음표: ${totals.added}개`);
    console.log('  → False Negative 감소 필요 (OCCUPANCY_MIN 하향 또는 Gap Recovery 개선)');
  }
}

// 헬퍼: pitch → MIDI
function pitchToMidi(pitch: string): number {
  const NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = pitch.match(/^([A-G]#?)(\d)$/);
  if (!match) return -1;
  const [, note, octave] = match;
  const noteIndex = NOTE_ORDER.indexOf(note);
  if (noteIndex === -1) return -1;
  return (parseInt(octave) + 1) * 12 + noteIndex;
}

main();
