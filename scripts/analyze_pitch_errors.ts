/**
 * Pitch Error Pattern Analysis
 * 케이스별 피치 오류 패턴 분석
 */

import * as fs from 'fs';
import * as path from 'path';
import { convertToNotes, pitchToMidi, setTunableParams } from '../utils/pitchToNote.js';

const basePath = 'C:/JAMUS/tests/pitch-accuracy/datasets';
const cases = ['case_02', 'case_03', 'case_04', 'case_05', 'case_06', 'case_07', 'case_08', 'case_09'];

// Load golden settings
const goldenPath = 'C:/JAMUS/tests/pitch-accuracy/goldenSettings75.json';
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
setTunableParams(golden.params);

interface ErrorPattern {
  octaveUp: number;      // +10~14 semitones (octave up)
  octaveDown: number;    // -10~14 semitones (octave down)
  fifthError: number;    // ±5~7 semitones (5th confusion)
  thirdError: number;    // ±3~4 semitones (3rd confusion)
  smallError: number;    // ±1~2 semitones
  exact: number;         // 0 semitones (correct)
}

function classifyError(diff: number): keyof ErrorPattern {
  const abs = Math.abs(diff);
  if (abs === 0) return 'exact';
  if (abs >= 10 && abs <= 14) return diff > 0 ? 'octaveUp' : 'octaveDown';
  if (abs >= 5 && abs <= 7) return 'fifthError';
  if (abs >= 3 && abs <= 4) return 'thirdError';
  return 'smallError';
}

interface OctaveErrorDetail {
  caseName: string;
  gtPitch: string;
  detPitch: string;
  diff: number;
  slot: string;
}

async function main() {
  const totalErrors: ErrorPattern = {
    octaveUp: 0, octaveDown: 0, fifthError: 0, thirdError: 0, smallError: 0, exact: 0
  };

  const caseResults: { name: string; errors: ErrorPattern; total: number }[] = [];
  const octaveErrors: OctaveErrorDetail[] = [];

  for (const caseName of cases) {
    const casePath = path.join(basePath, caseName);
    const framesData = JSON.parse(fs.readFileSync(path.join(casePath, 'testFrames.json'), 'utf8'));
    const gt = JSON.parse(fs.readFileSync(path.join(casePath, 'groundTruth.json'), 'utf8'));

    const allNotes = convertToNotes(framesData.frames, gt.bpm);
    const detNotes = allNotes.filter((n: any) => !n.isRest);

    const caseErrors: ErrorPattern = {
      octaveUp: 0, octaveDown: 0, fifthError: 0, thirdError: 0, smallError: 0, exact: 0
    };

    // GT의 시작 마디 계산
    const startMeasure = Math.min(...gt.notes.map((n: any) => n.measure));

    for (const gtNote of gt.notes) {
      const gtSlot = (gtNote.measure - startMeasure) * 16 + gtNote.slot;

      const match = detNotes.find((det: any) => {
        const detSlot = det.measureIndex * 16 + det.slotIndex;
        return Math.abs(detSlot - gtSlot) <= 1;
      });

      if (match) {
        const gtMidi = pitchToMidi(gtNote.pitch);
        const detMidi = pitchToMidi(match.pitch);
        const diff = detMidi - gtMidi;
        const category = classifyError(diff);
        caseErrors[category]++;
        totalErrors[category]++;

        // Record octave errors for detailed analysis
        if (category === 'octaveUp' || category === 'octaveDown') {
          octaveErrors.push({
            caseName,
            gtPitch: gtNote.pitch,
            detPitch: match.pitch,
            diff,
            slot: 'M' + gtNote.measure + 'S' + gtNote.slot
          });
        }
      }
    }

    const total = Object.values(caseErrors).reduce((a, b) => a + b, 0);
    caseResults.push({ name: caseName, errors: caseErrors, total });
  }

  console.log('\n========================================');
  console.log('  PITCH ERROR PATTERN ANALYSIS');
  console.log('========================================\n');

  console.log('| Case     | Exact | +/-2 | +/-4 | +/-6 | 8ve+ | 8ve- | Total |');
  console.log('|----------|-------|------|------|------|------|------|-------|');

  for (const r of caseResults) {
    const e = r.errors;
    const name = r.name.padEnd(8);
    const exact = String(e.exact).padStart(5);
    const small = String(e.smallError).padStart(4);
    const third = String(e.thirdError).padStart(4);
    const fifth = String(e.fifthError).padStart(4);
    const octUp = String(e.octaveUp).padStart(4);
    const octDn = String(e.octaveDown).padStart(4);
    const tot = String(r.total).padStart(5);
    console.log('| ' + name + ' | ' + exact + ' | ' + small + ' | ' + third + ' | ' + fifth + ' | ' + octUp + ' | ' + octDn + ' | ' + tot + ' |');
  }

  const t = totalErrors;
  const grandTotal = Object.values(t).reduce((a, b) => a + b, 0);
  console.log('|----------|-------|------|------|------|------|------|-------|');
  const tExact = String(t.exact).padStart(5);
  const tSmall = String(t.smallError).padStart(4);
  const tThird = String(t.thirdError).padStart(4);
  const tFifth = String(t.fifthError).padStart(4);
  const tOctUp = String(t.octaveUp).padStart(4);
  const tOctDn = String(t.octaveDown).padStart(4);
  const tTot = String(grandTotal).padStart(5);
  console.log('| TOTAL    | ' + tExact + ' | ' + tSmall + ' | ' + tThird + ' | ' + tFifth + ' | ' + tOctUp + ' | ' + tOctDn + ' | ' + tTot + ' |');

  console.log('\n[오류 비율]');
  console.log('  - 정확: ' + t.exact + ' (' + (t.exact/grandTotal*100).toFixed(1) + '%)');
  console.log('  - +/-1~2반음: ' + t.smallError + ' (' + (t.smallError/grandTotal*100).toFixed(1) + '%)');
  console.log('  - +/-3~4반음: ' + t.thirdError + ' (' + (t.thirdError/grandTotal*100).toFixed(1) + '%)');
  console.log('  - +/-5~7반음: ' + t.fifthError + ' (' + (t.fifthError/grandTotal*100).toFixed(1) + '%)');
  console.log('  - 옥타브+: ' + t.octaveUp + ' (' + (t.octaveUp/grandTotal*100).toFixed(1) + '%)');
  console.log('  - 옥타브-: ' + t.octaveDown + ' (' + (t.octaveDown/grandTotal*100).toFixed(1) + '%)');

  const fixableErrors = t.octaveUp + t.octaveDown;
  console.log('\n[개선 가능성]');
  console.log('  옥타브 오류 수정 시: +' + (fixableErrors/grandTotal*100).toFixed(1) + '% 개선 가능');

  // Print detailed octave errors
  console.log('\n========================================');
  console.log('  OCTAVE ERROR DETAILS');
  console.log('========================================\n');

  const byCase: Record<string, OctaveErrorDetail[]> = {};
  for (const e of octaveErrors) {
    if (!byCase[e.caseName]) byCase[e.caseName] = [];
    byCase[e.caseName].push(e);
  }

  for (const [caseName, errors] of Object.entries(byCase)) {
    console.log('[' + caseName + '] ' + errors.length + ' octave errors:');
    for (const e of errors) {
      const direction = e.diff > 0 ? '+' : '';
      console.log('  ' + e.slot + ': GT=' + e.gtPitch + ' -> Det=' + e.detPitch + ' (' + direction + e.diff + ' semitones)');
    }
    console.log('');
  }
}

main().catch(console.error);
