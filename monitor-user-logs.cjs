#!/usr/bin/env node
/**
 * CPQ12 user-activity log monitor (Docker edition).
 *
 * Reads logs from the live CPQ app container (`cpq-application`) via
 * `docker logs`, scans for bug patterns, writes a dated report, and
 * (if TEAMS_WEBHOOK_URL is set) POSTs an alert with the "why" to
 * Microsoft Teams via a Power Automate flow.
 *
 * No restart or code changes needed — docker already logs the running app.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');
const aiExplain = require('./monitor-ai-explain.cjs');

// ---- Config --------------------------------------------------------------
const ENV_FILE = process.env.MONITOR_ENV_FILE || '/root/.cpq-monitor/monitor.env';
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const CONTAINER = process.env.CPQ_CONTAINER || 'cpq-application';
const REPORT_DIR = process.env.REPORT_DIR || '/root/CPQ12/logs/monitor';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const SCAN_LABEL = process.env.SCAN_LABEL || 'CPQ12 User & Error Monitor';
const MAX_SAMPLE_LINES = parseInt(process.env.MAX_SAMPLE_LINES || '12', 10);
const SCAN_WINDOW_MINUTES = parseInt(process.env.SCAN_WINDOW_MINUTES || '16', 10);
const FORCE_ALERT = process.env.FORCE_ALERT === '1';
const MONITOR_LOG_FILE = process.env.MONITOR_LOG_FILE || '';

// Bug patterns. User-activity failures are tagged separately in the alert.
const GENERIC_PATTERNS = [
  /ERROR/i, /Unhandled/i, /Uncaught/i, /MongoError/i,
  /TypeError/i, /EADDRINUSE/i, /RangeError/i, /SyntaxError/i,
  /ECONNREFUSED/i, /ETIMEDOUT/i, /ENOENT/i, /Cannot find module/i,
];
const USER_ACTIVITY_PATTERNS = [
  /Invalid email or password/i,
  /Database not available/i,
  /Login error/i,
  /jwt/i, /token expir/i, /unauthor/i, /forbidden/i,
  /permission/i, /already logged in/i, /logged in/i,
];

// Known-noisy lines to ignore (avoid alert storms on benign/repeating issues).
const NOISE_PATTERNS = [
  /Not allowed by CORS: https:\/\/www\.zenop\.ai/i,
  /❌ Errors: 0(?!\d)/,
];

// ---- Helpers -------------------------------------------------------------
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function classify(line) {
  const isUser = USER_ACTIVITY_PATTERNS.some(p => p.test(line));
  const isBug = GENERIC_PATTERNS.some(p => p.test(line));
  return { isUser, isBug };
}

function getContainerLogs() {
  // Container log lines have NO leading timestamps, so incremental-by-time
  // tracking on the line itself is impossible. Instead we ask docker for
  // only the logs from the last SCAN_WINDOW_MINUTES (default 16, covering
  // the 15-min cron gap plus a small overlap to avoid missing a boundary).
  const windowMin = parseInt(process.env.SCAN_WINDOW_MINUTES || '16', 10);
  if (MONITOR_LOG_FILE) {
    try {
      return fs.readFileSync(MONITOR_LOG_FILE, 'utf8').split(/\r?\n/).filter(l => l.trim().length);
    } catch (e) {
      console.error('Failed to read MONITOR_LOG_FILE', MONITOR_LOG_FILE, e.message);
      return [];
    }
  }
  try {
    const out = execFileSync('docker', ['logs', '--since', `${windowMin}m`, CONTAINER], { encoding: 'utf8' });
    const lines = out.split(/\r?\n/).filter(l => l.trim().length);
    return lines;
  } catch (e) {
    console.error('Failed to read docker logs for', CONTAINER, e.message);
    return [];
  }
}

function postToTeams(payload) {
  if (!TEAMS_WEBHOOK_URL) {
    console.log('[teams] No TEAMS_WEBHOOK_URL set — skipping notification.');
    return Promise.resolve(false);
  }
  let url;
  try { url = new URL(TEAMS_WEBHOOK_URL); } catch (e) {
    console.error('[teams] Invalid webhook URL', e.message);
    return Promise.resolve(false);
  }
  const body = JSON.stringify(payload);
  const lib = url.protocol === 'http:' ? http : https;
  const opts = {
    method: 'POST',
    hostname: url.hostname,
    // Pre-existing bug: without this a webhook URL carrying an explicit port was sent to :80/:443.
    // No effect on production URLs, where url.port is '' and this stays undefined.
    port: url.port || undefined,
    path: url.pathname + url.search,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  return new Promise((resolve) => {
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
    });
    req.on('error', (e) => { console.error('[teams] error', e.message); resolve(false); });
    req.write(body);
    req.end();
  });
}

function buildMessage(summary, userLines, bugLines) {
  const sample = [...userLines, ...bugLines].slice(0, MAX_SAMPLE_LINES)
    .map(l => '• ' + (l.length > 280 ? l.slice(0, 280) + '…' : l));
  const lines = [
    `🔎 ${SCAN_LABEL}`,
    `Time: ${summary.generatedAt}`,
    `Container: ${CONTAINER}`,
    `New bug/error lines: ${summary.bugCount}`,
    `User-activity events: ${summary.userCount}`,
  ];
  if (userLines.length) {
    lines.push('', 'USER-ACTIVITY (why):');
    userLines.slice(0, MAX_SAMPLE_LINES).forEach(l => lines.push('• ' + (l.length > 280 ? l.slice(0, 280) + '…' : l)));
  }
  if (bugLines.length) {
    lines.push('', 'GENERIC ERRORS (why):');
    bugLines.slice(0, MAX_SAMPLE_LINES).forEach(l => lines.push('• ' + (l.length > 280 ? l.slice(0, 280) + '…' : l)));
  }
  if (!userLines.length && !bugLines.length) {
    lines.push('', 'No issues found in scanned window.');
  }
  return lines.join('\n');
}

// ---- Main -----------------------------------------------------------------
async function main() {
  // A full disk or a permissions change must not cost us the alert — the same availability rule
  // that applies to the AI layer applies to the report.
  let reportUsable = true;
  try {
    ensureDir(REPORT_DIR);
  } catch (e) {
    reportUsable = false;
    console.error('Could not create the report directory:', e.message);
  }
  const lines = FORCE_ALERT ? ['FORCE TEST LINE'] : getContainerLogs();
  let bugCount = 0, userCount = 0;
  const userLines = [], bugLines = [];
  // The AI layer must see the same filtered view the counts are built from: a suppressed line
  // that still reached the API would burn a group slot and a paid call.
  const scannedLines = [];

  for (const line of lines) {
    if (NOISE_PATTERNS.some(p => p.test(line))) continue; // skip known-noisy lines
    scannedLines.push(line);
    const { isUser, isBug } = classify(line);
    if (isUser) { userCount++; userLines.push(line); }
    if (isBug) { bugCount++; bugLines.push(line); }
  }

  const generatedAt = new Date().toISOString();
  const summary = { generatedAt, container: CONTAINER, bugCount, userCount };

  const reportName = `monitor-${generatedAt.slice(0, 10)}T${generatedAt.slice(11, 19).replace(/:/g, '')}.txt`;
  const reportPath = path.join(REPORT_DIR, reportName);
  const report = [
    `=== ${SCAN_LABEL} ===`,
    `Generated: ${generatedAt}`,
    `Container: ${CONTAINER}`,
    `New bug lines: ${bugCount}`,
    `User-activity events: ${userCount}`,
    '',
    '--- User-activity (why) ---',
    userLines.length ? userLines.join('\n') : '(none)',
    '',
    '--- Generic bug lines (why) ---',
    bugLines.length ? bugLines.join('\n') : '(none)',
  ].join('\n');
  try {
    if (reportUsable) fs.writeFileSync(reportPath, report);
  } catch (e) {
    reportUsable = false;
    console.error('Could not write the report:', e.message);
  }

  if (reportUsable) console.log(`Report written: ${reportPath}`);
  console.log(`bugCount=${bugCount} userCount=${userCount}`);

  const idleStatus = FORCE_ALERT ? 'skipped_force_alert' : 'skipped_clean';
  let ai = { ai: null, aiStatus: idleStatus, errorGroups: 0, provider: null, model: null, groups: [] };
  if (!FORCE_ALERT && (bugCount > 0 || userCount > 0)) {
    try {
      ai = await aiExplain.explainErrors(scannedLines, {
        generatedAt, container: CONTAINER, windowMinutes: SCAN_WINDOW_MINUTES,
        genericPatterns: GENERIC_PATTERNS,
      });
    } catch (e) {
      console.error('[ai] layer threw — falling back to raw lines:', e.message);
      ai = { ai: null, aiStatus: 'failed_internal', errorGroups: 0, provider: null, model: null, groups: [] };
    }
  }

  // Always send a heartbeat to Teams: a health summary when clean,
  // or the bug report (with the "why") when issues are found.
  let message;
  if (FORCE_ALERT) {
    message = `🔔 ${SCAN_LABEL} TEST ALERT\nThis is a forced test message to verify Teams delivery.`;
  } else if (ai.ai) {
    // Rendering must not be the one unguarded step: a malformed cached explanation used to throw
    // past main()'s catch and exit 1 with no Teams alert at all.
    try {
      message = aiExplain.renderAiMessage(
        { generatedAt, container: CONTAINER, bugCount, userCount, label: SCAN_LABEL,
          maxMessageChars: parseInt(process.env.AI_MAX_MESSAGE_CHARS || '8000', 10) },
        ai.ai, ai.groups,
      );
    } catch (e) {
      console.error('[ai] could not render the explanation — falling back to raw lines:', e.message);
      ai = { ai: null, aiStatus: 'failed_render', errorGroups: ai.errorGroups, provider: null, model: null, groups: [] };
      message = buildMessage(summary, userLines, bugLines);
    }
  } else if (bugCount > 0 || userCount > 0) {
    message = buildMessage(summary, userLines, bugLines);
  } else {
    message = [
      `✅ ${SCAN_LABEL} — HEALTHY`,
      `Time: ${generatedAt}`,
      `Container: ${CONTAINER}`,
      `Status: All working good. No errors or user-activity issues in the last scan window.`,
    ].join('\n');
  }
  // Additive only: the five existing keys keep their names, types and meaning so the existing
  // Power Automate flow keeps working. `healthy` still means "no errors", not "AI succeeded".
  const payload = {
    message, bugCount, userCount, generatedAt,
    healthy: (bugCount === 0 && userCount === 0),
    aiExplained: Boolean(ai.ai),
    aiStatus: ai.aiStatus,
    severity: ai.ai ? ai.ai.worstSeverity : null,
    aiSummary: ai.ai ? ai.ai.overallSummary : null,
    errorGroups: ai.errorGroups,
    aiProvider: ai.ai ? ai.provider : null,
    aiModel: ai.ai ? ai.model : null,
  };

  try {
    if (reportUsable) fs.appendFileSync(reportPath, ['', '--- AI explanation ---',
      `Status: ${ai.aiStatus}`,
      `Provider/model: ${ai.ai ? `${ai.provider} / ${ai.model}` : '(none)'}`,
      ai.ai ? message : '(no explanation this scan — see Status above)', ''].join('\n'));
  } catch (e) {
    console.error('Could not append the AI section to the report:', e.message);
  }

  const ok = await postToTeams(payload);
  console.log(`[teams] notification sent: ${ok}`);
  return payload;
}

if (require.main === module) {
  main().catch(e => { console.error('FATAL', e); process.exit(1); });
}

module.exports = { buildMessage, classify, getContainerLogs, main,
  GENERIC_PATTERNS, USER_ACTIVITY_PATTERNS, NOISE_PATTERNS };
