# =================================================================================================
# Gemini Automation Script
#
# 언어: PowerShell
# 목적: GitHub 'triggers/' 폴더를 감시하여 Gemini CLI에 자동으로 명령을 전달합니다.
# 저자: Gemini CLI
# 버전: 1.0
# 최종 수정: 2025-11-17
# =================================================================================================

# --- 스크립트 설정 ---
$RepoPath = $PSScriptRoot | Split-Path
$LogDirectory = "C:\Logs"
$LogFile = "$LogDirectory\gemini-automation.log"
$TriggersPath = "$RepoPath\triggers"
$CommandFile = "$RepoPath\gemini-command.txt"
$CheckIntervalSeconds = 60

# --- 로깅 및 Slack 알림 함수 ---
function Write-Log {
    param ([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "$Timestamp - $Level - $Message"
    
    if (-not (Test-Path $LogDirectory)) {
        New-Item -Path $LogDirectory -ItemType Directory | Out-Null
    }
    
    Add-Content -Path $LogFile -Value $LogMessage
    # 콘솔에도 출력하여 실시간 확인 가능
    Write-Host $LogMessage
}

function Send-SlackNotification {
    param ([string]$Message)
    
    if (-not $env:SLACK_WEBHOOK) {
        Write-Log "Slack Webhook URL이 설정되지 않아 알림을 보낼 수 없습니다." "WARN"
        return
    }
    
    $payload = @{
        text = $Message
    } | ConvertTo-Json
    
    try {
        Invoke-RestMethod -Uri $env:SLACK_WEBHOOK -Method Post -Body $payload -ContentType 'application/json'
        Write-Log "Slack 알림 전송 성공: $Message"
    } catch {
        Write-Log "Slack 알림 전송 실패: $($_.Exception.Message)" "ERROR"
    }
}

# --- 메인 로직 ---
Write-Log "🚀 Gemini 자동화 스크립트를 시작합니다. 리포지토리: $RepoPath"
Send-SlackNotification "🟢 Gemini 자동화 스크립트가 시작되었습니다. ($((Get-Date).ToString('F')))"

while ($true) {
    try {
        Set-Location -Path $RepoPath

        # 1. Git 동기화
        Write-Log "🔄 Git 동기화를 시작합니다..."
        git fetch origin main
        
        $gitStatus = git status --porcelain
        if ($gitStatus) {
            Write-Log "⚠️ 로컬 변경사항을 감지하여 stash합니다."
            git stash | Out-Null
        }

        git pull origin main
        Write-Log "✅ Git pull 완료."

        # 2. Trigger 파일 처리
        $triggerFiles = Get-ChildItem -Path $TriggersPath -Filter "*.json"
        
        if ($triggerFiles) {
            $processed = $false
            foreach ($file in $triggerFiles) {
                $filePath = $file.FullName
                $fileName = $file.Name
                
                # 5분 이상된 파일은 무시
                $fileAgeMinutes = ((Get-Date) - $file.CreationTime).TotalMinutes
                if ($fileAgeMinutes -gt 5) {
                    Write-Log " 오래된 트리거 파일($fileName)을 건너뜁니다. ($([int]$fileAgeMinutes)분 경과)" "WARN"
                    git rm $filePath | Out-Null
                    $processed = $true
                    continue
                }

                Write-Log "🎯 트리거 파일 발견: $fileName"
                
                $command = ""
                switch ($fileName) {
                    "gemini-review.json"      { $command = "DEV_MEMO 검토해줘" }
                    "gemini-rereview.json"    { $command = "재검토해줘" }
                    "gemini-implement.json"   { $command = "구현 시작해줘" }
                    default                   { Write-Log "알 수 없는 트리거 파일: $fileName" "WARN"; continue }
                }

                # 3. Gemini 통신 (파일 기반)
                Write-Log "📤 Gemini에게 명령 전달: `"$command`""
                Set-Content -Path $CommandFile -Value $command
                Send-SlackNotification "⚙️ Gemini에게 명령을 전달했습니다: `"$command`""

                # 처리된 파일 삭제
                git rm $filePath | Out-Null
                Write-Log "🗑️ 처리된 트리거 파일 삭제: $fileName"
                $processed = $true
            }

            # 처리된 파일이 있으면 commit & push
            if ($processed) {
                git commit -m "chore: Process and clean up trigger files" | Out-Null
                git push origin main | Out-Null
                Write-Log "✅ 트리거 처리 내역을 GitHub에 push했습니다."
            }

        } else {
            Write-Log "발견된 트리거 없음. 대기합니다..."
        }

    } catch {
        $errorMessage = $_.Exception.Message
        Write-Log "🔴 치명적 오류 발생: $errorMessage" "ERROR"
        
        if ($errorMessage -like '*conflict*') {
            Send-SlackNotification "🔴 Git 충돌 발생! 수동 해결이 필요합니다. 자동화가 일시 중지됩니다."
            # 충돌 시에는 무한 루프를 피하기 위해 잠시 길게 대기하거나 스크립트 종료 결정 가능
            # 여기서는 10분 대기로 설정
            Start-Sleep -Seconds 600 
        } else {
            Send-SlackNotification "🔴 자동화 스크립트에 오류가 발생했습니다: $errorMessage"
        }
    }
    
    # 지정된 시간만큼 대기
    Start-Sleep -Seconds $CheckIntervalSeconds
}
