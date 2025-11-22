import Anthropic from '@anthropic-ai/sdk';

export async function generateDetailedTEL(analysisData) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  // 커밋 메시지 전체 텍스트
  const commitMessages = analysisData.commitAnalysis.commits
    .map(c => `- ${c.message}`)
    .join('\n');

  // 버그 정보
  const bugDetails = analysisData.bugAnalysis.bugs
    .map(b => `- ${b.title} (${b.fixAttempts}회 시도, ${b.totalTime})`)
    .join('\n');

  const prompt = `당신은 개발 실행 로그(Task Execution Log) 작성 전문가입니다.

【참고: 기존 TEL 예시】
다음과 같은 수준의 상세한 문서를 작성해주세요:

## 📋 Task 정보
- Task ID, 제목, 예상/실제 시간, 복잡도, 우선순위, 완료 일시

## ✅ 작업 내용
### 1. 구현한 기능
세부 항목별로 나누어 설명:
- 1.1 워크플로우 파일: 어떤 파일을 만들었고, 역할은?
- 1.2 메인 스크립트: 주요 함수와 각 역할
- 1.3 폴더 구조: 생성된 폴더와 용도

## 🧪 테스트 결과
- 테스트 케이스 개수와 분류
- 성공/실패 케이스 상세
- 검증된 기능 체크리스트

## 🐛 발생한 이슈
각 이슈마다:
- 이슈 N: 제목
- 문제: 무엇이 잘못되었나
- 원인: 왜 발생했나
- 해결: 어떻게 고쳤나
- 코드 예시 포함

## 📊 통계
### 시간 분석
- 총 소요/예상/효율
### 작업 분포
- 코드 작성/디버깅/테스트 시간
### Git 통계
- 커밋 수, 파일 변경, 추가/삭제 코드

## 💡 학습 내용
5가지 이상, 각각:
- 제목
- 상세 설명
- 코드 예시

## 📝 메모
- 성공 요인
- 주의사항

## ✅ 체크리스트
완료된 항목들

【분석 데이터】
커밋 메시지:
${commitMessages}

시간 분석:
- 총 개발: ${analysisData.timeAnalysis.totalDevelopmentTime}
- AI 구현: ${analysisData.timeAnalysis.aiImplementationTime}
- 리뷰/수정: ${analysisData.timeAnalysis.humanReviewTime}

버그 분석:
${bugDetails || '없음'}

Git 통계:
- 총 커밋: ${analysisData.commitAnalysis.totalCommits}
- 파일 변경: ${analysisData.commitAnalysis.filesChanged}
- 추가: +${analysisData.commitAnalysis.additions}
- 삭제: -${analysisData.commitAnalysis.deletions}

【출력 형식】
다음 JSON 형태로만 응답:
{
  "taskInfo": {
    "title": "작업 제목",
    "estimatedTime": "2-3h",
    "actualTime": "3시간",
    "complexity": "6/10",
    "completedAt": "2025.11.22 20:30"
  },
  "workContent": {
    "features": [
      {
        "section": "1.1 워크플로우 파일",
        "items": ["항목1", "항목2"]
      }
    ]
  },
  "testResults": {
    "summary": "테스트 요약",
    "cases": ["케이스1", "케이스2"],
    "verified": ["기능1", "기능2"]
  },
  "issues": [
    {
      "title": "이슈 제목",
      "problem": "문제 설명",
      "cause": "원인",
      "solution": "해결 방법",
      "code": "코드 예시"
    }
  ],
  "statistics": {
    "timeAnalysis": {},
    "workDistribution": {},
    "gitStats": {}
  },
  "learnings": [
    {
      "title": "학습 제목",
      "description": "상세 설명",
      "code": "코드 예시"
    }
  ],
  "notes": {
    "successFactors": ["요인1", "요인2"],
    "warnings": ["주의1", "주의2"]
  },
  "checklist": ["항목1", "항목2"]
}

JSON만 출력하세요. 다른 텍스트는 절대 포함하지 마세요.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content[0].text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  return JSON.parse(responseText);
}
