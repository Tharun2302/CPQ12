# CPQ12 CI/CD Automatic Deployment Guide

Complete guide to setting up and understanding automatic deployment via GitHub Actions CI/CD pipeline for CPQ12.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Workflow Diagram](#workflow-diagram)
4. [Configuration](#configuration)
5. [Deployment Process](#deployment-process)
6. [Monitoring & Troubleshooting](#monitoring--troubleshooting)
7. [Advanced Configuration](#advanced-configuration)

## Quick Start

### 5-Minute Setup

1. **Configure GitHub Secrets** (follow `GITHUB_SECRETS_SETUP.md`)
   ```
   Required Secrets:
   - DEPLOY_PASSWORD: CPQ@2025@TEAM
   - DEPLOY_HOST: 159.89.175.168
   - DEPLOY_USER: root
   - DEPLOY_PORT: 22
   ```

2. **Verify Workflow File**
   ```bash
   cat .github/workflows/deploy.yml
   ```

3. **Test Deployment**
   ```bash
   git push origin feature/gstack-implementation
   ```

4. **Monitor in GitHub Actions**
   - Go to repository Actions tab
   - Click on the workflow run
   - View build-and-test and deploy-dev jobs

## Architecture Overview

### Deployment Environments

The CPQ12 project uses three deployment environments:

```
┌─────────────────────────────────────────────────────────────┐
│                   GitHub Repository                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        GitHub Actions Workflow (deploy.yml)         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ▼          ▼          ▼
        ┌────────────┐ ┌────────────┐ ┌────────────┐
        │   BUILD    │ │   DEPLOY   │ │   DEPLOY   │
        │   & TEST   │ │     DEV    │ │  PRODUCTION│
        └────────────┘ └────────────┘ └────────────┘
                │          │          │
                └──────────┼──────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐        ┌─────────┐        ┌─────────┐
   │   ALL   │        │   DEV   │        │  PROD   │
   │ BRANCHES│        │ BRANCH: │        │ BRANCH: │
   │         │        │feature/ │        │  main/  │
   │  Tests  │        │gstack   │        │ master  │
   │  Lint   │        │         │        │         │
   │ Docker  │        │SSH:     │        │SSH:     │
   │  Build  │        │root@... │        │root@... │
   └─────────┘        └─────────┘        └─────────┘
```

### Workflow Trigger Points

| Branch | Trigger | Jobs | Deployment |
|--------|---------|------|------------|
| `feature/gstack-implementation` | Push | build-and-test, deploy-dev | Dev Server |
| `develop` | Push | build-and-test, deploy-staging | Staging Server |
| `main` / `master` | Push | build-and-test, deploy-production | Production Server |
| Pull Request to `main` | PR | build-and-test | None |

## Workflow Diagram

### Complete CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ EVENT: Push to feature/gstack-implementation Branch         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
         ┌──────────────────────────────────────┐
         │    Job: build-and-test (Required)    │
         └──────────────────────────────────────┘
         │
         ├─ Step: Checkout code
         ├─ Step: Setup Node.js 18
         ├─ Step: Install npm dependencies
         ├─ Step: Run linter
         ├─ Step: Run tests with coverage
         ├─ Step: Build frontend
         ├─ Step: Build Docker image
         ├─ Step: Run container tests
         │
         ├─ ✅ PASS → Continue to deploy-dev
         └─ ❌ FAIL → Stop, notification sent

                           │
                           ▼
         ┌──────────────────────────────────────┐
         │  Job: deploy-dev (if build passed)   │
         │  Runs: 1-5 minutes                   │
         └──────────────────────────────────────┘
         │
         ├─ Step: Checkout code
         ├─ Step: Install sshpass (SSH tool)
         │
         ├─ Step: Deploy to dev server
         │  ├─ Uses GitHub Secrets:
         │  │  ├─ DEPLOY_PASSWORD
         │  │  ├─ DEPLOY_HOST
         │  │  ├─ DEPLOY_USER
         │  │  └─ DEPLOY_PORT
         │  │
         │  └─ Runs: scripts/deploy-dev.sh
         │     ├─ Test SSH connection
         │     ├─ Create backup
         │     ├─ Stop existing container
         │     ├─ Pull latest code
         │     ├─ Build Docker image
         │     ├─ Start new container
         │     └─ Run health checks
         │
         ├─ Step: Notify success
         │  └─ Output: ✅ Deployment successful
         │
         ├─ ✅ SUCCESS → Deployment complete
         └─ ❌ FAIL → Notify failure, show logs

                           │
                           ▼
         ┌──────────────────────────────────────┐
         │   Job: notify (Final Status)         │
         │   Always runs (even if deploy fails) │
         └──────────────────────────────────────┘
         │
         └─ Output: CI/CD Pipeline completed
```

### Deploy Script Execution Flow

When `scripts/deploy-dev.sh` runs:

```
Deployment Script
│
├─ 1️⃣ Check sshpass installed
│     └─ Required for password-based SSH auth
│
├─ 2️⃣ Validate inputs
│     └─ DEPLOY_PASSWORD must be set
│
├─ 3️⃣ Test SSH connection
│     └─ Verify connectivity to dev server
│
├─ 4️⃣ Create backup
│     ├─ MongoDB database
│     └─ PostgreSQL database
│
├─ 5️⃣ Stop existing container
│     └─ docker stop cpq12-dev && docker rm cpq12-dev
│
├─ 6️⃣ Pull latest code
│     └─ git fetch && git checkout feature/gstack-implementation
│
├─ 7️⃣ Build Docker image
│     └─ docker build -t cpq12:dev-latest .
│
├─ 8️⃣ Start container
│     ├─ docker-compose up (if docker-compose.yml exists)
│     └─ Or: docker run with standard config
│
├─ 9️⃣ Wait for services
│     └─ Sleep 15 seconds for stability
│
├─ 🔟 Run health checks
│     ├─ Check container is running
│     ├─ Check backend health: curl http://localhost:3000/health
│     ├─ Check MongoDB running
│     └─ Check PostgreSQL running
│
└─ ✅ Success! Display deployment summary
       ├─ Backend: http://159.89.175.168:3000
       ├─ Frontend: http://159.89.175.168:5173
       ├─ MongoDB: mongodb://159.89.175.168:27017
       └─ PostgreSQL: postgresql://159.89.175.168:5432
```

## Configuration

### GitHub Actions Workflow File

**Location:** `.github/workflows/deploy.yml`

**Key Sections:**

#### Trigger Configuration
```yaml
on:
  push:
    branches: [main, master, develop, feature/gstack-implementation]
  pull_request:
    branches: [main, master]
```

- Triggers on push to feature/gstack-implementation
- Also triggers on develop (staging) and main (production)
- Triggers on pull requests to main

#### Build & Test Job
```yaml
build-and-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm ci
    - run: npm run lint
    - run: npm test -- --coverage
    - run: npm run build:frontend
    - run: docker build -t cpq12:${{ github.sha }} .
    - run: docker run --rm cpq12:${{ github.sha }} node -e "console.log('OK')"
```

#### Deploy Dev Job
```yaml
deploy-dev:
  needs: build-and-test
  if: github.ref == 'refs/heads/feature/gstack-implementation'
  runs-on: ubuntu-latest
  environment: development
  steps:
    - uses: actions/checkout@v3
    - run: sudo apt-get update && sudo apt-get install -y sshpass
    - run: bash ./scripts/deploy-dev.sh
      env:
        DEPLOY_PASSWORD: ${{ secrets.DEPLOY_PASSWORD }}
        DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
        DEPLOY_PORT: ${{ secrets.DEPLOY_PORT }}
        DEV_SERVER: ${{ secrets.DEPLOY_HOST }}
        DEV_USER: ${{ secrets.DEPLOY_USER }}
        DEV_PASSWORD: ${{ secrets.DEPLOY_PASSWORD }}
        DEV_PORT: ${{ secrets.DEPLOY_PORT }}
```

### Deployment Script

**Location:** `scripts/deploy-dev.sh`

**Key Configuration Variables:**

```bash
DEV_SERVER=${DEV_SERVER:-159.89.175.168}      # IP address
DEV_USER=${DEV_USER:-root}                    # SSH user
DEV_PASSWORD=${DEPLOY_PASSWORD:-}             # SSH password
DEV_PORT=${DEV_PORT:-22}                      # SSH port
APP_DIR="${APP_DIR:-~/CPQ12}"                 # App directory on server
BRANCH=${GIT_BRANCH:-feature/gstack-impl}     # Git branch to deploy
```

## Deployment Process

### Step-by-Step Manual Deployment

If you need to deploy manually without pushing code:

```bash
# 1. Export required secrets
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
export DEPLOY_HOST="159.89.175.168"
export DEPLOY_USER="root"
export DEPLOY_PORT="22"

# 2. Set environment variables for script
export DEV_SERVER=$DEPLOY_HOST
export DEV_USER=$DEPLOY_USER
export DEV_PASSWORD=$DEPLOY_PASSWORD
export DEV_PORT=$DEPLOY_PORT

# 3. Run deployment script
bash scripts/deploy-dev.sh
```

### Automatic Deployment Trigger

```bash
# 1. Make changes to code
git add .
git commit -m "Add new feature"

# 2. Push to feature branch
git push origin feature/gstack-implementation

# 3. GitHub Actions automatically:
#    - Runs build-and-test
#    - If successful, runs deploy-dev
#    - Pulls code, builds Docker image, starts container
#    - Runs health checks

# 4. Check status in GitHub Actions tab
#    https://github.com/Tharun2302/CPQ12/actions
```

### Rollback Procedure

If deployment causes issues:

```bash
# 1. SSH into dev server
ssh root@159.89.175.168

# 2. Stop current container
docker stop cpq12-dev
docker rm cpq12-dev

# 3. Restore from backup
cd ~/CPQ12/backups
ls -la  # List backups

# 4. Restore database if needed
mongorestore --out /backup_location backup_folder/mongo_backup

# 5. Restart previous version
cd ~/CPQ12
git checkout previous-commit-hash
docker build -t cpq12:dev-latest .
docker-compose up -d
# Or: docker run ...
```

## Monitoring & Troubleshooting

### View Deployment Logs

1. **GitHub Actions Tab**
   - Go to repository → Actions
   - Click the workflow run
   - Click "deploy-dev" job
   - View logs for each step

2. **Server Deployment Log**
   ```bash
   ssh root@159.89.175.168
   tail -f /tmp/cpq12-deploy-*.log
   ```

3. **Container Logs**
   ```bash
   ssh root@159.89.175.168
   docker logs cpq12-dev
   docker logs cpq12-dev -f  # Follow logs
   ```

### Common Issues & Solutions

#### Issue: "sshpass is not installed"
**Error in deploy-dev job**

**Solution:**
- GitHub Actions automatically runs: `sudo apt-get install -y sshpass`
- This is in the workflow, should work automatically
- If persistent, check runner image is ubuntu-latest

#### Issue: SSH Connection Timeout
**Error: "Failed to connect to root@159.89.175.168"**

**Solution:**
```bash
# Verify credentials
DEPLOY_PASSWORD="CPQ@2025@TEAM"
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "echo OK"

# Check if SSH password auth is enabled
ssh -v root@159.89.175.168  # -v for verbose

# Verify firewall allows SSH
sudo ufw allow 22/tcp
```

#### Issue: Docker Build Fails
**Error during docker build step**

**Solution:**
```bash
# SSH to server and check Docker
ssh root@159.89.175.168
docker --version
docker ps
docker ps -a  # See stopped containers
docker images  # Check image space

# Free up disk space if needed
docker system prune -a
```

#### Issue: Health Check Fails
**Error: "Backend health check failed"**

**Solution:**
```bash
# Check if container is running
docker ps

# View container logs
docker logs cpq12-dev

# Check if port 3000 is accessible
curl http://localhost:3000/health
curl http://159.89.175.168:3000/health

# Check env variables in container
docker exec cpq12-dev env | grep -E "NODE_ENV|MONGODB|POSTGRES"
```

#### Issue: Deployment Never Triggered
**No deploy-dev job appears in GitHub Actions**

**Solution:**
1. Verify secrets are set in GitHub Settings
2. Wait 5 minutes after adding secrets
3. Verify you're pushing to `feature/gstack-implementation` (exact name)
4. Check workflow file syntax: `.github/workflows/deploy.yml`
5. Review build-and-test results first (deploy depends on it)

### Deployment Status Checks

Monitor deployment health:

```bash
# 1. Check if service is running
curl http://159.89.175.168:3000/health

# 2. Check container
ssh root@159.89.175.168 "docker ps | grep cpq12"

# 3. Check recent deployments
ssh root@159.89.175.168 "ls -lht ~/CPQ12/backups/ | head"

# 4. Check logs
ssh root@159.89.175.168 "tail -100 /tmp/cpq12-deploy-*.log"

# 5. Health endpoints
Frontend: http://159.89.175.168:5173
Backend: http://159.89.175.168:3000
Backend Health: http://159.89.175.168:3000/health
API: http://159.89.175.168:3000/api
```

## Advanced Configuration

### Environment Variables

You can customize deployment by setting additional environment variables:

**In GitHub Secrets:**
```
Optional variables (can be added):
- APP_DIR: Application directory on server (default: ~/CPQ12)
- NODE_ENV: Environment (default: development)
- BACKUP_DIR: Backup location (default: ~/CPQ12/backups)
```

**In workflow file:**
```yaml
- run: bash ./scripts/deploy-dev.sh
  env:
    DEPLOY_PASSWORD: ${{ secrets.DEPLOY_PASSWORD }}
    APP_DIR: /opt/cpq12
    NODE_ENV: development
```

### Custom Deployment Hooks

Extend the deployment process by modifying `scripts/deploy-dev.sh`:

```bash
# Add custom health checks
# Add notification webhooks
# Add performance monitoring
# Add security scans
# Add database migrations
```

### Multiple Deployment Environments

To add more environments (e.g., QA, Integration):

1. **Create new deployment script:**
   ```bash
   cp scripts/deploy-dev.sh scripts/deploy-qa.sh
   ```

2. **Update variables:**
   ```bash
   QA_SERVER="other-server-ip"
   QA_USER="deploy-user"
   ```

3. **Add new job to workflow:**
   ```yaml
   deploy-qa:
     needs: build-and-test
     if: github.ref == 'refs/heads/qa'
     runs-on: ubuntu-latest
     steps:
       - run: bash ./scripts/deploy-qa.sh
         env:
           DEPLOY_PASSWORD: ${{ secrets.QA_DEPLOY_PASSWORD }}
   ```

4. **Add GitHub Secrets:**
   - QA_DEPLOY_PASSWORD
   - QA_DEPLOY_HOST
   - QA_DEPLOY_USER
   - QA_DEPLOY_PORT

### Conditional Deployments

Deploy only when specific files change:

```yaml
deploy-dev:
  needs: build-and-test
  if: >
    github.ref == 'refs/heads/feature/gstack-implementation' &&
    (
      contains(github.event.head_commit.modified, 'src/') ||
      contains(github.event.head_commit.modified, 'package.json') ||
      contains(github.event.head_commit.modified, 'Dockerfile')
    )
```

### Slack Notifications

Add deployment notifications to Slack:

```yaml
- name: Notify Slack on Success
  if: success()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "✅ CPQ12 deployed to dev!",
        "blocks": [
          {"type": "section", "text": {"type": "mrkdwn", "text": "*Deployment Successful*\n${{ github.event.head_commit.message }}"}}
        ]
      }
```

## Security Considerations

### Secret Management

- ✅ Secrets are encrypted by GitHub
- ✅ Only exposed to authorized Actions
- ✅ Never logged or displayed in workflow output
- ❌ Never hardcode credentials in workflow files
- ❌ Never print secrets in logs

### Access Control

- Limit Actions permissions in Settings → Actions
- Use environment approvals for production deployments
- Enable branch protection rules
- Require code reviews before merge to main

### SSH Security

- Use SSH keys instead of passwords when possible
- Change deployment password regularly
- Limit SSH access to GitHub Actions IP ranges
- Disable root SSH access if possible

## Maintenance

### Update Workflow

After changes to deployment script:

```bash
# Test locally first
bash scripts/deploy-dev.sh

# Commit and push
git add scripts/deploy-dev.sh
git commit -m "Update deployment script"
git push origin feature/gstack-implementation

# Workflow automatically uses updated script
```

### Monitor Deployment History

View all deployments in GitHub:
1. Go to Actions tab
2. Filter by "deploy-dev" workflow
3. Click each run to see logs
4. Check deployment timestamps and status

### Regular Backup Verification

```bash
# SSH to server and verify backups
ssh root@159.89.175.168

# Check backup directory
ls -lah ~/CPQ12/backups/

# Verify backup sizes
du -sh ~/CPQ12/backups/*

# List backup contents
ls ~/CPQ12/backups/backup_20240101_120000/
```

## Complete Setup Checklist

- [ ] Read GITHUB_SECRETS_SETUP.md
- [ ] Add all 4 GitHub Secrets (DEPLOY_PASSWORD, DEPLOY_HOST, DEPLOY_USER, DEPLOY_PORT)
- [ ] Verify secrets are listed in Settings → Secrets and variables
- [ ] Review .github/workflows/deploy.yml file
- [ ] Verify scripts/deploy-dev.sh exists and is executable
- [ ] Test SSH connection manually:
  ```bash
  export DEPLOY_PASSWORD="CPQ@2025@TEAM"
  sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "echo OK"
  ```
- [ ] Make a test push to feature/gstack-implementation branch
- [ ] Monitor deployment in GitHub Actions tab
- [ ] Verify app is running: `curl http://159.89.175.168:3000/health`
- [ ] Check application works in browser at http://159.89.175.168:3000
- [ ] Review deployment logs for any issues
- [ ] Update team on deployment automation being active

## Support & Resources

- **GitHub Actions Documentation:** https://docs.github.com/en/actions
- **sshpass Manual:** https://linux.die.net/man/1/sshpass
- **Docker Documentation:** https://docs.docker.com/
- **Repository Actions:** https://github.com/Tharun2302/CPQ12/actions

## Summary

CPQ12 now has **fully automatic CI/CD deployment** enabled:

✅ Push to feature/gstack-implementation
✅ GitHub Actions automatically builds and tests
✅ If tests pass, automatically deploys to dev server
✅ Health checks verify deployment succeeded
✅ Complete logs available in GitHub Actions tab
✅ Rollback procedure available if needed
