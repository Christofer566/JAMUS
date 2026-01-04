const fs = require('fs');
const filePath = 'C:/JAMUS/hooks/useRecorder.ts';
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('Phase 105')) {
  console.log('Phase 105 already exists');
  process.exit(0);
}

const oldCode = `const PULLBACK_BUFFER_MS = 250; // 추가 버퍼 (250)`;
const newCode = `const PULLBACK_BUFFER_MS = 570; // 추가 버퍼 (250 + 320 시스템 지연) Phase 105`;

if (!content.includes(oldCode)) {
  console.log('Pattern not found');
  process.exit(1);
}

content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content);
console.log('Phase 105 applied: PULLBACK_BUFFER_MS 250 -> 570');
