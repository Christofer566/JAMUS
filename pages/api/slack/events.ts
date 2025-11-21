import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Slack 서명 검증
function verifySlackRequest(req: VercelRequest): boolean {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  
  if (!slackSigningSecret) {
    console.warn('SLACK_SIGNING_SECRET is not set - allowing request for testing');
    return true;
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

  const sigBasestring = `v0:${timestamp}:${JSON.stringify(req.body)}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', slackSigningSecret)
    .update(sigBasestring)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(slackSignature)
  );
}

// Slack 메시지 조회
async function getSlackMessage(channel: string, timestamp: string) {
  const response = await fetch(
    `https://slack.com/api/conversations.history?channel=${channel}&latest=${timestamp}&inclusive=true&limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = await response.json();
  return data.messages?.[0];
}

// Slack 메시지 전송
async function sendSlackMessage(channel: string, text: string) {
  console.log('=== sendSlackMessage DEBUG ===');
  console.log('SLACK_BOT_TOKEN exists:', !!process.env.SLACK_BOT_TOKEN);
  console.log('SLACK_BOT_TOKEN prefix:', process.env.SLACK_BOT_TOKEN?.substring(0, 10));
  console.log('Channel:', channel);
  console.log('Text length:', text.length);
  
  const response = await fetch('https://slack.com/api/chat.postMessage', {
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
  
  const data = await response.json();
  console.log('Slack API response:', JSON.stringify(data, null, 2));
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('=== Slack Event Received ===');
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifySlackRequest(req)) {
    console.error('Invalid Slack signature');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body;

  if (body.type === 'url_verification') {
    console.log('URL verification request - challenge:', body.challenge);
    return res.status(200).json({ challenge: body.challenge });
  }

  if (body.type === 'event_callback') {
    const event = body.event;

    if (event.type === 'reaction_added' && event.reaction === '+1') {
      console.log('👍 Reaction detected!');
      
      res.status(200).json({ ok: true });

      (async () => {
        try {
          console.log('Channel:', event.item.channel);
          console.log('Timestamp:', event.item.ts);

          const message = await getSlackMessage(event.item.channel, event.item.ts);
          
          if (!message) {
            console.error('Message not found');
            return;
          }

          console.log('Message text:', message.text);

          // Task 번호 추출 (선택사항)
          const taskMatch = message.text.match(/Task (\d+)/);
          const taskNumber = taskMatch ? parseInt(taskMatch[1]) : null;
          
          console.log('Task number:', taskNumber || 'None');

          // 배포 URL 추출
          const blocks = message.blocks || [];
          let deployUrl = 'https://jamus.vercel.app';
          
          for (const block of blocks) {
            if (block.type === 'section' && block.fields) {
              for (const field of block.fields) {
                if (field.text && field.text.includes('배포 확인')) {
                  const urlMatch = field.text.match(/<([^|>]+)/);
                  if (urlMatch) {
                    deployUrl = urlMatch[1];
                  }
                }
              }
            }
          }

          console.log('Deploy URL:', deployUrl);

          // 문서화 시작 알림
          const taskInfo = taskNumber ? `Task ${taskNumber}` : '이 배포';
          await sendSlackMessage(
            event.item.channel,
            `📝 ${taskInfo} 문서화를 시작합니다...`
          );

          // TODO: Phase 3-5에서 실제 문서화 로직 구현
          await sendSlackMessage(
            event.item.channel,
            `✅ ${taskInfo} 문서화 준비 완료!\n` +
            `- 배포 URL: ${deployUrl}\n` +
            `- Phase 3-5에서 실제 문서화 구현 예정`
          );

        } catch (error) {
          console.error('Error processing reaction:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await sendSlackMessage(
            event.item.channel,
            `❌ 문서화 실패: ${errorMessage}`
          );
        }
      })();

      return;
    }
  }

  console.log('Event ignored');
  return res.status(200).json({ ok: true });
}