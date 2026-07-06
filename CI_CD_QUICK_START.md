# CPQ12 CI/CD - Quick Start Guide

**One-page reference for deploying CPQ12 automatically.**

---

## ⚡ 30-Second Overview

Push code to `feature/gstack-implementation` → GitHub Actions automatically builds, tests, and deploys to dev server → Done!

**No manual steps needed.** Everything is automatic.

---

## 🚀 How to Deploy (3 Steps)

### Step 1: Make Your Changes
```bash
# Edit your code
nano src/file.js

# Commit
git add .
git commit -m "Your commit message"
```

### Step 2: Push to Feature Branch
```bash
git push origin feature/gstack-implementation
```

### Step 3: Wait & Watch
- Go to GitHub Actions tab
- Watch workflow run (5-10 minutes)
- See deployment complete

**That's it! Deployment is automatic.**

---

## 🌐 Access Your App

After deployment succeeds:

| Service | URL |
|---------|-----|
| Frontend | http://159.89.175.168:5173 |
| Backend | http://159.89.175.168:3000 |
| Health | http://159.89.175.168:3000/health |

Test health endpoint:
```bash
curl http://159.89.175.168:3000/health
```

---

## 📊 Watch Deployment Progress

1. Go to https://github.com/Tharun2302/CPQ12
2. Click **Actions** tab
3. Click latest workflow run
4. See two jobs:
   - **build-and-test** (3-5 min) → Shows tests/build
   - **deploy-dev** (2-5 min) → Shows deployment

✅ Green checkmarks = Success
❌ Red X = Failed

---

## ✅ Success Criteria

- [ ] GitHub Actions shows ✅ for both jobs
- [ ] Deploy-dev job shows "SSH connection successful"
- [ ] Shows deployment summary with server URLs
- [ ] `curl http://159.89.175.168:3000/health` returns 200
- [ ] Can access frontend in browser
- [ ] Can access backend API

---

## ❌ Deployment Failed?

### 1. Check what failed
- Click workflow run
- Click job with ❌
- Scroll to "Deploy to development server" step
- Read error message

### 2. Common fixes

**Error: "deploy-dev job didn't appear"**
- Did build-and-test pass? (Check first)
- Did you push to `feature/gstack-implementation`? (Exact name)
- Wait 5 minutes and try again

**Error: "SSH connection failed"**
- Server might be down: `ping 159.89.175.168`
- Try manually: `ssh root@159.89.175.168`
- Ask DevOps team

**Error: "Health check failed"**
- Container might not be running properly
- Check logs: `ssh root@159.89.175.168` → `docker logs cpq12-dev`

### 3. Full troubleshooting
See: `CI_CD_AUTO_DEPLOY_GUIDE.md`

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | How deployment works |
| `scripts/deploy-dev.sh` | Actual deployment commands |
| `GITHUB_SECRETS_SETUP.md` | How to add secrets (DevOps) |
| `CI_CD_AUTO_DEPLOY_GUIDE.md` | Complete guide |
| `CI_CD_SETUP_CHECKLIST.md` | Setup verification |

---

## ⏱️ Timeline

- 0 sec: Push code
- 1 min: GitHub Actions starts build
- 3-5 min: Build & tests complete
- 2-5 min: Deployment runs
- **5-10 min total**: App is live!

---

## 🔍 Monitor Deployment

### In GitHub Actions
1. Actions tab → Latest run
2. Click "deploy-dev" job
3. View logs in real time
4. Look for:
   - "SSH connection successful" ✅
   - "Code pulled" ✅
   - "Docker image built" ✅
   - "Container started" ✅
   - "Health checks passed" ✅
   - "Deployment Successful!" ✅

### On Server (Optional)
```bash
# SSH to server
ssh root@159.89.175.168

# Check container
docker ps | grep cpq12

# View logs
docker logs cpq12-dev -f

# Check health
curl localhost:3000/health
```

---

## 🛑 Emergency Rollback

If deployment breaks everything:

```bash
# SSH to server
ssh root@159.89.175.168

# Stop broken container
docker stop cpq12-dev
docker rm cpq12-dev

# Check available backups
ls -la ~/CPQ12/backups/

# Let DevOps restore from backup
```

---

## 🤔 FAQ

**Q: How do I trigger deployment?**
A: Push to `feature/gstack-implementation` branch. That's it.

**Q: How long does deployment take?**
A: 5-10 minutes total (build + test + deploy).

**Q: What if I make a mistake in my commit?**
A: Push a new commit with fixes. Deployment will run again.

**Q: Do I need to do anything special?**
A: No. Push code → Everything else is automatic.

**Q: What if deployment fails?**
A: Check GitHub Actions logs. See troubleshooting section above.

**Q: Can I deploy to production?**
A: Not yet. Feature branch only deploys to dev. Contact DevOps for staging/production setup.

**Q: Do I need to know about Docker?**
A: No. Docker is handled automatically.

**Q: How do I know deployment succeeded?**
A: GitHub Actions shows green ✅ and app is accessible at the URLs.

---

## 📞 Need Help?

1. **Check GitHub Actions logs first** - Most answers are there
2. **Read `CI_CD_AUTO_DEPLOY_GUIDE.md`** - Detailed troubleshooting
3. **Check server health** - `curl http://159.89.175.168:3000/health`
4. **Ask DevOps team** - If server is down or secrets are wrong

---

## 🎯 Remember

✅ Push to `feature/gstack-implementation`
✅ GitHub Actions runs automatically
✅ Deployment takes 5-10 minutes
✅ Check GitHub Actions tab for status
✅ Access app at http://159.89.175.168:3000
✅ Report issues with logs from GitHub Actions

**Everything else is automatic!**

---

## 📚 Learn More

- Full guide: `CI_CD_AUTO_DEPLOY_GUIDE.md`
- Setup: `CI_CD_SETUP_CHECKLIST.md`
- Secrets: `GITHUB_SECRETS_SETUP.md`
- Summary: `CI_CD_DEPLOYMENT_SUMMARY.md`
