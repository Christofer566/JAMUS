import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Notion Database IDs (환경 변수로 관리)
const TASKS_DB = process.env.NOTION_TASKS_DB_ID; // "3.0 Task Execute Log" DB
const WEEKLY_TASK_LIST_DB = process.env.NOTION_WEEKLY_TASK_DB_ID; // "1.0 Weekly Task List" DB
const DEBUGGING_HISTORY_DB = process.env.NOTION_DEBUG_HISTORY_DB_ID;
const CONTEXT_HUB_PAGE_ID = "2ba75e2c-3a2b-81b8-9bc8-fba67fa17ebc";

/**
 * "3.0 Task Execute Log" DB에 새 항목 추가 또는 업데이트
 * @param {number} taskNumber
 * @param {object} analysisData
 * @param {string} weekString - 예: "W03"
 */
export async function updateNotionTaskLog(taskNumber, analysisData, weekString) {
  const { commitAnalysis, timeAnalysis, bugAnalysis, detailedContent } = analysisData;

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
          '이름': { title: [{ text: { content: detailedContent.taskInfo.title || `Task ${taskNumber}` } }] },
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
        '완료일': { date: { start: new Date().toISOString().split('T')[0] } }, // 항상 현재 날짜 사용
        '총 커밋': { number: commitAnalysis.totalCommits },
        '버그 수정': { number: bugAnalysis.bugs.length },
        '총 개발시간': { rich_text: [{ text: { content: detailedContent.taskInfo.actualTime || timeAnalysis.totalDevelopmentTime } }] },
        'AI 구현 시간': { rich_text: [{ text: { content: timeAnalysis.aiImplementationTime } }] },
        '리뷰/수정시간': { rich_text: [{ text: { content: timeAnalysis.humanReviewTime } }] }
      }
    });
    
    // 3. 기존 페이지 내용(블록) 모두 삭제
    const existingBlocks = await notion.blocks.children.list({ block_id: pageId });
    for (const block of existingBlocks.results) {
      await notion.blocks.delete({ block_id: block.id });
    }

    // 4. 새로운 페이지 내용(블록) 생성
    const newBlocks = [];
    const { taskInfo, workContent, testResults, issues, statistics, learnings, notes, checklist } = detailedContent;

    const h2 = (content) => ({ type: 'heading_2', heading_2: { rich_text: [{ text: { content } }] } });
    const h3 = (content) => ({ type: 'heading_3', heading_3: { rich_text: [{ text: { content } }] } });
    const li = (content) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content } }] } });
    const p = (content) => ({ type: 'paragraph', paragraph: { rich_text: [{ text: { content } }] } });
    const div = () => ({ type: 'divider', divider: {} });
    const code = (text, language = 'javascript') => ({ type: 'code', code: { rich_text: [{ text: { content: text } }], language } });

    if (taskInfo) {
      newBlocks.push(h2("📋 Task 정보"));
      newBlocks.push(li(`Task ID: ${taskNumber}`));
      if(taskInfo.title) newBlocks.push(li(`제목: ${taskInfo.title}`));
      if(taskInfo.estimatedTime) newBlocks.push(li(`예상 시간: ${taskInfo.estimatedTime}`));
      if(taskInfo.actualTime) newBlocks.push(li(`실제 소요 시간: ${taskInfo.actualTime}`));
      if(taskInfo.complexity) newBlocks.push(li(`복잡도: ${taskInfo.complexity}`));
      if(taskInfo.completedAt) newBlocks.push(li(`완료 일시: ${taskInfo.completedAt}`));
      newBlocks.push(div());
    }

    if (workContent && workContent.features) {
      newBlocks.push(h2("✅ 작업 내용"));
      workContent.features.forEach(feature => {
        if(feature.section) newBlocks.push(h3(feature.section));
        feature.items?.forEach(item => newBlocks.push(li(item)));
      });
      newBlocks.push(div());
    }

    if (testResults) {
      newBlocks.push(h2("🧪 테스트 결과"));
      if(testResults.summary) newBlocks.push(p(testResults.summary));
      if (testResults.cases?.length > 0) newBlocks.push(h3("테스트 케이스"));
      testResults.cases?.forEach(c => newBlocks.push(li(c)));
      if (testResults.verified?.length > 0) newBlocks.push(h3("검증된 기능"));
      testResults.verified?.forEach(v => newBlocks.push(li(v)));
      newBlocks.push(div());
    }

    if (issues && issues.length > 0) {
      newBlocks.push(h2("🐛 발생한 이슈"));
      issues.forEach(issue => {
        newBlocks.push(h3(`이슈: ${issue.title}`));
        if(issue.problem) newBlocks.push(p(`문제: ${issue.problem}`));
        if(issue.cause) newBlocks.push(p(`원인: ${issue.cause}`));
        if(issue.solution) newBlocks.push(p(`해결: ${issue.solution}`));
        if (issue.code) newBlocks.push(code(issue.code));
      });
      newBlocks.push(div());
    }
    
    if (statistics) {
        newBlocks.push(h2("📊 통계"));
        if (statistics.timeAnalysis) {
            newBlocks.push(h3("시간 분석"));
            newBlocks.push(li(`총 개발 시간: ${statistics.timeAnalysis.total || timeAnalysis.totalDevelopmentTime}`));
            newBlocks.push(li(`AI 구현 시간: ${statistics.timeAnalysis.ai || timeAnalysis.aiImplementationTime}`));
            newBlocks.push(li(`리뷰/수정 시간: ${statistics.timeAnalysis.review || timeAnalysis.humanReviewTime}`));
        }
        if (statistics.gitStats) {
            newBlocks.push(h3("Git 통계"));
            newBlocks.push(li(`총 커밋: ${statistics.gitStats.commits || commitAnalysis.totalCommits}개`));
            newBlocks.push(li(`파일 변경: ${statistics.gitStats.filesChanged || commitAnalysis.filesChanged}개`));
            newBlocks.push(li(`코드 변경량: +${statistics.gitStats.additions || commitAnalysis.additions} / -${statistics.gitStats.deletions || commitAnalysis.deletions}`));
        }
        newBlocks.push(div());
    }

    if (learnings && learnings.length > 0) {
        newBlocks.push(h2("💡 학습 내용"));
        learnings.forEach(learning => {
            if(learning.title) newBlocks.push(h3(learning.title));
            if(learning.description) newBlocks.push(p(learning.description));
            if (learning.code) newBlocks.push(code(learning.code));
        });
        newBlocks.push(div());
    }
    
    if (notes) {
        newBlocks.push(h2("📝 메모"));
        if (notes.successFactors?.length > 0) {
            newBlocks.push(h3("성공 요인"));
            notes.successFactors.forEach(factor => newBlocks.push(li(factor)));
        }
        if (notes.warnings?.length > 0) {
            newBlocks.push(h3("주의사항"));
            notes.warnings.forEach(warning => newBlocks.push(li(warning)));
        }
        newBlocks.push(div());
    }

    if(checklist && checklist.length > 0) {
        newBlocks.push(h2("✅ 체크리스트"));
        checklist.forEach(item => newBlocks.push({ type: 'to_do', to_do: { rich_text: [{ text: { content: item } }], checked: true } }));
    }

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
export async function updateNotionWeeklyTask(taskNumber, weekString) {
  try {
    // 1. "W03" -> 3 과 같이 주차(week) 숫자 추출
    const weekNumber = parseInt(weekString.replace('W', ''));
    if (isNaN(weekNumber)) {
        console.warn(`[WTL] Invalid weekString format: ${weekString}`);
        return;
    }

    // 2. WTL DB에서 해당 주차의 페이지를 찾음
    const weekPages = await notion.databases.query({
      database_id: WEEKLY_TASK_LIST_DB,
      filter: {
        property: 'Week', // 'Week' 속성 (Number 타입)
        number: {
          equals: weekNumber
        }
      }
    });

    if (weekPages.results.length === 0) {
      console.warn(`[WTL] Weekly page for '${weekString}' not found.`);
      return;
    }
    const weeklyPageId = weekPages.results[0].id;

    // 3. 페이지 내부의 모든 블록을 가져옴
    const blocksResponse = await notion.blocks.children.list({ block_id: weeklyPageId });
    
    // 4. "Task 6.13" -> "Task 6" 와 같이 검색할 텍스트 생성
    const taskIdentifier = `Task ${Math.floor(taskNumber)}`;
    let targetBlock = null;

    for (const block of blocksResponse.results) {
      if (block.type === 'to_do' && block.to_do.rich_text[0]?.plain_text.includes(taskIdentifier)) {
        targetBlock = block;
        break;
      }
    }

    if (!targetBlock) {
      console.warn(`[WTL] To-do block for '${taskIdentifier}' not found in page '${weekString}'.`);
      return;
    }

    // 5. 해당 Task의 체크박스를 '완료'로 업데이트
    if (targetBlock.to_do.checked === false) {
      await notion.blocks.update({
        block_id: targetBlock.id,
        to_do: {
          rich_text: targetBlock.to_do.rich_text,
          checked: true
        }
      });
      console.log(`✓ [WTL] Checked off '${taskIdentifier}' in page '${weekString}'.`);
    } else {
      console.log(`✓ [WTL] '${taskIdentifier}' was already checked.`);
    }

  } catch (error) {
    console.error('Weekly Task List 업데이트 실패:', error);
    // 이 단계는 문서화의 핵심 기능이 아니므로, 오류를 발생시켜 전체 프로세스를 중단시키지 않음
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

/**
 * TEL 업데이트 시 Context Hub 전체 업데이트
 * @param {number} completedTaskNumber - 완료된 Task 번호
 * @param {string} weekString - 예: "W03"
 */
export async function updateContextHubOnTEL(completedTaskNumber, weekString) {
  try {
    console.log('\n[Context Hub] TEL 업데이트 시 Context Hub 업데이트 시작...');

    // 1. 커밋 로그 리셋 (기존 로그 삭제)
    await resetCommitLogs();

    // 2. Current Position 업데이트
    await updateCurrentPosition(completedTaskNumber);

    // 3. Recently Completed 추가
    await addRecentlyCompleted(completedTaskNumber, weekString);

    // 4. Next Actions 업데이트
    await updateNextActions(completedTaskNumber + 1);

    // 5. Next Task Detail 업데이트
    await updateNextTaskDetail(completedTaskNumber + 1, weekString);

    console.log('[Context Hub] 업데이트 완료');

  } catch (error) {
    console.error('[Context Hub] 업데이트 실패:', error);
    // 실패해도 메인 프로세스는 계속 진행
  }
}

/**
 * 커밋 로그 리셋 - "✅ [" 로 시작하는 모든 로그 삭제
 */
async function resetCommitLogs() {
  try {
    const blocksResponse = await notion.blocks.children.list({ block_id: CONTEXT_HUB_PAGE_ID, page_size: 100 });

    let deletedCount = 0;
    for (const block of blocksResponse.results) {
      if (block.type === 'paragraph' && block.paragraph.rich_text[0]?.text?.content?.startsWith('✅ [')) {
        await notion.blocks.delete({ block_id: block.id });
        deletedCount++;
        await delay(300);
      }
    }

    console.log(`[Context Hub] 커밋 로그 ${deletedCount}개 삭제`);
  } catch (error) {
    console.error('[Context Hub] 커밋 로그 리셋 실패:', error);
  }
}

/**
 * Current Position 테이블 업데이트
 */
async function updateCurrentPosition(completedTaskNumber) {
  try {
    const blocksResponse = await notion.blocks.children.list({ block_id: CONTEXT_HUB_PAGE_ID, page_size: 100 });

    // "Current Position" 테이블 찾기 (첫 번째 테이블로 가정)
    const tableBlock = blocksResponse.results.find(b => b.type === 'table');
    if (!tableBlock) {
      console.warn('[Context Hub] Current Position 테이블을 찾을 수 없습니다');
      return;
    }

    const tableRows = await notion.blocks.children.list({ block_id: tableBlock.id });

    for (const row of tableRows.results) {
      if (row.type !== 'table_row') continue;

      const firstCell = row.table_row.cells[0]?.[0]?.text?.content;

      if (firstCell === '활성 Task') {
        const nextTask = Math.floor(completedTaskNumber) + 1;
        await notion.blocks.update({
          block_id: row.id,
          table_row: {
            cells: [
              [{ type: 'text', text: { content: '활성 Task' } }],
              [{ type: 'text', text: { content: `Task ${nextTask}` } }]
            ]
          }
        });
        console.log(`[Context Hub] 활성 Task → Task ${nextTask}`);
        await delay(300);
      }
    }

  } catch (error) {
    console.error('[Context Hub] Current Position 업데이트 실패:', error);
  }
}

/**
 * Recently Completed 테이블에 완료 Task 추가
 */
async function addRecentlyCompleted(taskNumber, weekString) {
  try {
    const blocksResponse = await notion.blocks.children.list({ block_id: CONTEXT_HUB_PAGE_ID, page_size: 100 });

    // 두 번째 테이블을 Recently Completed로 가정
    const tables = blocksResponse.results.filter(b => b.type === 'table');
    if (tables.length < 2) {
      console.warn('[Context Hub] Recently Completed 테이블을 찾을 수 없습니다');
      return;
    }

    const recentlyCompletedTable = tables[1];
    const completedDate = new Date().toISOString().split('T')[0];

    // 새 행 추가 (테이블 끝에 추가)
    await notion.blocks.children.append({
      block_id: recentlyCompletedTable.id,
      children: [{
        type: 'table_row',
        table_row: {
          cells: [
            [{ type: 'text', text: { content: weekString } }],
            [{ type: 'text', text: { content: `Task ${Math.floor(taskNumber)}` } }],
            [{ type: 'text', text: { content: completedDate } }]
          ]
        }
      }]
    });

    console.log(`[Context Hub] Recently Completed에 Task ${Math.floor(taskNumber)} 추가`);

    // 10개 초과 시 가장 오래된 행 삭제
    const tableRows = await notion.blocks.children.list({ block_id: recentlyCompletedTable.id });
    const dataRows = tableRows.results.filter(r => r.type === 'table_row').slice(1); // 헤더 제외

    if (dataRows.length > 10) {
      const oldestRow = dataRows[0];
      await notion.blocks.delete({ block_id: oldestRow.id });
      console.log('[Context Hub] 가장 오래된 행 삭제 (10개 초과)');
    }

  } catch (error) {
    console.error('[Context Hub] Recently Completed 업데이트 실패:', error);
  }
}

/**
 * Next Actions 섹션 업데이트
 */
async function updateNextActions(nextTaskNumber) {
  try {
    const blocksResponse = await notion.blocks.children.list({ block_id: CONTEXT_HUB_PAGE_ID, page_size: 100 });

    // WTL에서 다음 Task의 Phase 정보 가져오기
    const nextTaskPhases = await getNextTaskPhasesFromWTL(nextTaskNumber);

    // "Next Actions" heading 찾기
    let nextActionsIndex = -1;
    for (let i = 0; i < blocksResponse.results.length; i++) {
      const block = blocksResponse.results[i];
      if (block.type === 'heading_2' || block.type === 'heading_3') {
        const text = block[block.type].rich_text[0]?.text?.content || '';
        if (text.includes('Next Actions')) {
          nextActionsIndex = i;
          break;
        }
      }
    }

    if (nextActionsIndex === -1) {
      console.warn('[Context Hub] Next Actions 섹션을 찾을 수 없습니다');
      return;
    }

    // 기존 Phase 항목들 삭제 (다음 heading 또는 divider까지)
    const blocksToDelete = [];
    for (let i = nextActionsIndex + 1; i < blocksResponse.results.length; i++) {
      const block = blocksResponse.results[i];
      if (block.type === 'heading_2' || block.type === 'heading_3' || block.type === 'divider') {
        break;
      }
      if (block.type === 'paragraph' || block.type === 'to_do') {
        blocksToDelete.push(block.id);
      }
    }

    for (const blockId of blocksToDelete) {
      await notion.blocks.delete({ block_id: blockId });
      await delay(300);
    }

    // 새 Phase 항목 추가
    const newBlocks = nextTaskPhases.map(phase => ({
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: `⏳ Phase ${phase.number}: ${phase.title}` } }]
      }
    }));

    if (newBlocks.length > 0) {
      await notion.blocks.children.append({
        block_id: CONTEXT_HUB_PAGE_ID,
        children: newBlocks,
        after: blocksResponse.results[nextActionsIndex].id
      });
    }

    console.log(`[Context Hub] Next Actions 업데이트 - ${nextTaskPhases.length}개 Phase`);

  } catch (error) {
    console.error('[Context Hub] Next Actions 업데이트 실패:', error);
  }
}

