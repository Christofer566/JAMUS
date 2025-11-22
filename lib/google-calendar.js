import { google } from 'googleapis';

/**
 * Google Calendar API 클라이언트 초기화
 */
async function getCalendarClient() { // Made async to potentially fetch access token
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    // process.env.GOOGLE_REDIRECT_URI // This is only used for generating auth URL, not for client initialization.
    'http://localhost:3000/oauth/callback' // A placeholder for client initialization, actual redirect is not used here
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  // Access token을 새로 고침 (Refresh Token이 유효하다면 자동으로 처리)
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * 분을 "X시간 Y분" 형식으로 변환 (existing helper)
 */
export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return `${mins}분`;
  } else if (mins === 0) {
    return `${hours}시간`;
  } else {
    return `${hours}시간 ${mins}분`;
  }
}

/**
 * 두 시간 사이의 지속 시간 계산 (분 단위) (existing helper)
 * @param {Date} start
 * @param {Date} end
 * @returns {number} 분
 */
function calculateDuration(start, end) {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}


/**
 * Google Calendar에 추정 개발 이벤트를 생성 (Phase 2 - createDevelopmentEvent)
 * @param {number} taskNumber - Task 번호
 * @param {object} timeAnalysis - 시간 분석 결과 ({totalTime, aiTime, reviewTime})
 * @param {Array<Object>} commits - 커밋 객체 배열 (시작/종료 시간 추출용)
 * @returns {Promise<Object>} 생성된 이벤트 데이터
 */
export async function createDevelopmentEvent(taskNumber, timeAnalysis, commits) {
  const calendar = await getCalendarClient();
  
  const firstCommitTime = new Date(commits[0].date);
  const lastCommitTime = new Date(commits[commits.length - 1].date);
  
  const event = {
    summary: `[개발] Task ${taskNumber} (추정)`,
    description: 
      `자동 추정값입니다. 확인 후 수정해주세요.\n\n` +
      `추정 총 시간: ${timeAnalysis.totalDevelopmentTime}\n` +
      `AI 구현: ${timeAnalysis.aiImplementationTime}\n` +
      `리뷰/수정: ${timeAnalysis.humanReviewTime}\n` +
      `세션 수: ${timeAnalysis.sessions.length}개\n` +
      `첫 커밋: ${firstCommitTime.toLocaleString()}\n` +
      `마지막 커밋: ${lastCommitTime.toLocaleString()}`,
    start: {
      dateTime: firstCommitTime.toISOString(),
      timeZone: 'Asia/Seoul'
    },
    end: {
      dateTime: lastCommitTime.toISOString(),
      timeZone: 'Asia/Seoul'
    },
    colorId: '11' // 빨간색 (임시)
  };
  
  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });
    console.log('✓ Calendar 임시 기록 완료:', response.data.htmlLink);
    return response.data;
  } catch (error) {
    console.error('Google Calendar 이벤트 생성 오류:', error);
    throw new Error(`캘린더 이벤트 생성 실패: ${error.message}`);
  }
}

/**
 * Google Calendar에서 최종 개발 시간 이벤트를 읽어옴 (Phase 2 - getDevelopmentEventTime)
 * @param {number} taskNumber - Task 번호
 * @returns {Promise<Object|null>} 최종 시간 데이터 또는 null
 */
export async function getDevelopmentEventTime(taskNumber) {
  const calendar = await getCalendarClient();
  
  try {
    // "[개발] Task X" 형식의 이벤트 검색
    const response = await calendar.events.list({
      calendarId: 'primary',
      q: `[개발] Task ${taskNumber}`,
      maxResults: 1, // 가장 최신 이벤트 1개만 가져옴
      orderBy: 'updated' // 최근 업데이트된 이벤트 우선
    });
    
    const events = response.data.items || [];
    if (events.length === 0) {
      console.warn(`[Calendar] Task ${taskNumber}에 대한 캘린더 이벤트를 찾을 수 없습니다.`);
      return null;
    }
    
    const event = events[0];
    
    // 사용자가 수정한 start/end 시간을 파싱하여 Duration 계산
    const eventStart = new Date(event.start.dateTime || event.start.date);
    const eventEnd = new Date(event.end.dateTime || event.end.date);
    const totalMinutes = calculateDuration(eventStart, eventEnd);

    console.log(`✓ Calendar에서 최종 시간 확인 완료: ${formatDuration(totalMinutes)}`);
    
    return {
      totalTime: formatDuration(totalMinutes),
      totalMinutes: totalMinutes, // raw minutes for further calculations
      event: event
    };

  } catch (error) {
    console.error('Google Calendar 이벤트 읽기 오류:', error);
    throw new Error(`캘린더 이벤트 읽기 실패: ${error.message}`);
  }
}
