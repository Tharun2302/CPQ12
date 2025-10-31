# 🚨 CPQ12 Server Alerting & Notification Setup Guide

## 📋 Overview
This guide helps you set up comprehensive alerting and notification systems for your CPQ12 server to ensure you're immediately notified of any issues.

## 🔔 Alert Types & Severity Levels

### Severity Levels
- **CRITICAL**: Server down, database unavailable, security breach
- **HIGH**: Service degradation, API failures, authentication issues
- **MEDIUM**: Performance issues, slow response times, resource warnings
- **LOW**: Informational alerts, maintenance notifications

### Alert Categories
1. **Health Checks**: Server, database, LibreOffice status
2. **Performance**: Response times, resource usage, errors
3. **Security**: Authentication failures, suspicious activity
4. **Business**: Quote generation failures, email delivery issues

## 📧 Email Alerting Setup

### Option 1: Gmail SMTP (Recommended)

#### 1.1 Enable App Passwords
1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Security → 2-Step Verification (enable if not already)
3. Security → App passwords
4. Generate app password for "Mail"

#### 1.2 Configure Email Alerts
Create `email-config.ps1`:

```powershell
# Email Configuration for CPQ Monitoring
$EmailConfig = @{
    SmtpServer = "smtp.gmail.com"
    Port = 587
    Username = "your-email@gmail.com"
    Password = "your-app-password"  # Use app password, not regular password
    From = "your-email@gmail.com"
    To = @("admin@yourcompany.com", "devops@yourcompany.com")
    UseSSL = $true
}

# Send alert function
function Send-EmailAlert {
    param(
        [string]$Subject,
        [string]$Body,
        [string]$Severity = "MEDIUM"
    )
    
    $Color = switch ($Severity) {
        "CRITICAL" { "Red" }
        "HIGH" { "Orange" }
        "MEDIUM" { "Yellow" }
        "LOW" { "Green" }
    }
    
    $HtmlBody = @"
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .header { background-color: $Color; color: white; padding: 10px; }
        .content { padding: 20px; }
        .footer { background-color: #f0f0f0; padding: 10px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h2>🚨 CPQ Server Alert - $Severity</h2>
    </div>
    <div class="content">
        $Body
    </div>
    <div class="footer">
        <p>Time: $(Get-Date)</p>
        <p>Server: $env:COMPUTERNAME</p>
    </div>
</body>
</html>
"@
    
    try {
        Send-MailMessage -To $EmailConfig.To -Subject $Subject -Body $HtmlBody -BodyAsHtml -SmtpServer $EmailConfig.SmtpServer -Port $EmailConfig.Port -UseSsl -Credential (New-Object System.Management.Automation.PSCredential($EmailConfig.Username, (ConvertTo-SecureString $EmailConfig.Password -AsPlainText -Force)))
        Write-Host "✅ Email alert sent successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Failed to send email alert: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

### Option 2: SendGrid (Professional)

#### 2.1 Setup SendGrid Account
1. Go to [SendGrid](https://sendgrid.com/)
2. Create account and verify email
3. Generate API key in Settings → API Keys

#### 2.2 Configure SendGrid Alerts
```powershell
# SendGrid Configuration
$SendGridConfig = @{
    ApiKey = "your-sendgrid-api-key"
    FromEmail = "alerts@yourcompany.com"
    FromName = "CPQ Monitoring"
    ToEmails = @("admin@yourcompany.com", "devops@yourcompany.com")
}

