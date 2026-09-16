#!/usr/bin/env node
/**
 * CPQ12 daily end-of-day health checks.
 *
 * Probes the health endpoints the app actually serves, writes a dated report to REPORT_DIR and
 * posts a summary to Microsoft Teams via a Power Automate flow.
 *
 * Scheduled on host cron (03:30 UTC / 09:00 IST). It runs on the HOST, not inside a container,
 * so APP_HOST must be a URL the host can reach — see .env.monitor.example.
 *
 * NOT COVERED: the primary PDF path. Document export tries Gotenberg first (GOTENBERG_URL,
 * server.cjs:4558-4589) and only falls back to a direct LibreOffice call. Gotenberg listens on
 * http://gotenberg:3000 on the internal Docker network, which is unreachable from the host and
 * not proxied by nginx, so this script cannot probe it. A true end-to-end export check needs a
 * new server.cjs endpoint — tracked separately.
 *
 * RETRIES: a counted check that fails is retried ONCE, RETRY_DELAY_MS later, before it is reported
 * as failed. Two of the four counted checks fail for benign reasons — /api/libreoffice/health
 * shells out to `soffice --version` under a hard 5s timeout that a cold start on a small droplet
 * can exceed while healthy, and /api/database/health is a real Atlas ping that a momentary
 * failover breaks. A check that cries wolf is worse than no check. Retrying makes the PROBE phase
 * worst case 3 probes x TIMEOUT_MS plus 3 x (RETRY_DELAY_MS + TIMEOUT_MS) — about 75 seconds with
 * every endpoint dead, against 30 seconds before. (Three probes, not four: the fourth counted
 * check is derived from the /api/health body, not separately fetched.) The run as a whole is still
 * NOT bounded — see the Teams POST below.
 *
 * FOLLOW-UP (not in this pass): there is no lockfile. If one run hangs past the next cron tick,
 * a second copy starts. The wall-clock guard in req() bounds the PROBES only — nothing else. The
 * final Teams POST is UNBOUNDED: teams-notify.cjs sets no timeout on its request and only handles
 * 'error', so a Power Automate endpoint that accepts the socket and never answers hangs main()
 * forever. That is the realistic overlap path, not a theoretical one. teams-notify.cjs is shared
 * with monitor-user-logs.cjs, so its timeout is a separate change. The report filename is stamped
 * to the second, so two runs that land in the same second overwrite each other's report — fix
 * these together.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { postToTeams } = require('./teams-notify.cjs');
const { redact } = require('./monitor-ai-explain.cjs');

const ENV_FILE = process.env.MONITOR_ENV_FILE || '/root/.cpq-monitor/monitor.env';
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    // FOOTGUN: an EMPTY env var is falsy, so an intentionally blank TEAMS_WEBHOOK_URL= in the
    // shell is silently refilled from monitor.env and the run posts to the REAL Teams channel.
    // To suppress posting on the prod box, point MONITOR_ENV_FILE at a nonexistent path and set
    // a truthy but dead webhook (http://127.0.0.1:1). Blanking the variable does NOT work.
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const REPORT_DIR = process.env.REPORT_DIR || '/root/CPQ12/logs/monitor';
// Deliberately NOT SCAN_LABEL: monitor-user-logs.cjs reads the same monitor.env, which sets
// SCAN_LABEL globally, so sharing the name made the daily post indistinguishable from the
// hourly log-monitor post in the same channel.
const DAILY_SCAN_LABEL = process.env.DAILY_SCAN_LABEL || 'CPQ12 Daily EOD Checks';
const TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_FIELD_CHARS = 280;
// Hardcoded on purpose. Every numeric setting here is a literal: an env-supplied number would need
// validated parsing (`parseInt('1.9e6')` is 1, a bug this repo has already shipped once), and a
// retry count is not something an operator should be able to turn into 50 at 03:30.
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 5000;

// Only endpoints verified to exist in server.cjs. The original list was guessed and ten of its
// eleven URLs were never routes at all, so every probe reported a 404 as a failure.
const ENDPOINTS = [
  { name: 'app health', pathname: '/api/health', parseHealthBody: true },
  // The only live database check. /api/health reports a boot-time snapshot, not the current state.
  { name: 'database health', pathname: '/api/database/health' },
  // Covers ONLY the LibreOffice fallback converter. Gotenberg is the primary path and is not
  // reachable from here — see the file header.
  { name: 'LibreOffice fallback', pathname: '/api/libreoffice/health' },
];

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

/**
 * Masks every secret shape, flattens control characters and caps the length, for anything that
 * reaches the report file or the Teams message. Nothing leaks today, but /api/database/health
 * returns `error: error.message` on a Mongo failure and this project has shipped a connection URI
 * into a log before.
 *
 * The control-character strip is what stops a forged report: the Teams message is line-oriented,
 * so a newline inside a health-response field would render as extra PASS/FAIL lines and could
 * make the monitor announce "all checks passed" during a real outage. Stripping runs BEFORE the
 * slice so the cap cannot leave a stray newline at the cut.
 *
 * Every outbound string that originates OUTSIDE this file goes through this — response bodies,
 * env vars, the operator-supplied label, the host. The only strings that bypass it are the
 * hardcoded check names in ENDPOINTS/deriveHealthChecks and the ISO timestamp, all produced here.
 * @returns {string}
 */
