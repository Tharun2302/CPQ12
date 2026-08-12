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

// ---- Config --------------------------------------------------------------
const ENV_FILE = process.env.MONITOR_ENV_FILE || '/root/.cpq-monitor/monitor.env';
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const CONTAINER = process.env.CPQ_CONTAINER || 'cpq-application';
const REPORT_DIR = process.env.REPORT_DIR || '/app/CPQ12/logs/monitor';
const STATE_FILE = process.env.STATE_FILE || '/app/CPQ12/logs/monitor/.state.json';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const SCAN_LABEL = process.env.SCAN_LABEL || 'CPQ12 User & Error Monitor';
const MAX_SAMPLE_LINES = parseInt(process.env.MAX_SAMPLE_LINES || '12', 10);
const FORCE_ALERT = process.env.FORCE_ALERT === '1';

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
];

// ---- Helpers -------------------------------------------------------------
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastTs: 0 }; }
}
function saveState(s) {
  ensureDir(path.dirname(STATE_FILE));
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// Docker log lines look like: 2026-08-12T10:34:56.123456789Z message
// Extract the timestamp (ms) so we only scan NEW lines since last run.
function parseTs(line) {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?/);
  if (!m) return null;
  const t = Date.parse(m[1] + 'Z');
  return isNaN(t) ? null : t;
}

function classify(line) {
  const isUser = USER_ACTIVITY_PATTERNS.some(p => p.test(line));
  const isBug = GENERIC_PATTERNS.some(p => p.test(line));
  return { isUser, isBug };
}

function getContainerLogs() {
  // --since takes an RFC3339 timestamp; we pass lastTs so docker returns
  // only lines newer than our last processed timestamp.
  const state = loadState();
  let sinceArg = '';
  if (state.lastTs) {
    sinceArg = new Date(state.lastTs - 1000).toISOString();
  }
  try {
    const out = execFileSync('docker', ['logs', CONTAINER], { encoding: 'utf8' });
    // docker logs returns ALL logs; filter by timestamp ourselves for precision
    const allLines = out.split(/\r?\n/);
    let lastTs = state.lastTs || 0;
    const newLines = [];
    for (const line of allLines) {
      if (!line.trim()) continue;
      const ts = parseTs(line);
      const pure = ts ? line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s*/, '') : line;
      if (ts && ts <= lastTs) continue;
      if (ts) lastTs = Math.max(lastTs, ts);
      newLines.push(pure);
    }
    saveState({ lastTs });
    return newLines;
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
  ensureDir(REPORT_DIR);
  const lines = FORCE_ALERT ? ['FORCE TEST LINE'] : getContainerLogs();
  let bugCount = 0, userCount = 0;
  const userLines = [], bugLines = [];

  for (const line of lines) {
    if (NOISE_PATTERNS.some(p => p.test(line))) continue; // skip known-noisy lines
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
  fs.writeFileSync(reportPath, report);

  console.log(`Report written: ${reportPath}`);
  console.log(`bugCount=${bugCount} userCount=${userCount}`);

  // Always send a heartbeat to Teams: a health summary when clean,
  // or the bug report (with the "why") when issues are found.
  let message;
  if (FORCE_ALERT) {
    message = `🔔 ${SCAN_LABEL} TEST ALERT\nThis is a forced test message to verify Teams delivery.`;
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
  const payload = { message, bugCount, userCount, generatedAt, healthy: (bugCount === 0 && userCount === 0) };
  const ok = await postToTeams(payload);
  console.log(`[teams] notification sent: ${ok}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
