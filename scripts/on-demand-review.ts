import { Client } from '@notionhq/client';
import { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- Client Initialization ---
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

// --- Configuration ---
const CONTEXT_HUB_PAGE_ID = process.env.CONTEXT_HUB_PAGE_ID || '2ba75e2c-3a2b-81b8-9bc8-fba67fa17ebc';
const DEBUGGING_HISTORY_DB_ID = '2b475e2c-3a2b-80e2-ba6d-e76d74ddaee6';
const STATIC_CONTEXT_PATH = '.context';

// --- Helper Functions ---
const printHeader = (title: string) => {
  console.log('\n' + '='.repeat(60));
  console.log(`🤖 ${title}`);
  console.log('='.repeat(60) + '\n');
};

const getRichText = (richText: any[]): string => {
  if (!richText) return '';
  return richText.map((textItem) => textItem.plain_text || '').join('');
};

async function readNotionPageAsMarkdown(pageId: string): Promise<{ title: string; content: string }> {
    try {
        let markdownContent = '';
        let pageTitle = 'Untitled';

        const page = await notion.pages.retrieve({ page_id: pageId });
        if ('properties' in page && 'title' in page.properties && 'title' in (page.properties.title as any) && (page.properties.title as any).title.length > 0) {
          pageTitle = getRichText((page.properties.title as any).title);
        }

        let nextCursor: string | undefined = undefined;
        do {
          const response = await notion.blocks.children.list({
            block_id: pageId,
            start_cursor: nextCursor,
          });
          const blocks = response.results as BlockObjectResponse[];
          for (const block of blocks) {
            if (!('type' in block)) continue;
            switch (block.type) {
                case 'heading_1': markdownContent += `# ${getRichText(block.heading_1.rich_text)}\n\n`; break;
                case 'heading_2': markdownContent += `## ${getRichText(block.heading_2.rich_text)}\n\n`; break;
                case 'heading_3': markdownContent += `### ${getRichText(block.heading_3.rich_text)}\n\n`; break;
                case 'paragraph': markdownContent += `${getRichText(block.paragraph.rich_text)}\n\n`; break;
                case 'bulleted_list_item': markdownContent += `* ${getRichText(block.bulleted_list_item.rich_text)}\n`; break;
                case 'numbered_list_item': markdownContent += `1. ${getRichText(block.numbered_list_item.rich_text)}\n`; break;
                case 'code':
                    markdownContent += '```' + (block.code.language || '') + '\n' + getRichText(block.code.rich_text) + '\n```\n\n';
                    break;
                default: break;
            }
          }
          nextCursor = response.next_cursor ?? undefined;
        } while (nextCursor);
        return { title: pageTitle, content: markdownContent };
    } catch (error: any) {
        console.error(`❌ Notion 페이지 읽기 오류 (ID: ${pageId}):`, error.message);
        throw error;
    }
}

function markdownToNotionBlocks(markdown: string): any[] {
    const blocks: any[] = [];
    const lines = markdown.split('\n');
    let inCodeBlock = false;
    let codeContent = '';
    let codeLanguage = '';

    for (const line of lines) {
        if (line.startsWith('```')) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeLanguage = line.substring(3).trim();
                codeContent = '';
            } else {
                inCodeBlock = false;
                // Notion 코드 블록 2000자 제한 처리: 긴 코드는 여러 블록으로 분할
                const MAX_CODE_LENGTH = 1900; // 여유 있게 1900자
                if (codeContent.length <= MAX_CODE_LENGTH) {
                    blocks.push({ object: 'block', type: 'code', code: {
                        rich_text: [{ type: 'text', text: { content: codeContent } }],
                        language: codeLanguage || 'plain text'
                    }});
                } else {
                    // 줄 단위로 분할하여 2000자 초과 방지
                    const codeLines = codeContent.split('\n');
                    let chunk = '';
                    let partIndex = 1;
                    for (const codeLine of codeLines) {
                        if ((chunk + codeLine + '\n').length > MAX_CODE_LENGTH) {
                            if (chunk) {
                                blocks.push({ object: 'block', type: 'code', code: {
                                    rich_text: [{ type: 'text', text: { content: `// Part ${partIndex}\n${chunk}` } }],
                                    language: codeLanguage || 'plain text'
                                }});
                                partIndex++;
                            }
                            chunk = codeLine + '\n';
                        } else {
                            chunk += codeLine + '\n';
                        }
                    }
                    if (chunk.trim()) {
                        blocks.push({ object: 'block', type: 'code', code: {
                            rich_text: [{ type: 'text', text: { content: `// Part ${partIndex}\n${chunk}` } }],
                            language: codeLanguage || 'plain text'
                        }});
                    }
                }
            }
        } else if (inCodeBlock) {
            codeContent += line + '\n';
        } else if (line.startsWith('### ')) {
            blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: line.substring(4) } }] } });
        } else if (line.startsWith('## ')) {
            blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.substring(3) } }] } });
        } else if (line.startsWith('# ')) {
            blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: line.substring(2) } }] } });
        } else if (line.startsWith('* ') || line.startsWith('- ')) {
            const content = line.substring(2);
            // Notion rich text는 2000자 제한
            const chunks = content.match(/.{1,2000}/g) || [content];
            blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: {
                rich_text: chunks.map(chunk => ({ type: 'text', text: { content: chunk } }))
            }});
        } else if (line.trim() === '---') {
            blocks.push({ object: 'block', type: 'divider', divider: {} });
        } else if (line.trim().length > 0) {
            // 2000자 제한 처리
            const chunks = line.match(/.{1,2000}/g) || [line];
            blocks.push({ object: 'block', type: 'paragraph', paragraph: {
                rich_text: chunks.map(chunk => ({ type: 'text', text: { content: chunk } }))
            }});
        }
    }
    return blocks;
}

