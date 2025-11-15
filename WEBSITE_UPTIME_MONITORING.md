# 🌐 Website Uptime & Availability Monitoring

Ensure your users can access your website 24/7 with proper uptime monitoring and availability checks.

## 🎯 What is Uptime?

**Uptime** = Percentage of time your website is accessible to users
- **Target:** 99.9% uptime (less than 43 minutes downtime per month)
- **Excellent:** 99.95% uptime (less than 22 minutes downtime per month)
- **Perfect:** 99.99% uptime (less than 4 minutes downtime per month)

## 🚀 Free Uptime Monitoring Services

### 1. **UptimeRobot** ⭐ (Recommended - Free)
**URL:** https://uptimerobot.com/

**Features:**
- ✅ 50 monitors free (forever)
- ✅ 5-minute check intervals
- ✅ Email & SMS alerts
- ✅ Status page
- ✅ Response time monitoring
- ✅ Historical data

**Setup Steps:**
1. Go to https://uptimerobot.com/
2. Sign up (free)
3. Click "Add New Monitor"
4. Monitor Type: HTTP(s)
5. Friendly Name: "CPQ Website"
6. URL: `https://zenop.ai`
7. Monitoring Interval: 5 minutes
8. Add alert contacts (email/SMS)
9. Click "Create Monitor"

**Status Page:**
- Create a public status page to show users
- Shows uptime percentage, recent incidents
- Free with UptimeRobot account

---

### 2. **Pingdom** (Free Trial)
**URL:** https://www.pingdom.com/

**Features:**
- ✅ 1 monitor free
- ✅ 1-minute intervals (paid)
- ✅ Email alerts
- ✅ Performance monitoring
- ✅ Transaction monitoring

---

### 3. **StatusCake** (Free Tier)
**URL:** https://www.statuscake.com/

**Features:**
- ✅ 10 monitors free
- ✅ 5-minute intervals
- ✅ Email alerts
- ✅ SSL monitoring
- ✅ Domain monitoring

---

### 4. **Uptime.com** (Free Tier)
**URL:** https://uptime.com/

**Features:**
- ✅ 1 monitor free
- ✅ 1-minute intervals
- ✅ Email alerts
- ✅ Status page

---

## 📊 Self-Hosted Monitoring Script

Create your own monitoring with the script below.

### PowerShell Monitoring Script

**File:** `monitor-website-uptime.ps1`

```powershell
# Website Uptime Monitor
# Checks website availability and sends alerts

param(
    [string]$WebsiteUrl = "https://zenop.ai",
    [string]$CheckInterval = 300,  # 5 minutes in seconds
    [string]$AlertEmail = "",
    [switch]$RunContinuously = $false
)

$ErrorActionPreference = "Continue"
$global:UptimeStats = @{
    TotalChecks = 0
    SuccessfulChecks = 0
    FailedChecks = 0
    StartTime = Get-Date
    LastCheck = $null
    LastStatus = $null
}

function Test-WebsiteAvailability {
    param([string]$Url)
    
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
        return @{
            Available = $true
            StatusCode = $response.StatusCode
            ResponseTime = $response.Headers['X-Response-Time']
            Timestamp = Get-Date
        }
    }
    catch {
        return @{
            Available = $false
            Error = $_.Exception.Message
            Timestamp = Get-Date
        }
    }
}

function Send-Alert {
    param(
        [string]$Subject,
        [string]$Body
    )
    
    if ($AlertEmail) {
        # Send email alert (configure SMTP settings)
        Write-Host "📧 Alert: $Subject" -ForegroundColor Yellow
        # Send-MailMessage -To $AlertEmail -Subject $Subject -Body $Body -SmtpServer "smtp.gmail.com" -Port 587
    }
    
    Write-Host "🚨 $Subject" -ForegroundColor Red
    Write-Host "   $Body" -ForegroundColor Yellow
}

function Show-Status {
    $stats = $global:UptimeStats
    $uptimePercent = if ($stats.TotalChecks -gt 0) {
        [math]::Round(($stats.SuccessfulChecks / $stats.TotalChecks) * 100, 2)
    } else { 0 }
    
    $runtime = (Get-Date) - $stats.StartTime
    
    Write-Host "`n📊 UPTIME STATISTICS" -ForegroundColor Cyan
    Write-Host "-" * 60
    Write-Host "Website: $WebsiteUrl" -ForegroundColor Gray
    Write-Host "Total Checks: $($stats.TotalChecks)" -ForegroundColor White
    Write-Host "Successful: $($stats.SuccessfulChecks) ✅" -ForegroundColor Green
    Write-Host "Failed: $($stats.FailedChecks) ❌" -ForegroundColor Red
    Write-Host "Uptime: $uptimePercent%" -ForegroundColor $(if ($uptimePercent -ge 99.9) { "Green" } else { "Yellow" })
    Write-Host "Runtime: $($runtime.Days)d $($runtime.Hours)h $($runtime.Minutes)m" -ForegroundColor Gray
    Write-Host "Last Check: $($stats.LastCheck)" -ForegroundColor Gray
    Write-Host "Last Status: $($stats.LastStatus)" -ForegroundColor $(if ($stats.LastStatus -eq "UP") { "Green" } else { "Red" })
}