function safe(value) {
  return redact(String(value == null ? '' : value)).replace(/[\r\n\t\u0000-\u001f\u007f]+/g, ' ').slice(0, MAX_FIELD_CHARS);
}

/**
 * Issues one HTTP(S) request and resolves a plain result object. Never rejects, so a dead host
 * degrades to a failed check instead of aborting the whole run.
 *
 * Two independent time limits: setTimeout on the socket catches inactivity, and a wall-clock
 * guard catches a slow drip that keeps the socket busy forever. The body is capped so a runaway
 * response cannot grow an unbounded string on a 1.9 GB box.
 * @returns {Promise<{ok: boolean, status?: number, body?: string, error?: string}>}
 */
function req(method, urlStr, body = null, timeout = TIMEOUT_MS) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlStr); } catch (e) { return resolve({ ok: false, error: 'invalid url' }); }
    const lib = url.protocol === 'http:' ? http : https;
    const opts = { method, hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search, headers: {} };
    let data = null;
    if (body) {
      data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }

    let settled = false;
    let guard = null;
    let r = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (guard) clearTimeout(guard);
      if (r) { try { r.destroy(); } catch (e) { /* already closed */ } }
      resolve(value);
    };

    try {
      r = lib.request(opts, (res) => {
        let buf = '';
        let bytes = 0;
        res.setEncoding('utf8');
        res.on('data', (d) => {
          bytes += Buffer.byteLength(d, 'utf8');
          if (bytes > MAX_RESPONSE_BYTES) { finish({ ok: false, status: res.statusCode, error: 'response body too large' }); return; }
          buf += d;
        });
        // A 301 is not 2xx, so the plain-http redirect from nginx counts as a FAILURE. Redirects
        // are never followed: a check that silently follows one is not checking what it names.
        res.on('end', () => finish({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: buf }));
        res.on('error', () => finish({ ok: false, status: res.statusCode, error: 'response stream error' }));
      });
    } catch (e) {
      return finish({ ok: false, error: e.message });
    }
    r.on('error', (e) => finish({ ok: false, error: e.message }));
    r.setTimeout(timeout, () => finish({ ok: false, error: 'timeout' }));
    guard = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeout);
    if (typeof guard.unref === 'function') guard.unref();
    if (data) r.write(data);
    r.end();
  });
}

/**
 * Resolves the base URL of the app as seen from the host.
 * Default is https://zenop.ai — the real customer path, through nginx and TLS. Plain http://
 * on port 80 is a pure 301 redirect (deploymentgigitaldocker/nginx.conf), and https://localhost
 * fails TLS verification because the certificate is issued for zenop.ai.
 * @returns {string} base URL with any trailing slashes removed
 */
function resolveAppHost() {
  const host = process.env.APP_HOST || 'https://zenop.ai';
  return host.replace(/\/+$/, '');
}

