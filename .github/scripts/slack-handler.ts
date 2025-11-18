import * as fs from 'fs';
import * as path from 'path';
import { IncomingWebhook } from '@slack/webhook';

// ============================================ 
// 1. 인터페이스 정의
// ============================================ 

interface TaskInfo {
  task_id: string;
  title: string;
  complexity: number;
  estimated_time: string;
  dev_memo: string;
  approval_status: string;
  chatgpt_review?: {
    overall_assessment: string;
    concerns: string[];
    suggestions: string[];
  };
  claude_final_review?: {
    decision: string;
    reason: string;
    recommendation: string;
  };
  approved_at?: string;
}

interface GeminiQuota {
  date: string;
  used: number;
  remaining: number;
  last_updated: string;
  weekly_accuracy: {
    average: number;
    samples: number;
    last_updated: string;
  };
  dynamic_threshold: {
    low_risk: number;
    medium_risk: number;
    last_adjusted: string;
  };
}

interface UsagePrediction {
  estimated_requests: number;
  current_remaining: number;
  after_task_remaining: number;
  status: 'safe' | 'caution' | 'insufficient';
  recommended_executor: 'Gemini CLI' | 'Claude Code';
  percentage_remaining: number;
  percentage_after: number;
}

// ============================================ 
// 2. 유틸리티 함수
// ============================================ 

/**
 * pending-approval 폴더의 모든 JSON 파일 읽기
 */
function getPendingApprovalFiles(): string[] {
  const pendingDir = path.join(process.cwd(), 'triggers/pending-approval');
  
  if (!fs.existsSync(pendingDir)) {
    console.log('❌ pending-approval 폴더가 존재하지 않습니다.');
    return [];
  }
  
  const files = fs.readdirSync(pendingDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(pendingDir, file));
  
  console.log(`📂 발견된 파일: ${files.length}개`);
  return files;
}

/**
 * Task 정보 파싱
 */
function parseTaskInfo(filePath: string): TaskInfo | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const cleanContent = content.replace(/^\uFEFF/, ''); // BOM 제거
    const taskInfo = JSON.parse(cleanContent) as TaskInfo;
    
    console.log(`✅ Task 파싱 완료: ${taskInfo.task_id}`);
    return taskInfo;
  } catch (error) {
    console.error(`❌ Task 파싱 실패: ${filePath}`, error);
    return null;
  }
}

/**
 * gemini_quota.json 읽기
 */
function getGeminiQuota(): GeminiQuota | null {
  const quotaPath = path.join(process.cwd(), 'gemini_quota.json');
  
  if (!fs.existsSync(quotaPath)) {
    console.log('⚠️ gemini_quota.json 파일이 없습니다. 기본값 사용.');
    return {
      date: new Date().toISOString().split('T')[0],
      used: 0,
      remaining: 1500,
      last_updated: new Date().toISOString(),
      weekly_accuracy: { average: 0, samples: 0, last_updated: new Date().toISOString().split('T')[0] },
      dynamic_threshold: { low_risk: 300, medium_risk: 100, last_adjusted: new Date().toISOString().split('T')[0] }
    };
  }
  
  try {
    const content = fs.readFileSync(quotaPath, 'utf-8');
    const cleanContent = content.replace(/^\uFEFF/, ''); // BOM 제거 추가!
    const quota = JSON.parse(cleanContent) as GeminiQuota;
    console.log(`✅ Quota 읽기 완료: ${quota.remaining}/1500 (${Math.round(quota.remaining / 15)}%)`);
    return quota;
  } catch (error) {
    console.error('❌ Quota 파싱 실패:', error);
    return null;
  }
}

/**
 * 사용량 예측 알고리즘
 */
function predictUsage(complexity: number, quota: GeminiQuota): UsagePrediction {
  const estimatedRequests = complexity * 11;
  const afterTaskRemaining = quota.remaining - estimatedRequests;
  
  let status: 'safe' | 'caution' | 'insufficient';
  let recommendedExecutor: 'Gemini CLI' | 'Claude Code';
  
  if (afterTaskRemaining > quota.dynamic_threshold.low_risk) {
    status = 'safe';
    recommendedExecutor = 'Gemini CLI';
  } else if (afterTaskRemaining > 0) {
    status = 'caution';
    recommendedExecutor = 'Gemini CLI';
  } else {
    status = 'insufficient';
    recommendedExecutor = 'Claude Code';
  }
  
  const percentageRemaining = Math.round((quota.remaining / 1500) * 100);
  const percentageAfter = Math.round((afterTaskRemaining / 1500) * 100);
  
  console.log(`📊 사용량 예측: ${estimatedRequests}회, 작업 후 잔량: ${afterTaskRemaining} (${percentageAfter}%)`);
  
  return {
    estimated_requests: estimatedRequests,
    current_remaining: quota.remaining,
    after_task_remaining: afterTaskRemaining,
    status,
    recommended_executor: recommendedExecutor,
    percentage_remaining: percentageRemaining,
    percentage_after: percentageAfter
  };
}

