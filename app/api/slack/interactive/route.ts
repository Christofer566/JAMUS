import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';

export async function POST(request: NextRequest) {
  try {
    // 1. Slack Payload 파싱
    const formData = await request.formData();
    const payloadString = formData.get('payload') as string;
    
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

    const taskId = action.value;
    const actionId = action.action_id;
    
    console.log(`📋 Task ID: ${taskId}`);
    console.log(`🎯 Action: ${actionId}`);

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
      case 'approve_gemini':
        destPath = `triggers/gemini-cli/${taskId}.json`;
        message = '✅ Gemini CLI로 실행 승인!';
        emoji = '💎';
        break;
      case 'approve_claude':
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
    } catch (error: any) {
      if (error.status === 404) {
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

  } catch (error: any) {
    console.error('❌ Error:', error);
    return NextResponse.json({ 
      response_type: 'ephemeral',
      text: `❌ 오류 발생: ${error.message}` 
    }, { status: 500 });
  }
}

// Slack Challenge 응답 (설정 시 필요)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get('challenge');
  
  if (challenge) {
    return NextResponse.json({ challenge });
  }
  
  return NextResponse.json({ status: 'ok' });
}