# Main monitoring loop
Write-Host "🌐 Website Uptime Monitor" -ForegroundColor Cyan
Write-Host "=" * 60
Write-Host "Monitoring: $WebsiteUrl" -ForegroundColor Gray
Write-Host "Check Interval: $CheckInterval seconds`n" -ForegroundColor Gray

if ($RunContinuously) {
    Write-Host "🔄 Running continuously (Press Ctrl+C to stop)`n" -ForegroundColor Yellow
    
    while ($true) {
        $result = Test-WebsiteAvailability -Url $WebsiteUrl
        $global:UptimeStats.TotalChecks++
        $global:UptimeStats.LastCheck = Get-Date
        
        if ($result.Available) {
            $global:UptimeStats.SuccessfulChecks++
            $global:UptimeStats.LastStatus = "UP"
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✅ UP - Status: $($result.StatusCode)" -ForegroundColor Green
        } else {
            $global:UptimeStats.FailedChecks++
            $global:UptimeStats.LastStatus = "DOWN"
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ❌ DOWN - $($result.Error)" -ForegroundColor Red
            Send-Alert -Subject "Website DOWN: $WebsiteUrl" -Body "Website is not accessible. Error: $($result.Error)"
        }
        
        Show-Status
        Start-Sleep -Seconds $CheckInterval
    }
} else {
    # Single check
    $result = Test-WebsiteAvailability -Url $WebsiteUrl
    $global:UptimeStats.TotalChecks = 1
    
    if ($result.Available) {
        $global:UptimeStats.SuccessfulChecks = 1
        $global:UptimeStats.LastStatus = "UP"
        Write-Host "✅ Website is UP" -ForegroundColor Green
        Write-Host "   Status Code: $($result.StatusCode)" -ForegroundColor Gray
        Write-Host "   Response Time: $($result.ResponseTime)" -ForegroundColor Gray
    } else {
        $global:UptimeStats.FailedChecks = 1
        $global:UptimeStats.LastStatus = "DOWN"
        Write-Host "❌ Website is DOWN" -ForegroundColor Red
        Write-Host "   Error: $($result.Error)" -ForegroundColor Yellow
        Send-Alert -Subject "Website DOWN: $WebsiteUrl" -Body "Website is not accessible. Error: $($result.Error)"
    }
    
    Show-Status
}
```

---

## 🔔 Setting Up Alerts

### Email Alerts

**Option 1: Gmail SMTP**
```powershell
# Configure in monitor script
$SmtpServer = "smtp.gmail.com"
$SmtpPort = 587
$SmtpUsername = "your-email@gmail.com"
$SmtpPassword = "your-app-password"  # Use app password, not regular password
```

**Option 2: SendGrid** (Already configured in your app)
- Use SendGrid API to send alerts
- More reliable for production

### SMS Alerts

**Option 1: Twilio**
- Sign up at https://www.twilio.com/
- Get phone number
- Configure in monitoring script

**Option 2: UptimeRobot**
- Free SMS alerts (limited)
- Easy setup in dashboard

---

## 📱 Status Page for Users

### Create Public Status Page

**Option 1: UptimeRobot Status Page** (Free)
1. Go to UptimeRobot dashboard
2. Click "Status Pages"
3. Create new status page
4. Add your monitors
5. Get public URL (e.g., `https://status.zenop.ai`)

**Option 2: Custom Status Page**

