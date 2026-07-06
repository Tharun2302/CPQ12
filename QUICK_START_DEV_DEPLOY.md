# CPQ12 Development Deployment - Quick Start Guide

**🚀 Get Started in 5 Minutes**

---

## One-Command Deployment

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM" && bash scripts/deploy-dev.sh
```

**That's it!** Your CPQ12 app will be deployed to 159.89.175.168

---

## Prerequisites (First Time Only)

```bash
# Install sshpass (if not already installed)
sudo apt-get install sshpass    # Ubuntu/Debian
brew install sshpass             # macOS
choco install sshpass            # Windows (Chocolatey)
```

---

## Quick Commands

### Deploy Latest Code
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/deploy-dev.sh
```

### Check Application Health
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh
```

### Monitor Continuously (Live Updates)
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh --continuous
```

### Emergency Rollback (Interactive Menu)
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh
```

### Rollback 1 Commit Back
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh HEAD~1
```

### View Live Logs
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs -f cpq12-dev"
```

### Check Container Status
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker ps"
```

---

## Access Running Application

After deployment succeeds:

| Service | URL |
|---------|-----|
| **Frontend** | http://159.89.175.168:5173 |
| **Backend API** | http://159.89.175.168:3000 |
| **Health Check** | http://159.89.175.168:3000/health |
| **MongoDB** | mongodb://159.89.175.168:27017 |
| **PostgreSQL** | postgresql://159.89.175.168:5432 |

---

## Deployment Checklist

```
✅ Prerequisites
   ☐ sshpass installed
   ☐ SSH access to 159.89.175.168
   ☐ Password: CPQ@2025@TEAM

✅ Pre-Deployment
   ☐ Latest code committed
   ☐ Feature branch: feature/gstack-implementation
   ☐ Team notified

✅ Execute Deployment
   ☐ Run: export DEPLOY_PASSWORD="CPQ@2025@TEAM"
   ☐ Run: bash scripts/deploy-dev.sh
   ☐ Watch for ✅ success message

✅ Verify Deployment
   ☐ Run: bash scripts/health-check-dev.sh
   ☐ All checks should show ✅
   ☐ Test frontend: http://159.89.175.168:5173
   ☐ Test backend: http://159.89.175.168:3000

✅ Post-Deployment
   ☐ Team notified of successful deployment
   ☐ Features working as expected
   ☐ No errors in logs
```

---

## Real-World Scenarios

### Scenario 1: Regular Deployment

```bash
# Monday morning - deploy latest features
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/deploy-dev.sh

# Verify
bash scripts/health-check-dev.sh

# Open in browser
open http://159.89.175.168:5173
```

### Scenario 2: Something Broke - Quick Rollback

```bash
# Oh no! The new code broke something
# 1. Interactive rollback (choose which option)
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh

# 2. OR just go back 1 commit
bash scripts/rollback-dev.sh HEAD~1

# 3. Verify the fix
bash scripts/health-check-dev.sh
```

### Scenario 3: Monitor During Testing

```bash
# Leave this running while QA tests
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh --continuous

# Watch for any issues real-time
# Press Ctrl+C to stop
```

### Scenario 4: Check Specific Commit

```bash
# View recent commits
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "cd ~/CPQ12 && git log --oneline -10"

# Rollback to specific commit
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh abc1234567
```

---

## Troubleshooting Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| "sshpass command not found" | `sudo apt-get install sshpass` |
| "Connection refused" | Check IP `ping 159.89.175.168` |
| "Permission denied" | Verify password: `echo $DEPLOY_PASSWORD` |
| "Docker build failed" | Server disk full - clean: `sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker image prune -a -f"` |
| "Backend health check fails" | View logs: `sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs cpq12-dev \| tail -50"` |

---

## File Locations

