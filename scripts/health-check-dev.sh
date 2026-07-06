#!/bin/bash

# CPQ12 Development Health Check Script
# Monitors application and database health
# Usage: DEPLOY_PASSWORD="password" bash scripts/health-check-dev.sh
# Or run continuously: bash scripts/health-check-dev.sh --continuous

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
CONTINUOUS=${CONTINUOUS:-false}
CHECK_INTERVAL=${CHECK_INTERVAL:-30}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --continuous)
            CONTINUOUS=true
            shift
            ;;
        --interval)
            CHECK_INTERVAL=$2
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Health check results tracking
BACKEND_STATUS=0
MONGO_STATUS=0
POSTGRES_STATUS=0
DOCKER_STATUS=0
CONTAINER_STATUS=0

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ $1${NC}"
}

# Execute remote command
remote_exec() {
    local cmd="$1"
    sshpass -p "$DEV_PASSWORD" ssh \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -p "$DEV_PORT" \
        "${DEV_USER}@${DEV_SERVER}" \
        "$cmd" 2>&1 || echo "ERROR"
}

# Check SSH connection
check_ssh() {
    log_info "🔗 Checking SSH connection..."

    if remote_exec "echo 'connected'" | grep -q "connected"; then
        log_success "SSH connection OK"
        return 0
    else
        log_error "SSH connection FAILED"
        return 1
    fi
}

# Check Docker daemon
check_docker() {
    log_info "🐳 Checking Docker daemon..."

    local result=$(remote_exec "docker ps > /dev/null 2>&1 && echo 'OK' || echo 'FAIL'")

    if echo "$result" | grep -q "OK"; then
        log_success "Docker daemon OK"
        DOCKER_STATUS=0
    else
        log_error "Docker daemon FAILED"
        DOCKER_STATUS=1
    fi
}

# Check container status
check_container() {
    log_info "📦 Checking CPQ12 container..."

    local result=$(remote_exec "docker ps --filter name=cpq12-dev --format '{{.State}}'")

    if echo "$result" | grep -q "running"; then
        log_success "Container is running"
        CONTAINER_STATUS=0
    else
        log_warn "Container is not running"
        CONTAINER_STATUS=1
    fi
}

# Check backend health
check_backend() {
    log_info "🏥 Checking backend health..."

    local result=$(remote_exec "curl -sf http://localhost:3000/health 2>&1 || echo 'FAIL'")

    if echo "$result" | grep -q "FAIL"; then
        log_error "Backend health check FAILED"
        BACKEND_STATUS=1
    else
        log_success "Backend health check OK"
        BACKEND_STATUS=0
    fi
}

