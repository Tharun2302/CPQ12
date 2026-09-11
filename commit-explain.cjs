#!/usr/bin/env node
'use strict';

/**
 * CPQ12 Commit Logic Explainer — orchestrator.
 *
 * Invoked by the git hooks in scripts/hooks/ (post-commit and pre-push). Never blocks or fails
 * the git operation that triggered it: every code path here either returns normally or is
 * wrapped so that main() always resolves, and a hard watchdog timer forces an exit if something
 * unexpected hangs. The hooks themselves also unconditionally exit 0 regardless of what happens
 * here — this is a second, independent line of defence, not the only one.
 *
 * Two modes (argv[2]):
 *   post-commit — explains the commit that was just made (HEAD). Prints + logs it.
 *   pre-push    — reads git's ref lines from stdin, and ONLY when `main` is actually advancing,
 *                 explains the pushed range and posts one bundled Teams message. Every other
 *                 push (feature branches, or a push that does not move main forward) is a no-op.
 *
 * All git introspection (commit metadata, diff, commit range) is done HERE in Node via
 * execFileSync, not in the shell hooks. A commit message or diff can contain quotes, backticks,
 * newlines or non-UTF8 bytes; passing that safely through a shell script is fragile, whereas
 * Node's argument-array child_process calls (the same pattern monitor-commits.cjs already uses)
 * handle it correctly. The shell hooks are therefore thin, robust wrappers whose only job is to
 * find node, invoke this script in the right mode, and unconditionally exit 0.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const monitorAi = require('./monitor-ai-explain.cjs');
const commitAi = require('./commit-ai-explain.cjs');
const { postToTeams } = require('./teams-notify.cjs');

const { redact, hasResidualSecret, resolveConfig, MAX_CACHE_ENTRIES } = monitorAi;

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const MAIN_REF = 'refs/heads/main';
const ZERO_SHA = '0000000000000000000000000000000000000000';
const DEFAULT_COMMITS_PER_PUSH = 8;

// ---- Env loading (own file, separate from the project's root .env) --------------------------
// The root .env holds live production DB config (see project memory: "shared live database") —
// this feature must never read or write it. It gets its own file, loaded the same manual way
// monitor-user-logs.cjs loads MONITOR_ENV_FILE: no new dependency, existing values in
// process.env always win (so a real shell export overrides the file).
const ENV_FILE = process.env.COMMIT_EXPLAIN_ENV_FILE || path.join(__dirname, '.env.commit-explain');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function intEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const parsed = Number(String(raw).trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    console.error(`[config] ${name}="${raw}" is not a whole number in [${min}, ${max}] — using ${fallback}`);
    return fallback;
  }
  return parsed;
}

const REPO_DIR = process.env.COMMIT_REPO_DIR || process.cwd();
const LOG_DIR = process.env.COMMIT_EXPLAIN_LOG_DIR || path.join(REPO_DIR, 'logs', 'commit-explain');
const STATE_FILE = process.env.COMMIT_EXPLAIN_STATE_FILE || path.join(LOG_DIR, '.state.json');
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
// A hard ceiling on the WHOLE run, independent of AI_TOTAL_BUDGET_MS: this is the last line of
// defence against a hang blocking `git commit`/`git push` forever, so it must exceed the AI
// layer's own budget with room for git subprocess calls either side of it.
const HARD_TIMEOUT_MS = intEnv('COMMIT_EXPLAIN_HARD_TIMEOUT_MS', 20000, 2000, 120000);
// execFileSync blocks Node's single thread synchronously, so HARD_TIMEOUT_MS's setTimeout watchdog
// cannot help if a git subprocess hangs — the event loop never gets a turn to run it. This is a
// separate, per-call ceiling enforced by the child_process API itself. Clamped comfortably under
// HARD_TIMEOUT_MS so a single hung git call can never itself blow the whole-run budget.
const GIT_CALL_TIMEOUT_MS = Math.min(
  intEnv('COMMIT_EXPLAIN_GIT_TIMEOUT_MS', 5000, 500, 30000),
  Math.max(500, HARD_TIMEOUT_MS - 500),
);

// Hard safety net: unref'd so it never itself keeps the process alive, but if the event loop is
// still spinning (a hung request, an unresolved promise) when this fires, it forces an exit
// rather than blocking the git operation that invoked this script indefinitely.
const watchdog = setTimeout(() => {
  console.error('[commit-explain] hard timeout reached — exiting so git is never blocked');
  process.exit(0);
}, HARD_TIMEOUT_MS);
if (typeof watchdog.unref === 'function') watchdog.unref();

// ---- Noisy-path exclusion ---------------------------------------------------------------------
// Applied as git pathspec excludes on the diff itself, not as text-filtering after the fact —
// cleaner, and it means these paths never even reach the diff buffer.
const NOISY_PATH_EXCLUDES = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'dist/**', 'dist-ssr/**', 'coverage/**', 'node_modules/**', 'uploads/**',
  'build/**', 'logs/**', '*.min.js', '*.map',
];

function diffPathspecArgs() {
  return NOISY_PATH_EXCLUDES.map((p) => `:(exclude)${p}`);
}

// ---- Git introspection ------------------------------------------------------------------------
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function sh(cmd, args, cwd) {
  // timeout+killSignal is the only thing that can stop a hung git subprocess here: execFileSync
  // blocks the single JS thread synchronously, so the HARD_TIMEOUT_MS watchdog (a setTimeout)
  // never gets a turn to run while this is stuck, and would not fire until long after `git
  // commit`/`git push` had already been blocked. A timeout error lands in the same catch blocks
  // every other execFileSync failure already goes through — degrade gracefully, never throw out.
  return execFileSync(cmd, args, {
    cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    timeout: GIT_CALL_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
}

/** @returns {string} the diff base — the parent commit, or git's empty-tree hash for a first commit */
function resolveDiffBase(repoDir, sha) {
  try {
    // A first commit has no parent, so "<sha>^" failing is the EXPECTED way this is detected —
    // stderr is deliberately not inherited here so that expected case does not spam the
    // developer's terminal with a "fatal: ambiguous argument" line on every first commit. A
    // timeout here is treated the same as that expected failure: fall back to the empty tree.
    return execFileSync('git', ['rev-parse', `${sha}^`], {
      cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_CALL_TIMEOUT_MS, killSignal: 'SIGKILL',
    }).trim();
  } catch (e) {
    return EMPTY_TREE_SHA;
  }
}

