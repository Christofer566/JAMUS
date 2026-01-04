/**
 * Duration Error Analysis Script
 * case_08의 duration 오류 패턴을 상세 분석
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  convertToNotes as pitchToNoteConvert,
  setTunableParams,
} from '../../utils/pitchToNote';

// goldenSettings 로드
const testDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const goldenPath = path.join(testDir, 'goldenSettings75.json');
const goldenSettings = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
setTunableParams(goldenSettings.params);

// case_08 로드
const caseDir = path.join(testDir, 'datasets', 'case_08');
const framesData = JSON.parse(fs.readFileSync(path.join(caseDir, 'testFrames.json'), 'utf-8'));
const groundTruth = JSON.parse(fs.readFileSync(path.join(caseDir, 'groundTruth.json'), 'utf-8'));

// 피치 분석
const detected = pitchToNoteConvert(
  framesData.frames,
  framesData.bpm,
  { startMeasure: 9, measureCount: 8 }
).filter((n: any) => !n.isRest);

const gt = groundTruth.notes;
const startMeasure = Math.min(...gt.map((n: any) => n.measure));

// 매칭 및 분석
console.log('\n========================================');
console.log('  Duration Error Analysis (case_08)');
console.log('========================================\n');

const TIMING_TOLERANCE = 4;
const usedDetected = new Set<number>();
let totalDurationDiff = 0;
let durationErrors: { gt: any, dn: any, diff: number }[] = [];

for (const gtNote of gt) {
  const gtSlot = (gtNote.measure - startMeasure) * 16 + gtNote.slot;

  let bestMatch: { index: number; note: any; distance: number } | null = null;

  for (let i = 0; i < detected.length; i++) {
    if (usedDetected.has(i)) continue;

    const dn = detected[i];
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
    const dn = bestMatch.note;
    const durationDiff = dn.slotCount - gtNote.slots;
    totalDurationDiff += durationDiff;

    if (Math.abs(durationDiff) > 1) {
      durationErrors.push({
        gt: gtNote,
        dn: dn,
        diff: durationDiff
      });
    }

    console.log(`GT: ${gtNote.pitch.padEnd(4)} 마디${gtNote.measure} 슬롯${String(gtNote.slot).padStart(2)} 길이${gtNote.slots}`);
    console.log(`DN: ${dn.pitch.padEnd(4)} 마디${dn.measureIndex + 9} 슬롯${String(dn.slotIndex).padStart(2)} 길이${dn.slotCount}`);
    console.log(`   → 길이 차이: ${durationDiff > 0 ? '+' : ''}${durationDiff} ${Math.abs(durationDiff) <= 1 ? '✓' : '✗'}`);
    console.log('');
  } else {
    console.log(`GT: ${gtNote.pitch.padEnd(4)} 마디${gtNote.measure} 슬롯${String(gtNote.slot).padStart(2)} 길이${gtNote.slots} → MISSED`);
    console.log('');
  }
}

console.log('========================================');
console.log('  Summary');
console.log('========================================');
console.log(`총 GT 음표: ${gt.length}개`);
console.log(`매칭된 음표: ${usedDetected.size}개`);
console.log(`평균 길이 차이: ${(totalDurationDiff / usedDetected.size).toFixed(2)}슬롯`);
console.log(`±1 초과 오류: ${durationErrors.length}개`);
console.log('');

// 오류 패턴 분석
const tooShort = durationErrors.filter(e => e.diff < 0).length;
const tooLong = durationErrors.filter(e => e.diff > 0).length;
console.log(`너무 짧게 감지: ${tooShort}개`);
console.log(`너무 길게 감지: ${tooLong}개`);

// 길이별 오류 분포
console.log('\n길이별 오류 분포:');
const byGtLength: Record<number, number[]> = {};
durationErrors.forEach(e => {
  if (!byGtLength[e.gt.slots]) byGtLength[e.gt.slots] = [];
  byGtLength[e.gt.slots].push(e.diff);
});

Object.keys(byGtLength).sort((a, b) => Number(a) - Number(b)).forEach(len => {
  const diffs = byGtLength[Number(len)];
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  console.log(`  GT ${len}슬롯 → 평균 ${avgDiff > 0 ? '+' : ''}${avgDiff.toFixed(1)}슬롯 차이 (${diffs.length}개)`);
});
