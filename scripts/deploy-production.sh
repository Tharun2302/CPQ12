#!/bin/bash

# Deployment script for production environment

set -e

echo "🚀 Deploying to Production..."

# Variables
PRODUCTION_SERVER=${PRODUCTION_SERVER:-localhost}
PRODUCTION_USER=${PRODUCTION_USER:-deploy}
APP_DIR="/home/${PRODUCTION_USER}/cpq12-prod"
BACKUP_DIR="/home/${PRODUCTION_USER}/cpq12-backups"

# Create backup before deployment
echo "💾 Creating backup..."
ssh -i ~/.ssh/deploy_key "${PRODUCTION_USER}@${PRODUCTION_SERVER}" << 'EOF'
  set -e

  BACKUP_TIME=$(date +%Y%m%d_%H%M%S)
  BACKUP_DIR="/home/${PRODUCTION_USER}/cpq12-backups"
  mkdir -p $BACKUP_DIR

  # Backup database
  echo "📋 Backing up databases..."
  docker exec cpq12-prod mongodump --out $BACKUP_DIR/mongo_$BACKUP_TIME
  docker exec cpq12-prod pg_dump cpq12_signatures > $BACKUP_DIR/postgres_$BACKUP_TIME.sql

  echo "✅ Backup created: $BACKUP_DIR/$BACKUP_TIME"
EOF

# Deploy
ssh -i ~/.ssh/deploy_key "${PRODUCTION_USER}@${PRODUCTION_SERVER}" << 'EOF'
  set -e

  echo "📦 Pulling latest code..."
  cd $APP_DIR
  git pull origin main

  echo "🐳 Building Docker image..."
  docker build -t cpq12:prod .

  echo "🛑 Stopping old container..."
  docker stop cpq12-prod || true
  docker rm cpq12-prod || true

  echo "▶️ Starting new container..."
  docker run -d \
    --name cpq12-prod \
    -p 3000:3000 \
    -p 5173:5173 \
    -e NODE_ENV=production \
    -e MONGODB_URI=mongodb://mongo:27017/cpq12_prod \
    -e POSTGRES_URI=postgresql://cpq12:cpq12pass@postgres:5432/cpq12_prod \
    --restart always \
    --network cpq-network \
    cpq12:prod

  echo "⏳ Waiting for health check..."
  sleep 10

  echo "🏥 Checking health..."
  curl -f http://localhost:3000/health || exit 1

  echo "✅ Production deployment successful!"
EOF

echo "✅ Production deployment complete!"
