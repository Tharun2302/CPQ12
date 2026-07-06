#!/bin/bash

# CPQ12 Development Rollback Script
# Restores previous version from backup or git history
# Usage: DEPLOY_PASSWORD="password" bash scripts/rollback-dev.sh [backup_id|latest]

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DEV_SERVER=${DEV_SERVER:-159.89.175.168}
DEV_USER=${DEV_USER:-root}
DEV_PASSWORD=${DEPLOY_PASSWORD:-}
DEV_PORT=${DEV_PORT:-22}
APP_DIR="${APP_DIR:-~/CPQ12}"
BACKUP_DIR="${BACKUP_DIR:-~/CPQ12/backups}"
ROLLBACK_TARGET=${1:-latest}
ROLLBACK_LOG="/tmp/cpq12-rollback-$(date +%Y%m%d_%H%M%S).log"

# Utility functions
log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$ROLLBACK_LOG"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$ROLLBACK_LOG"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ $1${NC}" | tee -a "$ROLLBACK_LOG"
}

# Execute remote command
remote_exec() {
    local cmd="$1"
    sshpass -p "$DEV_PASSWORD" ssh \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -p "$DEV_PORT" \
        "${DEV_USER}@${DEV_SERVER}" \
        "$cmd" 2>&1
}

# Validate inputs
validate_inputs() {
    if [ -z "$DEV_PASSWORD" ]; then
        log_error "Error: DEPLOY_PASSWORD environment variable is required"
        echo "Usage: DEPLOY_PASSWORD='password' bash scripts/rollback-dev.sh [backup_id|latest]"
        exit 1
    fi

    if [ -z "$DEV_SERVER" ] || [ -z "$DEV_USER" ]; then
        log_error "Error: DEV_SERVER and DEV_USER are required"
        exit 1
    fi
}

# Test SSH connection
test_connection() {
    log_info "${BLUE}🔗 Testing SSH connection...${NC}"

    if sshpass -p "$DEV_PASSWORD" ssh \
        -o ConnectTimeout=10 \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -p "$DEV_PORT" \
        "${DEV_USER}@${DEV_SERVER}" \
        "echo 'connected'" > /dev/null 2>&1; then
        log_success "SSH connection established"
        return 0
    else
        log_error "Failed to connect to ${DEV_USER}@${DEV_SERVER}"
        return 1
    fi
}

# List available backups
list_backups() {
    log_info "Available backups:"
    remote_exec "
        if [ -d '${BACKUP_DIR}' ]; then
            ls -1dt ${BACKUP_DIR}/backup_* 2>/dev/null | head -10 | while read backup; do
                echo \"  - \$(basename \$backup)\"
            done
        else
            echo '  No backups found'
        fi
    "
}

# Show git history
list_git_history() {
    log_info "Recent git commits:"
    remote_exec "
        cd ${APP_DIR}
        git log --oneline -10 2>/dev/null || echo 'Git repo not accessible'
    "
}

# Rollback using git history
rollback_git() {
    local commit_ref=$1
    log_warn "⚠️ ROLLBACK: Reverting to commit ${commit_ref}"

    remote_exec "
        set -e

        log_step() {
            echo \"[\$(date '+%H:%M:%S')] \$@\"
        }

        log_step '🛑 Stopping container...'
        docker stop cpq12-dev 2>/dev/null || true
        docker rm cpq12-dev 2>/dev/null || true

        log_step '📂 Switching to commit ${commit_ref}...'
        cd ${APP_DIR}
        git fetch origin
        git reset --hard ${commit_ref}
        git log --oneline -1

        log_step '🐳 Building Docker image...'
        docker build -t cpq12:dev-rollback .

        log_step '▶️ Starting container...'
        docker-compose up -d 2>/dev/null || docker run -d \
            --name cpq12-dev \
            -p 3000:3000 \
            -p 5173:5173 \
            -e NODE_ENV=development \
            --restart on-failure \
            cpq12:dev-rollback

        log_step '⏳ Waiting for services...'
        sleep 10

        log_step '🏥 Checking health...'
        for i in {1..30}; do
            if curl -sf http://localhost:3000/health > /dev/null; then
                log_step '✅ Health check passed'
                exit 0
            fi
            if [ \$i -eq 30 ]; then
                log_step '❌ Health check failed'
                exit 1
            fi
            sleep 2
        done
    "
}

