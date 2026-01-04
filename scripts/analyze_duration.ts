/**
 * Duration 문제 분석
 * 가장 낮은 케이스들의 GT vs 검출 비교
 */

import fs from 'fs';
import path from 'path';
import { convertToNotes } from '../utils/pitchToNote.js';

const basePath = 'C:/JAMUS/tests/pitch-accuracy/datasets';
const PROBLEM_CASES = ['case_08', 'case_04', 'case_09'];

interface GTNote {
  pitch: string;
  measure: number;
  slot: number;
  slots: number;  // GT에서는 'slots'로 저장됨
}

interface DetNote {
  pitch: string;
  measureIndex: number;
  slotIndex: number;
  duration: number;
  slotCount: number;
  isRest: boolean;
}

async function analyzeCase(caseName: string) {
  const casePath = path.join(basePath, caseName);
  const framesData = JSON.parse(fs.readFileSync(path.join(casePath, 'testFrames.json'), 'utf8'));
  const gt = JSON.parse(fs.readFileSync(path.join(casePath, 'groundTruth.json'), 'utf8'));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${caseName}] Duration 분석`);
  console.log('='.repeat(60));

  // 검출
  const allNotes = convertToNotes(framesData.frames, gt.bpm);
  const detNotes = allNotes.filter((n: DetNote) => !n.isRest);

  // GT Duration 분포
  const gtDurations: Record<number, number> = {};
  for (const note of gt.notes) {
    gtDurations[note.slots] = (gtDurations[note.slots] || 0) + 1;
  }

  // 검출 Duration 분포
  const detDurations: Record<number, number> = {};
  for (const note of detNotes) {
    detDurations[note.slotCount] = (detDurations[note.slotCount] || 0) + 1;
  }

  console.log('\n[Duration 분포 비교]');
  console.log('| 슬롯 | GT 개수 | 검출 개수 | 차이 |');
  console.log('|------|---------|-----------|------|');

  const allDurations = new Set([...Object.keys(gtDurations), ...Object.keys(detDurations)].map(Number));
  for (const dur of [...allDurations].sort((a, b) => a - b)) {
    const gtCount = gtDurations[dur] || 0;
    const detCount = detDurations[dur] || 0;
    const diff = detCount - gtCount;
    const diffStr = diff > 0 ? `+${diff}` : diff.toString();
    console.log(`| ${dur.toString().padStart(4)} | ${gtCount.toString().padStart(7)} | ${detCount.toString().padStart(9)} | ${diffStr.padStart(4)} |`);
  }

  // 상세 비교 (매칭된 음표)
  console.log('\n[상세 비교 - Duration 오류]');
  let durationErrors = 0;
  let totalMatched = 0;

  for (const gtNote of gt.notes as GTNote[]) {
    const gtSlot = (gtNote.measure - 1) * 16 + gtNote.slot;

    // ±1 슬롯 허용 범위에서 매칭
    const match = detNotes.find((det: DetNote) => {
      const detSlot = det.measureIndex * 16 + det.slotIndex;
      return Math.abs(detSlot - gtSlot) <= 1;
    });

    if (match) {
      totalMatched++;
      const durationDiff = match.slotCount - gtNote.slots;

      if (Math.abs(durationDiff) > 1) {
        durationErrors++;
        const sign = durationDiff > 0 ? '+' : '';
        console.log(`  ❌ ${gtNote.pitch} M${gtNote.measure}S${gtNote.slot}: GT=${gtNote.slots}슬롯, Det=${match.slotCount}슬롯 (${sign}${durationDiff})`);
      }
    }
  }

  const durationAccuracy = totalMatched > 0 ? ((totalMatched - durationErrors) / totalMatched * 100).toFixed(1) : '0.0';
  console.log(`\n[요약] Duration 정확도: ${durationAccuracy}% (오류 ${durationErrors}/${totalMatched})`);

  // 주요 문제 패턴 분석
  console.log('\n[문제 패턴]');

  // 긴 음이 쪼개진 경우 (검출이 GT보다 짧음)
  const tooShort = detNotes.filter((d: DetNote) => d.slotCount <= 2).length;
  const gtLong = (gt.notes as GTNote[]).filter(g => g.slots >= 4).length;

  // 짧은 음이 합쳐진 경우 (검출이 GT보다 김)
  const tooLong = detNotes.filter((d: DetNote) => d.slotCount >= 8).length;
  const gtShort = (gt.notes as GTNote[]).filter(g => g.slots <= 2).length;

  console.log(`  - GT에서 긴 음(≥4슬롯): ${gtLong}개`);
  console.log(`  - 검출에서 짧은 음(≤2슬롯): ${tooShort}개`);
  console.log(`  - GT에서 짧은 음(≤2슬롯): ${gtShort}개`);
  console.log(`  - 검출에서 긴 음(≥8슬롯): ${tooLong}개`);

  if (tooShort > gtShort) {
    console.log(`  → 문제: 긴 음이 쪼개짐 (fragmentation)`);
  }
  if (tooLong > gtLong) {
    console.log(`  → 문제: 짧은 음이 합쳐짐 (over-merge)`);
  }
}

async function main() {
  console.log('Duration 문제 분석 시작...\n');

  for (const caseName of PROBLEM_CASES) {
    await analyzeCase(caseName);
  }

  console.log('\n' + '='.repeat(60));
  console.log('분석 완료');
  console.log('='.repeat(60));
}

main().catch(console.error);