/**
 * Next Task Detail 섹션 업데이트
 */
async function updateNextTaskDetail(nextTaskNumber, weekString) {
  try {
    const blocksResponse = await notion.blocks.children.list({ block_id: CONTEXT_HUB_PAGE_ID, page_size: 100 });

    // WTL에서 다음 Task 정보 가져오기
    const nextTaskInfo = await getTaskInfoFromWTL(nextTaskNumber, weekString);
    if (!nextTaskInfo) {
      console.log('[Context Hub] 다음 Task 정보를 찾을 수 없습니다 - Next Task Detail 스킵');
      return;
    }

    // "Next Task Detail" heading 찾기
    let nextTaskDetailIndex = -1;
    for (let i = 0; i < blocksResponse.results.length; i++) {
      const block = blocksResponse.results[i];
      if (block.type === 'heading_2' || block.type === 'heading_3') {
        const text = block[block.type].rich_text[0]?.text?.content || '';
        if (text.includes('Next Task Detail')) {
          nextTaskDetailIndex = i;
          break;
        }
      }
    }

    if (nextTaskDetailIndex === -1) {
      console.warn('[Context Hub] Next Task Detail 섹션을 찾을 수 없습니다');
      return;
    }

    // 기존 내용 삭제 (다음 heading 또는 마지막까지)
    const blocksToDelete = [];
    for (let i = nextTaskDetailIndex + 1; i < blocksResponse.results.length; i++) {
      const block = blocksResponse.results[i];
      if (block.type === 'heading_2') {
        break;
      }
      blocksToDelete.push(block.id);
    }

    for (const blockId of blocksToDelete) {
      await notion.blocks.delete({ block_id: blockId });
      await delay(300);
    }

    // 새 내용 추가
    const newBlocks = [
      { type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `📋 Task ${nextTaskNumber}: ${nextTaskInfo.title || '제목 없음'}` } }] } },
      { type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `복잡도: ${nextTaskInfo.complexity || '-'}/10` } }] } }
    ];

    if (nextTaskInfo.phases && nextTaskInfo.phases.length > 0) {
      newBlocks.push({ type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: '구현 목표' } }] } });
      nextTaskInfo.phases.forEach(phase => {
        newBlocks.push({
          type: 'to_do',
          to_do: {
            rich_text: [{ type: 'text', text: { content: `Phase ${phase.number}: ${phase.title}` } }],
            checked: false
          }
        });
      });
    }

    if (newBlocks.length > 0) {
      await notion.blocks.children.append({
        block_id: CONTEXT_HUB_PAGE_ID,
        children: newBlocks,
        after: blocksResponse.results[nextTaskDetailIndex].id
      });
    }

    console.log(`[Context Hub] Next Task Detail 업데이트 - Task ${nextTaskNumber}`);

  } catch (error) {
    console.error('[Context Hub] Next Task Detail 업데이트 실패:', error);
  }
}

