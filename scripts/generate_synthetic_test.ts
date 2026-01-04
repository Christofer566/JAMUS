/**
 * 순수 시스템 테스트를 위한 합성음 테스트 케이스 생성
 *
 * Ground Truth를 기반으로 정확한 타이밍의 프레임 데이터 생성
 * 사람 오차 = 0, 순수 시스템 정확도만 측정
 */

import fs from 'fs';
import path from 'path';

// 음표 → 주파수 변환
const NOTE_FREQUENCIES: Record<string, number> = {
  'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31,
  'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61,
  'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23,
  'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46,
};

interface SyntheticNote {
  pitch: string;      // 예: "C4"
  measure: number;    // 1-based
  slot: number;       // 0-15 (16분음표 기준)
  duration: number;   // 슬롯 단위 (1 = 16분음표, 4 = 4분음표)
}

interface FrameData {
  time: number;
  frequency: number;
  confidence: number;
}

function generateSyntheticFrames(
  notes: SyntheticNote[],
  bpm: number,
  totalMeasures: number
): FrameData[] {
  const SAMPLE_RATE = 16000;
  const HOP_SIZE = 512;
  const FRAMES_PER_SECOND = SAMPLE_RATE / HOP_SIZE;
  const TIME_PER_FRAME = HOP_SIZE / SAMPLE_RATE;

  // 시간 계산
  const secondsPerBeat = 60 / bpm;
  const secondsPerMeasure = secondsPerBeat * 4; // 4/4 박자
  const secondsPerSlot = secondsPerMeasure / 16;

  const totalDuration = totalMeasures * secondsPerMeasure;
  const totalFrames = Math.ceil(totalDuration * FRAMES_PER_SECOND);

  console.log(`[Synthetic] BPM: ${bpm}, 총 ${totalMeasures}마디, ${totalFrames}프레임`);
  console.log(`[Synthetic] 1슬롯 = ${(secondsPerSlot * 1000).toFixed(1)}ms`);

  // 빈 프레임 배열 초기화 (time 필드 포함)
  const frames: FrameData[] = Array(totalFrames).fill(null).map((_, i) => ({
    time: i * TIME_PER_FRAME,
    frequency: 0,
    confidence: 0
  }));

  // Onset gap: 음표 시작 시 짧은 무음으로 onset 생성 (1프레임 = ~32ms)
  const ONSET_GAP_FRAMES = 1;

  // 각 음표를 프레임에 배치
  for (const note of notes) {
    const freq = NOTE_FREQUENCIES[note.pitch];
    if (!freq) {
      console.warn(`[Synthetic] 알 수 없는 음: ${note.pitch}`);
      continue;
    }

    // 시작 시간 계산 (초)
    const startTime = (note.measure - 1) * secondsPerMeasure + note.slot * secondsPerSlot;
    const endTime = startTime + note.duration * secondsPerSlot;

    // 프레임 인덱스 계산 (onset gap 적용)
    const startFrame = Math.floor(startTime * FRAMES_PER_SECOND) + ONSET_GAP_FRAMES;
    const endFrame = Math.floor(endTime * FRAMES_PER_SECOND);

    console.log(`[Synthetic] ${note.pitch}: M${note.measure}S${note.slot} (${note.duration}슬롯) → 프레임 ${startFrame}-${endFrame}`);

    // 해당 프레임에 주파수 설정 (time 유지, onset gap 후부터)
    for (let i = startFrame; i < endFrame && i < totalFrames; i++) {
      frames[i].frequency = freq;
      frames[i].confidence = 0.95;
    }
  }

  return frames;
}

function generateGroundTruth(notes: SyntheticNote[], bpm: number) {
  return {
    bpm,
    notes: notes.map(n => ({
      pitch: n.pitch,
      measure: n.measure,
      slot: n.slot,
      duration: n.duration
    }))
  };
}

// ========================================
// 테스트 케이스 정의
// ========================================

// case_synth_01: 단순 스케일 (4분음표) - C3~G3 범위
const SYNTH_CASE_01: SyntheticNote[] = [
  { pitch: 'C3', measure: 1, slot: 0, duration: 4 },
  { pitch: 'D3', measure: 1, slot: 4, duration: 4 },
  { pitch: 'E3', measure: 1, slot: 8, duration: 4 },
  { pitch: 'F3', measure: 1, slot: 12, duration: 4 },
  { pitch: 'G3', measure: 2, slot: 0, duration: 4 },
  { pitch: 'F3', measure: 2, slot: 4, duration: 4 },
  { pitch: 'E3', measure: 2, slot: 8, duration: 4 },
  { pitch: 'D3', measure: 2, slot: 12, duration: 4 },
];

