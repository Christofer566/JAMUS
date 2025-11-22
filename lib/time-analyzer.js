/**
 * 커밋 목록을 분석하여 개발 세션을 나누고 총 개발 시간을 추정합니다.
 * @param {Array<Object>} commits - 시간순으로 정렬된 커밋 객체 배열
 * @returns {Object} 시간 분석 결과
 */
export function analyzeTime(commits) {
  if (!commits || commits.length === 0) {
    return {
      totalDevelopmentTime: '0분',
      aiImplementationTime: '0분',
      humanReviewTime: '0분',
      sessions: []
    };
  }

  const SESSION_GAP_MINUTES = 30; // 세션을 나누는 기준 시간 (30분)
  const MIN_SESSION_MINUTES = 5;  // 최소 세션 시간 (5분)
  const MAX_SESSION_MINUTES = 120; // 최대 세션 시간 (2시간)

  let sessions = [];
  let currentSession = {
    start: new Date(commits[0].date),
    end: new Date(commits[0].date),
    commitCount: 1,
    commitGaps: []
  };

  for (let i = 1; i < commits.length; i++) {
    const prevCommitTime = new Date(commits[i-1].date);
    const currentCommitTime = new Date(commits[i].date);
    const gapMinutes = (currentCommitTime - prevCommitTime) / (1000 * 60);

    if (gapMinutes > SESSION_GAP_MINUTES) {
      // 30분 이상 간격이 생기면 현재 세션을 저장하고 새 세션 시작
      sessions.push(currentSession);
      currentSession = {
        start: currentCommitTime,
        end: currentCommitTime,
        commitCount: 1,
        commitGaps: []
      };
    } else {
      // 같은 세션에 포함
      currentSession.end = currentCommitTime;
      currentSession.commitCount++;
      currentSession.commitGaps.push(gapMinutes);
    }
  }
  sessions.push(currentSession);

  // 유효한 세션 필터링 및 시간 계산
  const validSessions = sessions.filter(s => {
    const duration = (s.end - s.start) / (1000 * 60);
    return duration >= MIN_SESSION_MINUTES && duration <= MAX_SESSION_MINUTES;
  });
  
  let totalMinutes = 0;
  let aiTimeMinutes = 0;
  let reviewTimeMinutes = 0;

  validSessions.forEach(session => {
    const sessionDuration = (session.end - session.start) / (1000 * 60);
    totalMinutes += sessionDuration;
    
    // AI 시간 vs 리뷰 시간 추정
    session.commitGaps.forEach(gap => {
        if (gap <= 5) { // 5분 미만 간격은 AI 구현 시간으로 간주
            aiTimeMinutes += gap;
        } else { // 5분 이상 간격은 리뷰/수정 시간으로 간주
            reviewTimeMinutes += gap;
        }
    });
  });

  // 커밋 간격으로 계산되지 않은 시간 (각 세션의 첫 커밋 시간 등)을 리뷰 시간에 추가
  const estimatedFromGaps = aiTimeMinutes + reviewTimeMinutes;
  if (totalMinutes > estimatedFromGaps) {
      reviewTimeMinutes += (totalMinutes - estimatedFromGaps);
  }

  const format = (mins) => `${Math.floor(mins/60)}시간 ${Math.round(mins % 60)}분`;

  return {
    totalDevelopmentTime: format(totalMinutes),
    aiImplementationTime: format(aiTimeMinutes),
    humanReviewTime: format(reviewTimeMinutes),
    sessions: validSessions
  };
}
