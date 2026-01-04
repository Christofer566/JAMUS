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

async function getOrCreateDriveFolder(folderName, parentId) {
  const escapedName = folderName.replace(/'/g, "\'");
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
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      };
      const folder = await drive.files.create({
        requestBody: folderMetadata,
        fields: 'id',
      });
      console.log(`  [Folder Created] ${folderName}`);
      return folder.data.id;
    }
  } catch (error) {
    console.error(`  [Error create folder] ${folderName}:`, error);
    throw error;
  }
}

async function getNotionItemInfo(itemId, isDb = false) {
  try {
    if (isDb) {
      const data = await notion.databases.retrieve({ database_id: itemId });
      const titleList = data.title || [];
      const title = titleList.length > 0 ? titleList[0].plain_text : 'Untitled DB';
      return { title, metadata: {} };
    } else {
      const data = await notion.pages.retrieve({ page_id: itemId });
      const props = data.properties || {};
      let title = 'Untitled';
      const metadata = {};

      for (const [name, val] of Object.entries(props)) {
        const type = val.type;
        if (type === 'title') {
          const titleContent = val.title || [];
          title = titleContent.length > 0 ? titleContent[0].plain_text : 'Untitled';
        } else if (['select', 'status'].includes(type)) {
          metadata[name] = val[type]?.name || '';
        } else if (type === 'multi_select') {
          metadata[name] = (val.multi_select || []).map((x) => x.name).join(', ');
        } else if (type === 'date') {
          metadata[name] = val.date?.start || '';
        }
      }
      return { title, metadata };
    }
  } catch (e) {
    console.error(`  [Error Info] ${itemId}:`, e);
    return { title: `Untitled_${itemId.slice(0, 8)}`, metadata: {} };
  }
}

function notionToHtml(title, metadata, blocks) {
  const metaItems = [];
  for (const [k, v] of Object.entries(metadata)) {
    if (v) {
      metaItems.push(`<li><b>${k}:</b> ${v}</li>`);
    }
  }

  let metaHtml = '';
  if (metaItems.length > 0) {
    metaHtml = `<div class='metadata'><ul>${metaItems.join('')}</ul></div><hr>`;
  }

  let contentHtml = '';
  for (const block of blocks) {
    const type = block.type;
    try {
      const content = block[type] || {};
      const richText = content.rich_text || [];
      const text = richText.map((t) => t.plain_text).join('');

      if (type === 'paragraph') {
        contentHtml += `<p>${text}</p>`;
      } else if (type.startsWith('heading_')) {
        const level = type.split('_')[1];
        contentHtml += `<h${level}>${text}</h${level}>`;
      } else if (type === 'bulleted_list_item') {
        contentHtml += `<li>${text}</li>`;
      } else if (type === 'numbered_list_item') {
        contentHtml += `<li>${text}</li>`;
      } else if (type === 'to_do') {
        const checked = content.checked ? 'checked' : '';
        contentHtml += `<div><input type='checkbox' ${checked} disabled> ${text}</div>`;
      } else if (type === 'quote') {
        contentHtml += `<blockquote>${text}</blockquote>`;
      } else if (type === 'callout') {
        contentHtml += `<div class='callout'>${text}</div>`;
      } else if (type === 'code') {
        const codeText = richText.map((t) => t.plain_text).join('');
        contentHtml += `<pre><code>${codeText}</code></pre>`;
      } else if (type === 'image') {
        const imgUrl = content.external?.url || content.file?.url;
        if (imgUrl) {
          contentHtml += `<img src='${imgUrl}' style='max-width:100%'>`;
        }
      } else if (type === 'divider') {
        contentHtml += `<hr>`;
      }
    } catch (e) {
      continue;
    }
  }

  const lastBackup = new Date().toISOString().replace('T', ' ').split('.')[0];

  const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{TITLE}</title>
    <style>
        body { font-family: -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 40px auto; padding: 20px; }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .metadata { background: #f9f9f9; padding: 10px; border-radius: 5px; font-size: 0.9em; }
        blockquote { border-left: 4px solid #ddd; padding-left: 15px; color: #666; font-style: italic; }
        .callout { background: #f1f1f1; padding: 15px; border-radius: 5px; margin: 10px 0; }
        pre { background: #2d2d2d; color: #ccc; padding: 15px; border-radius: 5px; overflow-x: auto; }
        code { font-family: monospace; }
    </style>
</head>
<body>
    <h1>{TITLE}</h1>
    {META_HTML}
    {CONTENT_HTML}
    <p style="font-size: 0.8em; color: #999; margin-top: 50px;">Last Backup: {LAST_BACKUP}</p>
</body>
</html>`;

  return htmlTemplate
    .replace('{TITLE}', title)
    .replace('{META_HTML}', metaHtml)
    .replace('{CONTENT_HTML}', contentHtml)
    .replace('{LAST_BACKUP}', lastBackup);
}

async function processNode(itemId, parentDriveId, isDb = false) {
  const { title, metadata } = await getNotionItemInfo(itemId, isDb);
  console.log(`-> Processing: ${title}`);

  try {
    const currentFolderId = await getOrCreateDriveFolder(title, parentDriveId);

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

    const htmlContent = notionToHtml(title, metadata, blocks);

    const fileName = title + '.html';
    const escapedFileName = fileName.replace(/'/g, "\'");
    const query = `name='${escapedFileName}' and '${currentFolderId}' in parents and trashed=false`;
    
    const existResp = await drive.files.list({
      q: query,
      fields: 'files(id)',
    });
    const existing = existResp.data.files || [];

    const media = {
      mimeType: 'text/html',
      body: Readable.from([htmlContent]),
    };

    if (existing.length > 0) {
      await drive.files.update({
        fileId: existing[0].id,
        media: media,
      });
    } else {
      await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [currentFolderId],
        },
        media: media,
      });
    }

    for (const block of blocks) {
      if (block.type === 'child_page') {
        await processNode(block.id, currentFolderId);
      } else if (block.type === 'child_database') {
        await processNode(block.id, currentFolderId, true);
      }
      await sleep(100); 
    }

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
            await processNode(page.id, currentFolderId);
          }
          if (!resp.has_more) break;
          dbCursor = resp.next_cursor;
        }
      } catch (e) {
        console.error(`   [Error DB query] ${title}:`, e);
      }
    }

  } catch (e) {
    console.error(`   [Error content] ${title}:`, e);
  }
}

async function main() {
  const pageIdsStr = NOTION_PAGE_ID || '';
  const rootIds = pageIdsStr.split(',').map((x) => x.trim()).filter((x) => x);

  for (const rootId of rootIds) {
    await processNode(rootId, GDRIVE_FOLDER_ID);
  }
}

main().catch(console.error);
