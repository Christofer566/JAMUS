const fs = require('fs');
const filePath = 'C:/JAMUS/hooks/useRecorder.ts';
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('Phase 104')) {
  console.log('Phase 104 already exists');
  process.exit(0);
}

// Use regex to handle both \n and \r\n
const markerRegex = /\/\/ Helper: Convert AudioBuffer to WAV Blob/;

if (!markerRegex.test(content)) {
  console.log('Marker not found');
  process.exit(1);
}

const phase104Code = `// ============================================
// Phase 104: Recording Onset Detection
// 녹음된 오디오에서 실제 첫 음 시작점 자동 감지
// ============================================
function detectOnsetTime(buffer: AudioBuffer, thresholdDb: number = -40): number {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.01); // 10ms window
    const threshold = Math.pow(10, thresholdDb / 20); // dB to linear

    for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
        let sumSquares = 0;
        for (let j = 0; j < windowSize; j++) {
            sumSquares += channelData[i + j] * channelData[i + j];
        }
        const rms = Math.sqrt(sumSquares / windowSize);

        if (rms > threshold) {
            const onsetTime = i / sampleRate;
            console.log('🎤 [Phase 104] Onset Detection:', {
                onsetSample: i,
                onsetTime: onsetTime.toFixed(3) + 's',
                rms: rms.toFixed(4),
                threshold: threshold.toFixed(4)
            });
            return onsetTime;
        }
    }

    console.log('🎤 [Phase 104] Onset Detection: 전체 구간 무음');
    return 0;
}

// ============================================
`;

content = content.replace(
  '// Helper: Convert AudioBuffer to WAV Blob',
  phase104Code + '// Helper: Convert AudioBuffer to WAV Blob'
);

fs.writeFileSync(filePath, content);
console.log('Phase 104 Onset Detection added');
