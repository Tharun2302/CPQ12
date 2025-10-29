# 🏥 CPQ12 Health Check Documentation

## 📋 Overview
Your CPQ12 server includes comprehensive health check endpoints that monitor various components and services. This document details all available health checks and how to use them effectively.

## 🔍 Available Health Check Endpoints

### 1. Main Server Health Check
**Endpoint:** `GET /api/health`  
**Purpose:** Overall server status and basic information  
**Response Time:** < 100ms  
**Frequency:** Every 5 minutes

#### Response Format
```json
{
  "status": "ok",
  "message": "Server is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production"
}
```

#### Status Values
- `"ok"` - Server is healthy and operational
- `"degraded"` - Server is running but with issues
- `"error"` - Server has critical issues

#### Monitoring Recommendations
- **Alert on:** Status != "ok"
- **Response time:** > 2 seconds
- **HTTP status:** != 200

---

### 2. Database Health Check
**Endpoint:** `GET /api/database/health`  
**Purpose:** MongoDB connection and database status  
**Response Time:** < 500ms  
**Frequency:** Every 5 minutes

#### Response Format
```json
{
  "status": "connected",
  "database": "cpq_database",
  "collections": ["quotes", "signature_forms", "documents"],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "connection_time": 45,
  "total_documents": 1250
}
```

#### Status Values
- `"connected"` - Database is accessible and responsive
- `"disconnected"` - Database connection lost
- `"error"` - Database query failed

#### Monitoring Recommendations
- **Alert on:** Status != "connected"
- **Response time:** > 5 seconds
- **Connection time:** > 1 second

---

### 3. LibreOffice Health Check
**Endpoint:** `GET /api/libreoffice/health`  
**Purpose:** Document conversion service status  
**Response Time:** < 2 seconds  
**Frequency:** Every 10 minutes

#### Response Format
```json
{
  "status": "Available",
  "version": "7.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "last_conversion": "2024-01-15T10:25:00.000Z",
  "conversions_today": 45
}
```

#### Status Values
- `"Available"` - LibreOffice is ready for conversions
- `"Busy"` - LibreOffice is processing documents
- `"Error"` - LibreOffice service failed
- `"Unavailable"` - LibreOffice is not running

#### Monitoring Recommendations
- **Alert on:** Status != "Available"
- **Response time:** > 10 seconds
- **No conversions:** > 1 hour (if expected)

---

## 🔧 Additional Health Checks (Recommended)

### 4. HubSpot Integration Health
**Endpoint:** `GET /api/hubspot/health`  
**Purpose:** HubSpot API connectivity and authentication  
**Response Time:** < 3 seconds  
**Frequency:** Every 15 minutes

#### Response Format
```json
{
  "status": "connected",
  "api_key_valid": true,
  "rate_limit_remaining": 9500,
  "rate_limit_reset": "2024-01-15T11:00:00.000Z",
  "last_sync": "2024-01-15T10:25:00.000Z",
  "contacts_count": 1250,
  "deals_count": 340
}
```

#### Status Values
- `"connected"` - HubSpot API is accessible
- `"rate_limited"` - API rate limit exceeded
- `"unauthorized"` - API key invalid
- `"error"` - API request failed

---

### 5. Email Service Health
**Endpoint:** `GET /api/email/health`  
**Purpose:** Email delivery service status  
**Response Time:** < 2 seconds  
**Frequency:** Every 30 minutes

#### Response Format
```json
{
  "status": "operational",
  "provider": "sendgrid",
  "api_key_valid": true,
  "emails_sent_today": 25,
  "last_email": "2024-01-15T10:20:00.000Z",
  "delivery_rate": 98.5
}
```

#### Status Values
- `"operational"` - Email service is working
- `"degraded"` - Email service has issues
- `"error"` - Email service failed
- `"quota_exceeded"` - Email quota exceeded

---

### 6. File Storage Health
**Endpoint:** `GET /api/storage/health`  
**Purpose:** File storage and temporary file management  
**Response Time:** < 1 second  
**Frequency:** Every 15 minutes

#### Response Format
```json
{
  "status": "available",
  "disk_usage_percent": 45.2,
  "free_space_gb": 25.8,
  "temp_files_count": 12,
  "oldest_temp_file": "2024-01-14T15:30:00.000Z",
  "last_cleanup": "2024-01-15T02:00:00.000Z"
}
```

#### Status Values
- `"available"` - Storage is accessible
- `"full"` - Storage is nearly full
- `"error"` - Storage access failed

---

## 📊 Health Check Monitoring Script

