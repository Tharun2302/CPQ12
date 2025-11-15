#!/bin/bash
# CPQ Application - Production Readiness Check (Linux/macOS)
# This script verifies that your application is ready for customers in production

SERVER_URL="${1:-https://zenop.ai}"
DETAILED="${2:-false}"

ALL_CHECKS_PASSED=true
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
CRITICAL_FAILURES=0
HIGH_FAILURES=0
MEDIUM_FAILURES=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

check_result() {
    local check_name="$1"
    local passed="$2"
    local message="$3"
    local severity="${4:-INFO}"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if [ "$passed" = "true" ]; then
        echo -e "${GREEN}✅ PASS${NC} - $check_name"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        if [ -n "$message" ]; then
            echo -e "   ${GRAY}$message${NC}"
        fi
    else
        echo -e "${RED}❌ FAIL${NC} - $check_name"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        ALL_CHECKS_PASSED=false
        if [ -n "$message" ]; then
            echo -e "   ${YELLOW}$message${NC}"
        fi
        
        case "$severity" in
            "CRITICAL") CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1)) ;;
            "HIGH") HIGH_FAILURES=$((HIGH_FAILURES + 1)) ;;
            "MEDIUM") MEDIUM_FAILURES=$((MEDIUM_FAILURES + 1)) ;;
        esac
    fi
}

test_endpoint() {
    local url="$1"
    local timeout="${2:-30}"
    
    if command -v curl &> /dev/null; then
        local start_time=$(date +%s%N)
        local response=$(curl -s -w "\n%{http_code}" --max-time "$timeout" "$url" 2>&1)
        local end_time=$(date +%s%N)
        local response_time=$(( (end_time - start_time) / 1000000 ))
        
        local http_code=$(echo "$response" | tail -n1)
        local body=$(echo "$response" | sed '$d')
        
        if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
            echo "SUCCESS|$http_code|$response_time|$body"
        else
            echo "FAIL|$http_code|$response_time|$body"
        fi
    else
        echo "FAIL|0|0|curl not installed"
    fi
}

echo -e "\n${CYAN}🚀 CPQ Application Production Readiness Check${NC}"
echo -e "${CYAN}============================================================${NC}"
echo -e "${GRAY}Server URL: $SERVER_URL\n${NC}"

# ============================================
# 1. BASIC CONNECTIVITY CHECKS
# ============================================
echo -e "\n${YELLOW}📡 1. BASIC CONNECTIVITY${NC}"
echo "------------------------------------------------------------"

connectivity=$(test_endpoint "$SERVER_URL/api/health")
status=$(echo "$connectivity" | cut -d'|' -f1)
http_code=$(echo "$connectivity" | cut -d'|' -f2)
response_time=$(echo "$connectivity" | cut -d'|' -f3)

if [ "$status" = "SUCCESS" ]; then
    check_result "Server Reachability" true "Server responded in ${response_time}ms"
else
    check_result "Server Reachability" false "Cannot reach server (HTTP $http_code)" "CRITICAL"
    echo -e "\n${RED}❌ CRITICAL: Cannot connect to server. Please check:${NC}"
    echo -e "   ${YELLOW}- Is the server running?${NC}"
    echo -e "   ${YELLOW}- Is the URL correct? ($SERVER_URL)${NC}"
    echo -e "   ${YELLOW}- Are firewall rules configured?${NC}"
    exit 1
fi

