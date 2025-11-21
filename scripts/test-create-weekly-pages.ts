import 'dotenv/config';
import { createWeeklyPages } from '../lib/create-weekly-pages';

async function test() {
  console.log('🚀 주간 페이지 생성 테스트 시작...\n');
  
  try {
    const result = await createWeeklyPages();
    
    console.log('✅ 성공!\n');
    console.log('📊 생성 결과:');
    console.log(`- 주차: W${result.weekNumber}`);
    console.log(`- TEL 페이지 ID: ${result.telPageId}`);
    console.log(`- WTL 페이지 ID: ${result.wtlPageId}`);
    console.log(`\n🔗 링크:`);
    console.log(`- TEL: ${result.telUrl}`);
    console.log(`- WTL: ${result.wtlUrl}`);
    
  } catch (error) {
    console.error('❌ 실패:', error);
    if (error instanceof Error) {
      console.error('상세:', error.message);
    }
  }
}

test();
