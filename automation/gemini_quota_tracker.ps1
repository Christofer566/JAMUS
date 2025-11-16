# Load .env for secrets
$envFilePath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFilePath) {
    Get-Content $envFilePath | ForEach-Object {
        if ($_ -match "^\s*#" -or $_ -match "^\s*$") { return }
        $name, $value = $_ -split "=", 2
        if ($name -and $value) {
            [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim())
        }
    }
} else {
    Write-Error "Missing .env at $envFilePath. Create it with 'SLACK_WEBHOOK_URL=...'"
    exit 1
}

$SLACK_WEBHOOK_URL = $env:SLACK_WEBHOOK_URL
if ([string]::IsNullOrWhiteSpace($SLACK_WEBHOOK_URL)) {
    Write-Error "SLACK_WEBHOOK_URL is not set. Check automation/.env"
    exit 1
}

# =================================================================================================
# Gemini Automation Script
#
# Language: PowerShell
# Purpose: Monitors the 'triggers/' folder in GitHub and automatically sends commands to Gemini CLI.
# Author: Gemini CLI
# Version: 3.3 (Clean)
# Last Modified: 2025-11-17
# =================================================================================================

# PRE-STARTUP DELAY
Start-Sleep -Seconds 30

# Script Configuration
$RepoPath = "C:\JAMUS"
$LogDirectory = "C:\WINDOWS\Temp\GeminiAutomationLogs"
$LogFile = "$LogDirectory\gemini-automation.log"
$TriggersPath = "$RepoPath\triggers"
$CheckIntervalSeconds = 60

# Logging Function
function Write-Log {
    param ([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "$Timestamp - $Level - $Message"
    
    if (-not (Test-Path $LogDirectory)) {
        New-Item -Path $LogDirectory -ItemType Directory -Force | Out-Null
    }
    
    Add-Content -Path $LogFile -Value $LogMessage -Encoding UTF8
    Write-Host $LogMessage
}

# Slack Notification Function
function Send-SlackNotification {
    param ([string]$Message)
    
    if (-not $env:SLACK_WEBHOOK) {
        Write-Log "Slack Webhook URL not configured" "WARN"
        return
    }
    
    $payload = @{ text = $Message } | ConvertTo-Json
    
    try {
        Invoke-RestMethod -Uri $env:SLACK_WEBHOOK -Method Post -Body $payload -ContentType 'application/json' | Out-Null
        Write-Log "Slack notification sent successfully"
    }
    catch {
        Write-Log "Failed to send Slack notification: $($_.Exception.Message)" "ERROR"
    }
}

# Main Script
Write-Log "Starting Gemini Automation Script v3.3"

# Set environment variable (secured via .env)
$env:SLACK_WEBHOOK = $SLACK_WEBHOOK_URL

Send-SlackNotification "Gemini Automation Script started - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

while ($true) {
    try {
        Set-Location -Path $RepoPath
        
        # Git Synchronization
        Write-Log "Starting Git synchronization"
        
        git fetch origin main 2>&1 | Out-Null
        
        $gitStatus = git status --porcelain
        if ($gitStatus) {
            Write-Log "Local changes detected, stashing" "WARN"
            git stash 2>&1 | Out-Null
        }
        
        git pull origin main 2>&1 | Out-Null
        Write-Log "Git pull completed"
        
        # Process Trigger Files
        # 디버그: 현재 경로와 검색 결과 로깅
        Write-Log "Current directory: $(Get-Location)"
        Write-Log "Searching in: $TriggersPath"

        $triggerFiles = Get-ChildItem -Path $TriggersPath -Filter "*.json" -Recurse -ErrorAction SilentlyContinue

        Write-Log "Found $($triggerFiles.Count) file(s)"
        if ($triggerFiles) {
            foreach ($f in $triggerFiles) {
                Write-Log "  - $($f.FullName)"
            }
        }
        
        if ($triggerFiles) {
            Write-Log "Found $($triggerFiles.Count) trigger file(s)"
            
            foreach ($file in $triggerFiles) {
                $fileName = $file.Name
$folderName = $file.Directory.Name

Write-Log "Processing trigger: $fileName (folder: $folderName)"

$command = switch ($folderName) {
    "review-request"     { "review DEV_MEMO" }
    "pending-approval"   { "implement code" }
    "claude-code"        { "execute task" }
    "consensus-failed"   { "review failed" }
    default { 
        Write-Log "Unknown trigger folder: $folderName (file: $fileName)" "WARN"
        continue
    }
}
                
                # Execute Gemini CLI
                Write-Log "Executing Gemini CLI: $command"
                Send-SlackNotification "Executing Gemini CLI: $command"
                
                gemini "Automation Command: $command"
                
                $exitCode = $LASTEXITCODE
                if ($exitCode -eq 0) {
                    Write-Log "Gemini CLI completed successfully"
                }
                else {
                    Write-Log "Gemini CLI failed with exit code: $exitCode" "ERROR"
                    Send-SlackNotification "Gemini CLI failed! Exit code: $exitCode, Command: $command"
                }
                
                # Remove processed trigger
                Write-Log "Removing trigger file: $fileName"
                git rm $file.FullName 2>&1 | Out-Null
            }
            
            # Commit and push
            Write-Log "Committing trigger cleanup"
            git config --global user.name "Gemini Automation" 2>&1 | Out-Null
            git config --global user.email "automation@gemini.dev" 2>&1 | Out-Null
            git commit -m "chore: Process trigger files" 2>&1 | Out-Null
            git push origin main 2>&1 | Out-Null
            Write-Log "Pushed to GitHub"
        }
        else {
            Write-Log "No triggers found"
        }
    }
    catch {
        $errorMsg = $_.Exception.Message
        Write-Log "Error in main loop: $errorMsg" "ERROR"
        Send-SlackNotification "Automation error: $errorMsg"
    }
    
    Write-Log "Sleeping for $CheckIntervalSeconds seconds"
    Start-Sleep -Seconds $CheckIntervalSeconds
}

