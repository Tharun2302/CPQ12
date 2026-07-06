# CI/CD Automatic Deployment - Setup Checklist

Complete setup checklist for enabling automatic CI/CD deployment to the development server.

## Pre-Setup Verification

### Server Access Test
```bash
# Verify server credentials work
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "echo 'Server accessible!'"
```

- [ ] Server responds to SSH connection
- [ ] Password authentication is working
- [ ] Port 22 is accessible from your machine

### Local Environment
```bash
# Verify git and tools
git --version
node --version
npm --version
docker --version
```

- [ ] Git installed
- [ ] Node.js 18+ installed
- [ ] npm installed
- [ ] Docker installed and running

## Step 1: Configure GitHub Secrets (REQUIRED)

This is the critical step for automation to work.

### 1.1 Access GitHub Secrets

- [ ] Go to: https://github.com/Tharun2302/CPQ12
- [ ] Click **Settings** tab
- [ ] Click **Secrets and variables** → **Actions** (left sidebar)
- [ ] You should see empty secrets list

### 1.2 Create Development Environment

- [ ] Click **Environments** in left sidebar
- [ ] Click **New environment**
- [ ] Name: `development` (exactly)
- [ ] Click **Configure environment**

### 1.3 Add GitHub Secrets

For each secret below, click **New repository secret** and add:

#### Secret #1: DEPLOY_PASSWORD
- [ ] Name: `DEPLOY_PASSWORD`
- [ ] Value: `CPQ@2025@TEAM`
- [ ] Click **Add secret**

#### Secret #2: DEPLOY_HOST
- [ ] Name: `DEPLOY_HOST`
- [ ] Value: `159.89.175.168`
- [ ] Click **Add secret**

#### Secret #3: DEPLOY_USER
- [ ] Name: `DEPLOY_USER`
- [ ] Value: `root`
- [ ] Click **Add secret**

#### Secret #4: DEPLOY_PORT
- [ ] Name: `DEPLOY_PORT`
- [ ] Value: `22`
- [ ] Click **Add secret**

### 1.4 Verify All Secrets

- [ ] Go to Settings → Secrets and variables → Actions
- [ ] You should see all 4 secrets:
  - DEPLOY_PASSWORD (Last updated: [timestamp])
  - DEPLOY_HOST (Last updated: [timestamp])
  - DEPLOY_USER (Last updated: [timestamp])
  - DEPLOY_PORT (Last updated: [timestamp])
- [ ] No secret values are visible (masked/dots only)
- [ ] Wait **5 minutes** before proceeding

## Step 2: Verify Workflow Configuration

### 2.1 Check Workflow File

```bash
# Verify workflow file exists
cat .github/workflows/deploy.yml
```

- [ ] File exists at `.github/workflows/deploy.yml`
- [ ] Contains `deploy-dev` job
- [ ] Trigger is `feature/gstack-implementation` branch

### 2.2 Review Workflow Content

Check that workflow includes:

```yaml
deploy-dev:
  needs: build-and-test
  if: github.ref == 'refs/heads/feature/gstack-implementation'
  runs-on: ubuntu-latest
  environment: development
  
  steps:
    - uses: actions/checkout@v3
    - name: Install sshpass
      run: sudo apt-get update && sudo apt-get install -y sshpass
    - name: Deploy to development server
      env:
        DEPLOY_PASSWORD: ${{ secrets.DEPLOY_PASSWORD }}
        DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
        DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
        DEPLOY_PORT: ${{ secrets.DEPLOY_PORT }}
      run: bash ./scripts/deploy-dev.sh
```

- [ ] `deploy-dev` job exists
- [ ] Depends on `build-and-test` job
- [ ] Triggered only on `feature/gstack-implementation` branch
- [ ] Uses all 4 secrets from GitHub
- [ ] Installs `sshpass` for password auth
- [ ] Runs `scripts/deploy-dev.sh`

### 2.3 Check Deployment Script

```bash
# Verify deployment script exists
ls -la scripts/deploy-dev.sh
```

- [ ] File exists at `scripts/deploy-dev.sh`
- [ ] File is executable (755 permissions)
- [ ] Contains SSH connection logic
- [ ] Contains health check logic

## Step 3: Test Automatic Deployment

### 3.1 Create Test Commit

```bash
# Create a small test change
echo "# Deployment Test - $(date)" >> README.md

# Stage and commit
git add README.md
git commit -m "Test: CI/CD automatic deployment trigger"
```

- [ ] Commit created with clear message
- [ ] Shows your deployment test

### 3.2 Push to Feature Branch

```bash
# Push to feature/gstack-implementation
git push origin feature/gstack-implementation
```

- [ ] Code pushed to remote
- [ ] No push errors
- [ ] Branch is `feature/gstack-implementation` (exact name)

### 3.3 Monitor GitHub Actions