// --- v2.0 New Functions ---

/**
 * DS에서 난이도 추출
 */
function extractDifficulty(dsContent: string): number {
    const match = dsContent.match(/난이도[:\s]*(\d+)/i);
    return match ? parseInt(match[1]) : 5; // 기본값 5
}

/**
 * DS에서 수정 대상 파일 목록 추출
 */
function extractFilesToModify(dsContent: string): string[] {
    const files: string[] = [];
    // "📄 파일명" 패턴 찾기
    const fileMatches = dsContent.matchAll(/📄\s*([^\s]+\.(tsx?|jsx?|css))/gi);
    for (const match of fileMatches) {
        files.push(match[1]);
    }
    return files;
}

/**
 * 파일 전체 코드 읽기
 */
function getFileCode(filePath: string): string {
    try {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf8');
        }
        return `파일을 찾을 수 없음: ${filePath}`;
    } catch (error: any) {
        return `파일 읽기 오류: ${error.message}`;
    }
}

/**
 * 파일별 버그 이력 검색 및 패턴 분석
 */
async function getBugHistoryForFiles(files: string[]): Promise<string> {
    printHeader('Layer 3: 버그 이력 분석 (파일별 패턴)');

    try {
        const response = await notion.databases.query({
            database_id: DEBUGGING_HISTORY_DB_ID,
            sorts: [{ property: '발생 시각', direction: 'descending' }],
            page_size: 50,
        });

        // 버그 유형별 통계
        const bugPatterns: Record<string, { count: number; files: Set<string>; lastOccurred: string }> = {};

        for (const page of response.results) {
            if (!('properties' in page)) continue;
            const props = page.properties;
            const title = getRichText((props['버그 제목'] as any)?.title);
            const week = (props['발생 주차'] as any)?.select?.name || 'Unknown';

            // 파일 관련성 체크
            const isRelevant = files.some(file => title.includes(file.split('/').pop() || ''));
            if (!isRelevant) continue;

            // 버그 유형 분류
            let bugType = 'Unknown';
            if (title.includes('useEffect') || title.includes('의존성')) bugType = 'useEffect 의존성 누락';
            else if (title.includes('비동기') || title.includes('타이밍')) bugType = '비동기 타이밍 이슈';
            else if (title.includes('상태') || title.includes('업데이트')) bugType = '상태 업데이트 순서';
            else if (title.includes('타입')) bugType = '타입 에러';
            else if (title.includes('메모리') || title.includes('누수')) bugType = '메모리 누수';

            if (!bugPatterns[bugType]) {
                bugPatterns[bugType] = { count: 0, files: new Set(), lastOccurred: week };
            }
            bugPatterns[bugType].count++;
            bugPatterns[bugType].files.add(title);
        }

        if (Object.keys(bugPatterns).length === 0) {
            return '관련 버그 이력이 없습니다.';
        }

        let result = '📊 이 Task 관련 파일에서 발생한 과거 버그:\n\n';
        result += '| 버그 유형 | 발생 횟수 | 마지막 발생 |\n';
        result += '|----------|----------|------------|\n';

        const sorted = Object.entries(bugPatterns).sort((a, b) => b[1].count - a[1].count);
        for (const [type, data] of sorted) {
            result += `| ${type} | ${data.count}회 | ${data.lastOccurred} |\n`;
        }

        result += '\n⚠️ 집중 검토 필요: ' + sorted.slice(0, 3).map(([type]) => type).join(', ');

        console.log(`✅ ${response.results.length}개의 버그 이력 분석 완료`);
        return result;

    } catch (error: any) {
        console.error('❌ 버그 이력 분석 실패:', error.message);
        return '버그 이력 분석 실패';
    }
}

