import os
import json
from notion_client import Client
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

def get_page_title(notion, page_id):
    """Notion 페이지의 제목을 가져옵니다."""
    try:
        page_props = notion.pages.retrieve(page_id)
        # 페이지 제목 속성 추출 (Notion API 버전에 따라 다를 수 있음)
        properties = page_props.get('properties', {})
        for prop in properties.values():
            if prop['type'] == 'title':
                title_list = prop.get('title', [])
                if title_list:
                    return title_list[0].get('plain_text', 'Untitled')
    except Exception as e:
        print(f"Error fetching page title for {page_id}: {e}")
    return "Untitled"

def notion_blocks_to_html(blocks):
    """Notion 블록을 간단한 HTML로 변환합니다."""
    html = ""
    for block in blocks:
        block_type = block['type']
        try:
            if block_type == 'paragraph' and block['paragraph']['rich_text']:
                text = "".join([t['plain_text'] for t in block['paragraph']['rich_text']])
                html += f"<p>{text}</p>\n"
            elif block_type.startswith('heading_'):
                level = block_type.split('_')[1]
                if block[block_type]['rich_text']:
                    text = "".join([t['plain_text'] for t in block[block_type]['rich_text']])
                    html += f"<h{level}>{text}</h{level}>\n"
            elif block_type == 'bulleted_list_item' and block['bulleted_list_item']['rich_text']:
                text = "".join([t['plain_text'] for t in block['bulleted_list_item']['rich_text']])
                html += f"<li>{text}</li>\n"
            elif block_type == 'to_do' and block['to_do']['rich_text']:
                text = "".join([t['plain_text'] for t in block['to_do']['rich_text']])
                checked = "checked" if block['to_do']['checked'] else ""
                html += f'<li><input type="checkbox" {checked} disabled> {text}</li>\n'
            elif block_type == 'divider':
                html += "<hr>\n"
        except Exception:
            continue
            
    # 기본 HTML 구조 감싸기
    return f"<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Notion Backup</title><style>body{{font-family:sans-serif;line-height:1.6;padding:20px;max-width:800px;margin:auto;}}</style></head><body>{html}</body></html>"

def get_all_blocks(notion, page_id):
    """페이지의 모든 블록을 가져옵니다."""
    blocks = []
    start_cursor = None
    while True:
        response = notion.blocks.children.list(block_id=page_id, start_cursor=start_cursor, page_size=100)
        blocks.extend(response['results'])
        if not response['has_more']:
            break
        start_cursor = response['next_cursor']
    return blocks

def main():
    # 환경 변수에서 설정값 가져오기
    notion_token = os.environ.get("NOTION_TOKEN")
    gdrive_creds_json = os.environ.get("GDRIVE_CREDENTIALS")
    gdrive_folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    notion_page_ids_str = os.environ.get("NOTION_PAGE_ID")

    if not all([notion_token, gdrive_creds_json, gdrive_folder_id, notion_page_ids_str]):
        print("Error: Missing one or more required environment variables (NOTION_TOKEN, GDRIVE_CREDENTIALS, GDRIVE_FOLDER_ID, NOTION_PAGE_ID).")
        return

    # Notion 클라이언트 초기화
    notion = Client(auth=notion_token)

    # Google Drive 클라이언트 초기화
    gdrive_creds_dict = json.loads(gdrive_creds_json)
    creds = Credentials.from_service_account_info(gdrive_creds_dict, scopes=['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)

    # Notion 페이지 ID 처리 (여러 개일 경우 대비)
    page_ids = [pid.strip() for pid in notion_page_ids_str.split(',')]

    for page_id in page_ids:
        if not page_id: continue
        print(f"\n--- Processing Notion Page ID: {page_id} ---")
        try:
            # 1. Notion 페이지 제목 및 블록 가져오기
            page_title = get_page_title(notion, page_id)
            print(f"Title: {page_title}")
            blocks = get_all_blocks(notion, page_id)

            # 2. HTML로 변환
            html_content = notion_blocks_to_html(blocks)
            
            # 3. Google Drive 업로드 준비
            file_name = f"{page_title}.html"
            file_metadata = {
                'name': file_name,
                'parents': [gdrive_folder_id]
            }
            
            # 파일이 이미 있는지 확인 (이름으로 검색)
            query = f"name='{file_name}' and '{gdrive_folder_id}' in parents and trashed=false"
            response = drive_service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
            existing_files = response.get('files', [])

            # 메모리 내 데이터를 미디어로 변환
            fh = io.BytesIO(html_content.encode('utf-8'))
            media = MediaIoBaseUpload(fh, mimetype='text/html', resumable=True)

            if existing_files:
                # 기존 파일 업데이트
                file_id = existing_files[0]['id']
                print(f"Updating existing file: {file_name} (ID: {file_id})")
                drive_service.files().update(
                    fileId=file_id,
                    media_body=media
                ).execute()
            else:
                # 새 파일 생성
                print(f"Creating new file: {file_name}")
                drive_service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute()

            print(f"SUCCESS: Backed up '{file_name}' to Google Drive.")

        except Exception as e:
            print(f"FAILED: An error occurred while processing page {page_id}: {e}")

if __name__ == "__main__":
    main()