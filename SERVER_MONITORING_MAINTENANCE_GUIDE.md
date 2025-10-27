# 🚀 CPQ12 Server Monitoring & Maintenance Guide

## 📊 Overview
This guide covers how to monitor, maintain, and troubleshoot your CPQ12 server after deployment. Your server includes health checks, database monitoring, and various maintenance tasks.

## 🔍 Current Health Check Endpoints

Your server already has several health check endpoints:

### 1. Main Health Check
```bash
GET /api/health
```
**Response:**
```json
{
  "status": "ok",
  "message": "Server is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### 2. Database Health Check
```bash
GET /api/database/health
```
**Response:**
```json
{
  "status": "connected",
  "database": "cpq_database",
  "collections": ["quotes", "signature_forms", "documents"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 3. LibreOffice Health Check
```bash
GET /api/libreoffice/health
```
**Response:**
```json
{
  "status": "Available",
  "version": "7.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 📈 Monitoring Setup

### 1. Server Monitoring Tools

#### Option A: Uptime Robot (Free)
1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Add your server URL: `https://your-app-name.onrender.com/api/health`
3. Set monitoring interval to 5 minutes
4. Configure email/SMS alerts

#### Option B: Pingdom (Paid)
1. Go to [pingdom.com](https://pingdom.com)
2. Create new check for your server
3. Set up advanced monitoring for all endpoints

#### Option C: Custom Monitoring Script
Create a monitoring script to check all endpoints:

```bash
#!/bin/bash
# monitor-cpq.sh

SERVER_URL="https://your-app-name.onrender.com"
EMAIL="your-email@example.com"

# Check main health
if ! curl -f "$SERVER_URL/api/health" > /dev/null 2>&1; then
    echo "❌ Main health check failed" | mail -s "CPQ Server Alert" $EMAIL
fi

# Check database health
if ! curl -f "$SERVER_URL/api/database/health" > /dev/null 2>&1; then
    echo "❌ Database health check failed" | mail -s "CPQ Database Alert" $EMAIL
fi

# Check LibreOffice health
if ! curl -f "$SERVER_URL/api/libreoffice/health" > /dev/null 2>&1; then
    echo "❌ LibreOffice health check failed" | mail -s "CPQ LibreOffice Alert" $EMAIL
fi

echo "✅ All health checks passed"
```

### 2. Log Monitoring

#### Render Logs
1. Go to your Render dashboard
2. Click on your service
3. Go to "Logs" tab
4. Monitor for errors and warnings

#### Key Log Patterns to Watch:
- `❌` - Error indicators
- `⚠️` - Warning indicators
- `Database connection failed`
- `LibreOffice conversion failed`
- `Email sending failed`
- `HubSpot API error`

## 🛠️ Daily Maintenance Tasks

### 1. Health Check Verification
```bash
# Run this daily to verify all services
curl -s https://your-app-name.onrender.com/api/health | jq
curl -s https://your-app-name.onrender.com/api/database/health | jq
curl -s https://your-app-name.onrender.com/api/libreoffice/health | jq
```

### 2. Database Maintenance
Your server has these database collections that may need cleanup:
- `quotes` - Store quote data
- `signature_forms` - Store signature forms
- `documents` - Store generated documents

#### Cleanup Old Data (Monthly)
```javascript
// Connect to your MongoDB and run:
// Clean up quotes older than 1 year
db.quotes.deleteMany({
  createdAt: { $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
});

// Clean up completed signature forms older than 6 months
db.signature_forms.deleteMany({
  status: "completed",
  createdAt: { $lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
});

// Clean up temporary documents older than 7 days
db.documents.deleteMany({
  status: "temporary",
  createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
});
```

### 3. File System Cleanup
Monitor your server's disk usage and clean up temporary files:

```bash
# Check disk usage
df -h

# Clean up temp files (if using file storage)
find /temp -name "*.tmp" -mtime +1 -delete
find /temp -name "*.pdf" -mtime +7 -delete
```

## 🔧 Weekly Maintenance Tasks

### 1. Performance Monitoring
Check server performance metrics:

```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://your-app-name.onrender.com/api/health

# Create curl-format.txt:
cat > curl-format.txt << EOF
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
EOF
```

### 2. Security Updates
- Monitor for Node.js security updates
- Check dependency vulnerabilities: `npm audit`
- Update packages regularly: `npm update`

### 3. Backup Verification
Ensure your database backups are working:

```bash
# If using MongoDB Atlas, verify backups
# If using local MongoDB, test restore process
mongorestore --db test_restore /path/to/backup
```

## 🚨 Troubleshooting Common Issues

### 1. Server Not Responding
```bash
# Check if server is running
curl -I https://your-app-name.onrender.com/api/health

# Check Render logs for errors
# Look for: "Application failed to start"
# Look for: "Database connection failed"
```

### 2. Database Connection Issues
```bash
# Test database health
curl https://your-app-name.onrender.com/api/database/health

# Common fixes:
# - Check MongoDB connection string
# - Verify database credentials
# - Check if database is accessible from Render
```

### 3. LibreOffice Conversion Issues
```bash
# Test LibreOffice health
curl https://your-app-name.onrender.com/api/libreoffice/health

# Common fixes:
# - Restart LibreOffice container
# - Check Docker container logs
# - Verify file permissions
```

### 4. Email Sending Issues
Check SendGrid configuration:
- Verify API key in environment variables
- Check SendGrid dashboard for delivery issues
- Monitor email logs in server

### 5. HubSpot Integration Issues
```bash
# Test HubSpot connection
curl -H "X-API-KEY: your-api-key" https://your-app-name.onrender.com/api/hubspot/contacts

# Common fixes:
# - Verify HubSpot API key
# - Check API rate limits
# - Verify HubSpot account permissions
```

## 📊 Performance Optimization

### 1. Database Indexing
Ensure proper indexes are created:

```javascript
// These indexes should already exist in your server
db.quotes.createIndex({ createdAt: 1 });
db.quotes.createIndex({ status: 1 });
db.signature_forms.createIndex({ status: 1 });
db.documents.createIndex({ status: 1 });
```

### 2. Caching Strategy
Consider implementing caching for:
- HubSpot data (cache for 15-30 minutes)
- Template data (cache for 1 hour)
- User session data

### 3. Rate Limiting
Monitor API usage and implement rate limiting if needed:

```javascript
// Add to your server.cjs
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## 🔔 Alerting Setup

### 1. Email Alerts
Set up email notifications for:
- Server down (health check fails)
- Database connection issues
- High error rates
- Disk space warnings

### 2. Slack Integration
Create a Slack webhook for alerts:

```bash
# Add to your monitoring script
curl -X POST -H 'Content-type: application/json' \
--data '{"text":"🚨 CPQ Server Alert: Health check failed"}' \
YOUR_SLACK_WEBHOOK_URL
```

### 3. SMS Alerts
Use services like Twilio for critical alerts:

```javascript
// Add to your server error handlers
const twilio = require('twilio');
const client = twilio(accountSid, authToken);

client.messages.create({
  body: 'CPQ Server is down!',
  from: '+1234567890',
  to: '+0987654321'
});
```

## 📋 Maintenance Checklist

### Daily
- [ ] Check health endpoints
- [ ] Review error logs
- [ ] Monitor response times
- [ ] Check disk usage

### Weekly
- [ ] Review performance metrics
- [ ] Check security updates
- [ ] Verify backups
- [ ] Test email functionality

### Monthly
- [ ] Clean up old data
- [ ] Update dependencies
- [ ] Review access logs
- [ ] Test disaster recovery

### Quarterly
- [ ] Security audit
- [ ] Performance review
- [ ] Capacity planning
- [ ] Documentation update

## 🆘 Emergency Procedures

### 1. Server Down
1. Check Render dashboard
2. Review logs for errors
3. Restart service if needed
4. Check database connectivity
5. Notify users if extended downtime

### 2. Database Issues
1. Check MongoDB Atlas dashboard
2. Verify connection string
3. Check credentials
4. Restore from backup if needed

### 3. Data Loss
1. Stop all services immediately
2. Check recent backups
3. Restore from most recent backup
4. Investigate cause
5. Implement prevention measures

## 📞 Support Contacts

- **Render Support**: [render.com/support](https://render.com/support)
- **MongoDB Support**: [support.mongodb.com](https://support.mongodb.com)
- **SendGrid Support**: [support.sendgrid.com](https://support.sendgrid.com)
- **HubSpot Support**: [developers.hubspot.com](https://developers.hubspot.com)

## 🎯 Success Metrics

Monitor these KPIs:
- **Uptime**: > 99.5%
- **Response Time**: < 2 seconds
- **Error Rate**: < 1%
- **Database Response**: < 500ms
- **Email Delivery**: > 95%

---

**Remember**: Regular monitoring and maintenance are crucial for keeping your CPQ12 server running smoothly. Set up automated monitoring and alerts to catch issues before they become problems! 🚀