// --- 3-Layer Context Fetching Functions ---

async function getStaticContext(): Promise<string> {
  printHeader('Layer 1: 고정 컨텍스트 로딩 (GitHub .context/)');
  let staticContext = '';
  try {
    const files = fs.readdirSync(STATIC_CONTEXT_PATH);
    for (const file of files) {
      const content = fs.readFileSync(path.join(STATIC_CONTEXT_PATH, file), 'utf8');
      staticContext += `\n--- ${file} ---\n${content}\n`;
    }
    console.log(`✅ ${files.length}개의 고정 컨텍스트 파일을 로드했습니다.`);
    return staticContext;
  } catch (error: any) {
    console.error('❌ 고정 컨텍스트 로딩 실패:', error.message);
    return '고정 컨텍스트 로딩에 실패했습니다.';
  }
}

async function getDynamicContext(): Promise<string> {
  printHeader('Layer 2: 동적 컨텍스트 로딩 (Notion Context Hub)');
  try {
    const { content } = await readNotionPageAsMarkdown(CONTEXT_HUB_PAGE_ID);
    console.log('✅ Notion Context Hub 콘텐츠를 로드했습니다.');
    return content;
  } catch (error: any) {
    console.error('❌ 동적 컨텍스트 로딩 실패:', error.message);
    return '동적 컨텍스트 로딩에 실패했습니다.';
  }
}

// --- AI Review Functions (v2.0) ---

async function runChatGPTReview(
    fullContext: string,
    dsContent: string,
    difficulty: number,
    filesCode: string,
    bugHistory: string
): Promise<string> {
  printHeader(`ChatGPT 검토 시작 (난이도: ${difficulty})`);

  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️ OPENAI_API_KEY가 없어 ChatGPT 검토를 건너뜁니다.');
    return 'ChatGPT 검토 건너뜀: OPENAI_API_KEY 없음.';
  }

  // 난이도별 검토 깊이
  if (difficulty <= 5) {
    return '난이도 1-5: 검토 스킵 (바로 구현 가능)';
  }

  const isFullReview = difficulty >= 8;

  const prompt = `=== ROLE ===
당신은 시니어 코드 리뷰어입니다.
- 칭찬하지 마세요
- 문제가 없으면 "이슈 없음"만 답변
- 문제 발견 시: [문제] → [왜 문제인지] → [수정 코드] 형식
- 일반적인 조언 금지, 이 DS에 특정된 피드백만

${fullContext}

${bugHistory}

=== CURRENT FILE CODE (수정 대상 파일 전체) ===
${filesCode}

=== DEVELOPMENT SPEC TO REVIEW ===
${dsContent}

=== REVIEW REQUEST ===

### 1. 과거 버그 패턴 검토
위 버그 이력의 패턴이 이번 DS에도 있는지 검토:
- useEffect 의존성: Pass/Fail + 구체적 위치
- 비동기 타이밍: Pass/Fail + 구체적 위치
- 상태 업데이트 순서: Pass/Fail + 구체적 위치

${isFullReview ? `
### 2. 아키텍처 검토 (난이도 8+ 전용)
**리팩토링 필요성:**
- 파일 분리 필요한가? (300줄 이상이면 검토)
- 중복 로직 있는가? → 공통 유틸로 추출 제안
- 책임이 너무 많은가? → 단일 책임 원칙 위반 여부

**구조 개선 제안:**
- 커스텀 훅 분리 제안
- 상태 관리 개선 제안
- 타입 정의 분리 제안

