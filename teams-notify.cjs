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

/**
 * POSTs a JSON payload to a Microsoft Teams incoming webhook (via Power Automate).
 * Never throws and never rejects — every caller gets a boolean back, so a broken webhook or a
 * network failure degrades to "notification not sent" rather than crashing the caller.
 * @param {string} webhookUrl the target webhook URL; a falsy value is a no-op that resolves false
 * @param {object} payload the JSON body to send
 * @returns {Promise<boolean>} true only on a 2xx response
 */
function postToTeams(webhookUrl, payload) {
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
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
    });
    req.on('error', (e) => { console.error('[teams] error', e.message); resolve(false); });
    req.write(body);
    req.end();
  });
}

module.exports = { postToTeams };
