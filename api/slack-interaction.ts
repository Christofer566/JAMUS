import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Slack Interactive Components Handler
 * 
 * Slack 버튼 클릭 시 호출되는 Vercel Serverless Function
 * - Claude Code 또는 Gemini CLI 선택에 따라 파일 이동
 * - GitHub Actions Workflow Dispatch 호출
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Slack의 3초 타임아웃 방지 - 즉시 응답
  res.status(200).json({ text: '처리 중...' });

  try {
    // Slack payload 파싱
    const payload = JSON.parse(req.body.payload);
    const action = payload.actions[0];
    const taskId = action.value;
    const actionId = action.action_id; // 'execute_claude_code' or 'execute_gemini_cli'

    console.log(`📋 Task: ${taskId}, Action: ${actionId}`);

    // GitHub Actions Workflow Dispatch 호출
    const githubToken = process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPOSITORY || 'Christofer566/JAMUS';

    if (!githubToken) {
      throw new Error('GITHUB_TOKEN not configured');
    }

    const [owner, repo] = githubRepo.split('/');

    const workflowResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/slack-button-handler.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            action: actionId,
            task_id: taskId
          }
        })
      }
    );

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      throw new Error(`GitHub API Error: ${workflowResponse.status} - ${errorText}`);
    }

    console.log(`✅ GitHub Actions 트리거 성공`);

    // Slack 메시지 업데이트 (한 줄로 축소)
    const executor = actionId === 'execute_claude_code' ? 'Claude Code' : 'Gemini CLI';
    const userName = payload.user.name || payload.user.username;

    await fetch(payload.response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        text: `✅ Task ${taskId} - ${executor} 실행 중 (${userName})`,
        blocks: [
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `✅ *Task ${taskId}* → *${executor}* 실행 중 (by ${userName})`
              }
            ]
          }
        ]
      })
    });

    console.log(`✅ Slack 메시지 업데이트 완료`);

  } catch (error) {
    console.error('❌ Error:', error);
    // 에러는 로그로만 남기고 사용자에게는 이미 200 응답을 보냈음
  }
}
