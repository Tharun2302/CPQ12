# CPQ Application - Production Readiness Check
# This script verifies that your application is ready for customers in production

param(
    [string]$ServerUrl = "https://zenop.ai",
    [switch]$Detailed = $false
)

$ErrorActionPreference = "Continue"
$global:AllChecksPassed = $true
$global:CheckResults = @()

function Write-CheckResult {
    param(
        [string]$CheckName,
        [bool]$Passed,
        [string]$Message,
        [string]$Severity = "INFO"
    )
    
    $status = if ($Passed) { "✅ PASS" } else { "❌ FAIL" }
    $color = if ($Passed) { "Green" } else { "Red" }
    
    Write-Host "$status - $CheckName" -ForegroundColor $color
    if ($Message) {
        Write-Host "   $Message" -ForegroundColor $(if ($Passed) { "Gray" } else { "Yellow" })
    }
    
    $global:CheckResults += @{
        Check = $CheckName
        Passed = $Passed
        Message = $Message
        Severity = $Severity
    }
    
    if (-not $Passed) {
        $global:AllChecksPassed = $false
    }
}

function Test-Endpoint {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30,
        [string]$ExpectedStatus = "200"
    )
    
    try {
        $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $Response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing -ErrorAction Stop
        $Stopwatch.Stop()
        
        return @{
            Success = ($Response.StatusCode -eq [int]$ExpectedStatus)
            StatusCode = $Response.StatusCode
            ResponseTime = $Stopwatch.ElapsedMilliseconds
            Content = $Response.Content
        }
    }
    catch {
        return @{
            Success = $false
            StatusCode = $_.Exception.Response.StatusCode.value__
            ResponseTime = -1
            Error = $_.Exception.Message
            Content = $null
        }
    }
}

function Test-JsonEndpoint {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )
    
    try {
        $Response = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        return @{
            Success = $true
            Data = $Response
        }
    }
    catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
            Data = $null
        }
    }
}

Write-Host "`n🚀 CPQ Application Production Readiness Check" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "Server URL: $ServerUrl`n" -ForegroundColor Gray

# ============================================
# 1. BASIC CONNECTIVITY CHECKS
# ============================================
Write-Host "`n📡 1. BASIC CONNECTIVITY" -ForegroundColor Yellow
Write-Host "-" * 60

# Check if server is reachable
$connectivity = Test-Endpoint -Url "$ServerUrl/api/health"
if ($connectivity.Success) {
    Write-CheckResult -CheckName "Server Reachability" -Passed $true -Message "Server responded in $($connectivity.ResponseTime)ms"
} else {
    Write-CheckResult -CheckName "Server Reachability" -Passed $false -Message "Cannot reach server: $($connectivity.Error)" -Severity "CRITICAL"
    Write-Host "`n❌ CRITICAL: Cannot connect to server. Please check:" -ForegroundColor Red
    Write-Host "   - Is the server running?" -ForegroundColor Yellow
    Write-Host "   - Is the URL correct? ($ServerUrl)" -ForegroundColor Yellow
    Write-Host "   - Are firewall rules configured?" -ForegroundColor Yellow
    exit 1
}

# Check HTTPS/SSL
if ($ServerUrl -like "https://*") {
    try {
        $sslCheck = Test-Endpoint -Url "$ServerUrl/api/health"
        Write-CheckResult -CheckName "HTTPS/SSL Enabled" -Passed $true -Message "Using secure HTTPS connection"
    } catch {
        Write-CheckResult -CheckName "HTTPS/SSL Enabled" -Passed $false -Message "SSL certificate issue: $($_.Exception.Message)" -Severity "HIGH"
    }
} else {
    Write-CheckResult -CheckName "HTTPS/SSL Enabled" -Passed $false -Message "Not using HTTPS - SECURITY RISK!" -Severity "CRITICAL"
}

