import { getDevelopmentSessions, formatDuration } from './google-calendar.js';

/**
 * 커밋 시간 갭을 분석하여 AI 작업 vs 사람 리뷰 시간 구분
 * @param {Date} firstCommitTime - 첫 커밋 시간
 * @param {Date} lastCommitTime - 마지막 커밋 시간
 * @param {Object[]} commitGaps - 커밋 간격 배열 [{gap: minutes, isLongGap: boolean}]
 * @returns {Promise<Object>} 시간 분석 결과
 */
export async function analyzeTime(firstCommitTime, lastCommitTime, commitGaps) {
  console.log('\n=== 시간 분석 시작 ===');
  console.log('첫 커밋:', firstCommitTime);
  console.log('마지막 커밋:', lastCommitTime);
  console.log('커밋 갭 수:', commitGaps.length);

  // 1. Google Calendar에서 실제 개발 시간 조회
  const developmentSessions = await getDevelopmentSessions(
    firstCommitTime,
    lastCommitTime
  );

  console.log('찾은 개발 세션:', developmentSessions.length, '개');

  // 총 개발 시간 계산
  const totalMinutes = developmentSessions.reduce(
    (sum, session) => sum + session.duration,
    0
  );

  // 2. 커밋 갭 분석을 통한 AI vs 사람 시간 추정
  // - 짧은 갭 (< 5분): AI가 연속으로 작업 중
  // - 긴 갭 (≥ 5분): 사람이 리뷰/테스트 중
  let aiMinutes = 0;
  let humanMinutes = 0;

  commitGaps.forEach(gap => {
    if (gap.isLongGap) {
      // 긴 갭 = 사람의 리뷰/수정 시간
      humanMinutes += gap.gap;
    } else {
      // 짧은 갭 = AI 구현 시간
      aiMinutes += gap.gap;
    }
  });

  // 총 개발 시간 중 커밋으로 설명되지 않은 시간은 리뷰 시간으로 간주
  const explainedMinutes = aiMinutes + humanMinutes;
  const unexplainedMinutes = Math.max(0, totalMinutes - explainedMinutes);
  humanMinutes += unexplainedMinutes;

  console.log('\n시간 분석 결과:');
  console.log('- 총 개발 시간:', formatDuration(totalMinutes));
  console.log('- AI 구현 시간:', formatDuration(aiMinutes));
  console.log('- 리뷰/수정 시간:', formatDuration(humanMinutes));

  return {
    totalDevelopmentTime: formatDuration(totalMinutes),
    aiImplementationTime: formatDuration(aiMinutes),
    humanReviewTime: formatDuration(humanMinutes),
    developmentSessions,
    rawMinutes: {
      total: totalMinutes,
      ai: aiMinutes,
      human: humanMinutes
    }
  };
}
