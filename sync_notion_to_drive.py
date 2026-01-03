import os
import json
import io
import time
from notion_client import Client
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

def get_or_create_drive_folder(drive_service, folder_name, parent_id):
    """구글 드라이브에서 폴더를 찾거나 생성합니다."""
    # 구글 드라이브 쿼리에서 작은따옴표 이스케이프 처리
    escaped_name = folder_name.replace("'", "'\''")
    query = f"name='{escaped_name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    
    response = drive_service.files().list(q=query, spaces='drive', fields='files(id)').execute()
    files = response.get('files', [])
    
    if files:
        return files[0]['id']
    else:
        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_id]
        }
        folder = drive_service.files().create(body=file_metadata, fields='id').execute()
        print(f"  [Folder Created] {folder_name}")
        return folder.get('id')

def get_notion_item_info(notion, item_id, is_db=False):
    """항목의 제목과 속성들을 가져옵니다."""
    try:
        if is_db:
            data = notion.databases.retrieve(item_id)
            title_list = data.get('title', [])
            title = title_list[0].get('plain_text', 'Untitled DB') if title_list else 'Untitled DB'
            return title, {}
        else:
            data = notion.pages.retrieve(item_id)
            props = data.get('properties', {})
            title = "Untitled"
            metadata = {}
            
            for name, val in props.items():
                p_type = val.get('type')
                if p_type == 'title':
                    title = val['title'][0].get('plain_text', 'Untitled') if val['title'] else 'Untitled'
                elif p_type in ['select', 'status']:
                    metadata[name] = val.get(p_type, {}).get('name', '')
                elif p_type == 'multi_select':
                    metadata[name] = ", ".join([x.get('name', '') for x in val.get('multi_select', [])])
                elif p_type == 'date':
                    date_val = val.get('date')
                    metadata[name] = date_val.get('start', '') if date_val else ''
            return title, metadata
    except Exception:
        return f"Untitled_{{item_id[:8]}}", {}

