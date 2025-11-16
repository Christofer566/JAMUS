# =================================================================================================
# JAMUS Gemini Automation Autostart Setup Script
#
# Language: PowerShell
# Purpose: Registers the gemini-automation.ps1 script with Windows Task Scheduler to run automatically on system startup.
# Author: Gemini CLI (Updated)
# Version: 2.4 (Final Basic Action Test)
# =================================================================================================

# --- Script Settings ---
$TaskName = "JAMUS-Gemini-Automation"
$TaskDescription = "Runs the JAMUS Gemini automation script at system startup with highest privileges."
$ScriptFileName = "gemini-automation.ps1"
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
# This step is critical to ensure any potentially corrupted task definition is deleted.
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Warning "Found an existing task named '$TaskName'. Deleting it completely to ensure a clean registration."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "✅ Existing task removed."
}

# --- Task Scheduler Setup ---
Write-Host "⚙️ Registering a new, simplified task in Windows Task Scheduler..."

# 1. Define the Action (Simplest possible version)
# We are removing all complexity like -WindowStyle Hidden or cmd.exe redirection for this test.
$Argument = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $Argument

# 2. Define the Trigger (At system startup)
$trigger = New-ScheduledTaskTrigger -AtStartup

# 3. Define the Principal (SYSTEM account, highest privileges)
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -RunLevel Highest

# 4. Define Additional Settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

# 5. Register the Task
try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $TaskDescription
    Write-Host "✅ Success! The task '$TaskName' has been registered with the simplest possible action."
    Write-Host "   - This is the final test to see if the Task Scheduler service can execute the task at all."
} catch {
    Write-Error "❌ Failed to register the task: $($_.Exception.Message)"
    exit
}

Read-Host "Setup is complete. Please proceed with the next testing step. Press Enter to continue..."