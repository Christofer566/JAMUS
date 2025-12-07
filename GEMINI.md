# JAMUS - Gemini CLI Context

## WHAT (프로젝트 구조)

음악 협업 플랫폼 MVP 개발 중. 비연주자도 음악 창작에 참여할 수 있게 하는 것이 목표.

**Tech Stack**
- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Backend: Supabase (Auth / DB / Realtime / Storage) - Seoul Region
- Audio: Web Audio API + Tone.js + VexFlow (악보 렌더링)
- Deployment: Vercel (main 브랜치 자동 배포)

**폴더 구조**
```
src/
├── app/           # Next.js App Router 페이지
├── components/    # 재사용 컴포넌트
├── hooks/         # Custom React Hooks
├── lib/           # 유틸리티, Supabase 클라이언트
├── stores/        # 전역 상태 (Zustand)
└── types/         # TypeScript 타입 정의
```

## WHY (핵심 원칙)

**개발 철학**
- "Development 문서 = 코드와 1:1 매핑" (히로인스 팀 철학)
- 한 번에 3개 이상 파일 수정 금지
- 성민 승인 없이 코드 작성 금지

**Gemini CLI 역할: UI 구현 담당**
- Development Spec에 정의된 UI 컴포넌트 구현
- Figma 디자인 기반 스타일링
- ⚠️ DS(Development Spec) 범위를 절대 벗어나지 말 것

## HOW (작업 방법)

**빌드 & 실행**
- 개발: `npm run dev`
- 빌드: `npm run build`
- 린트: `npm run lint`

**작업 전 필수**
1. Development Spec 범위 확인 (제공된 DS만 구현)
2. 수정할 파일 목록 확인
3. 디자인 시스템 준수 (Dark Navy + JAMUS Blue + Accent Green)

**디자인 시스템**
- Primary: Dark Navy (#0D1B2A)
- Accent: JAMUS Blue (#3A86FF)
- Success: Accent Green (#06D6A0)
- Font: Sans-Serif 기반

**코드 스타일**
- 기존 코드 패턴 따르기
- TypeScript strict mode 준수
- Tailwind CSS 클래스 사용 (인라인 스타일 지양)
- 컴포넌트는 함수형 + hooks 패턴

**커밋 컨벤션**
- feat: 새 기능
- fix: 버그 수정
- refactor: 리팩토링
- style: 스타일 수정

## ⚠️ 중요 제한사항

1. **DS 범위 엄수**: Development Spec에 명시된 것만 구현
2. **파일 수 제한**: 한 번에 3개 이상 파일 수정 금지
3. **승인 대기**: 큰 변경은 성민 승인 후 진행
4. **기존 구조 유지**: 새 패턴 도입 전 기존 코드 확인

## 문서 참조

상세 기능 정의는 Notion Context Hub 참조.
Development Spec이 제공되면 해당 범위 내에서만 작업.