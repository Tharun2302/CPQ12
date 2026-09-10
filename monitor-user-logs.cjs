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
const { spawnSync } = require('child_process');
const aiExplain = require('./monitor-ai-explain.cjs');

// ---- Config --------------------------------------------------------------
const ENV_FILE = process.env.MONITOR_ENV_FILE || '/root/.cpq-monitor/monitor.env';
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

/**
 * parseInt('1.9e6') is 1 and parseInt('abc') is NaN, and both reach spawnSync as a 1-byte or
 * invalid ceiling that blinds the monitor on every scan. A value outside the range is refused
 * loudly and the default is used instead.
 * @returns {number} the configured value, or `fallback` when it is missing or out of range
 */
function intEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const parsed = Number(String(raw).trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    console.error(`[config] ${name}="${raw}" is not a whole number in`,
      `[${min}, ${max}] — using ${fallback}`);
    return fallback;
  }
  return parsed;
}

const CONTAINER = process.env.CPQ_CONTAINER || 'cpq-application';
const REPORT_DIR = process.env.REPORT_DIR || '/root/CPQ12/logs/monitor';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const SCAN_LABEL = process.env.SCAN_LABEL || 'CPQ12 User & Error Monitor';
const MAX_SAMPLE_LINES = intEnv('MAX_SAMPLE_LINES', 12, 1, 200);
const SCAN_WINDOW_MINUTES = intEnv('SCAN_WINDOW_MINUTES', 16, 1, 1440);
const FORCE_ALERT = process.env.FORCE_ALERT === '1';
const MONITOR_LOG_FILE = process.env.MONITOR_LOG_FILE || '';
// PER STREAM, so this is really a 2x ceiling, and every byte of it lands in the heap of a 1 GB
// droplet. 8 MB is ~60k lines per window — far past real traffic, and ~50 MB peak, not ~500 MB.
const DOCKER_MAX_BUFFER_BYTES = intEnv('DOCKER_MAX_BUFFER_BYTES', 8 * 1024 * 1024,
  1024 * 1024, 64 * 1024 * 1024);
// A wedged docker daemon must not hold the cron open until the next run overlaps it.
const DOCKER_TIMEOUT_MS = intEnv('DOCKER_TIMEOUT_MS', 60000, 1000, 600000);

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

