# =================================================================================================
# JAMUS Gemini Automation Autostart Setup Script
#
# Language: PowerShell
# Purpose: Registers the gemini-automation.ps1 script with Windows Task Scheduler to run automatically on system startup.
# Author: Gemini CLI (Updated)
# Version: 2.3 (Added Process Output Redirection for Debugging)
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
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Warning "Found an existing task named '$TaskName'. Removing it to re-register."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "✅ Existing task removed."
}

# --- Task Scheduler Setup ---
Write-Host "⚙️ Registering a new task in Windows Task Scheduler..."

# 1. Define the Action with Output Redirection for Debugging
# This uses cmd.exe to launch PowerShell and redirect all output (stdout and stderr) to a log file.
# This is the ultimate 'black box recorder' to see what powershell.exe itself is doing.
$OutputLog = Join-Path -Path $env:SystemRoot -ChildPath "Temp\GeminiDiagnostics\powershell-output.log"
$PowerShellCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
$Argument = "/c `"$PowerShellCommand > `"$OutputLog`" 2>&1`""

Write-Host "Task action will be: cmd.exe $Argument"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $Argument

# 2. Define the Trigger (At system startup)
$trigger = New-ScheduledTaskTrigger -AtStartup

# 3. Define the Principal (SYSTEM account, highest privileges)
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -RunLevel Highest

# 4. Define Additional Settings
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
    Write-Host "✅ Success! The task '$TaskName' has been registered."
    Write-Host "   - The PowerShell process output will now be logged to: $OutputLog"
} catch {
    Write-Error "❌ Failed to register the task: $($_.Exception.Message)"
    exit
}

Read-Host "Setup is complete. Press Enter to continue..."
