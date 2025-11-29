
import OpenAI from 'openai';
import { Client } from '@notionhq/client';
import {
  BlockObjectResponse,
  PartialBlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Notion 클라이언트 초기화
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper to print a styled header
const printHeader = (title: string) => {
  console.log('\n' + '='.repeat(60));
  console.log(`🤖 ${title}`);
  console.log('='.repeat(60) + '\n');
};

// Rich Text 배열에서 일반 텍스트 추출
const getRichText = (richText: any[]): string => {
  if (!richText) return '';
  return richText.map((textItem) => textItem.plain_text).join('');
};

// Notion 페이지 콘텐츠를 읽고 Markdown으로 변환
async function readNotionPageContent(pageId: string): Promise<{ title: string; markdownContent: string }> {
  let fullMarkdownContent = '';
  let pageTitle = 'Untitled';

  try {
    // Get page title
    const page = await notion.pages.retrieve({ page_id: pageId });
    if ('properties' in page && 'title' in page.properties && 'title' in page.properties.title && page.properties.title.title.length > 0) {
      pageTitle = getRichText(page.properties.title.title);
    } else if ('properties' in page && 'Name' in page.properties && 'title' in page.properties.Name && page.properties.Name.title.length > 0) {
      // Handle cases where the title property might be named 'Name'
      pageTitle = getRichText(page.properties.Name.title);
    }

    printHeader(`Notion 페이지 콘텐츠 읽기 시작: ${pageTitle} (ID: ${pageId})`);

    let nextCursor: string | undefined = undefined;
    do {
      const response: { results: (BlockObjectResponse | PartialBlockObjectResponse)[], next_cursor: string | null } = await notion.blocks.children.list({
        block_id: pageId,
        start_cursor: nextCursor,
      });

      const blocks = response.results as BlockObjectResponse[];

      for (const block of blocks) {
        if (!('type' in block)) continue;

        switch (block.type) {
          case 'heading_1':
            fullMarkdownContent += `# ${getRichText(block.heading_1.rich_text)}\n\n`;
            break;
          case 'heading_2':
            fullMarkdownContent += `## ${getRichText(block.heading_2.rich_text)}\n\n`;
            break;
          case 'heading_3':
            fullMarkdownContent += `### ${getRichText(block.heading_3.rich_text)}\n\n`;
            break;
          case 'paragraph':
            fullMarkdownContent += `${getRichText(block.paragraph.rich_text)}\n\n`;
            break;
          case 'bulleted_list_item':
            fullMarkdownContent += `* ${getRichText(block.bulleted_list_item.rich_text)}\n`;
            break;
          case 'numbered_list_item':
            fullMarkdownContent += `1. ${getRichText(block.numbered_list_item.rich_text)}\n`;
            break;
          case 'code':
            fullMarkdownContent += "\n```" + (block.code.language || '') + "\n" + getRichText(block.code.rich_text) + "\n```\n\n";
            break;
          case 'divider':
            fullMarkdownContent += `---\n\n`;
            break;
          case 'to_do':
            const checked = block.to_do.checked ? '[x]' : '[ ]';
            fullMarkdownContent += `${checked} ${getRichText(block.to_do.rich_text)}\n\n`;
            break;
          case 'quote':
            fullMarkdownContent += `> ${getRichText(block.quote.rich_text)}\n\n`;
            break;
          case 'child_page':
            // Recursively fetch child page content and append
            const childContent = await readNotionPageContent(block.id);
            fullMarkdownContent += `\n--- Child Page: ${childContent.title} ---\n\n${childContent.markdownContent}\n---\n\n`;
            break;
          default:
            // console.log(`[Unsupported Block Type: ${block.type}]`);
            break;
        }
      }
      nextCursor = response.next_cursor ?? undefined;
    } while (nextCursor);

    console.log(`✅ Notion 페이지 콘텐츠 읽기 완료: ${pageTitle} (${fullMarkdownContent.length} 자)`);
    return { title: pageTitle, markdownContent: fullMarkdownContent };

  } catch (error) {
    console.error(`❌ Notion 페이지 읽기 오류 (ID: ${pageId}):`, error);
    throw error;
  }
}

// GPT 리뷰 실행
async function runGPTReview(taskTitle: string, devMemo: string): Promise<string> {
  printHeader('ChatGPT 개발 계획 검토 시작');

  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️ OPENAI_API_KEY가 설정되지 않아 ChatGPT 검토를 건너뜁니다.');
    return 'ChatGPT 검토 건너뜀: OPENAI_API_KEY 없음.';
  }

  const prompt = `
당신은 JAMUS 프로젝트의 시니어 개발자입니다.
아래의 개발 계획(Development Spec)을 검토하고 피드백을 제공하세요.

# Task 정보
- Task Title: ${taskTitle}

# Development Spec
${devMemo}

# 검토 지침
1. **타당성 검토**: 이 개발 계획이 기술적으로 실현 가능한가?
2. **누락 사항**: 계획에서 빠진 중요한 단계나 고려사항은 없는가?
3. **리스크 분석**: 잠재적 문제점, 기술적 난관, 또는 예상치 못한 사이드 이펙트는 무엇인가?
4. **개선 제안**: 더 효율적이거나 안정적인 다른 접근 방법이 있는가?

# 응답 형식 (Markdown)
아래의 항목을 포함하여 마크다운 형식으로 자유롭게 검토 의견을 작성하세요.
- **전체적인 평가**: (계획에 대한 전반적인 의견)
- **주요 우려 사항**: (리스크 분석에 기반한 내용)
- **개선 제안 사항**: (더 나은 방법에 대한 구체적인 제안)
- **상세 검토 의견**: (각 항목에 대한 상세한 피드백)
`;

  try {
    console.log('🧠 ChatGPT API 호출 중...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "당신은 소프트웨어 개발 전문가입니다. 항상 마크다운 형식으로 상세한 피드백을 제공합니다." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    const response = completion.choices[0].message.content;
    console.log('✅ ChatGPT 응답 수신!');
    return response || 'ChatGPT 응답 없음.';

  } catch (error: any) {
    console.error('❌ ChatGPT 검토 중 오류 발생:', error.message);
    return `ChatGPT 검토 중 오류 발생: ${error.message}`;
  }
}

// Gemini 리뷰 실행
async function runGeminiReview(taskTitle: string, devMemo: string): Promise<string> {
  printHeader('Gemini 개발 계획 검토 시작');

  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️ GEMINI_API_KEY가 설정되지 않아 Gemini 검토를 건너뜁니다.');
    return 'Gemini 검토 건너뜀: GEMINI_API_KEY 없음.';
  }

  const prompt = `당신은 JAMUS 프로젝트의 시니어 개발자입니다.
아래의 개발 계획(Development Spec)을 검토하고 피드백을 제공하세요.

# Task 정보
- Task Title: ${taskTitle}

# Development Spec
${devMemo}

# 검토 지침
1. **타당성 검토**: 이 개발 계획이 기술적으로 실현 가능한가?
2. **누락 사항**: 계획에서 빠진 중요한 단계나 고려사항은 없는가?
3. **리스크 분석**: 잠재적 문제점, 기술적 난관, 또는 예상치 못한 사이드 이펙트는 무엇인가?
4. **개선 제안**: 더 효율적이거나 안정적인 다른 접근 방법이 있는가?

# 응답 형식 (Markdown)
아래의 항목을 포함하여 마크다운 형식으로 자유롭게 검토 의견을 작성하세요.
- **전체적인 평가**: (계획에 대한 전반적인 의견)
- **주요 우려 사항**: (리스크 분석에 기반한 내용)
- **개선 제안 사항**: (더 나은 방법에 대한 구체적인 제안)
- **상세 검토 의견**: (각 항목에 대한 상세한 피드백)
`;

  try {
    console.log('💎 Gemini CLI 실행 중... (시간이 걸릴 수 있습니다)');
    // Using execSync to run the gemini CLI tool
    const result = execSync(
        'gemini',
        {
            input: prompt,
            encoding: 'utf8',
            timeout: 1800000, // 30 mins
            stdio: 'pipe',
            env: { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY } // Ensure API key is passed to CLI
        }
    );
    console.log('✅ Gemini CLI 실행 완료!');
    return result.toString() || 'Gemini 응답 없음.';

  } catch (error: any) {
    console.error('❌ Gemini 검토 중 오류 발생:', error.message);
    console.error('Gemini CLI 도구가 올바르게 인증되지 않았을 수 있습니다. GEMINI_API_KEY 환경 변수가 설정되었는지 확인해주세요.');
    return `Gemini 검토 중 오류 발생: ${error.message}`;
  }
}

