const fs = require('fs');
const filePath = 'C:/JAMUS/app/(protected)/single/SingleClientPage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// webAudio.isPlaying을 isPlaying으로 변경
const oldPattern = /if \(!webAudio\.isPlaying \|\| recorder\.state !== 'recorded' \|\| recorder\.segments\.length === 0\)/;
const newCode = `if (!isPlaying || recorder.state !== 'recorded' || recorder.segments.length === 0)`;

if (!oldPattern.test(content)) {
  console.log('Pattern not found - checking if already fixed');
  if (content.includes('if (!isPlaying || recorder.state')) {
    console.log('Already fixed');
    process.exit(0);
  }
  console.log('Pattern not found');
  process.exit(1);
}

content = content.replace(oldPattern, newCode);
fs.writeFileSync(filePath, content);
console.log('Fixed: webAudio.isPlaying -> isPlaying (React state)');
