# Website Uptime Monitor
# Continuously monitors website availability and calculates uptime percentage

param(
    [string]$WebsiteUrl = "https://zenop.ai",
    [int]$CheckInterval = 300,  # 5 minutes in seconds
    [string]$AlertEmail = "",
    [switch]$RunContinuously = $false,
    [switch]$ShowStats = $false
)

$ErrorActionPreference = "Continue"
$global:UptimeStats = @{
    TotalChecks = 0
    SuccessfulChecks = 0
    FailedChecks = 0
    StartTime = Get-Date
    LastCheck = $null
    LastStatus = $null
    ResponseTimes = @()
    DowntimeEvents = @()
}

function Test-WebsiteAvailability {
    param([string]$Url)
    
    try {
        $startTime = Get-Date
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
        $endTime = Get-Date
        $responseTime = ($endTime - $startTime).TotalMilliseconds
        
        return @{
            Available = $true
            StatusCode = $response.StatusCode
            ResponseTime = $responseTime
            Timestamp = Get-Date
        }
    }
    catch {
        return @{
            Available = $false
            Error = $_.Exception.Message
            StatusCode = $_.Exception.Response.StatusCode.value__
            Timestamp = Get-Date
        }
    }
}

function Send-Alert {
    param(
        [string]$Subject,
        [string]$Body,
        [string]$Severity = "HIGH"
    )
    
    $color = switch ($Severity) {
        "CRITICAL" { "Red" }
        "HIGH" { "Yellow" }
        default { "Gray" }
    }
    
    Write-Host "🚨 ALERT: $Subject" -ForegroundColor $color
    Write-Host "   $Body" -ForegroundColor Yellow
    
    if ($AlertEmail) {
        # TODO: Configure email sending
        Write-Host "   📧 Email alert would be sent to: $AlertEmail" -ForegroundColor Gray
    }
}

function Show-Status {
    $stats = $global:UptimeStats
    $uptimePercent = if ($stats.TotalChecks -gt 0) {
        [math]::Round(($stats.SuccessfulChecks / $stats.TotalChecks) * 100, 2)
    } else { 0 }
    
    $runtime = (Get-Date) - $stats.StartTime
    $avgResponseTime = if ($stats.ResponseTimes.Count -gt 0) {
        [math]::Round(($stats.ResponseTimes | Measure-Object -Average).Average, 2)
    } else { 0 }
    
    Write-Host "`n📊 UPTIME STATISTICS" -ForegroundColor Cyan
    Write-Host "-" * 60
    Write-Host "Website: $WebsiteUrl" -ForegroundColor Gray
    Write-Host "Total Checks: $($stats.TotalChecks)" -ForegroundColor White
    Write-Host "Successful: $($stats.SuccessfulChecks) ✅" -ForegroundColor Green
    Write-Host "Failed: $($stats.FailedChecks) ❌" -ForegroundColor Red
    Write-Host "Uptime: $uptimePercent%" -ForegroundColor $(if ($uptimePercent -ge 99.9) { "Green" } elseif ($uptimePercent -ge 99) { "Yellow" } else { "Red" })
    Write-Host "Avg Response Time: $avgResponseTime ms" -ForegroundColor Gray
    Write-Host "Runtime: $($runtime.Days)d $($runtime.Hours)h $($runtime.Minutes)m" -ForegroundColor Gray
    Write-Host "Last Check: $($stats.LastCheck)" -ForegroundColor Gray
    Write-Host "Last Status: $($stats.LastStatus)" -ForegroundColor $(if ($stats.LastStatus -eq "UP") { "Green" } else { "Red" })
    
    if ($stats.DowntimeEvents.Count -gt 0) {
        Write-Host "`n⚠️  Downtime Events: $($stats.DowntimeEvents.Count)" -ForegroundColor Yellow
        $stats.DowntimeEvents | Select-Object -Last 5 | ForEach-Object {
            Write-Host "   - $($_.Timestamp): $($_.Error)" -ForegroundColor Gray
        }
    }
}

# Main monitoring
Write-Host "🌐 Website Uptime Monitor" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "Monitoring: $WebsiteUrl" -ForegroundColor Gray
Write-Host "Check Interval: $CheckInterval seconds ($([math]::Round($CheckInterval/60, 1)) minutes)" -ForegroundColor Gray
Write-Host ""

if ($RunContinuously) {
    Write-Host "🔄 Running continuously..." -ForegroundColor Yellow
    Write-Host "   Press Ctrl+C to stop`n" -ForegroundColor Gray
    
    $consecutiveFailures = 0
    
    while ($true) {
        $result = Test-WebsiteAvailability -Url $WebsiteUrl
        $global:UptimeStats.TotalChecks++
        $global:UptimeStats.LastCheck = Get-Date
        
        if ($result.Available) {
            $global:UptimeStats.SuccessfulChecks++
            $global:UptimeStats.LastStatus = "UP"
            $global:UptimeStats.ResponseTimes += $result.ResponseTime
            $consecutiveFailures = 0
            
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ✅ UP - Status: $($result.StatusCode) - Response: $([math]::Round($result.ResponseTime, 2))ms" -ForegroundColor Green
        } else {
            $global:UptimeStats.FailedChecks++
            $global:UptimeStats.LastStatus = "DOWN"
            $consecutiveFailures++
            
            $downtimeEvent = @{
                Timestamp = Get-Date
                Error = $result.Error
                StatusCode = $result.StatusCode
            }
            $global:UptimeStats.DowntimeEvents += $downtimeEvent
            
            Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ❌ DOWN - $($result.Error)" -ForegroundColor Red
            
            # Send alert on first failure
            if ($consecutiveFailures -eq 1) {
                Send-Alert -Subject "Website DOWN: $WebsiteUrl" -Body "Website is not accessible. Error: $($result.Error)" -Severity "CRITICAL"
            }
        }
        
        if ($ShowStats -or ($global:UptimeStats.TotalChecks % 12 -eq 0)) {
            Show-Status
        }
        
        Start-Sleep -Seconds $CheckInterval
    }
} else {
    # Single check
    Write-Host "Running single check...`n" -ForegroundColor Gray
    
    $result = Test-WebsiteAvailability -Url $WebsiteUrl
    $global:UptimeStats.TotalChecks = 1
    $global:UptimeStats.LastCheck = Get-Date
    
    if ($result.Available) {
        $global:UptimeStats.SuccessfulChecks = 1
        $global:UptimeStats.LastStatus = "UP"
        $global:UptimeStats.ResponseTimes += $result.ResponseTime
        Write-Host "✅ Website is UP" -ForegroundColor Green
        Write-Host "   Status Code: $($result.StatusCode)" -ForegroundColor Gray
        Write-Host "   Response Time: $([math]::Round($result.ResponseTime, 2))ms" -ForegroundColor Gray
    } else {
        $global:UptimeStats.FailedChecks = 1
        $global:UptimeStats.LastStatus = "DOWN"
        Write-Host "❌ Website is DOWN" -ForegroundColor Red
        Write-Host "   Error: $($result.Error)" -ForegroundColor Yellow
        Send-Alert -Subject "Website DOWN: $WebsiteUrl" -Body "Website is not accessible. Error: $($result.Error)" -Severity "CRITICAL"
    }
    
    Show-Status
}

Write-Host "`n💡 Tip: Use -RunContinuously to monitor 24/7" -ForegroundColor Cyan
Write-Host "   Example: .\monitor-website-uptime.ps1 -RunContinuously -ShowStats" -ForegroundColor Gray
Write-Host ""






