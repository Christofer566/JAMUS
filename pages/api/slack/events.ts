import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { kv } from '@vercel/kv';

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
  console.log('getSlackMessage - Channel:', channel, 'TS:', timestamp);
  
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
  console.log('getSlackMessage response:', JSON.stringify(data, null, 2));
  return data.messages?.[0];
}

// Slack 메시지 전송
async function sendSlackMessage(channel: string, text: string) {
  console.log('=== sendSlackMessage START ===');
  console.log('SLACK_BOT_TOKEN exists:', !!process.env.SLACK_BOT_TOKEN);
  console.log('SLACK_BOT_TOKEN prefix:', process.env.SLACK_BOT_TOKEN?.substring(0, 10));
  console.log('Channel:', channel);
  console.log('Text:', text);
  
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
  console.log('=== Slack API Response ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== sendSlackMessage END ===');
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
      console.log('Channel:', event.item.channel);
      console.log('Timestamp:', event.item.ts);
      
      try {
        console.log('Starting message processing...');
        
        const message = await getSlackMessage(event.item.channel, event.item.ts);
        
        if (!message) {
          console.error('Message not found');
          await sendSlackMessage(event.item.channel, '❌ 메시지를 찾을 수 없습니다');
          return res.status(200).json({ ok: true });
        }

        console.log('Message text:', message.text);

        // Task 번호 추출 (e.g., Task 6.2)
        const taskMatch = message.text.match(/Task (\d+(\.\d+)*)/);
        const taskNumberString = taskMatch ? taskMatch[1] : null;
        const taskNumber = taskNumberString ? parseFloat(taskNumberString) : null;
        
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
        const startMessageResult = await sendSlackMessage(
          event.item.channel,
          `📝 ${taskInfo} 문서화를 시작합니다...`
        );

        if (!startMessageResult.ok) {
          console.error('Failed to send start message:', startMessageResult.error);
          return res.status(200).json({ ok: true });
        }

        // 실제 문서화 로직 실행
        if (taskNumber) {
          console.log(`Starting documentation for Task ${taskNumber}...`);
          
          try {
            const lockKey = `task-lock:${taskNumber}:${event.item.ts}`;

            try {
              const isLocked = await kv.get(lockKey);
              if (isLocked) {
                console.log(`Task ${taskNumber} 이미 실행 중 (중복 방지)`);
                return res.status(200).json({ ok: true, message: 'Already processing' });
              }
              
              // 5분간 락 설정
              await kv.set(lockKey, Date.now(), { ex: 300 });
            } catch (error) {
              console.log('KV 에러 (무시하고 계속):', error);
              // KV 실패해도 문서화는 계속
            }

            // task-documenter 동적 import (ES Module)
            const { documentTask } = await import('../../../lib/task-documenter.js');
            
            const docResult = await documentTask(taskNumber, "W03") as { // Pass placeholder weekString
              success: boolean;
              taskNumber: number;
              summary: {
                commits: number;
                bugs: number;
                totalTime: string;
                aiTime: string;
                humanTime: string;
              };
            };
            
            console.log('Documentation result:', docResult);
            
            // 문서화 완료 알림
            const completionMessageResult = await sendSlackMessage(
              event.item.channel,
              `✅ Task ${taskNumber} 문서화 완료!\n` +
              `- 총 커밋: ${docResult.summary.commits}개\n` +
              `- 버그 수정: ${docResult.summary.bugs}개\n` +
              `- 총 개발 시간: ${docResult.summary.totalTime}\n` +
              `- AI 구현: ${docResult.summary.aiTime}\n` +
              `- 리뷰/수정: ${docResult.summary.humanTime}\n` +
              `- 배포 URL: ${deployUrl || '없음'}`
            );
            
            if (!completionMessageResult.ok) {
              console.error('Failed to send completion message:', completionMessageResult.error);
            }
            
          } catch (docError) {
            console.error('Documentation error:', docError);
            const errorMessage = docError instanceof Error ? docError.message : 'Unknown error';
            
            await sendSlackMessage(
              event.item.channel,
              `⚠️ Task ${taskNumber} 문서화 중 오류 발생:\n${errorMessage}`
            );
          }
          
        } else {
          // Task 번호가 없는 경우 (일반 배포)
          console.log('No task number found - skipping documentation');
          await sendSlackMessage(
            event.item.channel,
            `✅ 배포 확인 완료!\n` +
            `- 배포 URL: ${deployUrl}\n` +
            `- Task 번호가 없어 문서화를 건너뜁니다`
          );
        }

        console.log('Processing completed successfully!');
        return res.status(200).json({ ok: true });

      } catch (error) {
        console.error('Error processing reaction:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');
        
        try {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await sendSlackMessage(
            event.item.channel,
            `❌ 문서화 실패: ${errorMessage}`
          );
        } catch (sendError) {
          console.error('Failed to send error message:', sendError);
        }
        
        return res.status(200).json({ ok: true });
      }
    }
  }

  console.log('Event ignored');
  return res.status(200).json({ ok: true });
}
