import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ⬇️ import 문 바로 아래에 디버그 코드 추가
console.log('========================================');
console.log('🚀 SCRIPT START - Claude Response v3.1');
console.log('========================================');
console.log('Current directory:', process.cwd());
console.log('Files in triggers/chatgpt-review:');
try {
  const files = fs.readdirSync('triggers/chatgpt-review');
  console.log(files);
} catch (e) {
  console.log('Error reading directory:', e.message);
}
console.log('========================================\n');
// ⬆️ 여기까지

console.log('🚀 Claude Response v3.1 - Single Round Review');
// ... 나머지 코드는 그대로
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🚀 Claude Response v3.1 - Single Round Review');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ============================================
// 메인 함수
// ============================================
async function analyzeChatGPTReview() {
  try {
    console.log('\n📂 Checking chatgpt-review directory...');
    
    const reviewDir = 'triggers/chatgpt-review';
    
    if (!fs.existsSync(reviewDir)) {
      console.log('❌ Review directory does not exist');
      return;
    }
    
    const files = fs.readdirSync(reviewDir).filter(f => f.endsWith('.json'));
    
    console.log(`✅ Found ${files.length} review file(s):`, files);
    
    if (files.length === 0) {
      console.log('⚠️  No reviews to process');
      return;
    }

    for (const file of files) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📝 Processing: ${file}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      const reviewPath = path.join(reviewDir, file);
      
      // JSON 읽기 (BOM 제거)
      const reviewContent = fs.readFileSync(reviewPath, 'utf8');
      const cleanContent = reviewContent.replace(/^\uFEFF/, '');
      const review = JSON.parse(cleanContent);
      
      console.log(`✅ Task ID: ${review.task_id}`);
      console.log(`✅ Approval Status: ${review.approval_status}`);
      console.log(`✅ ChatGPT Assessment: ${review.overall_assessment || 'N/A'}`);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 케이스 1: 승인 → pending-approval
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (review.approval_status === 'approved') {
        console.log('\n✅ ChatGPT approved! Moving to pending-approval...');
        moveToPendingApproval(file, review);
        continue;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 케이스 2: 반려 → Claude 최종 검토
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      console.log('\n🔍 ChatGPT requested revision. Calling Claude for final review...');
      
      // Error History 로드 (Task 7에서 구현 예정)
      const errorHistory = loadErrorHistory(review.task_id);
      
      // Claude API 호출
      const claudeResponse = await callClaudeAPI(review, errorHistory);
      
      // JSON 파싱
      const parsedResponse = parseClaudeResponse(claudeResponse);
      
      if (!parsedResponse) {
        // JSON 파싱 실패 → consensus-failed
        console.log('❌ Claude response parsing failed. Moving to consensus-failed...');
        moveToConsensusFailed(file, review, 'Claude JSON parsing failed');
        continue;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 케이스 3: Claude 최종 판단
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (parsedResponse.final_decision === 'approved') {
        console.log('\n✅ Claude approved! Moving to pending-approval...');
        moveToPendingApproval(file, review, parsedResponse);
      } else {
        console.log('\n❌ Claude rejected. Moving to consensus-failed...');
        moveToConsensusFailed(file, review, parsedResponse.rejection_reason);
      }
    }

  } catch (error) {
    console.error('\n❌ Error in Claude Response:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// ============================================
// Claude API 호출
// ============================================
async function callClaudeAPI(review, errorHistory) {
  console.log('\n🤖 Calling Claude API...');
  
  const prompt = `당신은 JAMUS 프로젝트의 최종 검토자입니다.

ChatGPT가 이 Task에 대해 수정을 요청했습니다.
당신의 역할은 **최종 승인 여부를 결정**하는 것입니다.

# Task 정보
- Task ID: ${review.task_id}
- 제목: ${review.title || 'N/A'}

# Original DEV_MEMO
${review.original_task?.dev_memo || review.dev_memo || 'N/A'}

# ChatGPT Review
- 전체 평가: ${review.overall_assessment || 'N/A'}
- 우려사항: ${review.concerns?.join(', ') || 'None'}
- 개선 제안: ${review.suggestions?.join(', ') || 'None'}
- 상세 검토: ${review.detailed_review || 'N/A'}

${errorHistory ? `# Error History (참고용)\n${JSON.stringify(errorHistory, null, 2)}` : ''}

# 요청사항
ChatGPT의 우려사항이 **치명적인지** 판단해주세요.

**승인 기준:**
- 우려사항이 경미하고 구현 중 해결 가능
- 전체적인 방향성이 올바름
- 기술적으로 실현 가능

**반려 기준:**
- 근본적인 설계 오류
- 구현 불가능한 요구사항
- 명확한 모순이나 오류

반드시 다음 JSON 형식으로만 응답하세요:
\`\`\`json
{
  "final_decision": "approved" 또는 "rejected",
  "reason": "승인/반려 이유 (구체적으로)",
  "chatgpt_concerns_assessment": "ChatGPT 우려사항에 대한 평가",
  "recommendation": "성민님께 드리는 권장사항"
}
\`\`\``;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }]
    });

    const responseText = message.content[0].text;
    console.log('✅ Claude response received');
    console.log('Response preview:', responseText.substring(0, 200) + '...');
    
    return responseText;
    
  } catch (error) {
    console.error('❌ Claude API call failed:', error.message);
    throw error;
  }
}

