/**
 * 특정 케이스 상세 분석
 * GT vs 검출 결과 1:1 비교
 */

import * as fs from 'fs';
import * as path from 'path';
import { convertToNotes, setTunableParams } from '../../utils/pitchToNote';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function pitchToMidi(pitch: string): number {
  if (pitch === 'rest') return -1;
  const match = pitch.match(/^([A-G])([#b]?)(\d)$/);
  if (!match) return -1;
  const [, noteName, accidental, octave] = match;
  const noteIndex = NOTE_NAMES.indexOf(noteName + (accidental === '#' ? '#' : ''));
  if (noteIndex === -1) return -1;
  return (parseInt(octave) + 1) * 12 + noteIndex;
}

interface GTNote {
  measure: number;
  slot: number;
  pitch: string;
  slots: number;
}

interface DetNote {
  pitch: string;
  measureIndex: number;
  slotIndex: number;
  slotCount: number;
  isRest: boolean;
}

function analyzeCase(caseName: string) {
  const basePath = 'C:/JAMUS/tests/pitch-accuracy/datasets';
  const casePath = path.join(basePath, caseName);

  // Load golden settings
  const goldenPath = 'C:/JAMUS/tests/pitch-accuracy/goldenSettings75.json';
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  setTunableParams(golden.params);

  const framesData = JSON.parse(fs.readFileSync(path.join(casePath, 'testFrames.json'), 'utf8'));
  const gtData = JSON.parse(fs.readFileSync(path.join(casePath, 'groundTruth.json'), 'utf8'));

  const gtNotes: GTNote[] = gtData.notes;
  const startMeasure = Math.min(...gtNotes.map(n => n.measure));

  // 검출 실행
  const allNotes = convertToNotes(framesData.frames, framesData.bpm, 'Gm');
  const detNotes: DetNote[] = allNotes.filter((n: DetNote) => !n.isRest);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${caseName} 상세 분석`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\nGT: ${gtNotes.length}개 음표, 검출: ${detNotes.length}개 음표`);
  console.log(`시작 마디: ${startMeasure}`);

  // GT Duration 분포
  const gtDurations: Record<number, number> = {};
  for (const n of gtNotes) {
    gtDurations[n.slots] = (gtDurations[n.slots] || 0) + 1;
  }
  console.log(`\n[GT Duration 분포]`);
  for (const [slots, count] of Object.entries(gtDurations).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${slots}슬롯: ${count}개`);
  }

  // 검출 Duration 분포
  const detDurations: Record<number, number> = {};
  for (const n of detNotes) {
    detDurations[n.slotCount] = (detDurations[n.slotCount] || 0) + 1;
  }
  console.log(`\n[검출 Duration 분포]`);
  for (const [slots, count] of Object.entries(detDurations).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${slots}슬롯: ${count}개`);
  }

  // 1:1 매칭 분석
  console.log(`\n[GT vs 검출 상세 비교]`);
  console.log(`${'─'.repeat(70)}`);

  const TIMING_TOLERANCE = 4;
  const usedDet = new Set<number>();

  let durationErrors: { gt: GTNote; det: DetNote; diff: number }[] = [];
  let pitchErrors: { gt: GTNote; det: DetNote; midiDiff: number }[] = [];
  let missed: GTNote[] = [];

  for (const gt of gtNotes) {
    const gtSlot = (gt.measure - startMeasure) * 16 + gt.slot;

    let bestMatch: { idx: number; det: DetNote; dist: number } | null = null;

    for (let i = 0; i < detNotes.length; i++) {
      if (usedDet.has(i)) continue;
      const det = detNotes[i];
      const detSlot = det.measureIndex * 16 + det.slotIndex;
      const dist = Math.abs(detSlot - gtSlot);

      if (dist <= TIMING_TOLERANCE) {
        if (!bestMatch || dist < bestMatch.dist) {
          bestMatch = { idx: i, det, dist };
        }
      }
    }

    if (bestMatch) {
      usedDet.add(bestMatch.idx);
      const det = bestMatch.det;
      const durationDiff = det.slotCount - gt.slots;
      const gtMidi = pitchToMidi(gt.pitch);
      const detMidi = pitchToMidi(det.pitch);
      const midiDiff = detMidi - gtMidi;

      const pitchOk = Math.abs(midiDiff) <= 1 || Math.abs(midiDiff) === 12;
      const durationOk = Math.abs(durationDiff) <= 1;

      let status = '✅';
      if (!pitchOk && !durationOk) status = '❌❌';
      else if (!pitchOk) status = '❌P';
      else if (!durationOk) status = '❌D';

      const gtPos = `M${gt.measure}S${gt.slot}`;
      const detPos = `M${det.measureIndex + startMeasure}S${det.slotIndex}`;

      console.log(`${status} GT: ${gt.pitch.padEnd(4)} ${gtPos.padEnd(8)} (${gt.slots}슬롯) → Det: ${det.pitch.padEnd(4)} ${detPos.padEnd(8)} (${det.slotCount}슬롯) [D:${durationDiff >= 0 ? '+' : ''}${durationDiff}]`);

      if (!durationOk) {
        durationErrors.push({ gt, det, diff: durationDiff });
      }
      if (!pitchOk) {
        pitchErrors.push({ gt, det, midiDiff });
      }
    } else {
      console.log(`❌M GT: ${gt.pitch.padEnd(4)} M${gt.measure}S${gt.slot} (${gt.slots}슬롯) → 미검출`);
      missed.push(gt);
    }
  }

  // 오류 분석
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`[오류 분석]`);

  // Duration 오류 패턴
  if (durationErrors.length > 0) {
    console.log(`\nDuration 오류: ${durationErrors.length}개`);

    let tooShort = 0, tooLong = 0;
    let shortByHow: Record<number, number> = {};
    let longByHow: Record<number, number> = {};

    for (const e of durationErrors) {
      if (e.diff < 0) {
        tooShort++;
        shortByHow[e.diff] = (shortByHow[e.diff] || 0) + 1;
      } else {
        tooLong++;
        longByHow[e.diff] = (longByHow[e.diff] || 0) + 1;
      }
    }

    console.log(`  - 너무 짧게 검출: ${tooShort}개`);
    for (const [diff, count] of Object.entries(shortByHow).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      console.log(`    ${diff}슬롯 차이: ${count}개`);
    }

    console.log(`  - 너무 길게 검출: ${tooLong}개`);
    for (const [diff, count] of Object.entries(longByHow).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      console.log(`    +${diff}슬롯 차이: ${count}개`);
    }

    // 긴 음표 오류 패턴
    const longNoteErrors = durationErrors.filter(e => e.gt.slots >= 8);
    if (longNoteErrors.length > 0) {
      console.log(`\n  [긴 음표(≥8슬롯) 오류 패턴]`);
      for (const e of longNoteErrors) {
        console.log(`    ${e.gt.pitch} GT=${e.gt.slots}슬롯 → Det=${e.det.slotCount}슬롯 (${e.diff >= 0 ? '+' : ''}${e.diff})`);
      }
    }
  }

  // 미검출 패턴
  if (missed.length > 0) {
    console.log(`\n미검출: ${missed.length}개`);
    for (const m of missed) {
      console.log(`  ${m.pitch} M${m.measure}S${m.slot} (${m.slots}슬롯)`);
    }
  }

  // 과잉 검출 (GT에 없는 검출)
  const extraDet = detNotes.filter((_, i) => !usedDet.has(i));
  if (extraDet.length > 0) {
    console.log(`\n과잉 검출: ${extraDet.length}개`);
    for (const e of extraDet) {
      console.log(`  ${e.pitch} M${e.measureIndex + startMeasure}S${e.slotIndex} (${e.slotCount}슬롯)`);
    }
  }
}

// 실행
const cases = process.argv.slice(2);
if (cases.length === 0) {
  analyzeCase('case_05');
  analyzeCase('case_08');
} else {
  for (const c of cases) {
    analyzeCase(c);
  }
}
