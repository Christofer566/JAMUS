# =================================================================================================
# Gemini Automation Autostart Setup Script
#
# 언어: PowerShell
# 목적: gemini-automation.ps1 스크립트를 Windows 작업 스케줄러에 등록하여 시스템 시작 시 자동 실행되도록 설정합니다.
# 실행: 관리자 권한으로 실행해야 합니다.
# 저자: Gemini CLI
# 버전: 1.0
# =================================================================================================

# --- 스크립트 설정 ---
$TaskName = "GeminiAutomationRunner"
$TaskDescription = "Runs the Gemini automation script at system startup to enable automated workflows."
$ScriptFileName = "gemini-automation.ps1"
$ScriptPath = Join-Path -Path ($PSScriptRoot | Split-Path) -ChildPath "automation\$ScriptFileName"

# --- 관리자 권한 확인 ---
if (-Not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "이 스크립트는 관리자 권한으로 실행해야 합니다."
    Write-Warning "PowerShell을 '관리자 권한으로 실행'으로 연 뒤 다시 시도해주세요."
    Read-Host "계속하려면 Enter 키를 누르세요..."
    exit
}

Write-Host "✅ 관리자 권한 확인됨."

# --- 기존 작업 확인 및 삭제 ---
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Warning "기존 '$TaskName' 작업을 찾았습니다. 작업을 다시 설정하기 위해 삭제합니다."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# --- 작업 스케줄러 설정 ---
Write-Host "⚙️ Windows 작업 스케줄러에 작업을 등록합니다..."

# 실행할 동작 정의
# -NoProfile: 프로필 로딩 없이 빠르게 실행
# -WindowStyle Hidden: PowerShell 창을 숨긴 채 백그라운드에서 실행
# -ExecutionPolicy Bypass: 실행 정책 문제 방지
# -File: 실행할 스크립트 파일 경로
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

# 트리거 정의 (시스템 시작 시)
$trigger = New-ScheduledTaskTrigger -AtStartup

# 사용자 설정 (로그온 여부와 관계없이 실행)
# S4U (Service for User) 로그온 유형은 사용자가 로그온하지 않아도 작업을 실행할 수 있게 함
$principal = New-ScheduledTaskPrincipal -UserId (Get-CimInstance -ClassName Win32_ComputerSystem).UserName -LogonType S4U

# 작업 등록
try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Description $TaskDescription
    Write-Host "✅ 성공! '$TaskName' 작업이 시스템 시작 시 자동으로 실행되도록 등록되었습니다."
    Write-Host "   - 작업 경로: $ScriptPath"
    Write-Host "   - 실행 방식: 백그라운드 (창 숨김)"
} catch {
    Write-Error "❌ 작업 등록에 실패했습니다: $($_.Exception.Message)"
    exit
}

# --- 환경 변수 설정 안내 ---
Write-Host "`n---"
Write-Host "🔔 중요: 다음 환경 변수를 설정해야 합니다."
Write-Host "   - SLACK_WEBHOOK: Slack 알림을 받으려면 Webhook URL을 설정하세요."
Write-Host "   - GITHUB_TOKEN: (필요 시) GitHub API 사용을 위한 Personal Access Token을 설정하세요."
Write-Host "   - 설정 방법: Windows '시스템 환경 변수 편집'에서 '사용자 변수' 또는 '시스템 변수'로 추가할 수 있습니다."

Read-Host "모든 설정이 완료되었습니다. 계속하려면 Enter 키를 누르세요..."