# Check MongoDB
check_mongodb() {
    log_info "🗄️ Checking MongoDB..."

    local result=$(remote_exec "
        if docker ps | grep -q mongo; then
            docker exec \$(docker ps -q -f name=mongo) mongosh localhost:27017 --eval 'db.adminCommand(\"ping\")' 2>/dev/null | grep -q 'ok.*1' && echo 'OK' || echo 'FAIL'
        else
            echo 'NOT_RUNNING'
        fi
    ")

    if echo "$result" | grep -q "OK"; then
        log_success "MongoDB OK"
        MONGO_STATUS=0
    elif echo "$result" | grep -q "NOT_RUNNING"; then
        log_warn "MongoDB container not running"
        MONGO_STATUS=1
    else
        log_error "MongoDB health check FAILED"
        MONGO_STATUS=1
    fi
}

# Check PostgreSQL
check_postgresql() {
    log_info "🗄️ Checking PostgreSQL..."

    local result=$(remote_exec "
        if docker ps | grep -q postgres; then
            docker exec \$(docker ps -q -f name=postgres) pg_isready -U cpq12 2>/dev/null | grep -q 'accepting' && echo 'OK' || echo 'FAIL'
        else
            echo 'NOT_RUNNING'
        fi
    ")

    if echo "$result" | grep -q "OK"; then
        log_success "PostgreSQL OK"
        POSTGRES_STATUS=0
    elif echo "$result" | grep -q "NOT_RUNNING"; then
        log_warn "PostgreSQL container not running"
        POSTGRES_STATUS=1
    else
        log_error "PostgreSQL health check FAILED"
        POSTGRES_STATUS=1
    fi
}

# Check disk space
check_disk_space() {
    log_info "💾 Checking disk space..."

    local result=$(remote_exec "df -h / | tail -1 | awk '{print \$5}' | sed 's/%//'")

    if [[ "$result" =~ ^[0-9]+$ ]]; then
        local usage=$result
        if [ "$usage" -gt 90 ]; then
            log_error "Disk usage is ${usage}% (critical)"
        elif [ "$usage" -gt 80 ]; then
            log_warn "Disk usage is ${usage}% (warning)"
        else
            log_success "Disk usage is ${usage}%"
        fi
    fi
}

# Check memory usage
check_memory() {
    log_info "🧠 Checking memory usage..."

    local result=$(remote_exec "free | grep Mem | awk '{printf \"%.0f\", (\$3/\$2)*100}'")

    if [[ "$result" =~ ^[0-9]+$ ]]; then
        local usage=$result
        if [ "$usage" -gt 90 ]; then
            log_error "Memory usage is ${usage}% (critical)"
        elif [ "$usage" -gt 80 ]; then
            log_warn "Memory usage is ${usage}% (warning)"
        else
            log_success "Memory usage is ${usage}%"
        fi
    fi
}

# Display overall status
display_status() {
    echo ""
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_info "📊 Health Check Summary"
    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ $DOCKER_STATUS -eq 0 ]; then
        log_success "Docker: OK"
    else
        log_error "Docker: FAILED"
    fi

    if [ $CONTAINER_STATUS -eq 0 ]; then
        log_success "Container: Running"
    else
        log_error "Container: Not running"
    fi

    if [ $BACKEND_STATUS -eq 0 ]; then
        log_success "Backend: OK"
    else
        log_error "Backend: FAILED"
    fi

    if [ $MONGO_STATUS -eq 0 ]; then
        log_success "MongoDB: OK"
    else
        log_warn "MongoDB: FAILED/Not running"
    fi

    if [ $POSTGRES_STATUS -eq 0 ]; then
        log_success "PostgreSQL: OK"
    else
        log_warn "PostgreSQL: FAILED/Not running"
    fi

    log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Determine overall status
    local OVERALL_STATUS=$((BACKEND_STATUS + CONTAINER_STATUS + DOCKER_STATUS))
    if [ $OVERALL_STATUS -eq 0 ]; then
        log_success "Overall Status: HEALTHY ✨"
        return 0
    else
        log_error "Overall Status: UNHEALTHY"
        return 1
    fi
}

# Perform single health check
perform_check() {
    log_info "🔍 Running health checks for CPQ12 Development Server"
    log_info "Server: ${DEV_SERVER}"
    log_info "User: ${DEV_USER}"
    echo ""

    check_ssh || exit 1
    check_docker
    check_container
    check_backend
    check_mongodb
    check_postgresql
    check_disk_space
    check_memory
    display_status
}

# Continuous monitoring
continuous_monitor() {
    log_info "🔁 Starting continuous health monitoring (interval: ${CHECK_INTERVAL}s)"
    log_info "Press Ctrl+C to exit"
    echo ""

    while true; do
        perform_check
        echo ""
        log_info "Next check in ${CHECK_INTERVAL} seconds..."
        sleep "$CHECK_INTERVAL"
        clear
    done
}

# Main execution
main() {
    if [ -z "$DEV_PASSWORD" ]; then
        log_error "Error: DEPLOY_PASSWORD environment variable is required"
        echo "Usage: DEPLOY_PASSWORD='password' bash scripts/health-check-dev.sh"
        exit 1
    fi

    if [ "$CONTINUOUS" = true ]; then
        trap 'log_info "Health monitoring stopped"; exit 0' SIGINT
        continuous_monitor
    else
        perform_check
    fi
}

main "$@"
