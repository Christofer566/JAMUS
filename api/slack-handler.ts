import { VercelRequest, VercelResponse } from '@vercel/node';
import { Octokit } from '@octokit/rest';

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
  // CORS 및 메서드 체크
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Slack URL verification challenge
    if (req.body.challenge) {
      return res.status(200).json({ challenge: req.body.challenge });
    }

    // Slack은 form-encoded로 보냄
    let payload: SlackPayload;
    
    if (typeof req.body === 'string') {
      // Form-encoded 문자열인 경우
      const params = new URLSearchParams(req.body);
      payload = JSON.parse(params.get('payload') || '{}');
    } else if (req.body.payload) {
      // payload 필드가 있는 경우
      if (typeof req.body.payload === 'string') {
        payload = JSON.parse(req.body.payload);
      } else {
        payload = req.body.payload;
      }
    } else {
      // 이미 파싱된 경우
      payload = req.body;
    }

    console.log('Parsed payload:', JSON.stringify(payload, null, 2));

    // 버튼 클릭 이벤트만 처리
    if (payload.type !== 'block_actions') {
      return res.status(200).json({ ok: true });
    }

    const action = payload.actions[0];
    const [taskId, executor] = action.value.split('|');

    console.log(`Processing: ${taskId}, executor: ${executor}`);

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
    let destFolder = 'triggers/consensus-failed';

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
      message: `✅ ${taskId} approved by ${payload.user.name} - ${executor}`,
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

    // 5. Slack 응답 - 처리됨 상태로 최소화
    const icon = action.action_id.startsWith('approve') ? '✅' : '❌';
    const action_text = action.action_id === 'approve_gemini' ? 'Gemini CLI' :
                        action.action_id === 'approve_claude_code' ? 'Claude Code' : 'Rejected';

    await fetch(payload.response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        text: `${icon} ${taskId} - ${action_text} (${payload.user.name})`,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `${icon} *${taskId}* processed as *${action_text}* by ${payload.user.name}`
              }
            ]
          }
        ]
      })
    });

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};