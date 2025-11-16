# =================================================================================================
# Gemini Automation Script
#
# ?몄뼱: PowerShell
# 紐⑹쟻: GitHub 'triggers/' ?대뜑瑜?媛먯떆?섏뿬 Gemini CLI???먮룞?쇰줈 紐낅졊???꾨떖?⑸땲??
# ??? Gemini CLI
# 踰꾩쟾: 1.0
# 理쒖쥌 ?섏젙: 2025-11-17
# =================================================================================================

# --- ?ㅽ겕由쏀듃 ?ㅼ젙 ---
$RepoPath = $PSScriptRoot | Split-Path
$LogDirectory = "C:\Logs"
$LogFile = "$LogDirectory\gemini-automation.log"
$TriggersPath = "$RepoPath\triggers"
$CommandFile = "$RepoPath\gemini-command.txt"
$CheckIntervalSeconds = 60

# --- 濡쒓퉭 諛?Slack ?뚮┝ ?⑥닔 ---
function Write-Log {
    param ([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "$Timestamp - $Level - $Message"
    
    if (-not (Test-Path $LogDirectory)) {
        New-Item -Path $LogDirectory -ItemType Directory | Out-Null
    }
    
    Add-Content -Path $LogFile -Value $LogMessage
    # 肄섏넄?먮룄 異쒕젰?섏뿬 ?ㅼ떆媛??뺤씤 媛??    Write-Host $LogMessage
}

function Send-SlackNotification {
    param ([string]$Message)
    
    if (-not $env:SLACK_WEBHOOK) {
        Write-Log "Slack Webhook URL???ㅼ젙?섏? ?딆븘 ?뚮┝??蹂대궪 ???놁뒿?덈떎." "WARN"
        return
    }
    
    $payload = @{
        text = $Message
    } | ConvertTo-Json
    
    try {
        Invoke-RestMethod -Uri $env:SLACK_WEBHOOK -Method Post -Body $payload -ContentType 'application/json'
        Write-Log "Slack ?뚮┝ ?꾩넚 ?깃났: $Message"
    } catch {
        Write-Log "Slack ?뚮┝ ?꾩넚 ?ㅽ뙣: $($_.Exception.Message)" "ERROR"
    }
}

# --- 硫붿씤 濡쒖쭅 ---
Write-Log "?? Gemini ?먮룞???ㅽ겕由쏀듃瑜??쒖옉?⑸땲?? 由ы룷吏?좊━: $RepoPath"
Send-SlackNotification "?윟 Gemini ?먮룞???ㅽ겕由쏀듃媛 ?쒖옉?섏뿀?듬땲?? ($((Get-Date).ToString('F')))"

while ($true) {
    try {
        Set-Location -Path $RepoPath

        # 1. Git ?숆린??        Write-Log "?봽 Git ?숆린?붾? ?쒖옉?⑸땲??.."
        git fetch origin main
        
        $gitStatus = git status --porcelain
        if ($gitStatus) {
            Write-Log "?좑툘 濡쒖뺄 蹂寃쎌궗??쓣 媛먯??섏뿬 stash?⑸땲??"
            git stash | Out-Null
        }

        git pull origin main
        Write-Log "??Git pull ?꾨즺."

        # 2. Trigger ?뚯씪 泥섎━
        $triggerFiles = Get-ChildItem -Path $TriggersPath -Filter "*.json"
        
        if ($triggerFiles) {
            $processed = $false
            foreach ($file in $triggerFiles) {
                $filePath = $file.FullName
                $fileName = $file.Name
                
                # 5遺??댁긽???뚯씪? 臾댁떆
                $fileAgeMinutes = ((Get-Date) - $file.CreationTime).TotalMinutes
                if ($fileAgeMinutes -gt 5) {
                    Write-Log " ?ㅻ옒???몃━嫄??뚯씪($fileName)??嫄대꼫?곷땲?? ($([int]$fileAgeMinutes)遺?寃쎄낵)" "WARN"
                    git rm $filePath | Out-Null
                    $processed = $true
                    continue
                }

                Write-Log "?렞 ?몃━嫄??뚯씪 諛쒓껄: $fileName"
                
                $command = ""
                switch ($fileName) {
                    "gemini-review.json"      { $command = "DEV_MEMO 寃?좏빐以? }
                    "gemini-rereview.json"    { $command = "?ш??좏빐以? }
                    "gemini-implement.json"   { $command = "援ы쁽 ?쒖옉?댁쨾" }
                    default                   { Write-Log "?????녿뒗 ?몃━嫄??뚯씪: $fileName" "WARN"; continue }
                }

                # 3. Gemini ?듭떊 (?뚯씪 湲곕컲)
                Write-Log "?뱾 Gemini?먭쾶 紐낅졊 ?꾨떖: `"$command`""
                Set-Content -Path $CommandFile -Value $command
                Send-SlackNotification "?숋툘 Gemini?먭쾶 紐낅졊???꾨떖?덉뒿?덈떎: `"$command`""

                # 泥섎━???뚯씪 ??젣
                git rm $filePath | Out-Null
                Write-Log "?뿊截?泥섎━???몃━嫄??뚯씪 ??젣: $fileName"
                $processed = $true
            }

            # 泥섎━???뚯씪???덉쑝硫?commit & push
            if ($processed) {
                git commit -m "chore: Process and clean up trigger files" | Out-Null
                git push origin main | Out-Null
                Write-Log "???몃━嫄?泥섎━ ?댁뿭??GitHub??push?덉뒿?덈떎."
            }

        } else {
            Write-Log "諛쒓껄???몃━嫄??놁쓬. ?湲고빀?덈떎..."
        }

    } catch {
        $errorMessage = $_.Exception.Message
        Write-Log "?뵶 移섎챸???ㅻ쪟 諛쒖깮: $errorMessage" "ERROR"
        
        if ($errorMessage -like '*conflict*') {
            Send-SlackNotification "?뵶 Git 異⑸룎 諛쒖깮! ?섎룞 ?닿껐???꾩슂?⑸땲?? ?먮룞?붽? ?쇱떆 以묒??⑸땲??"
            # 異⑸룎 ?쒖뿉??臾댄븳 猷⑦봽瑜??쇳븯湲??꾪빐 ?좎떆 湲멸쾶 ?湲고븯嫄곕굹 ?ㅽ겕由쏀듃 醫낅즺 寃곗젙 媛??            # ?ш린?쒕뒗 10遺??湲곕줈 ?ㅼ젙
            Start-Sleep -Seconds 600 
        } else {
            Send-SlackNotification "?뵶 ?먮룞???ㅽ겕由쏀듃???ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: $errorMessage"
        }
    }
    
    # 吏?뺣맂 ?쒓컙留뚰겮 ?湲?    Start-Sleep -Seconds $CheckIntervalSeconds
}

