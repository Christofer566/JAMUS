import { analyzeGitHubCommits } from './github-analyzer.js';
import { analyzeBugs } from './bug-analyzer.js';
import { analyzeTime } from './time-analyzer.js';
import { updateNotionTaskLog, updateNotionWeeklyTask, createDebuggingHistory } from './notion-updater.js';
import { generateDetailedTEL } from './notion-content-generator.js';

/**
 * Task 완료 문서화 메인 함수
 * @param {number} taskNumber - Task 번호 (예: 6)
 * @returns {Promise<Object>} 문서화 결과
 */
export async function documentTask(taskNumber) {
  console.log(`\n=== Task ${taskNumber} 문서화 시작 ===`);
  
  try {
    // Phase 1: GitHub 커밋 분석
    console.log('\n[Phase 1] GitHub 커밋 분석 중...');
    const commitAnalysis = await analyzeGitHubCommits(taskNumber);
    
    if (!commitAnalysis.commits || commitAnalysis.commits.length === 0) {
      throw new Error(`Task ${taskNumber}에 대한 커밋을 찾을 수 없습니다.`);
    }
    
    console.log(`- 총 커밋: ${commitAnalysis.totalCommits}개`);
    console.log(`- 구현 커밋: ${commitAnalysis.implementationCommits.length}개`);
    console.log(`- 버그 수정: ${commitAnalysis.bugFixCommits.length}개`);
    console.log(`- 파일 변경: ${commitAnalysis.filesChanged}개`);
    console.log(`- 추가: +${commitAnalysis.additions} / 삭제: -${commitAnalysis.deletions}`);
    
    // Phase 2: 시간 분석
    console.log('\n[Phase 2] 시간 분석 중...');
    const timeAnalysis = await analyzeTime(
      commitAnalysis.firstCommitTime,
      commitAnalysis.lastCommitTime,
      commitAnalysis.commitGaps
    );
    
    console.log(`- 총 개발 시간: ${timeAnalysis.totalDevelopmentTime}`);
    console.log(`- AI 구현 시간: ${timeAnalysis.aiImplementationTime}`);
    console.log(`- 리뷰/수정 시간: ${timeAnalysis.humanReviewTime}`);
    console.log(`- 개발 세션: ${timeAnalysis.developmentSessions.length}개`);
    
    // Phase 3: 버그 분석
    console.log('\n[Phase 3] 버그 분석 중...');
    const bugAnalysis = await analyzeBugs(commitAnalysis.bugFixCommits.length, commitAnalysis.commits);
    
    if (bugAnalysis.bugs.length > 0) {
      console.log(`- 발견된 버그: ${bugAnalysis.bugs.length}개`);
      console.log(`- 총 수정 시도: ${bugAnalysis.totalFixAttempts}회`);
      console.log(`- 평균 수정 시간: ${bugAnalysis.averageFixTime}`);
    } else {
      console.log('- 버그 없음 (완벽한 구현!)');
    }
    
    // Phase 4: Notion 업데이트
    console.log('\n[Phase 4] Notion 문서 업데이트 중...');
    
    // Phase 3.5: Claude로 상세 문서 생성
    console.log('\n[Phase 3.5] Claude로 상세 문서 생성 중...');
    const detailedContent = await generateDetailedTEL({
      commitAnalysis,
      timeAnalysis,
      bugAnalysis
    });
    console.log('✓ 상세 문서 생성 완료');

    // 4-1: Task Execution Log 업데이트
    console.log('  → Task Execution Log 업데이트...');
    await updateNotionTaskLog(
      taskNumber,
      {
        commitAnalysis,
        timeAnalysis,
        bugAnalysis,
        detailedContent  // ← 추가
      },
      "W03" // 임시 주차 문자열 전달
    );
    console.log('  ✓ Task Execution Log 업데이트 완료');

    // TODO: NOTION_WEEKLY_TASK_DB_ID 환경 변수 설정 후 주석 해제 필요
    // // 4-2: Weekly Task List 체크박스 업데이트
    // console.log('  → Weekly Task List 체크박스 업데이트...');
    // await updateNotionWeeklyTask(taskNumber);
    // console.log('  ✓ Weekly Task List 체크박스 업데이트 완료');

    // TODO: NOTION_DEBUG_HISTORY_DB_ID 환경 변수 설정 후 주석 해제 필요
    // // 4-3: Debugging History 생성 (버그가 있는 경우)
    // if (bugAnalysis.bugs.length > 0) {
    //   console.log('  → Debugging History 생성...');
    //   await createDebuggingHistory(taskNumber, bugAnalysis);
    //   console.log('  ✓ Debugging History 생성 완료');
    // }
    
    console.log('\n=== Task 문서화 완료 ===\n');
    
    return {
      success: true,
      taskNumber,
      summary: {
        commits: commitAnalysis.totalCommits,
        bugs: bugAnalysis.bugs.length,
        totalTime: timeAnalysis.totalDevelopmentTime,
        aiTime: timeAnalysis.aiImplementationTime,
        humanTime: timeAnalysis.humanReviewTime
      }
    };
    
  } catch (error) {
    console.error(`\n❌ Task ${taskNumber} 문서화 실패:`, error.message);
    throw error;
  }
}

/**
 * 여러 Task를 한번에 문서화
 * @param {number[]} taskNumbers - Task 번호 배열
 * @returns {Promise<Object[]>} 각 Task의 문서화 결과
 */
export async function documentMultipleTasks(taskNumbers) {
  console.log(`\n=== ${taskNumbers.length}개 Task 일괄 문서화 시작 ===`);
  
  const results = [];
  
  for (const taskNumber of taskNumbers) {
    try {
      const result = await documentTask(taskNumber);
      results.push(result);
      
      // API Rate Limit 방지를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      results.push({
        success: false,
        taskNumber,
        error: error.message
      });
    }
  }
  
  console.log('\n=== 일괄 문서화 완료 ===');
  console.log(`성공: ${results.filter(r => r.success).length}개`);
  console.log(`실패: ${results.filter(r => !r.success).length}개\n`);
  
  return results;
}

/**
 * 현재 주의 완료된 모든 Task 자동 문서화
 * @returns {Promise<Object[]>} 문서화 결과
 */
export async function documentCurrentWeekTasks() {
  console.log('\n=== 현재 주 완료 Task 자동 문서화 ===');
  
  // TODO: Weekly Task List에서 완료된 Task 번호들을 자동으로 추출
  // 현재는 수동으로 Task 번호를 전달받는 방식
  
  console.log('이 기능은 추후 구현 예정입니다.');
  console.log('현재는 documentTask() 또는 documentMultipleTasks()를 사용하세요.\n');
  
  return [];
}
