import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Gemini CLI Executor
 * 
 * triggers/gemini-cli/ 폴더의 Task 파일을 감지하면
 * 자동으로 Gemini CLI를 실행하여 코드를 구현합니다.
 * 
 * 흐름:
 * 1. Task 파일 읽기
 * 2. DEV_MEMO 읽기
 * 3. Gemini CLI 실행 (프롬프트 전달)
 * 4. 결과를 completed/ 폴더에 저장
 * 5. Git 커밋 없음 - 성민님이 수동 확인 후 커밋
 */

async function executeTasks() {
    console.log('💎 Gemini CLI Executor 시작');
    console.log('='.repeat(50));

    // 1. Task 파일 찾기
    const geminiCliDir = 'triggers/gemini-cli/';

    if (!fs.existsSync(geminiCliDir)) {
        console.log('❌ triggers/gemini-cli/ 폴더가 없습니다.');
        return;
    }

    const taskFiles = fs.readdirSync(geminiCliDir)
        .filter(f => f.endsWith('.json'));

    if (taskFiles.length === 0) {
        console.log('ℹ️  실행할 Task가 없습니다.');
        return;
    }

    console.log(`📋 발견된 Task: ${taskFiles.length}개\n`);

    // 각 Task 실행
    for (const file of taskFiles) {
        await executeTask(file);
    }

    // 완료 메시지
    console.log('\n' + '='.repeat(50));
    console.log('✅ 모든 작업 완료!');
    console.log('🔍 로컬에서 결과를 확인하세요.');
    console.log('📁 결과 위치: triggers/completed/');
    console.log('\n📤 확인 후 수동으로 커밋해주세요:');
    console.log('   git add .');
    console.log('   git commit -m "💎 Task completed by Gemini CLI"');
    console.log('   git push');
}

async function executeTask(filename) {
    const taskPath = `triggers/gemini-cli/${filename}`;

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📋 Task 시작: ${filename}`);
    console.log(`${'─'.repeat(50)}\n`);

    try {
        // Task 파일 읽기
        const taskContent = fs.readFileSync(taskPath, 'utf8')
            .replace(/^\uFEFF/, ''); // BOM 제거
        const task = JSON.parse(taskContent);

        console.log(`📌 Task ID: ${task.task_id}`);
        console.log(`📝 Title: ${task.title}`);
        console.log(`🎯 Complexity: ${task.complexity}/10`);
        console.log(`⏱️  Estimated: ${task.estimated_hours}h\n`);

        // DEV_MEMO 읽기
        const memoPath = `triggers/claude-to-gemini/${task.task_id}-memo.md`;
        let devMemo = '';

        if (fs.existsSync(memoPath)) {
            devMemo = fs.readFileSync(memoPath, 'utf8');
            console.log('✅ DEV_MEMO 로드 완료');
        } else {
            console.log('⚠️  DEV_MEMO 없음 - 기본 지침으로 진행');
            devMemo = `Task ${task.task_id}: ${task.title}을 구현하세요.`;
        }

        // Gemini CLI 프롬프트 생성
        const prompt = generateGeminiPrompt(task, devMemo);
        
        console.log('✅ 프롬프트 생성 완료\n');

        // Gemini CLI 실행
        console.log('💎 Gemini CLI 실행 중...');
        console.log('⏳ 최대 30분 소요 가능\n');

        const result = execSync(
            `gemini "${prompt.replace(/"/g, '\\"')}"`,
            {
                encoding: 'utf8',
                timeout: 1800000, // 30분
                stdio: 'pipe'
            }
        );

        console.log('✅ Gemini CLI 실행 완료!\n');
        console.log('📝 Gemini 출력:');
        console.log(result);
        console.log('');

        // 결과 저장
        const completedDir = 'triggers/completed/';
        if (!fs.existsSync(completedDir)) {
            fs.mkdirSync(completedDir, { recursive: true });
        }

        const completed = {
            task_id: task.task_id,
            title: task.title,
            complexity: task.complexity,
            estimated_hours: task.estimated_hours,
            status: 'completed',
            executor: 'gemini-cli',
            completed_at: new Date().toISOString(),
            output: result
        };

        const completedPath = `${completedDir}${task.task_id}.json`;
        fs.writeFileSync(completedPath, JSON.stringify(completed, null, 2));
        console.log(`✅ 결과 저장: ${completedPath}`);

        // 원본 Task 파일 삭제
        fs.unlinkSync(taskPath);
        console.log(`✅ 원본 파일 삭제: ${taskPath}`);

        console.log(`\n✅ ${task.task_id} 완료!`);

    } catch (error) {
        console.error(`\n❌ Task 실행 중 오류 발생:`);
        console.error(`파일: ${filename}`);
        console.error(`오류: ${error.message}`);

        // 오류 발생 시에도 결과 저장 (재시도 방지)
        try {
            const taskContent = fs.readFileSync(taskPath, 'utf8')
                .replace(/^\uFEFF/, '');
            const task = JSON.parse(taskContent);

            const completedDir = 'triggers/completed/';
            if (!fs.existsSync(completedDir)) {
                fs.mkdirSync(completedDir, { recursive: true });
            }

            const errorResult = {
                task_id: task.task_id,
                title: task.title,
                status: 'failed',
                executor: 'gemini-cli',
                completed_at: new Date().toISOString(),
                error: error.message
            };

            const completedPath = `${completedDir}${task.task_id}.json`;
            fs.writeFileSync(completedPath, JSON.stringify(errorResult, null, 2));
            console.log(`⚠️  오류 정보 저장: ${completedPath}`);

            // 원본 파일 삭제 (재시도 방지)
            fs.unlinkSync(taskPath);
            console.log(`⚠️  원본 파일 삭제: ${taskPath}`);
        } catch (saveError) {
            console.error(`❌ 오류 정보 저장 실패:`, saveError.message);
        }
    }
}

function generateGeminiPrompt(task, devMemo) {
    return `# ${task.title}

## Task 정보
- **Task ID**: ${task.task_id}
- **복잡도**: ${task.complexity}/10
- **예상 시간**: ${task.estimated_hours}시간

## Development Spec
${devMemo}

## 프로젝트 구조
- **Framework**: Next.js 15 + TypeScript
- **Backend**: Supabase (Auth + Database)
- **Styling**: TailwindCSS v3
- **컴포넌트**: components/
- **페이지**: app/
- **API**: app/api/
- **타입**: types/

## 코딩 규칙
- TypeScript strict mode 사용
- 모든 컴포넌트는 함수형 컴포넌트
- async/await 사용 (Promise.then 지양)
- 에러 핸들링 필수
- 주석은 간결하게

## 실행 지침
위 Development Spec에 따라 모든 파일을 생성/수정하세요.
완료 후 다음을 보고하세요:
1. 수정한 파일 목록
2. 주요 변경 사항
3. 테스트 필요 여부

**중요**: 기존 파일을 수정할 때는 신중하게 진행하세요.
`;
}

// 실행
executeTasks().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});