**기술 부채:**
- TODO/FIXME 발견 목록
- 하드코딩 값 목록
` : ''}

### 3. 로직 체크리스트
[ ] useEffect cleanup 있는가? - Pass/Fail + 이유
[ ] 타입 정의 완전한가? - Pass/Fail + 이유
[ ] 에러 핸들링 빠진 케이스 없는가? - Pass/Fail + 이유
[ ] 기존 코드와 충돌 가능성 없는가? - Pass/Fail + 이유
[ ] 성능 병목 가능성 없는가? - Pass/Fail + 이유
[ ] 메모리 누수 가능성 없는가? - Pass/Fail + 이유

### 4. Diff 기반 충돌 검토
현재 코드와 DS 제안 수정을 비교하여:
- 기존 로직을 깨뜨리는 부분
- 사이드이펙트 가능성
각각에 대해: [문제] → [왜 문제인지] → [대안 코드]

### 5. 최종 판정
[ ] 수정 없이 진행 가능
[ ] 경미한 수정 후 진행 (목록)
[ ] 중대한 수정 필요 (목록)
[ ] 리팩토링 선행 필요 (범위)`;

  try {
    console.log('🧠 ChatGPT API 호출 중...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "당신은 JAMUS 프로젝트의 시니어 코드 리뷰어입니다. 칭찬 금지, 비판적 검토, 체크리스트 형식 준수." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
    });
    const response = completion.choices[0].message.content;
    console.log('✅ ChatGPT 응답 수신!');
    return response || 'ChatGPT 응답 없음.';
  } catch (error: any) {
    console.error('❌ ChatGPT 검토 중 오류 발생:', error.message);
    return `ChatGPT 검토 중 오류 발생: ${error.message}`;
  }
}

async function runGeminiReview(
    fullContext: string,
    dsContent: string,
    filesCode: string,
    difficulty: number
): Promise<string> {
    printHeader(`Gemini BLOCK 생성 및 검토 (난이도: ${difficulty})`);

    if (!process.env.GEMINI_API_KEY) {
        console.log('⚠️ GEMINI_API_KEY가 없어 Gemini 검토를 건너뜁니다.');
        return 'Gemini 검토 건너뜀: GEMINI_API_KEY 없음.';
    }

    const prompt = `=== ROLE ===
당신은 JAMUS 프로젝트의 프론트엔드 UI 개발자입니다.
두 가지 역할을 수행합니다:
1. GEMINI BLOCK 직접 생성 (당신이 실행할 블록)
2. 실행 가능성 검토

${fullContext}

=== CURRENT FILE CODE (수정 대상 파일) ===
${filesCode}

=== DEVELOPMENT SPEC (GEMINI BLOCK 제외) ===
${dsContent}

=== TASK 1: GEMINI BLOCK 생성 ===
위 DS를 읽고 GEMINI BLOCK을 직접 작성하세요.
당신이 실행할 블록이므로 실행 가능한 형태로 작성하세요.

포함 항목:
- 참조 파일 (베이스 파일, 재사용 컴포넌트)
- 작업 내용 (추가/제거/유지)
- 레이아웃 (ASCII)
- 스타일 상세 (Tailwind 클래스 포함)
- 생성/수정 파일 목록
- 완료 조건

=== TASK 2: 실행 가능성 검토 ===
[ ] import 경로 모두 존재하는가? - Pass/Fail + 위치
[ ] 사용된 컴포넌트 모두 존재하는가? - Pass/Fail + 위치
[ ] Tailwind 클래스 모두 유효한가? - Pass/Fail + 위치
[ ] 타입 정의와 실제 사용 일치하는가? - Pass/Fail + 위치
[ ] 기존 props 인터페이스와 호환되는가? - Pass/Fail + 위치
[ ] 디자인 시스템 색상/폰트 준수하는가? - Pass/Fail + 위치

누락 발견 시:
- [누락 항목]: [추가해야 할 코드]

=== TASK 3: 실행자 추천 ===
📊 실행자 추천:
- 복잡도: X/10
- 예상 파일 수정: N개
- 권장: [Gemini CLI / Claude Code]
- 추천 이유: [구체적 이유]`;

    try {
        console.log('💎 Gemini API 호출 중...');
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
        const result = await model.generateContent(prompt);
        const response = result.response.text();
        console.log('✅ Gemini API 호출 완료!');
        return response || 'Gemini 응답 없음.';
    } catch (error: any) {
        console.error('❌ Gemini 검토 중 오류 발생:', error.message);
        return `Gemini 검토 중 오류 발생: ${error.message}`;
    }
}

