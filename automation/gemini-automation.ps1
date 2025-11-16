# =================================================================================================
# Gemini Automation Script
#
# Language: PowerShell
# Purpose: Monitors the 'triggers/' folder in GitHub and automatically sends commands to Gemini CLI.
# Author: Gemini CLI
# Version: 3.0 (Final Robust Version)
# Last Modified: 2025-11-17
# Key Changes:
#   - Hardcoded log path to C:\WINDOWS\Temp to avoid environment variable issues.
#   - Dynamically finds the full path to git.exe to avoid PATH issues with the SYSTEM account.
# =================================================================================================

# --- Script Configuration ---
$RepoPath = $PSScriptRoot | Split-Path
# Hardcode the log path to a proven-working directory for the SYSTEM account.
$LogDirectory = "C:\WINDOWS\Temp\GeminiAutomationLogs"
$LogFile = "$LogDirectory\gemini-automation.log"
$TriggersPath = "$RepoPath\triggers"
$CheckIntervalSeconds = 60
$EventLogSource = "GeminiAutomation"

# --- Pre-flight Checks and Setup ---
try {
    if (-Not (Get-EventLog -LogName "Application" -Source $EventLogSource -ErrorAction SilentlyContinue)) {
        New-EventLog -LogName "Application" -Source $EventLogSource -ErrorAction Stop
    }
} catch {
    $FatalMessage = "FATAL PRE-FLIGHT CHECK FAILED: Could not create Event Log source ('$EventLogSource'). Error: $($_.Exception.Message)"
    Write-EventLog -LogName "Application" -Source "Application Error" -EventId 1000 -EntryType Error -Message $FatalMessage
    exit 2
}

# --- Logging and Slack Notification Functions ---
function Write-Log {
    param ([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "$Timestamp - $Level - $Message"
    
    try {
        if (-not (Test-Path $LogDirectory)) {
            New-Item -Path $LogDirectory -ItemType Directory -ErrorAction Stop | Out-Null
        }
        Add-Content -Path $LogFile -Value $LogMessage -Encoding UTF8 -ErrorAction Stop
        Write-Host $LogMessage
    } catch {
        $FatalLogMessage = "FATAL: Failed to write to log file '$LogFile'. Error: $($_.Exception.Message)"
        Write-EventLog -LogName "Application" -Source $EventLogSource -EventId 1001 -EntryType Error -Message $FatalLogMessage
        exit 1
    }
}

function Send-SlackNotification {
    param ([string]$Message)
    if (-not $env:SLACK_WEBHOOK) {
        Write-Log "Slack Webhook URL is not configured. Cannot send notification." "WARN"
        return
    }
    $payload = @{ text = $Message } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri $env:SLACK_WEBHOOK -Method Post -Body $payload -ContentType 'application/json' -ErrorAction Stop
        Write-Log "Slack notification sent successfully."
    } catch {
        Write-Log "Failed to send Slack notification: $($_.Exception.Message)" "ERROR"
    }
}

# --- Main Logic ---
Write-Log "🚀 Starting Gemini Automation Script. Version 3.0 (Final)."

# Dynamically find the full path to git.exe to ensure it runs under the SYSTEM account.
$gitPath = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not ($gitPath) -or (-not (Test-Path $gitPath))) {
    Write-Log "FATAL: git.exe not found. The script cannot continue. Please ensure Git is installed and accessible." "ERROR"
    Send-SlackNotification "🔴 FATAL: git.exe not found in PATH. Automation script is stopping."
    exit 1
}
Write-Log "Found git.exe at: $gitPath"

Send-SlackNotification "🟢 Gemini Automation Script has started. ($((Get-Date).ToString('F')))"

while ($true) {
    try {
        Write-Log "Setting working directory to '$RepoPath'."
        Set-Location -Path $RepoPath

        # 1. Git Synchronization (using full path to git.exe)
        Write-Log "🔄 Starting Git synchronization..."
        & $gitPath fetch origin main
        
        $gitStatus = & $gitPath status --porcelain
        if ($gitStatus) {
            Write-Log "Local changes detected. Stashing them." "WARN"
            & $gitPath stash | Out-Null
        }

        & $gitPath pull origin main
        Write-Log "Git pull completed successfully."

        # 2. Process Trigger Files
        $triggerFiles = Get-ChildItem -Path $TriggersPath -Filter "*.json"
        if ($triggerFiles) {
            $processed = $false
            Write-Log "Found $($triggerFiles.Count) trigger file(s)."
            foreach ($file in $triggerFiles) {
                $filePath = $file.FullName
                $fileName = $file.Name
                
                $fileAgeMinutes = ((Get-Date) - $file.CreationTime).TotalMinutes
                if ($fileAgeMinutes -gt 5) {
                    Write-Log "Skipping old trigger file '$fileName' ($([int]$fileAgeMinutes) minutes old)." "WARN"
                    & $gitPath rm $filePath | Out-Null
                    $processed = $true
                    continue
                }

                Write-Log "🎯 Processing trigger file: $fileName"
                $command = ""
                switch ($fileName) {
                    "gemini-review.json"      { $command = "review" }
                    "gemini-rereview.json"    { $command = "rereview" }
                    "gemini-implement.json"   { $command = "implement" }
                    default                   { Write-Log "Unknown trigger file '$fileName'. Skipping." "WARN"; continue }
                }

                # 3. Execute Gemini CLI Directly
                Write-Log "Executing Gemini CLI with command: '$command'"
                Send-SlackNotification "🚀 Executing Gemini CLI: `$command`"
                gemini "Automation Command: $command"
                $exitCode = $LASTEXITCODE
                if ($exitCode -eq 0) {
                    Write-Log "✅ Gemini CLI task completed successfully. Exit Code: $exitCode"
                    Send-SlackNotification "✅ Gemini CLI task finished successfully. Command: `$command`"
                } else {
                    Write-Log "❌ Gemini CLI task failed. Exit Code: $exitCode" "ERROR"
                    Send-SlackNotification "🔴 Gemini CLI task failed! Exit Code: `$exitCode`, Command: `$command`"
                }

                Write-Log "Removing processed trigger file from Git: $fileName"
                & $gitPath rm $filePath | Out-Null
                $processed = $true
            }

            if ($processed) {
                Write-Log "Committing and pushing trigger file cleanup..."
                # Configure git user for the commit to avoid errors
                & $gitPath config --global user.name "Gemini Automation"
                & $gitPath config --global user.email "automation@gemini.dev"
                & $gitPath commit -m "chore(triggers): Process and clean up trigger files" | Out-Null
                & $gitPath push origin main | Out-Null
                Write-Log "✅ Pushed trigger processing results to GitHub."
            }
        }
    }
    catch {
        $ErrorDetails = $_ | Format-List -Force | Out-String
        $ErrorMessage = "🔴 A critical error occurred in the main loop.`n`n$ErrorDetails"
        Write-Log $ErrorMessage "ERROR"
        if ($_.Exception.Message -like '*conflict*') {
            Send-SlackNotification "🔴 GIT CONFLICT DETECTED! Manual intervention required. Automation is paused for 10 minutes."
            Start-Sleep -Seconds 600 
        } else {
            Send-SlackNotification "🔴 An unexpected error occurred in the automation script. See logs for details. `n`n*Error Message*: $($_.Exception.Message)"
        }
    }
    
    Write-Log "--- Loop finished, sleeping for $CheckIntervalSeconds seconds. ---"
    Start-Sleep -Seconds $CheckIntervalSeconds
}