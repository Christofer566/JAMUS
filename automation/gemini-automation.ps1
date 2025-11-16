# =================================================================================================
# DIAGNOSTIC TEST SCRIPT v0.1
#
# Purpose: This is a temporary script to perform the most basic test:
# Can the SYSTEM account, via Task Scheduler, execute a PowerShell script that writes a file?
# It removes all other complexities like functions, git commands, or other logic.
# =================================================================================================

# Define a unique, simple path for this test.
$TestLogDir = "C:\WINDOWS\Temp\GeminiDiagnostics"
$TestLogFile = "$TestLogDir\diagnostic-log.txt"

try {
    # Step 1: Create the directory if it doesn't exist.
    if (-not (Test-Path $TestLogDir)) {
        New-Item -Path $TestLogDir -ItemType Directory -ErrorAction Stop
    }
    
    # Step 2: Try to write a single line to the log file.
    $Timestamp = Get-Date -Format "O"
    $LogMessage = "$Timestamp - SUCCESS: The diagnostic script ran and was able to write to this file."
    
    Add-Content -Path $TestLogFile -Value $LogMessage -Encoding UTF8 -ErrorAction Stop

} catch {
    # Step 3: If ANY of the above fails, write a detailed error to the generic Windows Event Log.
    $FatalMessage = "FATAL DIAGNOSTIC FAILURE: The simplest test script could not write a file.`nThis points to a fundamental environment or permissions issue with Task Scheduler running PowerShell scripts.`n`nPath: '$TestLogFile'`nError: $($_.Exception.ToString())"
    
    # Use a default, always-available source 'Application Error' to guarantee the error is logged.
    Write-EventLog -LogName "Application" -Source "Application Error" -EventId 9999 -EntryType Error -Message $FatalMessage
    
    # Exit with a specific code for this failure.
    exit 3
}

# If the script reaches this point, the try block succeeded. Exit with 0.
exit 0