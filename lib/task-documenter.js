import { analyzeGitHubCommits } from './github-analyzer.js';
import { analyzeBugs, createBugEntry } from './bug-analyzer';
import { analyzeTime } from './time-analyzer.js';
// Google Calendar 제거 - OAuth 토큰 만료 문제로 인해 비활성화
// import { createDevelopmentEvent, getDevelopmentEventTime } from './google-calendar.js';
import { updateNotionTaskLog, updateNotionWeeklyTask, updateContextHubOnTEL } from './notion-updater.js';
import { generateDetailedTEL } from './notion-content-generator.js';
import { sendSlackMessage } from './slack-client.js'; // 분리된 sendSlackMessage 함수 import


/**
 * Part 1: 분석, 시간 추정
 * (Google Calendar 제거됨 - OAuth 토큰 만료 문제로 인해 비활성화)
 */
export async function startDocumentationProcess(taskNumber, weekString = null) {
  console.log(`\n=== Task ${taskNumber} 문서화 시작 (Part 1) ===`);

  const commitAnalysis = await analyzeGitHubCommits(taskNumber, weekString);
  const timeAnalysis = analyzeTime(commitAnalysis.commits);
  const bugAnalysis = await analyzeBugs(commitAnalysis.bugFixCommits.length, commitAnalysis.commits);

  // Google Calendar 비활성화 - time-analyzer의 추정치를 직접 사용
  console.log('\n[Phase 4] 시간 분석 완료 (Calendar 비활성화됨)');
  console.log(`  추정 시간: ${timeAnalysis.totalDevelopmentTime}`);

  // Part 2에 필요한 데이터를 반환
  return { commitAnalysis, timeAnalysis, bugAnalysis, calendarEvent: null };
}

/**
 * Part 2: 최종 시간 확정, Notion 문서화
 * (Google Calendar 제거됨 - time-analyzer의 추정치를 직접 사용)
 */
export async function finishDocumentationProcess(taskNumber, weekString, channel) {
  console.log(`\n=== Task ${taskNumber} 문서화 시작 (Part 2) ===`);

  try {
    // Part 2 시작 시점에 분석을 다시 실행하여 최신 상태 보장
    const commitAnalysis = await analyzeGitHubCommits(taskNumber, weekString);
    const initialTimeAnalysis = analyzeTime(commitAnalysis.commits);
    const bugAnalysis = await analyzeBugs(commitAnalysis.bugFixCommits.length, commitAnalysis.commits);

    // Google Calendar 비활성화 - time-analyzer의 추정치를 직접 사용
    const finalTimeData = initialTimeAnalysis;

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

    // ✅ Context Hub 전체 업데이트 (TEL 완료 시)
    console.log('\n[Phase 8] Context Hub 전체 업데이트...');
    await updateContextHubOnTEL(taskNumber, weekString);

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