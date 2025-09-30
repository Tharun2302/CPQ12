# CPQ Application - DigitalOcean Deployment Guide

This guide will help you deploy your CPQ application to DigitalOcean using Docker.

## Prerequisites

- DigitalOcean account
- Docker installed on your local machine
- MongoDB Atlas account (for database)
- SendGrid account (for email)
- HubSpot account (optional, for CRM integration)

## Step 1: Create DigitalOcean Droplet

1. **Login to DigitalOcean**
   - Go to [DigitalOcean](https://cloud.digitalocean.com/)
   - Sign in to your account

2. **Create a New Droplet**
   - Click "Create" → "Droplets"
   - Choose "Docker" as the image
   - Select size: **Basic plan, $12/month** (2GB RAM, 1 CPU) or higher
   - Choose datacenter region closest to your users
   - Add SSH key for secure access
   - Name your droplet: `cpq-application`
   - Click "Create Droplet"

3. **Connect to Your Droplet**
   ```bash
   ssh root@YOUR_DROPLET_IP
   ```

## Step 2: Prepare Your Application

1. **Clone Your Repository**
   ```bash
   git clone https://github.com/yourusername/cpq-application.git
   cd cpq-application
   ```

2. **Create Environment File**
   ```bash
   cp env.example .env
   nano .env
   ```

3. **Configure Environment Variables**
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

## Step 3: Deploy with Docker

1. **Make Scripts Executable**
   ```bash
   chmod +x deploy.sh
   ```

2. **Run Deployment Script**
   ```bash
   ./deploy.sh
   ```

   Or manually:
   ```bash
   # Build and start the application
   docker-compose up --build -d
   
   # Check if running
   docker-compose ps
   
   # View logs
   docker-compose logs -f
   ```

## Step 4: Configure Firewall

1. **Open Required Ports**
   ```bash
   ufw allow 22    # SSH
   ufw allow 3001  # Application
   ufw enable
   ```

2. **Verify Application is Running**
   ```bash
   curl http://localhost:3001/api/health
   ```

## Step 5: Set Up Domain (Optional)

1. **Add Domain to DigitalOcean**
   - Go to "Networking" → "Domains"
   - Add your domain
   - Create A record pointing to your droplet IP

2. **Configure Nginx (Optional)**
   ```bash
   # Install Nginx
   apt update
   apt install nginx

   # Create configuration
   nano /etc/nginx/sites-available/cpq
   ```

   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   ```bash
   # Enable site
   ln -s /etc/nginx/sites-available/cpq /etc/nginx/sites-enabled/
   nginx -t
   systemctl restart nginx
   ```

## Step 6: SSL Certificate (Optional)

1. **Install Certbot**
   ```bash
   apt install certbot python3-certbot-nginx
   ```

2. **Get SSL Certificate**
   ```bash
   certbot --nginx -d yourdomain.com
   ```

## Step 7: Monitoring and Maintenance

1. **View Application Logs**
   ```bash
   docker-compose logs -f
   ```

2. **Restart Application**
   ```bash
   docker-compose restart
   ```

3. **Update Application**
   ```bash
   git pull
   docker-compose up --build -d
   ```

4. **Backup Database**
   - MongoDB Atlas handles backups automatically
   - For local backups, use MongoDB tools

## Troubleshooting

### Common Issues

1. **Application Won't Start**
   ```bash
   # Check logs
   docker-compose logs
   
   # Check environment variables
   docker-compose config
   ```

2. **Database Connection Issues**
   - Verify MongoDB Atlas connection string
   - Check firewall settings
   - Ensure IP is whitelisted in MongoDB Atlas

3. **Email Not Working**
   - Verify SendGrid API key
   - Check sender email is verified in SendGrid
   - Review email logs

4. **Port Issues**
   ```bash
   # Check if port is in use
   netstat -tulpn | grep :3001
   
   # Kill process if needed
   kill -9 PID
   ```

### Health Checks

- **Application Health**: `http://YOUR_IP:3001/api/health`
- **Database Health**: `http://YOUR_IP:3001/api/database/health`
- **LibreOffice Health**: `http://YOUR_IP:3001/api/libreoffice/health`

## Security Considerations

1. **Firewall Configuration**
   - Only open necessary ports
   - Use fail2ban for SSH protection

2. **Environment Variables**
   - Never commit .env file to git
   - Use strong, unique secrets

3. **Regular Updates**
   - Keep system packages updated
   - Update Docker images regularly
   - Monitor security advisories

## Cost Optimization

- **Droplet Size**: Start with $12/month, scale as needed
- **Database**: MongoDB Atlas free tier (512MB)
- **Email**: SendGrid free tier (100 emails/day)
- **Monitoring**: Use DigitalOcean monitoring (free)

## Support

If you encounter issues:

1. Check application logs: `docker-compose logs -f`
2. Verify all environment variables are set
3. Test database connectivity
4. Check firewall and port configurations

## Next Steps

After successful deployment:

1. Test all application features
2. Set up monitoring and alerts
3. Configure automated backups
4. Plan for scaling as your user base grows

---

**Note**: This deployment uses a single Docker container. For production with high traffic, consider using Docker Swarm or Kubernetes for better scalability and reliability.