/**
 * 상태 이모지 반환
 */
function getStatusEmoji(status: 'safe' | 'caution' | 'insufficient'): string {
  switch (status) {
    case 'safe': return '✅';
    case 'caution': return '⚠️';
    case 'insufficient': return '🚨';
  }
}

/**
 * 상태 텍스트 반환
 */
function getStatusText(status: 'safe' | 'caution' | 'insufficient'): string {
  switch (status) {
    case 'safe': return '안전';
    case 'caution': return '주의';
    case 'insufficient': return '할당량 부족';
  }
}

// ============================================ 
// 3. Slack 메시지 생성 (Block Kit)
// ============================================ 

function buildSlackMessage(task: TaskInfo, prediction: UsagePrediction) {
  const statusEmoji = getStatusEmoji(prediction.status);
  const statusText = getStatusText(prediction.status);
  const githubUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/main/triggers/pending-approval/${task.task_id}.json`;
  
  return {
    blocks: [
      // 헤더
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🤝 Task 승인 요청',
          emoji: true
        }
      },
      
      // Task 기본 정보
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*📋 Task ID:*\n${task.task_id}`
          },
          {
            type: 'mrkdwn',
            text: `*⚙️ 복잡도:*\n${task.complexity}/10`
          },
          {
            type: 'mrkdwn',
            text: `*📌 제목:*\n${task.title}`
          },
          {
            type: 'mrkdwn',
            text: `*⏱️ 예상 시간:*\n${task.estimated_time}`
          }
        ]
      },
      
      // DEV_MEMO
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📝 개발 메모:*\n${task.dev_memo}`
        }
      },
      
      // Divider
      {
        type: 'divider'
      },
      
      // 사용량 예측
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📊 Gemini CLI 사용량 예측*'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*예상 요청 수:*\n~${prediction.estimated_requests}회 (복잡도 ${task.complexity} × 11)`
          },
          {
            type: 'mrkdwn',
            text: `*현재 잔량:*\n${prediction.current_remaining}/1500 (${prediction.percentage_remaining}%)`
          },
          {
            type: 'mrkdwn',
            text: `*작업 후 잔량:*\n${prediction.after_task_remaining}/1500 (${prediction.percentage_after}%)`
          },
          {
            type: 'mrkdwn',
            text: `*상태:*\n${statusEmoji} ${statusText}`
          }
        ]
      },
      
      // 권장 실행자
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*💡 권장 실행자:* ${prediction.recommended_executor}`
        }
      },
      
      // Divider
      {
        type: 'divider'
      },
      
      // ChatGPT 리뷰 (있는 경우)
      ...(task.chatgpt_review ? [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🤖 ChatGPT 검토 결과*\n${task.chatgpt_review.overall_assessment}`
          }
        }
      ] : []),
      
      // Claude 최종 검토 (있는 경우)
      ...(task.claude_final_review ? [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🧠 Claude 최종 판단*\n✅ ${task.claude_final_review.decision}\n\n${task.claude_final_review.reason}`
          }
        }
      ] : []),
      
      // GitHub 링크
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${githubUrl}|📎 GitHub에서 전체 내용 보기>`
        }
      }
    ]
  };
}

// ============================================ 
// 4. Slack 전송
// ============================================ 

async function sendSlackNotification(task: TaskInfo, prediction: UsagePrediction) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.error('❌ SLACK_WEBHOOK_URL 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }
  
  const webhook = new IncomingWebhook(webhookUrl);
  const message = buildSlackMessage(task, prediction);
  
  try {
    await webhook.send(message);
    console.log(`✅ Slack 알림 전송 완료: ${task.task_id}`);
  } catch (error) {
    console.error('❌ Slack 알림 전송 실패:', error);
    throw error;
  }
}

// ============================================ 
// 5. 메인 로직
// ============================================ 

async function main() {
  console.log('🚀 Slack Handler 시작...\n');
  
  // 1. pending-approval 파일 목록 가져오기
  const files = getPendingApprovalFiles();
  
  if (files.length === 0) {
    console.log('ℹ️ 처리할 파일이 없습니다.');
    return;
  }
  
  // 2. gemini_quota.json 읽기
  const quota = getGeminiQuota();
  
  if (!quota) {
    console.error('❌ Quota 정보를 읽을 수 없습니다.');
    process.exit(1);
  }
  
  // 3. 각 파일 처리
  for (const file of files) {
    console.log(`\n📄 처리 중: ${path.basename(file)}`);
    
    const task = parseTaskInfo(file);
    
    if (!task) {
      console.log('⏭️ 스킵\n');
      continue;
    }
    
    const prediction = predictUsage(task.complexity, quota);
    
    await sendSlackNotification(task, prediction);
    
    console.log('✅ 완료\n');
  }
  
  console.log('🎉 모든 작업 완료!');
}

// 실행
main().catch(error => {
  console.error('❌ 치명적 오류:', error);
  process.exit(1);
});
