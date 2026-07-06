#!/bin/bash

# CPQ12 Development Deployment Script
# Deploys to development server with SSH password authentication
# Usage: DEPLOY_PASSWORD="password" bash scripts/deploy-dev.sh
# Or set environment variables: DEV_SERVER, DEV_USER, DEPLOY_PASSWORD

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEV_SERVER=${DEV_SERVER:-159.89.175.168}
DEV_USER=${DEV_USER:-root}
DEV_PORT=${DEV_PORT:-22}
APP_DIR="${APP_DIR:-~/CPQ12}"
BRANCH=${GIT_BRANCH:-feature/gstack-implementation}
BACKUP_DIR="${BACKUP_DIR:-~/CPQ12/backups}"
DEPLOY_LOG="/tmp/cpq12-deploy-$(date +%Y%m%d_%H%M%S).log"
SSH_KEY_FILE="${SSH_KEY_FILE:-.ssh/deploy_key}"

# Setup SSH key file
setup_ssh_key() {
    if [ -z "$DEPLOY_PASSWORD" ]; then
        echo -e "${RED}❌ Error: DEPLOY_PASSWORD environment variable is required${NC}"
        echo "Usage: DEPLOY_PASSWORD='password' bash scripts/deploy-dev.sh"
        exit 1
    fi

    # Verify sshpass is available for password-based SSH
    if ! command -v sshpass &> /dev/null; then
        echo -e "${RED}❌ Error: sshpass is not installed${NC}"
        exit 1
    fi

    log "INFO" "${GREEN}✅ SSH password configured${NC}"
}

# Validate inputs
validate_inputs() {
    if [ -z "$DEPLOY_PASSWORD" ]; then
        echo -e "${RED}❌ Error: DEPLOY_PASSWORD environment variable is required${NC}"
        echo "Usage: DEPLOY_PASSWORD='password' bash scripts/deploy-dev.sh"
        exit 1
    fi

    if [ -z "$DEV_SERVER" ] || [ -z "$DEV_USER" ]; then
        echo -e "${RED}❌ Error: DEV_SERVER and DEV_USER are required${NC}"
        exit 1
    fi
}

# Log function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$DEPLOY_LOG"
}

# Execute remote command with password authentication
remote_exec() {
    local cmd="$1"
    sshpass -p "$DEPLOY_PASSWORD" ssh \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=10 \
        -p "$DEV_PORT" \
        "${DEV_USER}@${DEV_SERVER}" \
        "$cmd"
}

# Execute multi-line remote script
remote_exec_script() {
    local script="$1"
    sshpass -p "$DEPLOY_PASSWORD" ssh \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=10 \
        -p "$DEV_PORT" \
        "${DEV_USER}@${DEV_SERVER}" \
        bash -s << 'REMOTESCRIPT'
$script
REMOTESCRIPT
}

# Test SSH connection
test_connection() {
    log "INFO" "${BLUE}🔗 Testing SSH connection to ${DEV_USER}@${DEV_SERVER}:${DEV_PORT}...${NC}"

    if sshpass -p "$DEPLOY_PASSWORD" ssh \
        -o ConnectTimeout=10 \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -p "$DEV_PORT" \
        "${DEV_USER}@${DEV_SERVER}" \
        "echo 'SSH connection successful'"; then
        log "INFO" "${GREEN}✅ SSH connection established${NC}"
        return 0
    else
        log "ERROR" "${RED}❌ Failed to connect to ${DEV_USER}@${DEV_SERVER}${NC}"
        return 1
    fi
}

# Create backup before deployment
create_backup() {
    log "INFO" "${YELLOW}💾 Creating backup...${NC}"

    remote_exec "
        set -e
        BACKUP_TIME=\$(date +%Y%m%d_%H%M%S)
        BACKUP_PATH=\"${BACKUP_DIR}/backup_\${BACKUP_TIME}\"
        mkdir -p \"\$BACKUP_PATH\"

        if docker ps | grep -q cpq12-dev; then
            echo 'Backing up MongoDB...'
            docker exec cpq12-dev mongodump --out \"\$BACKUP_PATH/mongo_backup\" 2>/dev/null || true

            echo 'Backing up PostgreSQL...'
            docker exec cpq12-dev pg_dump cpq12_signatures > \"\$BACKUP_PATH/postgres_backup.sql\" 2>/dev/null || true
        fi

        echo \"Backup created at: \$BACKUP_PATH\"
    "

    log "INFO" "${GREEN}✅ Backup completed${NC}"
}

# Stop existing container
stop_container() {
    log "INFO" "${YELLOW}🛑 Stopping existing container...${NC}"

    remote_exec "
        docker stop cpq12-dev 2>/dev/null || true
        docker rm cpq12-dev 2>/dev/null || true
        echo 'Container stopped'
    "

    log "INFO" "${GREEN}✅ Container stopped${NC}"
}

