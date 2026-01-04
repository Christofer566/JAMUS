/**
 * 테스트 케이스에서 시스템 지연 분석
 * GT 첫 음 vs 검출 첫 음의 슬롯 차이를 계산하여 공통 오프셋 찾기
 */

import fs from 'fs';
import path from 'path';
import { convertToNotes } from '../utils/pitchToNote.js';

const basePath = 'C:/JAMUS/tests/pitch-accuracy/datasets';
const cases = ['case_02', 'case_03', 'case_04', 'case_05', 'case_06', 'case_07', 'case_08', 'case_09'];

interface TimingAnalysis {
  caseName: string;
  gtFirstSlot: number;
  detFirstSlot: number;
  slotDiff: number;  // 양수 = 검출이 늦음, 음수 = 검출이 빠름
  gtFirstPitch: string;
  detFirstPitch: string;
}

async function analyzeCase(caseName: string): Promise<TimingAnalysis | null> {
  const framesPath = path.join(basePath, caseName, 'testFrames.json');
  const gtPath = path.join(basePath, caseName, 'groundTruth.json');

  if (!fs.existsSync(framesPath) || !fs.existsSync(gtPath)) {
    console.log(`Skipping ${caseName}: files not found`);
    return null;
  }

  const framesData = JSON.parse(fs.readFileSync(framesPath, 'utf8'));
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

  // GT 첫 음 정보
  const gtNotes = gt.notes;
  const startMeasure = Math.min(...gtNotes.map((n: any) => n.measure));
  const gtFirstNote = gtNotes.find((n: any) => n.measure === startMeasure);
  const gtFirstSlot = (gtFirstNote.measure - startMeasure) * 16 + gtFirstNote.slot;

  // 검출 결과
  const allNotes = convertToNotes(framesData.frames, gt.bpm);
  const detNotes = allNotes.filter((n: any) => !n.isRest);

  if (detNotes.length === 0) {
    console.log(`Skipping ${caseName}: no detected notes`);
    return null;
  }

  // 검출 첫 음 정보
  const detFirstNote = detNotes[0];
  const detFirstSlot = detFirstNote.measureIndex * 16 + detFirstNote.slotIndex;

  return {
    caseName,
    gtFirstSlot,
    detFirstSlot,
    slotDiff: detFirstSlot - gtFirstSlot,
    gtFirstPitch: gtFirstNote.pitch,
    detFirstPitch: detFirstNote.pitch
  };
}

async function main() {
  console.log('\n=== 시스템 지연 분석 (GT 첫음 vs 검출 첫음) ===\n');

  const results: TimingAnalysis[] = [];

  for (const caseName of cases) {
    const result = await analyzeCase(caseName);
    if (result) {
      results.push(result);
    }
  }

  console.log('| Case     | GT첫슬롯 | 검출첫슬롯 | 차이(슬롯) | GT피치 | 검출피치 |');
  console.log('|----------|----------|------------|------------|--------|----------|');

  for (const r of results) {
    const diffStr = r.slotDiff > 0 ? `+${r.slotDiff}` : `${r.slotDiff}`;
    console.log(`| ${r.caseName} | ${r.gtFirstSlot.toString().padStart(8)} | ${r.detFirstSlot.toString().padStart(10)} | ${diffStr.padStart(10)} | ${r.gtFirstPitch.padStart(6)} | ${r.detFirstPitch.padStart(8)} |`);
  }

  // 통계
  const diffs = results.map(r => r.slotDiff);
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const medianDiff = [...diffs].sort((a, b) => a - b)[Math.floor(diffs.length / 2)];

  console.log('\n=== 통계 ===');
  console.log(`평균 차이: ${avgDiff.toFixed(2)}슬롯`);
  console.log(`중앙값 차이: ${medianDiff}슬롯`);
  console.log(`범위: ${Math.min(...diffs)} ~ ${Math.max(...diffs)}슬롯`);

  // 1슬롯 = BPM에 따라 다름, 대략 계산
  // BPM 142 기준: 1슬롯 = 60/142/4 = 0.1056초 = 105.6ms
  const msPerSlot = 105.6;
  console.log(`\n=== 시간 환산 (BPM 142 기준, 1슬롯 ≈ ${msPerSlot}ms) ===`);
  console.log(`평균 차이: ${(avgDiff * msPerSlot).toFixed(1)}ms`);
  console.log(`중앙값 차이: ${(medianDiff * msPerSlot).toFixed(1)}ms`);

  if (avgDiff > 0) {
    console.log(`\n→ 검출 결과가 평균 ${(avgDiff * msPerSlot).toFixed(1)}ms 늦게 시작됨`);
    console.log(`→ PULLBACK_BUFFER_MS를 ${Math.round(avgDiff * msPerSlot)}ms 추가로 늘리면 보정됨`);
  } else if (avgDiff < 0) {
    console.log(`\n→ 검출 결과가 평균 ${Math.abs(avgDiff * msPerSlot).toFixed(1)}ms 빠르게 시작됨`);
  } else {
    console.log(`\n→ 평균적으로 싱크가 맞음`);
  }
}

main().catch(console.error);
