const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../utils/pitchToNote.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Find the Phase 86 section and enhance it
const phase86Regex = /\/\/ Phase 86: Duration Quantization\s*\n\s*\/\/ ========================================\s*\n\s*\/\/ 감지된 slotCount를 가장 가까운 표준 음표 길이로 조정\s*\n\s*\/\/ ±1 슬롯 오류를 줄여 duration 정확도 개선/;

if (phase86Regex.test(content)) {
  content = content.replace(phase86Regex,
`// Phase 86+103: Duration Quantization (개선)
  // ========================================
  // Phase 103: 1-2슬롯 음표는 4슬롯으로 확장 편향 (Onset Detection 분할 보정)`);
  console.log('Phase 86 header updated to include Phase 103');
}

// Update the quantization logic
const oldLogic = `    // 가장 가까운 표준 길이 찾기
    let bestDuration = note.slotCount;
    let minDiff = Infinity;

    for (const std of STANDARD_DURATIONS) {
      const diff = Math.abs(note.slotCount - std);
      if (diff < minDiff) {
        minDiff = diff;
        bestDuration = std;
      }
    }

    // ±1 슬롯 차이만 조정 (과도한 변경 방지)
    if (minDiff === 1 && bestDuration !== note.slotCount) {`;

const newLogic = `    let bestDuration = note.slotCount;
    let minDiff = Infinity;
    const isShortNote = note.slotCount <= 2;

    for (const std of STANDARD_DURATIONS) {
      const diff = Math.abs(note.slotCount - std);
      // Phase 103: 짧은 음표(1-2슬롯)는 4슬롯으로 확장 편향
      const adjustedDiff = (isShortNote && std === 4) ? diff - 3 : diff;
      if (adjustedDiff < minDiff) {
        minDiff = adjustedDiff;
        bestDuration = std;
      }
    }

    // Phase 103: 짧은 음표는 ±3슬롯, 일반 음표는 ±2슬롯까지 조정
    const actualDiff = Math.abs(note.slotCount - bestDuration);
    const maxAllowedDiff = isShortNote ? 3 : 2;
    if (actualDiff <= maxAllowedDiff && bestDuration !== note.slotCount) {`;

if (content.includes(oldLogic)) {
  content = content.replace(oldLogic, newLogic);
  console.log('Duration quantization logic updated');
}

// Add Phase 102 after Phase 86 console.log
const phase86Log = `  if (quantizeCount > 0) {
    console.log(\`[Phase 86] Duration Quantization: \${quantizeCount}개 음표 조정\`);
  }

  // ========================================
  // Phase 76:`;

const phase102Block = `  if (quantizeCount > 0) {
    console.log(\`[Phase 86] Duration Quantization: \${quantizeCount}개 음표 조정\`);
  }

  // ========================================
  // Phase 102: Overlap Removal (겹침 제거)
  // ========================================
  let overlapFixCount = 0;
  for (let i = 0; i < splitNotes.length - 1; i++) {
    const currNote = splitNotes[i];
    const nextNote = splitNotes[i + 1];
    if (currNote.isRest || nextNote.isRest) continue;

    const currEnd = currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex + currNote.slotCount;
    const nextStart = nextNote.measureIndex * SLOTS_PER_MEASURE + nextNote.slotIndex;

    if (currEnd > nextStart) {
      const newSlotCount = Math.max(1, nextStart - (currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex));
      splitNotes[i] = { ...currNote, slotCount: newSlotCount, duration: slotCountToDuration(newSlotCount) };
      overlapFixCount++;
    }
  }
  if (overlapFixCount > 0) {
    console.log(\`[Phase 102] Overlap Removal: \${overlapFixCount}개 겹침 수정\`);
  }

  // ========================================
  // Phase 76:`;

if (content.includes(phase86Log) && !content.includes('Phase 102')) {
  content = content.replace(phase86Log, phase102Block);
  console.log('Phase 102 added');
}

fs.writeFileSync(filePath, content);
console.log('pitchToNote.ts updated successfully');
