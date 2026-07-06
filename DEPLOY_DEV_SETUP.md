# CPQ12 Development Server Deployment Guide

**Date:** 2026-07-06  
**Server:** 159.89.175.168  
**OS:** Ubuntu 25.04  
**Environment:** Development

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Server Setup](#server-setup)
4. [Deployment Process](#deployment-process)
5. [Health Checks](#health-checks)
6. [Rollback Procedures](#rollback-procedures)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)
9. [Security Considerations](#security-considerations)

---

## Overview

This document provides complete instructions for deploying the CPQ12 application to the development server at `159.89.175.168`. The deployment uses:

- **Docker & Docker Compose** for containerization
- **Password-based SSH authentication** for remote access
- **Automated deployment scripts** for consistency and reliability
- **Health checks** for service verification
- **Backup and rollback** procedures for safety

### Architecture

```
Local Development Machine
    ↓
SSH to Dev Server (159.89.175.168:22)
    ↓
Pull Code from GitHub (feature/gstack-implementation)
    ↓
Build Docker Image
    ↓
Stop Old Container
    ↓
Start New Container via docker-compose
    ↓
Run Health Checks
    ↓
Deployment Complete ✅
```

---

## Prerequisites

### Local Machine Requirements

- **sshpass** - for password-based SSH authentication
  
  Install on your system:
  ```bash
  # Ubuntu/Debian
  sudo apt-get install sshpass
  
  # macOS
  brew install sshpass
  
  # Windows (WSL/Git Bash)
  sudo apt-get install sshpass
  ```

- **bash** - shell environment
- **curl** - for health checks
- **git** - to clone/manage the repository

### Server Requirements

Server must already have (verified at 159.89.175.168):
- ✅ Docker installed
- ✅ Docker Compose installed
- ✅ Node.js 18+
- ✅ Ubuntu 25.04
- ✅ SSH access on port 22
- ✅ Internet connectivity

---

## Server Setup

### 1. Verify Server Access

Test SSH connection to the development server:

```bash
# Test SSH connection
sshpass -p 'CPQ@2025@TEAM' ssh -o StrictHostKeyChecking=no root@159.89.175.168 "uname -a"

# Expected output: Linux cpq-dev-server 6.8.0-31-generic #31-Ubuntu SMP ...
```

### 2. Verify Docker Installation

```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker --version && docker-compose --version"

# Expected:
# Docker version 25.0.0, build abc1234
# Docker Compose version v2.20.0
```

### 3. Prepare Deployment Path

```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 << 'EOF'
  mkdir -p ~/CPQ12
  mkdir -p ~/CPQ12/backups
  cd ~/CPQ12
  echo "Deployment path ready"
EOF
```

### 4. Initialize Git Repository (if needed)

```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 << 'EOF'
  cd ~/CPQ12
  if [ ! -d .git ]; then
    git init
    git remote add origin https://github.com/Tharun2302/CPQ12.git
    echo "Git repository initialized"
  fi
EOF
```

---

## Deployment Process

### Automated Deployment

#### 1. Basic Deployment (Default Settings)

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/deploy-dev.sh
```

#### 2. Custom Configuration

Set environment variables before running deployment:

```bash
export DEV_SERVER="159.89.175.168"
export DEV_USER="root"
export DEV_PASSWORD="CPQ@2025@TEAM"
export DEV_PORT="22"
export APP_DIR="~/CPQ12"
export GIT_BRANCH="feature/gstack-implementation"
export BACKUP_DIR="~/CPQ12/backups"

bash scripts/deploy-dev.sh
```

#### 3. With Specific Git Branch

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
export GIT_BRANCH="main"
bash scripts/deploy-dev.sh
```

### Step-by-Step Deployment Breakdown

The deployment script automatically performs these steps:

#### Step 1: Connection & Validation
```
✓ Verify sshpass is installed
✓ Validate environment variables
✓ Test SSH connection to server
```

#### Step 2: Backup
```
✓ Create timestamped backup directory
✓ Backup MongoDB data
✓ Backup PostgreSQL data
```

#### Step 3: Code Update
```
✓ Stop existing container
✓ Pull latest code from git
✓ Checkout feature/gstack-implementation branch
```

#### Step 4: Build
```
✓ Build Docker image with tag cpq12:dev-latest
✓ Report build status
```

#### Step 5: Deploy
```
✓ Stop old container (if running)
✓ Remove old container
✓ Start new container with docker-compose
✓ Configure environment variables
```

#### Step 6: Verification
```
✓ Wait 15 seconds for services to stabilize
✓ Verify container is running
✓ Check backend /health endpoint
✓ Verify MongoDB connection
✓ Verify PostgreSQL connection
```

### Deployment Output Example

```
2026-07-06 14:30:00 [INFO] 🚀 CPQ12 Development Deployment
2026-07-06 14:30:00 [INFO] 🔗 Testing SSH connection...
2026-07-06 14:30:01 [INFO] ✅ SSH connection established
2026-07-06 14:30:02 [INFO] 💾 Creating backup...
2026-07-06 14:30:05 [INFO] ✅ Backup completed
2026-07-06 14:30:06 [INFO] 📦 Pulling latest code...
2026-07-06 14:30:12 [INFO] ✅ Code pulled
2026-07-06 14:30:13 [INFO] 🐳 Building Docker image...
2026-07-06 14:30:45 [INFO] ✅ Docker image built
2026-07-06 14:30:46 [INFO] ▶️ Starting new container...
2026-07-06 14:30:47 [INFO] ✅ Container started
2026-07-06 14:30:48 [INFO] ⏳ Waiting for services to stabilize...
2026-07-06 14:31:03 [INFO] 🏥 Running health checks...
2026-07-06 14:31:05 [INFO] ✅ Health checks passed
2026-07-06 14:31:05 [INFO] ✅ Deployment Successful!
```

---

## Health Checks

### Running Health Checks

#### Single Health Check

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh
```

#### Continuous Monitoring (Every 30 seconds)

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh --continuous
```

#### Custom Check Interval (Every 60 seconds)

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
CHECK_INTERVAL=60 bash scripts/health-check-dev.sh --continuous
```

### Health Check Verification Points

The health check script verifies:

```
✓ SSH Connection          - Can reach the server
✓ Docker Daemon          - Docker service is running
✓ Container Status       - cpq12-dev container is running
✓ Backend Health         - /health endpoint returns 200
✓ MongoDB Connection     - Database is accessible
✓ PostgreSQL Connection  - Database is accessible
✓ Disk Space             - At least 10% free (warns at 80%, critical at 90%)
✓ Memory Usage           - Sufficient RAM available (warns at 80%)
```

### Health Check Output Example

```
[2026-07-06 14:35:00] 🔍 Running health checks for CPQ12 Development Server
[2026-07-06 14:35:00] 🔗 Checking SSH connection...
[2026-07-06 14:35:01] ✅ SSH connection OK
[2026-07-06 14:35:02] 🐳 Checking Docker daemon...
[2026-07-06 14:35:02] ✅ Docker daemon OK
[2026-07-06 14:35:02] 📦 Checking CPQ12 container...
[2026-07-06 14:35:03] ✅ Container is running
[2026-07-06 14:35:03] 🏥 Checking backend health...
[2026-07-06 14:35:04] ✅ Backend health check OK
[2026-07-06 14:35:04] 🗄️ Checking MongoDB...
[2026-07-06 14:35:05] ✅ MongoDB OK
[2026-07-06 14:35:05] 🗄️ Checking PostgreSQL...
[2026-07-06 14:35:06] ✅ PostgreSQL OK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Health Check Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Docker: OK
✅ Container: Running
✅ Backend: OK
✅ MongoDB: OK
✅ PostgreSQL: OK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Overall Status: HEALTHY ✨
```

### Accessing Services After Deployment

Once deployment is successful, services are accessible at:

```
Frontend:    http://159.89.175.168:5173
Backend:     http://159.89.175.168:3000
Health:      http://159.89.175.168:3000/health
MongoDB:     mongodb://159.89.175.168:27017
PostgreSQL:  postgresql://159.89.175.168:5432
```

---

## Rollback Procedures

### Emergency Rollback

Use rollback when a deployment causes issues and you need to revert to a previous working version.

#### Interactive Rollback (Recommended)

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh
```

You'll be prompted with options:
```
1) Rollback to previous git commit (HEAD~1)
2) Rollback to specific git commit
3) Restore from backup
4) Cancel
```

#### Rollback to Previous Commit

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh HEAD~1
```

#### Rollback to Specific Commit

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh abc1234567
```

To find commit hashes:
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "cd ~/CPQ12 && git log --oneline -20"
```

#### Restore from Database Backup

First, list available backups:
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "ls -1dt ~/CPQ12/backups/backup_* | head -10"
```

Then restore:
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh backup_20260706_143000
```

### Rollback Procedure Details

The rollback script performs:

```
1. Stop current container
2. Reset to specified git commit or restore from backup
3. Rebuild Docker image
4. Start new container
5. Wait for services to stabilize
6. Run health checks
7. Report status
```

### Backup Locations

Backups are stored at: `~/CPQ12/backups/backup_<timestamp>/`

Each backup contains:
```
backup_20260706_143000/
├── mongo_backup/          # MongoDB data dump
└── postgres_backup.sql    # PostgreSQL data dump
```

To manually inspect backups:
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "ls -la ~/CPQ12/backups/"
```

---

## Monitoring

### Container Status

```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker ps -a | grep cpq12"
```

### View Container Logs

```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs -f cpq12-dev"
```

Last 100 lines:
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs --tail 100 cpq12-dev"
```

### Monitor Resource Usage

```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker stats cpq12-dev"
```

### Check Disk Usage

```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "df -h / && du -sh ~/CPQ12"
```

### Database Status

Check MongoDB:
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker exec cpq12-dev mongosh localhost:27017 --eval 'db.adminCommand(\"serverStatus\")' --quiet"
```

Check PostgreSQL:
```bash
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker exec cpq12-dev pg_isready -U cpq12 -h localhost"
```

---

## Troubleshooting

### Issue: sshpass Command Not Found

**Solution:**
```bash
# Install sshpass
sudo apt-get install sshpass    # Ubuntu/Debian
brew install sshpass             # macOS
```

### Issue: Connection Refused

**Problem:** `ssh: connect to host 159.89.175.168 port 22: Connection refused`

**Solutions:**
1. Verify server IP: `ping 159.89.175.168`
2. Check SSH port: `ssh -p 22 root@159.89.175.168`
3. Verify firewall allows port 22
4. Check if server is online

### Issue: Authentication Failed

**Problem:** `Permission denied (publickey,password).`

**Solutions:**
1. Verify password: `echo $DEPLOY_PASSWORD`
2. Try SSH directly: `sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168`
3. Check if account is locked
4. Verify credentials with administrator

### Issue: Docker Image Build Fails

**Problem:** `ERROR: failed to solve: error executing: command exited with status 1`

**Solutions:**
```bash
# View build logs
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker build -t cpq12:debug . 2>&1 | tail -50"

# Check Docker daemon
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker ps"

# Check disk space
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "df -h"
```

### Issue: Container Won't Start

**Problem:** `Error response from daemon: container already exists`

**Solutions:**
```bash
# Remove old container
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker rm -f cpq12-dev"

# Try deployment again
bash scripts/deploy-dev.sh
```

### Issue: Health Check Fails

**Problem:** `Backend health check FAILED`

**Solutions:**
```bash
# Check application logs
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs cpq12-dev | tail -50"

# Check database connectivity
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker ps | grep -E 'mongo|postgres'"

# Manually test backend
curl http://159.89.175.168:3000/health
```

### Issue: Disk Space Running Out

**Problem:** `No space left on device`

**Solutions:**
```bash
# Check disk usage
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "df -h && du -sh ~/CPQ12/*"

# Clean up old Docker images
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker image prune -a --force"

# Clean up old backups (keep last 5)
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "cd ~/CPQ12/backups && ls -1dt backup_* | tail -n +6 | xargs rm -rf"
```

### Issue: Database Connection Error

**Problem:** `MongoDB connection timeout` or `PostgreSQL connection refused`

**Solutions:**
```bash
# Check if databases are running
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker ps | grep -E 'mongo|postgres'"

# Restart databases
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "cd ~/CPQ12 && docker-compose restart mongo postgres"

# View database logs
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs mongo"
```

### Debug Mode

For detailed troubleshooting:

```bash
# Enable verbose SSH output
export SSH_OPTS="-vvv"
bash scripts/deploy-dev.sh

# Check deployment logs
cat /tmp/cpq12-deploy-*.log
```

---

## Security Considerations

### Password Management

**⚠️ Important Security Notes:**

1. **Never commit passwords** to version control
2. **Use environment variables** for sensitive data
3. **Recommended: Set up SSH keys** instead of password authentication

### Setting Up SSH Key Authentication

For better security, configure SSH keys:

```bash
# Generate SSH key (one-time setup)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/cpq12_deploy_key -N ""

# Copy public key to server
sshpass -p 'CPQ@2025@TEAM' ssh-copy-id -i ~/.ssh/cpq12_deploy_key.pub -p 22 root@159.89.175.168

# Update deployment scripts to use key
export SSH_KEY_PATH="~/.ssh/cpq12_deploy_key"

# Then use SSH key instead of password
ssh -i ~/.ssh/cpq12_deploy_key root@159.89.175.168
```

### Best Practices

1. **Rotate credentials regularly**
2. **Limit SSH access** to authorized IPs only
3. **Use strong passwords** (already: CPQ@2025@TEAM)
4. **Enable firewall rules** to restrict SSH port 22
5. **Monitor SSH logs** for suspicious activity
6. **Use different passwords** for different environments
7. **Store credentials securely** (password manager, vaults)
8. **Disable root SSH login** in production (use sudo)

### Environment Variables

Store sensitive data in environment files:

```bash
# Create ~/.env-cpq12-deploy (NOT in git)
cat > ~/.env-cpq12-deploy << 'EOF'
export DEV_SERVER="159.89.175.168"
export DEV_USER="root"
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
export DEV_PORT="22"
EOF

# Load before deployment
source ~/.env-cpq12-deploy
bash scripts/deploy-dev.sh
```

---

## Deployment Checklist

Use this checklist before each deployment:

```
Pre-Deployment Checklist:
☐ Verify DEPLOY_PASSWORD is set
☐ Test SSH connection manually
☐ Verify Docker is running on server
☐ Check server disk space (at least 10GB free)
☐ Backup database (manually if needed)
☐ Notify team of deployment window

Deployment:
☐ Run: DEPLOY_PASSWORD="..." bash scripts/deploy-dev.sh
☐ Monitor deployment progress
☐ Wait for health checks to pass
☐ Verify all services are running

Post-Deployment Verification:
☐ Test frontend: http://159.89.175.168:5173
☐ Test backend: http://159.89.175.168:3000
☐ Test health: http://159.89.175.168:3000/health
☐ Run: bash scripts/health-check-dev.sh
☐ Check logs: docker logs cpq12-dev
☐ Notify team deployment is complete
```

---

## Quick Reference

### Most Common Commands

```bash
# Deploy latest code
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/deploy-dev.sh

# Check health
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh

# Monitor continuously
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh --continuous

# Rollback (interactive)
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh

# View logs
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs -f cpq12-dev"

# Container status
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker ps"
```

---

## Support & Documentation

For additional help:

1. **Check deployment logs:** `/tmp/cpq12-deploy-*.log`
2. **View container logs:** `docker logs cpq12-dev`
3. **GitHub Issues:** https://github.com/Tharun2302/CPQ12/issues
4. **Project Documentation:** See DEPLOYMENT_GUIDE.md

---

## Deployment Files

Location of deployment scripts:
- `scripts/deploy-dev.sh` - Main deployment script
- `scripts/health-check-dev.sh` - Health monitoring
- `scripts/rollback-dev.sh` - Rollback procedure
- `DEPLOY_DEV_SETUP.md` - This documentation
- `docker-compose.yml` - Container configuration

---

**Last Updated:** 2026-07-06  
**Version:** 1.0  
**Status:** Ready for Production Deployment ✅

