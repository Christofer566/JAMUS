import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Slack 서명 검증
function verifySlackRequest(req: VercelRequest): boolean {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;

  // 임시로 SIGNING_SECRET이 없어도 통과 (테스트용)
  if (!slackSigningSecret) {
    console.warn('SLACK_SIGNING_SECRET is not set - allowing request for testing');
    return true; // ⚠️ 프로덕션에서는 false여야 함
  }

  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const slackSignature = req.headers['x-slack-signature'] as string;

  if (!timestamp || !slackSignature) {
    return false;
  }

  // 타임스탬프 검증 (5분 이내)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    console.error('Request timestamp is too old');
    return false;
  }

  // 서명 검증
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
  console.log('=== Slack Event Received ===');
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body, null, 2));

  // POST 요청만 허용
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Slack 서명 검증
  if (!verifySlackRequest(req)) {
    console.error('Invalid Slack signature');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body;

  // URL 검증 요청 처리 (Slack 앱 설정 시 필요)
  if (body.type === 'url_verification') {
    console.log('URL verification request - challenge:', body.challenge);
    return res.status(200).json({ challenge: body.challenge });
  }

  // 이벤트 처리
  if (body.type === 'event_callback') {
    const event = body.event;

    // 👍 이모지 반응 감지
    if (event.type === 'reaction_added' && event.reaction === '+1') {
      console.log('👍 Reaction detected!');

      // 즉시 응답 (Slack 3초 제한)
      res.status(200).json({ ok: true });

      // 백그라운드에서 처리
      (async () => {
        try {
          console.log('Channel:', event.item.channel);
          console.log('Timestamp:', event.item.ts);

          // 메시지 내용 조회
          const message = await getSlackMessage(event.item.channel, event.item.ts);

          if (!message) {
            console.error('Message not found');
            return;
          }

          console.log('Message text:', message.text);

          // Task 번호 추출
          const taskMatch = message.text.match(/Task (\d+)/);
          if (!taskMatch) {
            await sendSlackMessage(event.item.channel, '❌ Task 번호를 찾을 수 없습니다');
            return;
          }

          const taskNumber = parseInt(taskMatch[1]);
          console.log('Task number:', taskNumber);

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
          await sendSlackMessage(
            event.item.channel,
            `📝 Task ${taskNumber} 문서화를 시작합니다...`
          );

          // TODO: Phase 3-5에서 실제 문서화 로직 구현
          // 지금은 테스트 메시지만 전송
          await sendSlackMessage(
            event.item.channel,
            `✅ Task ${taskNumber} 문서화 준비 완료!\n` +
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

  // 기타 이벤트는 무시
  console.log('Event ignored');
  return res.status(200).json({ ok: true });
}