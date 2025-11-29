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


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' || !verifySlackRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body;

  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  if (body.type === 'event_callback' && body.event?.type === 'reaction_added' && body.event.reaction === '+1') {
    const event = body.event;
    console.log('👍 Reaction detected!');
      
    try {
      const message = await getSlackMessage(event.item.channel, event.item.ts);
      if (!message) throw new Error('메시지를 찾을 수 없습니다');

      const taskMatch = message.text.match(/Task (\d+(\.\d+)*)/);
      const taskNumberString = taskMatch ? taskMatch[1] : null;
      const taskNumber = taskNumberString ? parseFloat(taskNumberString) : null;
      
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

      if (taskNumber !== null) {
        console.log(`Starting documentation for Task ${taskNumber} (Part 1)...`);

        // 현재 주차 자동 계산 (11월 11일 = W01 시작 기준)
        const getWeekString = (): string => {
          const now = new Date();
          const startDate = new Date('2025-11-03'); // W01 시작일 (월요일)
          const diffTime = now.getTime() - startDate.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const weekNum = Math.floor(diffDays / 7) + 1;
          return `W${weekNum.toString().padStart(2, '0')}`;
        };
        const weekString = getWeekString();
        console.log(`Current week: ${weekString}`);

        try {
          const lockKey = `task-lock:${taskNumber}:${event.item.ts}`;
          const isLocked = await kv.get(lockKey);
          if (isLocked) {
            console.log(`Task ${taskNumber} 이미 실행 중 (중복 방지)`);
            return res.status(200).json({ ok: true, message: 'Already processing' });
          }
          await kv.set(lockKey, Date.now(), { ex: 300 });

          const { startDocumentationProcess } = await import('../../../lib/task-documenter.js');
          const initialAnalysis = (await startDocumentationProcess(taskNumber)) as any;

          const slackMessage = {
            text: `📝 Task ${taskNumber} 시간 추정 완료`,
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
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: "✅ 확인 완료, 문서화 계속", emoji: true },
                    style: "primary",
                    action_id: "finish_documentation",
                    value: JSON.stringify({
                        taskNumber: taskNumber
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
          await sendSlackMessage(event.item.channel, `⚠️ Task ${taskNumber} 문서화 중 오류 발생 (Part 1):\n${errorMessage}`);
        }
        
      } else {
        await sendSlackMessage(event.item.channel, `✅ 배포 확인 완료!\n- Task 번호가 없어 문서화를 건너뜁니다`);
      }
    } catch (error) {
      console.error('Error processing reaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await sendSlackMessage(body.event.item.channel, `❌ 문서화 실패: ${errorMessage}`);
    }
  }

  return res.status(200).json({ ok: true });
}