# Check HTTPS/SSL
if [[ "$SERVER_URL" == https://* ]]; then
    check_result "HTTPS/SSL Enabled" true "Using secure HTTPS connection"
else
    check_result "HTTPS/SSL Enabled" false "Not using HTTPS - SECURITY RISK!" "CRITICAL"
fi

# Check response time
if [ "$response_time" -lt 1000 ]; then
    check_result "Response Time" true "Excellent: ${response_time}ms"
elif [ "$response_time" -lt 3000 ]; then
    check_result "Response Time" true "Good: ${response_time}ms"
elif [ "$response_time" -lt 5000 ]; then
    check_result "Response Time" true "Acceptable: ${response_time}ms (consider optimization)"
else
    check_result "Response Time" false "Slow: ${response_time}ms - Performance issue!" "HIGH"
fi

# ============================================
# 2. HEALTH CHECK ENDPOINTS
# ============================================
echo -e "\n${YELLOW}🏥 2. HEALTH CHECK ENDPOINTS${NC}"
echo "------------------------------------------------------------"

health_check=$(test_endpoint "$SERVER_URL/api/health")
health_status=$(echo "$health_check" | cut -d'|' -f1)
health_body=$(echo "$health_check" | cut -d'|' -f4)

if [ "$health_status" = "SUCCESS" ]; then
    if echo "$health_body" | grep -q '"success":true'; then
        check_result "Application Health" true "Application is healthy"
    else
        check_result "Application Health" false "Application health check failed" "CRITICAL"
    fi
else
    check_result "Application Health" false "Health check endpoint unreachable" "CRITICAL"
fi

# Database health check
db_health=$(test_endpoint "$SERVER_URL/api/database/health")
db_status=$(echo "$db_health" | cut -d'|' -f1)
db_body=$(echo "$db_health" | cut -d'|' -f4)

if [ "$db_status" = "SUCCESS" ]; then
    if echo "$db_body" | grep -q '"success":true'; then
        check_result "Database Connection" true "Database is connected"
    else
        check_result "Database Connection" false "Database connection failed" "CRITICAL"
    fi
else
    check_result "Database Connection" false "Cannot check database" "CRITICAL"
fi

# ============================================
# 3. FRONTEND ACCESSIBILITY
# ============================================
echo -e "\n${YELLOW}🌐 3. FRONTEND ACCESSIBILITY${NC}"
echo "------------------------------------------------------------"

frontend_check=$(test_endpoint "$SERVER_URL")
frontend_status=$(echo "$frontend_check" | cut -d'|' -f1)

if [ "$frontend_status" = "SUCCESS" ]; then
    check_result "Frontend Accessibility" true "Frontend is accessible"
else
    check_result "Frontend Accessibility" false "Cannot access frontend" "CRITICAL"
fi

# ============================================
# SUMMARY REPORT
# ============================================
echo -e "\n${CYAN}============================================================${NC}"
echo -e "${CYAN}📊 PRODUCTION READINESS SUMMARY${NC}"
echo -e "${CYAN}============================================================${NC}"

echo -e "\nTotal Checks: $TOTAL_CHECKS"
echo -e "${GREEN}✅ Passed: $PASSED_CHECKS${NC}"
echo -e "${RED}❌ Failed: $FAILED_CHECKS${NC}"

if [ "$CRITICAL_FAILURES" -gt 0 ]; then
    echo -e "\n${RED}🚨 CRITICAL ISSUES: $CRITICAL_FAILURES${NC}"
fi

if [ "$HIGH_FAILURES" -gt 0 ]; then
    echo -e "\n${YELLOW}⚠️  HIGH PRIORITY ISSUES: $HIGH_FAILURES${NC}"
fi

# Final verdict
echo -e "\n${CYAN}============================================================${NC}"
if [ "$ALL_CHECKS_PASSED" = "true" ] && [ "$CRITICAL_FAILURES" -eq 0 ]; then
    echo -e "${GREEN}✅ PRODUCTION READY!${NC}"
    echo -e "${GREEN}Your application appears ready for customers.${NC}"
    echo -e "\n${YELLOW}Recommended next steps:${NC}"
    echo -e "   ${GRAY}1. Monitor the application for 24-48 hours${NC}"
    echo -e "   ${GRAY}2. Set up automated monitoring${NC}"
    echo -e "   ${GRAY}3. Configure alerting for critical issues${NC}"
    exit 0
else
    echo -e "${RED}❌ NOT PRODUCTION READY${NC}"
    echo -e "${RED}Please fix the issues above before going live.${NC}"
    exit 1
fi

