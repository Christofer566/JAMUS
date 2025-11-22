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
    // 1. 페이지 찾기 또는 생성
    let pageId;
    const existingPages = await notion.databases.query({
      database_id: TASKS_DB,
      filter: { property: 'Task', number: { equals: taskNumber } }
    });

    if (existingPages.results.length > 0) {
      pageId = existingPages.results[0].id;
      console.log('기존 Task Log 업데이트:', pageId);
    } else {
      const newPage = await notion.pages.create({
        parent: { database_id: TASKS_DB },
        properties: {
          '이름': { title: [{ text: { content: `Task ${taskNumber}` } }] },
          'Task': { number: taskNumber },
        }
      });
      pageId = newPage.id;
      console.log('새 Task Log 생성:', pageId);
    }

    // 2. 페이지 속성 업데이트
    await notion.pages.update({
      page_id: pageId,
      properties: {
        '주차': { select: { name: weekString } },
        '완료일': { date: { start: new Date().toISOString().split('T')[0] } },
        '총 커밋': { number: commitAnalysis.totalCommits },
        '버그 수정': { number: bugAnalysis.bugs.length },
        '총 개발시간': { rich_text: [{ text: { content: timeAnalysis.totalDevelopmentTime } }] },
        'AI 구현 시간': { rich_text: [{ text: { content: timeAnalysis.aiImplementationTime } }] },
        '리뷰/수정시간': { rich_text: [{ text: { content: timeAnalysis.humanReviewTime } }] }
      }
    });
    
    // 3. 기존 페이지 내용(블록) 모두 삭제
    const existingBlocks = await notion.blocks.children.list({ block_id: pageId });
    for (const block of existingBlocks.results) {
      await notion.blocks.delete({ block_id: block.id });
    }

    // 안정화 대기
    console.log('⏳ 블록 삭제 후 3초 대기...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. 새로운 페이지 내용(블록) 생성
    const newBlocks = [
      // 1. Task 정보
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: "📋 Task 정보" } }] } },
      { type: 'paragraph', paragraph: { rich_text: [{ text: { content: `Task ${taskNumber}에 대한 자동 생성된 실행 기록입니다.` } }] } },
      { type: 'divider', divider: {} },
      // 2. 작업 내용
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: "✅ 작업 내용" } }] } },
      { type: 'heading_3', heading_3: { rich_text: [{ text: { content: "구현한 기능" } }] } },
      ...commitAnalysis.implementationCommits.map(commit => ({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: commit.message.replace(/^Task \d+(\.\d+)*:?\s*/, '') } }] }
      })),
      { type: 'divider', divider: {} },
      // 3. 테스트 결과
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: "🧪 테스트 결과" } }] } },
      { type: 'paragraph', paragraph: { rich_text: [{ text: { content: "자동 문서화 시스템을 통해 정상적으로 기록되었습니다." } }] } },
      { type: 'divider', divider: {} },
      // 4. 발생한 이슈
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: "🐛 발생한 이슈" } }] } },
      ...(bugAnalysis.bugs.length > 0 ? bugAnalysis.bugs.map(bug => ({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `${bug.description} (수정 시도: ${bug.fixAttempts.length}회, 소요 시간: ${bug.fixTime})` } }] }
      })) : [{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: "보고된 버그 없음." } }] } }]),
      { type: 'divider', divider: {} },
      // 5. 통계
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: "📊 통계" } }] } },
      { type: 'heading_3', heading_3: { rich_text: [{ text: { content: "시간 분석" } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: `총 개발 시간: ${timeAnalysis.totalDevelopmentTime}` } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: `AI 구현 시간: ${timeAnalysis.aiImplementationTime}` } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: `리뷰/수정 시간: ${timeAnalysis.humanReviewTime}` } }] } },
      { type: 'heading_3', heading_3: { rich_text: [{ text: { content: "Git 통계" } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: `총 커밋: ${commitAnalysis.totalCommits}개` } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: `버그 수정 커밋: ${commitAnalysis.bugFixCommits.length}개` } }] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: `코드 변경량: +${commitAnalysis.additions} / -${commitAnalysis.deletions}` } }] } },
      { type: 'divider', divider: {} },
      // 6. 학습 내용
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: "💡 학습 내용" } }] } },
      { type: 'paragraph', paragraph: { rich_text: [{ text: { content: "[여기에 수동으로 학습 내용 추가]" } }] } },
      { type: 'divider', divider: {} },
      // 7. 커밋 상세
      { type: 'heading_2', heading_2: { rich_text: [{ text: { content: "📊 커밋 상세" } }] } },
      ...commitAnalysis.commits.slice(0, 10).map(commit => ({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `${commit.sha}: ${commit.message.split('\n')[0]}` } }] }
      }))
    ];

    // 5. 페이지에 새로운 내용 추가 (100개 블록씩 나눠서)
    for (let i = 0; i < newBlocks.length; i += 100) {
        await notion.blocks.children.append({
            block_id: pageId,
            children: newBlocks.slice(i, i + 100)
        });
    }

    console.log('✓ Task Execution Log 전체 구조 업데이트 완료');

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
