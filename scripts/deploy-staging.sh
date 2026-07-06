#!/bin/bash

# Deployment script for staging environment

set -e

echo "🚀 Deploying to Staging..."

# Variables
STAGING_SERVER=${STAGING_SERVER:-localhost}
STAGING_USER=${STAGING_USER:-deploy}
APP_DIR="/home/${STAGING_USER}/cpq12-staging"
DOCKER_IMAGE="cpq12:latest"

# SSH into staging server and deploy
ssh -i ~/.ssh/deploy_key "${STAGING_USER}@${STAGING_SERVER}" << 'EOF'
  set -e

  echo "📦 Pulling latest code..."
  cd $APP_DIR
  git pull origin develop

  echo "🐳 Building Docker image..."
  docker build -t cpq12:latest .

  echo "🛑 Stopping old container..."
  docker stop cpq12-staging || true
  docker rm cpq12-staging || true

  echo "▶️ Starting new container..."
  docker run -d \
    --name cpq12-staging \
    -p 3000:3000 \
    -p 5173:5173 \
    -e NODE_ENV=staging \
    -e MONGODB_URI=mongodb://mongo:27017/cpq12_staging \
    -e POSTGRES_URI=postgresql://cpq12:cpq12pass@postgres:5432/cpq12_staging \
    --network cpq-network \
    cpq12:latest

  echo "⏳ Waiting for health check..."
  sleep 5

  echo "🏥 Checking health..."
  curl -f http://localhost:3000/health || exit 1

  echo "✅ Staging deployment successful!"
EOF

echo "✅ Staging deployment complete!"