function Send-SendGridAlert {
    param(
        [string]$Subject,
        [string]$Body,
        [string]$Severity = "MEDIUM"
    )
    
    $Headers = @{
        "Authorization" = "Bearer $($SendGridConfig.ApiKey)"
        "Content-Type" = "application/json"
    }
    
    $BodyJson = @{
        personalizations = @(
            @{
                to = $SendGridConfig.ToEmails | ForEach-Object { @{ email = $_ } }
                subject = $Subject
            }
        )
        from = @{
            email = $SendGridConfig.FromEmail
            name = $SendGridConfig.FromName
        }
        content = @(
            @{
                type = "text/html"
                value = $Body
            }
        )
    } | ConvertTo-Json -Depth 10
    
    try {
        Invoke-RestMethod -Uri "https://api.sendgrid.com/v3/mail/send" -Method Post -Headers $Headers -Body $BodyJson
        Write-Host "✅ SendGrid alert sent successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Failed to send SendGrid alert: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

## 📱 Slack Integration

### 1. Create Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name: "CPQ Monitoring"
4. Select your workspace

### 2. Configure Webhook
1. Go to "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" to On
3. Click "Add New Webhook to Workspace"
4. Select channel (e.g., #alerts)
5. Copy webhook URL

### 3. Setup Slack Alerts
```powershell
# Slack Configuration
$SlackConfig = @{
    WebhookUrl = "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
    Channel = "#alerts"
    Username = "CPQ Monitor"
    IconEmoji = ":robot_face:"
}

function Send-SlackAlert {
    param(
        [string]$Message,
        [string]$Severity = "MEDIUM",
        [string]$Service = "CPQ Server"
    )
    
    $Color = switch ($Severity) {
        "CRITICAL" { "danger" }
        "HIGH" { "warning" }
        "MEDIUM" { "good" }
        "LOW" { "#36a64f" }
    }
    
    $Emoji = switch ($Severity) {
        "CRITICAL" { "🚨" }
        "HIGH" { "⚠️" }
        "MEDIUM" { "ℹ️" }
        "LOW" { "✅" }
    }
    
    $Payload = @{
        channel = $SlackConfig.Channel
        username = $SlackConfig.Username
        icon_emoji = $SlackConfig.IconEmoji
        attachments = @(
            @{
                color = $Color
                title = "$Emoji $Service Alert - $Severity"
                text = $Message
                fields = @(
                    @{
                        title = "Time"
                        value = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                        short = $true
                    }
                    @{
                        title = "Server"
                        value = $env:COMPUTERNAME
                        short = $true
                    }
                )
                footer = "CPQ Monitoring System"
                ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            }
        )
    } | ConvertTo-Json -Depth 10
    
    try {
        Invoke-RestMethod -Uri $SlackConfig.WebhookUrl -Method Post -Body $Payload -ContentType "application/json"
        Write-Host "✅ Slack alert sent successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Failed to send Slack alert: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

## 📞 SMS Alerts (Critical Issues)

### Option 1: Twilio
1. Sign up at [Twilio](https://www.twilio.com/)
2. Get Account SID and Auth Token
3. Purchase phone number

```powershell
# Twilio Configuration
$TwilioConfig = @{
    AccountSid = "your-account-sid"
    AuthToken = "your-auth-token"
    FromNumber = "+1234567890"
    ToNumbers = @("+0987654321", "+1122334455")
}

function Send-SMSAlert {
    param(
        [string]$Message,
        [string]$Severity = "CRITICAL"
    )
    
    if ($Severity -ne "CRITICAL") {
        Write-Host "SMS alerts only sent for CRITICAL issues" -ForegroundColor Yellow
        return
    }
    
    $AuthString = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($TwilioConfig.AccountSid):$($TwilioConfig.AuthToken)"))
    $Headers = @{
        "Authorization" = "Basic $AuthString"
        "Content-Type" = "application/x-www-form-urlencoded"
    }
    
    foreach ($ToNumber in $TwilioConfig.ToNumbers) {
        $Body = "From=$($TwilioConfig.FromNumber)&To=$ToNumber&Body=$Message"
        
        try {
            Invoke-RestMethod -Uri "https://api.twilio.com/2010-04-01/Accounts/$($TwilioConfig.AccountSid)/Messages.json" -Method Post -Headers $Headers -Body $Body
            Write-Host "✅ SMS sent to $ToNumber" -ForegroundColor Green
        }
        catch {
            Write-Host "❌ Failed to send SMS to $ToNumber : $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}
```

## 🔔 Microsoft Teams Integration

### 1. Create Teams Webhook
1. Go to your Teams channel
2. Click "..." → "Connectors"
3. Find "Incoming Webhook" → Configure
4. Name: "CPQ Monitoring"
5. Copy webhook URL

### 2. Setup Teams Alerts
```powershell
# Teams Configuration
$TeamsConfig = @{
    WebhookUrl = "https://your-org.webhook.office.com/webhookb2/your-webhook-url"
}

function Send-TeamsAlert {
    param(
        [string]$Message,
        [string]$Severity = "MEDIUM",
        [string]$Service = "CPQ Server"
    )
    
    $Color = switch ($Severity) {
        "CRITICAL" { "FF0000" }
        "HIGH" { "FFA500" }
        "MEDIUM" { "FFFF00" }
        "LOW" { "00FF00" }
    }
    
    $Emoji = switch ($Severity) {
        "CRITICAL" { "🚨" }
        "HIGH" { "⚠️" }
        "MEDIUM" { "ℹ️" }
        "LOW" { "✅" }
    }
    
    $Payload = @{
        "@type" = "MessageCard"
        "@context" = "http://schema.org/extensions"
        themeColor = $Color
        summary = "$Service Alert - $Severity"
        sections = @(
            @{
                activityTitle = "$Emoji $Service Alert - $Severity"
                activitySubtitle = "CPQ Monitoring System"
                activityImage = "https://via.placeholder.com/64x64/FF0000/FFFFFF?text=CPQ"
                facts = @(
                    @{
                        name = "Time"
                        value = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                    }
                    @{
                        name = "Server"
                        value = $env:COMPUTERNAME
                    }
                    @{
                        name = "Severity"
                        value = $Severity
                    }
                )
                text = $Message
            }
        )
    } | ConvertTo-Json -Depth 10
    
    try {
        Invoke-RestMethod -Uri $TeamsConfig.WebhookUrl -Method Post -Body $Payload -ContentType "application/json"
        Write-Host "✅ Teams alert sent successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Failed to send Teams alert: $($_.Exception.Message)" -ForegroundColor Red
    }
}
```

## 🎯 Alert Rules & Thresholds

### Health Check Alerts
```powershell
# Health check monitoring with alerts
function Monitor-HealthChecks {
    $ServerUrl = "https://your-app-name.onrender.com"
    
    # Main health check
    try {
        $Response = Invoke-RestMethod -Uri "$ServerUrl/api/health" -TimeoutSec 30
        if ($Response.status -ne "ok") {
            Send-EmailAlert -Subject "CPQ Server Health Check Failed" -Body "Server status: $($Response.status)" -Severity "CRITICAL"
            Send-SlackAlert -Message "Server health check failed: $($Response.status)" -Severity "CRITICAL"
        }
    }
    catch {
        Send-EmailAlert -Subject "CPQ Server Unreachable" -Body "Cannot connect to server: $($_.Exception.Message)" -Severity "CRITICAL"
        Send-SlackAlert -Message "Server is unreachable: $($_.Exception.Message)" -Severity "CRITICAL"
        Send-SMSAlert -Message "CPQ Server is DOWN! Check immediately." -Severity "CRITICAL"
    }
    
    # Database health check
    try {
        $Response = Invoke-RestMethod -Uri "$ServerUrl/api/database/health" -TimeoutSec 30
        if ($Response.status -ne "connected") {
            Send-EmailAlert -Subject "CPQ Database Connection Failed" -Body "Database status: $($Response.status)" -Severity "HIGH"
            Send-SlackAlert -Message "Database connection failed: $($Response.status)" -Severity "HIGH"
        }
    }
    catch {
        Send-EmailAlert -Subject "CPQ Database Unreachable" -Body "Cannot connect to database: $($_.Exception.Message)" -Severity "HIGH"
        Send-SlackAlert -Message "Database is unreachable: $($_.Exception.Message)" -Severity "HIGH"
    }
}
```

### Performance Alerts
```powershell
# Performance monitoring with alerts
function Monitor-Performance {
    $ServerUrl = "https://your-app-name.onrender.com"
    
    # Check response time
    $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Invoke-RestMethod -Uri "$ServerUrl/api/health" -TimeoutSec 30 | Out-Null
        $Stopwatch.Stop()
        $ResponseTime = $Stopwatch.ElapsedMilliseconds
        
        if ($ResponseTime -gt 10000) {  # 10 seconds
            Send-EmailAlert -Subject "CPQ Server Slow Response" -Body "Response time: ${ResponseTime}ms" -Severity "HIGH"
            Send-SlackAlert -Message "Server response time is very slow: ${ResponseTime}ms" -Severity "HIGH"
        }
        elseif ($ResponseTime -gt 5000) {  # 5 seconds
            Send-EmailAlert -Subject "CPQ Server Performance Warning" -Body "Response time: ${ResponseTime}ms" -Severity "MEDIUM"
            Send-SlackAlert -Message "Server response time is slow: ${ResponseTime}ms" -Severity "MEDIUM"
        }
    }
    catch {
        Send-EmailAlert -Subject "CPQ Server Performance Check Failed" -Body "Cannot measure response time: $($_.Exception.Message)" -Severity "HIGH"
    }
    
    # Check disk space
    $Disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
    $DiskUsage = [math]::Round((($Disk.Size - $Disk.FreeSpace) / $Disk.Size) * 100, 2)
    
    if ($DiskUsage -gt 95) {
        Send-EmailAlert -Subject "CPQ Server Disk Space Critical" -Body "Disk usage: ${DiskUsage}%" -Severity "CRITICAL"
        Send-SlackAlert -Message "Disk space is critically low: ${DiskUsage}%" -Severity "CRITICAL"
        Send-SMSAlert -Message "CPQ Server disk space critical: ${DiskUsage}%" -Severity "CRITICAL"
    }
    elseif ($DiskUsage -gt 85) {
        Send-EmailAlert -Subject "CPQ Server Disk Space Warning" -Body "Disk usage: ${DiskUsage}%" -Severity "HIGH"
        Send-SlackAlert -Message "Disk space is getting low: ${DiskUsage}%" -Severity "HIGH"
    }
}
```

## ⏰ Scheduled Monitoring

### Windows Task Scheduler Setup
1. Open Task Scheduler
2. Create Basic Task
3. Name: "CPQ Health Monitoring"
4. Trigger: Every 5 minutes
5. Action: Start a program
6. Program: `powershell.exe`
7. Arguments: `-File "C:\path\to\monitor-cpq.ps1"`

### PowerShell Scheduled Job
```powershell
# Create scheduled job for monitoring
$Trigger = New-JobTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365)
$Job = Register-ScheduledJob -Name "CPQ Health Monitoring" -ScriptBlock {
    & "C:\path\to\monitor-cpq.ps1"
} -Trigger $Trigger

# Create scheduled job for database cleanup (weekly)
$WeeklyTrigger = New-JobTrigger -Weekly -DaysOfWeek Sunday -At 2AM
$CleanupJob = Register-ScheduledJob -Name "CPQ Database Cleanup" -ScriptBlock {
    & "C:\path\to\database-cleanup.ps1"
} -Trigger $WeeklyTrigger
```

## 📊 Alert Dashboard

### Create Simple Web Dashboard
```html
<!DOCTYPE html>
<html>
<head>
    <title>CPQ Server Monitoring Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
        .healthy { background-color: #d4edda; color: #155724; }
        .warning { background-color: #fff3cd; color: #856404; }
        .error { background-color: #f8d7da; color: #721c24; }
        .refresh { margin: 20px 0; }
    </style>
</head>
<body>
    <h1>CPQ Server Monitoring Dashboard</h1>
    <div class="refresh">
        <button onclick="refreshStatus()">Refresh Status</button>
        <span id="lastUpdate"></span>
    </div>
    
    <div id="serverStatus" class="status">Checking...</div>
    <div id="databaseStatus" class="status">Checking...</div>
    <div id="libreofficeStatus" class="status">Checking...</div>
    
    <script>
        function refreshStatus() {
            document.getElementById('lastUpdate').textContent = 'Last updated: ' + new Date().toLocaleString();
            
            // Check server health
            fetch('https://your-app-name.onrender.com/api/health')
                .then(response => response.json())
                .then(data => {
                    const div = document.getElementById('serverStatus');
                    if (data.status === 'ok') {
                        div.className = 'status healthy';
                        div.textContent = '✅ Server: ' + data.message;
                    } else {
                        div.className = 'status error';
                        div.textContent = '❌ Server: ' + data.message;
                    }
                })
                .catch(error => {
                    document.getElementById('serverStatus').className = 'status error';
                    document.getElementById('serverStatus').textContent = '❌ Server: Connection failed';
                });
            
            // Check database health
            fetch('https://your-app-name.onrender.com/api/database/health')
                .then(response => response.json())
                .then(data => {
                    const div = document.getElementById('databaseStatus');
                    if (data.status === 'connected') {
                        div.className = 'status healthy';
                        div.textContent = '✅ Database: Connected';
                    } else {
                        div.className = 'status error';
                        div.textContent = '❌ Database: ' + data.status;
                    }
                })
                .catch(error => {
                    document.getElementById('databaseStatus').className = 'status error';
                    document.getElementById('databaseStatus').textContent = '❌ Database: Connection failed';
                });
            
            // Check LibreOffice health
            fetch('https://your-app-name.onrender.com/api/libreoffice/health')
                .then(response => response.json())
                .then(data => {
                    const div = document.getElementById('libreofficeStatus');
                    if (data.status === 'Available') {
                        div.className = 'status healthy';
                        div.textContent = '✅ LibreOffice: Available';
                    } else {
                        div.className = 'status warning';
                        div.textContent = '⚠️ LibreOffice: ' + data.status;
                    }
                })
                .catch(error => {
                    document.getElementById('libreofficeStatus').className = 'status error';
                    document.getElementById('libreofficeStatus').textContent = '❌ LibreOffice: Connection failed';
                });
        }
        
        // Auto-refresh every 30 seconds
        setInterval(refreshStatus, 30000);
        
        // Initial load
        refreshStatus();
    </script>
</body>
</html>
```

## 🚀 Quick Setup Script

Create `setup-alerts.ps1`:

```powershell
# CPQ12 Alerting Setup Script
param(
    [string]$Email = "",
    [string]$SlackWebhook = "",
    [string]$TeamsWebhook = "",
    [string]$TwilioSid = "",
    [string]$TwilioToken = ""
)

Write-Host "🚀 Setting up CPQ12 alerting system..." -ForegroundColor Green

# Create configuration file
$Config = @{
    Email = $Email
    SlackWebhook = $SlackWebhook
    TeamsWebhook = $TeamsWebhook
    TwilioSid = $TwilioSid
    TwilioToken = $TwilioToken
    ServerUrl = "https://your-app-name.onrender.com"
} | ConvertTo-Json

$Config | Out-File -FilePath "alert-config.json" -Encoding UTF8

# Create monitoring directory
New-Item -ItemType Directory -Path "C:\CPQ-Monitoring" -Force | Out-Null

# Copy monitoring scripts
Copy-Item "monitor-cpq.ps1" "C:\CPQ-Monitoring\"
Copy-Item "database-cleanup.ps1" "C:\CPQ-Monitoring\"

# Setup scheduled tasks
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\CPQ-Monitoring\monitor-cpq.ps1"
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "CPQ Health Monitoring" -Action $Action -Trigger $Trigger -Settings $Settings

Write-Host "✅ Alerting system setup complete!" -ForegroundColor Green
Write-Host "📧 Email alerts: $Email" -ForegroundColor Yellow
Write-Host "💬 Slack alerts: $SlackWebhook" -ForegroundColor Yellow
Write-Host "📱 Teams alerts: $TeamsWebhook" -ForegroundColor Yellow
Write-Host "📞 SMS alerts: $TwilioSid" -ForegroundColor Yellow
```

## 📋 Testing Your Alerts

### Test All Alert Types
```powershell
# Test email alerts
Send-EmailAlert -Subject "Test Email Alert" -Body "This is a test email alert from CPQ monitoring system." -Severity "LOW"

# Test Slack alerts
Send-SlackAlert -Message "This is a test Slack alert from CPQ monitoring system." -Severity "LOW" -Service "Test Service"

# Test Teams alerts
Send-TeamsAlert -Message "This is a test Teams alert from CPQ monitoring system." -Severity "LOW" -Service "Test Service"

# Test SMS alerts (only for CRITICAL)
Send-SMSAlert -Message "This is a test SMS alert from CPQ monitoring system." -Severity "CRITICAL"
```

## 🎯 Best Practices

### 1. Alert Fatigue Prevention
- Use appropriate severity levels
- Implement alert cooldown periods
- Group related alerts
- Use escalation policies

### 2. Alert Content
- Include relevant context
- Provide actionable information
- Use clear, concise language
- Include timestamps and server info

### 3. Monitoring Frequency
- Health checks: Every 5 minutes
- Performance checks: Every 15 minutes
- Database cleanup: Weekly
- Security scans: Daily

### 4. Escalation Policy
- **LOW/MEDIUM**: Email + Slack
- **HIGH**: Email + Slack + Teams
- **CRITICAL**: All channels + SMS

---

**Your CPQ12 server is now fully monitored with comprehensive alerting! 🚀**

Remember to:
1. Test all alert channels after setup
2. Monitor alert frequency and adjust thresholds
3. Keep contact information updated
4. Review and tune alert rules regularly

