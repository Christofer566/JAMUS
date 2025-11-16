# =================================================================================================
# JAMUS Gemini Automation Autostart Setup Script
#
# Language: PowerShell
# Purpose: Registers the gemini-automation.ps1 script with Windows Task Scheduler to run automatically on system startup.
# Key Changes (v2.2):
#   - Corrected New-ScheduledTaskSettingsSet parameters for better PowerShell compatibility.
#   - Added reliability settings: task restart on failure and start-when-available.
# Execution: Must be run with Administrator privileges.
# Author: Gemini CLI (Updated)
# Version: 2.2
# =================================================================================================

# --- Script Settings ---
$TaskName = "JAMUS-Gemini-Automation"
$TaskDescription = "Runs the JAMUS Gemini automation script at system startup with highest privileges."
$ScriptFileName = "gemini-automation.ps1"
# Get the full path of the target script, which is in the same directory as this script.
$ScriptPath = Join-Path -Path $PSScriptRoot -ChildPath $ScriptFileName

# --- Administrator Check ---
if (-Not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "This script must be run with Administrator privileges."
    Write-Warning "Please re-run this script in a PowerShell session opened with 'Run as Administrator'."
    Read-Host "Press Enter to exit..."
    exit
}

Write-Host "✅ Administrator privileges confirmed."

# --- Check and Remove Existing Task ---
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Warning "Found an existing task named '$TaskName'. Removing it to re-register."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "✅ Existing task removed."
}

# --- Task Scheduler Setup ---
Write-Host "⚙️ Registering a new task in Windows Task Scheduler..."

# 1. Define the Action
# -NoProfile: Skips loading profiles for faster execution.
# -WindowStyle Hidden: Hides the PowerShell window to run in the background.
# -ExecutionPolicy Bypass: Avoids execution policy issues.
# -File: The path to the script file to execute.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

# 2. Define the Trigger (At system startup)
$trigger = New-ScheduledTaskTrigger -AtStartup

# 3. Define the Principal (SYSTEM account, highest privileges)
#   - UserId "NT AUTHORITY\SYSTEM": The most reliable account for running tasks at boot, independent of user login.
#   - RunLevel Highest: Ensures the task runs with administrative rights.
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -RunLevel Highest

# 4. Define Additional Settings
#   - ExecutionTimeLimit ([TimeSpan]::Zero): Unlimited execution time.
#   - AllowStartIfOnBatteries / DontStopIfGoingOnBatteries: Allows the task to start and run on battery power.
#   - StartWhenAvailable: Runs the task as soon as possible after a scheduled start is missed.
#   - RestartCount/RestartInterval: Attempts to restart the task up to 3 times every 1 minute if it fails.
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# 5. Register the Task
try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $TaskDescription
    Write-Host "✅ Success! The task '$TaskName' has been registered to run automatically at system startup."
    Write-Host "   - Run As: SYSTEM"
    Write-Host "   - Privileges: Highest"
    Write-Host "   - Reliability: Restarts on failure, runs if missed."
    Write-Host "   - On Battery: Allowed to run"
    Write-Host "   - Target Script: $ScriptPath"
} catch {
    Write-Error "❌ Failed to register the task: $($_.Exception.Message)"
    exit
}

# --- Environment Variable Reminder ---
Write-Host "`n---"
Write-Host "🔔 Important: For the script to function correctly, the following 'System Environment Variables' must be set."
Write-Host "   - SLACK_WEBHOOK: Set your Webhook URL to receive Slack notifications."
Write-Host "   - How to set: You must add this as a 'System variable' (not a 'User variable') via 'Edit the system environment variables' for the SYSTEM account to read it."

Read-Host "Setup is complete. Press Enter to continue..."