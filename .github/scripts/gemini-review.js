const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting Gemini Review script...');
console.log('Current directory:', process.cwd());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function reviewTask() {
  try {
    console.log('📂 Checking triggers directory...');
    
    // 1. claude-to-gemini 폴더에서 Task 파일 읽기
    const triggerDir = 'triggers/claude-to-gemini';
    
    console.log('Reading directory:', triggerDir);
    
    if (!fs.existsSync(triggerDir)) {
      console.log('❌ Directory does not exist!');
      return;
    }
    
    const files = fs.readdirSync(triggerDir).filter(f => f.endsWith('.json'));
    
    console.log(`✅ Found ${files.length} JSON files:`, files);
    
    if (files.length === 0) {
      console.log('⚠️ No tasks to review');
      return;
    }

    for (const file of files) {
      console.log(`\n📝 Processing file: ${file}`);
      const taskPath = path.join(triggerDir, file);
      const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
      
      console.log(`✅ Reviewing task: ${task.task_id}`);

      // ... 나머지 코드는 그대로 ...
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function reviewTask() {
  try {
    // 1. claude-to-gemini 폴더에서 Task 파일 읽기
    const triggerDir = 'triggers/claude-to-gemini';
    const files = fs.readdirSync(triggerDir).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
      console.log('No tasks to review');
      return;
    }

    for (const file of files) {
      const taskPath = path.join(triggerDir, file);
      const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
      
      console.log(`Reviewing task: ${task.task_id}`);

      // 2. Gemini 검토 프롬프트
      const prompt = `
당신은 JAMUS 프로젝트의 시니어 개발자입니다.
Claude가 작성한 개발 계획(DEV_MEMO)을 검토하고 피드백을 제공하세요.

# Task 정보
- Task ID: ${task.task_id}
- Title: ${task.title || 'N/A'}
- Complexity: ${task.complexity || 'N/A'}/10
- Estimated Time: ${task.estimated_time || 'N/A'}

# Claude DEV_MEMO
${task.dev_memo || 'No DEV_MEMO provided'}

# 검토 지침
1. **타당성 검토**: 개발 계획이 실현 가능한가?
2. **누락 사항**: 빠진 중요한 단계나 고려사항은?
3. **리스크**: 잠재적 문제점이나 주의사항은?
4. **개선 제안**: 더 나은 접근 방법은?

# 응답 형식 (JSON)
반드시 다음 형식으로 응답하세요:
\`\`\`json
{
  "approval_status": "approved" or "needs_revision",
  "overall_assessment": "전체적인 평가 (2-3문장)",
  "concerns": ["우려사항1", "우려사항2"],
  "suggestions": ["개선제안1", "개선제안2"],
  "detailed_review": "상세한 검토 의견"
}
\`\`\`
`;

      // 3. Gemini API 호출
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      console.log('Gemini response:', response);

      // 4. JSON 파싱 (코드 블록 제거)
      let reviewData;
      try {
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : response;
        reviewData = JSON.parse(jsonStr);
      } catch (e) {
        console.error('Failed to parse JSON, using raw response');
        reviewData = {
          approval_status: 'needs_revision',
          overall_assessment: 'JSON 파싱 실패',
          concerns: ['응답 형식 오류'],
          suggestions: [],
          detailed_review: response
        };
      }

      // 5. Review 결과 저장
      const reviewDir = 'triggers/gemini-review';
      if (!fs.existsSync(reviewDir)) {
        fs.mkdirSync(reviewDir, { recursive: true });
      }

      const reviewResult = {
        task_id: task.task_id,
        review_round: 1,
        timestamp: new Date().toISOString(),
        ...reviewData,
        original_task: task
      };

      const reviewPath = path.join(reviewDir, file);
      fs.writeFileSync(reviewPath, JSON.stringify(reviewResult, null, 2));

      console.log(`Review saved to: ${reviewPath}`);

      // 6. Git 커밋 & 푸시
      execSync(`git config user.name "Gemini Reviewer"`);
      execSync(`git config user.email "gemini@jamus.dev"`);
      execSync(`git add ${reviewPath}`);
      
      // 원본 파일 삭제 (이미 처리됨)
      execSync(`git rm ${taskPath}`);
      
      execSync(`git commit -m "🤖 Gemini Review Round 1: ${task.task_id}"`);
      execSync(`git push origin main`);

      console.log('✅ Review complete and pushed to GitHub');
    }

  } catch (error) {
    console.error('Error in Gemini review:', error);
    process.exit(1);
  }
}

reviewTask();
console.log('✅ Review complete and pushed to GitHub');
    }

  } catch (error) {
    console.error('❌ Error in Gemini review:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

console.log('🎬 Calling reviewTask()...');
reviewTask().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});