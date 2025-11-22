import 'dotenv/config';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// JAMUS 프로젝트 시작일 (W01의 첫 월요일)
const PROJECT_START_DATE = new Date('2025-11-04'); // 2025년 11월 4일 월요일

interface WeekInfo {
  weekNumber: string;
  startDate: string;
  endDate: string;
  year: number;
}

// 주차 정보 계산 (월요일 시작)
function getWeekInfo(date = new Date()): WeekInfo {
  const year = date.getFullYear();

  // 이번 주 월요일 구하기
  const monday = new Date(date);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);

  // 일요일
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // 프로젝트 시작일부터 몇 주차인지 계산
  const weeksDiff = Math.floor((monday.getTime() - PROJECT_START_DATE.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const weekNumber = weeksDiff + 1 + 1; // W01부터 시작

  return {
    weekNumber: weekNumber.toString().padStart(2, '0'),
    startDate: monday.toISOString().split('T')[0],
    endDate: sunday.toISOString().split('T')[0],
    year: year
  };
}

// 해당 주차 페이지가 이미 있는지 확인
async function findExistingPage(weekNumber: string, docType: 'TEL' | 'WTL') {
  const response = await notion.databases.query({
    database_id: process.env.NOTION_UPDATE_LOGS_DB_ID!,
    filter: {
      and: [
        {
          property: '구분',
          select: {
            equals: docType
          }
        },
        {
          property: 'Name',
          title: {
            contains: `[W${weekNumber}]`
          }
        }
      ]
    }
  });

  return response.results[0];
}

// Task 내용을 Notion 블록으로 변환
function createTaskBlocks(taskData: {
  taskNumber: string | number;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  duration: string;
  expectedTime: string;
  complexity: number;
  priority: number;
  relatedFiles?: string;
  process: string[];
  testResults?: string[];
  result: string;
  issues?: Array<{ title: string; problem: string; solution: string; duration: string }>;
  blockers?: { retries: boolean; complexityChange?: string; outsource: boolean };
  learnings?: { concepts: string; improvements: string };
  links?: string[];
}) {
  const blocks: any[] = [];

  // Task 제목
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{ text: { content: `Task ${taskData.taskNumber}: ${taskData.title} - ${taskData.date}` } }]
    }
  });

  // 시간 정보
  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{ text: { content: '⏰ 시간 정보' } }]
    }
  });

  const timeInfo = [];
  if (taskData.startTime) timeInfo.push(`* 시작 시각: ${taskData.startTime}`);
  if (taskData.endTime) timeInfo.push(`* 종료 시각: ${taskData.endTime}`);
  timeInfo.push(`* 소요 시간: ${taskData.duration}`);
  timeInfo.push(`* 예상 시간: ${taskData.expectedTime}`);

  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ text: { content: timeInfo.join('\n') } }]
    }
  });

  // 태스크 정보
  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{ text: { content: '🎯 태스크 정보' } }]
    }
  });

  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{
        text: {
          content: `* 복잡도: ${taskData.complexity}점\n* 우선순위: ${taskData.priority}${taskData.relatedFiles ? `\n* 관련 파일: ${taskData.relatedFiles}` : ''}`
        }
      }]
    }
  });

  // 실행 프로세스
  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{ text: { content: '🔄 실행 프로세스' } }]
    }
  });

  taskData.process.forEach((step, index) => {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ text: { content: `${index + 1}. ${step}` } }]
      }
    });
  });

  // 완료 상태
  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [{ text: { content: '✅ 완료 상태' } }]
    }
  });

  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ text: { content: `* 결과: ${taskData.result}` } }]
    }
  });

  // 발생한 이슈 (있는 경우)
  if (taskData.issues && taskData.issues.length > 0) {
    blocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ text: { content: '🐛 발생한 이슈' } }]
      }
    });

    taskData.issues.forEach((issue, index) => {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            text: {
              content: `이슈 ${index + 1}: ${issue.title}\n* 문제: ${issue.problem}\n* 해결 방법: ${issue.solution}\n* 소요 시간: ${issue.duration}`
            }
          }]
        }
      });
    });
  }

  // 학습 내용 (있는 경우)
  if (taskData.learnings) {
    blocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ text: { content: '📚 학습 내용' } }]
      }
    });

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          text: {
            content: `* 새로 배운 개념: ${taskData.learnings.concepts}\n* 개선 포인트: ${taskData.learnings.improvements}`
          }
        }]
      }
    });
  }

  // 구분선
  blocks.push({
    object: 'block',
    type: 'divider',
    divider: {}
  });

  return blocks;
}

// 주간 페이지에 Task 내용 추가 (페이지 생성은 수동)
export async function addTaskToWeeklyPages(taskData: any) {
  const weekInfo = getWeekInfo();

  console.log(`📅 주차: W${weekInfo.weekNumber} (${weekInfo.startDate} ~ ${weekInfo.endDate})`);

  // 기존 TEL 페이지 찾기
  const existingTEL = await findExistingPage(weekInfo.weekNumber, 'TEL');

  if (!existingTEL) {
    throw new Error(`W${weekInfo.weekNumber} TEL 페이지를 찾을 수 없습니다. 먼저 수동으로 페이지를 생성해주세요.`);
  }

  console.log('📝 기존 TEL 페이지 발견 - 내용 추가 모드');
  const telPageId = existingTEL.id;
  const telUrl = (existingTEL as any).url;

  // Task 내용 추가
  const taskBlocks = createTaskBlocks(taskData);
  await notion.blocks.children.append({
    block_id: telPageId,
    children: taskBlocks
  });
  console.log('✅ TEL에 Task 내용 추가 완료');

  return {
    success: true,
    weekNumber: weekInfo.weekNumber,
    telPageId,
    telUrl
  };
}