/** @returns {{sha: string, author: string, message: string}} */
function getCommitMeta(repoDir, sha) {
  const fullSha = sh('git', ['rev-parse', sha], repoDir).trim();
  const author = sh('git', ['log', '-1', '--format=%an <%ae>', fullSha], repoDir).trim();
  const message = sh('git', ['log', '-1', '--format=%B', fullSha], repoDir).trim();
  return { sha: fullSha, author, message };
}

/** @returns {string} the commit's diff with noisy paths already excluded; '' on failure */
function getCommitDiff(repoDir, sha) {
  const base = resolveDiffBase(repoDir, sha);
  try {
    return sh('git', ['diff', `${base}..${sha}`, '--', '.', ...diffPathspecArgs()], repoDir);
  } catch (e) {
    console.error('[commit-explain] could not read the diff for', sha, e.message);
    return '';
  }
}

// ---- pre-push ref parsing ----------------------------------------------------------------------
/**
 * Parses git's pre-push stdin: one line per ref being pushed, "<local ref> <local sha>
 * <remote ref> <remote sha>". Finds the line (if any) where `main` is actually advancing.
 * A branch delete (local sha all-zero) and a push that leaves main's sha unchanged are both
 * "not moving forward" and must produce no Teams action — same as any non-main branch push.
 * @param {string} stdinText
 * @returns {?{localSha: string, remoteSha: string}} null when main is not moving forward
 */
function findMainMovingLine(stdinText) {
  const lines = String(stdinText == null ? '' : stdinText).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;
    const [, localSha, remoteRef, remoteSha] = parts;
    if (remoteRef !== MAIN_REF) continue;
    if (!localSha || localSha === ZERO_SHA) continue; // branch delete — nothing to explain
    if (localSha === remoteSha) continue; // main already at this sha — nothing new
    return { localSha, remoteSha };
  }
  return null;
}

