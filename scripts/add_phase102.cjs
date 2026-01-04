const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../utils/pitchToNote.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Check if Phase 102 already exists
if (content.includes('Phase 102')) {
  console.log('Phase 102 already exists');
  process.exit(0);
}

// Find the insertion point after Phase 86 console.log
const insertAfter = '    console.log(`[Phase 86] Duration Quantization: ${quantizeCount}개 음표 조정`);\n  }';
const insertBefore = '\n\n  // ========================================\n  // Phase 76:';

const phase102Code = `

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
  }`;

if (content.includes(insertAfter)) {
  content = content.replace(insertAfter + insertBefore, insertAfter + phase102Code + insertBefore);
  fs.writeFileSync(filePath, content);
  console.log('Phase 102 added successfully');
} else {
  console.log('Insert point not found');
}