// Markdown 콘텐츠를 Notion 블록으로 변환
// 주의: 이 변환기는 매우 기본적인 마크다운만 처리합니다. 복잡한 마크다운은 Notion API가 직접 지원하는 파서가 없으므로 완벽한 변환이 어렵습니다.
function markdownToNotionBlocks(markdown: string): any[] {
  const blocks: any[] = [];
  const lines = markdown.split('\n');

  let currentListType: 'bulleted' | 'numbered' | null = null;
  let listItemCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: line.substring(4) } }],
        },
      });
      currentListType = null;
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: line.substring(3) } }],
        },
      });
      currentListType = null;
    } else if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ type: 'text', text: { content: line.substring(2) } }],
        },
      });
      currentListType = null;
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      if (currentListType !== 'bulleted') {
        currentListType = 'bulleted';
        listItemCount = 0; // Reset for new list
      }
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: line.substring(2).trim() } }],
        },
      });
    } else if (line.match(/^\d+\.\s/)) {
        if (currentListType !== 'numbered') {
            currentListType = 'numbered';
            listItemCount = 0; // Reset for new list
        }
        blocks.push({
            object: 'block',
            type: 'numbered_list_item',
            numbered_list_item: {
                rich_text: [{ type: 'text', text: { content: line.replace(/^\d+\.\s/, '').trim() } }],
            },
        });
    }
    else if (line === '---') {
        blocks.push({
            object: 'block',
            type: 'divider',
            divider: {},
        });
        currentListType = null;
    }
    else if (line.length > 0) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: line } }],
        },
      });
      currentListType = null;
    } else if (line.length === 0 && blocks.length > 0 && blocks[blocks.length - 1].type !== 'paragraph') {
      // Add an empty paragraph for spacing between blocks, but not consecutive empty ones
      // This helps with markdown newlines
      // blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } });
    }
  }
  return blocks;
}


