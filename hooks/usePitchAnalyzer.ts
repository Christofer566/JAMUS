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
      // Phase 52: Multi-Window Analysis - 저음역대 하이브리드 분석
      const frames: PitchFrame[] = [];
      const frameSize = 4096; // 기본 윈도우 (시간 분해능 유지)
      const frameSizeLong = 8192; // Phase 52: 긴 윈도우 (저음 주파수 정밀도)
      const hopSize = 512;
      const LOW_FREQ_THRESHOLD = 220; // 220Hz 이하면 긴 윈도우로 재분석

      // 통계용 변수
      let rmsFilteredCount = 0;
      let validFreqCount = 0;
      let freqSum = 0;
      let minFreq = Infinity;
      let maxFreq = 0;

      // Phase 52: 연속성 가중치를 위한 이전 프레임 주파수 추적
      let prevValidFreq = 0;
      let multiWindowUsedCount = 0;
      let continuityAdjustCount = 0;

      // Phase 62: 앙상블 통계
      let ensembleUsedCount = 0;

      // 디버깅: 앞부분 0~5초 구간 상세 로그
      const debugFrames: Array<{
        time: number;
        rms: number;
        freq: number;
        conf: number;
        reason: string;
      }> = [];

      for (let i = 0; i + frameSizeLong < channelData.length; i += hopSize) {
        const frame = channelData.slice(i, i + frameSize);
        const frameLong = channelData.slice(i, i + frameSizeLong); // Phase 52: 긴 윈도우
        const time = i / sampleRate;

        // RMS로 무음 감지
        let rms = 0;
        for (let j = 0; j < frame.length; j++) {
          rms += frame[j] * frame[j];
        }
        rms = Math.sqrt(rms / frame.length);

        // 디버깅: 0~5초 구간 데이터 수집
        const isDebugRange = time < 5;

        // Phase 55: 저음역대(200Hz 이하) RMS 임계값 낮춤 (0.008)
        // 저음은 에너지가 낮아서 일반 임계값으로는 놓치기 쉬움
        const RMS_THRESHOLD_NORMAL = 0.005;
        const RMS_THRESHOLD_LOW_FREQ = 0.008; // 저음용 (더 민감)

        // 일단 기본 임계값으로 체크, 저음 감지 후 재평가
        if (rms < RMS_THRESHOLD_LOW_FREQ) { // 저음 임계값보다도 낮으면 완전 무음
          frames.push({ time, frequency: 0, confidence: 0 });
          rmsFilteredCount++;
          if (isDebugRange) {
            debugFrames.push({ time, rms, freq: 0, conf: 0, reason: 'RMS < 0.008 (완전 무음)' });
          }
          continue;
        }

        // 저음 구간(0.008~0.005)은 일단 분석 진행 (저음일 수 있음)
        const isLowRmsZone = rms >= RMS_THRESHOLD_LOW_FREQ && rms < RMS_THRESHOLD_NORMAL;

        // ========================================
        // Phase 62: MPM + YIN + HPS 앙상블 분석
        // ========================================
        let result = detectPitchEnsemble(frame, sampleRate);

        // ========================================
        // Phase 52: Multi-Window Analysis (55차 황금 설정 유지)
        // 220Hz 이하 저음역대 감지 시 긴 윈도우로 재분석
        // ========================================
        if (result.frequency > 0 && result.frequency <= LOW_FREQ_THRESHOLD && result.confidence >= 0.3) {
          const resultLong = detectPitchEnsemble(frameLong, sampleRate);

          // 긴 윈도우 결과가 더 신뢰할 만하면 채택
          if (resultLong.confidence >= result.confidence * 0.9) {
            const freqDiffShort = prevValidFreq > 0 ? Math.abs(result.frequency - prevValidFreq) : 0;
            const freqDiffLong = prevValidFreq > 0 ? Math.abs(resultLong.frequency - prevValidFreq) : 0;

            if (prevValidFreq > 0 && freqDiffLong < freqDiffShort) {
              result = resultLong;
              multiWindowUsedCount++;
            } else if (resultLong.confidence > result.confidence) {
              result = resultLong;
              multiWindowUsedCount++;
            }
          }
        }

        // ========================================
        // Phase 52: 연속성 가중치 (Continuity Weighting)
        // 이전 프레임과 1옥타브 이상 차이나면 신뢰도 낮춤
        // ========================================
        // Phase 67: 연속성 로그 제거
        let adjustedConfidence = result.confidence;
        if (prevValidFreq > 0 && result.frequency > 0) {
          const freqRatio = result.frequency / prevValidFreq;
          if (freqRatio > 1.8 || freqRatio < 0.55) {
            adjustedConfidence = result.confidence * 0.5;
            continuityAdjustCount++;
          }
        }

        // Phase 2: 사람 목소리 범위 검증 (C2: 65Hz ~ C6: 1047Hz) + Confidence 0.5 이상
        // Phase 52: 연속성 조정된 신뢰도 사용
        // Phase 55: 저음역대(200Hz 이하) + 저RMS 구간은 신뢰도 임계값 완화 (0.5 → 0.3)
        const confidenceThreshold = (isLowRmsZone && result.frequency <= 200 && result.frequency > 0) ? 0.3 : 0.5;

        if (result.frequency >= 65 && result.frequency <= 1047 && adjustedConfidence >= confidenceThreshold) {
          frames.push({
            time,
            frequency: result.frequency,
            confidence: adjustedConfidence
          });

          // Phase 62: 앙상블 보정 카운트
          if (result.method === 'ensemble') {
            ensembleUsedCount++;
          }

          validFreqCount++;
          freqSum += result.frequency;
          minFreq = Math.min(minFreq, result.frequency);
          maxFreq = Math.max(maxFreq, result.frequency);
          prevValidFreq = result.frequency; // 연속성 추적 업데이트

          if (isDebugRange) {
            debugFrames.push({ time, rms, freq: result.frequency, conf: adjustedConfidence, reason: '유효' });
          }
        } else {
          frames.push({ time, frequency: 0, confidence: 0 });
          if (isDebugRange) {
            let reason = '';
            if (result.frequency <= 80) reason = `주파수 너무 낮음 (${result.frequency.toFixed(0)}Hz < 80)`;
            else if (result.frequency >= 2000) reason = `주파수 너무 높음 (${result.frequency.toFixed(0)}Hz > 2000)`;
            else if (adjustedConfidence < 0.5) reason = `신뢰도 낮음 (${adjustedConfidence.toFixed(2)} < 0.5, 연속성 패널티)`;
            else if (result.confidence <= 0.2) reason = `신뢰도 낮음 (${result.confidence.toFixed(2)} < 0.2)`;
            else reason = `알 수 없음 (freq=${result.frequency.toFixed(0)}, conf=${result.confidence.toFixed(2)})`;
            debugFrames.push({ time, rms, freq: result.frequency, conf: result.confidence, reason });
          }
        }
      }

      // Phase 67: 상세 디버그 로그 제거, 통계만 유지
      console.log('[Pitch] 분석 완료:', {
        프레임: frames.length,
        앙상블: ensembleUsedCount,
        연속성패널티: continuityAdjustCount
      });

      // Phase 67: 중복 로그 제거

      // ========================================
      // Phase 44: RMS Energy 기반 범용 싱크 (Dynamic Auto-Alignment)
      // ========================================
      // 정답지 없이도 작동하는 범용 싱크 로직
      // 첫 번째 유의미한 소리(Energy Peak)를 감지하여 전체 프레임 시프트
      const RMS_SYNC_THRESHOLD = 0.015; // 첫 소리 감지 임계값
      let firstSoundTime = -1;

      // 첫 유효 소리 시점 찾기
      for (const frame of frames) {
        if (frame.frequency > 0 && frame.confidence >= 0.3) {
          firstSoundTime = frame.time;
          break;
        }
      }

      // Phase 67: RMS 싱크 로그 제거
      if (firstSoundTime > 0) {
        const maxAllowedDelay = 0.5;

        if (firstSoundTime > maxAllowedDelay) {
          const shiftAmount = firstSoundTime - maxAllowedDelay;
          frames.forEach(f => { f.time = f.time - shiftAmount; });

          const validFrames = frames.filter(f => f.time >= 0);
          frames.length = 0;
          frames.push(...validFrames);
        }
      }

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
): {
  frequency: number;
  confidence: number;
  isMpmCorrected?: boolean;
  originalFrequency?: number;
  correctionFactor?: number;
} {
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
  let frequency = betterTau > 0 ? sampleRate / betterTau : 0;
  const confidence = selectedPeak.value;
  const originalFrequency = frequency; // 보정 전 원본 주파수 저장

  // ========================================
  // MPM 서브하모닉 감지 (DISABLED - Phase 16)
  // ========================================
  // 비활성화 이유: MPM의 배음 보정이 멜로디 주파수를 /2, /3으로 과도하게 낮춤
  // - 200Hz → 100Hz로 떨어지면 Bass Trap에 걸려 shift 0 적용
  // - 결과: 멜로디가 2옥타브 추락 (15차 10.5% 원인)
  // - 해결: 순수 fundamental 주파수만 사용, Phase 2 correctOctaveError에만 의존

  let isMpmCorrected = false;
  let correctionFactor: number | undefined = undefined;

  // 서브하모닉 검사: /2, /3, /4, /5 배수 확인
  // const subharmonics = [2, 3, 4, 5];
  //
  // for (const divisor of subharmonics) {
  //   const subFreq = frequency / divisor;
  //   if (subFreq < 50) continue; // 너무 낮으면 스킵
  //
  //   // 서브하모닉에서 피크 찾기
  //   const subTau = sampleRate / subFreq;
  //   const subTauInt = Math.round(subTau);
  //
  //   if (subTauInt > 0 && subTauInt < bufferSize - 1) {
  //     const subPeakValue = nsdf[subTauInt];
  //
  //     // threshold 0.6: 서브하모닉 피크가 원래 피크의 0.6배 이상이면 보정
  //     // (과도한 /2 방지 - 진짜 서브하모닉만 감지)
  //     if (subPeakValue >= selectedPeak.value * 0.6) {
  //       frequency = subFreq;
  //       isMpmCorrected = true;
  //       correctionFactor = divisor;
  //       console.log(`[MPM] 서브하모닉 감지: ${originalFrequency.toFixed(0)}Hz → ${frequency.toFixed(0)}Hz (/${divisor})`);
  //       break;
  //     }
  //   }
  // }

  return {
    frequency,
    confidence,
    isMpmCorrected,
    originalFrequency,
    correctionFactor
  };
}

