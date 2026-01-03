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
    query = f"name='{folder_name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
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
        print(f"Created Folder: {folder_name}")
        return folder.get('id')

def get_page_title(notion, page_id):
    try:
        page_props = notion.pages.retrieve(page_id)
        properties = page_props.get('properties', {})
        for prop in properties.values():
            if prop['type'] == 'title':
                title_list = prop.get('title', [])
                if title_list:
                    return title_list[0].get('plain_text', 'Untitled')
    except Exception:
        pass
    return f"Untitled_{page_id[:8]}"

def get_db_title(notion, database_id):
    try:
        db_props = notion.databases.retrieve(database_id)
        title_list = db_props.get('title', [])
        if title_list:
            return title_list[0].get('plain_text', 'Untitled_DB')
    except Exception:
        pass
    return "Untitled_DB"

def notion_blocks_to_html(blocks):
    html = ""
    for block in blocks:
        block_type = block['type']
        try:
            content = block.get(block_type, {})
            rich_text = content.get('rich_text', [])
            text = "".join([t.get('plain_text', '') for t in rich_text]) if rich_text else ""
            if block_type == 'paragraph': html += f"<p>{text}</p>\n"
            elif block_type.startswith('heading_'):
                level = block_type.split('_')[1]
                html += f"<h{level}>{text}</h{level}>\n"
            elif block_type == 'bulleted_list_item': html += f"<li>{text}</li>\n"
            elif block_type == 'to_do':
                checked = "checked" if content.get('checked') else ""
                html += f'<li><input type="checkbox" {checked} disabled> {text}</li>\n'
            elif block_type == 'divider': html += "<hr>\n"
            elif block_type == 'code':
                code_text = "".join([t.get('plain_text', '') for t in content.get('rich_text', [])])
                html += f"<pre><code>{code_text}</code></pre>\n"
        except Exception: continue
    return f"<!DOCTYPE html><html><head><meta charset='UTF-8'><style>body{{font-family:sans-serif;line-height:1.6;padding:20px;max-width:800px;margin:auto;}}pre{{background:#f4f4f4;padding:10px;overflow:auto;}}</style></head><body>{html}</body></html>"

def upload_html_to_drive(drive_service, file_name, html_content, parent_folder_id):
    """HTML 내용을 드라이브에 업로드하거나 업데이트합니다."""
    query = f"name='{file_name}' and '{parent_folder_id}' in parents and trashed=false"
    response = drive_service.files().list(q=query, spaces='drive', fields='files(id)').execute()
    existing_files = response.get('files', [])

    fh = io.BytesIO(html_content.encode('utf-8'))
    media = MediaIoBaseUpload(fh, mimetype='text/html', resumable=True)

    if existing_files:
        drive_service.files().update(fileId=existing_files[0]['id'], media_body=media).execute()
    else:
        file_metadata = {{'name': file_name, 'parents': [parent_folder_id]}}
        drive_service.files().create(body=file_metadata, media_body=media).execute()

def process_node(notion, drive_service, page_id, parent_drive_folder_id):
    """재귀적으로 페이지를 탐색하고 폴더 구조를 유지하며 백업합니다."""
    # 1. 현재 페이지 제목 가져오기 및 본문 백업
    title = get_page_title(notion, page_id)
    print(f"Processing: {title}")
    
    # 해당 페이지를 위한 전용 폴더 생성
    current_folder_id = get_or_create_drive_folder(drive_service, title, parent_drive_folder_id)
    
    # 페이지 본문을 HTML로 변환하여 해당 폴더 안에 저장
    blocks = []
    start_cursor = None
    while True:
        resp = notion.blocks.children.list(block_id=page_id, start_cursor=start_cursor, page_size=100)
        blocks.extend(resp['results'])
        if not resp['has_more']: break
        start_cursor = resp['next_cursor']
    
    html_content = notion_blocks_to_html(blocks)
    upload_html_to_drive(drive_service, f"{title}.html", html_content, current_folder_id)

    # 2. 하위 블록들 탐색하여 하위 페이지/DB 처리
    for block in blocks:
        if block['type'] == 'child_page':
            process_node(notion, drive_service, block['id'], current_folder_id)
        elif block['type'] == 'child_database':
            db_id = block['id']
            db_title = get_db_title(notion, db_id)
            print(f"Querying DB: {db_title}")
            db_folder_id = get_or_create_drive_folder(drive_service, db_title, current_folder_id)
            
            # DB 내의 모든 페이지 가져오기
            db_cursor = None
            while True:
                db_resp = notion.databases.query(database_id=db_id, start_cursor=db_cursor, page_size=100)
                for db_page in db_resp['results']:
                    process_node(notion, drive_service, db_page['id'], db_folder_id)
                if not db_resp['has_more']: break
                db_cursor = db_resp['next_cursor']
        
        # API Rate Limit 방지
        time.sleep(0.1)

def main():
    notion_token = os.environ.get("NOTION_TOKEN")
    client_id = os.environ.get("GDRIVE_CLIENT_ID")
    client_secret = os.environ.get("GDRIVE_CLIENT_SECRET")
    refresh_token = os.environ.get("GDRIVE_REFRESH_TOKEN")
    gdrive_root_id = os.environ.get("GDRIVE_FOLDER_ID")
    notion_page_ids_str = os.environ.get("NOTION_PAGE_ID")

    if not all([notion_token, client_id, client_secret, refresh_token, gdrive_root_id, notion_page_ids_str]):
        print("Error: Missing environment variables.")
        return

    notion = Client(auth=notion_token)
    creds = Credentials(None, refresh_token=refresh_token, token_uri="https://oauth2.googleapis.com/token",
                        client_id=client_id, client_secret=client_secret, scopes=['https://www.googleapis.com/auth/drive.file'])
    drive_service = build('drive', 'v3', credentials=creds)

    root_ids = [pid.strip() for pid in notion_page_ids_str.split(',')]

    for root_id in root_ids:
        if not root_id: continue
        process_node(notion, drive_service, root_id, gdrive_root_id)

if __name__ == "__main__":
    main()
