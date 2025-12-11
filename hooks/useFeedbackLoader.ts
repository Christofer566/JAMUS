'use client';

import { useState, useEffect } from 'react';
import { FeedbackData, MOCK_FEEDBACK } from '@/types/feedback';
import { RecordingSegment } from './useRecorder';

// ============================================
// Types
// ============================================
export interface UseFeedbackLoaderOptions {
  segments?: RecordingSegment[];
  autoLoad?: boolean;
}

export interface UseFeedbackLoaderReturn {
  isLoading: boolean;
  feedback: FeedbackData | null;
  error: string | null;
  reload: () => void;
}

// ============================================
// Constants
// ============================================
const AI_LOADING_DURATION = 3500; // 3.5초 (MVP 고정 타이머)

// ============================================
// Hook
// ============================================
export function useFeedbackLoader(
  options: UseFeedbackLoaderOptions = {}
): UseFeedbackLoaderReturn {
  const { segments = [], autoLoad = true } = options;

  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFeedback = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // ============================================
      // MVP: 고정 타이머 (3.5초)
      // 추후 AI 연동 시: analyzePerformance(audioBlob) 호출로 교체
      // ============================================
      await new Promise(resolve => setTimeout(resolve, AI_LOADING_DURATION));

      // segments에서 recordedSegments 생성
      const recordedSegments = segments.map(seg => ({
        startTime: seg.startTime,
        endTime: seg.endTime
      }));

      // Mock 데이터에 실제 녹음 구간 반영
      const mockFeedback: FeedbackData = {
        ...MOCK_FEEDBACK,
        recordedSegments: recordedSegments.length > 0 ? recordedSegments : MOCK_FEEDBACK.recordedSegments
      };

      // ============================================
      // 추후 AI 연동 시 아래 코드로 교체:
      // const result = await analyzePerformance(audioBlob);
      // setFeedback(result);
      // ============================================

      setFeedback(mockFeedback);
    } catch (err) {
      console.error('Feedback loading error:', err);
      setError('피드백을 불러오는데 실패했습니다');
      // 에러 시에도 Mock 데이터로 폴백
      setFeedback(MOCK_FEEDBACK);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) {
      loadFeedback();
    }
  }, [autoLoad]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isLoading,
    feedback,
    error,
    reload: loadFeedback
  };
}

export default useFeedbackLoader;