// ========================================
// Phase 62: YIN 알고리즘 (최적화 버전)
// ========================================
// MPM과 다른 방식으로 pitch를 추정하여 앙상블에 사용
// 최적화: 음성 주파수 범위(65-1047Hz)에 해당하는 tau만 계산
function detectPitchYIN(
  buffer: Float32Array,
  sampleRate: number
): { frequency: number; confidence: number } {
  const bufferSize = buffer.length;
  const yinThreshold = 0.15; // YIN 표준 임계값

  // 최적화: 음성 주파수 범위에 해당하는 tau만 계산
  // 65Hz ~ 1047Hz → tau = sampleRate/freq
  const minTau = Math.floor(sampleRate / 1047); // ~46 @ 48kHz
  const maxTau = Math.min(Math.ceil(sampleRate / 65), Math.floor(bufferSize / 2)); // ~738 @ 48kHz

  // 1. Difference function d(τ) - 최적화된 범위만 계산
  const difference = new Float32Array(maxTau + 1);

  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    const limit = bufferSize - tau;
    for (let i = 0; i < limit; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  // 2. Cumulative mean normalized difference d'(τ)
  const cmndf = new Float32Array(maxTau + 1);
  cmndf[minTau] = 1;

  let runningSum = difference[minTau];
  for (let tau = minTau + 1; tau <= maxTau; tau++) {
    runningSum += difference[tau];
    cmndf[tau] = difference[tau] / (runningSum / (tau - minTau + 1));
  }

  // 3. Absolute threshold - 첫 번째로 threshold 이하인 지점 찾기
  let tauEstimate = -1;
  for (let tau = minTau + 1; tau <= maxTau; tau++) {
    if (cmndf[tau] < yinThreshold) {
      // 로컬 미니멈 찾기
      while (tau + 1 <= maxTau && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate < 0) {
    return { frequency: 0, confidence: 0 };
  }

  // 4. Parabolic interpolation
  let betterTau = tauEstimate;
  if (tauEstimate > minTau && tauEstimate < maxTau) {
    const s0 = cmndf[tauEstimate - 1];
    const s1 = cmndf[tauEstimate];
    const s2 = cmndf[tauEstimate + 1];

    const denominator = 2 * s1 - s2 - s0;
    if (Math.abs(denominator) > 0.0001) {
      const adjustment = (s2 - s0) / (2 * denominator);
      if (Math.abs(adjustment) < 1) {
        betterTau = tauEstimate + adjustment;
      }
    }
  }

  const frequency = betterTau > 0 ? sampleRate / betterTau : 0;
  const confidence = 1 - cmndf[tauEstimate]; // YIN confidence

  return { frequency, confidence };
}

// ========================================
// Phase 62: HPS (Harmonic Product Spectrum)
// ========================================
// 배음 간섭을 제거하고 기본 주파수를 강화
function detectPitchHPS(
  buffer: Float32Array,
  sampleRate: number
): { frequency: number; confidence: number } {
  const bufferSize = buffer.length;
  const fftSize = bufferSize;

  // Hanning window 적용
  const windowed = new Float32Array(fftSize);
  for (let i = 0; i < bufferSize; i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (bufferSize - 1)));
    windowed[i] = buffer[i] * window;
  }

  // 간단한 DFT 구현 (magnitude spectrum만 필요)
  // 성능을 위해 관심 주파수 범위만 계산 (50Hz ~ 1200Hz)
  const minFreq = 50;
  const maxFreq = 1200;
  const minBin = Math.floor(minFreq * fftSize / sampleRate);
  const maxBin = Math.ceil(maxFreq * fftSize / sampleRate);

  const magnitude = new Float32Array(maxBin + 1);

  for (let k = minBin; k <= maxBin; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < fftSize; n++) {
      const angle = -2 * Math.PI * k * n / fftSize;
      real += windowed[n] * Math.cos(angle);
      imag += windowed[n] * Math.sin(angle);
    }
    magnitude[k] = Math.sqrt(real * real + imag * imag);
  }

  // HPS: 2, 3, 4배 다운샘플링 후 곱하기
  const numHarmonics = 4;
  const hps = new Float32Array(Math.floor(maxBin / numHarmonics) + 1);

  for (let k = minBin; k < hps.length; k++) {
    let product = magnitude[k] || 0.0001;
    for (let h = 2; h <= numHarmonics; h++) {
      const harmonicBin = k * h;
      if (harmonicBin <= maxBin) {
        product *= (magnitude[harmonicBin] || 0.0001);
      }
    }
    hps[k] = product;
  }

  // HPS에서 최대값 찾기
  let maxHpsValue = 0;
  let maxHpsBin = minBin;
  for (let k = minBin; k < hps.length; k++) {
    if (hps[k] > maxHpsValue) {
      maxHpsValue = hps[k];
      maxHpsBin = k;
    }
  }

  const frequency = maxHpsBin * sampleRate / fftSize;

  // Confidence: 피크의 상대적 강도
  let sumHps = 0;
  for (let k = minBin; k < hps.length; k++) {
    sumHps += hps[k];
  }
  const confidence = sumHps > 0 ? maxHpsValue / sumHps * 10 : 0; // 정규화된 신뢰도

  return { frequency, confidence: Math.min(confidence, 1) };
}

