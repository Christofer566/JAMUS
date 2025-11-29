import { NextResponse } from 'next/server'; // NextRequest import 제거
import { Octokit } from '@octokit/rest';
import { sendSlackMessage } from '../../../../lib/slack-client.js'; // sendSlackMessage import 추가

export async function POST(request: any) { // request 타입 제거
  try {
    // 1. Slack Payload 파싱
    const formData = await request.formData();
    const payloadString = formData.get('payload'); // as string 제거

    if (!payloadString) {
      return NextResponse.json({ error: 'No payload' }, { status: 400 });
    }

    const payload = JSON.parse(payloadString);

    // 2. Slack Verification Token 확인
    const verificationToken = process.env.SLACK_VERIFICATION_TOKEN;
    if (payload.token !== verificationToken) {
      console.error('Invalid token');
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // 3. 버튼 action 확인
    const action = payload.actions?.[0];
    if (!action) {
      return NextResponse.json({ error: 'No action found' }, { status: 400 });
    }

    const actionId = action.action_id;

    console.log(`🎯 Action: ${actionId}`);

    // ========================================
    // ✅ 문서화 완료 버튼 처리 (Phase 3)
    // ========================================
    if (actionId === 'finish_documentation') {
      const { taskNumber } = JSON.parse(action.value);
      const channel = payload.channel.id;
      const user = payload.user.id;

      // 현재 주차 자동 계산 (11월 10일 = W01 시작 기준)
      const getWeekString = (): string => {
        const now = new Date();
        const startDate = new Date('2025-11-10'); // W01 시작일 (월요일)
        const diffTime = now.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const weekNum = Math.floor(diffDays / 7) + 1;
        return `W${weekNum.toString().padStart(2, '0')}`;
      };
      const weekString = getWeekString();
      console.log(`📅 Current week: ${weekString}`);

      try {
        // 문서화 프로세스 실행 (동기 - await 사용)
        const { finishDocumentationProcess } = await import('../../../../lib/task-documenter.js');
        await finishDocumentationProcess(taskNumber, weekString, channel);

        // 성공 시 버튼 메시지 업데이트
        return NextResponse.json({
          response_type: 'in_channel',
          replace_original: true,
          text: `✅ Task ${taskNumber} 문서화 완료! (요청자: <@${user}>)`
        });
      } catch (error) {
        console.error('Error in finishDocumentationProcess:', error);

        // 실패 시 버튼 메시지 업데이트
        return NextResponse.json({
          response_type: 'in_channel',
          replace_original: true,
          text: `❌ Task ${taskNumber} 문서화 실패\n오류: ${error instanceof Error ? error.message : 'Unknown error'}\n요청자: <@${user}>`
        });
      }
    }

    // ========================================
    // 기존 Task 승인 처리 (이하 기존 로직)
    // ========================================
    const taskId = action.value;
    console.log(`📋 Task ID: ${taskId}`);

    // 4. GitHub API 초기화
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    const owner = 'Christofer566';
    const repo = 'JAMUS';
    const branch = 'main';

    // 5. 소스 파일 경로
    const sourcePath = `triggers/pending-approval/${taskId}.json`;

    // 6. 목적지 결정
    let destPath = '';
    let message = '';
    let emoji = '';

    switch (actionId) {
      case 'execute_gemini_cli':
        destPath = `triggers/gemini-cli/${taskId}.json`;
        message = '✅ Gemini CLI로 실행 승인!';
        emoji = '💎';
        break;
      case 'execute_claude_code':
        destPath = `triggers/claude-code/${taskId}.json`;
        message = '✅ Claude Code로 실행 승인!';
        emoji = '🤖';
        break;
      case 'reject_task':
        destPath = `triggers/rejected/${taskId}.json`;
        message = '❌ Task 거부됨';
        emoji = '🚫';
        break;
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // 7. GitHub: 소스 파일 읽기
    let fileData;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: sourcePath,
        ref: branch
      });

      fileData = response.data;

      if (!('content' in fileData)) {
        throw new Error('File not found or is a directory');
      }
    } catch (error) { // :any 제거
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      if (errorMessage.includes('404')) { //Simplified check for 404
        return NextResponse.json({
          response_type: 'ephemeral',
          text: `❌ 파일을 찾을 수 없습니다: ${taskId}.json\n이미 처리되었을 수 있습니다.`
        });
      }
      throw error;
    }

    // 8. GitHub: 목적지에 파일 생성
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: destPath,
      message: `${emoji} Task 승인: ${taskId} → ${actionId}`,
      content: fileData.content,
      branch
    });

    console.log(`✅ Created: ${destPath}`);

    // 9. GitHub: 원본 파일 삭제
    await octokit.repos.deleteFile({
      owner,
      repo,
      path: sourcePath,
      message: `🗑️ Task 이동 완료: ${sourcePath} → ${destPath}`,
      sha: fileData.sha,
      branch
    });

    console.log(`🗑️ Deleted: ${sourcePath}`);

    // 10. Slack 응답 (메시지 업데이트)
    return NextResponse.json({
      response_type: 'in_channel',
      replace_original: true,
      text: `${message}\n\n승인자: <@${payload.user.id}>\nTask ID: ${taskId}\n실행 폴더: \`${destPath}\``
    });

  } catch (error) { // :any 제거
    console.error('❌ Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `❌ 오류 발생: ${errorMessage}`
    }, { status: 500 });
  }
}

// Slack Challenge 응답 (설정 시 필요)
export async function GET(request: any) { // request 타입 제거
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');

  if (challenge) {
    return NextResponse.json({ challenge });
  }

  return NextResponse.json({ status: 'ok' });
}
