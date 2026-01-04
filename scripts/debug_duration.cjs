const fs = require('fs');
const path = require('path');

// Read batch runner results (we'll run a simpler version)
const casePath = 'C:/JAMUS/tests/pitch-accuracy/datasets/case_08';
const gtPath = path.join(casePath, 'groundTruth.json');

const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

console.log('\n=== case_08 Ground Truth Duration Analysis ===\n');

// Count duration distribution
const durationCounts = {};
gt.notes.forEach(note => {
  const slots = note.slots;
  durationCounts[slots] = (durationCounts[slots] || 0) + 1;
});

console.log('GT Duration Distribution:');
Object.entries(durationCounts).sort((a,b) => Number(a[0]) - Number(b[0])).forEach(([slots, count]) => {
  console.log(`  ${slots}슬롯: ${count}개 (${(count/gt.notes.length*100).toFixed(1)}%)`);
});

console.log('\n=== GT Notes with Short Duration (1-3 slots) ===\n');
gt.notes.filter(n => n.slots <= 3).forEach(note => {
  console.log(`  M${note.measure} S${note.slot}: ${note.pitch} - ${note.slots}슬롯`);
});

console.log('\nTotal notes:', gt.notes.length);
console.log('Short duration notes (<=3 slots):', gt.notes.filter(n => n.slots <= 3).length);