### PowerShell Monitoring Script
```powershell
# Enhanced health check monitoring
function Test-AllHealthChecks {
    param([string]$ServerUrl = "https://your-app-name.onrender.com")
    
    $Results = @{}
    
    # Test main health
    try {
        $Response = Invoke-RestMethod -Uri "$ServerUrl/api/health" -TimeoutSec 30
        $Results.MainHealth = @{
            Status = $Response.status
            ResponseTime = $Response.response_time
            Uptime = $Response.uptime
            Healthy = $Response.status -eq "ok"
        }
    }
    catch {
        $Results.MainHealth = @{
            Status = "error"
            Error = $_.Exception.Message
            Healthy = $false
        }
    }
    
    # Test database health
    try {
        $Response = Invoke-RestMethod -Uri "$ServerUrl/api/database/health" -TimeoutSec 30
        $Results.DatabaseHealth = @{
            Status = $Response.status
            ConnectionTime = $Response.connection_time
            DocumentCount = $Response.total_documents
            Healthy = $Response.status -eq "connected"
        }
    }
    catch {
        $Results.DatabaseHealth = @{
            Status = "error"
            Error = $_.Exception.Message
            Healthy = $false
        }
    }
    
    # Test LibreOffice health
    try {
        $Response = Invoke-RestMethod -Uri "$ServerUrl/api/libreoffice/health" -TimeoutSec 30
        $Results.LibreOfficeHealth = @{
            Status = $Response.status
            Version = $Response.version
            ConversionsToday = $Response.conversions_today
            Healthy = $Response.status -eq "Available"
        }
    }
    catch {
        $Results.LibreOfficeHealth = @{
            Status = "error"
            Error = $_.Exception.Message
            Healthy = $false
        }
    }
    
    return $Results
}
```

### Bash Monitoring Script
```bash
#!/bin/bash

# Enhanced health check monitoring for Linux/Unix
SERVER_URL="https://your-app-name.onrender.com"
LOG_FILE="/var/log/cpq/health-checks.log"

check_health() {
    local endpoint="$1"
    local name="$2"
    local timeout="${3:-30}"
    
    echo "Checking $name..."
    
    local start_time=$(date +%s%N)
    local response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json "$SERVER_URL$endpoint" --max-time $timeout 2>/dev/null)
    local end_time=$(date +%s%N)
    local http_code="${response: -3}"
    local response_time=$(( (end_time - start_time) / 1000000 ))
    
    if [ "$http_code" = "200" ]; then
        local status=$(jq -r '.status' /tmp/health_response.json 2>/dev/null)
        echo "$(date '+%Y-%m-%d %H:%M:%S') - $name: $status (${response_time}ms)" >> "$LOG_FILE"
        
        if [ "$status" = "ok" ] || [ "$status" = "connected" ] || [ "$status" = "Available" ]; then
            echo "✅ $name: Healthy"
            return 0
        else
            echo "⚠️ $name: $status"
            return 1
        fi
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') - $name: HTTP $http_code (${response_time}ms)" >> "$LOG_FILE"
        echo "❌ $name: HTTP $http_code"
        return 1
    fi
}

# Run all health checks
echo "Starting comprehensive health checks..."
failed_checks=0

check_health "/api/health" "Main Server" || ((failed_checks++))
check_health "/api/database/health" "Database" || ((failed_checks++))
check_health "/api/libreoffice/health" "LibreOffice" || ((failed_checks++))

echo "Health check summary: $failed_checks failed checks"
exit $failed_checks
```

## 🚨 Alert Thresholds & Recommendations

### Critical Alerts (Immediate Action Required)
- Main health check fails (HTTP != 200 or status != "ok")
- Database health check fails (status != "connected")
- Server response time > 10 seconds
- Disk usage > 95%

### High Priority Alerts (Action Required Within 1 Hour)
- LibreOffice health check fails (status != "Available")
- Database response time > 5 seconds
- Disk usage > 85%
- Email service fails (if configured)

### Medium Priority Alerts (Monitor and Plan Action)
- Server response time > 5 seconds
- Database response time > 2 seconds
- Disk usage > 70%
- High error rates in logs

### Low Priority Alerts (Informational)
- Server response time > 2 seconds
- Disk usage > 50%
- Low conversion activity (if expected)

## 📈 Health Check Dashboard