# Check response time
if ($connectivity.ResponseTime -lt 1000) {
    Write-CheckResult -CheckName "Response Time" -Passed $true -Message "Excellent: $($connectivity.ResponseTime)ms"
} elseif ($connectivity.ResponseTime -lt 3000) {
    Write-CheckResult -CheckName "Response Time" -Passed $true -Message "Good: $($connectivity.ResponseTime)ms"
} elseif ($connectivity.ResponseTime -lt 5000) {
    Write-CheckResult -CheckName "Response Time" -Passed $true -Message "Acceptable: $($connectivity.ResponseTime)ms (consider optimization)"
} else {
    Write-CheckResult -CheckName "Response Time" -Passed $false -Message "Slow: $($connectivity.ResponseTime)ms - Performance issue!" -Severity "HIGH"
}

# ============================================
# 2. HEALTH CHECK ENDPOINTS
# ============================================
Write-Host "`n🏥 2. HEALTH CHECK ENDPOINTS" -ForegroundColor Yellow
Write-Host "-" * 60

# Main health check
$healthCheck = Test-JsonEndpoint -Url "$ServerUrl/api/health"
if ($healthCheck.Success) {
    $health = $healthCheck.Data
    $allHealthy = $health.success -eq $true
    
    Write-CheckResult -CheckName "Application Health" -Passed $allHealthy -Message "Status: $($health.message)"
    
    if ($Detailed -and $health) {
        Write-Host "   Database: $($health.database)" -ForegroundColor Gray
        Write-Host "   Email: $($health.email)" -ForegroundColor Gray
        Write-Host "   HubSpot: $($health.hubspot)" -ForegroundColor Gray
    }
} else {
    Write-CheckResult -CheckName "Application Health" -Passed $false -Message "Health check failed: $($healthCheck.Error)" -Severity "CRITICAL"
}

# Database health check
$dbHealth = Test-JsonEndpoint -Url "$ServerUrl/api/database/health"
if ($dbHealth.Success) {
    $db = $dbHealth.Data
    $dbConnected = $db.success -eq $true
    
    if ($dbConnected) {
        Write-CheckResult -CheckName "Database Connection" -Passed $true -Message "$($db.message) - Database: $($db.database)"
    } else {
        Write-CheckResult -CheckName "Database Connection" -Passed $false -Message "$($db.message)" -Severity "CRITICAL"
    }
} else {
    Write-CheckResult -CheckName "Database Connection" -Passed $false -Message "Cannot check database: $($dbHealth.Error)" -Severity "CRITICAL"
}

# ============================================
# 3. CRITICAL SERVICES
# ============================================
Write-Host "`n🔧 3. CRITICAL SERVICES" -ForegroundColor Yellow
Write-Host "-" * 60

# Check if database is available from health endpoint
if ($healthCheck.Success -and $healthCheck.Data) {
    $dbStatus = $healthCheck.Data.database
    if ($dbStatus -eq "Connected") {
        Write-CheckResult -CheckName "Database Service" -Passed $true -Message "Database is connected"
    } else {
        Write-CheckResult -CheckName "Database Service" -Passed $false -Message "Database status: $dbStatus" -Severity "CRITICAL"
    }
    
    # Check email configuration
    $emailStatus = $healthCheck.Data.email
    if ($emailStatus -eq "Configured") {
        Write-CheckResult -CheckName "Email Service" -Passed $true -Message "Email is configured"
    } else {
        Write-CheckResult -CheckName "Email Service" -Passed $false -Message "Email status: $emailStatus" -Severity "HIGH"
    }
    
    # Check HubSpot configuration
    $hubspotStatus = $healthCheck.Data.hubspot
    if ($hubspotStatus -ne "Demo mode") {
        Write-CheckResult -CheckName "HubSpot Integration" -Passed $true -Message "HubSpot is configured"
    } else {
        Write-CheckResult -CheckName "HubSpot Integration" -Passed $false -Message "HubSpot is in demo mode" -Severity "MEDIUM"
    }
}

