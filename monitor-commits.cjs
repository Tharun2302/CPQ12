#!/usr/bin/env node
/**
 * CPQ12 commit monitor.
 *
 * Runs on a schedule (cron). Does `git fetch`, then compares the current
 * `origin/main` HEAD against the last-seen commit (stored in a state file).
 * If new commit(s) appeared, posts a Teams card to the server-alerts channel
 * summarizing WHAT changed (author, message, files, +lines/-lines).
 *
 * Stays silent when there are no new commits (no heartbeat spam).
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

const REPO_DIR = process.env.COMMIT_REPO_DIR || '/root/CPQ12';
const BRANCH = process.env.COMMIT_BRANCH || 'origin/main';
const STATE_FILE = process.env.COMMIT_STATE_FILE || '/root/CPQ12/logs/monitor/.last_commit.json';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const SCAN_LABEL = process.env.COMMIT_SCAN_LABEL || 'CPQ12 Commit Monitor';
const MAX_FILES_SHOWN = parseInt(process.env.MAX_FILES_SHOWN || '20', 10);

// ---- Helpers -------------------------------------------------------------
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function loadLast() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastCommit: null }; }
}
function saveLast(lastCommit) {
  ensureDir(path.dirname(STATE_FILE));
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastCommit }, null, 2));
}

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8' });
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

// ---- Main -----------------------------------------------------------------
async function main() {
  const state = loadLast();
  let currentHead;
  try {
    sh('git', ['fetch', 'origin'], REPO_DIR);
    currentHead = sh('git', ['rev-parse', BRANCH], REPO_DIR).trim();
  } catch (e) {
    console.error('git fetch/rev-parse failed:', e.message);
    process.exit(1);
  }

  const lastCommit = state.lastCommit;
  console.log(`currentHead=${currentHead} lastSeen=${lastCommit}`);

  if (lastCommit && lastCommit === currentHead) {
    console.log('No new commits since last check.');
    return;
  }

  // Collect commits between lastSeen..currentHead
  const range = lastCommit ? `${lastCommit}..${currentHead}` : currentHead;
  let commits = [];
  try {
    const log = sh('git', ['log', '--pretty=format:%H|%an|%ad|%s', '--date=short', range], REPO_DIR).trim();
    if (log) {
      commits = log.split('\n').map(l => {
        const [hash, author, date, ...rest] = l.split('|');
        return { hash, author, date, msg: rest.join('|') };
      });
    }
  } catch (e) {
    console.error('git log failed:', e.message);
  }

  // Stats + file list for the range
  let statSummary = '';
  let filesChanged = [];
  try {
    statSummary = sh('git', ['diff', '--shortstat', range], REPO_DIR).trim();
    const nameStatus = sh('git', ['diff', '--name-only', range], REPO_DIR).trim();
    if (nameStatus) filesChanged = nameStatus.split('\n').filter(Boolean);
  } catch (e) {
    console.error('git diff failed:', e.message);
  }

  const shownFiles = filesChanged.slice(0, MAX_FILES_SHOWN);
  const filesText = shownFiles.length
    ? shownFiles.map(f => '• ' + f).join('\n')
    : '(no file changes detected)';
  const moreFiles = filesChanged.length > MAX_FILES_SHOWN
    ? `\n… and ${filesChanged.length - MAX_FILES_SHOWN} more file(s)` : '';

  const commitLines = commits.map(c =>
    `• ${c.hash.slice(0, 8)} — ${c.msg}\n  by ${c.author} on ${c.date}`
  ).join('\n');

  const message = [
    `📦 ${SCAN_LABEL}`,
    `New commit(s) detected on ${BRANCH}`,
    '',
    `Commits (${commits.length}):`,
    commitLines || '• (initial commit)',
    '',
    `Summary: ${statSummary || 'n/a'}`,
    '',
    `Changed files (${filesChanged.length}):`,
    filesText + moreFiles,
  ].join('\n');

  const payload = { message, newCommits: commits.length, filesChanged: filesChanged.length };
  const ok = await postToTeams(payload);
  console.log(`[teams] notification sent: ${ok}`);

  // Only advance the seen marker if we successfully alerted (or even if not,
  // to avoid re-alerting the same commit on repeated failures we still advance).
  saveLast(currentHead);
  console.log(`Saved lastCommit=${currentHead}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