// --- Main Orchestrator ---
async function main() {
  const dsPageId = process.argv[2];
  if (!dsPageId) {
    console.error('오류: 검토할 Notion DS 페이지 ID를 명령줄 인자로 제공해주세요.');
    console.error('사용법: npx tsx scripts/on-demand-review.ts <NOTION_PAGE_ID>');
    process.exit(1);
  }
  if (!process.env.NOTION_API_KEY) {
    console.error('오류: NOTION_API_KEY 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  printHeader(`DS 페이지 ID: ${dsPageId}에 대한 컨텍스트 인식 AI 검토 v2.0 시작`);

  try {
    // 1. DS 내용 읽기
    const { title: dsTitle, content: dsContent } = await readNotionPageAsMarkdown(dsPageId);

    // 2. 난이도 추출
    const difficulty = extractDifficulty(dsContent);
    console.log(`📊 난이도: ${difficulty}/10`);

    if (difficulty <= 5) {
        console.log('✅ 난이도 1-5: 검토 스킵, 바로 구현 가능');
        const reviewPageTitle = `DS Review: ${dsTitle} (난이도 ${difficulty} - 스킵)`;
        const skipMessage = `# DS Review 결과: ${dsTitle}\n\n## 📊 요약\n- 난이도: ${difficulty}/10\n- 검토 깊이: 스킵\n- 최종 판정: 바로 구현 가능\n\n난이도 1-5는 검토 없이 바로 구현 가능합니다.`;
        const blocks = markdownToNotionBlocks(skipMessage);

        await notion.pages.create({
            parent: { page_id: dsPageId },
            properties: {
                title: { title: [{ type: 'text', text: { content: reviewPageTitle } }] },
            },
            children: blocks,
        });
        console.log('✅ 검토 스킵 결과 Notion에 기록 완료');
        return;
    }

    // 3. 컨텍스트 로딩
    const staticContext = await getStaticContext();
    const dynamicContext = await getDynamicContext();

    // 4. 수정 대상 파일 추출 및 코드 로딩
    const files = extractFilesToModify(dsContent);
    console.log(`📄 수정 대상 파일: ${files.length}개`);

    let filesCode = '';
    for (const file of files) {
        const code = getFileCode(file);
        filesCode += `\n📄 ${file} (${code.split('\n').length}줄)\n\`\`\`typescript\n${code}\n\`\`\`\n\n`;
    }

    // 5. 버그 이력 분석
    const bugHistory = await getBugHistoryForFiles(files);

    const fullContext = `
=== PROJECT CONTEXT (GitHub .context/) ===${staticContext}
=== CURRENT STATE (Notion Context Hub) ===${dynamicContext}`;

    console.log('✅✅✅ 컨텍스트 종합 완료!');

    // 6. AI 검토 실행
    const chatGptReview = await runChatGPTReview(fullContext, dsContent, difficulty, filesCode, bugHistory);
    const geminiReview = await runGeminiReview(fullContext, dsContent, filesCode, difficulty);

    // 7. 표준화된 결과 생성
    printHeader('Notion에 검토 결과 페이지 생성 중...');

    const reviewDepth = difficulty >= 8 ? '풀검토' : '체크리스트';
    const combinedReviewMarkdown = `# DS Review 결과: ${dsTitle}

## 📊 요약
- 난이도: ${difficulty}/10
- 검토 깊이: ${reviewDepth}
- 최종 판정: [ChatGPT 검토 참조]
- 권장 실행자: [Gemini 검토 참조]

---

## 🔍 ChatGPT 검토

${chatGptReview}

---

## 💎 Gemini 검토

${geminiReview}`;

    const reviewPageTitle = `DS Review: ${dsTitle} (난이도 ${difficulty})`;
    const blocks = markdownToNotionBlocks(combinedReviewMarkdown);

    const newReviewPage = await notion.pages.create({
      parent: { page_id: dsPageId },
      properties: {
        title: { title: [{ type: 'text', text: { content: reviewPageTitle } }] },
      },
      children: blocks.slice(0, 100), // Notion API 제한
    });

    console.log(`✅ Notion 검토 결과 페이지 생성 완료!`);
    console.log(`링크: https://www.notion.so/${newReviewPage.id.replace(/-/g, '')}`);
    printHeader('모든 작업 완료');

  } catch (error: any) {
    console.error('❌ 전체 워크플로우 실행 중 오류 발생:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
