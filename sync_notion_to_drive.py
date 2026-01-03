import os
import json
from notion_client import Client
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import io

def get_page_title(notion, page_id):
    try:
        page_props = notion.pages.retrieve(page_id)
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
    return f"<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Notion Backup</title><style>body{{font-family:sans-serif;line-height:1.6;padding:20px;max-width:800px;margin:auto;}}</style></head><body>{html}</body></html>"

def get_all_blocks(notion, page_id):
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
    client_id = os.environ.get("GDRIVE_CLIENT_ID")
    client_secret = os.environ.get("GDRIVE_CLIENT_SECRET")
    refresh_token = os.environ.get("GDRIVE_REFRESH_TOKEN")
    gdrive_folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    notion_page_ids_str = os.environ.get("NOTION_PAGE_ID")

    if not all([notion_token, client_id, client_secret, refresh_token, gdrive_folder_id, notion_page_ids_str]):
        print("Error: Missing required environment variables (OAuth2 credentials or IDs).")
        return

    # Notion 클라이언트 초기화
    notion = Client(auth=notion_token)

    # Google Drive OAuth2 인증 (Refresh Token 사용)
    creds = Credentials(
        None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=['https://www.googleapis.com/auth/drive.file']
    )
    drive_service = build('drive', 'v3', credentials=creds)

    page_ids = [pid.strip() for pid in notion_page_ids_str.split(',')]

    for page_id in page_ids:
        if not page_id: continue
        print(f"\n--- Processing Notion Page ID: {page_id} ---")
        try:
            page_title = get_page_title(notion, page_id)
            print(f"Title: {page_title}")
            blocks = get_all_blocks(notion, page_id)
            html_content = notion_blocks_to_html(blocks)
            
            file_name = f"{page_title}.html"
            file_metadata = {
                'name': file_name,
                'parents': [gdrive_folder_id]
            }
            
            query = f"name='{file_name}' and '{gdrive_folder_id}' in parents and trashed=false"
            response = drive_service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
            existing_files = response.get('files', [])

            fh = io.BytesIO(html_content.encode('utf-8'))
            media = MediaIoBaseUpload(fh, mimetype='text/html', resumable=True)

            if existing_files:
                file_id = existing_files[0]['id']
                print(f"Updating existing file: {file_name} (ID: {file_id})")
                drive_service.files().update(fileId=file_id, media_body=media).execute()
            else:
                print(f"Creating new file: {file_name}")
                drive_service.files().create(body=file_metadata, media_body=media, fields='id').execute()

            print(f"SUCCESS: Backed up '{file_name}' to Google Drive.")

        except Exception as e:
            print(f"FAILED: An error occurred while processing page {page_id}: {e}")

if __name__ == "__main__":
    main()
