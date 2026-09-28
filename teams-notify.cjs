'use strict';

// Shared Microsoft Teams webhook poster.
//
// Extracted from monitor-user-logs.cjs, which carried the correct version of this function
// (it honors an explicit port in the webhook URL). monitor-commits.cjs carried a second,
// near-identical copy that was missing that port handling. Both now import this single
// implementation instead of maintaining their own copy.
//
// Behavior for monitor-user-logs.cjs is unchanged. monitor-commits.cjs gains the port fix as
// a side effect of using the shared implementation; this only changes real behavior if
// TEAMS_WEBHOOK_URL ever carries an explicit port, which it does not in production today.

const https = require('https');
const http = require('http');

// A literal, not an env value: keeping this file free of configuration is the point — every
// caller gets the same ceiling and there is no env to validate or get wrong.
// 10s, not longer, because commit-explain.cjs calls this from a git hook under a 20s watchdog
// that process.exit(0)s so `git commit` is never blocked; the post is its last step, so anything
// above 10s eats the budget its AI layer and git subprocesses need. The CPQ Server Alerts flow
// is a plain trigger -> post with no Response action, so it returns 202 well inside this.
const POST_TIMEOUT_MS = 10000;

/**
 * POSTs a JSON payload to a Microsoft Teams incoming webhook (via Power Automate).
 * Never throws and never rejects — every caller gets a boolean back, so a broken webhook or a
 * network failure degrades to "notification not sent" rather than crashing the caller.
 * @param {string} webhookUrl the target webhook URL; a falsy value is a no-op that resolves false
 * @param {object} payload the JSON body to send
 * @param {{timeoutMs?: number}} [options] test seam only; production callers pass nothing
 * @returns {Promise<boolean>} true only on a 2xx response
 */
function postToTeams(webhookUrl, payload, options) {
  const timeoutMs = options && Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : POST_TIMEOUT_MS;
  if (!webhookUrl) {
    console.log('[teams] No TEAMS_WEBHOOK_URL set — skipping notification.');
    return Promise.resolve(false);
  }
  let url;
  try {
    url = new URL(webhookUrl);
  } catch (e) {
    console.error('[teams] Invalid webhook URL', e.message);
    return Promise.resolve(false);
  }
  const body = JSON.stringify(payload);
  const lib = url.protocol === 'http:' ? http : https;
  const opts = {
    method: 'POST',
    hostname: url.hostname,
    // Without this, a webhook URL carrying an explicit port was sent to the protocol default
    // (:80/:443) instead. No effect on a real production URL, where url.port is '' and this
    // stays undefined.
    port: url.port || undefined,
    path: url.pathname + url.search,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };
  return new Promise((resolve) => {
    let settled = false;
    let guard = null;
    let req = null;
    // Sets the flag before destroying, so the error that destroy() raises re-enters and returns.
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (guard) clearTimeout(guard);
      if (req) req.destroy();
      resolve(ok);
    };
    // Wrapped like monitor-daily-checks.cjs does: a synchronous throw here would escape as a
    // rejection and break the never-rejects contract above.
    try {
      req = lib.request(opts, (res) => {
        // The body is never read, so draining beats buffering it into a string with no cap.
        res.resume();
        res.on('end', () => finish(res.statusCode >= 200 && res.statusCode < 300));
        res.on('error', (e) => { console.error('[teams] error', e.message); finish(false); });
      });
    } catch (e) {
      console.error('[teams] error', e.message);
      finish(false);
      return;
    }
    req.on('error', (e) => { console.error('[teams] error', e.message); finish(false); });
    // Deliberately the ONLY timer. req.setTimeout measures socket inactivity and its clock starts
    // at socket assignment, never before this guard's, so at a shared ceiling it can only fire
    // second — it was dead code. This one bounds the whole attempt: DNS, connect, TLS and a
    // webhook that answers one byte at a time, which no inactivity timer would ever end.
    guard = setTimeout(() => {
      console.error('[teams] error timeout');
      finish(false);
    }, timeoutMs);
    if (typeof guard.unref === 'function') guard.unref();
    req.write(body);
    req.end();
  });
}

module.exports = { postToTeams };
