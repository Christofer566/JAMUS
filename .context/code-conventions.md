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

## 커밋 메시지 규칙

### 패턴 (필수)
`Task X: <type> - [설명]` 또는 `Task X.Y: <type> - [설명]` 형식

### Type 종류
- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링 (기능 변경 없음)
- `style`: 코드 스타일 변경 (포맷팅 등)
- `docs`: 문서 수정
- `chore`: 빌드, 설정 파일 수정

### 예시
- ✅ `Task 1: feat - 로그인 기능 추가`
- ✅ `Task 2.1: fix - 날짜 계산 오류 수정`
- ✅ `Task 0: refactor - FEED 오디오 시스템 재구축`
- ✅ `Task 3: docs - README 업데이트`
- ✅ `Task 0.1: chore - 워크플로우 설정 추가`
- ❌ `feat: 새 기능 추가` (Task 번호 누락)
- ❌ `버그 수정` (패턴 위반)

### 자동화 연동
- Task 번호가 파싱되어 Context Hub에 로그 자동 추가
- Task 번호가 바뀌면 이전 Task 로그 자동 삭제
- fix 타입 커밋은 Debugging History에 자동 기록