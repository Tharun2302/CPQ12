#!/bin/bash

# Rollback script for emergency recovery

set -e

ENVIRONMENT=${1:-staging}
BACKUP_DIR="/home/${PRODUCTION_USER}/cpq12-backups"

echo "⚠️ ROLLBACK: Restoring $ENVIRONMENT environment..."

if [ "$ENVIRONMENT" = "production" ]; then
  SERVER=${PRODUCTION_SERVER}
  USER=${PRODUCTION_USER}
  CONTAINER="cpq12-prod"
elif [ "$ENVIRONMENT" = "staging" ]; then
  SERVER=${STAGING_SERVER}
  USER=${STAGING_USER}
  CONTAINER="cpq12-staging"
else
  echo "❌ Unknown environment: $ENVIRONMENT"
  exit 1
fi

# Rollback procedure
ssh -i ~/.ssh/deploy_key "${USER}@${SERVER}" << EOF
  set -e

  echo "🛑 Stopping current container..."
  docker stop $CONTAINER || true
  docker rm $CONTAINER || true

  echo "📜 Restoring from git history..."
  cd /home/${USER}/cpq12-${ENVIRONMENT}
  git log --oneline -10

  # Checkout previous version
  git reset --hard HEAD~1

  echo "🐳 Rebuilding Docker image..."
  docker build -t cpq12:rollback .

  echo "▶️ Starting rolled back container..."
  docker run -d \
    --name $CONTAINER \
    -p 3000:3000 \
    -p 5173:5173 \
    -e NODE_ENV=${ENVIRONMENT} \
    --restart always \
    cpq12:rollback

  echo "⏳ Waiting for health check..."
  sleep 10

  echo "🏥 Checking health..."
  curl -f http://localhost:3000/health || exit 1

  echo "✅ Rollback successful!"
EOF

echo "✅ Rollback complete!"