# Restore from database backup
restore_from_backup() {
    local backup_id=$1
    local backup_path="${BACKUP_DIR}/${backup_id}"

    log_warn "⚠️ ROLLBACK: Restoring from backup ${backup_id}"

    remote_exec "
        set -e

        log_step() {
            echo \"[\$(date '+%H:%M:%S')] \$@\"
        }

        if [ ! -d '${backup_path}' ]; then
            echo 'Backup not found: ${backup_path}'
            exit 1
        fi

        log_step '🛑 Stopping container...'
        docker stop cpq12-dev 2>/dev/null || true
        docker rm cpq12-dev 2>/dev/null || true

        log_step '📂 Checking out previous code...'
        cd ${APP_DIR}
        git reset --hard HEAD~1

        log_step '🐳 Building Docker image...'
        docker build -t cpq12:dev-restore .

        log_step '📥 Starting container for restore...'
        docker-compose up -d 2>/dev/null || docker run -d \
            --name cpq12-dev \
            -p 3000:3000 \
            -p 5173:5173 \
            -e NODE_ENV=development \
            --restart on-failure \
            cpq12:dev-restore

        log_step '⏳ Waiting for services...'
        sleep 10

        # Restore databases if they exist in backup
        if [ -d '${backup_path}/mongo_backup' ]; then
            log_step '📥 Restoring MongoDB...'
            docker exec cpq12-dev mongorestore --drop '${backup_path}/mongo_backup' 2>/dev/null || true
        fi

        if [ -f '${backup_path}/postgres_backup.sql' ]; then
            log_step '📥 Restoring PostgreSQL...'
            docker exec cpq12-dev psql cpq12_signatures < '${backup_path}/postgres_backup.sql' 2>/dev/null || true
        fi

        log_step '🏥 Checking health...'
        for i in {1..30}; do
            if curl -sf http://localhost:3000/health > /dev/null; then
                log_step '✅ Health check passed'
                exit 0
            fi
            if [ \$i -eq 30 ]; then
                log_step '❌ Health check failed'
                exit 1
            fi
            sleep 2
        done
    "
}

# Interactive rollback mode
interactive_rollback() {
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "⚠️ ROLLBACK OPTIONS"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    echo "Available rollback methods:"
    echo "  1) Rollback to previous git commit (HEAD~1)"
    echo "  2) Rollback to specific git commit"
    echo "  3) Restore from backup"
    echo "  4) Cancel"
    echo ""

    read -p "Choose option (1-4): " option

    case $option in
        1)
            rollback_git "HEAD~1"
            ;;
        2)
            list_git_history
            echo ""
            read -p "Enter commit hash or ref: " commit_ref
            rollback_git "$commit_ref"
            ;;
        3)
            list_backups
            echo ""
            read -p "Enter backup ID: " backup_id
            restore_from_backup "$backup_id"
            ;;
        4)
            log_info "Rollback cancelled"
            exit 0
            ;;
        *)
            log_error "Invalid option"
            exit 1
            ;;
    esac
}

# Display rollback summary
rollback_summary() {
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_success "Rollback Completed Successfully!"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "Server: ${DEV_SERVER}"
    log_info "Rollback Target: ${ROLLBACK_TARGET}"
    log_info "Rollback Log: ${ROLLBACK_LOG}"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# Main rollback logic
main() {
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "🔄 CPQ12 Development Rollback Script"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    validate_inputs
    test_connection || exit 1

    if [ "$ROLLBACK_TARGET" = "latest" ]; then
        interactive_rollback
    elif [ "$ROLLBACK_TARGET" = "--help" ] || [ "$ROLLBACK_TARGET" = "-h" ]; then
        echo "Usage: DEPLOY_PASSWORD='password' bash scripts/rollback-dev.sh [option]"
        echo ""
        echo "Options:"
        echo "  (no args)     - Interactive rollback menu"
        echo "  latest        - Interactive rollback menu"
        echo "  HEAD~1        - Rollback to previous commit"
        echo "  <commit_hash> - Rollback to specific commit"
        echo "  backup_<id>   - Restore from backup"
        echo ""
        echo "Examples:"
        echo "  DEPLOY_PASSWORD='pass' bash scripts/rollback-dev.sh HEAD~1"
        echo "  DEPLOY_PASSWORD='pass' bash scripts/rollback-dev.sh abc1234"
        echo "  DEPLOY_PASSWORD='pass' bash scripts/rollback-dev.sh backup_20260706_120000"
        exit 0
    elif [[ "$ROLLBACK_TARGET" == backup_* ]]; then
        restore_from_backup "$ROLLBACK_TARGET"
    else
        rollback_git "$ROLLBACK_TARGET"
    fi

    rollback_summary
}

# Error handler
trap 'log_error "Rollback failed! Check ${ROLLBACK_LOG} for details."; exit 1' ERR

# Execute main
main "$@"