// case_synth_02: 혼합 리듬 (4분음표 + 8분음표) - C3~G3 범위
const SYNTH_CASE_02: SyntheticNote[] = [
  { pitch: 'C3', measure: 1, slot: 0, duration: 4 },   // 4분음표
  { pitch: 'E3', measure: 1, slot: 4, duration: 2 },   // 8분음표
  { pitch: 'G3', measure: 1, slot: 6, duration: 2 },   // 8분음표
  { pitch: 'E3', measure: 1, slot: 8, duration: 8 },   // 2분음표
  { pitch: 'G3', measure: 2, slot: 0, duration: 4 },
  { pitch: 'E3', measure: 2, slot: 4, duration: 4 },
  { pitch: 'C3', measure: 2, slot: 8, duration: 8 },
];

// case_synth_03: 쉼표 포함 - C3~G3 범위
const SYNTH_CASE_03: SyntheticNote[] = [
  { pitch: 'C3', measure: 1, slot: 0, duration: 4 },
  // slot 4-7: 쉼표
  { pitch: 'E3', measure: 1, slot: 8, duration: 4 },
  // slot 12-15: 쉼표
  { pitch: 'G3', measure: 2, slot: 0, duration: 4 },
  // slot 4-7: 쉼표
  { pitch: 'E3', measure: 2, slot: 8, duration: 8 },
];

// case_synth_04: 16분음표 - C3~G3 범위
const SYNTH_CASE_04: SyntheticNote[] = [
  { pitch: 'C3', measure: 1, slot: 0, duration: 1 },
  { pitch: 'D3', measure: 1, slot: 1, duration: 1 },
  { pitch: 'E3', measure: 1, slot: 2, duration: 1 },
  { pitch: 'F3', measure: 1, slot: 3, duration: 1 },
  { pitch: 'G3', measure: 1, slot: 4, duration: 4 },
  { pitch: 'F3', measure: 1, slot: 8, duration: 2 },
  { pitch: 'E3', measure: 1, slot: 10, duration: 2 },
  { pitch: 'D3', measure: 1, slot: 12, duration: 4 },
];

const TEST_CASES = [
  { name: 'case_synth_01', notes: SYNTH_CASE_01, bpm: 120, measures: 2, desc: '단순 스케일 (4분음표)' },
  { name: 'case_synth_02', notes: SYNTH_CASE_02, bpm: 120, measures: 2, desc: '혼합 리듬 (4분+8분)' },
  { name: 'case_synth_03', notes: SYNTH_CASE_03, bpm: 120, measures: 2, desc: '쉼표 포함' },
  { name: 'case_synth_04', notes: SYNTH_CASE_04, bpm: 120, measures: 2, desc: '16분음표' },
];

async function main() {
  const basePath = 'C:/JAMUS/tests/pitch-accuracy/datasets';

  console.log('\n========================================');
  console.log('합성음 테스트 케이스 생성');
  console.log('========================================\n');

  for (const testCase of TEST_CASES) {
    console.log(`\n[${testCase.name}] ${testCase.desc}`);
    console.log('-'.repeat(40));

    const casePath = path.join(basePath, testCase.name);

    // 디렉토리 생성
    if (!fs.existsSync(casePath)) {
      fs.mkdirSync(casePath, { recursive: true });
    }

    // 프레임 생성
    const frames = generateSyntheticFrames(testCase.notes, testCase.bpm, testCase.measures);

    // Ground Truth 생성
    const groundTruth = generateGroundTruth(testCase.notes, testCase.bpm);

    // 파일 저장 (기존 테스트 케이스와 동일한 형식)
    fs.writeFileSync(
      path.join(casePath, 'testFrames.json'),
      JSON.stringify({
        bpm: testCase.bpm,
        frameCount: frames.length,
        frames
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(casePath, 'groundTruth.json'),
      JSON.stringify(groundTruth, null, 2)
    );

    console.log(`✅ 저장 완료: ${casePath}`);
    console.log(`   프레임 수: ${frames.length}`);
    console.log(`   음표 수: ${testCase.notes.length}`);
  }

  console.log('\n========================================');
  console.log('생성 완료! 배치 테스트 실행:');
  console.log('npx tsx tests/pitch-accuracy/batchRunner.ts');
  console.log('========================================\n');
}

main().catch(console.error);
