import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// 주차 정보 계산
function getWeekInfo(date = new Date()) {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  
  return {
    weekNumber: weekNumber.toString().padStart(2, '0'),
    startDate: sunday.toISOString().split('T')[0],
    endDate: saturday.toISOString().split('T')[0],
    year: year
  };
}

// 제목 생성
function generateTitle(weekInfo: any, docType: 'TEL' | 'WTL') {
  const start = weekInfo.startDate.replace(/-/g, '.').slice(5);
  const end = weekInfo.endDate.replace(/-/g, '.').slice(5);
  
  const docName = docType === 'TEL' 
    ? 'Task Execution Log' 
    : 'Weekly Task List';
  
  return `[W${weekInfo.weekNumber}] ${weekInfo.year}.${start}-${end} ${docName}`;
}

// 주간 페이지 자동 생성
export async function createWeeklyPages() {
  const weekInfo = getWeekInfo();
  
  // 1. TEL 템플릿 가져오기
  const telTemplate = await notion.blocks.children.list({
    block_id: process.env.NOTION_TEL_TEMPLATE_ID!,
    page_size: 100
  });
  
  // 2. WTL 템플릿 가져오기
  const wtlTemplate = await notion.blocks.children.list({
    block_id: process.env.NOTION_WTL_TEMPLATE_ID!,
    page_size: 100
  });
  
  // 3. TEL 페이지 생성
  const telPage = await notion.pages.create({
    parent: { database_id: process.env.NOTION_UPDATE_LOGS_DB_ID! },
    properties: {
      'Name': { 
        title: [{ text: { content: generateTitle(weekInfo, 'TEL') }}]
      },
      '구분': { select: { name: 'TEL' }},
      'Date': { date: { start: weekInfo.startDate }},
      '상태': { select: { name: '활 일' }}
    }
  });
  
  // TEL 템플릿 내용 복사
  if (telTemplate.results.length > 0) {
    await notion.blocks.children.append({
      block_id: telPage.id,
      children: telTemplate.results as any
    });
  }
  
  // 4. WTL 페이지 생성
  const wtlPage = await notion.pages.create({
    parent: { database_id: process.env.NOTION_UPDATE_LOGS_DB_ID! },
    properties: {
      'Name': { 
        title: [{ text: { content: generateTitle(weekInfo, 'WTL') }}]
      },
      '구분': { select: { name: 'WTL' }},
      'Date': { date: { start: weekInfo.startDate }},
      '상태': { select: { name: '활 일' }}
    }
  });
  
  // WTL 템플릿 내용 복사
  if (wtlTemplate.results.length > 0) {
    await notion.blocks.children.append({
      block_id: wtlPage.id,
      children: wtlTemplate.results as any
    });
  }
  
  return {
    success: true,
    weekNumber: weekInfo.weekNumber,
    telPageId: telPage.id,
    wtlPageId: wtlPage.id,
    telUrl: telPage.url,
    wtlUrl: wtlPage.url
  };
}