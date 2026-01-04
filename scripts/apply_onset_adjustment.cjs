const fs = require('fs');
const filePath = 'C:/JAMUS/hooks/useRecorder.ts';
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('Phase 104 적용')) {
  console.log('Phase 104 application already exists');
  process.exit(0);
}

const oldCode = `const adjustedStartTime = startTime - pullbackSeconds;

                    console.log('🎤 [Phase 53] Segment 시간 조정:', {`;

const newCode = `const pullbackAdjustedStartTime = startTime - pullbackSeconds;

                    // ========================================
                    // Phase 104: Onset Detection으로 첫 음 시작점 자동 보정
                    // 추출된 오디오에서 실제 첫 음이 시작하는 지점을 감지하여
                    // startTime을 추가로 조정 (싱크 정확도 향상)
                    // ========================================
                    const onsetTime = detectOnsetTime(extractedBuffer, -35);
                    const adjustedStartTime = pullbackAdjustedStartTime + onsetTime;

                    console.log('🎤 [Phase 104 적용] Onset 기반 시작점 보정:', {
                        pullbackAdjusted: pullbackAdjustedStartTime.toFixed(3) + 's',
                        onsetTime: onsetTime.toFixed(3) + 's',
                        finalStartTime: adjustedStartTime.toFixed(3) + 's',
                        note: onsetTime > 0 ? '첫 음 시작점으로 조정됨' : '즉시 시작 (무음 없음)'
                    });

                    console.log('🎤 [Phase 53] Segment 시간 조정:', {`;

if (!content.includes(oldCode)) {
  console.log('Old code pattern not found');
  process.exit(1);
}

content = content.replace(oldCode, newCode);
fs.writeFileSync(filePath, content);
console.log('Phase 104 application added');