/**
 * WTL에서 다음 Task의 Phase 목록 가져오기
 */
async function getNextTaskPhasesFromWTL(taskNumber) {
  try {
    // WTL DB에서 해당 Task 페이지 찾기
    const pages = await notion.databases.query({
      database_id: WEEKLY_TASK_LIST_DB,
      page_size: 100
    });

    // Task 번호가 포함된 to_do 블록 찾기
    const taskIdentifier = `Task ${taskNumber}`;

    for (const page of pages.results) {
      const blocks = await notion.blocks.children.list({ block_id: page.id });

      for (const block of blocks.results) {
        if (block.type === 'to_do') {
          const text = block.to_do.rich_text[0]?.plain_text || '';
          if (text.includes(taskIdentifier)) {
            // 이 블록의 하위 블록(Phase 목록) 가져오기
            const childBlocks = await notion.blocks.children.list({ block_id: block.id });
            const phases = [];

            childBlocks.results.forEach((child, index) => {
              if (child.type === 'to_do' || child.type === 'bulleted_list_item') {
                const phaseText = child[child.type].rich_text[0]?.plain_text || '';
                phases.push({
                  number: index + 1,
                  title: phaseText
                });
              }
            });

            return phases;
          }
        }
      }
    }

    return [];
  } catch (error) {
    console.error('[Context Hub] WTL Phase 조회 실패:', error);
    return [];
  }
}

