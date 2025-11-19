import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GEMINI_CLI_DIR = path.join(__dirname, '../../triggers/gemini-cli');
const COMPLETED_DIR = path.join(__dirname, '../../triggers/completed');

async function executeGeminiCLI() {
  console.log('💎 Gemini CLI Executor 시작\n');

  // 1. Task 파일 찾기
  const files = fs.readdirSync(GEMINI_CLI_DIR).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('ℹ️  실행할 Task 없음');
    return;
  }

  for (const file of files) {
    const filePath = path.join(GEMINI_CLI_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const task = JSON.parse(content.replace(/^\uFEFF/, ''));

    console.log(`📋 Task ${task.task_id}: ${task.title}`);

    // 2. DEV_MEMO 읽기
    const memoPath = path.join(__dirname, `../../triggers/claude-to-gemini/${task.task_id}-memo.md`);
    let devMemo = '';
    
    if (fs.existsSync(memoPath)) {
      devMemo = fs.readFileSync(memoPath, 'utf-8');
      console.log(`   📄 DEV_MEMO 로드 완료`);
    } else {
      console.log(`   ⚠️  DEV_MEMO 없음 - Task 정보만 사용`);
    }

    // 3. Gemini CLI 실행
    try {
      console.log(`   🚀 Gemini CLI 실행 중...`);
      
      const prompt = `
Task: ${task.title}
Complexity: ${task.complexity}/10

DEV_MEMO:
${devMemo}

Please implement this task following the DEV_MEMO specifications.
Use Cursor IDE and commit your changes.
`;

      // Gemini CLI 명령어
      // 실제 구현 시 조정 필요
      execSync(`gemini "${prompt.replace(/"/g, '\\"')}"`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '../..')
      });

      console.log(`   ✅ Task ${task.task_id} 완료\n`);

      // 4. completed/ 폴더로 이동
      const destPath = path.join(COMPLETED_DIR, file);
      fs.renameSync(filePath, destPath);
      console.log(`   📦 Moved to completed: ${file}`);

    } catch (error) {
      console.error(`   ❌ Gemini CLI 실행 실패:`, error.message);
    }
  }
}

executeGeminiCLI().catch(error => {
  console.error('❌ Gemini CLI Executor 실패:', error);
  process.exit(1);
});