// `docker logs` can give up mid-stream and still exit 0, writing its own diagnostic onto the same
// stderr the container uses. Scanning that text manufactures a fake application bug.
const DOCKER_CLI_STREAM_ERRORS = [
  /^error from daemon in stream:/i,
  /^error grabbing logs:/i,
  /^error reading log stream:/i,
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

/** @returns {{ok: boolean, lines: string[], reason: ?string}} */
function scanResult(ok, lines, reason) {
  return { ok, lines, reason: reason || null };
}

function splitLines(text) {
  return String(text).split(/\r?\n/).filter(l => l.trim().length)
    .map(l => aiExplain.capScanLine(l));
}

/** Splits docker's own mid-stream diagnostics out of the container's stderr. */
function partitionCliErrors(lines) {
  const app = [];
  const cli = [];
  for (const line of lines) {
    if (DOCKER_CLI_STREAM_ERRORS.some(p => p.test(line))) cli.push(line);
    else app.push(line);
  }
  return { app, cli };
}

/**
 * Reads the scan window's log lines. A failure returns ok:false, never a silent empty array —
 * "scanned, nothing found" and "could not scan" must reach Teams as different messages.
 * @returns {{ok: boolean, lines: string[], reason: ?string}}
 */
function getContainerLogs() {
  // Container log lines have NO leading timestamps, so incremental-by-time
  // tracking on the line itself is impossible. Instead we ask docker for
  // only the logs from the last SCAN_WINDOW_MINUTES (default 16, covering
  // the 15-min cron gap plus a small overlap to avoid missing a boundary).
  if (MONITOR_LOG_FILE) {
    try {
      return scanResult(true, splitLines(fs.readFileSync(MONITOR_LOG_FILE, 'utf8')), null);
    } catch (e) {
      console.error('Failed to read MONITOR_LOG_FILE', MONITOR_LOG_FILE, e.message);
      return scanResult(false, [], `could not read ${MONITOR_LOG_FILE}: ${e.message}`);
    }
  }
  let res;
  try {
    res = spawnSync('docker', ['logs', '--since', `${SCAN_WINDOW_MINUTES}m`, CONTAINER],
      { encoding: 'utf8', maxBuffer: DOCKER_MAX_BUFFER_BYTES, timeout: DOCKER_TIMEOUT_MS });
  } catch (e) {
    console.error('Failed to read docker logs for', CONTAINER, e.message);
    return scanResult(false, [], e.message);
  }
  if (res.error || res.status !== 0) {
    // A docker CLI failure (missing container, daemon down, ENOBUFS) must never be parsed as app
    // log lines. The tail, not the head: a stream that died late carries the reason at the end.
    const tail = String(res.stderr || '').trim().slice(-400) || '(nothing on stderr)';
    const why = res.error ? res.error.message : `docker logs exited ${res.status}: ${tail}`;
    console.error('Failed to read docker logs for', CONTAINER, why);
    return scanResult(false, [], why);
  }
  // stderr FIRST: the app logs its errors there and the alert only samples the first few lines,
  // so stdout-first ordering pushed the one real error out of the message.
  const { app, cli } = partitionCliErrors(splitLines(`${res.stderr || ''}\n${res.stdout || ''}`));
  if (!cli.length) return scanResult(true, app, null);
  console.error('docker logs reported a stream error for', CONTAINER, cli[0].slice(0, 400));
  return scanResult(false, app, cli[0].slice(0, 280));
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

/**
 * Redact BEFORE truncating: cutting at 280 first can leave half a credential in the alert.
 * The Teams payload leaves the box, so it gets the same masking the AI prompt gets.
 */
function bullet(line) {
  const safe = aiExplain.redact(line);
  return '• ' + (safe.length > 280 ? safe.slice(0, 280) + '…' : safe);
}

function sampleSections(userLines, bugLines) {
  const lines = [];
  if (userLines.length) {
    lines.push('', 'USER-ACTIVITY (why):');
    userLines.slice(0, MAX_SAMPLE_LINES).forEach(l => lines.push(bullet(l)));
  }
  if (bugLines.length) {
    lines.push('', 'GENERIC ERRORS (why):');
    bugLines.slice(0, MAX_SAMPLE_LINES).forEach(l => lines.push(bullet(l)));
  }
  return lines;
}

function buildMessage(summary, userLines, bugLines) {
  const lines = [
    `🔎 ${SCAN_LABEL}`,
    `Time: ${summary.generatedAt}`,
    `Container: ${aiExplain.redact(CONTAINER)}`,
    `New bug/error lines: ${summary.bugCount}`,
    `User-activity events: ${summary.userCount}`,
    ...sampleSections(userLines, bugLines),
  ];
  if (!userLines.length && !bugLines.length) {
    lines.push('', 'No issues found in scanned window.');
  }
  return lines.join('\n');
}

/**
 * The scan could not run, so no count from it means anything. This must never look like the
 * HEALTHY banner: a read failure used to post "All working good".
 */
function buildDegradedMessage(summary, reason, userLines, bugLines) {
  return [
    `⚠️ ${SCAN_LABEL} — MONITOR DEGRADED`,
    `Time: ${summary.generatedAt}`,
    `Container: ${aiExplain.redact(CONTAINER)}`,
    'Status: could not read the container logs — this window was NOT scanned.',
    `Reason: ${aiExplain.redact(String(reason || 'unknown')).slice(0, 280)}`,
    'Action: check `docker ps` and `docker logs cpq-application` on the droplet.',
    `Partial lines seen: ${summary.bugCount} bug, ${summary.userCount} user-activity`,
    ...sampleSections(userLines, bugLines),
  ].join('\n');
}

/**
 * Classifies one window's lines once, so the counts, the report and the AI layer all describe
 * exactly the same filtered view.
 * @returns {{bugCount, userCount, userLines, bugLines, scannedLines}}
 */
function scanLines(lines) {
  const out = { bugCount: 0, userCount: 0, userLines: [], bugLines: [], scannedLines: [] };
  for (const line of lines) {
    if (NOISE_PATTERNS.some(p => p.test(line))) continue; // skip known-noisy lines
    out.scannedLines.push(line);
    const { isUser, isBug } = classify(line);
    if (isUser) { out.userCount++; out.userLines.push(line); }
    if (isBug) { out.bugCount++; out.bugLines.push(line); }
  }
  return out;
}

/** The on-box report keeps RAW lines: it never leaves the droplet and is the diagnostic copy. */
function buildReport(scan, scanned, generatedAt) {
  return [
    `=== ${SCAN_LABEL} ===`,
    `Generated: ${generatedAt}`,
    `Container: ${CONTAINER}`,
    `Scan status: ${scan.ok ? 'ok' : `DEGRADED — ${scan.reason}`}`,
    `New bug lines: ${scanned.bugCount}`,
    `User-activity events: ${scanned.userCount}`,
    '',
    '--- User-activity (why) ---',
    scanned.userLines.length ? scanned.userLines.join('\n') : '(none)',
    '',
    '--- Generic bug lines (why) ---',
    scanned.bugLines.length ? scanned.bugLines.join('\n') : '(none)',
  ].join('\n');
}

const IDLE_ENVELOPE = { ai: null, errorGroups: 0, provider: null, model: null, groups: [] };

async function runAiLayer(scanned, generatedAt) {
  try {
    return await aiExplain.explainErrors(scanned.scannedLines, {
      generatedAt, container: CONTAINER, windowMinutes: SCAN_WINDOW_MINUTES,
      genericPatterns: GENERIC_PATTERNS,
    });
  } catch (e) {
    console.error('[ai] layer threw — falling back to raw lines:', e.message);
    return Object.assign({}, IDLE_ENVELOPE, { aiStatus: 'failed_internal' });
  }
}

/**
 * Picks the one message this run posts. Rendering must not be the one unguarded step: a malformed
 * cached explanation used to throw past main()'s catch and exit 1 with no Teams alert at all.
 * @returns {{message: string, ai: object}} `ai` is downgraded when rendering failed
 */
function selectMessage(scan, summary, scanned, ai) {
  const { userLines, bugLines } = scanned;
  if (FORCE_ALERT) {
    return { message: `🔔 ${SCAN_LABEL} TEST ALERT\nThis is a forced test message `
      + 'to verify Teams delivery.', ai };
  }
  if (!scan.ok) {
    return { message: buildDegradedMessage(summary, scan.reason, userLines, bugLines), ai };
  }
  if (ai.ai) {
    try {
      return { message: aiExplain.renderAiMessage(
        { generatedAt: summary.generatedAt, container: CONTAINER, bugCount: scanned.bugCount,
          userCount: scanned.userCount, label: SCAN_LABEL,
          maxMessageChars: intEnv('AI_MAX_MESSAGE_CHARS', 8000, 500, 28000) },
        ai.ai, ai.groups,
      ), ai };
    } catch (e) {
      console.error('[ai] could not render the explanation — using raw lines:', e.message);
      const downgraded = Object.assign({}, IDLE_ENVELOPE,
        { aiStatus: 'failed_render', errorGroups: ai.errorGroups });
      return { message: buildMessage(summary, userLines, bugLines), ai: downgraded };
    }
  }
  if (scanned.bugCount > 0 || scanned.userCount > 0) {
    return { message: buildMessage(summary, userLines, bugLines), ai };
  }
  return { message: [
    `✅ ${SCAN_LABEL} — HEALTHY`,
    `Time: ${summary.generatedAt}`,
    `Container: ${CONTAINER}`,
    'Status: All working good. No errors or user-activity issues in the last scan window.',
  ].join('\n'), ai };
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
  const scan = FORCE_ALERT ? scanResult(true, ['FORCE TEST LINE'], null) : getContainerLogs();
  // The AI layer must see the same filtered view the counts are built from: a suppressed line
  // that still reached the API would burn a group slot and a paid call.
  const scanned = scanLines(scan.lines);
  const { bugCount, userCount } = scanned;

  const generatedAt = new Date().toISOString();
  const summary = { generatedAt, container: CONTAINER, bugCount, userCount };
  if (!scan.ok) console.error(`Scan DEGRADED — counts below are partial: ${scan.reason}`);

  const stamp = `${generatedAt.slice(0, 10)}T${generatedAt.slice(11, 19).replace(/:/g, '')}`;
  const reportPath = path.join(REPORT_DIR, `monitor-${stamp}.txt`);
  try {
    if (reportUsable) fs.writeFileSync(reportPath, buildReport(scan, scanned, generatedAt));
  } catch (e) {
    reportUsable = false;
    console.error('Could not write the report:', e.message);
  }

  if (reportUsable) console.log(`Report written: ${reportPath}`);
  console.log(`bugCount=${bugCount} userCount=${userCount}`);

  let idleStatus = FORCE_ALERT ? 'skipped_force_alert' : 'skipped_clean';
  if (!scan.ok) idleStatus = 'failed_log_read';
  let ai = Object.assign({}, IDLE_ENVELOPE, { aiStatus: idleStatus });
  // A partial window is not worth a paid call, and its counts are not the ones to explain.
  if (!FORCE_ALERT && scan.ok && (bugCount > 0 || userCount > 0)) {
    ai = await runAiLayer(scanned, generatedAt);
  }

  // Always send a heartbeat to Teams: a health summary when clean, the bug report (with the
  // "why") when issues are found, or MONITOR DEGRADED when the window could not be read.
  const chosen = selectMessage(scan, summary, scanned, ai);
  const message = chosen.message;
  ai = chosen.ai;
  // Additive only: the five existing keys keep their names, types and meaning so the existing
  // Power Automate flow keeps working. `healthy` still means "no errors", not "AI succeeded".
  // `healthy` goes false on a read failure. Its meaning is unchanged — "nothing needs your
  // attention" — and a scan that did not run cannot claim that; leaving it true is precisely the
  // silence that hid the stderr bug for months. `scanOk` tells the flow the two cases apart.
  const payload = {
    message, bugCount, userCount, generatedAt,
    healthy: (scan.ok && bugCount === 0 && userCount === 0),
    scanOk: scan.ok,
    scanError: scan.ok ? null : aiExplain.redact(String(scan.reason || 'unknown')).slice(0, 280),
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

module.exports = { buildMessage, buildDegradedMessage, classify, getContainerLogs, main,
  GENERIC_PATTERNS, USER_ACTIVITY_PATTERNS, NOISE_PATTERNS, DOCKER_CLI_STREAM_ERRORS };