- [ ] Go to repository → **Actions** tab
- [ ] Click latest workflow run (should be your test commit)
- [ ] Watch for these jobs in order:
  1. ✅ **build-and-test** (3-5 minutes)
  2. ✅ **deploy-dev** (2-5 minutes) - appears after build passes
  3. ✅ **notify** - final status

### 3.4 Verify Build Success

In **build-and-test** job:
- [ ] Checkout code ✅
- [ ] Setup Node.js ✅
- [ ] Install dependencies ✅
- [ ] Run linter ✅ (may be skipped)
- [ ] Run tests ✅ (may be skipped)
- [ ] Build frontend ✅ (may be skipped)
- [ ] Build Docker image ✅
- [ ] Run container tests ✅

### 3.5 Verify Deployment Success

In **deploy-dev** job:
- [ ] Checkout code ✅
- [ ] Install sshpass ✅
- [ ] Deploy to development server ✅

View detailed logs:
```
🔗 Testing SSH connection to root@159.89.175.168:22...
✅ SSH connection established

💾 Creating backup...
✅ Backup completed

🛑 Stopping existing container...
✅ Container stopped

📦 Pulling latest code from feature/gstack-implementation...
✅ Code pulled

🐳 Building Docker image...
✅ Docker image built

▶️ Starting new container...
✅ Container started

⏳ Waiting for services to stabilize...

🏥 Running health checks...
✅ Health checks passed

========================================
✅ Deployment Successful!
========================================
Backend: http://159.89.175.168:3000
Frontend: http://159.89.175.168:5173
MongoDB: mongodb://159.89.175.168:27017
PostgreSQL: postgresql://159.89.175.168:5432
========================================
```

- [ ] All steps show ✅ (green checkmarks)
- [ ] Deployment summary displays successfully
- [ ] No error messages
- [ ] No authentication failures

## Step 4: Verify Application Deployed

### 4.1 Test Backend Endpoint

```bash
# Test health check endpoint
curl http://159.89.175.168:3000/health

# Should return: 200 OK or success response
```

- [ ] Backend responds to HTTP requests
- [ ] Health check endpoint returns success
- [ ] No connection errors

### 4.2 Test Frontend Access

```bash
# Open in browser (or curl)
curl http://159.89.175.168:5173/
curl http://159.89.175.168:3000/
```

