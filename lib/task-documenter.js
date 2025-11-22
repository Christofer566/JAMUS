import { analyzeGitHubCommits } from './github-analyzer.js';
import { analyzeBugs } from './bug-analyzer.js';
import { analyzeTime } from './time-analyzer.js';
import { createDevelopmentEvent, getDevelopmentEventTime } from './google-calendar.js';
import { updateNotionTaskLog, updateNotionWeeklyTask, createDebuggingHistory } from './notion-updater.js';
import { generateDetailedTEL } from './notion-content-generator.js';
import { sendSlackMessage } from './slack-client.js';


export async function documentTask(taskNumber, weekString) {
  console.log(`\n=== Task ${taskNumber} 문서화 시작 ===`);
  const channel = process.env.SLACK_CHANNEL_ID;
  
  try {
    // 1. GitHub 커밋 분석
    console.log('\n[Phase 1] GitHub 커밋 분석 중...');
    const commitAnalysis = await analyzeGitHubCommits(taskNumber);

    // 2. 시간 분석 (커밋만 사용)
    console.log('\n[Phase 2] 커밋 기반 시간 분석 중...');
    const timeAnalysis = analyzeTime(commitAnalysis.commits);
    console.log(`✓ 추정 시간: ${timeAnalysis.totalDevelopmentTime}`);

    // 3. 버그 분석
    console.log('\n[Phase 3] 버그 분석 중...');
    const bugAnalysis = await analyzeBugs(commitAnalysis.bugFixCommits.length, commitAnalysis.commits);

    // 4. Google Calendar에 임시 기록
    let calendarEvent;
    try {
      console.log('\n[Phase 4] Google Calendar에 임시 기록 중...');
      calendarEvent = await createDevelopmentEvent(
        taskNumber,
        timeAnalysis,
        commitAnalysis.commits
      );
    } catch (error) {
      console.log('⚠️ Calendar 기록 실패 (문서화는 계속):', error);
    }

    // 5. Slack 알림 (사용자 확인 요청)
    await sendSlackMessage(
      channel,
      `📝 Task ${taskNumber} 시간 추정 완료\n\n` +
      `✅ 추정 총 시간: ${timeAnalysis.totalDevelopmentTime}\n` +
      `✅ AI 구현: ${timeAnalysis.aiImplementationTime}\n` +
      `✅ 리뷰/수정: ${timeAnalysis.humanReviewTime}\n\n` +
      `👉 <${calendarEvent.htmlLink}|Google Calendar에서 확인 및 수정>\n` +
      `⏰ 5분 후에 최종 시간을 확정하여 문서화를 진행합니다.`
    );

    // 6. 5분 대기 (사용자 수정 시간)
    console.log('⏰ 사용자 확인 대기 중 (5분)...');
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

    // 7. Calendar에서 최종 시간 다시 읽기
    console.log('\n[Phase 5] Calendar에서 최종 시간 확인 중...');
    const finalTimeResult = await getDevelopmentEventTime(taskNumber);
    
    // 수정된 시간이 있으면 사용, 없으면 원래 추정값 사용
    const finalTimeData = finalTimeResult 
      ? { ...timeAnalysis, totalDevelopmentTime: finalTimeResult.totalTime, totalMinutes: finalTimeResult.totalMinutes } 
      : timeAnalysis;
      
    console.log(`✓ 최종 확정 시간: ${finalTimeData.totalDevelopmentTime}`);
    
    // 8. Claude로 상세 문서 생성
    console.log('\n[Phase 6] Claude로 상세 문서 생성 중...');
    const detailedContent = await generateDetailedTEL({
      commitAnalysis,
      timeAnalysis: finalTimeData,
      bugAnalysis
    });
    
    // 9. Notion 문서화
    console.log('\n[Phase 7] Notion 업데이트 중...');
    await updateNotionTaskLog(
      taskNumber,
      {
        commitAnalysis,
        timeAnalysis: finalTimeData,
        bugAnalysis,
        detailedContent
      },
      weekString
    );
    await updateNotionWeeklyTask(taskNumber, weekString);
    if (bugAnalysis.bugs.length > 0) {
      await createDebuggingHistory(taskNumber, bugAnalysis);
    }
    
    // 10. 완료 알림
    await sendSlackMessage(
      channel,
      `✅ Task ${taskNumber} 문서화 완료!\n` +
      `최종 시간: ${finalTimeData.totalDevelopmentTime}`
    );
    
    console.log('\n=== Task 문서화 완료 ===\n');

    return { 
      success: true,
      summary: {
        commits: commitAnalysis.totalCommits,
        bugs: bugAnalysis.bugs.length,
        totalTime: finalTimeData.totalDevelopmentTime,
        aiTime: finalTimeData.aiImplementationTime,
        humanTime: finalTimeData.humanReviewTime
      }
    };
    
  } catch (error) {
    console.error(`\n❌ Task ${taskNumber} 문서화 실패:`, error.message);
    throw error;
  }
}

// documentMultipleTasks 와 documentCurrentWeekTasks 함수는 아직 수정하지 않음
// 필요하다면 추후 수정
export async function documentMultipleTasks(taskNumbers) {
  // ...
}
export async function documentCurrentWeekTasks() {
  // ...
}