// ---- State: SHA-keyed cache + daily call budget -------------------------------------------------
// Same shape and safety as monitor-ai-explain.cjs's state file (aiCallsToday/aiCallsDate/cache,
// temp-file+rename write, validated on read, mode 0600) but keyed by commit SHA instead of an
// error fingerprint, and with a much longer useful TTL — a commit's diff never changes.
function validateCacheEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.provider !== 'string' || typeof entry.model !== 'string') return null;
  if (typeof entry.cachedAt !== 'string' || !Number.isFinite(Date.parse(entry.cachedAt))) return null;
  const ai = commitAi.validateExplanation(entry.ai);
  if (!ai) return null;
  return { ai, cachedAt: entry.cachedAt, provider: entry.provider, model: entry.model };
}

function loadState(statePath) {
  const empty = { aiCallsToday: 0, aiCallsDate: '', cache: {} };
  if (!statePath) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return empty;
    const raw = parsed.cache && typeof parsed.cache === 'object' && !Array.isArray(parsed.cache) ? parsed.cache : {};
    const cache = {};
    for (const [key, entry] of Object.entries(raw)) {
      const clean = validateCacheEntry(entry);
      if (clean) cache[key] = clean;
    }
    const count = Number(parsed.aiCallsToday);
    return {
      aiCallsToday: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
      aiCallsDate: typeof parsed.aiCallsDate === 'string' ? parsed.aiCallsDate : '',
      cache,
    };
  } catch (e) {
    return empty;
  }
}

function saveState(statePath, state) {
  if (!statePath) return;
  const tmp = `${statePath}.${process.pid}.tmp`;
  try {
    ensureDir(path.dirname(statePath));
    // Capped and sorted by recency exactly like monitor-ai-explain.cjs's saveState (same
    // MAX_CACHE_ENTRIES constant, reused rather than re-invented). Without this, the combination
    // of "one entry per commit ever explained" and this feature's deliberately long 30-day TTL
    // (a commit's diff never changes) meant the file grew forever.
    const entries = Object.entries(state.cache || {})
      .map(([key, entry]) => [key, validateCacheEntry(entry)])
      .filter(([, entry]) => entry !== null)
      .sort((a, b) => String(b[1].cachedAt).localeCompare(String(a[1].cachedAt)))
      .slice(0, MAX_CACHE_ENTRIES);
    const body = JSON.stringify({
      aiCallsToday: Math.max(0, Math.floor(Number(state.aiCallsToday) || 0)),
      aiCallsDate: state.aiCallsDate,
      cache: Object.fromEntries(entries),
    });
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    try { fs.chmodSync(tmp, 0o600); } catch (chmodError) { /* not supported on this platform */ }
    fs.renameSync(tmp, statePath);
  } catch (e) {
    console.error('[commit-explain] could not write the state file — cache degrades to per-run only');
    try { fs.unlinkSync(tmp); } catch (cleanupError) { /* nothing left to do */ }
  }
}

/** A cache entry only counts as a hit for the same provider AND model. */
function cacheHit(entry, config, now, ttlMin) {
  if (!entry) return false;
  if (entry.provider !== config.provider || entry.model !== config.model) return false;
  return now - Date.parse(entry.cachedAt) < ttlMin * 60 * 1000;
}