- [ ] Frontend is accessible (http://159.89.175.168:5173)
- [ ] Backend is accessible (http://159.89.175.168:3000)
- [ ] No DNS resolution errors
- [ ] No connection refused errors

### 4.3 SSH to Server and Verify

```bash
# SSH to development server
ssh root@159.89.175.168

# Check running containers
docker ps | grep cpq12

# Check container logs
docker logs cpq12-dev | tail -20

# Check deployment log
ls -lt /tmp/cpq12-deploy-*.log
tail -50 /tmp/cpq12-deploy-*.log
```

- [ ] Container `cpq12-dev` is running
- [ ] Docker shows container as "Up" (not exited)
- [ ] Container logs show no errors
- [ ] Deployment log shows successful completion

## Step 5: Test with Actual Code Change

### 5.1 Make Real Code Change

```bash
# Make a meaningful change to the codebase
# For example, update a file in src/
nano src/example.js

# Stage and commit
git add src/
git commit -m "Feature: Add new capability to CPQ12"
```

- [ ] Real code change committed (not just README)
- [ ] Meaningful change that exercises the build

### 5.2 Push and Monitor

```bash
# Push the change
git push origin feature/gstack-implementation
```

- [ ] Code pushed successfully
- [ ] Workflow triggered automatically

### 5.3 Verify Deployment

- [ ] Check GitHub Actions tab for new run
- [ ] Verify build passes with your code changes
- [ ] Verify deploy-dev job runs and succeeds
- [ ] Verify application still runs after deployment
- [ ] Check backend is accessible
- [ ] Check frontend is accessible

## Step 6: Documentation Setup

### 6.1 GitHub Secrets Documentation
- [ ] Read: `GITHUB_SECRETS_SETUP.md`
- [ ] Understand: How secrets are stored and used
- [ ] Reference: For troubleshooting secret-related issues

### 6.2 CI/CD Automation Guide
- [ ] Read: `CI_CD_AUTO_DEPLOY_GUIDE.md`
- [ ] Understand: Complete workflow architecture
- [ ] Reference: For understanding deployment flow

### 6.3 This Checklist
- [ ] Review: `CI_CD_SETUP_CHECKLIST.md` (this file)
- [ ] Bookmark: For future reference
- [ ] Share: With team members

## Step 7: Team Communication

- [ ] Notify team that automatic deployment is enabled
- [ ] Share documentation links:
  - GITHUB_SECRETS_SETUP.md
  - CI_CD_AUTO_DEPLOY_GUIDE.md
  - CI_CD_SETUP_CHECKLIST.md
- [ ] Explain workflow: Push → Automatic Deploy
- [ ] Share dev server URLs:
  - Frontend: http://159.89.175.168:5173
  - Backend: http://159.89.175.168:3000
  - Health: http://159.89.175.168:3000/health
- [ ] Provide troubleshooting guide
- [ ] Set expectations for deployment time (5-10 minutes)

## Troubleshooting Quick Reference

### Secrets Not Working
```
Problem: "Error: DEV_PASSWORD environment variable is required"
Solution:
  1. Verify all 4 secrets in GitHub (Settings → Secrets)
  2. Wait 5 minutes after adding secrets
  3. Check secret names (case-sensitive)
  4. Try triggering workflow again
```

### Build Fails
```
Problem: build-and-test job fails
Solution:
  1. Review build-and-test logs for error
  2. Check code has no syntax errors: npm test
  3. Verify Docker builds locally: docker build -t cpq12 .
  4. Fix issues locally before pushing
```

### Deploy Job Never Appears
```
Problem: deploy-dev job doesn't run
Solution:
  1. Verify build-and-test passes first
  2. Check branch name is exactly: feature/gstack-implementation
  3. Verify workflow file exists: .github/workflows/deploy.yml
  4. Wait for build to complete (5+ minutes)
```

### SSH Connection Fails
```
Problem: "Failed to connect to root@159.89.175.168"
Solution:
  1. Test password manually:
     export DEPLOY_PASSWORD="CPQ@2025@TEAM"
     sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "echo OK"
  2. Verify password is correct
  3. Verify server IP is correct
  4. Check firewall allows SSH from GitHub
```

### Health Check Fails
```
Problem: "Backend health check failed"
Solution:
  1. Check container is running: docker ps | grep cpq12
  2. View logs: docker logs cpq12-dev
  3. Test endpoint: curl http://localhost:3000/health
  4. Check port 3000 is accessible
```

## Final Verification

Run through this before considering setup complete:

- [ ] All 4 GitHub Secrets are configured
- [ ] Workflow file is correct (.github/workflows/deploy.yml)
- [ ] Deployment script exists and is executable
- [ ] Test push triggered automatic deployment
- [ ] Build-and-test job passed
- [ ] Deploy-dev job ran and completed
- [ ] Application is running on dev server
- [ ] Backend health endpoint responds
- [ ] Frontend is accessible in browser
- [ ] Documentation is understood by team
- [ ] Team is notified of automation

## Post-Setup Maintenance

### Weekly Checks
- [ ] Verify recent deployments succeeded
- [ ] Check GitHub Actions run history
- [ ] Monitor deployment logs for issues
- [ ] Verify application is still running

### Monthly Checks
- [ ] Review deployment performance
- [ ] Check backup integrity
- [ ] Verify recovery procedure works
- [ ] Update documentation if needed
- [ ] Rotate deployment credentials

### When Needed
- [ ] Update deployment script if process changes
- [ ] Update secrets if credentials change
- [ ] Update GitHub Actions if GitHub releases new versions
- [ ] Add new deployment environments if needed

## Success Criteria

✅ **Setup is complete when:**

1. **Automatic Triggering** - Pushing to feature branch automatically starts GitHub Actions
2. **Build Success** - build-and-test job completes without errors
3. **Automatic Deployment** - deploy-dev job runs automatically after build passes
4. **Deployment Success** - Application is deployed and running on dev server
5. **Health Verification** - Health checks pass and application endpoints respond
6. **Documentation** - Team understands the automation and process
7. **No Manual Steps** - Entire flow works without manual intervention

## Support Contacts

For issues:
- Check GitHub Actions logs first
- Review CI_CD_AUTO_DEPLOY_GUIDE.md troubleshooting section
- Review GITHUB_SECRETS_SETUP.md for credential issues
- Verify server connectivity manually

## Files Reference

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | GitHub Actions workflow definition |
| `scripts/deploy-dev.sh` | Deployment script for dev server |
| `GITHUB_SECRETS_SETUP.md` | Step-by-step GitHub Secrets configuration |
| `CI_CD_AUTO_DEPLOY_GUIDE.md` | Complete CI/CD automation guide |
| `CI_CD_SETUP_CHECKLIST.md` | This file - setup verification checklist |

## Next Steps After Setup

1. **Integrate with monitoring** - Add error tracking/monitoring
2. **Setup Slack notifications** - Get deployment alerts in Slack
3. **Add performance tests** - Monitor deployment performance
4. **Setup staging automation** - Enable staging deployment (develop branch)
5. **Setup production deployment** - Enable production deployment (main branch)
6. **Create runbooks** - Document incident response procedures
7. **Team training** - Train team on new deployment workflow

---

**Last Updated:** 2024
**Status:** Ready for Deployment
**Deployment Target:** Development Server (159.89.175.168)
**Branch:** feature/gstack-implementation
