'use strict';

/**
 * Minimal structured file logger for CPQ12.
 *
 * Why hand-rolled instead of pino/winston: this app runs on a single
 * low-traffic droplet (dev + prod share the same compose stack), so a
 * dependency-free logger keeps the footprint small while still giving us
 * JSON lines, daily rotation, retention and redaction.
 *
 * Never throws: every public method swallows its own errors and falls back
 * to raw stdout/stderr writes so a logging failure can never crash the
 * request that triggered it.
 */

const fs = require('fs');
const path = require('path');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveLogLevel() {
  const raw = String(process.env.LOG_LEVEL || 'info').toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, raw) ? raw : 'info';
}

const MIN_LEVEL = LEVELS[resolveLogLevel()];

// 50MB is a safety net against runaway logging (e.g. a crash loop spamming
// errors), not a rotation trigger — real rotation is daily, see below.
const MAX_BYTES_PER_DAY = 50 * 1024 * 1024;

function resolveRetentionDays() {
  const parsed = parseInt(process.env.LOG_RETENTION_DAYS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

// Base path drives both the log directory and the per-day filename stem:
// /app/logs/cpq.log -> /app/logs/cpq-2026-09-03.log
const BASE_LOG_PATH = process.env.LOG_FILE
  ? path.resolve(process.env.LOG_FILE)
  : path.resolve(__dirname, '..', 'logs', 'cpq.log');
const LOG_DIR = path.dirname(BASE_LOG_PATH);
const EXT = path.extname(BASE_LOG_PATH) || '.log';
const BASE_NAME = path.basename(BASE_LOG_PATH, EXT) || 'cpq';
const ROTATED_FILE_RE = new RegExp(
  `^${BASE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{4}-\\d{2}-\\d{2})${EXT.replace('.', '\\.')}$`
);

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  process.stderr.write(`[logger] failed to create log directory ${LOG_DIR}: ${e.message}\n`);
}

// "url" is deliberately excluded: it's a legitimate, non-secret field (e.g. /api/client-log's
// `url` diagnostic field) and any credential actually embedded in a URL string is still caught
// by the value-level scrubString()/CREDENTIALS_IN_URI_RE check below, independent of key name.
const REDACT_KEY_RE = /(password|secret|token|uri|connection[_-]?string|authorization|jwt|api[_-]?key)/i;

// Matches a `scheme://user:pass@host` credentials segment (e.g. inside a MongoDB URI) so
// it can be masked wherever it appears in a string, independent of the key-based redaction
// below. This is what closes the "string blind spot": code that does something like
// console.log('...', JSON.stringify(objWithSecrets)) flattens the object to a string
// *before* the shim ever sees it as an object, so REDACT_KEY_RE never gets a chance to run
// on its keys — this pattern-based scrub is the only thing that still catches it.
const CREDENTIALS_IN_URI_RE = /(:\/\/)([^/\s:@]+):([^/\s:@]+)@/g;

/**
 * Masks embedded `scheme://user:pass@host` credentials in a plain string.
 *
 * NOTE: this is deliberately narrow, pattern-based, best-effort matching — not a
 * guarantee. It only catches this one high-risk shape (a credentialed connection string).
 * It will NOT catch, e.g., a bare password/API key/token sitting in a string with no
 * surrounding `scheme://user:pass@` structure (a raw `sk-...` key logged directly, a
 * password logged as plain text, etc.) — those are only caught when they arrive as a
 * value under a matching object key (see REDACT_KEY_RE / redact() below).
 */
function scrubString(value) {
  if (typeof value !== 'string') return value;
  return value.replace(CREDENTIALS_IN_URI_RE, '$1[REDACTED]@');
}

/**
 * Best-effort redaction, not a guarantee of no secret leakage. Two layers, both pattern/
 * key-based:
 *  - Object values whose KEY matches REDACT_KEY_RE (password/secret/token/uri/url/
 *    connectionString/authorization/jwt/apiKey, case-insensitive) are fully replaced with
 *    '[REDACTED]', recursively, handling nested objects/arrays and cycles.
 *  - Every string encountered (a top-level string argument, or a string value nested
 *    anywhere in an object) is additionally scrubbed for an embedded
 *    `scheme://user:pass@host` credentials segment via scrubString(), regardless of what
 *    key (if any) it sits under.
 * What this does NOT do: it cannot recognize an arbitrary secret-shaped token or password
 * embedded in free-form text with no matching key and no `user:pass@` structure. Callers
 * that log sensitive values directly as loose strings (not under a named key, not inside a
 * credentialed URI) can still leak them — treat this as defense-in-depth, not a substitute
 * for not logging secrets in the first place.
 */
function redact(value, seen) {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  seen = seen || new WeakSet();
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }
  const out = {};
  for (const key of Object.keys(value)) {
    out[key] = REDACT_KEY_RE.test(key) ? '[REDACTED]' : redact(value[key], seen);
  }
  return out;
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function fileForDate(dateStr) {
  return path.join(LOG_DIR, `${BASE_NAME}-${dateStr}${EXT}`);
}

let currentDate = null;
let currentFilePath = null;
let currentFd = null;
let capWarned = false; // one-time-per-day latch for the 50MB safety cap warning

/** Deletes rotated log files older than the retention window. Piggybacks on rotation so no cron/interval is needed. */
function cleanupOldLogs() {
  try {
    const retentionDays = resolveRetentionDays();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(LOG_DIR);
    for (const entry of entries) {
      const match = entry.match(ROTATED_FILE_RE);
      if (!match) continue;
      const fileTime = Date.parse(`${match[1]}T00:00:00Z`);
      if (Number.isNaN(fileTime)) continue;
      if (fileTime < cutoff) {
        try { fs.unlinkSync(path.join(LOG_DIR, entry)); } catch (e) { /* best effort */ }
      }
    }
  } catch (e) {
    process.stderr.write(`[logger] retention cleanup failed: ${e.message}\n`);
  }
}

/** Opens today's file if the day rolled over (or on first write), then sweeps expired rotated files. */
function ensureCurrentFile() {
  const date = todayUTC();
  if (date === currentDate && currentFd !== null) return;
  if (currentFd !== null) {
    try { fs.closeSync(currentFd); } catch (e) { /* ignore */ }
  }
  currentDate = date;
  currentFilePath = fileForDate(date);
  capWarned = false;
  try {
    currentFd = fs.openSync(currentFilePath, 'a');
  } catch (e) {
    currentFd = null;
    process.stderr.write(`[logger] failed to open log file ${currentFilePath}: ${e.message}\n`);
  }
  cleanupOldLogs();
}

// KNOWN TRADEOFF (reviewed, not fixed here): fstatSync/appendFileSync below are
// synchronous and block Node's event loop on every single call — this is now a hot path,
// with all 551 console.* call sites across server.cjs routed through here. On this app's
// traffic profile (single low-traffic droplet, small log lines) the per-call block is
// small and non-blocking async writes would need a queue to preserve write order (out-of-
// order interleaved lines in a JSON-lines log defeat the point of structured logging), so
// swapping to fs.appendFile without care could quietly corrupt log ordering under
// concurrent requests. Left synchronous deliberately for now rather than risk an
// under-tested ordering bug; revisit with a proper ordered async write queue if log volume
// or request concurrency grows enough for this to show up in latency.
function writeLine(line) {
  try {
    ensureCurrentFile();
    if (currentFd === null) {
      process.stdout.write(line);
      return;
    }
    const stats = fs.fstatSync(currentFd);
    if (stats.size >= MAX_BYTES_PER_DAY) {
      if (!capWarned) {
        capWarned = true;
        process.stderr.write(`[logger] ${currentFilePath} exceeded ${MAX_BYTES_PER_DAY} bytes; dropping further writes until tomorrow's rotation\n`);
      }
      return;
    }
    fs.appendFileSync(currentFd, line);
  } catch (e) {
    try {
      process.stdout.write(line);
    } catch (e2) { /* nothing more we can do */ }
  }
}

function log(level, message, meta) {
  try {
    if (LEVELS[level] < MIN_LEVEL) return;
    const safeMeta = meta && typeof meta === 'object' ? redact(meta) : undefined;
    // Scrub the message itself too, not just meta — direct logger.info/warn/error/debug
    // callers (e.g. the /api/client-log route, which logs a caller-supplied message
    // string directly) bypass the console.* shim's own redact() call, so this is the only
    // place their message would otherwise go out unscrubbed.
    const rawMessage = typeof message === 'string' ? message : String(message);
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      source: (safeMeta && safeMeta.source) || 'server',
      message: scrubString(rawMessage),
    };
    if (safeMeta) {
      for (const key of Object.keys(safeMeta)) {
        if (key === 'source') continue;
        entry[key] = safeMeta[key];
      }
    }
    writeLine(JSON.stringify(entry) + '\n');
  } catch (e) {
    try {
      process.stderr.write(`[logger] ${level}: ${typeof message === 'string' ? message : '[unloggable]'}\n`);
    } catch (e2) { /* truly nothing left to do */ }
  }
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
  debug: (message, meta) => log('debug', message, meta),
  // Exposed so the console.* shim in server.cjs can redact object args before
  // flattening them to a string, not just structured `meta` passed directly.
  redact,
};
