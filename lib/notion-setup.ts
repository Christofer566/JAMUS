import { Client } from '@notionhq/client';
import * as fs from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export async function ensureDebuggingHistoryExists(): Promise<string> {
    // 환경 변수 확인
    const dbId = process.env.NOTION_DEBUGGING_HISTORY_DB_ID;

    console.log('Environment Check:');
    console.log('NOTION_TOKEN:', process.env.NOTION_TOKEN ? 'Set' : 'Missing');
    console.log('NOTION_PROJECT_ROOT_PAGE_ID:', process.env.NOTION_PROJECT_ROOT_PAGE_ID ? 'Set' : 'Missing');
    console.log('NOTION_WEEKLY_TASK_DB_ID:', process.env.NOTION_WEEKLY_TASK_DB_ID ? 'Set' : 'Missing');

    // 필수 환경 변수 체크
    if (!process.env.NOTION_TOKEN) {
        throw new Error('NOTION_TOKEN 환경 변수가 설정되지 않았습니다.');
    }
    if (!process.env.NOTION_PROJECT_ROOT_PAGE_ID) {
        throw new Error('NOTION_PROJECT_ROOT_PAGE_ID 환경 변수가 설정되지 않았습니다.');
    }
    if (!process.env.NOTION_WEEKLY_TASK_DB_ID) {
        throw new Error('NOTION_WEEKLY_TASK_DB_ID 환경 변수가 설정되지 않았습니다.');
    }

    if (dbId) {
        console.log('✅ Debugging History DB 이미 존재:', dbId);
        return dbId;
    }

    console.log('🔨 Debugging History DB 생성 중...');

    // DB 생성
    const response = await notion.databases.create({
        parent: {
            type: 'page_id',
            page_id: process.env.NOTION_PROJECT_ROOT_PAGE_ID as string
        },
        title: [
            {
                type: 'text',
                text: { content: 'Debugging History' }
            }
        ],
        properties: {
            '버그 제목': {
                title: {}
            },
            'Task': {
                relation: {
                    database_id: process.env.NOTION_WEEKLY_TASK_DB_ID as string
                }
            },
            '상태': {
                select: {
                    options: [
                        { name: '발생', color: 'red' },
                        { name: '해결', color: 'green' },
                        { name: '재발', color: 'orange' }
                    ]
                }
            },
            '심각도': {
                select: {
                    options: [
                        { name: 'Critical', color: 'red' },
                        { name: 'High', color: 'orange' },
                        { name: 'Medium', color: 'yellow' },
                        { name: 'Low', color: 'gray' }
                    ]
                }
            },
            '발생 시각': {
                date: {}
            },
            '해결 시각': {
                date: {}
            },
            '소요 시간(분)': {
                number: { format: 'number' }
            },
            '커밋 SHA': {
                rich_text: {}
            },
            '관련 파일': {
                multi_select: {}
            },
            '카테고리': {
                multi_select: {
                    options: [
                        { name: 'API 오류', color: 'red' },
                        { name: 'UI 버그', color: 'blue' },
                        { name: '로직 오류', color: 'purple' },
                        { name: '타입 오류', color: 'gray' },
                        { name: '타임아웃', color: 'orange' },
                        { name: '인증 오류', color: 'pink' }
                    ]
                }
            }
        }
    });

    console.log('✅ Debugging History DB 생성 완료:', response.id);
    console.log('⚠️  환경 변수에 추가 필요:');
    console.log(`NOTION_DEBUGGING_HISTORY_DB_ID=${response.id}`);

    fs.writeFileSync('db_id.txt', response.id);

    return response.id;
}
