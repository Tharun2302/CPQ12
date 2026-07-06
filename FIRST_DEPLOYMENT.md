# CPQ12 First Deployment Guide

**For First-Time Deployments to Development Server**

---

## Prerequisites Check

Before your first deployment, ensure:

```bash
# 1. Install sshpass (required for password-based SSH)
which sshpass || echo "sshpass not found - install it:"
echo "  Ubuntu/Debian: sudo apt-get install sshpass"
echo "  macOS: brew install sshpass"

# 2. Verify your current directory
pwd  # Should contain: /scripts, /CPQ12, /DEPLOY_DEV_SETUP.md

# 3. Test basic connectivity
ping 159.89.175.168  # Should respond

# 4. Verify git is available
git --version
```

---

## Step 1: Install Dependencies (One-Time Only)

```bash
# Linux/Ubuntu
sudo apt-get update
sudo apt-get install sshpass

# macOS
brew install sshpass

# Verify installation
sshpass -V
```

---

## Step 2: First-Time Server Preparation

This sets up the deployment directory structure on the server:

```bash
# Set password variable
export DEPLOY_PASSWORD="CPQ@2025@TEAM"

# Create necessary directories
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 << 'EOF'
  # Create deployment directories
  mkdir -p ~/CPQ12
  mkdir -p ~/CPQ12/backups
  
  # Initialize git repository
  cd ~/CPQ12
  git init
  git remote add origin https://github.com/Tharun2302/CPQ12.git
  
  # Display status
  echo "✓ Directory created: ~/CPQ12"
  echo "✓ Backup directory created: ~/CPQ12/backups"
  echo "✓ Git repository initialized"
  echo "✓ Server ready for deployment"
EOF
```

Expected output:
```
✓ Directory created: ~/CPQ12
✓ Backup directory created: ~/CPQ12/backups
✓ Git repository initialized
✓ Server ready for deployment
```

---

## Step 3: Verify Server Requirements

```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"

# Check Docker
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "docker --version"
# Expected: Docker version 25.x.x

# Check Docker Compose
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "docker-compose --version"
# Expected: Docker Compose version v2.x.x

# Check Node.js
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "node --version"
# Expected: v18.x.x or higher

# Check disk space
sshpass -p "$DEPLOY_PASSWORD" ssh root@159.89.175.168 "df -h / | tail -1"
# Expected: At least 10GB free
```

---

## Step 4: Initial Deployment

Now you're ready for the first deployment:

```bash
# Set the password variable
export DEPLOY_PASSWORD="CPQ@2025@TEAM"

# Run the deployment script
bash scripts/deploy-dev.sh
```

The deployment will:
1. Connect to server via SSH
2. Create a backup
3. Pull latest code from GitHub
4. Build Docker image
5. Start containers
6. Run health checks
7. Display results

Expected output should end with:
```
✅ Deployment Successful!
```

---

## Step 5: Verify Deployment Success

```bash
# Run health checks
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh
```

All checks should show ✅ (green checkmarks):
```
✅ SSH connection OK
✅ Docker daemon OK
✅ Container is running
✅ Backend health check OK
✅ MongoDB OK
✅ PostgreSQL OK
```

---

## Step 6: Access the Application

Open your browser and test:

| Service | URL |
|---------|-----|
| Frontend | http://159.89.175.168:5173 |
| Backend | http://159.89.175.168:3000 |
| Health | http://159.89.175.168:3000/health |

---

## Step 7: Keep for Future Reference

Save these commands for future deployments:

```bash
# Deploy new changes
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/deploy-dev.sh

# Check health
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh

# View logs
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs -f cpq12-dev"

# Rollback if needed
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh HEAD~1
```

---

## Troubleshooting First Deployment

### Issue: "command not found: sshpass"
```bash
# Install sshpass
sudo apt-get install sshpass  # Linux
brew install sshpass           # macOS
```

### Issue: "Permission denied"
```bash
# Verify password is correct
echo $DEPLOY_PASSWORD
# Should show: CPQ@2025@TEAM

# Try manual SSH to verify
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "echo connected"
# Should show: connected
```

### Issue: "Docker not found"
```bash
# Server needs Docker installed - contact admin
# Verify with:
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker --version"
```

