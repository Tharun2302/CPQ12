# Deployment Files

This folder contains all deployment-related files for the CPQ application.

## Files Overview

### Docker Configuration
- **`Dockerfile`** - Multi-stage Docker build configuration
- **`docker-compose.yml`** - Docker Compose orchestration
- **`env.example`** - Environment variables template

### Deployment Scripts
- **`deploy.sh`** - Linux/macOS deployment script
- **`deploy.ps1`** - Windows PowerShell deployment script

### Documentation
- **`DIGITALOCEAN_DEPLOYMENT.md`** - Comprehensive deployment guide
- **`QUICK_START.md`** - 5-minute quick start guide

## Quick Start

1. **Copy environment template:**
   ```bash
   cp env.example .env
   ```

2. **Edit environment variables:**
   ```bash
   nano .env  # or your preferred editor
   ```

3. **Deploy application:**
   ```bash
   # Linux/macOS
   chmod +x deploy.sh
   ./deploy.sh
   
   # Windows
   .\deploy.ps1
   ```

## Environment Variables

Edit `.env` file with your configuration:

```env
# Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=cpq_database

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Email Configuration (SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=your-verified-email@domain.com

# HubSpot Integration
HUBSPOT_API_KEY=your-hubspot-api-key

# Server Configuration
NODE_ENV=production
PORT=3001
```

## Deployment Options

### DigitalOcean Droplet
- Follow `DIGITALOCEAN_DEPLOYMENT.md` for detailed instructions
- Use `QUICK_START.md` for rapid deployment

### Local Development
- Use `docker-compose up --build -d` for local testing
- Access application at `http://localhost:3001`

## Support

For deployment issues:
1. Check application logs: `docker-compose logs -f`
2. Verify environment variables
3. Test database connectivity
4. Review firewall settings
