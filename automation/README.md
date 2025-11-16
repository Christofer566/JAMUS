# 🤖 Gemini Automation Workflow

이 디렉터리에는 JAMUS 프로젝트의 개발 워크플로우를 자동화하기 위한 스크립트들이 포함되어 있습니다.
GitHub `triggers/` 폴더를 메시지 큐로 사용하여 Claude ↔ Gemini 간의 협업을 95% 자동화하는 것을 목표로 합니다.

## 📂 파일 구성

-   `gemini-automation.ps1`: 메인 자동화 스크립트. 주기적으로 GitHub 리포지토리를 확인하고 트리거 파일에 따라 Gemini에게 명령을 전달합니다.
-   `setup-autostart.ps1`: `gemini-automation.ps1` 스크립트를 Windows 작업 스케줄러에 등록하여 시스템 시작 시 자동으로 실행되도록 설정하는 스크립트입니다.
-   `README.md`: 현재 보고 계신 이 문서입니다.

## ⚙️ 설치 및 설정 방법

### 1단계: 환경 변수 설정 (중요!)

이 스크립트가 정상적으로 동작하려면 몇 가지 정보가 필요합니다. Windows의 **'시스템 환경 변수 편집'**을 열어 아래의 환경 변수를 **'사용자 변수'** 또는 **'시스템 변수'**에 추가해주세요.

-   **`SLACK_WEBHOOK`** (선택 사항, 강력 권장)
    -   **값:** Slack Incoming Webhook URL
    -   **목적:** 스크립트 실행 중 오류가 발생하거나 Git 충돌이 일어났을 때 실시간으로 알림을 받기 위해 필요합니다.
    -   **발급 방법:** [Slack API 문서](https://api.slack.com/messaging/webhooks)를 참고하여 발급받을 수 있습니다.

-   **`GITHUB_TOKEN`** (필요 시)
    -   **값:** GitHub Personal Access Token (PAT)
    -   **목적:** `git pull`, `git push` 등 GitHub와 통신할 때 인증 오류가 발생하는 경우 필요할 수 있습니다. 일반적으로는 Git Credential Manager에 의해 자동으로 처리됩니다.
    -   **권한:** `repo` 스코프 권한이 필요합니다.

### 2단계: 자동 시작 스크립트 실행

1.  **PowerShell을 관리자 권한으로 실행**합니다.
    -   `Win + X` 키를 누른 후 'Windows PowerShell(관리자)' 또는 '터미널(관리자)'를 선택합니다.
2.  프로젝트의 `automation` 디렉터리로 이동합니다.
    ```powershell
    cd C:\JAMUS\automation
    ```
3.  `setup-autostart.ps1` 스크립트를 실행합니다.
    ```powershell
    .\setup-autostart.ps1
    ```
4.  스크립트의 안내에 따라 작업이 성공적으로 등록되었는지 확인합니다.

이제 시스템을 재부팅하면 `gemini-automation.ps1` 스크립트가 자동으로 백그라운드에서 실행을 시작합니다.

## 🧪 테스트 및 확인

### 수동 실행
자동 시작을 설정하기 전에 스크립트가 정상적으로 동작하는지 수동으로 테스트해볼 수 있습니다.

```powershell
# automation 폴더에서 실행
.\gemini-automation.ps1
```
PowerShell 창에 로그가 실시간으로 출력되므로, `git pull`을 수행하고 트리거를 확인하는 과정을 직접 볼 수 있습니다.

### 로그 파일 확인
스크립트의 모든 활동은 로그 파일에 기록됩니다. 문제가 발생했거나 과거 기록을 확인하고 싶을 때 유용합니다.

-   **로그 파일 위치:** `C:\Logs\gemini-automation.log`

##  troubleshooting

-   **스크립트가 실행되지 않는 것 같아요:**
    1.  `C:\Logs\gemini-automation.log` 파일이 생성되었는지, 내용이 기록되고 있는지 확인하세요.
    2.  Windows '작업 스케줄러'를 열어 `GeminiAutomationRunner` 작업이 등록되어 있는지, '마지막 실행 결과'에 오류가 없는지 확인하세요.
    3.  환경 변수가 올바르게 설정되었는지 다시 확인하세요.

-   **Git 충돌 알림을 받았어요:**
    1.  `C:\JAMUS` 디렉터리로 이동하여 `git status` 명령으로 충돌 상태를 확인하세요.
    2.  충돌이 발생한 파일을 직접 열어 수동으로 해결합니다.
    3.  `git add .`, `git commit`, `git push`를 통해 충돌을 해결합니다.
    4.  스크립트는 다음 주기(약 1분 뒤)에 자동으로 정상 동작을 재개합니다.

-   **권한 오류가 발생해요:**
    -   `setup-autostart.ps1` 스크립트는 반드시 **관리자 권한**으로 실행해야 합니다.
    -   Git 명령어 실행 시 인증 오류가 발생한다면, `GITHUB_TOKEN` 환경 변수를 설정하는 것을 고려해보세요.
