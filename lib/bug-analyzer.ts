import { Client } from '@notionhq/client';
import { ensureDebuggingHistoryExists } from './notion-setup';

interface Commit {
  sha: string;
  message: string;
  date: string | Date;
  files: string[];
  url?: string;
  additions?: number;
  deletions?: number;
}

interface Bug {
  description: string;
  firstDetectedAt: Date;
  fixAttempts: Commit[];
  resolvedAt: Date | null;
  fixTimeMinutes?: number;
  fixTime?: string;
  commits: Commit[]; // Added for compatibility with new code
  totalTime?: string; // Added for compatibility
}

/**
 * 버그 패턴 분석 및 Debugging History 생성
 */
export async function analyzeBugs(bugFixCount: number, allCommits: any[]): Promise<{ bugs: Bug[], totalFixAttempts: number, averageFixTime: string }> {
  console.log('\n=== 버그 분석 시작 ===');
  console.log('버그 수정 커밋:', bugFixCount, '개');

  if (bugFixCount === 0) {
    console.log('✅ 버그 없음 - 완벽한 구현!');
    return {
      bugs: [],
      totalFixAttempts: 0,
      averageFixTime: '0분'
    };
  }

  // 버그 패턴 추출
  const bugPatterns = [
    /Fix - (.+)/i,
    /Debug - (.+)/i,
    /Bugfix - (.+)/i,
    /수정: (.+)/i,
    /버그: (.+)/i
  ];

  const bugs: Bug[] = [];
  let currentBug: Bug | null = null;

  allCommits.forEach((commit) => {
    // 버그 수정 커밋인지 확인
    let bugDescription: string | null = null;
    for (const pattern of bugPatterns) {
      const match = commit.message.match(pattern);
      if (match) {
        bugDescription = match[1];
        break;
      }
    }

    if (bugDescription) {
      if (currentBug && currentBug.description === bugDescription) {
        // 동일한 버그에 대한 추가 수정 시도
        currentBug.fixAttempts.push({
          sha: commit.sha,
          message: commit.message,
          date: commit.date,
          files: commit.files,
          url: commit.url,
          additions: commit.additions,
          deletions: commit.deletions
        });
        currentBug.commits.push({ // Sync commits array
          sha: commit.sha,
          message: commit.message,
          date: commit.date,
          files: commit.files,
          url: commit.url,
          additions: commit.additions,
          deletions: commit.deletions
        });
      } else {
        // 새로운 버그 발견
        if (currentBug) {
          bugs.push(currentBug);
        }

        currentBug = {
          description: bugDescription,
          firstDetectedAt: new Date(commit.date),
          fixAttempts: [{
            sha: commit.sha,
            message: commit.message,
            date: commit.date,
            files: commit.files,
            url: commit.url,
            additions: commit.additions,
            deletions: commit.deletions
          }],
          commits: [{ // Initialize commits array
            sha: commit.sha,
            message: commit.message,
            date: commit.date,
            files: commit.files,
            url: commit.url,
            additions: commit.additions,
            deletions: commit.deletions
          }],
          resolvedAt: null
        };
      }
    } else if (currentBug && !currentBug.resolvedAt) {
      // 버그 수정 후 정상 커밋 발견 = 해결됨
      currentBug.resolvedAt = new Date(commit.date);
    }
  });

  // 마지막 버그 추가
  if (currentBug !== null) {
    const bug = currentBug as Bug; // TypeScript 타입 단언 (forEach 루프 때문에 필요)
    if (!bug.resolvedAt) {
      // 마지막 커밋까지 해결되지 않았다면 마지막 커밋 시간을 해결 시간으로
      bug.resolvedAt = new Date(allCommits[allCommits.length - 1].date);
    }
    bugs.push(bug);
  }

  // 각 버그의 해결 시간 계산
  bugs.forEach(bug => {
    if (bug.resolvedAt) {
      const fixTimeMinutes = Math.round(
        (bug.resolvedAt.getTime() - bug.firstDetectedAt.getTime()) / (1000 * 60)
      );
      bug.fixTimeMinutes = fixTimeMinutes;
      bug.fixTime = formatDuration(fixTimeMinutes);
      bug.totalTime = bug.fixTime; // Alias for new code
    }
  });

  // 통계 계산
  const totalFixAttempts = bugs.reduce(
    (sum, bug) => sum + bug.fixAttempts.length,
    0
  );

  const averageFixTimeMinutes = bugs.length > 0
    ? Math.round(
      bugs.reduce((sum, bug) => sum + (bug.fixTimeMinutes || 0), 0) / bugs.length
    )
    : 0;

  console.log('\n버그 분석 결과:');
  console.log('- 발견된 버그:', bugs.length, '개');
  console.log('- 총 수정 시도:', totalFixAttempts, '회');
  console.log('- 평균 수정 시간:', formatDuration(averageFixTimeMinutes));

  return {
    bugs,
    totalFixAttempts,
    averageFixTime: formatDuration(averageFixTimeMinutes)
  };
}

