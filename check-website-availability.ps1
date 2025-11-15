# Quick Website Availability Check
# Checks if your website is accessible to users

param(
    [string]$Url = "https://zenop.ai",
    [switch]$Detailed = $false
)

$ErrorActionPreference = "Continue"

Write-Host "`n🌐 Website Availability Check" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "Checking: $Url`n" -ForegroundColor Gray

# Test main website
Write-Host "📡 Testing website availability..." -ForegroundColor Yellow

try {
    $startTime = Get-Date
    $response = Invoke-WebRequest -Uri $Url -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
    $endTime = Get-Date
    $responseTime = ($endTime - $startTime).TotalMilliseconds
    
    Write-Host "✅ Website is UP and accessible" -ForegroundColor Green
    Write-Host "   Status Code: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host "   Response Time: $([math]::Round($responseTime, 2))ms" -ForegroundColor Gray
    
    if ($Detailed) {
        Write-Host "`n📋 Detailed Information:" -ForegroundColor Yellow
        Write-Host "   Server: $($response.Headers['Server'])" -ForegroundColor Gray
        Write-Host "   Content Type: $($response.Headers['Content-Type'])" -ForegroundColor Gray
        Write-Host "   Content Length: $($response.Content.Length) bytes" -ForegroundColor Gray
        
        # Check security headers
        $securityHeaders = @('Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options', 'Content-Security-Policy')
        Write-Host "`n🔒 Security Headers:" -ForegroundColor Yellow
        foreach ($header in $securityHeaders) {
            if ($response.Headers[$header]) {
                Write-Host "   ✅ $header: Present" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  $header: Missing" -ForegroundColor Yellow
            }
        }
    }
    
    # Performance assessment
    Write-Host "`n⚡ Performance Assessment:" -ForegroundColor Yellow
    if ($responseTime -lt 500) {
        Write-Host "   ✅ Excellent response time (< 500ms)" -ForegroundColor Green
    } elseif ($responseTime -lt 1000) {
        Write-Host "   ✅ Good response time (< 1s)" -ForegroundColor Green
    } elseif ($responseTime -lt 3000) {
        Write-Host "   ⚠️  Acceptable response time (< 3s)" -ForegroundColor Yellow
    } else {
        Write-Host "   ❌ Slow response time (> 3s) - Consider optimization" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Website is DOWN or not accessible" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    
    if ($_.Exception.Response) {
        Write-Host "   HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
    
    Write-Host "`n🔍 Troubleshooting Steps:" -ForegroundColor Yellow
    Write-Host "   1. Check if server is running" -ForegroundColor Gray
    Write-Host "   2. Verify DNS settings" -ForegroundColor Gray
    Write-Host "   3. Check firewall rules" -ForegroundColor Gray
    Write-Host "   4. Review application logs" -ForegroundColor Gray
    Write-Host "   5. Check SSL certificate" -ForegroundColor Gray
    
    exit 1
}

# Test health endpoint if available
Write-Host "`n🏥 Testing health endpoint..." -ForegroundColor Yellow
try {
    $healthUrl = "$Url/api/health"
    $healthResponse = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 10 -ErrorAction Stop
    
    Write-Host "✅ Health endpoint is responding" -ForegroundColor Green
    if ($healthResponse.success) {
        Write-Host "   Status: $($healthResponse.message)" -ForegroundColor Gray
        if ($healthResponse.database) {
            Write-Host "   Database: $($healthResponse.database)" -ForegroundColor Gray
        }
        if ($healthResponse.email) {
            Write-Host "   Email: $($healthResponse.email)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "⚠️  Health endpoint not available or not responding" -ForegroundColor Yellow
    Write-Host "   (This is optional - main website is accessible)" -ForegroundColor Gray
}

# Test database health if available
Write-Host "`n💾 Testing database health endpoint..." -ForegroundColor Yellow
try {
    $dbHealthUrl = "$Url/api/database/health"
    $dbHealthResponse = Invoke-RestMethod -Uri $dbHealthUrl -TimeoutSec 10 -ErrorAction Stop
    
    if ($dbHealthResponse.success) {
        Write-Host "✅ Database is connected and healthy" -ForegroundColor Green
        Write-Host "   $($dbHealthResponse.message)" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Database health check returned: $($dbHealthResponse.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Database health endpoint not available" -ForegroundColor Yellow
    Write-Host "   (This is optional)" -ForegroundColor Gray
}

# Summary
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "📊 SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host "`n✅ Your website is accessible to users!" -ForegroundColor Green
Write-Host "`n💡 Recommendations:" -ForegroundColor Yellow
Write-Host "   1. Set up UptimeRobot for 24/7 monitoring" -ForegroundColor Gray
Write-Host "   2. Create a status page for users" -ForegroundColor Gray
Write-Host "   3. Configure email/SMS alerts for downtime" -ForegroundColor Gray
Write-Host "   4. Monitor from multiple locations" -ForegroundColor Gray

Write-Host "`n📖 For setup instructions, see: WEBSITE_UPTIME_MONITORING.md" -ForegroundColor Cyan
Write-Host ""






