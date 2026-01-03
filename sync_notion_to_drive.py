import os
import json
import io
from notion_client import Client
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

def get_page_title(notion, page_id):
    try:
        page_props = notion.pages.retrieve(page_id)
        properties = page_props.get('properties', {})
        # 일반 페이지 제목 탐색
        if 'title' in properties and properties['title'].get('title'):
            return properties['title']['title'][0].get('plain_text', 'Untitled')
        # 데이터베이스 내부 페이지 제목 탐색 (속성명이 다를 수 있음)
        for prop in properties.values():
            if prop['type'] == 'title':
                title_list = prop.get('title', [])
                if title_list:
                    return title_list[0].get('plain_text', 'Untitled')
    except Exception:
        pass
    return f"Untitled_{page_id[:8]}"

def get_all_blocks(notion, page_id):
    blocks = []
    try:
        start_cursor = None
        while True:
            response = notion.blocks.children.list(block_id=page_id, start_cursor=start_cursor, page_size=100)
            blocks.extend(response['results'])
            if not response['has_more']:
                break
            start_cursor = response['next_cursor']
    except Exception as e:
        print(f"Error fetching blocks for {page_id}: {e}")
    return blocks

def notion_blocks_to_html(blocks):
    html = ""
    for block in blocks:
        block_type = block['type']
        try:
            content = block.get(block_type, {})
            rich_text = content.get('rich_text', [])
            text = "".join([t.get('plain_text', '') for t in rich_text]) if rich_text else ""

            if block_type == 'paragraph':
                html += f"<p>{text}</p>\n"
            elif block_type.startswith('heading_'):
                level = block_type.split('_')[1]
                html += f"<h{level}>{text}</h{level}>\n"
            elif block_type == 'bulleted_list_item':
                html += f"<li>{text}</li>\n"
            elif block_type == 'to_do':
                checked = "checked" if content.get('checked') else ""
                html += f'<li><input type="checkbox" {checked} disabled> {text}</li>\n'
            elif block_type == 'divider':
                html += "<hr>\n"
            elif block_type == 'code':
                code_text = "".join([t.get('plain_text', '') for t in content.get('rich_text', [])])
                html += f"<pre><code>{code_text}</code></pre>\n"
        except Exception:
            continue
    return f"<!DOCTYPE html><html><head><meta charset='UTF-8'><style>body{{font-family:sans-serif;line-height:1.6;padding:20px;max-width:800px;margin:auto;}}pre{{background:#f4f4f4;padding:10px;overflow:auto;}}</style></head><body>{html}</body></html>"

def fetch_all_sub_items(notion, parent_id, collected_pages):
    """부모 ID 아래의 모든 하위 페이지 및 데이터베이스 페이지를 수집합니다."""
    if parent_id in collected_pages:
        return
    
    print(f"Searching sub-items for: {parent_id}")
    collected_pages.add(parent_id)

    # 1. 하위 블록 탐색 (Child Page, Child Database 찾기)
    blocks = get_all_blocks(notion, parent_id)
    for block in blocks:
        if block['type'] == 'child_page':
            fetch_all_sub_items(notion, block['id'], collected_pages)
        elif block['type'] == 'child_database':
            fetch_database_pages(notion, block['id'], collected_pages)

def fetch_database_pages(notion, database_id, collected_pages):
    """데이터베이스 내의 모든 페이지를 수집합니다."""
    print(f"Querying database: {database_id}")
    try:
        start_cursor = None
        while True:
            response = notion.databases.query(database_id=database_id, start_cursor=start_cursor, page_size=100)
            for page in response['results']:
                fetch_all_sub_items(notion, page['id'], collected_pages)
            if not response['has_more']:
                break
            start_cursor = response['next_cursor']
    except Exception as e:
        print(f"Error querying database {database_id}: {e}")

def main():
    notion_token = os.environ.get("NOTION_TOKEN")
    client_id = os.environ.get("GDRIVE_CLIENT_ID")
    client_secret = os.environ.get("GDRIVE_CLIENT_SECRET")
    refresh_token = os.environ.get("GDRIVE_REFRESH_TOKEN")
    gdrive_folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    notion_page_ids_str = os.environ.get("NOTION_PAGE_ID")

    if not all([notion_token, client_id, client_secret, refresh_token, gdrive_folder_id, notion_page_ids_str]):
        print("Error: Missing environment variables.")
        return

    notion = Client(auth=notion_token)
    creds = Credentials(None, refresh_token=refresh_token, token_uri="https://oauth2.googleapis.com/token",
                        client_id=client_id, client_secret=client_secret, scopes=['https://www.googleapis.com/auth/drive.file'])
    drive_service = build('drive', 'v3', credentials=creds)

    root_ids = [pid.strip() for pid in notion_page_ids_str.split(',')]
    all_target_pages = set()

    # 모든 하위 항목 수집
    for root_id in root_ids:
        if not root_id: continue
        fetch_all_sub_items(notion, root_id, all_target_pages)

    print(f"\nTotal pages to backup: {len(all_target_pages)}")

    for page_id in all_target_pages:
        try:
            page_title = get_page_title(notion, page_id)
            print(f"Backing up: {page_title}")
            blocks = get_all_blocks(notion, page_id)
            html_content = notion_blocks_to_html(blocks)
            
            file_name = f"{page_title}.html"
            file_metadata = {{'name': file_name, 'parents': [gdrive_folder_id]}}
            
            query = f"name='{file_name}' and '{gdrive_folder_id}' in parents and trashed=false"
            response = drive_service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
            existing_files = response.get('files', [])

            fh = io.BytesIO(html_content.encode('utf-8'))
            media = MediaIoBaseUpload(fh, mimetype='text/html', resumable=True)

            if existing_files:
                drive_service.files().update(fileId=existing_files[0]['id'], media_body=media).execute()
            else:
                drive_service.files().create(body=file_metadata, media_body=media).execute()
        except Exception as e:
            print(f"Error backing up {page_id}: {e}")

if __name__ == "__main__":
    main()