/**
 * 분을 "X시간 Y분" 형식으로 변환
 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}분`;
  } else if (mins === 0) {
    return `${hours}시간`;
  } else {
    return `${hours}시간 ${mins}분`;
  }
}

// 1. 심각도 판단
export function determineSeverity(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('crash') ||
    lower.includes('down') ||
    lower.includes('critical')) {
    return 'Critical';
  }

  if (lower.includes('error') ||
    lower.includes('fail') ||
    lower.includes('broken')) {
    return 'High';
  }

  if (lower.includes('minor') ||
    lower.includes('typo') ||
    lower.includes('style')) {
    return 'Low';
  }

  return 'Medium';
}

// 2. 카테고리 판단
export function determineCategories(
  files: string[],
  message: string
): string[] {
  const categories: string[] = [];
  const lower = message.toLowerCase();

  // 파일 경로 기반
  if (files.some(f => f.startsWith('api/'))) {
    categories.push('API 오류');
  }

  if (files.some(f => f.startsWith('app/') || f.startsWith('components/'))) {
    categories.push('UI 버그');
  }

  if (files.some(f => f.startsWith('lib/') || f.startsWith('utils/'))) {
    categories.push('로직 오류');
  }

  if (files.some(f => f.includes('.ts') && !f.includes('.tsx'))) {
    categories.push('타입 오류');
  }

  // 메시지 키워드 기반
  if (lower.includes('timeout') || lower.includes('타임아웃')) {
    categories.push('타임아웃');
  }

  if (lower.includes('auth') || lower.includes('인증')) {
    categories.push('인증 오류');
  }

  return categories.length > 0 ? categories : ['기타'];
}

// 3. 버그 제목 추출
export function extractBugTitle(message: string): string {
  // "Task 6: Fix - Slack 알림 중복 전송"
  // → "Slack 알림 중복 전송"

  return message
    .replace(/^Task \d+(\.\d+)?: /, '')
    .replace(/^(Fix|Debug|Bugfix|오류 수정) - /, '')
    .trim();
}

// 4. 버그 페이지 내용 생성
export function generateBugPageContent(
  bug: Bug,
  taskNumber: number | string,
  deployUrl: string
): string {
  const bugTitle = extractBugTitle(bug.commits[0].message);
  const firstCommit = bug.commits[0];
  const lastCommit = bug.commits[bug.commits.length - 1];
  // files가 객체 배열일 수도 있으므로 filename 추출
  const files = (firstCommit.files || []).map((f: any) =>
    typeof f === 'string' ? f : (f.filename || f)
  );

  return `
# 🐛 ${bugTitle}

## 📍 문제 상황
${bugTitle}

## 🔍 발생 경위
- **발견 시점**: ${new Date(firstCommit.date).toLocaleString('ko-KR')}
- **발견 방법**: 배포 후 테스트
- **영향 범위**: ${files.length > 0 ? files.join(', ') : '전체'}
- **수정 시도**: ${bug.fixAttempts.length}회

## 🛠️ 해결 방법

### 변경 내용
변경된 파일: ${files.join(', ')}

### 커밋 히스토리
${bug.commits.map((c: any) =>
    `- [${c.sha.substring(0, 7)}](${c.url}): ${c.message}`
  ).join('\n')}

### 해결 원리
${bug.commits.length === 1
      ? '단일 커밋으로 해결'
      : `${bug.fixAttempts.length}회 시도 끝에 해결`}

## 📊 통계
- **발생 시각**: ${new Date(firstCommit.date).toLocaleString('ko-KR')}
- **해결 시각**: ${new Date(lastCommit.date).toLocaleString('ko-KR')}
- **소요 시간**: ${bug.totalTime}
- **변경 파일**: ${files.join(', ')}
- **변경 규모**: +${firstCommit.additions || 0}줄, -${firstCommit.deletions || 0}줄

## 🔗 관련 정보
- **커밋**: ${bug.commits.map((c: any) =>
        `[${c.sha.substring(0, 7)}](https://github.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/commit/${c.sha})`
      ).join(', ')}
- **관련 Task**: Task ${taskNumber}
- **배포 URL**: ${deployUrl}

## 💡 학습 포인트
- [추후 수동 추가 또는 Claude API로 자동 생성]

## 🏷️ 분류
- **카테고리**: ${determineCategories(files, firstCommit.message).join(', ')}
- **심각도**: ${determineSeverity(firstCommit.message)}
`;
}

// 5. 버그 페이지 생성 (메인 함수)
/**
 * Debugging History DB에 버그 페이지를 생성합니다.
 *
 * 필수 Notion DB 속성:
 * - 버그 제목 (Title)
 * - 상태 (Select: 발생, 해결, 재발)
 * - 심각도 (Select: Critical, High, Medium, Low)
 * - 발생 시각 (Date)
 * - 해결 시각 (Date)
 * - 소요 시간(분) (Number)
 * - 커밋 SHA (Text)
 * - 관련 파일 (Multi-select)
 * - 카테고리 (Multi-select)
 * - 주차 (Text) - 예: W03, W04
 * - Task 번호 (Number) - 예: 7, 8
 */
