# Deployment Commands for Digital Ocean

## Step 1: Push Latest Code to GitHub (Run on Your Local Computer)

```bash
# Navigate to your project directory
cd C:\Users\AnushDasari\Desktop\CPQ12

# Check what files changed
git status

# Add all the changes (including deleted files and server.cjs updates)
git add .

# Commit the changes
git commit -m "Fix email approval links and cleanup old files"

# Push to GitHub
git push origin main
```

**If you get conflicts, force push:**
```bash
git push origin main --force
```

---

## Step 2: Deploy on Digital Ocean Server

**SSH into your server first:**
```bash
ssh root@159.89.175.168
```

**Then run these commands on the server:**

### Option A: Merge Strategy (Recommended - Keeps Both Changes)

```bash
# Navigate to project directory
cd CPQ12

# Configure git to use merge strategy
git config pull.rebase false

# Pull the latest code
git pull origin main

# If you get merge conflicts, resolve them or use theirs
git checkout --theirs .
git add .
git commit -m "Merge server changes with latest code"
```

### Option B: Reset and Get Latest (WARNING: Discards Server Changes)

```bash
# Navigate to project directory
cd CPQ12

# Backup current code (optional)
cp -r . ../CPQ12-backup

# Reset to match GitHub exactly
git fetch origin
git reset --hard origin/main

# This will overwrite all local changes on server
```

### Option C: Just Reset and Pull (Safest)

```bash
# Navigate to project directory
cd CPQ12

# Force update from GitHub
git fetch origin
git reset --hard origin/main

# Now you have exact copy of GitHub
```

---

## Step 3: Update Environment Variables (If Needed)

```bash
# Check current environment variables
cat .env

# If you need to update VITE_BACKEND_URL for production
nano .env

# Update these values:
# VITE_BACKEND_URL=https://your-production-domain.com
# VITE_FRONTEND_URL=https://your-frontend-domain.com
# BASE_URL=https://your-frontend-domain.com
# APP_BASE_URL=https://your-production-domain.com
# VITE_MSAL_REDIRECT_URI=https://your-frontend-domain.com/auth/microsoft/callback
```

---

## Step 4: Restart Services

### If using Docker:
```bash
cd deploymentgigitaldocker
docker-compose down
docker-compose up -d --build
```

### If using PM2:
```bash
pm2 restart all
pm2 logs
```

### If using direct Node.js:
```bash
# Stop current server
ps aux | grep node
kill <PID>

# Start server
cd CPQ12
npm install
npm start
```

---

## Step 5: Verify Deployment

```bash
# Check if services are running
docker ps  # if using Docker
pm2 status # if using PM2

# Check logs
docker-compose logs -f  # if using Docker
pm2 logs  # if using PM2

# Test the application
curl http://localhost:3001/api/health
```

---

## Quick One-Liner for DigitalOcean

If you just want to deploy quickly:

```bash
# On your local machine first:
cd C:\Users\AnushDasari\Desktop\CPQ12
git add .
git commit -m "Deploy latest changes"
git push origin main

# Then on DigitalOcean server:
ssh root@159.89.175.168
cd CPQ12 && git fetch origin && git reset --hard origin/main
cd deploymentgigitaldocker && docker-compose down && docker-compose up -d --build
docker-compose logs -f
```

