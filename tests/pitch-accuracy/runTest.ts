/**
 * Self-Refining Pitch Accuracy Test Runner
 *
 * 사용법:
 * 1. 브라우저 콘솔에서 window.exportTestFrames() 실행하여 testFrames.json 저장
 * 2. testFrames.json을 tests/pitch-accuracy/ 폴더에 복사
 * 3. npx ts-node tests/pitch-accuracy/runTest.ts 실행
 */

import * as fs from 'fs';
import * as path from 'path';

// 음정 매칭 허용 범위 (반음 단위)
const PITCH_TOLERANCE = 1;

// 타입 정의
interface PitchFrame {
  time: number;
  frequency: number;
  confidence: number;
  isMpmCorrected?: boolean;
  originalFrequency?: number;
  correctionFactor?: number;
}

interface GroundTruthNote {
  measure: number;
  slot: number;
  pitch: string;
  slots: number;
}

interface DetectedNote {
  pitch: string;
  measureIndex: number;
  slotIndex: number;
  slotCount: number;
  isRest: boolean;
}

interface TestResult {
  pitchAccuracy: number;
  timingAccuracy: number;
  durationAccuracy: number;
  missedNotes: number;
  extraNotes: number;
  details: string[];
}

// 상수
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// MIDI 변환
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

// 정확도 계산
function calculateAccuracy(
  detected: DetectedNote[],
  groundTruth: GroundTruthNote[],
  startMeasure: number
): TestResult {
  const details: string[] = [];
  let pitchMatch = 0;
  let timingMatch = 0;
  let durationMatch = 0;
  let matched = 0;

  const detectedNotes = detected.filter(n => !n.isRest);

  // 각 정답 음표에 대해 매칭 시도
  const usedDetected = new Set<number>();

  for (const gt of groundTruth) {
    const gtSlot = (gt.measure - startMeasure) * 16 + gt.slot;

    // 가장 가까운 감지된 음표 찾기 (±2슬롯 이내)
    let bestMatch: { index: number; note: DetectedNote; distance: number } | null = null;

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

      // 음정 비교 (PITCH_TOLERANCE 적용)
      if (Math.abs(gtMidi - dnMidi) <= PITCH_TOLERANCE) {
        pitchMatch++;
      } else {
        details.push(`음정오류: ${gt.pitch}→${dn.pitch} (${dnMidi - gtMidi}반음) @마디${gt.measure}`);
      }

      // 타이밍 비교
      const dnSlot = dn.measureIndex * 16 + dn.slotIndex;
      const gtSlotPos = (gt.measure - startMeasure) * 16 + gt.slot;
      if (dnSlot === gtSlotPos) {
        timingMatch++;
      }

      // 길이 비교
      if (dn.slotCount === gt.slots) {
        durationMatch++;
      }
    } else {
      details.push(`놓침: ${gt.pitch}(${gt.slots}슬롯) @마디${gt.measure}슬롯${gt.slot}`);
    }
  }

  // 잘못 추가된 음표
  const extraNotes = detectedNotes.length - usedDetected.size;

  return {
    pitchAccuracy: matched > 0 ? (pitchMatch / matched) * 100 : 0,
    timingAccuracy: matched > 0 ? (timingMatch / matched) * 100 : 0,
    durationAccuracy: matched > 0 ? (durationMatch / matched) * 100 : 0,
    missedNotes: groundTruth.length - matched,
    extraNotes,
    details
  };
}

// 메인 테스트 함수
async function runTest() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Self-Refining Pitch Accuracy Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 파일 경로
  const testDir = path.dirname(__filename);
  const framesPath = path.join(testDir, 'testFrames.json');
  const groundTruthPath = path.join(testDir, 'groundTruth.json');

  // 파일 존재 확인
  if (!fs.existsSync(framesPath)) {
    console.error('❌ testFrames.json이 없습니다!');
    console.log('👉 브라우저 콘솔에서 window.exportTestFrames() 실행 후');
    console.log('   다운로드된 파일을 tests/pitch-accuracy/ 폴더에 복사하세요.');
    return;
  }

  if (!fs.existsSync(groundTruthPath)) {
    console.error('❌ groundTruth.json이 없습니다!');
    return;
  }

  // 데이터 로드
  const framesData = JSON.parse(fs.readFileSync(framesPath, 'utf-8'));
  const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, 'utf-8'));

  console.log(`📊 테스트 데이터: ${framesData.frameCount} 프레임, ${groundTruth.notes.length} 정답 음표`);
  console.log(`🎵 BPM: ${framesData.bpm}`);

  // 여기서 convertToNotes를 직접 호출하려면 모듈 임포트가 필요
  // 현재는 결과 비교만 수행 (실제 구현에서는 convertToNotes 호출)

  console.log('\n⚠️ 실제 테스트를 위해서는 convertToNotes 함수 호출 필요');
  console.log('   브라우저에서 테스트하거나 모듈 번들링 설정 필요');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// 실행
runTest().catch(console.error);