export async function createBugEntry(
  taskNumber: number | string,
  bug: Bug,
  deployUrl: string,
  weekString?: string // 주차 정보 (선택적)
): Promise<string> {
  const notion = new Client({
    auth: process.env.NOTION_API_KEY
  });

  // DB 존재 확인
  const dbId = await ensureDebuggingHistoryExists();

  const bugTitle = extractBugTitle(bug.commits[0].message);
  const firstCommit = bug.commits[0];
  const lastCommit = bug.commits[bug.commits.length - 1];
  // files가 객체 배열일 수도 있으므로 filename 추출
  const files = (firstCommit.files || []).map((f: any) =>
    typeof f === 'string' ? f : (f.filename || f)
  );
  const severity = determineSeverity(firstCommit.message);
  const categories = determineCategories(files, firstCommit.message);

  // 소요 시간 계산 (분)
  const totalMinutes = Math.round(
    (new Date(lastCommit.date).getTime() -
      new Date(firstCommit.date).getTime()) / 1000 / 60
  );

  // 페이지 생성
  const page = await notion.pages.create({
    parent: {
      type: 'database_id',
      database_id: dbId
    },
    properties: {
      '버그 제목': {
        title: [{
          type: 'text',
          text: { content: bugTitle }
        }]
      },
      '상태': {
        select: { name: '해결' }
      },
      '심각도': {
        select: { name: severity }
      },
      '발생 시각': {
        date: { start: new Date(firstCommit.date).toISOString() }
      },
      '해결 시각': {
        date: { start: new Date(lastCommit.date).toISOString() }
      },
      '소요 시간(분)': {
        number: totalMinutes
      },
      '커밋 SHA': {
        rich_text: [{
          type: 'text',
          text: { content: firstCommit.sha }
        }]
      },
      '관련 파일': {
        multi_select: files.slice(0, 5).map((f: string) => ({
          name: f
        }))
      },
      '카테고리': {
        multi_select: categories.map(c => ({ name: c }))
      },
      '주차': {
        rich_text: weekString ? [{
          type: 'text',
          text: { content: weekString }
        }] : []
      },
      'Task 번호': {
        number: typeof taskNumber === 'string' ? parseInt(taskNumber) : taskNumber
      }
    }
  });

  // 페이지 내용 추가
  const content = generateBugPageContent(bug, taskNumber, deployUrl);
  const blocks = convertMarkdownToNotionBlocks(content);

  await notion.blocks.children.append({
    block_id: page.id,
    children: blocks
  });

  console.log(`✅ Debugging History 페이지 생성: ${bugTitle}`);

  return page.id;
}

// 6. 마크다운 → Notion 블록 변환 (간단 버전)
function convertMarkdownToNotionBlocks(markdown: string): any[] {
  const lines = markdown.trim().split('\n');
  const blocks: any[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{
            type: 'text',
            text: { content: line.replace('# ', '') }
          }]
        }
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{
            type: 'text',
            text: { content: line.replace('## ', '') }
          }]
        }
      });
    } else if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{
            type: 'text',
            text: { content: line.replace('### ', '') }
          }]
        }
      });
    } else if (line.startsWith('- ')) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: line.replace('- ', '') }
          }]
        }
      });
    } else {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: line }
          }]
        }
      });
    }
  }

  return blocks;
}
