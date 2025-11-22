import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Notion Database IDs (환경 변수로 관리)
const TASKS_DB = process.env.NOTION_TASKS_DB_ID; // "3.0 Task Execute Log" DB
const WEEKLY_TASK_LIST_DB = process.env.NOTION_WEEKLY_TASK_DB_ID; // "1.0 Weekly Task List" DB
const DEBUGGING_HISTORY_DB = process.env.NOTION_DEBUG_HISTORY_DB_ID;

/**
 * "3.0 Task Execute Log" DB에 새 항목 추가 또는 업데이트
 * @param {number} taskNumber
 * @param {object} analysisData
 * @param {string} weekString - 예: "W03"
 */
export async function updateNotionTaskLog(taskNumber, analysisData, weekString) {
  const { commitAnalysis, timeAnalysis, bugAnalysis } = analysisData;

  try {
    // 기존 Task 항목이 있는지 확인
    const existingPages = await notion.databases.query({
      database_id: TASKS_DB,
      filter: {
        property: 'Task',
        number: {
          equals: taskNumber
        }
      }
    });

    let pageId;

    if (existingPages.results.length > 0) {
      // 기존 항목 업데이트
      pageId = existingPages.results[0].id;
      console.log('기존 Task Log 업데이트:', pageId);

      await notion.pages.update({
        page_id: pageId,
        properties: {
          '주차': { select: { name: weekString } },
          '완료일': { date: { start: new Date().toISOString().split('T')[0] } },
          '총 커밋': { number: commitAnalysis.totalCommits },
          '버그 수정': { number: commitAnalysis.bugFixCommits.length },
          '총 개발시간': { rich_text: [{ text: { content: timeAnalysis.totalDevelopmentTime } }] },
          'AI 구현 시간': { rich_text: [{ text: { content: timeAnalysis.aiImplementationTime } }] },
          '리뷰/수정시간': { rich_text: [{ text: { content: timeAnalysis.humanReviewTime } }] }
        }
      });

    } else {
      // 새 항목 생성
      console.log('새 Task Log 생성');

      const response = await notion.pages.create({
        parent: { database_id: TASKS_DB },
        properties: {
          'Task': { number: taskNumber },
          '주차': { select: { name: weekString } },
          '완료일': { date: { start: new Date().toISOString().split('T')[0] } },
          '총 커밋': { number: commitAnalysis.totalCommits },
          '버그 수정': { number: bugAnalysis.bugFixCommits.length }, // <- Fixed this line
          '총 개발시간': { rich_text: [{ text: { content: timeAnalysis.totalDevelopmentTime } }] },
          'AI 구현 시간': { rich_text: [{ text: { content: timeAnalysis.aiImplementationTime } }] },
          '리뷰/수정시간': { rich_text: [{ text: { content: timeAnalysis.humanReviewTime } }] }
        }
      });

      pageId = response.id;
    }

    // 페이지 내용 업데이트 (커밋 상세 정보)
    const commitBlocks = commitAnalysis.commits.slice(0, 10).map(commit => ({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{
          type: 'text',
          text: {
            content: `${commit.sha}: ${commit.message.split('\n')[0]}`
          }
        }]
      }
    }));

    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '📊 커밋 상세' } }]
          }
        },
        ...commitBlocks
      ]
    });

    console.log('✓ Task Execution Log 업데이트 완료');

  } catch (error) {
    console.error('Notion Task Log 업데이트 실패:', error);
    throw error;
  }
}

/**
 * "1.0 Weekly Task List" DB에서 Task 체크박스 업데이트
 */
export async function updateNotionWeeklyTask(taskNumber) {
  try {
    // Task 항목 찾기
    const pages = await notion.databases.query({
      database_id: WEEKLY_TASK_LIST_DB,
      filter: {
        property: 'Task',
        number: {
          equals: taskNumber
        }
      }
    });

    if (pages.results.length === 0) {
      console.warn(`Weekly Task List에서 Task ${taskNumber}를 찾을 수 없습니다`);
      return;
    }

    const pageId = pages.results[0].id;

    // 완료 체크박스 업데이트
    await notion.pages.update({
      page_id: pageId,
      properties: {
        '완료': {
          checkbox: true
        }
      }
    });

    console.log('✓ Weekly Task List 체크박스 업데이트 완료');

  } catch (error) {
    console.error('Weekly Task List 업데이트 실패:', error);
    throw error;
  }
}

/**
 * Debugging History에 버그 기록 추가
 */
export async function createDebuggingHistory(taskNumber, bugAnalysis) {
  try {
    for (const bug of bugAnalysis.bugs) {
      await notion.pages.create({
        parent: { database_id: DEBUGGING_HISTORY_DB },
        properties: {
          'Task': {
            number: taskNumber
          },
          '버그 설명': {
            title: [{
              text: { content: bug.description }
            }]
          },
          '발견 시각': {
            date: {
              start: bug.firstDetectedAt.toISOString()
            }
          },
          '해결 시각': {
            date: {
              start: bug.resolvedAt.toISOString()
            }
          },
          '수정 시도': {
            number: bug.fixAttempts.length
          },
          '소요 시간': {
            rich_text: [{
              text: { content: bug.fixTime }
            }]
          }
        }
      });
    }

    console.log(`✓ Debugging History ${bugAnalysis.bugs.length}개 항목 생성 완료`);

  } catch (error) {
    console.error('Debugging History 생성 실패:', error);
    throw error;
  }
}
