const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../utils/pitchToNote.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Check if Phase 74-D already exists
if (content.includes('Phase 74-D')) {
  console.log('Phase 74-D already exists');
  process.exit(0);
}

// Find the line after Phase 74-C log and before Phase 87
const marker = '// Phase 87: Intra-Note Split Detection';

if (!content.includes(marker)) {
  console.log('Phase 87 marker not found');
  process.exit(1);
}

const phase74DCode = `// ========================================
  // Phase 74-D: Fuzzy Pitch Merge (피치 오차 허용 병합)
  // ========================================
  // ±1반음 차이 음표도 병합하여 분열된 긴 음표 복구
  // Onset Detection이 만든 과도한 분열을 보정
  let fuzzyMergeCount = 0;
  for (let i = rawNotes.length - 1; i > 0; i--) {
    const currNote = rawNotes[i];
    const prevNote = rawNotes[i - 1];

    if (prevNote.isRest || currNote.isRest) continue;

    // 피치 차이 계산 (반음 단위)
    const prevMidi = pitchToMidi(prevNote.pitch);
    const currMidi = pitchToMidi(currNote.pitch);
    const pitchDiff = Math.abs(currMidi - prevMidi);

    // ±1반음 허용 (이미 같은 피치는 74-A에서 처리됨)
    if (pitchDiff !== 1) continue;

    // 이전 음의 끝 슬롯과 현재 음의 시작 슬롯 계산
    const prevEndSlot = prevNote.measureIndex * SLOTS_PER_MEASURE + prevNote.slotIndex + prevNote.slotCount;
    const currStartSlot = currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex;
    const gap = currStartSlot - prevEndSlot;

    // gap=0 또는 gap=1인 경우만 병합
    if (gap > 1) continue;

    const newSlotCount = prevNote.slotCount + (gap > 0 ? gap : 0) + currNote.slotCount;

    // MAX_MERGE_SLOTS 제한 체크
    if (newSlotCount > activeParams.MAX_MERGE_SLOTS) continue;

    // 더 긴 음표의 피치 선택 (또는 confidence가 높은 쪽)
    const mergedPitch = prevNote.slotCount >= currNote.slotCount ? prevNote.pitch : currNote.pitch;
    const mergedConfidence = (prevNote.confidence === 'high' || currNote.confidence === 'high') ? 'high' : 'medium';

    rawNotes[i - 1] = {
      ...prevNote,
      pitch: mergedPitch,
      slotCount: newSlotCount,
      duration: slotCountToDuration(newSlotCount),
      confidence: mergedConfidence
    };
    rawNotes.splice(i, 1);
    fuzzyMergeCount++;
  }
  if (fuzzyMergeCount > 0) {
    console.log(\`[Phase 74-D] Fuzzy Pitch Merge: \${fuzzyMergeCount}개 병합\`);
  }

  `;

// Insert Phase 74-D before Phase 87
content = content.replace(
  '// ========================================\n  // Phase 87: Intra-Note Split Detection',
  phase74DCode + '// ========================================\n  // Phase 87: Intra-Note Split Detection'
);

fs.writeFileSync(filePath, content);
console.log('Phase 74-D added successfully');