/**
 * Waits before a retry. Not unref'd: an unref'd timer is not a reason for the event loop to stay
 * alive, so with nothing else pending the process would exit during the gap and skip the retry.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * One attempt at one endpoint. A thrown request function is caught here too, so an injected or
 * future transport that rejects is still reported as a failed check rather than crashing the run.
 * The response body is retained only where a caller parses it, so bodies are not held for the
 * life of the process.
 * @returns {Promise<object>} a check result
 */
async function attemptProbe(endpoint, host, request) {
  const url = `${host}${endpoint.pathname}`;
  try {
    const res = await request('GET', url);
    return {
      name: endpoint.name,
      url: safe(url),
      ok: Boolean(res && res.ok),
      status: (res && res.status) || null,
      error: safe((res && res.error) || (res && res.ok ? '' : 'non-2xx response')) || null,
      body: endpoint.parseHealthBody ? ((res && res.body) || '') : '',
    };
  } catch (e) {
    return { name: endpoint.name, url: safe(url), ok: false, status: null, error: safe(e.message), body: '' };
  }
}

/**
 * Probes one endpoint, retrying a FAILED attempt once after RETRY_DELAY_MS. A passing attempt is
 * never retried, and each endpoint retries independently — the run is not restarted.
 *
 * Only a failed probe is retried, never a probe that answered 2xx. A 200 carrying HTML is a
 * misconfigured proxy, not a blip, and repeating the request would only hide it for another 5
 * seconds.
 *
 * The RETURNED result is always the LAST attempt, body included, so everything derived from it —
 * see deriveHealthChecks — is computed from the attempt that actually decided the check. Returning
 * the first attempt's body after a successful retry would report a fresh pass with stale contents.
 * @param {object} [options] test seams: delay (async), retryDelayMs
 * @returns {Promise<object>} a check result carrying `attempts` and `retried`
 */
async function probeEndpoint(endpoint, host, request, options = {}) {
  const delay = options.delay || sleep;
  const retryDelayMs = options.retryDelayMs === undefined ? RETRY_DELAY_MS : options.retryDelayMs;
  let result = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    result = await attemptProbe(endpoint, host, request);
    result.attempts = attempt;
    if (result.ok) break;
    if (attempt < MAX_ATTEMPTS) await delay(retryDelayMs);
  }
  result.retried = result.attempts > 1;
  return result;
}

/**
 * Turns the /api/health JSON body into its own checks.
 *
 * There is no derived `database connection` check: /api/health reports `databaseAvailable`
 * (server.cjs:742), which is assigned once at startup and never updated, so it can read
 * "Connected" hours after Mongo died. /api/database/health does a real ping and is probed above.
 *
 * `email configuration` is informational: server.cjs:758 reads SENDGRID_API_KEY once at module
 * load from an env var that cannot change while the process lives, so it conveys nothing after
 * the first run and must not pad the pass count.
 *
 * The payload check IS counted — a 200 carrying HTML (a misconfigured proxy) is a real failure,
 * and without it nothing derived from this endpoint would fail.
 * @returns {object[]} check results
 */
