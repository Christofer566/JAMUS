# =================================================================================================
# Gemini Automation Script
#
# Language: PowerShell
# Purpose: Monitors the 'triggers/' folder in GitHub and automatically sends commands to Gemini CLI.
# Author: Gemini CLI
# Version: 1.1
# Last Modified: 2025-11-17
# =================================================================================================

# --- Script Configuration ---
$RepoPath = $PSScriptRoot | Split-Path
$LogDirectory = "C:\Logs"
$LogFile = "$LogDirectory\gemini-automation.log"
$TriggersPath = "$RepoPath\triggers"
$CommandFile = "$RepoPath\gemini-command.txt"
$CheckIntervalSeconds = 60

# --- Logging and Slack Notification Functions ---
function Write-Log {
    param ([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "$Timestamp - $Level - $Message"
    
    if (-not (Test-Path $LogDirectory)) {
        New-Item -Path $LogDirectory -ItemType Directory | Out-Null
    }
    
    Add-Content -Path $LogFile -Value $LogMessage
    Write-Host $LogMessage
}

function Send-SlackNotification {
    param ([string]$Message)
    
    if (-not $env:SLACK_WEBHOOK) {
        Write-Log "Slack Webhook URL is not configured. Cannot send notification." "WARN"
        return
    }
    
    $payload = @{
        text = $Message
    } | ConvertTo-Json
    
    try {
        Invoke-RestMethod -Uri $env:SLACK_WEBHOOK -Method Post -Body $payload -ContentType 'application/json'
        Write-Log "Slack notification sent successfully: $Message"
    } catch {
        Write-Log "Failed to send Slack notification: $($_.Exception.Message)" "ERROR"
    }
}

# --- Main Logic ---
Write-Log "🚀 Starting Gemini Automation Script. Repository: $RepoPath"
Send-SlackNotification "🟢 Gemini Automation Script has started. ($((Get-Date).ToString('F')))"

while ($true) {
    try {
        Set-Location -Path $RepoPath

        # 1. Git Synchronization
        Write-Log "🔄 Starting Git synchronization..."
        git fetch origin main
        
        $gitStatus = git status --porcelain
        if ($gitStatus) {
            Write-Log "⚠️ Detected local changes. Stashing them."
            git stash | Out-Null
        }

        git pull origin main
        Write-Log "✅ Git pull completed."

        # 2. Process Trigger Files
        $triggerFiles = Get-ChildItem -Path $TriggersPath -Filter "*.json"
        
        if ($triggerFiles) {
            $processed = $false
            foreach ($file in $triggerFiles) {
                $filePath = $file.FullName
                $fileName = $file.Name
                
                # Ignore files older than 5 minutes
                $fileAgeMinutes = ((Get-Date) - $file.CreationTime).TotalMinutes
                if ($fileAgeMinutes -gt 5) {
                    Write-Log "Skipping old trigger file ($fileName). ($([int]$fileAgeMinutes) minutes old)" "WARN"
                    git rm $filePath | Out-Null
                    $processed = $true
                    continue
                }

                Write-Log "🎯 Trigger file found: $fileName"
                
                $command = ""
                switch ($fileName) {
                    "gemini-review.json"      { $command = "review" }
                    "gemini-rereview.json"    { $command = "rereview" }
                    "gemini-implement.json"   { $command = "implement" }
                    default                   { Write-Log "Unknown trigger file: $fileName" "WARN"; continue }
                }

                # 3. Communicate with Gemini (File-based)
                Write-Log "📤 Sending command to Gemini: `"$command`""
                Set-Content -Path $CommandFile -Value $command
                Send-SlackNotification "⚙️ Command sent to Gemini: `"$command`""

                # Delete the processed file
                git rm $filePath | Out-Null
                Write-Log "🗑️ Deleted processed trigger file: $fileName"
                $processed = $true
            }

            # If files were processed, commit and push
            if ($processed) {
                git commit -m "chore: Process and clean up trigger files" | Out-Null
                git push origin main | Out-Null
                Write-Log "✅ Pushed trigger processing results to GitHub."
            }

        } else {
            Write-Log "No triggers found. Waiting..."
        }

    } catch {
        $errorMessage = $_.Exception.Message
        Write-Log "🔴 A critical error occurred: $errorMessage" "ERROR"
        
        if ($errorMessage -like '*conflict*') {
            Send-SlackNotification "🔴 Git conflict detected! Manual intervention required. Automation is paused."
            # Wait for 10 minutes on conflict to avoid loop spam
            Start-Sleep -Seconds 600 
        } else {
            Send-SlackNotification "🔴 An error occurred in the automation script: $errorMessage"
        }
    }
    
    # Wait for the specified interval
    Start-Sleep -Seconds $CheckIntervalSeconds
}