def notion_to_html(title, metadata, blocks):
    """Notion 데이터를 미려한 HTML로 변환합니다."""
    meta_items = [f"<li><b>{{k}}:</b> {{v}}</li>" for k, v in metadata.items() if v]
    meta_html = ""
    if meta_items:
        meta_html = f"<div class='metadata'><ul>{{''.join(meta_items)}}</ul></div><hr>"

    content_html = ""
    for block in blocks:
        b_type = block['type']
        try:
            content = block.get(b_type, {})
            rich_text = content.get('rich_text', [])
            text = "".join([t.get('plain_text', '') for t in rich_text]) if rich_text else ""
            
            if b_type == 'paragraph': content_html += f"<p>{{text}}</p>"
            elif b_type.startswith('heading_'):
                level = b_type.split('_')[1]
                content_html += f"<h{{level}}>{{text}}</h{{level}}>"
            elif b_type == 'bulleted_list_item': content_html += f"<li>{{text}}</li>"
            elif b_type == 'numbered_list_item': content_html += f"<li>{{text}}</li>"
            elif b_type == 'to_do':
                checked = "checked" if content.get('checked') else ""
                content_html += f"<div><input type='checkbox' {{checked}} disabled> {{text}}</div>"
            elif b_type == 'quote': content_html += f"<blockquote>{{text}}</blockquote>"
            elif b_type == 'callout': content_html += f"<div class='callout'>{{text}}</div>"
            elif b_type == 'code':
                code_text = "".join([t.get('plain_text', '') for t in content.get('rich_text', [])])
                content_html += f"<pre><code>{{code_text}}</code></pre>"
            elif b_type == 'image':
                img_url = content.get('external', {}).get('url') or content.get('file', {}).get('url')
                if img_url: content_html += f"<img src='{{img_url}}' style='max-width:100%'>"
            elif b_type == 'divider': content_html += "<hr>"
        except Exception: continue

    last_backup = time.strftime('%Y-%m-%d %H:%M:%S')
    
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{{title}}</title>
    <style>
        body {{ font-family: -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 40px auto; padding: 20px; }}
        h1 {{ border-bottom: 2px solid #eee; padding-bottom: 10px; }}
        .metadata {{ background: #f9f9f9; padding: 10px; border-radius: 5px; font-size: 0.9em; }}
        blockquote {{ border-left: 4px solid #ddd; padding-left: 15px; color: #666; font-style: italic; }}
        .callout {{ background: #f1f1f1; padding: 15px; border-radius: 5px; margin: 10px 0; }}
        pre {{ background: #2d2d2d; color: #ccc; padding: 15px; border-radius: 5px; overflow-x: auto; }}
        code {{ font-family: monospace; }}
    </style>
</head>
<body>
    <h1>{{title}}</h1>
    {{meta_html}}
    {{content_html}}
    <p style="font-size: 0.8em; color: #999; margin-top: 50px;">Last Backup: {{last_backup}}</p>
</body>
</html>"""

def process_node(notion, drive_service, item_id, parent_drive_id, is_db=False):
    """재귀적으로 탐색하며 백업을 수행합니다."""
    title, metadata = get_notion_item_info(notion, item_id, is_db)
    print(f"-> Processing: {{title}}")
    
    # 1. 드라이브에 이 항목을 위한 폴더 생성
    current_folder_id = get_or_create_drive_folder(drive_service, title, parent_drive_id)
    
    # 2. 본문(블록) 가져오기 및 HTML 업로드
    blocks = []
    try:
        start_cursor = None
        while True:
            resp = notion.blocks.children.list(block_id=item_id, start_cursor=start_cursor, page_size=100)
            blocks.extend(resp['results'])
            if not resp['has_more']: break
            start_cursor = resp['next_cursor']
        
        html_content = notion_to_html(title, metadata, blocks)
        
        # 파일 업로드 (이름: "페이지제목.html")
        file_name = f"{title}.html"
        safe_file_name = file_name.replace("'", "'\' ")
        query = f"name='{safe_file_name}' and '{current_folder_id}' in parents and trashed=false"
        exist_resp = drive_service.files().list(q=query, fields='files(id)').execute()
        existing = exist_resp.get('files', [])
        
        fh = io.BytesIO(html_content.encode('utf-8'))
        media = MediaIoBaseUpload(fh, mimetype='text/html', resumable=True)
        
        if existing:
            drive_service.files().update(fileId=existing[0]['id'], media_body=media).execute()
        else:
            meta = {'name': file_name, 'parents': [current_folder_id]}
            drive_service.files().create(body=meta, media_body=media).execute()
            
    except Exception as e:
        print(f"   [Error content] {{title}}: {{e}}")

    # 3. 하위 항목(자식 페이지/DB) 탐색
    for block in blocks:
        if block['type'] == 'child_page':
            process_node(notion, drive_service, block['id'], current_folder_id)
        elif block['type'] == 'child_database':
            process_node(notion, drive_service, block['id'], current_folder_id, is_db=True)
        time.sleep(0.1) # 속도 조절

    # 4. 데이터베이스인 경우 내부 페이지들 탐색
    if is_db:
        try:
            cursor = None
            while True:
                resp = notion.databases.query(database_id=item_id, start_cursor=cursor, page_size=100)
                for page in resp['results']:
                    process_node(notion, drive_service, page['id'], current_folder_id)
                if not resp['has_more']: break
                cursor = resp['next_cursor']
        except Exception as e:
            print(f"   [Error DB query] {{title}}: {{e}}")

def main():
    notion_token = os.environ.get("NOTION_TOKEN")
    creds_info = {
        "client_id": os.environ.get("GDRIVE_CLIENT_ID"),
        "client_secret": os.environ.get("GDRIVE_CLIENT_SECRET"),
        "refresh_token": os.environ.get("GDRIVE_REFRESH_TOKEN"),
        "token_uri": "https://oauth2.googleapis.com/token"
    }
    gdrive_root_id = os.environ.get("GDRIVE_FOLDER_ID")
    page_ids_str = os.environ.get("NOTION_PAGE_ID")

    if not all([notion_token, creds_info["client_id"], gdrive_root_id, page_ids_str]):
        print("Missing environment variables."); return

    notion = Client(auth=notion_token)
    drive_service = build('drive', 'v3', credentials=Credentials(None, **creds_info, scopes=['https://www.googleapis.com/auth/drive.file']))

    for root_id in [x.strip() for x in page_ids_str.split(',') if x.strip()]:
        process_node(notion, drive_service, root_id, gdrive_root_id)

if __name__ == "__main__":
    main()