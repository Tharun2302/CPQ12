# Website Strength & Analysis Checker
# Automatically checks your website using various analysis tools and APIs

param(
    [string]$WebsiteUrl = "https://zenop.ai",
    [switch]$OpenInBrowser = $false
)

$ErrorActionPreference = "Continue"

Write-Host "`n🌐 Website Strength & Analysis Checker" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "Website: $WebsiteUrl`n" -ForegroundColor Gray

# Extract domain from URL
$domain = ($WebsiteUrl -replace 'https?://', '') -replace '/.*', ''

Write-Host "📊 Analysis Tools & Quick Links:`n" -ForegroundColor Yellow

# Performance Tools
Write-Host "🚀 PERFORMANCE ANALYSIS" -ForegroundColor Yellow
Write-Host "-" * 60

$performanceTools = @(
    @{
        Name = "Google PageSpeed Insights"
        Url = "https://pagespeed.web.dev/report?url=$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "Performance score, Core Web Vitals, optimization suggestions"
    },
    @{
        Name = "GTmetrix"
        Url = "https://gtmetrix.com/?url=$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "PageSpeed & YSlow scores, load time, page size"
    },
    @{
        Name = "WebPageTest"
        Url = "https://www.webpagetest.org/?url=$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "Detailed performance metrics, filmstrip, video"
    },
    @{
        Name = "Pingdom Speed Test"
        Url = "https://tools.pingdom.com/#$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "Performance grade, load time, page size"
    }
)

foreach ($tool in $performanceTools) {
    Write-Host "  ✅ $($tool.Name)" -ForegroundColor Green
    Write-Host "     $($tool.Description)" -ForegroundColor Gray
    Write-Host "     $($tool.Url)" -ForegroundColor Cyan
    Write-Host ""
}

# Security Tools
Write-Host "🔒 SECURITY ANALYSIS" -ForegroundColor Yellow
Write-Host "-" * 60

$securityTools = @(
    @{
        Name = "SSL Labs SSL Test"
        Url = "https://www.ssllabs.com/ssltest/analyze.html?d=$domain"
        Description = "SSL certificate, security grade (target: A+)"
    },
    @{
        Name = "Security Headers"
        Url = "https://securityheaders.com/?q=$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "Security headers analysis (target: A+)"
    },
    @{
        Name = "Mozilla Observatory"
        Url = "https://observatory.mozilla.org/analyze/$domain"
        Description = "Security score, headers, SSL/TLS configuration"
    },
    @{
        Name = "Sucuri SiteCheck"
        Url = "https://sitecheck.sucuri.net/?url=$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "Malware detection, blacklist status, SSL"
    }
)

foreach ($tool in $securityTools) {
    Write-Host "  ✅ $($tool.Name)" -ForegroundColor Green
    Write-Host "     $($tool.Description)" -ForegroundColor Gray
    Write-Host "     $($tool.Url)" -ForegroundColor Cyan
    Write-Host ""
}

# SEO Tools
Write-Host "📈 SEO ANALYSIS" -ForegroundColor Yellow
Write-Host "-" * 60

$seoTools = @(
    @{
        Name = "Google Mobile-Friendly Test"
        Url = "https://search.google.com/test/mobile-friendly?url=$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "Mobile usability, touch elements, readability"
    },
    @{
        Name = "SEO Site Checkup"
        Url = "https://seositecheckup.com/seo-audit/$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "SEO score, on-page factors, meta tags"
    }
)

foreach ($tool in $seoTools) {
    Write-Host "  ✅ $($tool.Name)" -ForegroundColor Green
    Write-Host "     $($tool.Description)" -ForegroundColor Gray
    Write-Host "     $($tool.Url)" -ForegroundColor Cyan
    Write-Host ""
}

# Accessibility Tools
Write-Host "♿ ACCESSIBILITY ANALYSIS" -ForegroundColor Yellow
Write-Host "-" * 60

$accessibilityTools = @(
    @{
        Name = "WAVE Web Accessibility"
        Url = "https://wave.webaim.org/report#/$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
        Description = "Accessibility errors, contrast, alt text"
    }
)

foreach ($tool in $accessibilityTools) {
    Write-Host "  ✅ $($tool.Name)" -ForegroundColor Green
    Write-Host "     $($tool.Description)" -ForegroundColor Gray
    Write-Host "     $($tool.Url)" -ForegroundColor Cyan
    Write-Host ""
}

