const fs = require('fs');
const filePath = 'C:/JAMUS/utils/pitchToNote.ts';
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('Phase 74-D')) {
  console.log('Already exists');
  process.exit(0);
}

// Use regex to match both \n and \r\n line endings
const markerRegex = /\/\/ ========================================\r?\n  \/\/ Phase 87: Intra-Note Split Detection/;

if (!markerRegex.test(content)) {
  console.log('Marker not found');
  process.exit(1);
}

const phase74D = `// ========================================
  // Phase 74-D: Fuzzy Pitch Merge
  // ========================================
  let fuzzyMergeCount = 0;
  for (let i = rawNotes.length - 1; i > 0; i--) {
    const currNote = rawNotes[i];
    const prevNote = rawNotes[i - 1];
    if (prevNote.isRest || currNote.isRest) continue;
    const prevMidi = pitchToMidi(prevNote.pitch);
    const currMidi = pitchToMidi(currNote.pitch);
    const pitchDiff = Math.abs(currMidi - prevMidi);
    if (pitchDiff !== 1) continue;
    const prevEndSlot = prevNote.measureIndex * SLOTS_PER_MEASURE + prevNote.slotIndex + prevNote.slotCount;
    const currStartSlot = currNote.measureIndex * SLOTS_PER_MEASURE + currNote.slotIndex;
    const gap = currStartSlot - prevEndSlot;
    if (gap > 1) continue;
    const newSlotCount = prevNote.slotCount + (gap > 0 ? gap : 0) + currNote.slotCount;
    if (newSlotCount > activeParams.MAX_MERGE_SLOTS) continue;
    const mergedPitch = prevNote.slotCount >= currNote.slotCount ? prevNote.pitch : currNote.pitch;
    const mergedConf = (prevNote.confidence === 'high' || currNote.confidence === 'high') ? 'high' : 'medium';
    rawNotes[i - 1] = { ...prevNote, pitch: mergedPitch, slotCount: newSlotCount, duration: slotCountToDuration(newSlotCount), confidence: mergedConf };
    rawNotes.splice(i, 1);
    fuzzyMergeCount++;
  }
  if (fuzzyMergeCount > 0) {
    console.log(\`[Phase 74-D] Fuzzy Pitch Merge: \${fuzzyMergeCount}개 병합\`);
  }

  `;

content = content.replace(markerRegex, phase74D + '// ========================================\n  // Phase 87: Intra-Note Split Detection');
fs.writeFileSync(filePath, content);
console.log('Phase 74-D added successfully');