// ============================================
// JSON 파싱
// ============================================
function parseClaudeResponse(responseText) {
  try {
    // ```json ... ``` 제거
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
    
    const parsed = JSON.parse(jsonStr);
    
    console.log('✅ JSON parsed successfully');
    console.log('Decision:', parsed.final_decision);
    
    return parsed;
    
  } catch (error) {
    console.error('❌ JSON parsing failed:', error.message);
    console.error('Raw response:', responseText);
    return null;
  }
}

// ============================================
// 승인 처리 → pending-approval
// ============================================
function moveToPendingApproval(filename, review, claudeResponse = null) {
  console.log('\n📦 Moving to pending-approval...');
  
  const dir = 'triggers/pending-approval';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const newPath = path.join(dir, filename);
  
  const approvalData = {
    task_id: review.task_id,
    title: review.title || review.original_task?.title,
    complexity: review.complexity || review.original_task?.complexity,
    estimated_time: review.estimated_time || review.original_task?.estimated_time,
    dev_memo: review.dev_memo || review.original_task?.dev_memo,
    approval_status: 'approved',
    chatgpt_review: {
      overall_assessment: review.overall_assessment,
      concerns: review.concerns,
      suggestions: review.suggestions
    },
    claude_final_review: claudeResponse ? {
      decision: claudeResponse.final_decision,
      reason: claudeResponse.reason,
      recommendation: claudeResponse.recommendation
    } : null,
    approved_at: new Date().toISOString()
  };
  
  fs.writeFileSync(newPath, JSON.stringify(approvalData, null, 2));
  
  console.log('✅ File saved:', newPath);
  
  // Git commit
  try {
    execSync(`git config user.name "Claude Bot"`);
    execSync(`git config user.email "claude@jamus.dev"`);
    execSync(`git add ${newPath}`);
    execSync(`git rm triggers/chatgpt-review/${filename}`);
    execSync(`git commit -m "✅ Task ${review.task_id} approved - ready for implementation"`);
    execSync(`git push origin main`);
    
    console.log('✅ Changes pushed to GitHub');
  } catch (error) {
    console.error('❌ Git operations failed:', error.message);
  }
}

// ============================================
// 반려 처리 → consensus-failed
// ============================================
function moveToConsensusFailed(filename, review, reason) {
  console.log('\n📦 Moving to consensus-failed...');
  
  const dir = 'triggers/consensus-failed';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const newPath = path.join(dir, filename);
  
  const failedData = {
    task_id: review.task_id,
    title: review.title || review.original_task?.title,
    status: 'consensus_failed',
    reason: reason,
    chatgpt_review: {
      overall_assessment: review.overall_assessment,
      concerns: review.concerns,
      suggestions: review.suggestions,
      detailed_review: review.detailed_review
    },
    original_dev_memo: review.dev_memo || review.original_task?.dev_memo,
    failed_at: new Date().toISOString(),
    next_action: '성민님이 수동으로 DEV_MEMO를 수정하고 pending-approval/로 이동'
  };
  
  fs.writeFileSync(newPath, JSON.stringify(failedData, null, 2));
  
  console.log('✅ File saved:', newPath);
  
  // Git commit
  try {
    execSync(`git config user.name "Claude Bot"`);
    execSync(`git config user.email "claude@jamus.dev"`);
    execSync(`git add ${newPath}`);
    execSync(`git rm triggers/chatgpt-review/${filename}`);
    execSync(`git commit -m "❌ Task ${review.task_id} - consensus failed - manual review required"`);
    execSync(`git push origin main`);
    
    console.log('✅ Changes pushed to GitHub');
  } catch (error) {
    console.error('❌ Git operations failed:', error.message);
  }
}

// ============================================
// Error History 로드 (Task 7 구현 예정)
// ============================================
function loadErrorHistory(taskId) {
  try {
    const historyPath = 'data/error-history/error-summary.json';
    
    if (!fs.existsSync(historyPath)) {
      console.log('⚠️  Error history file not found (will be created in Task 7)');
      return null;
    }
    
    const content = fs.readFileSync(historyPath, 'utf8');
    const history = JSON.parse(content);
    
    // Task ID와 관련된 에러만 필터링
    const related = history[taskId] || null;
    
    if (related) {
      console.log('📚 Found related error history');
    } else {
      console.log('✅ No related errors found');
    }
    
    return related;
    
  } catch (error) {
    console.log('⚠️  Error loading history:', error.message);
    return null;
  }
}

// ============================================
// 실행
// ============================================
console.log('🎬 Starting analysis...\n');
analyzeChatGPTReview().catch(err => {
  console.error('\n❌ Unhandled error:', err);
  process.exit(1);
});