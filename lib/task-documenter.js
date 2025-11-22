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
export async function documentTask(taskNumber, weekString) { // <- weekString added
  console.log(`\n=== Task ${taskNumber} 문서화 시작 ===`);
  
  try {
    // 1. GitHub 커밋 분석
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
    
    // 2. 시간 분석 (커밋만 사용, Calendar 제거)
    console.log('\n[Phase 2] 커밋 기반 시간 분석 중...');
    const timeAnalysis = analyzeTime(commitAnalysis.commits); // <- modified
    console.log(`✓ 추정 시간: ${timeAnalysis.totalDevelopmentTime}`);
    
    // 3. 버그 분석
    console.log('\n[Phase 3] 버그 분석 중...');
    const bugAnalysis = await analyzeBugs(commitAnalysis.bugFixCommits.length, commitAnalysis.commits);
    
    // 4. Claude로 상세 문서 생성 (Phase 3에서 통합 예정, 지금은 데이터만 전달)
    console.log('\n[Phase 6] Claude로 상세 문서 생성 중...'); // Changed Phase number in log
    const detailedContent = await generateDetailedTEL({
      commitAnalysis,
      timeAnalysis,
      bugAnalysis
    });
     console.log('✓ 상세 문서 생성 완료');

    // 5. Notion 문서화
    console.log('\n[Phase 7] Notion 업데이트 중...'); // Changed Phase number in log
    await updateNotionTaskLog(
      taskNumber,
      {
        commitAnalysis,
        timeAnalysis,
        bugAnalysis,
        detailedContent
      },
      weekString
    );
    
    // (이후 Weekly Task, Debug History 업데이트 로직은 그대로 유지)
    await updateNotionWeeklyTask(taskNumber);
    if (bugAnalysis.bugs.length > 0) {
      await createDebuggingHistory(taskNumber, bugAnalysis);
    }
    
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
