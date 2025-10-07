events {
    worker_connections 1024;
}
 
http {
    upstream app {
        server app:3001;
    }
 
    # HTTP server - redirect to HTTPS
    server {
        listen 80;
        server_name zenop.ai www.zenop.ai;
        return 301 https://$server_name$request_uri;
    }
 
    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name zenop.ai www.zenop.ai;
 
        # SSL Configuration
        ssl_certificate /etc/letsencrypt/live/zenop.ai/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/zenop.ai/privkey.pem;
 
        # SSL Settings
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:E>        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;
 
        # Security Headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubD>
 
        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Forwarded-Port $server_port;
        }
 
        location /api/ {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
 
# Use Node.js 18 Alpine as base image
FROM node:18-alpine
 
# Install LibreOffice and dependencies
RUN apk add --no-cache \
    libreoffice \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    ttf-opensans \
&& rm -rf /var/cache/apk/*
 
# Set working directory
WORKDIR /app
 
# Copy package files
COPY package*.json ./
 
# Install ALL dependencies (including devDependencies for build)
RUN npm install
 
# Copy source code
COPY . .
 
# Set environment variables for build (using HTTPS)
ENV VITE_API_URL=https://zenop.ai/api
ENV VITE_BACKEND_URL=https://zenop.ai
ENV VITE_MSAL_CLIENT_ID=e71e69a8-07fd-4110-8d77-9e4326027969
ENV VITE_MSAL_REDIRECT_URI=https://zenop.ai/auth/microsoft/callback
 
# Build the application
RUN npm run build
 
# Remove devDependencies to reduce image size
RUN npm prune --production
 
# Expose port 3001
EXPOSE 3001
 
# Start the application
CMD ["npm", "start"]