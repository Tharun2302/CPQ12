# CPQ Application - Quick Start Guide

## 🚀 Deploy to DigitalOcean in 5 Minutes

### Prerequisites
- DigitalOcean account
- MongoDB Atlas account
- SendGrid account

### Step 1: Create DigitalOcean Droplet
1. Go to [DigitalOcean](https://cloud.digitalocean.com/)
2. Create new droplet with "Docker" image
3. Choose $12/month plan (2GB RAM)
4. Add your SSH key
5. Create droplet

### Step 2: Deploy Application
```bash
# Connect to your droplet
ssh root@YOUR_DROPLET_IP

# Clone repository
git clone https://github.com/yourusername/cpq-application.git
cd cpq-application

# Configure environment
cp env.example .env
nano .env  # Edit with your credentials

# Deploy
chmod +x deploy.sh
./deploy.sh
```

### Step 3: Configure Environment
Edit `.env` file with your credentials:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=your-verified-email@domain.com
JWT_SECRET=your-super-secret-jwt-key
```

### Step 4: Access Application
- Application: `http://YOUR_DROPLET_IP:3001`
- Health check: `http://YOUR_DROPLET_IP:3001/api/health`

### Step 5: Configure Firewall
```bash
ufw allow 22    # SSH
ufw allow 3001  # Application
ufw enable
```

## 🔧 Management Commands

### Start/Stop Application
```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# View logs
docker-compose logs -f
```

### Update Application
```bash
git pull
docker-compose up --build -d
```

### Check Status
```bash
# Container status
docker-compose ps

# Application health
curl http://localhost:3001/api/health

# Database health
curl http://localhost:3001/api/database/health
```

## 🛠️ Troubleshooting

### Application Won't Start
```bash
# Check logs
docker-compose logs

# Check configuration
docker-compose config
```

### Database Issues
- Verify MongoDB Atlas connection string
- Check IP whitelist in MongoDB Atlas
- Ensure database name is correct

### Email Issues
- Verify SendGrid API key
- Check sender email is verified
- Review SendGrid logs

## 📊 Monitoring

### Health Endpoints
- **Application**: `/api/health`
- **Database**: `/api/database/health`
- **LibreOffice**: `/api/libreoffice/health`

### Logs
```bash
# All logs
docker-compose logs -f

# Specific service
docker-compose logs -f cpq-app
```

## 🔒 Security

### Firewall Setup
```bash
# Allow only necessary ports
ufw allow 22    # SSH
ufw allow 3001  # Application
ufw deny 80     # Block HTTP (use HTTPS)
ufw deny 443    # Block HTTPS (configure SSL later)
ufw enable
```

### Environment Security
- Never commit `.env` file
- Use strong, unique secrets
- Rotate keys regularly

## 💰 Cost Optimization

- **Droplet**: $12/month (2GB RAM)
- **Database**: MongoDB Atlas free tier
- **Email**: SendGrid free tier (100 emails/day)
- **Total**: ~$12/month

## 🆘 Support

If you need help:
1. Check application logs
2. Verify environment variables
3. Test database connectivity
4. Review firewall settings

---

**Ready to deploy?** Follow the steps above and your CPQ application will be running on DigitalOcean in minutes!
