# JAMUS - Claude Code Context

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

**Claude Code 역할: 로직/디버깅 담당**
- 복잡한 비즈니스 로직 구현
- 버그 수정 및 디버깅
- 기존 코드 구조 유지하며 수정

## HOW (작업 방법)

**빌드 & 실행**
- 개발: `npm run dev`
- 빌드: `npm run build`
- 린트: `npm run lint`

**작업 전 필수**
1. Development Spec 확인 (Notion에서 제공됨)
2. 수정할 파일 범위 확인
3. 기존 코드 패턴 파악 후 동일하게 유지

**코드 스타일**
- 기존 코드 패턴 따르기
- TypeScript strict mode 준수
- Tailwind CSS 클래스 사용 (인라인 스타일 지양)

**커밋 컨벤션**
- feat: 새 기능
- fix: 버그 수정
- refactor: 리팩토링
- docs: 문서 수정

## 문서 참조

상세 기능 정의와 컨텍스트는 Notion Context Hub 참조.
Development Spec이 제공되면 해당 범위 내에서만 작업.