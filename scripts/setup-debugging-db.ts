import { config } from 'dotenv';
config({ path: '.env.local' });
import { ensureDebuggingHistoryExists } from '../lib/notion-setup';
import * as fs from 'fs';

async function setup() {
    try {
        console.log('🚀 Debugging History DB 설정 시작...\n');

        const dbId = await ensureDebuggingHistoryExists();

        console.log('\n✅ 설정 완료!');
        console.log('\n📝 다음 단계:');
        console.log('1. Vercel Dashboard → 환경 변수 추가');
        console.log(`   NOTION_DEBUGGING_HISTORY_DB_ID=${dbId}`);
        console.log('2. Vercel 재배포');
        console.log('3. Task 7 테스트\n');

    } catch (error) {
        console.error('❌ 오류 발생:', error);
        fs.writeFileSync('error.log', JSON.stringify(error, null, 2));
    }
}

setup();
