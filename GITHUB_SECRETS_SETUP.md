# GitHub Secrets Setup Guide for CPQ12 CI/CD Deployment

This guide provides step-by-step instructions to configure GitHub Secrets for automatic CI/CD deployment to the development server.

## Overview

GitHub Actions uses Secrets to securely store sensitive information like deployment credentials. These secrets are encrypted and only exposed to Actions workflows.

**Required Secrets:**
- `DEPLOY_PASSWORD` - SSH password for deployment server
- `DEPLOY_HOST` - IP address or hostname of deployment server
- `DEPLOY_USER` - SSH username for deployment server
- `DEPLOY_PORT` - SSH port (usually 22)

## Step-by-Step Setup Instructions

### 1. Navigate to GitHub Repository Settings

1. Go to your CPQ12 repository on GitHub: `https://github.com/Tharun2302/CPQ12`
2. Click on the **Settings** tab in the repository navigation
3. In the left sidebar, click on **Secrets and variables** → **Actions**

### 2. Create Development Environment (First Time Only)

1. Click on **Environments** in the left sidebar
2. Click **New environment**
3. Name it: `development`
4. Click **Configure environment**
5. Under "Environment secrets", you'll add secrets specific to this environment

### 3. Add GitHub Secrets

Follow these steps for **each secret** listed below:

#### Secret 1: DEPLOY_PASSWORD

1. Click the **New repository secret** button
2. **Name:** `DEPLOY_PASSWORD`
3. **Value:** `CPQ@2025@TEAM`
4. Click **Add secret**

#### Secret 2: DEPLOY_HOST

1. Click the **New repository secret** button
2. **Name:** `DEPLOY_HOST`
3. **Value:** `159.89.175.168`
4. Click **Add secret**

#### Secret 3: DEPLOY_USER

1. Click the **New repository secret** button
2. **Name:** `DEPLOY_USER`
3. **Value:** `root`
4. Click **Add secret**

#### Secret 4: DEPLOY_PORT

1. Click the **New repository secret** button
2. **Name:** `DEPLOY_PORT`
3. **Value:** `22`
4. Click **Add secret**

## Verification Checklist

After adding all secrets, verify they are correctly configured:

- [ ] Navigate back to **Settings** → **Secrets and variables** → **Actions**
- [ ] You should see all four secrets listed:
  - DEPLOY_PASSWORD
  - DEPLOY_HOST
  - DEPLOY_USER
  - DEPLOY_PORT
- [ ] Each secret shows a "Last updated" timestamp
- [ ] No secret values are displayed (only dots or masked text)

## Security Best Practices

### Do's
✅ Rotate the `DEPLOY_PASSWORD` periodically (monthly recommended)
✅ Use complex, unique passwords for sensitive servers
✅ Keep credentials confidential - never share or commit them to the repository
✅ Use separate credentials for different environments (dev/staging/production)
✅ Enable branch protection rules to require reviews before deployment

### Don'ts
❌ Do NOT commit secrets to the repository
❌ Do NOT share secret values via email, chat, or comments
❌ Do NOT use the same password across multiple environments
❌ Do NOT store secrets in configuration files (.env, config.json, etc.)
❌ Do NOT log or print secret values in workflow output

## How Secrets Are Used

The GitHub Actions workflow (`.github/workflows/deploy.yml`) uses these secrets as environment variables:

```yaml
env:
  DEPLOY_PASSWORD: ${{ secrets.DEPLOY_PASSWORD }}
  DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
  DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
  DEPLOY_PORT: ${{ secrets.DEPLOY_PORT }}
```

These variables are then passed to the deployment script (`scripts/deploy-dev.sh`):

```bash
bash ./scripts/deploy-dev.sh
```

The script accesses them as environment variables:
- `$DEPLOY_PASSWORD` → `$DEV_PASSWORD`
- `$DEPLOY_HOST` → `$DEV_SERVER`
- `$DEPLOY_USER` → `$DEV_USER`
- `$DEPLOY_PORT` → `$DEV_PORT`

## Troubleshooting

### Secret Not Found Error
**Problem:** Workflow fails with "Error: DEV_PASSWORD or DEPLOY_PASSWORD environment variable is required"

**Solution:**
1. Verify all four secrets are added to GitHub
2. Check secret names exactly match (case-sensitive):
   - DEPLOY_PASSWORD
   - DEPLOY_HOST
   - DEPLOY_USER
   - DEPLOY_PORT
3. Wait 5 minutes after adding secrets before triggering workflow
4. Clear Actions cache if recently updated

### SSH Connection Failed
**Problem:** "Failed to connect to root@159.89.175.168"

**Solution:**
1. Verify `DEPLOY_HOST` and `DEPLOY_USER` are correct
2. Verify `DEPLOY_PASSWORD` matches the server's SSH password
3. Verify `DEPLOY_PORT` is correct (usually 22)
4. Check server is accessible and online
5. Verify firewall allows SSH connections from GitHub Actions servers

### Permission Denied
**Problem:** "Permission denied (publickey,password)"

**Solution:**
1. Verify SSH password is correct
2. Ensure SSH password authentication is enabled on the server
3. Check user account exists and has correct permissions
4. Verify SSH is running on the specified port

## Deployment Workflow

Once secrets are configured, the deployment workflow is automatic:

1. **Push to feature branch:** Developer pushes code to `feature/gstack-implementation`
2. **GitHub Actions Triggered:** Workflow runs automatically
3. **Build & Test:** Node dependencies, linting, tests, Docker build
4. **Deploy Triggered:** If build passes, deployment job starts
5. **SSH Connection:** Uses secrets to authenticate to dev server
6. **Code Pull:** Latest code pulled from GitHub
7. **Docker Build:** Image built on server
8. **Container Start:** Application container starts
9. **Health Checks:** Server validates application is running
10. **Success/Failure:** Notification logged in GitHub Actions

## Manual Secret Rotation

To update a secret (e.g., change password):

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click the **Update** button next to the secret
3. Enter the new value
4. Click **Update secret**
5. No need to update workflow file - it automatically uses the new value

## Environment-Specific Secrets

This setup uses repository-level secrets. For environment-specific secrets:

1. Go to **Settings** → **Environments** → **development** (or create new)
2. Under "Environment secrets", click **Add secret**
3. Add secrets here if you want them environment-specific
4. Reference in workflow with: `${{ secrets.SECRET_NAME }}`

## Workflow Status Monitoring

Monitor deployment status:

1. Go to **Actions** tab in repository
2. Click on the workflow run triggered by your push
3. View logs for each step:
   - **build-and-test:** Shows test results and Docker build
   - **deploy-dev:** Shows SSH connection, code pull, build, health checks
   - **notify:** Shows deployment status

## Next Steps

After setting up secrets:

1. ✅ Verify all four secrets are in GitHub
2. ✅ Read `CI_CD_AUTO_DEPLOY_GUIDE.md` for full automation details
3. ✅ Create a test push to `feature/gstack-implementation` branch
4. ✅ Monitor the first deployment in the **Actions** tab
5. ✅ Verify application is running on dev server at `http://159.89.175.168:3000`

## Support

For issues or questions:
- Check workflow logs in GitHub Actions tab
- Review deployment script output in logs
- Verify secrets are correctly added
- Ensure server is accessible and online
