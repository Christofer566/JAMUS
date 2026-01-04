/**
 * 합성음 테스트 케이스만 실행
 * 순수 시스템 정확도 측정
 */

import fs from 'fs';
import path from 'path';
import { convertToNotes } from '../utils/pitchToNote.js';

const basePath = 'C:/JAMUS/tests/pitch-accuracy/datasets';
const SYNTHETIC_CASES = ['case_synth_01', 'case_synth_02', 'case_synth_03', 'case_synth_04'];

interface GTNote {
  pitch: string;
  measure: number;
  slot: number;
  duration: number;
}

interface DetectedNote {
  pitch: string;
  measureIndex: number;
  slotIndex: number;
  duration: string;  // "w", "h", "q", "8", "16" 등
  slotCount: number;
  isRest: boolean;
}

interface CaseResult {
  caseName: string;
  gtCount: number;
  detCount: number;
  matched: number;
  pitchCorrect: number;
  timingCorrect: number;
  durationCorrect: number;
}

function compareNotes(gtNotes: GTNote[], detNotes: DetectedNote[]): CaseResult & { details: string[] } {
  const details: string[] = [];
  let matched = 0;
  let pitchCorrect = 0;
  let timingCorrect = 0;
  let durationCorrect = 0;

  // GT 기준으로 매칭
  for (const gt of gtNotes) {
    const gtSlot = (gt.measure - 1) * 16 + gt.slot;

    // ±1 슬롯 허용 범위에서 매칭
    const match = detNotes.find(det => {
      const detSlot = det.measureIndex * 16 + det.slotIndex;
      return Math.abs(detSlot - gtSlot) <= 1;
    });

    if (match) {
      matched++;
      const detSlot = match.measureIndex * 16 + match.slotIndex;

      // 음정 체크 (옥타브 무시)
      const gtPitchClass = gt.pitch.replace(/\d/g, '');
      const detPitchClass = match.pitch.replace(/\d/g, '');
      const pitchMatch = gtPitchClass === detPitchClass;
      if (pitchMatch) pitchCorrect++;

      // 타이밍 체크 (±1 슬롯)
      const timingMatch = Math.abs(detSlot - gtSlot) <= 1;
      if (timingMatch) timingCorrect++;

      // 길이 체크 (±1 슬롯)
      const durationMatch = Math.abs(match.slotCount - gt.duration) <= 1;
      if (durationMatch) durationCorrect++;

      const status = pitchMatch && timingMatch && durationMatch ? '✅' : '⚠️';
      details.push(`${status} GT: ${gt.pitch} M${gt.measure}S${gt.slot} (${gt.duration}) → Det: ${match.pitch} M${match.measureIndex + 1}S${match.slotIndex} (${match.slotCount})`);
    } else {
      details.push(`❌ GT: ${gt.pitch} M${gt.measure}S${gt.slot} (${gt.duration}) → 미검출`);
    }
  }

  return {
    caseName: '',
    gtCount: gtNotes.length,
    detCount: detNotes.length,
    matched,
    pitchCorrect,
    timingCorrect,
    durationCorrect,
    details
  };
}

async function runCase(caseName: string): Promise<CaseResult | null> {
  const casePath = path.join(basePath, caseName);
  const framesPath = path.join(casePath, 'testFrames.json');
  const gtPath = path.join(casePath, 'groundTruth.json');

  if (!fs.existsSync(framesPath) || !fs.existsSync(gtPath)) {
    console.log(`Skip: ${caseName} - files not found`);
    return null;
  }

  const framesData = JSON.parse(fs.readFileSync(framesPath, 'utf8'));
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

  // 피치 검출
  const allNotes = convertToNotes(framesData.frames, gt.bpm);
  const detNotes = allNotes.filter((n: DetectedNote) => !n.isRest);

  console.log(`\n[${caseName}]`);
  console.log(`GT: ${gt.notes.length}개, 검출: ${detNotes.length}개`);

  const result = compareNotes(gt.notes, detNotes);
  result.caseName = caseName;

  // 상세 출력
  result.details.forEach(d => console.log(`  ${d}`));

  return result;
}

async function main() {
  console.log('\n========================================');
  console.log('순수 시스템 테스트 (합성음)');
  console.log('========================================');

  const results: CaseResult[] = [];

  for (const caseName of SYNTHETIC_CASES) {
    const result = await runCase(caseName);
    if (result) results.push(result);
  }

  // 요약
  console.log('\n========================================');
  console.log('결과 요약');
  console.log('========================================\n');

  console.log('| Case          | GT | Det | Match | Pitch  | Timing | Duration |');
  console.log('|---------------|----|----|-------|--------|--------|----------|');

  let totalGT = 0, totalMatched = 0, totalPitch = 0, totalTiming = 0, totalDuration = 0;

  for (const r of results) {
    const pitchPct = r.matched > 0 ? (r.pitchCorrect / r.matched * 100).toFixed(1) : '0.0';
    const timingPct = r.matched > 0 ? (r.timingCorrect / r.matched * 100).toFixed(1) : '0.0';
    const durationPct = r.matched > 0 ? (r.durationCorrect / r.matched * 100).toFixed(1) : '0.0';

    console.log(`| ${r.caseName.padEnd(13)} | ${r.gtCount.toString().padStart(2)} | ${r.detCount.toString().padStart(2)} | ${r.matched.toString().padStart(5)} | ${pitchPct.padStart(5)}% | ${timingPct.padStart(5)}% | ${durationPct.padStart(7)}% |`);

    totalGT += r.gtCount;
    totalMatched += r.matched;
    totalPitch += r.pitchCorrect;
    totalTiming += r.timingCorrect;
    totalDuration += r.durationCorrect;
  }

  console.log('|---------------|----|----|-------|--------|--------|----------|');

  const avgPitch = totalMatched > 0 ? (totalPitch / totalMatched * 100).toFixed(1) : '0.0';
  const avgTiming = totalMatched > 0 ? (totalTiming / totalMatched * 100).toFixed(1) : '0.0';
  const avgDuration = totalMatched > 0 ? (totalDuration / totalMatched * 100).toFixed(1) : '0.0';
  const recall = totalGT > 0 ? (totalMatched / totalGT * 100).toFixed(1) : '0.0';

  console.log(`| 전체          | ${totalGT.toString().padStart(2)} | -- | ${totalMatched.toString().padStart(5)} | ${avgPitch.padStart(5)}% | ${avgTiming.padStart(5)}% | ${avgDuration.padStart(7)}% |`);

  console.log('\n========================================');
  console.log(`회수율 (Recall): ${recall}% (${totalMatched}/${totalGT})`);
  console.log(`음정 정확도: ${avgPitch}%`);
  console.log(`타이밍 정확도: ${avgTiming}%`);
  console.log(`길이 정확도: ${avgDuration}%`);
  console.log(`종합: ${((parseFloat(avgPitch) + parseFloat(avgTiming) + parseFloat(avgDuration)) / 3).toFixed(1)}%`);
  console.log('========================================\n');
}

main().catch(console.error);
