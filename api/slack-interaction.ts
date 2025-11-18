import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Slack Interactive Components 핸들러
 * 버튼 클릭 시 GitHub Actions Workflow Dispatch 호출
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Slack의 3초 타임아웃 방지 - 즉시 응답
  res.status(200).json({ text: '처리 중...' });

  try {
    // Slack payload 파싱
    const payload = JSON.parse(req.body.payload);
    const action = payload.actions[0];
    const taskId = action.value;
    const userId = payload.user.name;

    console.log(`📱 버튼 클릭: ${action.action_id} by ${userId}`);
    console.log(`📋 Task ID: ${taskId}`);

    // GitHub Actions Workflow Dispatch 호출
    const githubResponse = await fetch(
      `https://api.github.com/repos/Christofer566/JAMUS/actions/workflows/slack-button-handler.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            action: action.action_id,
            task_id: taskId,
            user: userId
          }
        })
      }
    );

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text();
      console.error('❌ GitHub API 오류:', errorText);
      throw new Error(`GitHub API failed: ${githubResponse.status}`);
    }

    console.log('✅ GitHub Actions 트리거 성공');

    // Slack 메시지 업데이트 (한 줄로 축소)
    const executor = action.action_id === 'execute_claude_code' ? 'Claude Code' : 'Gemini CLI';
    
    await fetch(payload.response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        text: `✅ Task ${taskId} - ${executor} 실행 중 (by ${userId})`,
        blocks: [
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `✅ *Task ${taskId}* 실행 중 - *${executor}* (by ${userId})`
              }
            ]
          }
        ]
      })
    });

    console.log('✅ Slack 메시지 업데이트 완료');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}
