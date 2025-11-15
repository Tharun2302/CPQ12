# 🚀 Production Readiness Checklist

Use this checklist to verify your CPQ application is ready for customers in production.

## Quick Check

Run the automated production readiness check:

**Windows (PowerShell):**
```powershell
.\check-production-readiness.ps1
```

**Linux/macOS (Bash):**
```bash
chmod +x check-production-readiness.sh
./check-production-readiness.sh
```

**Custom URL:**
```powershell
.\check-production-readiness.ps1 -ServerUrl "https://your-domain.com"
```

## Manual Checklist

### ✅ 1. Server Health

- [ ] Server is running and accessible
- [ ] Health endpoint responds: `GET /api/health`
- [ ] Response time < 3 seconds
- [ ] Server uptime > 99%

**Check:**
```bash
curl https://zenop.ai/api/health
```

### ✅ 2. Database

- [ ] MongoDB connection is active
- [ ] Database health check passes: `GET /api/database/health`
- [ ] Database backups are configured
- [ ] Connection string is secure (not in logs)

**Check:**
```bash
curl https://zenop.ai/api/database/health
```

### ✅ 3. Security

- [ ] HTTPS/SSL is enabled and valid
- [ ] SSL certificate is not expired
- [ ] JWT_SECRET is strong and unique
- [ ] Environment variables are not exposed
- [ ] CORS is properly configured
- [ ] API endpoints require authentication where needed

**Check SSL:**
```bash
openssl s_client -connect zenop.ai:443 -servername zenop.ai
```

### ✅ 4. Email Service

- [ ] SendGrid API key is configured
- [ ] Email sender is verified
- [ ] Test email can be sent
- [ ] Email templates are working

**Check in health endpoint:**
```bash
curl https://zenop.ai/api/health | grep email
```

### ✅ 5. HubSpot Integration

- [ ] HubSpot API key is configured (not demo mode)
- [ ] HubSpot webhooks are working
- [ ] Deal creation is functional
- [ ] Contact sync is working

**Check in health endpoint:**
```bash
curl https://zenop.ai/api/health | grep hubspot
```

### ✅ 6. Frontend

- [ ] Frontend is accessible
- [ ] All pages load correctly
- [ ] No console errors
- [ ] Authentication works
- [ ] Forms submit successfully
- [ ] PDF generation works
- [ ] Document templates load

**Check:**
```bash
curl -I https://zenop.ai
```

### ✅ 7. API Endpoints

- [ ] Quotes API: `GET /api/quotes`
- [ ] Templates API: `GET /api/templates`
- [ ] Email API: `POST /api/email/send`
- [ ] Signature API: `POST /api/signatures`
- [ ] All endpoints return proper status codes

### ✅ 8. Performance

- [ ] Response time < 3 seconds (average)
- [ ] No memory leaks
- [ ] Server can handle expected load
- [ ] Database queries are optimized
- [ ] File uploads work correctly

**Test performance:**
```bash
# Run multiple requests
for i in {1..10}; do
  time curl -s https://zenop.ai/api/health > /dev/null
done
```

### ✅ 9. Monitoring & Logging

- [ ] Health check monitoring is set up
- [ ] Error logging is configured
- [ ] Alerts are configured (email/Slack/Teams)
- [ ] Logs are being collected
- [ ] Performance metrics are tracked

**See:** `docs` file for monitoring setup

### ✅ 10. Environment Configuration

- [ ] All required environment variables are set
- [ ] `NODE_ENV=production`
- [ ] Database connection string is correct
- [ ] API keys are valid and not expired
- [ ] Frontend environment variables are set
- [ ] CORS origins are configured correctly

**Required Environment Variables:**
- `MONGODB_URI`
- `DB_NAME`
- `JWT_SECRET`
- `SENDGRID_API_KEY`
- `EMAIL_FROM`
- `HUBSPOT_API_KEY`
- `VITE_BACKEND_URL`
- `VITE_API_URL`
- `VITE_MSAL_CLIENT_ID`
- `VITE_MSAL_REDIRECT_URI`

### ✅ 11. Backup & Recovery

- [ ] Database backups are automated
- [ ] Backup restoration has been tested
- [ ] Disaster recovery plan exists
- [ ] Data retention policy is defined

### ✅ 12. Documentation

- [ ] API documentation is available
- [ ] Deployment guide is complete
- [ ] Troubleshooting guide exists
- [ ] Runbook for common issues

## Pre-Launch Testing

Before going live, test these critical user flows:

1. **User Registration & Login**
   - [ ] Sign up works
   - [ ] Email verification works
   - [ ] Microsoft SSO works
   - [ ] Password reset works

2. **Quote Generation**
   - [ ] Create quote
   - [ ] Calculate pricing
   - [ ] Generate PDF
   - [ ] Send quote via email

3. **Document Management**
   - [ ] Upload template
   - [ ] Process template
   - [ ] Download document
   - [ ] Signature workflow

4. **Integration**
   - [ ] HubSpot deal creation
   - [ ] Contact sync
   - [ ] Email delivery

## Post-Launch Monitoring

After going live, monitor:

- [ ] Server uptime (target: 99.9%)
- [ ] Response times (target: < 3s)
- [ ] Error rates (target: < 1%)
- [ ] Database performance
- [ ] Email delivery rates
- [ ] User activity
- [ ] API usage

## Quick Health Check Commands

```bash
# Overall health
curl https://zenop.ai/api/health

# Database health
curl https://zenop.ai/api/database/health

# Frontend
curl -I https://zenop.ai

# Performance test
ab -n 100 -c 10 https://zenop.ai/api/health
```

## Troubleshooting

If checks fail:

1. **Server unreachable:**
   - Check if server is running
   - Verify firewall rules
   - Check DNS configuration

2. **Database connection fails:**
   - Verify MongoDB URI
   - Check IP whitelist in MongoDB Atlas
   - Verify network connectivity

3. **SSL issues:**
   - Check certificate expiration
   - Verify certificate chain
   - Check nginx/SSL configuration

4. **Performance issues:**
   - Check server resources (CPU, memory)
   - Review database query performance
   - Check for memory leaks
   - Review application logs

## Support

For issues:
1. Check application logs: `docker-compose logs -f`
2. Review health endpoints
3. Check environment variables
4. Review monitoring dashboard

---

**Remember:** Always test in a staging environment before deploying to production!

