import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🚀 Starting ChatGPT Review script...');
console.log('Current directory:', process.cwd());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function reviewTask() {
  try {
    console.log('📂 Checking triggers directory...');
    
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

      const taskContent = fs.readFileSync(taskPath, 'utf8');
      const cleanContent = taskContent.replace(/^\uFEFF/, ''); // BOM 제거
      const task = JSON.parse(cleanContent);

      // ✨ NEW: Check for -memo.md file
      const memoFileName = file.replace('.json', '-memo.md');
      const memoPath = path.join(triggerDir, memoFileName);

      if (fs.existsSync(memoPath)) {
        console.log(`📄 Found MEMO file: ${memoFileName}`);
        const memoContent = fs.readFileSync(memoPath, 'utf8');
        task.dev_memo = memoContent;
        console.log(`✅ DEV_MEMO loaded (${memoContent.length} characters)`);
      } else {
        console.log(`⚠️ No MEMO file found: ${memoFileName}`);
      }

      console.log(`✅ Reviewing task: ${task.task_id}`);

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

      console.log('🤖 Calling ChatGPT API...');
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "당신은 소프트웨어 개발 전문가입니다. 항상 JSON 형식으로 응답합니다." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      });
      
      const response = completion.choices[0].message.content;
      
      console.log('✅ ChatGPT response received');
      console.log('Response preview:', response.substring(0, 200));

      let reviewData;
      try {
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : response;
        reviewData = JSON.parse(jsonStr);
        console.log('✅ JSON parsed successfully');
      } catch (e) {
        console.error('❌ Failed to parse JSON:', e.message);
        reviewData = {
          approval_status: 'needs_revision',
          overall_assessment: 'JSON 파싱 실패',
          concerns: ['응답 형식 오류'],
          suggestions: [],
          detailed_review: response
        };
      }

      const reviewDir = 'triggers/chatgpt-review';
      if (!fs.existsSync(reviewDir)) {
        fs.mkdirSync(reviewDir, { recursive: true });
        console.log('✅ Created review directory');
      }

      const reviewResult = {
        task_id: task.task_id,
        review_round: 1,
        timestamp: new Date().toISOString(),
        reviewer: 'ChatGPT',
        ...reviewData,
        original_task: task
      };

      const reviewPath = path.join(reviewDir, file);
      fs.writeFileSync(reviewPath, JSON.stringify(reviewResult, null, 2));

      console.log(`✅ Review saved to: ${reviewPath}`);

      console.log('📤 Committing to Git...');
      execSync(`git config user.name "ChatGPT Reviewer"`);
      execSync(`git config user.email "chatgpt@jamus.dev"`);
      execSync(`git add ${reviewPath}`);
      execSync(`git rm ${taskPath}`);

      // ✨ NEW: Also remove -memo.md file if it exists
      if (fs.existsSync(memoPath)) {
        execSync(`git rm ${memoPath}`);
        console.log(`✅ Removed MEMO file: ${memoFileName}`);
      }

      execSync(`git commit -m "🤖 ChatGPT Review Round 1: ${task.task_id}"`);
      execSync(`git push origin main`);

      console.log('✅ Review complete and pushed to GitHub');
    }

  } catch (error) {
    console.error('❌ Error in ChatGPT review:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

console.log('🎬 Calling reviewTask()...');
reviewTask().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});