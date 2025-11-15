# 🚀 Quick Production Readiness Check

## One-Command Check

**Windows:**
```powershell
.\check-production-readiness.ps1
```

**Linux/macOS:**
```bash
./check-production-readiness.sh
```

**Custom URL:**
```powershell
.\check-production-readiness.ps1 -ServerUrl "https://your-domain.com"
```

## What It Checks

✅ **Server Connectivity** - Is your server reachable?  
✅ **HTTPS/SSL** - Is secure connection enabled?  
✅ **Response Time** - Is performance acceptable?  
✅ **Health Endpoints** - Are health checks working?  
✅ **Database** - Is database connected?  
✅ **Email Service** - Is email configured?  
✅ **HubSpot** - Is HubSpot integration active?  
✅ **Frontend** - Is frontend accessible?  
✅ **API Endpoints** - Are APIs responding?  
✅ **Security** - Are security measures in place?  
✅ **Performance** - Is performance consistent?  

## Expected Output

### ✅ Production Ready
```
✅ PRODUCTION READY!
Your application appears ready for customers.

Recommended next steps:
   1. Monitor the application for 24-48 hours
   2. Set up automated monitoring (see docs file)
   3. Configure alerting for critical issues
   4. Perform load testing before major launches
```

### ❌ Not Production Ready
```
❌ NOT PRODUCTION READY
Please fix the issues above before going live.

🚨 CRITICAL ISSUES: X
   ❌ [Issue description]
```

## Manual Health Checks

If you prefer manual checks:

```bash
# Overall health
curl https://zenop.ai/api/health

# Database health
curl https://zenop.ai/api/database/health

# Frontend
curl -I https://zenop.ai
```

## Full Checklist

For a comprehensive manual checklist, see: `PRODUCTION_READINESS_CHECKLIST.md`

## Troubleshooting

**Script won't run?**
- Windows: Make sure PowerShell execution policy allows scripts:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
- Linux/macOS: Make script executable:
  ```bash
  chmod +x check-production-readiness.sh
  ```

**Server unreachable?**
- Check if server is running
- Verify URL is correct
- Check firewall rules

**Database connection fails?**
- Verify MongoDB URI in environment variables
- Check IP whitelist in MongoDB Atlas
- Verify network connectivity

---

**Need help?** Check the full documentation in `PRODUCTION_READINESS_CHECKLIST.md`

