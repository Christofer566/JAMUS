import { VercelRequest, VercelResponse } from '@vercel/node';
import { Octokit } from '@octokit/rest';

// GitHub API 클라이언트
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const GITHUB_OWNER = 'Christofer566';
const GITHUB_REPO = 'JAMUS';
const GITHUB_BRANCH = 'main';

interface SlackPayload {
  type: string;
  user: {
    id: string;
    username: string;
    name: string;
  };
  actions: Array<{
    action_id: string;
    block_id: string;
    value: string;
  }>;
  response_url: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Slack verification
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Slack은 payload를 form-encoded로 보냄
    const payload: SlackPayload = JSON.parse(req.body.payload);

    // 버튼 클릭 이벤트만 처리
    if (payload.type !== 'block_actions') {
      return res.status(200).json({ ok: true });
    }

    const action = payload.actions[0];
    const [taskId, executor] = action.value.split('|'); // "task-022|gemini_cli"

    console.log(`Processing approval: ${taskId}, executor: ${executor}`);

    // 1. pending-approval에서 파일 읽기
    const sourceFile = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: `triggers/pending-approval/${taskId}.json`,
      ref: GITHUB_BRANCH
    });

    if (!('content' in sourceFile.data)) {
      throw new Error('File not found');
    }

    const content = sourceFile.data.content;
    const sha = sourceFile.data.sha;

    // 2. 목적지 폴더 결정
    let destFolder = 'triggers/consensus-failed'; // 기본값 (거부)

    if (action.action_id === 'approve_gemini') {
      destFolder = 'triggers/claude-to-gemini';
    } else if (action.action_id === 'approve_claude_code') {
      destFolder = 'triggers/claude-code';
    }

    // 3. 새 위치에 파일 생성
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: `${destFolder}/${taskId}.json`,
      message: `✅ Task ${taskId} approved by ${payload.user.name} - executor: ${executor}`,
      content: content,
      branch: GITHUB_BRANCH
    });

    // 4. 기존 파일 삭제
    await octokit.repos.deleteFile({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: `triggers/pending-approval/${taskId}.json`,
      message: `🗑️ Remove ${taskId} from pending-approval`,
      sha: sha,
      branch: GITHUB_BRANCH
    });

    // 5. Slack 응답 업데이트
    const responseMessage = action.action_id.startsWith('approve')
      ? `✅ Task ${taskId} approved! Executor: ${executor}`
      : `❌ Task ${taskId} rejected by ${payload.user.name}`;

    // Slack response_url로 메시지 업데이트
    await fetch(payload.response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        text: responseMessage
      })
    });

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Error handling Slack interaction:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}