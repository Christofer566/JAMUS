
import { Client } from '@notionhq/client';
import {
  BlockObjectResponse,
  PartialBlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

// --- Client Initialization ---
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Configuration ---
const CONTEXT_HUB_PAGE_ID = '2ba75e2c-3a2b-81b8-9bc8-fba67fa17ebc';
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
            case 'heading_1': markdownContent += `# ${getRichText(block.heading_1.rich_text)}\n`; break;
            case 'heading_2': markdownContent += `## ${getRichText(block.heading_2.rich_text)}\n`; break;
            case 'heading_3': markdownContent += `### ${getRichText(block.heading_3.rich_text)}\n`; break;
            case 'paragraph': markdownContent += `${getRichText(block.paragraph.rich_text)}\n`; break;
            case 'bulleted_list_item': markdownContent += `* ${getRichText(block.bulleted_list_item.rich_text)}\n`; break;
            case 'numbered_list_item': markdownContent += `1. ${getRichText(block.numbered_list_item.rich_text)}\n`; break;
            case 'code': markdownContent += `\`\`\`${block.code.language}\n${getRichText(block.code.rich_text)}\n\`\`\`\n`; break;
            default: break;
        }
      }
      nextCursor = response.next_cursor ?? undefined;
    } while (nextCursor);
    return { title: pageTitle, content: markdownContent };
}

function markdownToNotionBlocks(markdown: string): any[] {
    const blocks: any[] = [];
    const lines = markdown.split('\n');
    for (const line of lines) {
        if (line.startsWith('### ')) {
            blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: line.substring(4) } }] } });
        } else if (line.startsWith('## ')) {
            blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.substring(3) } }] } });
        } else if (line.startsWith('# ')) {
            blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: line.substring(2) } }] } });
        } else if (line.startsWith('* ') || line.startsWith('- ')) {
            blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.substring(2) } }] } });
        } else if (line.trim() === '---') {
            blocks.push({ object: 'block', type: 'divider', divider: {} });
        } else if (line.trim().length > 0) {
            blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: line } }] } });
        }
    }
    return blocks;
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

async function getBugHistoryContext(): Promise<string> {
  printHeader('Layer 3: 버그 이력 로딩 (Notion Debugging History DB)');
  let bugContext = '📊 이 Task 관련 파일에서 발생한 과거 버그:\n\n';
  try {
    const response = await notion.databases.query({
      database_id: DEBUGGING_HISTORY_DB_ID,
      sorts: [{ property: '발생 시각', direction: 'descending' }],
      page_size: 5,
    });
    if (response.results.length === 0) return '관련 버그 이력이 없습니다.';
    for (const page of response.results) {
      if (!('properties' in page)) continue;
      const props = page.properties;
      const title = getRichText((props['버그 제목'] as any)?.title);
      const status = (props['상태'] as any)?.select?.name;
      const severity = (props['심각도'] as any)?.select?.name;
      bugContext += `- [${status}] ${title} (${severity})\n`;
    }
    console.log(`✅ ${response.results.length}개의 최근 버그 이력을 로드했습니다.`);
    return bugContext;
  } catch (error: any) {
    console.error('❌ 버그 이력 로딩 실패:', error.message);
    return '버그 이력 로딩에 실패했습니다.';
  }
}

// --- AI Review Functions ---

async function runChatGPTReview(fullContext: string, dsContent: string, dsTitle: string): Promise<string> {
  printHeader('ChatGPT 1차 검토 시작');
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️ OPENAI_API_KEY가 없어 ChatGPT 검토를 건너뜁니다.');
    return 'ChatGPT 검토 건너뜀: OPENAI_API_KEY 없음.';
  }
  const prompt = `${fullContext}\n=== DEVELOPMENT SPEC TO REVIEW ===\n${dsContent}\n=== REVIEW REQUEST ===\n위 컨텍스트를 바탕으로 DS를 검토하고 기술적 타당성, 누락 사항, 리스크, 개선 제안을 마크다운 형식으로 제공해주세요.`;
  try {
    console.log('🧠 ChatGPT API 호출 중...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "당신은 JAMUS 프로젝트의 시니어 개발자입니다. 항상 마크다운 형식으로 상세한 피드백을 제공합니다." }, { role: "user", content: prompt }],
      temperature: 0.7,
    });
    const response = completion.choices[0].message.content;
    console.log('✅ ChatGPT 응답 수신!');
    return response || 'ChatGPT 응답 없음.';
  } catch (error: any) {
    console.error('❌ ChatGPT 검토 중 오류 발생:', error.message);
    return `ChatGPT 검토 중 오류 발생: ${error.message}`;
  }
}

