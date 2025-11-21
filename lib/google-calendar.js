import { google } from 'googleapis';

/**
 * Google Calendar API 클라이언트 초기화
 */
function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * 특정 시간 범위의 개발 시간 조회
 * @param {Date} startTime - 시작 시간
 * @param {Date} endTime - 종료 시간
 * @returns {Promise<Object[]>} 개발 세션 배열
 */
export async function getDevelopmentSessions(startTime, endTime) {
  const calendar = getCalendarClient();

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      q: '[개발]', // "[개발]" 제목을 가진 이벤트만
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    return events.map(event => ({
      title: event.summary,
      start: new Date(event.start.dateTime || event.start.date),
      end: new Date(event.end.dateTime || event.end.date),
      duration: calculateDuration(
        new Date(event.start.dateTime || event.start.date),
        new Date(event.end.dateTime || event.end.date)
      ),
      description: event.description || ''
    }));

  } catch (error) {
    console.error('Google Calendar API 오류:', error);
    throw new Error(`캘린더 조회 실패: ${error.message}`);
  }
}

/**
 * 두 시간 사이의 지속 시간 계산 (분 단위)
 * @param {Date} start
 * @param {Date} end
 * @returns {number} 분
 */
function calculateDuration(start, end) {
  return Math.round((end - start) / (1000 * 60));
}

/**
 * 분을 "X시간 Y분" 형식으로 변환
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}분`;
  } else if (mins === 0) {
    return `${hours}시간`;
  } else {
    return `${hours}시간 ${mins}분`;
  }
}
