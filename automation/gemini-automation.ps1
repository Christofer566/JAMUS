# =================================================================================================
# Gemini Automation Script
#
# Language: PowerShell
# Purpose: Monitors the 'triggers/' folder in GitHub and automatically sends commands to Gemini CLI.
# Author: Gemini CLI
# Version: 3.2 (Startup Delay)
# Last Modified: 2025-11-17
# Key Changes:
#   - Added a 30-second delay at the very beginning to solve potential race conditions during system startup.
# =================================================================================================

# --- PRE-STARTUP DELAY ---
# Wait for 30 seconds to ensure all system services, especially networking, are fully initialized.
# This is a common strategy to improve the reliability of tasks that run 'AtStartup'.
Start-Sleep -Seconds 30

# --- Script Configuration ---
$RepoPath = $PSScriptRoot | Split-Path
$LogDirectory = "C:\WINDOWS\Temp\GeminiAutomationLogs"
$LogFile = "$LogDirectory\gemini-automation.log"
$TriggersPath = "$RepoPath\triggers"
$CheckIntervalSeconds = 60
$EventLogSource = "GeminiAutomation"

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
        # Cannot write to log file, so we can't log this error there. Last resort is Event Viewer.
        try {
            if (-Not (Get-EventLog -LogName "Application" -Source $EventLogSource -ErrorAction SilentlyContinue)) {
                New-EventLog -LogName "Application" -Source $EventLogSource -ErrorAction Stop
            }
            $FatalLogMessage = "FATAL: Failed to write to log file '$LogFile'. Error: $($_.Exception.Message)"
            Write-EventLog -LogName "Application" -Source $EventLogSource -EventId 1001 -EntryType Error -Message $FatalLogMessage
        } catch {}
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
Write-Log "🚀 Starting Gemini Automation Script. Version 3.2 (Startup Delay). Waited 30s."

# Find required executables.
$gitPath = $null
$geminiPath = $null
try {
    Write-Log "Attempting to find 'git.exe'வுகளை..."
    $gitPath = (Get-Command git -ErrorAction Stop).Source
    Write-Log "Successfully found git.exe at: $gitPath"

    Write-Log "Attempting to find 'gemini.exe'வுகளை..."
    $geminiPath = (Get-Command gemini -ErrorAction Stop).Source
    Write-Log "Successfully found gemini.exe at: $geminiPath"
} catch {
    $ErrorMessage = "FATAL: Could not find a required command. The script will now exit. Error: $($_.Exception.ToString())"
    Write-Log $ErrorMessage "ERROR"
    Send-SlackNotification "🔴 $ErrorMessage"
    exit 1
}

Send-SlackNotification "🟢 Gemini Automation Script has started successfully. ($((Get-Date).ToString('F')))"

while ($true) {
    try {
        Write-Log "Setting working directory to '$RepoPath'."
        Set-Location -Path $RepoPath

        # Git Synchronization
        Write-Log "🔄 Starting Git synchronization..."
        & $gitPath fetch origin main
        $gitStatus = & $gitPath status --porcelain
        if ($gitStatus) {
            Write-Log "Local changes detected. Stashing them." "WARN"
            & $gitPath stash | Out-Null
        }
        & $gitPath pull origin main
        Write-Log "Git pull completed successfully."

        # Process Trigger Files
        $triggerFiles = Get-ChildItem -Path $TriggersPath -Filter "*.json"
        if ($triggerFiles) {
            $processed = $false
            Write-Log "Found $($triggerFiles.Count) trigger file(s)."
            foreach ($file in $triggerFiles) {
                $filePath = $file.FullName
                $fileName = $file.Name
                Write-Log "🎯 Processing trigger file: $fileName"
                $command = ""
                switch ($fileName) {
                    "gemini-review.json"      { $command = "review" }
                    "gemini-rereview.json"    { $command = "rereview" }
                    "gemini-implement.json"   { $command = "implement" }
                    default                   { Write-Log "Unknown trigger file '$fileName'. Skipping." "WARN"; continue }
                }

                # Execute Gemini CLI
                Write-Log "Executing Gemini CLI with command: '$command'"
                Send-SlackNotification "🚀 Executing Gemini CLI: `$command`"
                & $geminiPath "Automation Command: $command"
                $exitCode = $LASTEXITCODE
                if ($exitCode -eq 0) {
                    Write-Log "✅ Gemini CLI task completed successfully."
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
        Send-SlackNotification "🔴 An unexpected error occurred in the automation script. See logs for details. `n`n*Error Message*: $($_.Exception.Message)"
    }
    
    Write-Log "--- Loop finished, sleeping for $CheckIntervalSeconds seconds. ---"
    Start-Sleep -Seconds $CheckIntervalSeconds
}