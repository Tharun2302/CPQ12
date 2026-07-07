# GitHub Secrets Setup Guide

## Quick Setup (5 minutes)

### What You Need
- SSH password for `<DEV_SERVER_USER>@<DEV_SERVER_IP>`
- GitHub repository admin access

### Step 1: Open GitHub Settings
1. Go to: https://github.com/Tharun2302/CPQ12
2. Click **Settings** (top right tab)
3. Click **Secrets and variables** → **Actions** (left sidebar)

### Step 2: Add DEPLOY_PASSWORD
1. Click **New repository secret**
2. Name: `DEPLOY_PASSWORD`
3. Secret: `<paste-ssh-password-here>`
4. Click **Add secret**

### Step 3: Add DEPLOY_HOST
1. Click **New repository secret**
2. Name: `DEPLOY_HOST`
3. Secret: `<DEV_SERVER_IP>`
4. Click **Add secret**

### Step 4: Add DEPLOY_USER
1. Click **New repository secret**
2. Name: `DEPLOY_USER`
3. Secret: `<DEV_SERVER_USER>`
4. Click **Add secret**

### Step 5: Add DEPLOY_PORT
1. Click **New repository secret**
2. Name: `DEPLOY_PORT`
3. Secret: `22`
4. Click **Add secret**

### Step 6: Verify All Secrets Are Added
You should see in the **Repository secrets** section:
- ✅ DEPLOY_PASSWORD (will show as masked)
- ✅ DEPLOY_HOST
- ✅ DEPLOY_USER
- ✅ DEPLOY_PORT

---

## Deploy Now!

Once all 4 secrets are added:

```bash
# Push code to trigger deployment
git push origin feature/gstack-implementation
```

Or manually trigger the workflow:
1. Go to https://github.com/Tharun2302/CPQ12/actions
2. Select "CI/CD Pipeline" workflow
3. Click **Run workflow**
4. Select **feature/gstack-implementation** branch
5. Click **Run workflow**

---

## Monitor Deployment

1. Go to: https://github.com/Tharun2302/CPQ12/actions
2. Click on the running workflow
3. Watch the deployment progress
4. When complete, you'll see:
   - ✅ build-and-test (passed)
   - ✅ deploy-dev (passed)

### Access Deployed Services

After successful deployment:
- **Backend API:** http://<DEV_SERVER_IP>:3000
- **Frontend App:** http://<DEV_SERVER_IP>:5173

---

## Troubleshooting

### "Failed to connect to server"
- Check DEPLOY_PASSWORD is correct
- Check DEPLOY_HOST is `<DEV_SERVER_IP>`
- Verify server is accessible

### "sshpass: command not found"
- Workflow should install it automatically
- Check GitHub Actions logs

### Container fails to start
- Check server has Docker installed
- Verify sufficient disk space
- Check deployment logs for errors

---

## Need Help?

Check these files for details:
- `DEPLOYMENT_READINESS.md` - Full deployment status
- `.github/workflows/deploy.yml` - Workflow configuration
- `scripts/deploy-dev.sh` - Deployment script

---

**Ready to deploy?** Add the 4 GitHub secrets above and you're good to go! 🚀