// 메인 실행 함수
async function main() {
  const notionPageId = process.argv[2];

  if (!notionPageId) {
    console.error('오류: Notion 페이지 ID를 명령줄 인자로 제공해주세요.');
    console.error('사용법: npx tsx scripts/on-demand-review.ts <NOTION_PAGE_ID>');
    process.exit(1);
  }

  if (!process.env.NOTION_API_KEY) {
    console.error('오류: NOTION_API_KEY 환경 변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  printHeader(`Notion 페이지 ID: ${notionPageId} 검토 시작`);

  try {
    // 1. Notion 페이지 콘텐츠 읽기
    const { title: dsTitle, markdownContent: devMemo } = await readNotionPageContent(notionPageId);

    // 2. GPT 및 Gemini 검토 실행
    const gptReview = await runGPTReview(dsTitle, devMemo);
    const geminiReview = await runGeminiReview(dsTitle, devMemo);

    // 3. 검토 결과 결합
    const combinedReviewMarkdown =
`# AI 개발 Spec 검토 결과: ${dsTitle}` +
`

## 🤖 ChatGPT Review
${gptReview}` +
`

---

## 💎 Gemini Review
${geminiReview}
`;

    // 4. Notion에 새 검토 페이지 생성
    printHeader('Notion에 검토 결과 페이지 생성 중...');
    const reviewPageTitle = `DS Review: ${dsTitle} (${new Date().toLocaleDateString('ko-KR')})`;

    const blocks = markdownToNotionBlocks(combinedReviewMarkdown);

    const newReviewPage = await notion.pages.create({
      parent: { page_id: notionPageId }, // 원본 DS 페이지의 하위 페이지로 생성
      properties: {
        title: {
          title: [
            {
              type: 'text',
              text: { content: reviewPageTitle },
            },
          ],
        },
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