# Pull latest code
pull_code() {
    log "INFO" "${BLUE}📦 Pulling latest code from ${BRANCH}...${NC}"

    remote_exec "
        set -e
        cd ${APP_DIR}

        if [ ! -d .git ]; then
            echo 'Git repo not found, initializing...'
            git init
            git remote add origin https://github.com/Tharun2302/CPQ12.git || true
        fi

        git fetch origin ${BRANCH}
        git checkout -f ${BRANCH}
        git pull origin ${BRANCH}
        echo 'Code pulled successfully'
    "

    log "INFO" "${GREEN}✅ Code pulled${NC}"
}

# Build Docker image
build_image() {
    log "INFO" "${BLUE}🐳 Building Docker image...${NC}"

    remote_exec "
        set -e
        cd ${APP_DIR}
        docker build -t cpq12:dev-latest .
        echo 'Docker image built'
    "

    log "INFO" "${GREEN}✅ Docker image built${NC}"
}

# Start container with docker-compose
start_container() {
    log "INFO" "${BLUE}▶️ Starting new container...${NC}"

    remote_exec "
        set -e
        cd ${APP_DIR}

        # Check if docker-compose.yml exists, else use default config
        if [ -f docker-compose.yml ]; then
            docker-compose -f docker-compose.yml up -d
        else
            # Fallback to docker run if docker-compose not available
            docker run -d \
                --name cpq12-dev \
                -p 3000:3000 \
                -p 5173:5173 \
                -e NODE_ENV=development \
                -e MONGODB_URI=mongodb://mongo:27017/cpq12 \
                -e POSTGRES_URI=postgresql://cpq12:cpq12pass@postgres:5432/cpq12_signatures \
                -e JWT_SECRET=dev-secret-key-change-in-production \
                --restart on-failure \
                cpq12:dev-latest
        fi
        echo 'Container started'
    "

    log "INFO" "${GREEN}✅ Container started${NC}"
}

# Wait for services to be ready
wait_for_services() {
    log "INFO" "${YELLOW}⏳ Waiting for services to stabilize...${NC}"
    sleep 15
}

# Run health checks
run_health_checks() {
    log "INFO" "${BLUE}🏥 Running health checks...${NC}"

    remote_exec "
        set -e

        # Check if container is running
        if ! docker ps | grep -q cpq12-dev; then
            echo 'Error: Container is not running'
            exit 1
        fi

        # Check backend health
        for i in {1..30}; do
            if curl -f http://localhost:3000/health 2>/dev/null; then
                echo 'Backend health check passed'
                break
            fi
            if [ \$i -eq 30 ]; then
                echo 'Backend health check failed'
                exit 1
            fi
            sleep 2
        done

        # Check MongoDB
        if docker ps | grep -q mongo; then
            echo 'MongoDB is running'
        fi

        # Check PostgreSQL
        if docker ps | grep -q postgres; then
            echo 'PostgreSQL is running'
        fi

        echo 'All health checks passed'
    "

    log "INFO" "${GREEN}✅ Health checks passed${NC}"
}

# Display deployment summary
deployment_summary() {
    log "INFO" "${GREEN}========================================${NC}"
    log "INFO" "${GREEN}✅ Deployment Successful!${NC}"
    log "INFO" "${GREEN}========================================${NC}"
    log "INFO" "Server: ${DEV_SERVER}"
    log "INFO" "User: ${DEV_USER}"
    log "INFO" "Branch: ${BRANCH}"
    log "INFO" "Backend: http://${DEV_SERVER}:3000"
    log "INFO" "Frontend: http://${DEV_SERVER}:5173"
    log "INFO" "MongoDB: mongodb://${DEV_SERVER}:27017"
    log "INFO" "PostgreSQL: postgresql://${DEV_SERVER}:5432"
    log "INFO" "Deployment Log: ${DEPLOY_LOG}"
    log "INFO" "${GREEN}========================================${NC}"
}

# Cleanup (no SSH key file to clean up with password auth)
cleanup_ssh_key() {
    log "INFO" "${GREEN}✅ Cleanup completed${NC}"
}

# Main deployment flow
main() {
    log "INFO" "${BLUE}========================================${NC}"
    log "INFO" "${BLUE}🚀 CPQ12 Development Deployment${NC}"
    log "INFO" "${BLUE}========================================${NC}"

    validate_inputs
    setup_ssh_key
    test_connection || exit 1
    create_backup
    stop_container
    pull_code
    build_image
    start_container
    wait_for_services
    run_health_checks
    deployment_summary
    cleanup_ssh_key

    log "INFO" "${GREEN}Deployment completed successfully!${NC}"
}

# Error handler
trap 'cleanup_ssh_key; log "ERROR" "${RED}Deployment failed! Check ${DEPLOY_LOG} for details.${NC}"; exit 1' ERR

# Run main function
main "$@"