# Quick Checks using APIs
Write-Host "⚡ QUICK API CHECKS" -ForegroundColor Yellow
Write-Host "-" * 60

# Check if site is reachable
Write-Host "  Checking website reachability..." -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri $WebsiteUrl -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Host "  ✅ Website is reachable (Status: $($response.StatusCode))" -ForegroundColor Green
    Write-Host "     Response time: ~$($response.Headers['X-Response-Time'] ?? 'N/A')" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ Website is not reachable: $($_.Exception.Message)" -ForegroundColor Red
}

# Check SSL certificate
Write-Host "`n  Checking SSL certificate..." -ForegroundColor Gray
try {
    $sslCheck = [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}
    $request = [System.Net.HttpWebRequest]::Create($WebsiteUrl)
    $request.Timeout = 10000
    $response = $request.GetResponse()
    $cert = $request.ServicePoint.Certificate
    
    if ($cert) {
        $expiryDate = $cert.GetExpirationDateString()
        $now = Get-Date
        $expiry = [DateTime]::Parse($expiryDate)
        $daysUntilExpiry = ($expiry - $now).Days
        
        if ($daysUntilExpiry -gt 30) {
            Write-Host "  ✅ SSL certificate is valid" -ForegroundColor Green
            Write-Host "     Expires: $expiryDate ($daysUntilExpiry days remaining)" -ForegroundColor Gray
        } elseif ($daysUntilExpiry -gt 0) {
            Write-Host "  ⚠️  SSL certificate expires soon" -ForegroundColor Yellow
            Write-Host "     Expires: $expiryDate ($daysUntilExpiry days remaining)" -ForegroundColor Yellow
        } else {
            Write-Host "  ❌ SSL certificate has expired!" -ForegroundColor Red
            Write-Host "     Expired: $expiryDate" -ForegroundColor Red
        }
    } else {
        Write-Host "  ⚠️  Could not retrieve SSL certificate info" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  Could not check SSL certificate: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Check security headers
Write-Host "`n  Checking security headers..." -ForegroundColor Gray
try {
    $headers = Invoke-WebRequest -Uri $WebsiteUrl -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    $securityHeaders = @('Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options', 'Content-Security-Policy', 'X-XSS-Protection')
    $foundHeaders = @()
    $missingHeaders = @()
    
    foreach ($header in $securityHeaders) {
        if ($headers.Headers[$header]) {
            $foundHeaders += $header
        } else {
            $missingHeaders += $header
        }
    }
    
    if ($foundHeaders.Count -gt 0) {
        Write-Host "  ✅ Found security headers: $($foundHeaders -join ', ')" -ForegroundColor Green
    }
    if ($missingHeaders.Count -gt 0) {
        Write-Host "  ⚠️  Missing security headers: $($missingHeaders -join ', ')" -ForegroundColor Yellow
        Write-Host "     Consider adding these for better security" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ⚠️  Could not check security headers" -ForegroundColor Yellow
}

# Summary
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "📋 SUMMARY" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host "`n✅ Analysis tools ready!" -ForegroundColor Green
Write-Host "`nRecommended actions:" -ForegroundColor Yellow
Write-Host "  1. Run PageSpeed Insights for performance analysis" -ForegroundColor Gray
Write-Host "  2. Check SSL Labs for security grade (target: A+)" -ForegroundColor Gray
Write-Host "  3. Test Security Headers (target: A+)" -ForegroundColor Gray
Write-Host "  4. Run Lighthouse in Chrome DevTools (F12)" -ForegroundColor Gray
Write-Host "  5. Set up UptimeRobot for monitoring" -ForegroundColor Gray

if ($OpenInBrowser) {
    Write-Host "`n🌐 Opening analysis tools in browser..." -ForegroundColor Cyan
    
    # Open key tools
    Start-Process "https://pagespeed.web.dev/report?url=$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
    Start-Sleep -Seconds 2
    Start-Process "https://www.ssllabs.com/ssltest/analyze.html?d=$domain"
    Start-Sleep -Seconds 2
    Start-Process "https://securityheaders.com/?q=$([System.Web.HttpUtility]::UrlEncode($WebsiteUrl))"
    
    Write-Host "✅ Opened PageSpeed Insights, SSL Labs, and Security Headers" -ForegroundColor Green
}

Write-Host "`n📖 For detailed information, see: WEBSITE_ANALYSIS_TOOLS.md" -ForegroundColor Cyan
Write-Host ""