### Simple HTML Dashboard
```html
<!DOCTYPE html>
<html>
<head>
    <title>CPQ12 Health Dashboard</title>
    <meta http-equiv="refresh" content="30">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .status-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .status-card.healthy { border-left: 5px solid #28a745; }
        .status-card.warning { border-left: 5px solid #ffc107; }
        .status-card.error { border-left: 5px solid #dc3545; }
        .status-indicator { font-size: 24px; margin-right: 10px; }
        .metrics { margin-top: 15px; }
        .metric { display: flex; justify-content: space-between; margin: 5px 0; }
        .refresh-btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        .refresh-btn:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 CPQ12 Health Dashboard</h1>
            <p>Real-time monitoring of all server components</p>
            <button class="refresh-btn" onclick="refreshAll()">🔄 Refresh All</button>
            <span id="lastUpdate"></span>
        </div>
        
        <div class="status-grid">
            <div id="mainHealth" class="status-card">
                <h3><span class="status-indicator">⏳</span>Main Server</h3>
                <div id="mainStatus">Checking...</div>
                <div class="metrics" id="mainMetrics"></div>
            </div>
            
            <div id="databaseHealth" class="status-card">
                <h3><span class="status-indicator">⏳</span>Database</h3>
                <div id="databaseStatus">Checking...</div>
                <div class="metrics" id="databaseMetrics"></div>
            </div>
            
            <div id="libreofficeHealth" class="status-card">
                <h3><span class="status-indicator">⏳</span>LibreOffice</h3>
                <div id="libreofficeStatus">Checking...</div>
                <div class="metrics" id="libreofficeMetrics"></div>
            </div>
        </div>
    </div>

    <script>
        const SERVER_URL = 'https://your-app-name.onrender.com';
        
        function updateLastRefresh() {
            document.getElementById('lastUpdate').textContent = 'Last updated: ' + new Date().toLocaleString();
        }
        
        function updateStatusCard(cardId, status, message, metrics = {}) {
            const card = document.getElementById(cardId);
            const statusDiv = document.getElementById(cardId.replace('Health', 'Status'));
            const metricsDiv = document.getElementById(cardId.replace('Health', 'Metrics'));
            
            // Update card class
            card.className = 'status-card ' + status;
            
            // Update status message
            const indicator = status === 'healthy' ? '✅' : status === 'warning' ? '⚠️' : '❌';
            statusDiv.innerHTML = `${indicator} ${message}`;
            
            // Update metrics
            let metricsHtml = '';
            for (const [key, value] of Object.entries(metrics)) {
                metricsHtml += `<div class="metric"><span>${key}:</span><span>${value}</span></div>`;
            }
            metricsDiv.innerHTML = metricsHtml;
        }
        
        async function checkHealth(endpoint, cardId, name) {
            try {
                const response = await fetch(`${SERVER_URL}${endpoint}`);
                const data = await response.json();
                
                if (response.ok && (data.status === 'ok' || data.status === 'connected' || data.status === 'Available')) {
                    updateStatusCard(cardId, 'healthy', `${name} is operational`, {
                        'Status': data.status,
                        'Response Time': data.response_time ? `${data.response_time}ms` : 'N/A',
                        'Uptime': data.uptime ? `${Math.floor(data.uptime / 3600)}h` : 'N/A'
                    });
                } else {
                    updateStatusCard(cardId, 'warning', `${name} has issues: ${data.status}`, {
                        'Status': data.status,
                        'Error': data.message || 'Unknown error'
                    });
                }
            } catch (error) {
                updateStatusCard(cardId, 'error', `${name} is unreachable`, {
                    'Error': error.message,
                    'HTTP Status': 'Connection Failed'
                });
            }
        }
        
        async function refreshAll() {
            updateLastRefresh();
            
            await Promise.all([
                checkHealth('/api/health', 'mainHealth', 'Main Server'),
                checkHealth('/api/database/health', 'databaseHealth', 'Database'),
                checkHealth('/api/libreoffice/health', 'libreofficeHealth', 'LibreOffice')
            ]);
        }
        
        // Auto-refresh every 30 seconds
        setInterval(refreshAll, 30000);
        
        // Initial load
        refreshAll();
    </script>
</body>
</html>
```

## 🔧 Troubleshooting Common Issues

### Health Check Failures

#### Main Health Check Fails
1. **Check server logs** for error messages
2. **Verify server is running** on the correct port
3. **Check environment variables** are properly set
4. **Restart server** if necessary

#### Database Health Check Fails
1. **Verify MongoDB connection string** in environment variables
2. **Check database server** is running and accessible
3. **Verify network connectivity** between server and database
4. **Check database credentials** and permissions

#### LibreOffice Health Check Fails
1. **Check LibreOffice container** is running (if using Docker)
2. **Verify LibreOffice installation** on the server
3. **Check file permissions** for temporary directories
4. **Restart LibreOffice service** if necessary

### Performance Issues

#### Slow Response Times
1. **Check server resources** (CPU, memory, disk)
2. **Review database query performance**
3. **Check network latency** between components
4. **Monitor concurrent requests** and rate limiting

#### High Error Rates
1. **Review application logs** for error patterns
2. **Check external service dependencies** (HubSpot, email)
3. **Verify API rate limits** and quotas
4. **Monitor database connection pool** usage

## 📋 Health Check Checklist

### Daily Checks
- [ ] Main server health check passes
- [ ] Database health check passes
- [ ] LibreOffice health check passes
- [ ] Response times are within acceptable limits
- [ ] No critical errors in logs

### Weekly Checks
- [ ] Review health check trends and patterns
- [ ] Check disk usage and cleanup if needed
- [ ] Verify all external service integrations
- [ ] Test alerting system functionality
- [ ] Review performance metrics

### Monthly Checks
- [ ] Update health check thresholds if needed
- [ ] Review and optimize database queries
- [ ] Check for security updates and patches
- [ ] Test disaster recovery procedures
- [ ] Review and update monitoring documentation

---

**Your CPQ12 server now has comprehensive health monitoring! 🚀**

Remember to:
1. Set up automated monitoring using the provided scripts
2. Configure alerts for critical health check failures
3. Regularly review health check trends and patterns
4. Update monitoring thresholds based on your specific needs
5. Test all health check endpoints regularly

