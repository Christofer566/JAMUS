import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Slack 서명 검증
function verifySlackRequest(req: VercelRequest): boolean {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  
  if (!slackSigningSecret) {
    console.warn('SLACK_SIGNING_SECRET is not set');
    return true; // 임시로 허용
  }

  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const slackSignature = req.headers['x-slack-signature'] as string;

  if (!timestamp || !slackSignature) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    console.error('Request timestamp is too old');
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${req.body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', slackSigningSecret)
    .update(sigBasestring)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(slackSignature)
  );
}

// Slack 메시지 전송
async function sendSlackMessage(channel: string, text: string) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel,
      text
    })
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== Slack Interactive Request ===');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Slack은 application/x-www-form-urlencoded로 보냄
  const payload = JSON.parse(req.body.payload);
  
  console.log('Payload type:', payload.type);
  console.log('Action:', payload.actions?.[0]?.action_id);

  // 즉시 응답 (Slack 3초 제한)
  res.status(200).send('');

  // 백그라운드 처리
  (async () => {
    try {
      if (payload.type === 'block_actions') {
        const action = payload.actions[0];
        
        if (action.action_id === 'start_documentation') {
          const channel = payload.channel.id;
          const value = action.value; // "task_number|deploy_url"
          const [taskNumber, deployUrl] = value.split('|');
          
          console.log('Starting documentation for Task', taskNumber);
          console.log('Deploy URL:', deployUrl);

          // 문서화 시작 알림
          await sendSlackMessage(
            channel,
            `📝 Task ${taskNumber} 문서화를 시작합니다...`
          );

          // TODO: Phase 3-5에서 실제 문서화 로직 구현
          await sendSlackMessage(
            channel,
            `✅ Task ${taskNumber} 문서화 준비 완료!\n` +
            `- 배포 URL: ${deployUrl}\n` +
            `- Phase 3-5에서 실제 문서화 구현 예정`
          );
        }
      }
    } catch (error) {
      console.error('Error processing interaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await sendSlackMessage(
        payload.channel?.id,
        `❌ 문서화 실패: ${errorMessage}`
      );
    }
  })();
}