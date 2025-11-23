import { analyzeGitHubCommits } from './github-analyzer.js';
import { analyzeBugs, createBugEntry } from './bug-analyzer';
import { analyzeTime } from './time-analyzer.js';
import { createDevelopmentEvent, getDevelopmentEventTime } from './google-calendar.js';
import { updateNotionTaskLog, updateNotionWeeklyTask } from './notion-updater.js';
import { generateDetailedTEL } from './notion-content-generator.js';
import { sendSlackMessage } from './slack-client.js'; // 분리된 sendSlackMessage 함수 import


/**
 * Part 1: 분석, 시간 추정, Calendar 임시 기록
 */
export async function startDocumentationProcess(taskNumber) {
  console.log(`\n=== Task ${taskNumber} 문서화 시작 (Part 1) ===`);

  const commitAnalysis = await analyzeGitHubCommits(taskNumber);
  const timeAnalysis = analyzeTime(commitAnalysis.commits);
  const bugAnalysis = await analyzeBugs(commitAnalysis.bugFixCommits.length, commitAnalysis.commits);

  let calendarEvent;
  try {
    console.log('\n[Phase 4] Google Calendar에 임시 기록 중...');
    calendarEvent = await createDevelopmentEvent(
      taskNumber,
      timeAnalysis,
      commitAnalysis.commits
    );
  } catch (error) {
    console.log('⚠️ Calendar 기록 실패, 추정치로 계속:', error);
    // 캘린더 생성에 실패해도 중단하지 않고 진행
  }

  // Part 2에 필요한 데이터를 반환
  return { commitAnalysis, timeAnalysis, bugAnalysis, calendarEvent };
}

/**
 * Part 2: 최종 시간 확정, Notion 문서화
 */
export async function finishDocumentationProcess(taskNumber, weekString, channel) {
  console.log(`\n=== Task ${taskNumber} 문서화 시작 (Part 2) ===`);

  try {
    // Part 2 시작 시점에 분석을 다시 실행하여 최신 상태 보장
    const commitAnalysis = await analyzeGitHubCommits(taskNumber);
    const initialTimeAnalysis = analyzeTime(commitAnalysis.commits);
    const bugAnalysis = await analyzeBugs(commitAnalysis.bugFixCommits.length, commitAnalysis.commits);

    // Calendar에서 최종 시간 다시 읽기
    const finalTimeResult = await getDevelopmentEventTime(taskNumber);

    // 수정된 시간이 있으면 사용, 없으면 원래 추정값 사용
    const finalTimeData = finalTimeResult
      ? { ...initialTimeAnalysis, totalDevelopmentTime: finalTimeResult.totalTime, totalMinutes: finalTimeResult.totalMinutes }
      : initialTimeAnalysis;

    console.log(`✓ 최종 확정 시간: ${finalTimeData.totalDevelopmentTime}`);

    // Claude로 상세 문서 생성
    const detailedContent = await generateDetailedTEL({
      commitAnalysis,
      timeAnalysis: finalTimeData,
      bugAnalysis
    });

    // Notion 문서화
    console.log('\n[Phase 7] Notion 업데이트 중...');
    await updateNotionTaskLog(
      taskNumber,
      { commitAnalysis, timeAnalysis: finalTimeData, bugAnalysis, detailedContent },
      weekString
    );
    await updateNotionWeeklyTask(taskNumber, weekString);

    // ✅ Debugging History 생성
    if (bugAnalysis.bugs && bugAnalysis.bugs.length > 0) {
      console.log(`🐛 ${bugAnalysis.bugs.length}개 버그 감지`);
      console.log('Debugging History 생성 중...');

      for (const bug of bugAnalysis.bugs) {
        try {
          await createBugEntry(
            taskNumber,
            bug,
            'https://jamus.vercel.app', // 배포 URL
            weekString // 주차 정보 전달
          );
        } catch (error) {
          console.error(`버그 페이지 생성 실패:`, error);
          // 실패해도 계속 진행
        }
      }

      console.log('✅ Debugging History 생성 완료');
    } else {
      console.log('버그 수정 없음 - Debugging History 생성 스킵');
    }

    // 최종 완료 알림
    await sendSlackMessage(
      channel,
      `✅ Task ${taskNumber} 문서화 완료!\n` +
      `최종 시간: ${finalTimeData.totalDevelopmentTime}`
    );

    return {
      success: true,
      summary: {
        totalTime: finalTimeData.totalDevelopmentTime,
        aiTime: finalTimeData.aiImplementationTime,
        humanTime: finalTimeData.humanReviewTime
      }
    };
  } catch (error) {
    console.error(`\n❌ Task ${taskNumber} 문서화 실패 (Part 2):`, error.message);
    // 최종 오류 알림
    await sendSlackMessage(
      channel,
      `❌ Task ${taskNumber} 문서화 실패: ${error.message}`
    );
    throw error;
  }
}