const fs = require('fs');
const filePath = 'C:/JAMUS/hooks/useRecorder.ts';
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('Phase 104') && content.includes('Onset 기반')) {
  console.log('Phase 104 application already exists');
  process.exit(0);
}

// Find and replace using a simpler pattern
const oldPattern = /const adjustedStartTime = startTime - pullbackSeconds;/;
const newCode = `const pullbackAdjustedStartTime = startTime - pullbackSeconds;

                    // ========================================
                    // Phase 104: Onset Detection으로 첫 음 시작점 자동 보정
                    // ========================================
                    const onsetTime = detectOnsetTime(extractedBuffer, -35);
                    const adjustedStartTime = pullbackAdjustedStartTime + onsetTime;

                    console.log('🎤 [Phase 104] Onset 기반 시작점 보정:', {
                        pullbackAdjusted: pullbackAdjustedStartTime.toFixed(3) + 's',
                        onsetTime: (onsetTime * 1000).toFixed(1) + 'ms',
                        finalStartTime: adjustedStartTime.toFixed(3) + 's'
                    });`;

if (!oldPattern.test(content)) {
  console.log('Pattern not found');
  process.exit(1);
}

content = content.replace(oldPattern, newCode);
fs.writeFileSync(filePath, content);
console.log('Phase 104 onset adjustment applied');