// ---- Logging ------------------------------------------------------------------------------------
/** Best-effort append; a full disk or a permissions issue must never fail the hook. */
function logText(text) {
  try {
    ensureDir(LOG_DIR);
    const stamp = new Date().toISOString().slice(0, 10);
    const file = path.join(LOG_DIR, `commit-explain-${stamp}.log`);
    // This file can carry MORE raw sensitive content than the 0600 state file — a redaction-guard
    // skip still logs the raw first line of the commit message and the raw author email (see the
    // NO_AI_REASON_TEXT paths above) — so it needs the same 0600 treatment, and it needs it
    // re-asserted on every write: appendFileSync only applies `mode` when the file does not yet
    // exist, so a file created before this fix (or under a looser umask) would otherwise stay
    // world-readable forever.
    fs.appendFileSync(file, `${text}\n\n`, { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch (chmodError) { /* not supported on this platform */ }
  } catch (e) {
    console.error('[commit-explain] could not write the log file:', e.message);
  }
}

const NO_AI_REASON_TEXT = {
  skipped_sensitive: 'Explanation skipped — commit contains sensitive content.',
  skipped_budget: 'Explanation skipped — daily AI call budget for commit explanations reached.',
  skipped_disabled: 'Explanation skipped — AI_PROVIDER not configured (see .env.commit-explain.example).',
  skipped_no_key: 'Explanation skipped — no API key configured for the selected provider.',
  skipped_dry_run: 'Explanation skipped — AI_DRY_RUN is enabled.',
  failed_redaction_guard: 'Explanation skipped — commit contains sensitive content.',
};

function noAiReason(aiStatus) {
  return NO_AI_REASON_TEXT[aiStatus] || `Explanation not available this run (${aiStatus}).`;
}

// ---- Per-commit explain (cache -> guard -> AI call), shared by both modes -----------------------
/**
 * @param {{sha: string, author: string, message: string}} meta
 * @param {string} diff raw (not yet redacted) diff text, noisy paths already excluded
 * @param {object} state mutated in place: aiCallsToday/aiCallsDate/cache
 * @param {object} config resolveConfig()'s result for this run
 * @returns {Promise<{ai: ?object, aiStatus: string, cached: boolean, text: string}>}
 */
async function explainOne(meta, diff, state, config) {
  const now = Date.now();
  const cached = config.ok ? state.cache[meta.sha] : null;
  if (config.ok && cacheHit(cached, config, now, config.limits.cacheTtlMin)) {
    return { ai: cached.ai, aiStatus: 'ok_cached', cached: true, text: commitAi.renderPlainText(meta, cached.ai) };
  }

  // Redact THEN guard, on the author, message and diff separately, before anything is assembled
  // into a prompt or even considered for an API call. A trip here means the LLM is never called.
  //
  // The author line is real, personally-identifying data — "Name <email@cloudfuze.com>" — on
  // EVERY commit, so it must be redacted exactly like the message and diff. Without this, the
  // guard (which independently flags a bare email address) would trip on every single real
  // commit and permanently disable the AI layer; this was caught by an end-to-end smoke test
  // against a scratch repo, not by a unit test in isolation.
  const redactedAuthor = redact(meta.author || '');
  const redactedMessage = redact(meta.message || '');
  const redactedDiff = redact(diff || '');
  if (hasResidualSecret(redactedAuthor) || hasResidualSecret(redactedDiff) || hasResidualSecret(redactedMessage)) {
    const text = [
      `Commit ${String(meta.sha || '').slice(0, 12)} — ${meta.author || ''}`,
      `Message: ${String(meta.message || '').split('\n')[0]}`,
      '', noAiReason('skipped_sensitive'),
    ].join('\n');
    return { ai: null, aiStatus: 'skipped_sensitive', cached: false, text };
  }

  if (config.ok) {
    const today = new Date(now).toISOString().slice(0, 10);
    if (state.aiCallsDate !== today) { state.aiCallsDate = today; state.aiCallsToday = 0; }
    if (state.aiCallsToday >= config.limits.maxCallsPerDay) {
      const text = [
        `Commit ${String(meta.sha || '').slice(0, 12)} — ${meta.author || ''}`,
        `Message: ${String(meta.message || '').split('\n')[0]}`,
        '', noAiReason('skipped_budget'),
      ].join('\n');
      return { ai: null, aiStatus: 'skipped_budget', cached: false, text };
    }
  }

  const outcome = await commitAi.explainCommit(
    { sha: meta.sha, author: redactedAuthor, message: redactedMessage, diff: redactedDiff },
    { env: process.env },
  );

  if (outcome.billable) state.aiCallsToday = (state.aiCallsToday || 0) + 1;
  if (outcome.ai) {
    state.cache[meta.sha] = {
      ai: outcome.ai, cachedAt: new Date().toISOString(), provider: outcome.provider, model: outcome.model,
    };
  }

  const text = outcome.ai ? commitAi.renderPlainText(meta, outcome.ai) : [
    `Commit ${String(meta.sha || '').slice(0, 12)} — ${meta.author || ''}`,
    `Message: ${String(meta.message || '').split('\n')[0]}`,
    '', noAiReason(outcome.aiStatus),
  ].join('\n');

  return { ai: outcome.ai, aiStatus: outcome.aiStatus, cached: false, text };
}

// ---- post-commit mode -------------------------------------------------------------------------
async function runPostCommit() {
  let meta;
  try {
    meta = getCommitMeta(REPO_DIR, 'HEAD');
  } catch (e) {
    console.error('[commit-explain] could not read the commit that was just made — skipping:', e.message);
    return;
  }
  const diff = getCommitDiff(REPO_DIR, meta.sha);
  const config = resolveConfig(process.env);
  const state = loadState(STATE_FILE);
  const result = await explainOne(meta, diff, state, config);
  saveState(STATE_FILE, state);

  console.log(result.text);
  logText(result.text);
}

// ---- pre-push (push-to-main) mode ---------------------------------------------------------------
async function runPushToMain(stdinText) {
  const moving = findMainMovingLine(stdinText);
  if (!moving) return; // not main, a delete, or main not actually advancing — untouched

  // A brand-new `main` on the remote (its very first push) reports remoteSha as all-zero, not a
  // real commit — "<zero>..<local>" is not a valid git range. There is no prior remote state to
  // diff against, so the range is simply every commit reachable from localSha.
  const range = moving.remoteSha === ZERO_SHA ? moving.localSha : `${moving.remoteSha}..${moving.localSha}`;
  let shas = [];
  try {
    const log = sh('git', ['rev-list', '--reverse', range], REPO_DIR).trim();
    if (log) shas = log.split('\n').filter(Boolean);
  } catch (e) {
    console.error('[commit-explain] could not list commits for the push range:', e.message);
    return;
  }
  if (!shas.length) return;

  const config = resolveConfig(process.env);
  const cap = config.ok && Number.isFinite(config.limits.maxGroups) ? config.limits.maxGroups : DEFAULT_COMMITS_PER_PUSH;
  const toExplain = cap > 0 ? shas.slice(-cap) : [];
  const extra = shas.length - toExplain.length;

  const state = loadState(STATE_FILE);
  const blocks = [];
  for (const sha of toExplain) {
    let meta;
    try {
      meta = getCommitMeta(REPO_DIR, sha);
    } catch (e) {
      console.error('[commit-explain] could not read commit', sha, '— skipping it:', e.message);
      continue;
    }
    const diff = getCommitDiff(REPO_DIR, sha);
    const result = await explainOne(meta, diff, state, config);
    console.log(result.text);
    logText(result.text);
    blocks.push(commitAi.renderTeamsBlock(meta, result.ai, { cached: result.cached }));
  }
  saveState(STATE_FILE, state);

  if (extra > 0) blocks.push(`… and ${extra} more commit(s) not individually explained`);
  if (!blocks.length) return;

  const message = [
    '📦 CPQ12 Commit Logic Explainer — main updated',
    `Commits pushed (${shas.length}):`,
    '',
    blocks.join('\n\n'),
    '',
    '(informational only — this does not trigger any deploy)',
  ].join('\n');

  const ok = await postToTeams(TEAMS_WEBHOOK_URL, { message, commitCount: shas.length });
  console.log(`[teams] notification sent: ${ok}`);
  logText(`[teams] push-to-main notification sent: ${ok}`);
}

// ---- Entry point ----------------------------------------------------------------------------------
async function main() {
  const mode = process.argv[2];
  try {
    if (mode === 'post-commit') {
      await runPostCommit();
    } else if (mode === 'pre-push') {
      const stdinText = fs.readFileSync(0, 'utf8');
      await runPushToMain(stdinText);
    } else {
      console.error(`[commit-explain] unknown mode "${mode}" — expected post-commit or pre-push`);
    }
  } catch (e) {
    console.error('[commit-explain] unexpected top-level failure — nothing to do but move on:', e.message);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(() => process.exit(0));
}

module.exports = {
  NOISY_PATH_EXCLUDES, diffPathspecArgs,
  resolveDiffBase, getCommitMeta, getCommitDiff,
  findMainMovingLine,
  validateCacheEntry, loadState, saveState, cacheHit,
  explainOne, noAiReason,
  MAIN_REF, ZERO_SHA, EMPTY_TREE_SHA, DEFAULT_COMMITS_PER_PUSH, GIT_CALL_TIMEOUT_MS,
};