### Issue: "No space left on device"
```bash
# Clean up Docker images on server
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker image prune -a -f"

# Check disk space
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "df -h"
```

### Issue: Deployment script fails partway through
```bash
# Check logs
cat /tmp/cpq12-deploy-*.log | tail -50

# View server logs
sshpass -p 'CPQ@2025@TEAM' ssh root@159.89.175.168 "docker logs cpq12-dev | tail -50"

# Rollback to previous state
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/rollback-dev.sh
```

---

## After First Deployment

### What Gets Created

On your server at ~/CPQ12:
```
CPQ12/
├── .git/                    # Git repository
├── Dockerfile              # Container definition
├── docker-compose.yml      # Container configuration
├── CPQ12/                  # Application code
├── backups/                # Database backups
│   └── backup_YYYYMMDD_HHMMSS/
│       ├── mongo_backup/   # MongoDB dump
│       └── postgres_backup.sql
├── backend-uploads/        # User uploads
└── backend-exhibits/       # Exhibit files
```

### Running Containers

After deployment:
```
docker ps  # Should show:
  - cpq12-dev (backend)
  - cpq12-mongo-dev (MongoDB)
  - cpq12-postgres-dev (PostgreSQL)
```

---

## Common Next Steps

### 1. Set Up Continuous Monitoring
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
bash scripts/health-check-dev.sh --continuous
# Runs health checks every 30 seconds
# Press Ctrl+C to stop
```

### 2. Configure Credentials
Store credentials securely:
```bash
# Create ~/.env-cpq12-deploy (do NOT add to git)
cat > ~/.env-cpq12-deploy << 'EOF'
export DEV_SERVER="159.89.175.168"
export DEV_USER="root"
export DEPLOY_PASSWORD="CPQ@2025@TEAM"
EOF

# Source before deployment
source ~/.env-cpq12-deploy
bash scripts/deploy-dev.sh
```

### 3. Set Up SSH Keys (Recommended for Production)
For better security, set up SSH key-based authentication:
```bash
# Generate SSH key (one-time)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/cpq12_deploy -N ""

# Copy to server
sshpass -p 'CPQ@2025@TEAM' ssh-copy-id -i ~/.ssh/cpq12_deploy.pub root@159.89.175.168

# Then use SSH key instead of password
ssh -i ~/.ssh/cpq12_deploy root@159.89.175.168
```

---

## Documentation Quick Links

Based on your needs:

| Need | Document |
|------|----------|
| Just want to deploy? | **QUICK_START_DEV_DEPLOY.md** |
| Need detailed setup? | **DEPLOY_DEV_SETUP.md** |
| Troubleshooting? | **DEPLOY_DEV_SETUP.md** (Troubleshooting section) |
| Overview of everything? | **DEPLOYMENT_SUMMARY.md** |
| Command reference? | **QUICK_START_DEV_DEPLOY.md** (Commands section) |

---

## Success Checklist

After completing this guide, you should have:

- [ ] sshpass installed
- [ ] SSH connection tested
- [ ] Server directories created
- [ ] Initial deployment completed
- [ ] Health checks passing
- [ ] Frontend accessible at http://159.89.175.168:5173
- [ ] Backend accessible at http://159.89.175.168:3000
- [ ] Backup created at ~/CPQ12/backups/

---

## You're Ready!

Your CPQ12 development server is now ready for continuous deployments. 

**Most common command you'll use:**
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM" && bash scripts/deploy-dev.sh
```

**To monitor while testing:**
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM" && bash scripts/health-check-dev.sh --continuous
```

**If something breaks:**
```bash
export DEPLOY_PASSWORD="CPQ@2025@TEAM" && bash scripts/rollback-dev.sh
```

---

## Need Help?

1. **Quick questions**: Check QUICK_START_DEV_DEPLOY.md
2. **Stuck on setup**: See DEPLOY_DEV_SETUP.md - Prerequisites section
3. **Something broke**: See DEPLOY_DEV_SETUP.md - Troubleshooting section
4. **Want to understand it all**: Read DEPLOYMENT_SUMMARY.md

---

**Happy Deploying! 🚀**