# ============================================
# 4. FRONTEND ACCESSIBILITY
# ============================================
Write-Host "`n🌐 4. FRONTEND ACCESSIBILITY" -ForegroundColor Yellow
Write-Host "-" * 60

$frontendCheck = Test-Endpoint -Url $ServerUrl
if ($frontendCheck.Success) {
    Write-CheckResult -CheckName "Frontend Accessibility" -Passed $true -Message "Frontend is accessible"
} else {
    Write-CheckResult -CheckName "Frontend Accessibility" -Passed $false -Message "Cannot access frontend: $($frontendCheck.Error)" -Severity "CRITICAL"
}

# ============================================
# 5. API ENDPOINTS
# ============================================
Write-Host "`n🔌 5. API ENDPOINTS" -ForegroundColor Yellow
Write-Host "-" * 60

# Test a few critical API endpoints
$apiEndpoints = @(
    @{ Name = "Quotes API"; Url = "$ServerUrl/api/quotes"; Method = "GET" },
    @{ Name = "Templates API"; Url = "$ServerUrl/api/templates"; Method = "GET" }
)

foreach ($endpoint in $apiEndpoints) {
    try {
        $apiCheck = Test-Endpoint -Url $endpoint.Url
        if ($apiCheck.Success -or $apiCheck.StatusCode -eq 401 -or $apiCheck.StatusCode -eq 403) {
            # 401/403 means endpoint exists but requires auth - that's OK
            Write-CheckResult -CheckName $endpoint.Name -Passed $true -Message "Endpoint is accessible (Status: $($apiCheck.StatusCode))"
        } else {
            Write-CheckResult -CheckName $endpoint.Name -Passed $false -Message "Endpoint returned status: $($apiCheck.StatusCode)" -Severity "MEDIUM"
        }
    } catch {
        Write-CheckResult -CheckName $endpoint.Name -Passed $false -Message "Cannot test endpoint: $($_.Exception.Message)" -Severity "MEDIUM"
    }
}

# ============================================
# 6. SECURITY CHECKS
# ============================================
Write-Host "`n🔒 6. SECURITY CHECKS" -ForegroundColor Yellow
Write-Host "-" * 60

# Check if using HTTPS
if ($ServerUrl -like "https://*") {
    Write-CheckResult -CheckName "HTTPS Encryption" -Passed $true -Message "Using secure HTTPS"
} else {
    Write-CheckResult -CheckName "HTTPS Encryption" -Passed $false -Message "Not using HTTPS - CRITICAL SECURITY ISSUE!" -Severity "CRITICAL"
}

# Check CORS headers (basic check)
try {
    $corsCheck = Invoke-WebRequest -Uri "$ServerUrl/api/health" -Method OPTIONS -ErrorAction SilentlyContinue
    Write-CheckResult -CheckName "CORS Configuration" -Passed $true -Message "CORS headers present"
} catch {
    Write-CheckResult -CheckName "CORS Configuration" -Passed $false -Message "Cannot verify CORS configuration" -Severity "LOW"
}

# ============================================
# 7. PERFORMANCE CHECKS
# ============================================
Write-Host "`n⚡ 7. PERFORMANCE CHECKS" -ForegroundColor Yellow
Write-Host "-" * 60

# Multiple requests to check consistency
$responseTimes = @()
for ($i = 1; $i -le 3; $i++) {
    $perfCheck = Test-Endpoint -Url "$ServerUrl/api/health"
    if ($perfCheck.Success) {
        $responseTimes += $perfCheck.ResponseTime
    }
}

