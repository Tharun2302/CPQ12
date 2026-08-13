#!/bin/sh
# Daily EOD checks (bash implementation)
ENV_FILE=/root/.cpq-monitor/monitor.env
if [ -f "$ENV_FILE" ]; then
  . "$ENV_FILE"
fi
TEAMS_WEBHOOK_URL=${TEAMS_WEBHOOK_URL:-}
REPORT_DIR=/root/CPQ12/logs/monitor
mkdir -p "$REPORT_DIR"
HOST=${APP_HOST:-http://localhost:3000}
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
REPORT_PATH="$REPORT_DIR/daily-${TIMESTAMP}.txt"

echo "EOD checks: $TIMESTAMP" > "$REPORT_PATH"
echo "Host: $HOST" >> "$REPORT_PATH"

echo "
-- HEALTH CHECKS --" >> "$REPORT_PATH"
for ep in "$HOST/health" "$HOST/api/health" "$HOST/status"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$ep" || echo "000")
  if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
    echo "OK $ep (HTTP $code)" >> "$REPORT_PATH"
  else
    echo "FAIL $ep (HTTP $code)" >> "$REPORT_PATH"
  fi
done

POST_PAYLOAD=test:true

check_group() {
  label=$1
  shift
  echo "\n-- $label --" >> "$REPORT_PATH"
  for ep in "$@"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 15 -X POST -H "Content-Type: application/json" -d "$POST_PAYLOAD" "$ep" || echo "000")
    if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
      echo "OK $ep (HTTP $code)" >> "$REPORT_PATH"
    else
      echo "FAIL $ep (HTTP $code)" >> "$REPORT_PATH"
    fi
  done
}

# PDF generation
check_group "PDF generation" "$HOST/api/test/generate-pdf" "$HOST/api/generate-pdf" "$HOST/test/generate-pdf"
# Redline/edit
check_group "Redline/edit" "$HOST/api/test/redline" "$HOST/api/test/edit-redline" "$HOST/api/redline"
# Send for approval
check_group "Send-for-approval" "$HOST/api/test/send-for-approval" "$HOST/api/test/approval" "$HOST/api/approvals/test"
# E-sign
check_group "E-sign" "$HOST/api/test/esign" "$HOST/api/test/esignature" "$HOST/api/esign/test"

# Local script presence
echo "\n-- Local test scripts presence --" >> "$REPORT_PATH"
for p in scripts/generate-pdf-test.cjs scripts/generate-pdf.cjs scripts/test-esign.cjs scripts/test-approval.cjs monitor-daily-checks.cjs; do
  if [ -f "/root/CPQ12/$p" ]; then
    echo "PRESENT /root/CPQ12/$p" >> "$REPORT_PATH"
  else
    echo "MISSING /root/CPQ12/$p" >> "$REPORT_PATH"
  fi
done

# Post to Teams if configured
if [ -n "$TEAMS_WEBHOOK_URL" ]; then
  summary=$(sed -n 1,200p "$REPORT_PATH" | sed :a cat > /root/CPQ12/monitor-daily-checks.sh <<'SH'
#!/bin/sh
# Daily EOD checks (bash implementation)
ENV_FILE=/root/.cpq-monitor/monitor.env
if [ -f "$ENV_FILE" ]; then
  . "$ENV_FILE"
fi
TEAMS_WEBHOOK_URL=${TEAMS_WEBHOOK_URL:-}
REPORT_DIR=/root/CPQ12/logs/monitor
mkdir -p "$REPORT_DIR"
HOST=${APP_HOST:-http://localhost:3000}
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
REPORT_PATH="$REPORT_DIR/daily-${TIMESTAMP}.txt"

echo "EOD checks: $TIMESTAMP" > "$REPORT_PATH"
echo "Host: $HOST" >> "$REPORT_PATH"

echo "
-- HEALTH CHECKS --" >> "$REPORT_PATH"
for ep in "$HOST/health" "$HOST/api/health" "$HOST/status"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$ep" || echo "000")
  if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
    echo "OK $ep (HTTP $code)" >> "$REPORT_PATH"
  else
    echo "FAIL $ep (HTTP $code)" >> "$REPORT_PATH"
  fi
done

POST_PAYLOAD=dryRun:true

check_group() {
  label=$1
  shift
  echo "\n-- $label --" >> "$REPORT_PATH"
  for ep in "$@"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 15 -X POST -H "Content-Type: application/json" -d "$POST_PAYLOAD" "$ep" || echo "000")
    if [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
      echo "OK $ep (HTTP $code)" >> "$REPORT_PATH"
    else
      echo "FAIL $ep (HTTP $code)" >> "$REPORT_PATH"
    fi
  done
}

# PDF generation
check_group "PDF generation" "$HOST/api/test/generate-pdf" "$HOST/api/generate-pdf" "$HOST/test/generate-pdf"
# Redline/edit
check_group "Redline/edit" "$HOST/api/test/redline" "$HOST/api/test/edit-redline" "$HOST/api/redline"
# Send for approval
check_group "Send-for-approval" "$HOST/api/test/send-for-approval" "$HOST/api/test/approval" "$HOST/api/approvals/test"
# E-sign
check_group "E-sign" "$HOST/api/test/esign" "$HOST/api/test/esignature" "$HOST/api/esign/test"

# Local script presence
echo "\n-- Local test scripts presence --" >> "$REPORT_PATH"
for p in scripts/generate-pdf-test.cjs scripts/generate-pdf.cjs scripts/test-esign.cjs scripts/test-approval.cjs monitor-daily-checks.cjs; do
  if [ -f "/root/CPQ12/$p" ]; then
    echo "PRESENT /root/CPQ12/$p" >> "$REPORT_PATH"
  else
    echo "MISSING /root/CPQ12/$p" >> "$REPORT_PATH"
  fi
done

# Post to Teams if configured
if [ -n "$TEAMS_WEBHOOK_URL" ]; then
  summary=$(sed -n 1,200p "$REPORT_PATH" | sed :a
