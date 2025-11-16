# =================================================================================================
# JAMUS Gemini Automation Autostart Setup Script
#
# 언어: PowerShell
# 목적: gemini-automation.ps1 스크립트를 Windows 작업 스케줄러에 등록하여 시스템 부팅 시 자동 실행되도록 설정합니다.
# 주요 변경 사항:
#   - 신뢰성 있는 자동 시작을 위해 'SYSTEM' 계정으로 실행하도록 변경
#   - 관리자 권한(Highest)으로 실행 설정
#   - 배터리 사용 시에도 작업이 중지되거나 시작되지 않는 문제 방지
#   - 작업 실행 시간 제한 없음
# 실행: 관리자 권한으로 실행해야 합니다.
# 저자: Gemini CLI (Updated)
# 버전: 2.0
# =================================================================================================

# --- 스크립트 설정 ---
$TaskName = "JAMUS-Gemini-Automation"
$TaskDescription = "Runs the JAMUS Gemini automation script at system startup with highest privileges."
$ScriptFileName = "gemini-automation.ps1"
# 스크립트와 동일한 디렉토리에 있는 대상 스크립트의 전체 경로를 가져옵니다.
$ScriptPath = Join-Path -Path $PSScriptRoot -ChildPath $ScriptFileName

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
    Write-Host "✅ 기존 작업 삭제 완료."
}

# --- 작업 스케줄러 설정 ---
Write-Host "⚙️ Windows 작업 스케줄러에 새 작업을 등록합니다..."

# 1. 실행할 동작 정의 (Action)
# -NoProfile: 프로필 로딩 없이 빠르게 실행
# -WindowStyle Hidden: PowerShell 창을 숨긴 채 백그라운드에서 실행
# -ExecutionPolicy Bypass: 실행 정책 문제 방지
# -File: 실행할 스크립트 파일 경로
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

# 2. 트리거 정의 (Trigger) - 시스템 시작 시
$trigger = New-ScheduledTaskTrigger -AtStartup

# 3. 실행 주체 정의 (Principal) - SYSTEM 계정, 최고 권한
#   - UserId "NT AUTHORITY\SYSTEM": 시스템 부팅 시 사용자 로그인과 무관하게 실행하기 위한 가장 안정적인 계정
#   - RunLevel Highest: 관리자 권한으로 실행
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -RunLevel Highest

# 4. 추가 설정 정의 (Settings)
#   - ExecutionTimeLimit ([TimeSpan]::Zero): 작업 실행 시간 무제한
#   - DisallowStartIfOnBatteries $false / StopIfGoingOnBatteries $false: 배터리 전원으로 실행 허용
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -DisallowStartIfOnBatteries $false -StopIfGoingOnBatteries $false

# 5. 작업 등록 (Register)
try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $TaskDescription
    Write-Host "✅ 성공! '$TaskName' 작업이 시스템 시작 시 자동으로 실행되도록 등록되었습니다."
    Write-Host "   - 실행 계정: SYSTEM"
    Write-Host "   - 실행 권한: 최고 수준 (Highest)"
    Write-Host "   - 실행 시간: 무제한"
    Write-Host "   - 배터리: 전원 사용 시에도 실행"
    Write-Host "   - 대상 스크립트: $ScriptPath"
} catch {
    Write-Error "❌ 작업 등록에 실패했습니다: $($_.Exception.Message)"
    exit
}

# --- 환경 변수 설정 안내 ---
Write-Host "`n---"
Write-Host "🔔 중요: 스크립트가 정상 작동하려면 다음 '시스템 환경 변수'가 설정되어 있어야 합니다."
Write-Host "   - SLACK_WEBHOOK: Slack 알림을 받으려면 Webhook URL을 설정하세요."
Write-Host "   - 설정 방법: Windows '시스템 환경 변수 편집'에서 '시스템 변수'로 추가해야 SYSTEM 계정이 읽을 수 있습니다."

Read-Host "모든 설정이 완료되었습니다. 계속하려면 Enter 키를 누르세요..."