# JAMUS Code Conventions

## 파일 구조
- 컴포넌트: /components/{feature}/
- 페이지: /app/(protected)/{route}/
- 훅: /hooks/
- 유틸: /utils/
- 타입: /types/

## 필수 규칙
1. React.memo 적극 사용 (성능)
2. 한 번에 3개 이하 파일만 수정
3. 각 Task 완료 시 즉시 테스트
4. Phase별 커밋 (디버깅 누적 방지)

## 네이밍
- 컴포넌트: PascalCase (예: FeedClientPage)
- 함수/변수: camelCase (예: handlePlayPause)
- 상수: UPPER_SNAKE_CASE (예: DEFAULT_BPM)
- 파일: PascalCase 또는 kebab-case

## 주의사항
- useEffect 의존성 배열 꼼꼼히 확인
- 비동기 상태 업데이트 타이밍 주의
- 메모리 누수 방지 (cleanup 필수)