# Notion DS 온디맨드 AI 검토 시스템 사용 가이드

## 1. 개요

이 시스템은 Notion에 작성된 개발 사양(DS) 문서를 Git 저장소에 커밋하지 않고, 원할 때 수동으로 GPT와 Gemini에게 보내 검토를 요청하는 자동화 워크플로우입니다.

AI의 검토 결과는 원본 Notion 문서의 하위 페이지로 자동 생성되어, 개발 사양과 검토 내용을 한곳에서 관리할 수 있습니다.

## 2. 사전 준비 (최초 1회 설정)

이 시스템을 활성화하려면, 아래 3개의 파일을 GitHub 저장소에 커밋해야 합니다.

1.  `.github/workflows/run-manual-ds-review.yml` (본 워크플로우 정의 파일)
2.  `scripts/on-demand-review.ts` (워크플로우 실행 스크립트)
3.  `MANUAL_DS_REVIEW_GUIDE.md` (현재 보고 계신 이 가이드 파일)

**또한, GitHub 저장소에 다음과 같이 Secrets를 설정해야 합니다.**

1.  GitHub 저장소 페이지에서 `Settings` 탭으로 이동합니다.
2.  왼쪽 메뉴에서 `Secrets and variables` > `Actions`를 선택합니다.
3.  `Repository secrets` 섹션에서 `New repository secret` 버튼을 클릭하여 아래 3개의 Secret을 생성합니다. (이미 존재하는 경우 생략 가능)
    *   **`NOTION_API_KEY`**: Notion API 통합 토큰. API가 해당 DS 문서를 읽고, 하위 페이지를 생성할 수 있는 권한이 있어야 합니다.
    *   **`OPENAI_API_KEY`**: OpenAI API 키.
    *   **`GEMINI_API_KEY`**: Gemini API 키.

## 3. 사용 방법

사전 준비가 완료되었다면, 아래 단계에 따라 언제든지 수동으로 AI 검토를 실행할 수 있습니다.

1.  **GitHub Actions 탭으로 이동**: 검토를 실행하고 싶은 GitHub 저장소의 **"Actions"** 탭을 클릭합니다.
2.  **워크플로우 선택**: 왼쪽 워크플로우 목록에서 **"Run Manual DS Review"**를 선택합니다.
3.  **워크플로우 실행**: 오른쪽에 나타나는 **"Run workflow"** 드롭다운 버튼을 클릭합니다.
4.  **Notion 페이지 ID 입력**: **`Notion Design Specification Page ID to review`** 라는 입력 필드에 검토받고 싶은 Notion 페이지의 ID를 붙여넣습니다.
    *   페이지 ID는 Notion 페이지의 URL 마지막에 있는 긴 영문/숫자 조합입니다.
    *   *예시: `https://www.notion.so/My-DS-Title-`**`a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`***
5.  **실행 버튼 클릭**: 파란색 **"Run workflow"** 버튼을 클릭하여 검토를 시작합니다.

## 4. 결과 확인

워크플로우 실행이 성공적으로 완료되면 (보통 몇 분 정도 소요됩니다), 결과를 Notion에서 확인할 수 있습니다.

*   **결과 위치**: 검토를 요청했던 **원본 Notion DS 문서의 하위 페이지**로 생성됩니다.
*   **페이지 제목**: `DS Review: [원본 문서 제목] (YYYY. M. D.)` 형식으로 생성됩니다.
*   **페이지 내용**: ChatGPT와 Gemini가 각각 제공한 검토 의견이 마크다운 형식으로 정리되어 있습니다.

## 5. 문제 해결

*   **워크플로우가 실패하는 경우**:
    *   **GitHub Secrets 설정 확인**: `Settings` > `Secrets and variables` > `Actions`에 3개의 API 키가 올바르게 입력되었는지 다시 확인해주세요.
    *   **Notion 페이지 권한 확인**: `NOTION_API_KEY`에 연결된 Notion 통합(Integration)이 검토를 요청한 DS 페이지에 대해 **읽기 및 페이지 추가 권한**을 가지고 있는지 확인해주세요.
*   **AI 검토가 건너뛰어지는 경우**:
    *   워크플로우 실행 로그에 'API KEY가 없어 검토를 건너뜁니다' 와 같은 메시지가 보인다면, 해당 Secret이 설정되지 않았거나 이름이 잘못된 것입니다.
