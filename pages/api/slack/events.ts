import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import { sendSlackMessage } from '../../../lib/slack-client.js';

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

        // 실제 문서화 로직 실행 (Part 1)
        if (taskNumber) {
          console.log(`Starting documentation for Task ${taskNumber} (Part 1)...`);
          
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
            }

            // task-documenter 동적 import 및 Part 1 실행
            const { startDocumentationProcess } = await import('../../../lib/task-documenter.js');
            const initialAnalysis = await startDocumentationProcess(taskNumber);

            // Send Slack notification with button
            const slackMessage = {
              text: `📝 Task ${taskNumber} 시간 추정 완료`, // Fallback text
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `📝 *Task ${taskNumber} 시간 추정 완료*\n\n` +
                          `✅ 추정 총 시간: ${initialAnalysis.timeAnalysis.totalDevelopmentTime}\n` +
                          `✅ AI 구현: ${initialAnalysis.timeAnalysis.aiImplementationTime}\n` +
                          `✅ 리뷰/수정: ${initialAnalysis.timeAnalysis.humanReviewTime}\n\n` +
                          (initialAnalysis.calendarEvent ? `👉 <${initialAnalysis.calendarEvent.htmlLink}|Google Calendar에서 확인 및 수정>` : "Google Calendar 이벤트 생성 실패")
                  }
                },
                {
                  type: "section",
                  text: {
                      type: "mrkdwn",
                      text: "시간을 수정한 후, 아래 버튼을 눌러 문서화를 계속 진행하세요."
                  }
                },
                {
                  type: "actions",
                  elements: [
                    {
                      type: "button",
                      text: {
                        type: "plain_text",
                        text: "✅ 확인 완료, 문서화 계속",
                        emoji: true
                      },
                      style: "primary",
                      action_id: "finish_documentation",
                      value: JSON.stringify({
                          taskNumber: taskNumber,
                          weekString: "W03", // Still using placeholder
                      })
                    }
                  ]
                }
              ]
            };
            
            await sendSlackMessage(event.item.channel, slackMessage);
            
          } catch (docError) {
            console.error('Documentation error (Part 1):', docError);
            const errorMessage = docError instanceof Error ? docError.message : 'Unknown error';
            
            await sendSlackMessage(
              event.item.channel,
              `⚠️ Task ${taskNumber} 문서화 중 오류 발생 (Part 1):\n${errorMessage}`
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
