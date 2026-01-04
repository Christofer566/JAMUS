/**
 * Phase 106: Playhead 기반 녹음 시작점 동기화
 *
 * 변경 사항:
 * 1. startRecording()에 audioContextTime 파라미터 추가
 * 2. blobStartAudioTimeRef로 저장
 * 3. stopRecording에서 정확한 시작점 계산: startTime - blobStartAudioTime
 * 4. Pull-back 추측 제거
 */

const fs = require('fs');

// ========================================
// 1. useRecorder.ts 수정
// ========================================
const recorderPath = 'C:/JAMUS/hooks/useRecorder.ts';
let recorderContent = fs.readFileSync(recorderPath, 'utf8');

if (recorderContent.includes('Phase 106')) {
  console.log('Phase 106 already exists in useRecorder.ts');
} else {
  // 1-1. blobStartAudioTimeRef 추가 (recordingBlobStartRef 다음에)
  const refPattern = /const recordingBlobStartRef = useRef<number>\(0\);/;
  const refReplacement = `const recordingBlobStartRef = useRef<number>(0);
    // Phase 106: Playhead 기반 시작점 - MediaRecorder 시작 시의 audioContext.currentTime
    const blobStartAudioTimeRef = useRef<number>(0);`;

  if (!refPattern.test(recorderContent)) {
    console.log('recordingBlobStartRef pattern not found');
    process.exit(1);
  }
  recorderContent = recorderContent.replace(refPattern, refReplacement);

  // 1-2. startRecording 시그니처 변경
  const startSigPattern = /const startRecording = useCallback\(async \(\s*startTime: number,\s*\/\/ 음악 타임라인 기준 녹음 시작 시간 \(카운트다운 끝나는 시점\)\s*startMeasure: number\s*\/\/ 녹음 시작 마디\s*\): Promise<boolean>/;
  const startSigReplacement = `const startRecording = useCallback(async (
        startTime: number,      // 음악 타임라인 기준 녹음 시작 시간 (카운트다운 끝나는 시점)
        startMeasure: number,   // 녹음 시작 마디
        audioContextTime: number = 0  // Phase 106: MediaRecorder 시작 시 webAudio.currentTime
    ): Promise<boolean>`;

  if (!startSigPattern.test(recorderContent)) {
    console.log('startRecording signature pattern not found');
    process.exit(1);
  }
  recorderContent = recorderContent.replace(startSigPattern, startSigReplacement);

  // 1-3. startRecording 내부에서 blobStartAudioTimeRef 저장
  const blobStartPattern = /recordingBlobStartRef\.current = blobStartTime;\s*actualStartMarkerRef\.current = 0;/;
  const blobStartReplacement = `recordingBlobStartRef.current = blobStartTime;
            // Phase 106: Playhead 기반 시작점 - 오디오 컨텍스트 시간 저장
            blobStartAudioTimeRef.current = audioContextTime;
            actualStartMarkerRef.current = 0;`;

  if (!blobStartPattern.test(recorderContent)) {
    console.log('blobStartTime pattern not found');
    process.exit(1);
  }
  recorderContent = recorderContent.replace(blobStartPattern, blobStartReplacement);

  // 1-4. stopRecording에서 Pull-back 대신 Phase 106 사용
  const pullbackPattern = /\/\/ ========================================\s*\/\/ Phase 55: Pull-back[\s\S]*?const startMarker = Math\.max\(0, rawStartMarker - pullbackSeconds\);[\s\S]*?console\.log\('🎤 \[Phase 55 Pull-back\] 적용:[\s\S]*?\}\);/;

  const phase106Replacement = `// ========================================
                    // Phase 106: Playhead 기반 정확한 시작점 계산
                    // Pull-back 추측 제거 - webAudio 시간 기반 직접 계산
                    // ========================================
                    // startTime = 녹음 영역 시작 시간 (음악 타임라인)
                    // blobStartAudioTimeRef = MediaRecorder 시작 시 webAudio.currentTime
                    // 차이 = blob에서 녹음 영역이 시작하는 정확한 위치
                    const startMarker = Math.max(0, startTime - blobStartAudioTimeRef.current);

                    console.log('🎤 [Phase 106] Playhead 기반 시작점:', {
                        녹음영역시작: startTime.toFixed(3) + 's',
                        blob시작시_오디오시간: blobStartAudioTimeRef.current.toFixed(3) + 's',
                        계산된시작점: startMarker.toFixed(3) + 's (blob 기준)',
                        rawStartMarker: rawStartMarker.toFixed(3) + 's (참고용)',
                        note: 'Pull-back 추측 제거, webAudio 시간 기반 직접 계산'
                    });`;

  if (!pullbackPattern.test(recorderContent)) {
    console.log('Pull-back pattern not found');
    process.exit(1);
  }
  recorderContent = recorderContent.replace(pullbackPattern, phase106Replacement);

  // 1-5. UseRecorderReturn 인터페이스 업데이트
  const interfacePattern = /startRecording: \(startTime: number, startMeasure: number\) => Promise<boolean>;/;
  const interfaceReplacement = `startRecording: (startTime: number, startMeasure: number, audioContextTime?: number) => Promise<boolean>;`;

  if (!interfacePattern.test(recorderContent)) {
    console.log('interface pattern not found');
    process.exit(1);
  }
  recorderContent = recorderContent.replace(interfacePattern, interfaceReplacement);

  fs.writeFileSync(recorderPath, recorderContent);
  console.log('useRecorder.ts updated with Phase 106');
}

// ========================================
// 2. SingleClientPage.tsx 수정 - startRecording 호출에 webAudio.currentTime 추가
// ========================================
const singlePath = 'C:/JAMUS/app/(protected)/single/SingleClientPage.tsx';
let singleContent = fs.readFileSync(singlePath, 'utf8');

if (singleContent.includes('Phase 106') && singleContent.includes('webAudio.currentTime')) {
  console.log('Phase 106 already exists in SingleClientPage.tsx');
} else {
  // 2-1. startRecording 호출 변경
  const callPattern = /const started = await recorder\.startRecording\(recordStartTime, recordStartMeasure\);/;
  const callReplacement = `// Phase 106: Playhead 기반 시작점을 위해 webAudio.currentTime 전달
                const started = await recorder.startRecording(recordStartTime, recordStartMeasure, webAudio.currentTime);`;

  if (!callPattern.test(singleContent)) {
    console.log('startRecording call pattern not found');
    process.exit(1);
  }
  singleContent = singleContent.replace(callPattern, callReplacement);

  fs.writeFileSync(singlePath, singleContent);
  console.log('SingleClientPage.tsx updated with Phase 106');
}

console.log('\n✅ Phase 106 applied successfully!');
console.log('   - startRecording now takes audioContextTime parameter');
console.log('   - stopRecording calculates exact start point: startTime - blobStartAudioTime');
console.log('   - Pull-back guessing removed');