Create `status.html`:
```html
<!DOCTYPE html>
<html>
<head>
    <title>zenop.ai Status</title>
    <meta http-equiv="refresh" content="60">
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .status { font-size: 48px; margin: 20px 0; }
        .up { color: #28a745; }
        .down { color: #dc3545; }
        .uptime { font-size: 24px; color: #666; }
    </style>
</head>
<body>
    <h1>zenop.ai Status</h1>
    <div id="status" class="status">Checking...</div>
    <div id="uptime" class="uptime">Uptime: Loading...</div>
    
    <script>
        fetch('https://zenop.ai/api/health')
            .then(response => response.json())
            .then(data => {
                document.getElementById('status').textContent = '✅ All Systems Operational';
                document.getElementById('status').className = 'status up';
            })
            .catch(error => {
                document.getElementById('status').textContent = '❌ Service Unavailable';
                document.getElementById('status').className = 'status down';
            });
    </script>
</body>
</html>
```

---

## 🛠️ Quick Availability Check

### Manual Check Script

**File:** `check-website-availability.ps1`

```powershell
# Quick Website Availability Check
param([string]$Url = "https://zenop.ai")

Write-Host "🌐 Checking website availability..." -ForegroundColor Cyan

try {
    $startTime = Get-Date
    $response = Invoke-WebRequest -Uri $Url -TimeoutSec 30 -UseBasicParsing
    $endTime = Get-Date
    $responseTime = ($endTime - $startTime).TotalMilliseconds
    
    Write-Host "✅ Website is UP" -ForegroundColor Green
    Write-Host "   Status Code: $($response.StatusCode)" -ForegroundColor Gray
    Write-Host "   Response Time: $([math]::Round($responseTime, 2))ms" -ForegroundColor Gray
    Write-Host "   Server: $($response.Headers['Server'])" -ForegroundColor Gray
} catch {
    Write-Host "❌ Website is DOWN" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    exit 1
}
```

---

## 📊 Monitoring Best Practices

### 1. Multiple Check Locations
- Monitor from different geographic locations
- Use services like UptimeRobot (multiple locations)

### 2. Check Multiple Endpoints
- Main website: `https://zenop.ai`
- API health: `https://zenop.ai/api/health`
- Database health: `https://zenop.ai/api/database/health`

### 3. Set Appropriate Intervals
- **Critical:** 1-2 minutes
- **Standard:** 5 minutes
- **Non-critical:** 15 minutes

### 4. Alert Thresholds
- Immediate alert on first failure
- Escalation after 5 minutes
- Critical alert after 15 minutes

### 5. Status Page
- Show users current status
- Display recent incidents
- Show uptime percentage

---

## 🚨 Incident Response

### When Website Goes Down:

1. **Immediate Actions:**
   - Check server status
   - Review application logs
   - Check database connectivity
   - Verify DNS settings

2. **Notify Users:**
   - Update status page
   - Post on social media (if applicable)
   - Send email to affected users

3. **Investigation:**
   - Check server resources (CPU, memory, disk)
   - Review recent deployments
   - Check for DDoS attacks
   - Verify SSL certificate

4. **Recovery:**
   - Restart services if needed
   - Scale resources if overloaded
   - Rollback if recent change caused issue

---

## 📈 Uptime Targets

| Service Level | Uptime % | Downtime/Month | Downtime/Year |
|--------------|----------|----------------|---------------|
| Basic | 99% | 7.2 hours | 3.6 days |
| Standard | 99.9% | 43 minutes | 8.7 hours |
| Professional | 99.95% | 22 minutes | 4.4 hours |
| Enterprise | 99.99% | 4.3 minutes | 52.6 minutes |

**Your Target:** 99.9% (Standard) or better

---

## 🔗 Quick Setup Links

**Set up monitoring now:**
1. **UptimeRobot:** https://uptimerobot.com/ (Recommended)
2. **StatusCake:** https://www.statuscake.com/
3. **Pingdom:** https://www.pingdom.com/

**Check current status:**
- Your website: https://zenop.ai
- Health check: https://zenop.ai/api/health
- Database: https://zenop.ai/api/database/health

---

## 💡 Pro Tips

1. **Use UptimeRobot** - Best free option with 50 monitors
2. **Create status page** - Keep users informed
3. **Monitor multiple endpoints** - Not just homepage
4. **Set up SMS alerts** - For critical downtime
5. **Review monthly** - Track uptime trends
6. **Document incidents** - Learn from downtime

---

**Remember:** 99.9% uptime means your website is available 99.9% of the time. That's the industry standard for production applications!