async function runGeminiReview(fullContext: string, dsContent: string, chatGptReview: string, dsTitle: string): Promise<string> {
    printHeader('Gemini 최종 검토 및 실행자 추천 시작');
    if (!process.env.GEMINI_API_KEY) {
        console.log('⚠️ GEMINI_API_KEY가 없어 Gemini 검토를 건너뜁니다.');
        return 'Gemini 검토 건너뜀: GEMINI_API_KEY 없음.';
    }
    const prompt = `${fullContext}\n=== CHATGPT's INITIAL REVIEW ===\n${chatGptReview}\n💡 Your Role: You are a final reviewer. Analyze the DS and ChatGPT's review, then provide a concluding opinion and recommend the best tool for implementation.\n=== DEVELOPMENT SPEC TO REVIEW ===\n${dsContent}\n=== REVIEW REQUEST ===\nBased on all the context, provide a final review and recommend an executor (Antigravity/Gemini CLI/Claude Code) with reasons in Markdown format.`;
    try {
        console.log('💎 Gemini CLI 실행 중...');
        const result = execSync('gemini', {
            input: prompt,
            encoding: 'utf8',
            timeout: 1800000, // 30 mins
            stdio: 'pipe',
            env: { ...process.env },
        });
        console.log('✅ Gemini 최종 검토 완료!');
        return result.toString() || 'Gemini 응답 없음.';
    } catch (error: any) {
        console.error('❌ Gemini 최종 검토 중 오류 발생:', error.message);
        return `Gemini 최종 검토 중 오류 발생: ${error.message}`;
    }
}

// --- Main Orchestrator ---
async function main() {
  const dsPageId = process.argv[2];
  if (!dsPageId) {
    console.error('오류: 검토할 Notion DS 페이지 ID를 명령줄 인자로 제공해주세요.');
    process.exit(1);
  }
  if (!process.env.NOTION_API_KEY) {
    console.error('오류: NOTION_API_KEY 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  printHeader(`DS 페이지 ID: ${dsPageId}에 대한 컨텍스트 인식 AI 검토 시작`);

  try {
    // 1. Fetch all context layers
    const staticContext = await getStaticContext();
    const dynamicContext = await getDynamicContext();
    const bugHistoryContext = await getBugHistoryContext();
    const { title: dsTitle, content: dsContent } = await readNotionPageAsMarkdown(dsPageId);
    
    const fullContext = `
=== PROJECT CONTEXT (GitHub .context/) ===${staticContext}
=== CURRENT STATE (Notion Context Hub) ===${dynamicContext}
=== RELATED BUG HISTORY (Notion Debugging History DB) ===${bugHistoryContext}`;
    
    console.log('✅✅✅ 3-Layer 컨텍스트 종합 완료!');

    // 2. Run AI reviews in sequence
    const chatGptReview = await runChatGPTReview(fullContext, dsContent, dsTitle);
    const geminiFinalReview = await runGeminiReview(fullContext, dsContent, chatGptReview, dsTitle);

    // 3. Combine results and create Notion page
    printHeader('Notion에 검토 결과 페이지 생성 중...');
    const combinedReviewMarkdown = `# AI 개발 Spec 검토 결과: ${dsTitle}\n\n## 🤖 ChatGPT Review\n${chatGptReview}\n\n---\n\n## 💎 Gemini Final Review & Recommendation\n${geminiFinalReview}`;
    const reviewPageTitle = `DS Review: ${dsTitle} (${new Date().toLocaleDateString('ko-KR')})`;
    const blocks = markdownToNotionBlocks(combinedReviewMarkdown);

    const newReviewPage = await notion.pages.create({
      parent: { page_id: dsPageId },
      properties: {
        title: { title: [{ type: 'text', text: { content: reviewPageTitle } }] },
      },
      children: blocks,
    });

    console.log(`✅ Notion 검토 결과 페이지 생성 완료!`);
    console.log(`링크: https://www.notion.so/${newReviewPage.id.replace(/-/g, '')}`);
    printHeader('모든 작업 완료');

  } catch (error) {
    console.error('❌ 전체 워크플로우 실행 중 오류 발생:', error);
    process.exit(1);
  }
}

main();
