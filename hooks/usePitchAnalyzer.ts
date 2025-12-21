'use client';

import { useState, useCallback } from 'react';
import { PitchFrame } from '@/types/pitch';
import { getSharedAudioContext } from '@/utils/sharedAudioContext';

interface UsePitchAnalyzerReturn {
  isAnalyzing: boolean;
  error: string | null;
  analyzeAudio: (blob: Blob, prerollDuration?: number) => Promise<PitchFrame[]>;
}

export function usePitchAnalyzer(): UsePitchAnalyzerReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 오디오 blob을 분석하여 피치 프레임 배열 반환
   * @param blob - 분석할 오디오 blob
   * @param prerollDuration - preroll 시간 (0이면 이미 트리밍됨, 지연 보정 생략)
   */
  const analyzeAudio = useCallback(async (blob: Blob, prerollDuration: number = 0): Promise<PitchFrame[]> => {
    setError(null);
    setIsAnalyzing(true);

    console.log('[MacLeod] 분석 시작, blob size:', blob.size);
    const startTime = performance.now();

    try {
      // 1. 공유 AudioContext 사용 및 오디오 디코딩
      const audioContext = getSharedAudioContext();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      console.log('[MacLeod] 오디오 디코딩 완료:', {
        duration: audioBuffer.duration.toFixed(2) + 's',
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels
      });

      // 2. OfflineAudioContext로 모노 오디오 데이터 추출
      const offlineCtx = new OfflineAudioContext(
        1,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start();

      const renderedBuffer = await offlineCtx.startRendering();
      const channelData = renderedBuffer.getChannelData(0);
      const sampleRate = renderedBuffer.sampleRate;

      // 3. 프레임 단위 MacLeod 알고리즘 분석
      const frames: PitchFrame[] = [];
      const frameSize = 4096; // 2048 → 4096 (주파수 분해능 향상)
      const hopSize = 512;

      // 통계용 변수
      let rmsFilteredCount = 0;
      let validFreqCount = 0;
      let freqSum = 0;
      let minFreq = Infinity;
      let maxFreq = 0;

      // 디버깅: 앞부분 0~5초 구간 상세 로그
      const debugFrames: Array<{
        time: number;
        rms: number;
        freq: number;
        conf: number;
        reason: string;
      }> = [];

      for (let i = 0; i + frameSize < channelData.length; i += hopSize) {
        const frame = channelData.slice(i, i + frameSize);
        const time = i / sampleRate;

        // RMS로 무음 감지
        let rms = 0;
        for (let j = 0; j < frame.length; j++) {
          rms += frame[j] * frame[j];
        }
        rms = Math.sqrt(rms / frame.length);

        // 디버깅: 0~5초 구간 데이터 수집
        const isDebugRange = time < 5;

        if (rms < 0.005) { // 적절한 민감도
          frames.push({ time, frequency: 0, confidence: 0 });
          rmsFilteredCount++;
          if (isDebugRange) {
            debugFrames.push({ time, rms, freq: 0, conf: 0, reason: 'RMS < 0.005 (무음)' });
          }
          continue;
        }

        // MacLeod Pitch Method (MPM) 알고리즘
        const result = detectPitchMPM(frame, sampleRate);

        if (result.frequency > 80 && result.frequency < 2000 && result.confidence > 0.2) { // 정확도 유지
          frames.push({
            time,
            frequency: result.frequency,
            confidence: result.confidence
          });

          validFreqCount++;
          freqSum += result.frequency;
          minFreq = Math.min(minFreq, result.frequency);
          maxFreq = Math.max(maxFreq, result.frequency);

          if (isDebugRange) {
            debugFrames.push({ time, rms, freq: result.frequency, conf: result.confidence, reason: '유효' });
          }
        } else {
          frames.push({ time, frequency: 0, confidence: 0 });
          if (isDebugRange) {
            let reason = '';
            if (result.frequency <= 80) reason = `주파수 너무 낮음 (${result.frequency.toFixed(0)}Hz < 80)`;
            else if (result.frequency >= 2000) reason = `주파수 너무 높음 (${result.frequency.toFixed(0)}Hz > 2000)`;
            else if (result.confidence <= 0.2) reason = `신뢰도 낮음 (${result.confidence.toFixed(2)} < 0.2)`;
            else reason = `알 수 없음 (freq=${result.frequency.toFixed(0)}, conf=${result.confidence.toFixed(2)})`;
            debugFrames.push({ time, rms, freq: result.frequency, conf: result.confidence, reason });
          }
        }
      }

      // 디버깅: 0~5초 구간 로그 출력
      console.log('[MacLeod] 🔍 앞부분 0~5초 디버깅 (총 ' + debugFrames.length + '개 프레임):');
      // 0.5초 간격으로 샘플링하여 출력
      const sampleInterval = 0.5;
      let lastSampleTime = -sampleInterval;
      debugFrames.forEach((d, idx) => {
        if (d.time >= lastSampleTime + sampleInterval) {
          console.log(`  [${d.time.toFixed(2)}s] RMS=${d.rms.toFixed(4)}, freq=${d.freq.toFixed(0)}Hz, conf=${d.conf.toFixed(2)} → ${d.reason}`);
          lastSampleTime = d.time;
        }
      });

      // 앞부분 통계
      const first5secFrames = debugFrames;
      const first5secValid = first5secFrames.filter(d => d.reason === '유효').length;
      const first5secRmsFiltered = first5secFrames.filter(d => d.reason.includes('무음')).length;
      const first5secLowFreq = first5secFrames.filter(d => d.reason.includes('너무 낮음')).length;
      const first5secLowConf = first5secFrames.filter(d => d.reason.includes('신뢰도')).length;
      console.log('[MacLeod] 🔍 앞부분 0~5초 통계:', {
        총프레임: first5secFrames.length,
        유효: first5secValid,
        RMS무음: first5secRmsFiltered,
        주파수낮음: first5secLowFreq,
        신뢰도낮음: first5secLowConf
      });

      const avgFreq = validFreqCount > 0 ? freqSum / validFreqCount : 0;
      const passRatio = frames.length > 0
        ? ((validFreqCount / frames.length) * 100).toFixed(1)
        : '0';

      const elapsedTime = performance.now() - startTime;

      console.log('[MacLeod] 분석 완료:', {
        총프레임: frames.length,
        RMS필터링: rmsFilteredCount,
        유효주파수프레임: validFreqCount,
        주파수범위: validFreqCount > 0
          ? `${minFreq.toFixed(0)}~${maxFreq.toFixed(0)}Hz (평균: ${avgFreq.toFixed(0)}Hz)`
          : 'N/A',
        통과율: `${passRatio}% (목표: 40%+)`,
        소요시간: `${elapsedTime.toFixed(0)}ms`
      });

      // ========================================
      // 지연 보정 로직 제거됨 (2024.12)
      // ========================================
      // 이전: "첫 소리 감지" 기준으로 시간 이동 (RMS 기반)
      // 문제: 같은 타이밍으로 녹음해도 결과가 다름, 의도적인 쉼표가 사라짐
      //
      // 현재: useRecorder.ts에서 카운트다운 시간만큼 정확히 트리밍
      // 결과:
      // - blob 0초 = 녹음 시작 마디의 0박
      // - 사용자가 늦게 시작하면 → 앞부분이 쉼표로 표시됨
      // - 반박자 쉬고 들어가면 → 반박자 쉼표 + 음표 (일관된 결과)
      //
      // prerollDuration 파라미터는 더 이상 사용되지 않음 (하위 호환성 유지)
      console.log('[MacLeod] 지연 보정 없음 (카운트다운 기준 트리밍 완료)');

      // 공유 AudioContext는 닫지 않음
      return frames;

    } catch (err) {
      const message = err instanceof Error ? err.message : '음정 분석 실패';
      setError(message);
      console.error('[MacLeod] 분석 에러:', err);
      return [];
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  return { isAnalyzing, error, analyzeAudio };
}

/**
 * MacLeod Pitch Method (MPM) - McLeod와 Wyvill의 알고리즘
 * YIN보다 더 정확하고 빠름
 */
function detectPitchMPM(
  buffer: Float32Array,
  sampleRate: number
): { frequency: number; confidence: number } {
  const bufferSize = buffer.length;
  const cutoff = 0.5; // 정확도 유지

  // 1. Normalized Square Difference Function (NSDF)
  const nsdf = new Float32Array(bufferSize);

  for (let tau = 0; tau < bufferSize; tau++) {
    let acf = 0; // autocorrelation
    let divisorM = 0;

    for (let i = 0; i < bufferSize - tau; i++) {
      acf += buffer[i] * buffer[i + tau];
      divisorM += buffer[i] * buffer[i] + buffer[i + tau] * buffer[i + tau];
    }

    nsdf[tau] = divisorM > 0 ? (2 * acf) / divisorM : 0;
  }

  // 2. Peak picking - 양수 영역에서 피크 찾기
  const peaks: { tau: number; value: number }[] = [];
  let positiveZeroCrossing = false;

  for (let tau = 1; tau < bufferSize - 1; tau++) {
    // 음수에서 양수로 교차
    if (nsdf[tau - 1] < 0 && nsdf[tau] >= 0) {
      positiveZeroCrossing = true;
    }

    // 양수 영역에서 피크 감지
    if (positiveZeroCrossing) {
      if (nsdf[tau] > nsdf[tau - 1] && nsdf[tau] > nsdf[tau + 1]) {
        // 로컬 피크 발견
        if (nsdf[tau] > 0) {
          peaks.push({ tau, value: nsdf[tau] });
        }
      }
    }

    // 양수에서 음수로 교차하면 리셋
    if (nsdf[tau - 1] >= 0 && nsdf[tau] < 0) {
      positiveZeroCrossing = false;
    }
  }

  if (peaks.length === 0) {
    return { frequency: 0, confidence: 0 };
  }

  // 3. 가장 높은 피크 찾기
  let maxPeak = peaks[0];
  for (const peak of peaks) {
    if (peak.value > maxPeak.value) {
      maxPeak = peak;
    }
  }

  // 4. Cutoff 적용 - 첫 번째로 cutoff를 넘는 피크 사용
  let selectedPeak = maxPeak;
  const threshold = maxPeak.value * cutoff;

  for (const peak of peaks) {
    if (peak.value >= threshold) {
      selectedPeak = peak;
      break;
    }
  }

  // 5. Parabolic interpolation for better accuracy
  const tau = selectedPeak.tau;
  let betterTau = tau;

  if (tau > 0 && tau < bufferSize - 1) {
    const s0 = nsdf[tau - 1];
    const s1 = nsdf[tau];
    const s2 = nsdf[tau + 1];

    const denominator = 2 * s1 - s2 - s0;
    if (Math.abs(denominator) > 0.0001) {
      const adjustment = (s2 - s0) / (2 * denominator);
      if (Math.abs(adjustment) < 1) {
        betterTau = tau + adjustment;
      }
    }
  }

  // 6. 주파수 계산
  const frequency = betterTau > 0 ? sampleRate / betterTau : 0;
  const confidence = selectedPeak.value;

  return { frequency, confidence };
}

export default usePitchAnalyzer;
