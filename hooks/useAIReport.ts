'use client';

import { useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useReportPanelStore } from '@/stores/reportPanelStore';
import {
  AIReportData,
  MeasureScore,
  ProblemArea,
  AISuggestion,
  RangeAnalysis,
  EditStats,
  NoteJudgment,
  ProblemAreaType,
  ReportCalculationInput,
  getFrequencyRange,
} from '@/types/ai-report';

// 캐시 (jamId → AIReportData)
const reportCache = new Map<string, AIReportData>();

/**
 * AI 리포트 훅
 */
export function useAIReport() {
  const {
    isOpen,
    currentJamId,
    currentSongId,
    reportData,
    isLoading,
    error,
    setReportData,
    setLoading,
    setError,
    closePanel,
  } = useReportPanelStore();

  /**
   * feedback_sessions에서 데이터 조회
   */
  const fetchFeedbackSession = useCallback(async (jamId: string) => {
    const supabase = createClient();

    // .maybeSingle() 사용 - 데이터가 없어도 에러 아님
    const { data, error } = await supabase
      .from('feedback_sessions')
      .select('*')
      .eq('jam_id', jamId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // 상세 에러 로깅
      console.error('[useAIReport] Supabase error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }

    // 데이터가 없는 경우 (정상 케이스)
    if (!data) {
      console.log('[useAIReport] feedback_sessions에 해당 JAM 데이터 없음:', jamId);
      return null;
    }

    return data;
  }, []);

  /**
   * 리포트 데이터 계산
   */
  const calculateReport = useCallback((input: ReportCalculationInput): AIReportData => {
    const {
      jamId,
      songId,
      autoDetectedNotes,
      finalEditedNotes,
      noteChanges,
      metrics,
    } = input;

    // 1. 음표별 판정 생성
    const judgments = calculateNoteJudgments(autoDetectedNotes, finalEditedNotes, noteChanges);

    // 2. 기본 점수 계산
    const { overallScore, pitchAccuracy, timingAccuracy, durationAccuracy, recoveryRate } =
      calculateScores(judgments, metrics);

    // 3. 구간별 분석 (4마디 단위)
    const measureAnalysis = calculateMeasureAnalysis(judgments);

    // 4. 음역대별 분석
    const rangeAnalysis = calculateRangeAnalysis(judgments, autoDetectedNotes);

    // 5. 수정 통계
    const editStats = calculateEditStats(metrics, judgments);

    // 6. 문제 구간 추출
    const problemAreas = extractProblemAreas(judgments);

    // 7. AI 제안 생성
    const suggestions = generateSuggestions(judgments, rangeAnalysis, measureAnalysis, problemAreas);

    return {
      overallScore,
      pitchAccuracy,
      timingAccuracy,
      durationAccuracy,
      recoveryRate,
      measureAnalysis,
      rangeAnalysis,
      editStats,
      problemAreas,
      suggestions,
      jamId,
      songId,
      calculatedAt: new Date().toISOString(),
    };
  }, []);

  /**
   * 리포트 로드 (캐시 확인 → 없으면 계산)
   */
  const loadReport = useCallback(async (jamId: string, songId: string) => {
    console.log('[useAIReport] loadReport 시작:', { jamId, songId });

    // 캐시 확인
    if (reportCache.has(jamId)) {
      console.log('[useAIReport] 캐시에서 리포트 로드:', jamId);
      setReportData(reportCache.get(jamId)!);
      return;
    }

    setLoading(true);

    try {
      // feedback_sessions 조회
      console.log('[useAIReport] feedback_sessions 조회 중...');
      const session = await fetchFeedbackSession(jamId);
      console.log('[useAIReport] feedback_sessions 결과:', session ? '데이터 있음' : '데이터 없음');

      if (!session) {
        console.warn('[useAIReport] feedback_sessions 데이터 없음 - 녹음 후 편집을 완료해야 합니다');
        setError('리포트 데이터가 없습니다. 녹음 후 편집을 완료해주세요.');
        return;
      }

      // 리포트 계산
      const input: ReportCalculationInput = {
        jamId,
        songId,
        autoDetectedNotes: session.auto_detected_notes || [],
        finalEditedNotes: session.final_edited_notes || [],
        noteChanges: session.note_changes || [],
        metrics: {
          totalOriginalNotes: session.total_original_notes || 0,
          totalFinalNotes: session.total_final_notes || 0,
          pitchChangedNotes: session.pitch_changed_notes || 0,
          positionChangedNotes: session.position_changed_notes || 0,
          durationChangedNotes: session.duration_changed_notes || 0,
          deletedNotes: session.deleted_notes || 0,
          addedNotes: session.added_notes || 0,
          unchangedNotes: session.unchanged_notes || 0,
        },
      };

      // 음표가 없으면 에러
      if (input.autoDetectedNotes.length === 0 && input.finalEditedNotes.length === 0) {
        setError('분석할 데이터가 없습니다.');
        return;
      }

      const report = calculateReport(input);

      // 캐시에 저장
      reportCache.set(jamId, report);

      setReportData(report);
      console.log('[useAIReport] Report calculated:', report);
    } catch (err: any) {
      console.error('[useAIReport] Error:', err);
      setError(err.message || '리포트 생성 중 오류가 발생했습니다.');
    }
  }, [fetchFeedbackSession, calculateReport, setReportData, setLoading, setError]);

  // 패널이 열리면 자동으로 리포트 로드
  // openPanel에서 isLoading: true로 설정하므로, isLoading이 true일 때 로드 시작
  useEffect(() => {
    console.log('[useAIReport] useEffect 체크:', { isOpen, currentJamId, currentSongId, hasReportData: !!reportData, isLoading });
    if (isOpen && currentJamId && currentSongId && !reportData && isLoading) {
      console.log('[useAIReport] loadReport 호출 조건 충족');
      loadReport(currentJamId, currentSongId);
    }
  }, [isOpen, currentJamId, currentSongId, reportData, isLoading, loadReport]);

  return {
    isOpen,
    reportData,
    isLoading,
    error,
    loadReport,
    closePanel,
  };
}

// ============================================
// 내부 계산 함수들
// ============================================

/**
 * 음표별 판정 계산
 *
 * 핵심 로직:
 * - confidence === 'excluded' + 수정함 → 'system_limit'
 * - confidence !== 'excluded' + 수정함 → 'user_error'
 * - confidence !== 'excluded' + 수정 안 함 → 'accurate'
 * - confidence === 'excluded' + 수정 안 함 → 'unconfirmed'
 */
function calculateNoteJudgments(
  autoDetectedNotes: any[],
  finalEditedNotes: any[],
  noteChanges: any[]
): NoteJudgment[] {
  const judgments: NoteJudgment[] = [];

  // noteChanges를 인덱스로 빠르게 조회할 수 있게
  const changesByIndex = new Map<number, any>();
  noteChanges.forEach((change) => {
    changesByIndex.set(change.noteIndex, change);
  });

  // 쉼표 제외한 원본 음표들
  const originalNotes = autoDetectedNotes.filter((n) => !n.isRest);

  originalNotes.forEach((note, index) => {
    const change = changesByIndex.get(index);
    const wasEdited = !!change && change.changes && change.changes.length > 0;
    const confidence = note.confidence || 'high';
    const isExcluded = confidence === 'excluded';

    let judgment: ProblemAreaType;

    if (isExcluded && wasEdited) {
      judgment = 'system_limit';
    } else if (!isExcluded && wasEdited) {
      judgment = 'user_error';
    } else if (!isExcluded && !wasEdited) {
      judgment = 'accurate';
    } else {
      // isExcluded && !wasEdited
      judgment = 'unconfirmed';
    }

    judgments.push({
      noteIndex: index,
      measureIndex: note.measureIndex,
      slotIndex: note.slotIndex,
      pitch: note.pitch,
      confidence,
      wasEdited,
      editTypes: change?.changes || [],
      judgment,
    });
  });

  return judgments;
}

/**
 * 기본 점수 계산
 */
function calculateScores(
  judgments: NoteJudgment[],
  metrics: ReportCalculationInput['metrics']
): {
  overallScore: number;
  pitchAccuracy: number;
  timingAccuracy: number;
  durationAccuracy: number;
  recoveryRate: number;
} {
  const totalNotes = judgments.length;
  if (totalNotes === 0) {
    return {
      overallScore: 0,
      pitchAccuracy: 0,
      timingAccuracy: 0,
      durationAccuracy: 0,
      recoveryRate: 0,
    };
  }

  // 정확한 음표 (accurate만)
  const accurateNotes = judgments.filter((j) => j.judgment === 'accurate').length;

  // 각 항목별 정확도
  const pitchEdited = judgments.filter((j) => j.editTypes.includes('pitch')).length;
  const timingEdited = judgments.filter((j) => j.editTypes.includes('position')).length;
  const durationEdited = judgments.filter((j) => j.editTypes.includes('duration')).length;

  const pitchAccuracy = Math.round(((totalNotes - pitchEdited) / totalNotes) * 100);
  const timingAccuracy = Math.round(((totalNotes - timingEdited) / totalNotes) * 100);
  const durationAccuracy = Math.round(((totalNotes - durationEdited) / totalNotes) * 100);

  // 종합 점수 (가중 평균: pitch 40%, timing 35%, duration 25%)
  const overallScore = Math.round(
    pitchAccuracy * 0.4 + timingAccuracy * 0.35 + durationAccuracy * 0.25
  );

  // 회수율: AI가 검출한 음표 중 유지된 비율
  // (삭제되지 않은 음표 / 원본 음표)
  const recoveryRate = Math.round(
    ((metrics.totalOriginalNotes - metrics.deletedNotes) / metrics.totalOriginalNotes) * 100
  );

  return {
    overallScore,
    pitchAccuracy,
    timingAccuracy,
    durationAccuracy,
    recoveryRate: isNaN(recoveryRate) ? 100 : recoveryRate,
  };
}

/**
 * 구간별 분석 (4마디 단위)
 */
function calculateMeasureAnalysis(judgments: NoteJudgment[]): MeasureScore[] {
  if (judgments.length === 0) return [];

  // 마디 범위 파악
  const measureIndices = judgments.map((j) => j.measureIndex);
  const minMeasure = Math.min(...measureIndices);
  const maxMeasure = Math.max(...measureIndices);

  const results: MeasureScore[] = [];

  // 4마디씩 그룹핑
  for (let start = minMeasure; start <= maxMeasure; start += 4) {
    const end = Math.min(start + 3, maxMeasure);
    const groupNotes = judgments.filter(
      (j) => j.measureIndex >= start && j.measureIndex <= end
    );

    const totalNotes = groupNotes.length;
    const accurateNotes = groupNotes.filter((j) => j.judgment === 'accurate').length;
    const accuracy = totalNotes > 0 ? Math.round((accurateNotes / totalNotes) * 100) : 0;

    results.push({
      measureStart: start,
      measureEnd: end,
      accuracy,
      totalNotes,
      accurateNotes,
    });
  }

  return results;
}

/**
 * 음역대별 분석
 */
function calculateRangeAnalysis(
  judgments: NoteJudgment[],
  autoDetectedNotes: any[]
): RangeAnalysis {
  const rangeStats = {
    low: { total: 0, accurate: 0 },
    mid: { total: 0, accurate: 0 },
    high: { total: 0, accurate: 0 },
  };

  judgments.forEach((j) => {
    const range = getFrequencyRange(j.pitch);
    if (!range) return;

    rangeStats[range].total++;
    if (j.judgment === 'accurate') {
      rangeStats[range].accurate++;
    }
  });

  const calcAccuracy = (stats: { total: number; accurate: number }) =>
    stats.total > 0 ? Math.round((stats.accurate / stats.total) * 100) : 0;

  return {
    low: {
      range: 'D2-G2',
      accuracy: calcAccuracy(rangeStats.low),
      totalNotes: rangeStats.low.total,
      accurateNotes: rangeStats.low.accurate,
    },
    mid: {
      range: 'A2-D3',
      accuracy: calcAccuracy(rangeStats.mid),
      totalNotes: rangeStats.mid.total,
      accurateNotes: rangeStats.mid.accurate,
    },
    high: {
      range: 'E3-C4',
      accuracy: calcAccuracy(rangeStats.high),
      totalNotes: rangeStats.high.total,
      accurateNotes: rangeStats.high.accurate,
    },
  };
}

/**
 * 수정 통계 계산
 */
function calculateEditStats(
  metrics: ReportCalculationInput['metrics'],
  judgments: NoteJudgment[]
): EditStats {
  const totalNotes = metrics.totalOriginalNotes;
  const editedNotes =
    metrics.pitchChangedNotes + metrics.positionChangedNotes + metrics.durationChangedNotes;

  // 중복 제거된 실제 수정 음표 수
  const uniqueEditedNotes = judgments.filter((j) => j.wasEdited).length;

  return {
    totalNotes,
    editedNotes: uniqueEditedNotes,
    editRate: totalNotes > 0 ? Math.round((uniqueEditedNotes / totalNotes) * 100) : 0,
    pitchEdits: metrics.pitchChangedNotes,
    timingEdits: metrics.positionChangedNotes,
    durationEdits: metrics.durationChangedNotes,
    deletedNotes: metrics.deletedNotes,
    addedNotes: metrics.addedNotes,
  };
}

/**
 * 문제 구간 추출
 */
function extractProblemAreas(judgments: NoteJudgment[]): ProblemArea[] {
  const problemAreas: ProblemArea[] = [];

  // 마디별로 그룹핑
  const byMeasure = new Map<number, NoteJudgment[]>();
  judgments.forEach((j) => {
    if (!byMeasure.has(j.measureIndex)) {
      byMeasure.set(j.measureIndex, []);
    }
    byMeasure.get(j.measureIndex)!.push(j);
  });

  // 연속된 문제 마디 그룹핑
  const measureIndices = Array.from(byMeasure.keys()).sort((a, b) => a - b);

  let currentArea: {
    start: number;
    end: number;
    type: ProblemAreaType;
    count: number;
  } | null = null;

  for (const measureIndex of measureIndices) {
    const notes = byMeasure.get(measureIndex)!;

    // 해당 마디의 주요 문제 유형 결정
    const typeCounts: Record<ProblemAreaType, number> = {
      system_limit: 0,
      user_error: 0,
      accurate: 0,
      unconfirmed: 0
    };
    for (const n of notes) {
      typeCounts[n.judgment]++;
    }

    // 가장 많은 문제 유형 (accurate 제외)
    const problemTypes: ProblemAreaType[] = ['system_limit', 'user_error', 'unconfirmed'];
    let dominantType: ProblemAreaType = 'accurate';
    let maxCount = 0;

    for (const type of problemTypes) {
      if (typeCounts[type] > maxCount) {
        maxCount = typeCounts[type];
        dominantType = type;
      }
    }

    // 문제가 없으면 accurate
    if (maxCount === 0) {
      dominantType = 'accurate';
    }

    // 연속 구간 처리
    if (currentArea && currentArea.type === dominantType && measureIndex === currentArea.end + 1) {
      currentArea.end = measureIndex;
      currentArea.count += maxCount;
    } else {
      // 이전 구간 저장
      if (currentArea && currentArea.type !== 'accurate') {
        problemAreas.push({
          measureStart: currentArea.start,
          measureEnd: currentArea.end,
          type: currentArea.type,
          description: getAreaDescription(currentArea.type),
          noteCount: currentArea.count,
        });
      }
      // 새 구간 시작
      currentArea = {
        start: measureIndex,
        end: measureIndex,
        type: dominantType,
        count: maxCount,
      };
    }
  }

  // 마지막 구간 저장
  if (currentArea && currentArea.type !== 'accurate') {
    problemAreas.push({
      measureStart: currentArea.start,
      measureEnd: currentArea.end,
      type: currentArea.type,
      description: getAreaDescription(currentArea.type),
      noteCount: currentArea.count,
    });
  }

  return problemAreas;
}

function getAreaDescription(type: ProblemAreaType): string {
  switch (type) {
    case 'system_limit':
      return 'AI 검출 한계로 인해 수정이 필요했던 구간입니다.';
    case 'user_error':
      return '연주 실수로 인해 수정된 구간입니다.';
    case 'unconfirmed':
      return 'AI가 검출하지 못했지만 확인되지 않은 구간입니다.';
    default:
      return '';
  }
}

/**
 * AI 제안 생성 (규칙 기반)
 */
function generateSuggestions(
  judgments: NoteJudgment[],
  rangeAnalysis: RangeAnalysis,
  measureAnalysis: MeasureScore[],
  problemAreas: ProblemArea[]
): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  // 1. 시스템 한계 관련 제안
  const systemLimitCount = judgments.filter((j) => j.judgment === 'system_limit').length;
  if (systemLimitCount > 3) {
    suggestions.push({
      type: 'system_limit',
      title: 'AI 검출 한계 구간 발견',
      description: `${systemLimitCount}개의 음표가 AI 검출 한계로 수정되었습니다. 이 구간은 직접 확인을 권장합니다.`,
      priority: 'medium',
    });
  }

  // 2. 음역대별 제안
  if (rangeAnalysis.low.totalNotes > 0 && rangeAnalysis.low.accuracy < 70) {
    suggestions.push({
      type: 'range',
      title: '저음역(D2-G2) 연습 추천',
      description: `저음역 정확도가 ${rangeAnalysis.low.accuracy}%입니다. 저음역 발성 연습을 권장합니다.`,
      priority: 'high',
    });
  }

  if (rangeAnalysis.high.totalNotes > 0 && rangeAnalysis.high.accuracy < 70) {
    suggestions.push({
      type: 'range',
      title: '고음역(E3-C4) 연습 추천',
      description: `고음역 정확도가 ${rangeAnalysis.high.accuracy}%입니다. 고음역 발성 연습을 권장합니다.`,
      priority: 'high',
    });
  }

  // 3. 특정 마디 집중 연습 제안
  const lowAccuracyMeasures = measureAnalysis.filter((m) => m.accuracy < 60 && m.totalNotes >= 2);
  if (lowAccuracyMeasures.length > 0) {
    const measureRanges = lowAccuracyMeasures
      .slice(0, 3)
      .map((m) => `M.${m.measureStart + 1}-${m.measureEnd + 1}`)
      .join(', ');

    suggestions.push({
      type: 'timing',
      title: '집중 연습 구간',
      description: `${measureRanges} 구간의 정확도가 낮습니다. 해당 구간을 집중적으로 연습해보세요.`,
      priority: 'high',
      relatedMeasures: lowAccuracyMeasures.flatMap((m) =>
        Array.from({ length: m.measureEnd - m.measureStart + 1 }, (_, i) => m.measureStart + i)
      ),
    });
  }

  // 4. 사용자 실수 관련 제안
  const userErrorCount = judgments.filter((j) => j.judgment === 'user_error').length;
  const totalNotes = judgments.length;
  const userErrorRate = totalNotes > 0 ? (userErrorCount / totalNotes) * 100 : 0;

  if (userErrorRate > 30) {
    suggestions.push({
      type: 'user_error',
      title: '연주 안정성 개선 필요',
      description: `전체 음표의 ${Math.round(userErrorRate)}%가 연주 실수로 수정되었습니다. 템포를 조금 낮춰서 연습해보세요.`,
      priority: 'medium',
    });
  }

  // 5. 긍정적 피드백 (정확도 80% 이상)
  const overallAccuracy =
    totalNotes > 0
      ? Math.round((judgments.filter((j) => j.judgment === 'accurate').length / totalNotes) * 100)
      : 0;

  if (overallAccuracy >= 80) {
    suggestions.push({
      type: 'general',
      title: '훌륭한 연주입니다!',
      description: '전체 정확도가 80% 이상입니다. 현재 수준을 유지하면서 더 어려운 곡에 도전해보세요.',
      priority: 'low',
    });
  }

  // 우선순위 순으로 정렬
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions.slice(0, 5); // 최대 5개
}

export default useAIReport;
