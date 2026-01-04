const fs = require('fs');
const filePath = 'C:/JAMUS/app/(protected)/single/SingleClientPage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// webAudio.currentTime을 startPos로 변경
const oldPattern = /recorder\.startRecording\(recordStartTime, recordStartMeasure, webAudio\.currentTime\)/;
const newCode = `recorder.startRecording(recordStartTime, recordStartMeasure, startPos)`;

if (!oldPattern.test(content)) {
  console.log('Pattern not found - checking if already fixed');
  if (content.includes('startRecording(recordStartTime, recordStartMeasure, startPos)')) {
    console.log('Already fixed');
    process.exit(0);
  }
  process.exit(1);
}

content = content.replace(oldPattern, newCode);

// 주석도 업데이트
content = content.replace(
  'Phase 106: Playhead 기반 시작점을 위해 webAudio.currentTime 전달',
  'Phase 106: Playhead 기반 시작점 - seek 위치(startPos) 직접 전달'
);

fs.writeFileSync(filePath, content);
console.log('Fixed: webAudio.currentTime -> startPos');
