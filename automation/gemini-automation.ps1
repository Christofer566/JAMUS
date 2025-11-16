# =================================================================================================
# Gemini Automation Script
#
# Language: PowerShell
# Purpose: Monitors the 'triggers/' folder in GitHub and automatically sends commands to Gemini CLI.
# Author: Gemini CLI
# Version: 2.2 (Log to Temp Directory)
# Last Modified: 2025-11-17
# =================================================================================================

# --- Script Configuration ---
$RepoPath = $PSScriptRoot | Split-Path
# Switched to a guaranteed-writable location to avoid C:\ permissions issues.
$LogDirectory = Join-Path -Path $env:TEMP -ChildPath "GeminiAutomationLogs"
$LogFile = "$LogDirectory\gemini-automation.log"
$TriggersPath = "$RepoPath\triggers"
$CheckIntervalSeconds = 60
$EventLogSource = "GeminiAutomation"

# --- Pre-flight Checks and Setup ---
try {
    # Ensure Event Log Source exists (requires elevation, which the scheduled task has)
    if (-Not (Get-EventLog -LogName "Application" -Source $EventLogSource -ErrorAction SilentlyContinue)) {
        New-EventLog -LogName "Application" -Source $EventLogSource -ErrorAction Stop
    }
} catch {
    # This is a critical failure. We can't use our custom log source if it failed to create.
    # We will write to the event log using a generic, always-available source.
    $FatalMessage = "FATAL PRE-FLIGHT CHECK FAILED: The script could not create its own Event Log source ('$EventLogSource').`nThis usually happens due to permissions issues, even when running as SYSTEM.`nPlease try running 'setup-autostart.ps1' again as an Administrator to pre-register the source.`n`nOriginal Error: $($_.Exception.Message)"
    
    # Use a default, always-available source like 'Application Error' to report the failure.
    Write-EventLog -LogName "Application" -Source "Application Error" -EventId 1000 -EntryType Error -Message $FatalMessage
    
    # Exit with a specific error code to indicate this type of pre-flight failure.
    exit 2
}

# --- Logging and Slack Notification Functions ---
function Write-Log {
    param ([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "$Timestamp - $Level - $Message"
    
    try {
        # Ensure the directory exists before writing
        if (-not (Test-Path $LogDirectory)) {
            New-Item -Path $LogDirectory -ItemType Directory -ErrorAction Stop | Out-Null
        }
        Add-Content -Path $LogFile -Value $LogMessage -Encoding UTF8 -ErrorAction Stop
        Write-Host $LogMessage
    } catch {
        $FatalLogMessage = "FATAL: Failed to write to log file '$LogFile'. The script cannot continue.`nError: $($_.Exception.Message)"
        Write-EventLog -LogName "Application" -Source $EventLogSource -EventId 1001 -EntryType Error -Message $FatalLogMessage
        # If logging fails, we can't do much else. Exit to prevent loops.
        exit 1
    }
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
        Invoke-RestMethod -Uri $env:SLACK_WEBHOOK -Method Post -Body $payload -ContentType 'application/json' -ErrorAction Stop
        Write-Log "Slack notification sent successfully."
    } catch {
        Write-Log "Failed to send Slack notification: $($_.Exception.Message)" "ERROR"
    }
}

# --- Main Logic ---
Write-Log "🚀 Starting Gemini Automation Script. Version 2.2. Repository: $RepoPath"
Send-SlackNotification "🟢 Gemini Automation Script has started. ($((Get-Date).ToString('F')))"

while ($true) {
    try {
        Write-Log "Setting working directory to '$RepoPath'."
        Set-Location -Path $RepoPath

        # 1. Git Synchronization
        Write-Log "🔄 Starting Git synchronization..."
        git fetch origin main
        
        $gitStatus = git status --porcelain
        if ($gitStatus) {
            Write-Log "Local changes detected. Stashing them." "WARN"
            git stash | Out-Null
        }

        git pull origin main
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
                    git rm $filePath | Out-Null
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

                # Calls Gemini with a special prompt "Automation Command:".
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
                git rm $filePath | Out-Null
                $processed = $true
            }

            if ($processed) {
                Write-Log "Committing and pushing trigger file cleanup..."
                git commit -m "chore(triggers): Process and clean up trigger files" | Out-Null
                git push origin main | Out-Null
                Write-Log "✅ Pushed trigger processing results to GitHub."
            }
        } else {
            # This is a normal state, so no need to log every time.
            # Write-Log "No triggers found. Waiting..."
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