/**
 * WTL에서 Task 정보 가져오기
 */
async function getTaskInfoFromWTL(taskNumber, weekString) {
  try {
    const weekNumber = parseInt(weekString.replace('W', ''));

    const pages = await notion.databases.query({
      database_id: WEEKLY_TASK_LIST_DB,
      filter: {
        property: 'Week',
        number: { equals: weekNumber }
      }
    });

    if (pages.results.length === 0) return null;

    const pageId = pages.results[0].id;
    const blocks = await notion.blocks.children.list({ block_id: pageId });

    const taskIdentifier = `Task ${taskNumber}`;

    for (const block of blocks.results) {
      if (block.type === 'to_do') {
        const text = block.to_do.rich_text[0]?.plain_text || '';
        if (text.includes(taskIdentifier)) {
          // Task 제목 파싱 (예: "Task 1: 제목")
          const titleMatch = text.match(/Task \d+:\s*(.+)/);
          const title = titleMatch ? titleMatch[1] : text;

          // 하위 블록(Phase) 가져오기
          const childBlocks = await notion.blocks.children.list({ block_id: block.id });
          const phases = [];

          childBlocks.results.forEach((child, index) => {
            if (child.type === 'to_do' || child.type === 'bulleted_list_item') {
              const phaseText = child[child.type].rich_text[0]?.plain_text || '';
              phases.push({
                number: index + 1,
                title: phaseText
              });
            }
          });

          return {
            title,
            complexity: null, // WTL에서 복잡도 정보가 있다면 추가
            phases
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[Context Hub] WTL Task 정보 조회 실패:', error);
    return null;
  }
}

/**
 * 딜레이 유틸리티 (Rate limit 방지)
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
