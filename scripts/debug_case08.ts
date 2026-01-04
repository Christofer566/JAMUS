import fs from 'fs';
import path from 'path';
import { convertToNotes } from '../utils/pitchToNote.js';

const casePath = 'C:/JAMUS/tests/pitch-accuracy/datasets/case_08';
const framesPath = path.join(casePath, 'testFrames.json');
const gtPath = path.join(casePath, 'groundTruth.json');

const framesData = JSON.parse(fs.readFileSync(framesPath, 'utf8'));
const frames = framesData.frames;
const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

// Get startMeasure from GT (like batchRunner does)
const startMeasure = Math.min(...gt.notes.map((n: any) => n.measure));
console.log(`\nstartMeasure: ${startMeasure}`);

// Run pitch detection
const allNotes = convertToNotes(frames, gt.bpm);
const detectedNotes = allNotes.filter((n: any) => !n.isRest);

console.log(`\n=== case_08 Detection vs Ground Truth ===\n`);
console.log(`GT 음표: ${gt.notes.length}개`);
console.log(`검출 음표: ${detectedNotes.length}개\n`);

// Normalize GT and detection to global slot indices
interface GTSlot {
  globalSlot: number;
  pitch: string;
  duration: number;
}

interface DetSlot {
  globalSlot: number;
  pitch: string;
  duration: number;
}

const gtSlots: GTSlot[] = gt.notes.map((n: any) => ({
  globalSlot: (n.measure - startMeasure) * 16 + n.slot,
  pitch: n.pitch,
  duration: n.slots
}));

const detSlots: DetSlot[] = detectedNotes.map((n: any) => ({
  globalSlot: n.measureIndex * 16 + n.slotIndex,
  pitch: n.pitch,
  duration: n.slotCount
}));

console.log('=== Global Slot Comparison ===\n');
console.log('GT Slots:', gtSlots.map(s => `${s.pitch}@${s.globalSlot}(${s.duration})`).join(', '));
console.log('\nDet Slots:', detSlots.map(s => `${s.pitch}@${s.globalSlot}(${s.duration})`).join(', '));

// Match and analyze Duration
console.log('\n=== Duration Analysis (±1슬롯 타이밍 허용) ===\n');
let durationMatch = 0;
let totalMatched = 0;

const TIMING_TOLERANCE = 1;

for (const gts of gtSlots) {
  // Find best matching detected note within timing tolerance
  let bestMatch: DetSlot | null = null;
  let minDist = Infinity;

  for (const det of detSlots) {
    const dist = Math.abs(det.globalSlot - gts.globalSlot);
    if (dist <= TIMING_TOLERANCE && dist < minDist) {
      minDist = dist;
      bestMatch = det;
    }
  }

  if (bestMatch) {
    totalMatched++;
    const durationDiff = Math.abs(bestMatch.duration - gts.duration);

    if (durationDiff <= 1) {
      durationMatch++;
      console.log(`  OK: ${gts.pitch}@${gts.globalSlot} - GT:${gts.duration}슬롯 vs 검출:${bestMatch.duration}슬롯`);
    } else {
      console.log(`  MISS: ${gts.pitch}@${gts.globalSlot} - GT:${gts.duration}슬롯 vs 검출:${bestMatch.duration}슬롯 (diff=${durationDiff})`);
    }
  } else {
    console.log(`  NO MATCH: ${gts.pitch}@${gts.globalSlot} - GT:${gts.duration}슬롯`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`매칭: ${totalMatched}/${gtSlots.length} (${(totalMatched/gtSlots.length*100).toFixed(1)}%)`);
console.log(`Duration 정확도: ${durationMatch}/${totalMatched} (${totalMatched > 0 ? (durationMatch/totalMatched*100).toFixed(1) : 0}%)`);
