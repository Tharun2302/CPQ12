# CPQ12 Deployment Guide

## 🚀 Overview

This guide covers deploying CPQ12 using Docker, GitHub Actions CI/CD, and automated scripts.

### Architecture

```
Developer Push to GitHub
    ↓
GitHub Actions (automated)
    ├─ Build & Test
    ├─ Deploy to Staging
    └─ Deploy to Production
```

---

## 📋 Prerequisites

### Local Development

- Docker & Docker Compose
- Node.js 18+
- Git

```bash
# Verify installations
docker --version
docker-compose --version
node --version
git --version
```

### Servers

For production/staging deployments:
- Server with Docker installed
- SSH access configured
- Sufficient disk space for databases

---

## 🏠 Local Development (Docker Compose)

### Start Local Environment

```bash
docker-compose up -d
```

This starts:
- Backend (Node.js) on `http://localhost:3000`
- Frontend (Vite) on `http://localhost:5173`
- MongoDB on `mongodb://localhost:27017`
- PostgreSQL on `postgresql://localhost:5432`

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f mongo
```

### Stop Environment

```bash
docker-compose down
```

### Clean Everything (Data Included)

```bash
docker-compose down -v
```

---

## 🔧 GitHub Actions CI/CD Setup

### Required GitHub Secrets

Go to your repository → Settings → Secrets and add:

#### Staging Secrets

```
STAGING_SERVER         = your-staging-server.com
STAGING_USER          = deploy
STAGING_DEPLOY_KEY    = (private SSH key for staging)
```

#### Production Secrets

```
PRODUCTION_SERVER     = your-production-server.com
PRODUCTION_USER       = deploy
PRODUCTION_DEPLOY_KEY = (private SSH key for production)
```

### How CI/CD Works

1. **Push to GitHub**
   ```bash
   git push origin feature/my-feature
   ```

2. **GitHub Actions Triggers**
   - Runs tests
   - Builds Docker image
   - Tests container

3. **Auto-Deploy (if passing)**
   - Feature branches → Staging
   - `main` branch → Production

### Manual Trigger

You can manually trigger deployment in GitHub:

```
GitHub → Actions → CI/CD Pipeline → Run workflow
```

---

## 🚀 Manual Deployment

### Deploy to Staging

```bash
bash scripts/deploy-staging.sh
```

### Deploy to Production

```bash
bash scripts/deploy-production.sh
```

### Rollback

```bash
# Rollback staging
bash scripts/rollback.sh staging

# Rollback production
bash scripts/rollback.sh production
```

---

## 🐳 Docker Deployment

### Build Image

```bash
docker build -t cpq12:latest .
```

### Run Container

```bash
docker run -d \
  --name cpq12 \
  -p 3000:3000 \
  -p 5173:5173 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret \
  cpq12:latest
```

### Push to Registry (Docker Hub)

```bash
# Login
docker login

# Tag image
docker tag cpq12:latest yourusername/cpq12:latest

# Push
docker push yourusername/cpq12:latest
```

---

## 📊 Health Checks

### Local Health Check

```bash
curl http://localhost:3000/health
```

### Remote Health Check

```bash
curl https://your-production-server.com/health
```

---

## 🔐 Environment Variables

### Development (.env)

```env
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/cpq12
POSTGRES_URI=postgresql://cpq12:cpq12pass@localhost:5432/cpq12
JWT_SECRET=dev-secret-key
```

### Production (.env.production)

```env
NODE_ENV=production
MONGODB_URI=mongodb://mongo:27017/cpq12_prod
POSTGRES_URI=postgresql://cpq12:password@postgres:5432/cpq12_prod
JWT_SECRET=your-production-secret-key
AZURE_CLIENT_ID=your-azure-id
AZURE_CLIENT_SECRET=your-azure-secret
AZURE_TENANT_ID=your-azure-tenant
```

---

## 🐛 Troubleshooting

### Issue: Container won't start

```bash
# Check logs
docker logs cpq12

# Check if port is in use
netstat -tuln | grep 3000

# Try different port
docker run -p 8080:3000 cpq12:latest
```

### Issue: Database connection failed

```bash
# Verify databases are running
docker ps

# Check MongoDB connection
docker exec cpq12 mongosh localhost:27017

# Check PostgreSQL connection
docker exec cpq12 psql -U cpq12
```

### Issue: GitHub Actions failing

1. Check workflow file: `.github/workflows/deploy.yml`
2. Verify secrets are set in GitHub
3. Check SSH keys are valid
4. View action logs in GitHub

---

## 📈 Monitoring

### View Running Containers

```bash
docker ps
```

### View Container Logs

```bash
docker logs -f cpq12
```

### View Resource Usage

```bash
docker stats
```

### Restart Container

```bash
docker restart cpq12
```

---

## 🔄 Database Backups

### Backup MongoDB

```bash
docker exec cpq12 mongodump --out /backups/mongo_$(date +%Y%m%d)
```

### Backup PostgreSQL

```bash
docker exec cpq12 pg_dump cpq12 > /backups/postgres_$(date +%Y%m%d).sql
```

### Restore MongoDB

```bash
docker exec cpq12 mongorestore /backups/mongo_20260706
```

---

## 📞 Support

For deployment issues:
1. Check logs: `docker logs cpq12`
2. Verify secrets in GitHub
3. Test SSH connection: `ssh -i deploy_key user@server`
4. Check GitHub Actions: https://github.com/Tharun2302/CPQ12/actions

---

**Version:** 1.0  
**Last Updated:** 2026-07-06  
**Ready to Deploy!** 🚀