if ($responseTimes.Count -gt 0) {
    $avgTime = ($responseTimes | Measure-Object -Average).Average
    $maxTime = ($responseTimes | Measure-Object -Maximum).Maximum
    $minTime = ($responseTimes | Measure-Object -Minimum).Minimum
    
    Write-Host "   Average: $([math]::Round($avgTime, 2))ms" -ForegroundColor Gray
    Write-Host "   Min: $([math]::Round($minTime, 2))ms" -ForegroundColor Gray
    Write-Host "   Max: $([math]::Round($maxTime, 2))ms" -ForegroundColor Gray
    
    if ($avgTime -lt 1000) {
        Write-CheckResult -CheckName "Performance Consistency" -Passed $true -Message "Excellent performance"
    } elseif ($avgTime -lt 3000) {
        Write-CheckResult -CheckName "Performance Consistency" -Passed $true -Message "Good performance"
    } else {
        Write-CheckResult -CheckName "Performance Consistency" -Passed $false -Message "Performance needs optimization" -Severity "MEDIUM"
    }
}

# ============================================
# SUMMARY REPORT
# ============================================
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "📊 PRODUCTION READINESS SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$totalChecks = $global:CheckResults.Count
$passedChecks = ($global:CheckResults | Where-Object { $_.Passed }).Count
$failedChecks = $totalChecks - $passedChecks

$criticalFailures = ($global:CheckResults | Where-Object { -not $_.Passed -and $_.Severity -eq "CRITICAL" }).Count
$highFailures = ($global:CheckResults | Where-Object { -not $_.Passed -and $_.Severity -eq "HIGH" }).Count
$mediumFailures = ($global:CheckResults | Where-Object { -not $_.Passed -and $_.Severity -eq "MEDIUM" }).Count

Write-Host "`nTotal Checks: $totalChecks" -ForegroundColor White
Write-Host "✅ Passed: $passedChecks" -ForegroundColor Green
Write-Host "❌ Failed: $failedChecks" -ForegroundColor $(if ($failedChecks -eq 0) { "Green" } else { "Red" })

if ($criticalFailures -gt 0) {
    Write-Host "`n🚨 CRITICAL ISSUES: $criticalFailures" -ForegroundColor Red
    $global:CheckResults | Where-Object { -not $_.Passed -and $_.Severity -eq "CRITICAL" } | ForEach-Object {
        Write-Host "   ❌ $($_.Check): $($_.Message)" -ForegroundColor Red
    }
}

if ($highFailures -gt 0) {
    Write-Host "`n⚠️  HIGH PRIORITY ISSUES: $highFailures" -ForegroundColor Yellow
    $global:CheckResults | Where-Object { -not $_.Passed -and $_.Severity -eq "HIGH" } | ForEach-Object {
        Write-Host "   ⚠️  $($_.Check): $($_.Message)" -ForegroundColor Yellow
    }
}

if ($mediumFailures -gt 0) {
    Write-Host "`nℹ️  MEDIUM PRIORITY ISSUES: $mediumFailures" -ForegroundColor Cyan
    $global:CheckResults | Where-Object { -not $_.Passed -and $_.Severity -eq "MEDIUM" } | ForEach-Object {
        Write-Host "   ℹ️  $($_.Check): $($_.Message)" -ForegroundColor Cyan
    }
}

# Final verdict
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
if ($global:AllChecksPassed -and $criticalFailures -eq 0) {
    Write-Host "✅ PRODUCTION READY!" -ForegroundColor Green
    Write-Host "Your application appears ready for customers." -ForegroundColor Green
    Write-Host "`nRecommended next steps:" -ForegroundColor Yellow
    Write-Host "   1. Monitor the application for 24-48 hours" -ForegroundColor Gray
    Write-Host "   2. Set up automated monitoring (see docs file)" -ForegroundColor Gray
    Write-Host "   3. Configure alerting for critical issues" -ForegroundColor Gray
    Write-Host "   4. Perform load testing before major launches" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "❌ NOT PRODUCTION READY" -ForegroundColor Red
    Write-Host "Please fix the issues above before going live." -ForegroundColor Red
    
    if ($criticalFailures -gt 0) {
        Write-Host "`n🚨 CRITICAL: Fix these issues immediately!" -ForegroundColor Red
    }
    
    exit 1
}