// ========================================
// Phase 62: MPM + YIN 앙상블 (최적화)
// ========================================
// 두 알고리즘 결과를 비교하여 옥타브 오류 보정
// HPS는 옥타브 불일치 시에만 호출 (성능 최적화)
function detectPitchEnsemble(
  buffer: Float32Array,
  sampleRate: number
): {
  frequency: number;
  confidence: number;
  method: 'mpm' | 'yin' | 'hps' | 'ensemble';
  mpmFreq?: number;
  yinFreq?: number;
  hpsFreq?: number;
} {
  // 1. MPM과 YIN만 먼저 실행 (빠름)
  const mpmResult = detectPitchMPM(buffer, sampleRate);
  const yinResult = detectPitchYIN(buffer, sampleRate);

  const mpmFreq = mpmResult.frequency;
  const yinFreq = yinResult.frequency;
  let hpsFreq = 0; // HPS는 필요할 때만 계산

  // 유효하지 않은 결과 처리
  if (mpmFreq <= 0 && yinFreq <= 0) {
    return { frequency: 0, confidence: 0, method: 'mpm', mpmFreq, yinFreq, hpsFreq };
  }

  // MPM만 유효한 경우
  if (mpmFreq > 0 && yinFreq <= 0) {
    return {
      frequency: mpmFreq,
      confidence: mpmResult.confidence,
      method: 'mpm',
      mpmFreq, yinFreq, hpsFreq
    };
  }

  // YIN만 유효한 경우
  if (yinFreq > 0 && mpmFreq <= 0) {
    return {
      frequency: yinFreq,
      confidence: yinResult.confidence,
      method: 'yin',
      mpmFreq, yinFreq, hpsFreq
    };
  }

  // 2. 둘 다 유효한 경우 - 앙상블 로직
  const ratio = mpmFreq / yinFreq;

  // 2.1. 거의 일치하는 경우 (±5% 이내) → 신뢰도 높은 쪽 선택
  if (ratio > 0.95 && ratio < 1.05) {
    const betterResult = mpmResult.confidence >= yinResult.confidence ? mpmResult : yinResult;
    return {
      frequency: betterResult.frequency,
      confidence: Math.max(mpmResult.confidence, yinResult.confidence),
      method: 'ensemble',
      mpmFreq, yinFreq, hpsFreq
    };
  }

  // ========================================
  // Phase 63: 옥타브 보정 강화
  // ========================================
  // 2.2. 옥타브 차이 (MPM이 YIN보다 2배 높음) → 무조건 낮은 주파수 선택
  // 범위 확대: 1.7~2.3 (측정 오차 고려)
  if (ratio > 1.7 && ratio < 2.3) {
    console.log(`[Phase 63 앙상블] 옥타브 보정: MPM ${mpmFreq.toFixed(0)}Hz → YIN ${yinFreq.toFixed(0)}Hz (ratio: ${ratio.toFixed(2)})`);
    return {
      frequency: yinFreq,
      confidence: Math.max(yinResult.confidence, mpmResult.confidence),
      method: 'ensemble',
      mpmFreq, yinFreq, hpsFreq
    };
  }

  // 2.3. YIN이 MPM보다 2배 높음 → MPM 채택 (낮은 주파수)
  if (ratio > 0.43 && ratio < 0.59) {
    console.log(`[Phase 63 앙상블] YIN 옥타브 오류: YIN ${yinFreq.toFixed(0)}Hz → MPM ${mpmFreq.toFixed(0)}Hz (ratio: ${ratio.toFixed(2)})`);
    return {
      frequency: mpmFreq,
      confidence: Math.max(mpmResult.confidence, yinResult.confidence),
      method: 'ensemble',
      mpmFreq, yinFreq, hpsFreq
    };
  }

  // 2.4. 그 외 불일치 → 더 낮은 주파수 우선 (보수적 선택)
  // Phase 63: 옥타브 오류는 항상 높게 감지되므로 낮은 쪽 선택
  const lowerFreq = Math.min(mpmFreq, yinFreq);
  const lowerResult = lowerFreq === mpmFreq ? mpmResult : yinResult;

  if (Math.abs(ratio - 1) > 0.15) {
    // 15% 이상 차이나면 낮은 쪽 선택
    console.log(`[Phase 63 앙상블] 불일치 감지, 낮은 주파수 선택: ${Math.max(mpmFreq, yinFreq).toFixed(0)}Hz → ${lowerFreq.toFixed(0)}Hz`);
    return {
      frequency: lowerFreq,
      confidence: lowerResult.confidence,
      method: 'ensemble',
      mpmFreq, yinFreq, hpsFreq
    };
  }

  // 거의 일치 → MPM 우선
  return {
    frequency: mpmFreq,
    confidence: mpmResult.confidence,
    method: 'mpm',
    mpmFreq, yinFreq, hpsFreq
  };
}

export default usePitchAnalyzer;
