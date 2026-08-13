#!/usr/bin/env node
/* Daily monitor: end-of-day checks for PDF generation, redlines, send-for-approval, e-sign
   Runs daily (scheduled at 09:00 IST / 03:30 UTC).
   Safe default: probes health endpoints and well-known test endpoints. Posts summary to Teams if TEAMS_WEBHOOK_URL is set.
*/
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Load env file if exists
const ENV_FILE = process.env.MONITOR_ENV_FILE || '/root/.cpq-monitor/monitor.env';
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const REPORT_DIR = process.env.REPORT_DIR || '/root/CPQ12/logs/monitor';
const SCAN_LABEL = process.env.SCAN_LABEL || 'CPQ12 Daily EOD Checks';
const TIMEOUT_MS = 10000;

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function req(method, urlStr, body=null, timeout=TIMEOUT_MS) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlStr); } catch (e) { return resolve({ ok:false, error: 'invalid url' }); }
    const lib = url.protocol === 'http:' ? http : https;
    const opts = { method, hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search, headers: {} };
    let data = null;
    if (body) {
      data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const r = lib.request(opts, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', d => buf += d);
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: buf });
      });
    });
    r.on('error', (e) => resolve({ ok:false, error: e.message }));
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok:false, error: 'timeout' }); });
    if (data) r.write(data);
    r.end();
  });
}

async function probeList(list, method='GET', payload=null) {
  const results = [];
  for (const url of list) {
    try {
      const res = await req(method, url, payload);
      results.push({ url, ok: !!res.ok, status: res.status || null, error: res.error || null });
    } catch (e) {
      results.push({ url, ok:false, error: e.message });
    }
  }
  return results;
}

function chooseHostCandidates() {
  // Detect likely app host/port from env or default localhost:3000
  const host = process.env.APP_HOST || 'http://localhost:3000';
  return host.replace(/\/+$/, '');
}

async function main() {
  ensureDir(REPORT_DIR);
  const host = chooseHostCandidates();

  const healthCandidates = [ , ,  ];
  const pdfCandidates = [ , ,  ];
  const redlineCandidates = [ , ,  ];
  const approvalCandidates = [ , ,  ];
  const esignCandidates = [ , ,  ];

  const summary = { generatedAt: new Date().toISOString(), host, checks: {} };

  // Health checks (GET)
  summary.checks.health = await probeList(healthCandidates, 'GET');

  // For the functional flows prefer non-destructive test endpoints (POST with test flag)
  const testPayload = { test: true, dryRun: true };
  summary.checks.pdf = await probeList(pdfCandidates, 'POST', testPayload);
  summary.checks.redline = await probeList(redlineCandidates, 'POST', testPayload);
  summary.checks.approval = await probeList(approvalCandidates, 'POST', testPayload);
  summary.checks.esign = await probeList(esignCandidates, 'POST', testPayload);

  // Also check for presence of local test scripts as fallback (non-executing)
  const localScripts = [
    'scripts/generate-pdf-test.cjs',
    'scripts/generate-pdf.cjs',
    'scripts/test-esign.cjs',
    'scripts/test-approval.cjs',
    'monitor-daily-checks.cjs'
  ];
  summary.local = localScripts.map(p => ({ path: path.join('/root/CPQ12', p), exists: fs.existsSync(path.join('/root/CPQ12', p)) }));

  // Build human-readable message
  const lines = [];
  lines.push();
  lines.push();
  lines.push();
  lines.push('');

  function renderGroup(name, items) {
    lines.push();
    for (const it of items) {
      if (it.ok) lines.push();
      else lines.push();
    }
    lines.push('');
  }

  renderGroup('health', summary.checks.health);
  renderGroup('pdf generation', summary.checks.pdf);
  renderGroup('redline/edit', summary.checks.redline);
  renderGroup('send-for-approval', summary.checks.approval);
  renderGroup('e-sign', summary.checks.esign);

  lines.push('--- Local test scripts presence ---');
  for (const s of summary.local) lines.push();

  const message = lines.join('\n');

  const reportName = ;
  const reportPath = path.join(REPORT_DIR, reportName);
  fs.writeFileSync(reportPath, message);
  console.log();

  // Post to Teams if configured
  if (TEAMS_WEBHOOK_URL) {
    try {
      const post = await req('POST', TEAMS_WEBHOOK_URL, { message, generatedAt: summary.generatedAt, label: SCAN_LABEL });
      console.log('[teams] notification sent:', post.ok, 'status:', post.status || post.error);
    } catch (e) {
      console.error('[teams] post failed', e.message);
    }
  } else {
    console.log('[teams] TEAMS_WEBHOOK_URL not set — skipped posting');
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