```
Project Root (C:\Users\AnushDasari\Desktop\Gstackcpq\)
├── scripts/
│   ├── deploy-dev.sh              ← Main deployment script
│   ├── health-check-dev.sh         ← Health monitoring
│   └── rollback-dev.sh             ← Emergency rollback
├── docker-compose.dev.yml          ← Dev configuration
├── DEPLOY_DEV_SETUP.md             ← Complete guide (detailed)
├── DEPLOYMENT_SUMMARY.md           ← Summary & checklist
└── QUICK_START_DEV_DEPLOY.md       ← This file (quick reference)
```

---

## Server Details (For Reference)

```
Host:         159.89.175.168
User:         root
SSH Port:     22
Password:     CPQ@2025@TEAM
OS:           Ubuntu 25.04
Deploy Path:  ~/CPQ12
Backup Path:  ~/CPQ12/backups
```

---

## Common Configurations

### Deploy Different Branch

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
export GIT_BRANCH="main"
bash scripts/deploy-dev.sh
```

### Deploy to Different Server (Future)

```bash
export DEPLOY_PASSWORD="your_password"
export DEV_SERVER="your.server.ip"
export DEV_USER="your_user"
bash scripts/deploy-dev.sh
```

### Check Custom Health Interval

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
CHECK_INTERVAL=60 bash scripts/health-check-dev.sh --continuous
```

---

## View Logs & Diagnostics

### Application Logs (Real-time)
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs -f cpq12-dev"
```

### Last 100 Lines
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs --tail 100 cpq12-dev"
```

### MongoDB Logs
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs cpq12-mongo-dev | tail -20"
```

### PostgreSQL Logs
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs cpq12-postgres-dev | tail -20"
```

### Deployment Logs (Local)
```bash
cat /tmp/cpq12-deploy-*.log | tail -50
```

---

## Performance Tips

### Faster Deployments
1. Use a stable internet connection
2. Ensure server isn't running other heavy processes
3. Deploy during off-peak hours when possible

### Continuous Monitoring Setup
Create a background job:
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
nohup bash scripts/health-check-dev.sh --continuous > health-monitor.log 2>&1 &
echo $! > health-monitor.pid
```

Stop monitoring:
```bash
kill $(cat health-monitor.pid)
```

---

## Safety Tips

1. **Always check health first:**
   ```bash
   bash scripts/health-check-dev.sh
   ```

2. **Never skip the backup:**
   - Deployment automatically creates backups
   - Kept in `~/CPQ12/backups/`

3. **Test rollback:**
   - Practice rollback in advance
   - Know how to use `rollback-dev.sh`

4. **Monitor after deploy:**
   - Run health checks
   - Watch logs for errors
   - Test key features

---

## Need More Details?

- **Complete Setup Guide:** See `DEPLOY_DEV_SETUP.md`
- **Troubleshooting:** See `DEPLOY_DEV_SETUP.md` - Troubleshooting section
- **Architecture Details:** See `DEPLOYMENT_SUMMARY.md`

---

## Commands You'll Use 90% of the Time

```bash
# Deploy
export DEPLOY_PASSWORD="CPQ@2025@TEAM" && bash scripts/deploy-dev.sh

# Check health
export DEPLOY_PASSWORD="CPQ@2025@TEAM" && bash scripts/health-check-dev.sh

# View logs
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs -f cpq12-dev"

# Rollback
export DEPLOY_PASSWORD="CPQ@2025@TEAM" && bash scripts/rollback-dev.sh HEAD~1
```

---

## Success = You Should See

When deployment is successful:

```
✅ SSH connection established
✅ Backup completed
✅ Code pulled
✅ Docker image built
✅ Container started
✅ Health checks passed
✅ Deployment Successful!
```

And then:
- Frontend loads at http://159.89.175.168:5173
- Backend responds at http://159.89.175.168:3000
- Health endpoint returns OK

---

**Last Updated:** 2026-07-06  
**Status:** Ready for Deployment ✅

**Need help?** Check the troubleshooting table above or see `DEPLOY_DEV_SETUP.md`