function deriveHealthChecks(result) {
  let body = null;
  if (result.ok && result.body) {
    try { body = JSON.parse(result.body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    const reason = result.ok ? 'could not parse the /api/health body' : 'no usable /api/health response';
    return [
      { name: 'app health payload', ok: false, detail: 'unknown', error: reason },
      { name: 'email configuration (at last boot)', ok: true, informational: true, detail: 'unknown', error: null },
    ];
  }
  const checks = [
    { name: 'app health payload', ok: true, detail: 'valid JSON', error: null },
    {
      name: 'email configuration (at last boot)',
      ok: true,
      informational: true,
      detail: safe(body.email || 'not reported'),
      error: null,
    },
  ];
  // Demo mode is a valid production state for HubSpot, so report it without failing the run
  if (body.hubspot) checks.push({ name: 'hubspot', ok: true, informational: true, detail: safe(body.hubspot), error: null });
  return checks;
}

function failedChecks(checks) {
  return checks.filter(c => !c.informational && !c.ok);
}

function retriedChecks(checks) {
  return checks.filter(c => c.retried);
}

/**
 * Renders the human-readable report body, which is also the `message` field posted to Teams.
 *
 * A check that failed once and then passed is a different fact from one that passed outright, so
 * the retry is named on the check's own line and counted in a summary line. Both appear only when
 * something actually was retried, which keeps a healthy morning's message exactly as it was.
 * @returns {string}
 */
function buildMessage(summary) {
  const checks = summary.checks || [];
  const failed = failedChecks(checks);
  const retried = retriedChecks(checks);
  const counted = checks.filter(c => !c.informational).length;
  const lines = [];
  lines.push(safe(summary.label || DAILY_SCAN_LABEL));
  lines.push(`Host: ${safe(summary.host)}`);
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(failed.length === 0
    ? `Result: all ${counted} checks passed`
    : `Result: ${failed.length} of ${counted} checks FAILED`);
  if (retried.length > 0) lines.push(`Retried: ${retried.length} of ${counted} checks failed on the first attempt and were tried once more`);
  lines.push('');
  lines.push('--- Checks ---');
  for (const c of checks) {
    const state = c.informational ? 'INFO' : (c.ok ? 'PASS' : 'FAIL');
    const detail = [
      c.detail ? safe(c.detail) : null,
      c.url ? safe(c.url) : null,
      c.status ? `HTTP ${c.status}` : null,
      c.ok ? null : safe(c.error),
      c.retried ? safe('retried once') : null,
    ].filter(Boolean).join(' — ');
    lines.push(`${state} ${c.name}${detail ? `: ${detail}` : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Runs every check, writes the dated report and posts the summary to Teams.
 * @param {object} [options] overrides for tests: request, post, reportDir, webhookUrl, host, label,
 *   delay, retryDelayMs
 * @returns {Promise<{summary: object, message: string, payload: object, reportPath: string|null}>}
 */
async function main(options = {}) {
  const request = options.request || req;
  const post = options.post || postToTeams;
  const reportDir = options.reportDir || REPORT_DIR;
  const webhookUrl = options.webhookUrl === undefined ? TEAMS_WEBHOOK_URL : options.webhookUrl;
  const host = options.host || resolveAppHost();
  const label = options.label || DAILY_SCAN_LABEL;
  const generatedAt = new Date().toISOString();

  const retryOptions = { delay: options.delay, retryDelayMs: options.retryDelayMs };

  const checks = [];
  for (const endpoint of ENDPOINTS) {
    const result = await probeEndpoint(endpoint, host, request, retryOptions);
    if (endpoint.parseHealthBody) {
      // probeEndpoint returns the LAST attempt, so a retried /api/health derives from the retry
      const derived = deriveHealthChecks(result);
      delete result.body;
      checks.push(result, ...derived);
    } else {
      delete result.body;
      checks.push(result);
    }
  }

  const summary = { generatedAt, host: safe(host), label, checks };
  const message = buildMessage(summary);

  const stamp = `${generatedAt.slice(0, 10)}T${generatedAt.slice(11, 19).replace(/:/g, '')}`;
  let reportPath = path.join(reportDir, `daily-checks-${stamp}.txt`);
  try {
    ensureDir(reportDir);
    // 0600 because the report records what the production health endpoints returned.
    fs.writeFileSync(reportPath, message, { mode: 0o600 });
    console.log(`Report written: ${reportPath}`);
  } catch (e) {
    reportPath = null;
    console.error('Could not write the daily report:', e.message);
  }

  const failed = failedChecks(checks);
  // The Power Automate flow renders `message` and ignores the rest — do not rename that field
  const payload = {
    message,
    generatedAt,
    label: safe(label),
    host: safe(host),
    healthy: failed.length === 0,
    failedCount: failed.length,
    checkCount: checks.filter(c => !c.informational).length,
    retriedCount: retriedChecks(checks).length,
  };

  let ok = false;
  try {
    ok = await post(webhookUrl, payload);
  } catch (e) {
    console.error('Could not post the daily summary to Teams:', e.message);
  }
  console.log(`[teams] notification sent: ${ok}`);
  return { summary, message, payload, reportPath };
}

if (require.main === module) {
  main().catch(e => { console.error('FATAL', e); process.exit(1); });
}

module.exports = {
  main, req, buildMessage, deriveHealthChecks, probeEndpoint, resolveAppHost, ENDPOINTS,
  MAX_ATTEMPTS, RETRY_DELAY_MS,
};
