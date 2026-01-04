import { Client } from '@notionhq/client';
import { google } from 'googleapis';
import { Readable } from 'stream';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const GDRIVE_CLIENT_ID = process.env.GDRIVE_CLIENT_ID;
const GDRIVE_CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET;
const GDRIVE_REFRESH_TOKEN = process.env.GDRIVE_REFRESH_TOKEN;
const GDRIVE_FOLDER_ID = process.env.GDRIVE_FOLDER_ID;
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID;

if (!NOTION_TOKEN || !GDRIVE_CLIENT_ID || !GDRIVE_FOLDER_ID || !NOTION_PAGE_ID) {
  console.error('Missing environment variables.');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

const auth = new google.auth.OAuth2(
  GDRIVE_CLIENT_ID,
  GDRIVE_CLIENT_SECRET
);

auth.setCredentials({
  refresh_token: GDRIVE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// 결과 리포트용 카운터
// ============================================
const stats = {
  created: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  startTime: Date.now()
};

// ============================================
// 파일명에서 사용할 수 없는 문자 제거
// ============================================
function sanitizeFileName(name) {
  if (!name) return 'Untitled';
  return name
    .replace(/[\n\r]+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
}

// ============================================
// 문서 유형별 파일명 규칙
// ============================================
// 1) WTL (2.0 Weekly Task List): [Week차수]파일명_Date
// 2) DS (3.1 Development Spec): [Week 차수][Task 번호]파일명_Date
// 3) DHDB (3.2 Debugging History DB): 파일명 (그대로)
// 4) TEL (4.0 Task Execute Log): [Week 차수][Task 번호]파일명_Date
// 5) UPDATE_LOG (5.0 JAMUS UPDATE LOG): [Week 차수]파일명_Date
// ============================================
function detectDocType(parentFolderName) {
  if (!parentFolderName) return null;

  const name = parentFolderName.toLowerCase();

  // 정확한 매칭을 위해 키워드 확인
  if (name.includes('2.0') || name.includes('weekly task list')) return 'WTL';
  if (name.includes('3.1') || name.includes('development spec')) return 'DS';
  if (name.includes('3.2') || name.includes('debugging history')) return 'DHDB';
  if (name.includes('4.0') || name.includes('task execute log')) return 'TEL';
  if (name.includes('5.0') || name.includes('update log')) return 'UPDATE_LOG';

  return null;
}

// ============================================
// HTML 특수문자 이스케이프 (XSS 방지 및 깨짐 방지)
// ============================================
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================
// Drive 폴더 생성/조회
// ============================================
async function getOrCreateDriveFolder(folderName, parentId) {
  const safeName = sanitizeFileName(folderName);
  const escapedName = safeName.replace(/'/g, "\\'");
  const query = `name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  try {
    const res = await drive.files.list({
      q: query,
      spaces: 'drive',
      fields: 'files(id)',
    });

    const files = res.data.files;
    if (files && files.length > 0) {
      return files[0].id;
    } else {
      const folderMetadata = {
        name: safeName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      };
      const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id',
      });
      console.log(`  [Folder Created] ${safeName}`);
      return folder.data.id;
    }
  } catch (error) {
    console.error(`  [Error create folder] ${safeName}:`, error.message);
    throw error;
  }
}

// ============================================
// Notion 속성값 추출 (모든 타입 지원)
// ============================================
function extractPropertyValue(prop) {
  if (!prop) return '';

  const type = prop.type;

  switch (type) {
    case 'title':
      return (prop.title || []).map(t => t.plain_text).join('');
    case 'rich_text':
      return (prop.rich_text || []).map(t => t.plain_text).join('');
    case 'number':
      return prop.number !== null ? String(prop.number) : '';
    case 'select':
      return prop.select?.name || '';
    case 'status':
      return prop.status?.name || '';
    case 'multi_select':
      return (prop.multi_select || []).map(s => s.name).join(', ');
    case 'date':
      if (!prop.date) return '';
      const start = prop.date.start || '';
      const end = prop.date.end ? ` → ${prop.date.end}` : '';
      return start + end;
    case 'checkbox':
      return prop.checkbox ? '✅' : '❌';
    case 'url':
      return prop.url || '';
    case 'email':
      return prop.email || '';
    case 'phone_number':
      return prop.phone_number || '';
    case 'formula':
      if (prop.formula.type === 'string') return prop.formula.string || '';
      if (prop.formula.type === 'number') return String(prop.formula.number || '');
      if (prop.formula.type === 'boolean') return prop.formula.boolean ? '✅' : '❌';
      if (prop.formula.type === 'date') return prop.formula.date?.start || '';
      return '';
    case 'relation':
      return (prop.relation || []).map(r => r.id.slice(0, 8)).join(', ');
    case 'rollup':
      if (prop.rollup.type === 'array') {
        return (prop.rollup.array || []).map(item => extractPropertyValue(item)).join(', ');
      }
      return String(prop.rollup[prop.rollup.type] || '');
    case 'people':
      return (prop.people || []).map(p => p.name || p.id.slice(0, 8)).join(', ');
    case 'files':
      return (prop.files || []).map(f => f.name || 'file').join(', ');
    case 'created_time':
      return prop.created_time || '';
    case 'created_by':
      return prop.created_by?.name || '';
    case 'last_edited_time':
      return prop.last_edited_time || '';
    case 'last_edited_by':
      return prop.last_edited_by?.name || '';
    default:
      return '';
  }
}

// ============================================
// Notion 페이지 정보 추출 (고도화)
// ============================================
async function getNotionItemInfo(itemId, isDb = false) {
  try {
    if (isDb) {
      const data = await notion.databases.retrieve({ database_id: itemId });
      const titleList = data.title || [];
      const title = titleList.length > 0 ? titleList[0].plain_text : 'Untitled DB';
      return {
        title,
        properties: {},
        lastEditedTime: data.last_edited_time
      };
    } else {
      const data = await notion.pages.retrieve({ page_id: itemId });
      const props = data.properties || {};
      let title = 'Untitled';
      const properties = {};

      for (const [name, val] of Object.entries(props)) {
        const value = extractPropertyValue(val);

        if (val.type === 'title') {
          title = value || 'Untitled';
        } else if (value) {
          properties[name] = value;
        }
      }

      return {
        title,
        properties,
        lastEditedTime: data.last_edited_time
      };
    }
  } catch (e) {
    console.error(`  [Error Info] ${itemId}:`, e.message);
    return {
      title: `Untitled_${itemId.slice(0, 8)}`,
      properties: {},
      lastEditedTime: null
    };
  }
}

// ============================================
// Rich Text를 HTML로 변환 (스타일 지원)
// ============================================
function richTextToHtml(richText) {
  if (!richText || !Array.isArray(richText)) return '';

  return richText.map(t => {
    let text = escapeHtml(t.plain_text);
    const annotations = t.annotations || {};

    if (annotations.bold) text = `<strong>${text}</strong>`;
    if (annotations.italic) text = `<em>${text}</em>`;
    if (annotations.strikethrough) text = `<del>${text}</del>`;
    if (annotations.underline) text = `<u>${text}</u>`;
    if (annotations.code) text = `<code>${text}</code>`;

    if (t.href) {
      text = `<a href="${escapeHtml(t.href)}" target="_blank">${text}</a>`;
    }

    return text;
  }).join('');
}

// ============================================
// Table 블록 처리
// ============================================
async function processTableBlock(tableBlock) {
  const tableId = tableBlock.id;
  const hasColumnHeader = tableBlock.table?.has_column_header || false;
  const hasRowHeader = tableBlock.table?.has_row_header || false;

  // 테이블 행들 가져오기
  let rows = [];
  let cursor = undefined;

  try {
    while (true) {
      const resp = await notion.blocks.children.list({
        block_id: tableId,
        start_cursor: cursor,
        page_size: 100,
      });
      rows.push(...resp.results);
      if (!resp.has_more) break;
      cursor = resp.next_cursor;
    }
  } catch (e) {
    console.error(`  [Error Table] ${tableId}:`, e.message);
    return '<p>[테이블 로드 실패]</p>';
  }

  if (rows.length === 0) return '';

  let html = '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; margin: 15px 0;">';

  rows.forEach((row, rowIndex) => {
    if (row.type !== 'table_row') return;

    const cells = row.table_row?.cells || [];
    const isHeaderRow = hasColumnHeader && rowIndex === 0;

    html += '<tr>';
    cells.forEach((cell, cellIndex) => {
      const isHeaderCell = isHeaderRow || (hasRowHeader && cellIndex === 0);
      const tag = isHeaderCell ? 'th' : 'td';
      const style = isHeaderCell ? 'background: #f5f5f5; font-weight: bold;' : '';
      const cellContent = richTextToHtml(cell);
      html += `<${tag} style="${style}">${cellContent}</${tag}>`;
    });
    html += '</tr>';
  });

  html += '</table>';
  return html;
}

// ============================================
// Notion 블록을 HTML로 변환 (Table 지원 추가)
// ============================================
async function blocksToHtml(blocks) {
  let html = '';
  let inList = null; // 'ul' or 'ol'

  for (const block of blocks) {
    const type = block.type;

    try {
      const content = block[type] || {};
      const richText = content.rich_text || [];
      const text = richTextToHtml(richText);

      // 리스트 종료 체크
      if (inList && type !== 'bulleted_list_item' && type !== 'numbered_list_item') {
        html += `</${inList}>`;
        inList = null;
      }

      switch (type) {
        case 'paragraph':
          html += `<p>${text}</p>`;
          break;

        case 'heading_1':
          html += `<h1>${text}</h1>`;
          break;

        case 'heading_2':
          html += `<h2>${text}</h2>`;
          break;

        case 'heading_3':
          html += `<h3>${text}</h3>`;
          break;

        case 'bulleted_list_item':
          if (inList !== 'ul') {
            if (inList) html += `</${inList}>`;
            html += '<ul>';
            inList = 'ul';
          }
          html += `<li>${text}</li>`;
          break;

        case 'numbered_list_item':
          if (inList !== 'ol') {
            if (inList) html += `</${inList}>`;
            html += '<ol>';
            inList = 'ol';
          }
          html += `<li>${text}</li>`;
          break;

        case 'to_do':
          const checked = content.checked ? 'checked' : '';
          const checkStyle = content.checked ? 'text-decoration: line-through; color: #999;' : '';
          html += `<div style="margin: 5px 0;"><input type="checkbox" ${checked} disabled> <span style="${checkStyle}">${text}</span></div>`;
          break;

        case 'quote':
          html += `<blockquote>${text}</blockquote>`;
          break;

        case 'callout':
          const icon = content.icon?.emoji || '💡';
          html += `<div class="callout"><span style="margin-right: 8px;">${icon}</span>${text}</div>`;
          break;

        case 'code':
          const language = content.language || 'text';
          const codeText = (richText || []).map(t => escapeHtml(t.plain_text)).join('');
          html += `<pre><code class="language-${language}">${codeText}</code></pre>`;
          break;

        case 'image':
          const imgUrl = content.external?.url || content.file?.url;
          const caption = content.caption ? richTextToHtml(content.caption) : '';
          if (imgUrl) {
            html += `<figure style="margin: 20px 0;"><img src="${escapeHtml(imgUrl)}" style="max-width: 100%; border-radius: 5px;">`;
            if (caption) html += `<figcaption style="text-align: center; color: #666; font-size: 0.9em;">${caption}</figcaption>`;
            html += '</figure>';
          }
          break;

        case 'video':
          const videoUrl = content.external?.url || content.file?.url;
          if (videoUrl) {
            html += `<div style="margin: 20px 0;"><a href="${escapeHtml(videoUrl)}" target="_blank">🎬 동영상 보기</a></div>`;
          }
          break;

        case 'file':
          const fileUrl = content.external?.url || content.file?.url;
          const fileName = content.name || '파일';
          if (fileUrl) {
            html += `<div style="margin: 10px 0;"><a href="${escapeHtml(fileUrl)}" target="_blank">📎 ${escapeHtml(fileName)}</a></div>`;
          }
          break;

        case 'bookmark':
          const bookmarkUrl = content.url;
          if (bookmarkUrl) {
            html += `<div style="margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 5px;"><a href="${escapeHtml(bookmarkUrl)}" target="_blank">🔗 ${escapeHtml(bookmarkUrl)}</a></div>`;
          }
          break;

        case 'divider':
          html += '<hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">';
          break;

        case 'table':
          html += await processTableBlock(block);
          break;

        case 'toggle':
          html += `<details style="margin: 10px 0;"><summary style="cursor: pointer; font-weight: bold;">${text}</summary>`;
          // 하위 블록이 있으면 재귀 처리 필요 (has_children)
          if (block.has_children) {
            try {
              const childBlocks = [];
              let childCursor = undefined;
              while (true) {
                const resp = await notion.blocks.children.list({
                  block_id: block.id,
                  start_cursor: childCursor,
                  page_size: 100,
                });
                childBlocks.push(...resp.results);
                if (!resp.has_more) break;
                childCursor = resp.next_cursor;
              }
              html += await blocksToHtml(childBlocks);
            } catch (e) {
              console.error(`  [Error Toggle children]:`, e.message);
            }
          }
          html += '</details>';
          break;

        case 'column_list':
        case 'column':
          // 컬럼은 스킵 (하위 블록은 별도 처리)
          break;

        default:
          // 지원하지 않는 블록 타입
          if (text) {
            html += `<p>${text}</p>`;
          }
      }
    } catch (e) {
      console.error(`  [Error Block ${type}]:`, e.message);
      continue;
    }
  }

  // 리스트 종료
  if (inList) {
    html += `</${inList}>`;
  }

  return html;
}

// ============================================
// 속성 테이블 HTML 생성
// ============================================
function propertiesToHtml(properties) {
  const entries = Object.entries(properties).filter(([k, v]) => v);

  if (entries.length === 0) return '';

  let html = `
<div class="properties-table">
  <table>
    <tbody>`;

  for (const [key, value] of entries) {
    html += `
      <tr>
        <th>${escapeHtml(key)}</th>
        <td>${escapeHtml(value)}</td>
      </tr>`;
  }

  html += `
    </tbody>
  </table>
</div>`;

  return html;
}

// ============================================
// Notion 페이지를 HTML로 변환 (고도화)
// ============================================
async function notionToHtml(title, properties, blocks) {
  const safeTitle = escapeHtml(title);
  const propertiesHtml = propertiesToHtml(properties);
  const contentHtml = await blocksToHtml(blocks);
  const lastBackup = new Date().toISOString().replace('T', ' ').split('.')[0];

  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.7;
            color: #333;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            background: #fff;
        }
        h1 {
            font-size: 2em;
            border-bottom: 2px solid #eee;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        h2 { font-size: 1.5em; margin-top: 30px; }
        h3 { font-size: 1.2em; margin-top: 25px; }

        /* 속성 테이블 스타일 */
        .properties-table {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 30px;
            border: 1px solid #e9ecef;
        }
        .properties-table table {
            width: 100%;
            border-collapse: collapse;
        }
        .properties-table th {
            text-align: left;
            padding: 8px 12px;
            background: #e9ecef;
            border-radius: 4px;
            font-weight: 600;
            width: 30%;
            font-size: 0.9em;
            color: #495057;
        }
        .properties-table td {
            padding: 8px 12px;
            font-size: 0.95em;
        }
        .properties-table tr {
            border-bottom: 1px solid #e9ecef;
        }
        .properties-table tr:last-child {
            border-bottom: none;
        }

        /* 콘텐츠 블록 스타일 */
        blockquote {
            border-left: 4px solid #007bff;
            padding: 10px 20px;
            margin: 20px 0;
            background: #f8f9fa;
            color: #555;
        }
        .callout {
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 15px 20px;
            border-radius: 8px;
            margin: 15px 0;
            display: flex;
            align-items: flex-start;
        }
        pre {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 0.9em;
            line-height: 1.5;
        }
        code {
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.9em;
        }
        p code {
            background: #f1f3f4;
            padding: 2px 6px;
            border-radius: 4px;
            color: #c7254e;
        }
        table {
            border: 1px solid #dee2e6;
            border-radius: 8px;
            overflow: hidden;
        }
        th, td {
            border: 1px solid #dee2e6;
            padding: 10px 12px;
            text-align: left;
        }
        th {
            background: #f8f9fa;
        }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
        img { border-radius: 8px; }
        hr { margin: 30px 0; border: none; border-top: 1px solid #eee; }

        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 0.8em;
            color: #999;
        }
    </style>
</head>
<body>
    <h1>${safeTitle}</h1>
    ${propertiesHtml}
    ${contentHtml}
    <div class="footer">
        <p>Last Backup: ${lastBackup}</p>
        <p>Exported from Notion</p>
    </div>
</body>
</html>`;
}

// ============================================
// 파일명 생성 (문서 유형별 규칙 적용)
// ============================================
function generateFileName(title, properties, docType) {
  const safeTitle = sanitizeFileName(title);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // 속성에서 Week와 Task 추출
  const weekVal = properties['주차'] || properties['Week'] || properties['week'] || '';
  const taskVal = properties['Task'] || properties['태스크'] || properties['Task 번호'] || properties['task'] || '';

  // Week 접두사 포맷 (W06 형식이면 그대로, 아니면 W 붙여줌)
  let weekPrefix = '';
  if (weekVal) {
    const normalized = weekVal.toUpperCase().replace(/\s+/g, '');
    if (normalized.startsWith('W')) {
      weekPrefix = `[${normalized}]`;
    } else {
      weekPrefix = `[W${normalized.replace(/^0+/, '').padStart(2, '0')}]`;
    }
  }

  // Task 접두사 포맷
  let taskPrefix = '';
  if (taskVal) {
    // "Task 3.7" 형식이면 그대로, 아니면 Task 붙여줌
    if (taskVal.toLowerCase().includes('task')) {
      taskPrefix = `[${taskVal}]`;
    } else {
      taskPrefix = `[Task ${taskVal}]`;
    }
  }

  switch (docType) {
    case 'WTL':
      // [W06]2025.12.08-12.14 Weekly Task List_20251207
      return weekPrefix ? `${weekPrefix}${safeTitle}_${date}.html` : `${safeTitle}_${date}.html`;

    case 'DS':
      // [W06][Task 3.7]Development Spec: Task 3.7 - 편집음표 ~_20251225
      return `${weekPrefix}${taskPrefix}${safeTitle}_${date}.html`;

    case 'DHDB':
      // 파일명 그대로
      return `${safeTitle}.html`;

    case 'TEL':
      // [W06][Task 5.9]라이브앱 1슬롯 관용 정책 적용_20260103
      return `${weekPrefix}${taskPrefix}${safeTitle}_${date}.html`;

    case 'UPDATE_LOG':
      // [Week 차수]파일명_Date
      return weekPrefix ? `${weekPrefix}${safeTitle}_${date}.html` : `${safeTitle}_${date}.html`;

    default:
      // 기본: 제목만
      return `${safeTitle}.html`;
  }
}

// ============================================
// 노드 처리 (메인 로직)
// ============================================
async function processNode(itemId, parentDriveId, isDb = false, parentFolderName = '') {
  const { title, properties, lastEditedTime } = await getNotionItemInfo(itemId, isDb);
  const sanitizedTitle = sanitizeFileName(title);

  // 문서 유형 감지 (부모 폴더명 기반)
  const docType = detectDocType(parentFolderName);

  try {
    const currentFolderId = await getOrCreateDriveFolder(sanitizedTitle, parentDriveId);

    // 블록 가져오기
    const blocks = [];
    let cursor = undefined;
    while (true) {
      const resp = await notion.blocks.children.list({
        block_id: itemId,
        start_cursor: cursor,
        page_size: 100,
      });
      blocks.push(...resp.results);
      if (!resp.has_more) break;
      cursor = resp.next_cursor;
    }

    // 파일명 생성 (문서 유형별 규칙 적용)
    const fileName = generateFileName(title, properties, docType);
    const escapedFileName = fileName.replace(/'/g, "\\'");
    const query = `name='${escapedFileName}' and '${currentFolderId}' in parents and trashed=false`;

    // Drive에서 기존 파일 찾기
    const existResp = await drive.files.list({
      q: query,
      fields: 'files(id, modifiedTime)',
    });
    const existing = existResp.data.files || [];

    // 스마트 증분 백업: 시간 비교
    let shouldUpdate = true;
    let action = 'create';

    if (existing.length > 0) {
      const driveModifiedTime = new Date(existing[0].modifiedTime);
      const notionEditedTime = lastEditedTime ? new Date(lastEditedTime) : new Date();

      if (notionEditedTime <= driveModifiedTime) {
        console.log(`  [Skip] ${fileName} (no changes)`);
        stats.skipped++;
        shouldUpdate = false;
      } else {
        action = 'update';
      }
    }

    if (shouldUpdate) {
      const htmlContent = await notionToHtml(title, properties, blocks);
      const media = {
        mimeType: 'text/html; charset=utf-8',
        body: Readable.from([Buffer.from(htmlContent, 'utf-8')]),
      };

      if (action === 'update') {
        await drive.files.update({
          fileId: existing[0].id,
          media: media,
        });
        console.log(`  [Updated] ${fileName}`);
        stats.updated++;
      } else {
        await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [currentFolderId],
          },
          media: media,
        });
        console.log(`  [Created] ${fileName}`);
        stats.created++;
      }
    }

    // 하위 페이지/데이터베이스 재귀 처리 (현재 폴더명 전달)
    for (const block of blocks) {
      if (block.type === 'child_page') {
        await processNode(block.id, currentFolderId, false, sanitizedTitle);
      } else if (block.type === 'child_database') {
        await processNode(block.id, currentFolderId, true, sanitizedTitle);
      }
      await sleep(100);
    }

    // 데이터베이스인 경우 하위 페이지들도 처리 (DB명을 부모로 전달)
    if (isDb) {
      try {
        let dbCursor = undefined;
        while (true) {
          const resp = await notion.databases.query({
            database_id: itemId,
            start_cursor: dbCursor,
            page_size: 100,
          });
          for (const page of resp.results) {
            await processNode(page.id, currentFolderId, false, sanitizedTitle);
          }
          if (!resp.has_more) break;
          dbCursor = resp.next_cursor;
        }
      } catch (e) {
        console.error(`   [Error DB query] ${sanitizedTitle}:`, e.message);
        stats.errors++;
      }
    }

  } catch (e) {
    console.error(`   [Error content] ${sanitizedTitle}:`, e.message);
    stats.errors++;
  }
}

// ============================================
// 결과 리포트 출력
// ============================================
function printReport() {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log('\n========================================');
  console.log('  📊 Notion → Drive 백업 결과');
  console.log('========================================');
  console.log(`  ✅ 생성: ${stats.created}개`);
  console.log(`  🔄 업데이트: ${stats.updated}개`);
  console.log(`  ⏭️  스킵: ${stats.skipped}개`);
  if (stats.errors > 0) {
    console.log(`  ❌ 오류: ${stats.errors}개`);
  }
  console.log('----------------------------------------');
  console.log(`  ⏱️  소요 시간: ${elapsed}초`);
  console.log('========================================\n');

  // GitHub Actions 환경변수로 결과 출력 (Slack 알림용)
  console.log(`BACKUP_RESULT::${JSON.stringify({
    created: stats.created,
    updated: stats.updated,
    skipped: stats.skipped,
    errors: stats.errors,
    elapsed: elapsed
  })}`);
}

// ============================================
// 메인 실행
// ============================================
async function main() {
  console.log('========================================');
  console.log('  🚀 Notion → Drive 스마트 증분 백업 v3');
  console.log('  (문서 유형별 파일명 규칙 + 속성 테이블)');
  console.log('========================================\n');

  const pageIdsStr = NOTION_PAGE_ID || '';
  const rootIds = pageIdsStr.split(',').map((x) => x.trim()).filter((x) => x);

  console.log(`📁 루트 페이지: ${rootIds.length}개\n`);

  for (const rootId of rootIds) {
    console.log(`\n📂 Processing root: ${rootId}`);
    await processNode(rootId, GDRIVE_FOLDER_ID);
  }

  printReport();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  printReport();
  process.exit(1);
});
