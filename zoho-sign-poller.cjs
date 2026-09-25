'use strict';

// The Zoho -> CPQ status poller (design §9.2).
//
// CPQ sends a document to Zoho and then never hears about it again: Zoho delivers webhooks only
// to a public HTTPS callback, which dev does not have. This is the fallback that works without
// one. It pulls, on an interval, the state of every Zoho document that can still change.
//
// Kept out of server.cjs so the whole tick — selection, mapping, persistence, failure handling —
// is unit testable against a fake store and a fake Zoho client. This file opens no socket and
// touches no database of its own.
//
// Injected store contract (every method may be async):
//   findDueDocuments(cutoff, limit)        -> [esign_documents row]  oldest zoho_last_polled_at first
//   findRecipients(documentId)             -> [esign_recipients row]
//   saveDocumentPatch(documentId, patch)   -> void
//   saveRecipientPatch(recipientId, patch) -> void
//   saveSignedPdf(documentId, buffer)      -> patch to merge (signed_file_path etc.); OPTIONAL —
//                                             omit it and the completed transition still happens,
//                                             just without the executed PDF.
//
// Nothing here logs a credential: the Zoho client owns the redaction guard, and the only Zoho
// text this module logs is an error CODE, never a raw body.

const { ZOHO_ERROR_CODES } = require('./zoho-sign-auth.cjs');
const { createRedactor } = require('./zoho-sign-client.cjs');

const {
  ZOHO_ACTIVE_REQUEST_STATUSES,
  buildDocumentStatusPatch,
  buildRecipientStatusPatches,
} = require('./zoho-sign-status.cjs');

// A 429 backs the whole poller off rather than one document: the rate limit is per account, so
// hammering the next document in the batch would spend the same budget the user's sends need.
const MAX_COOLDOWN_TICKS = 8;

/**
 * @param {object} deps
 * @param {object} deps.config   resolved zoho-sign-config object
 * @param {object} deps.client   zoho-sign-client instance (getRequest)
 * @param {object} deps.store    see the header contract
 * @param {Function} [deps.now]  clock, for tests
 * @param {Function} [deps.logger] (message) => void
 */
function createZohoSignPoller(deps) {
  const { config, client, store } = deps || {};
  const now = (deps && deps.now) || (() => new Date());
  const logger = deps && typeof deps.logger === 'function' ? deps.logger : null;
  const audit = (deps && typeof deps.logAudit === 'function') ? deps.logAudit : null;

  if (!config) throw new Error('createZohoSignPoller requires a config');
  if (!client) throw new Error('createZohoSignPoller requires a Zoho client');
  if (!store) throw new Error('createZohoSignPoller requires a store');

  let timer = null;
  // Guards against a slow tick overlapping the next one, which would double every Zoho call.
  let ticking = false;
  // Ticks still to skip, and the consecutive-429 count that sizes them. They have to be separate
  // counters: decrementing the countdown to zero before the next rate limit would reset the
  // exponent every time and the backoff could never grow past one tick.
  let cooldownTicks = 0;
  let consecutiveRateLimits = 0;

  // The same guard the client and sender use. The poller is handed its own logger instance, so
  // it does not inherit theirs; without this, the tick-level catch below could print an
  // arbitrary driver or runtime message verbatim.
  const redact = createRedactor([config.clientSecret, config.refreshToken, config.webhookSecret]);

  function log(message) {
    if (!logger) return;
    const safe = redact(message);
    if (safe === null) return;
    logger(safe);
  }

  /** Audit rows are best-effort: a failure to record must never fail the poll. */
  async function recordAudit(documentId, action, extra) {
    if (!audit) return;
    try {
      await audit(documentId, action, 'zoho-sign-poller', null, extra || {});
    } catch (e) {
      log(`Zoho Sign poll could not write the audit row for document ${documentId}`);
    }
  }

  /**
   * One document. Never throws: a failure here must not abort the rest of the batch.
   * @returns {Promise<'changed'|'unchanged'|'failed'|'rate-limited'>}
   */
  async function pollDocument(doc) {
    const documentId = String(doc._id);
    const at = now();
    let zohoRequest;

    try {
      zohoRequest = await client.getRequest(doc.zoho_request_id);
    } catch (error) {
      const code = String((error && error.code) || ZOHO_ERROR_CODES.API_ERROR);
      // Stamp the attempt even on failure. Selection is ordered by zoho_last_polled_at, so a
      // permanently failing document that kept its old timestamp would sit at the head of the
      // queue forever and starve every other document behind it.
      //
      // `status` is deliberately NOT written: a network blip must never downgrade a contract
      // that is fine at Zoho. Only the diagnostic fields move.
      try {
        // try/await, not .catch(): the store contract allows a synchronous method, and calling
        // .catch() on a non-thenable return would throw out of this handler and kill the batch.
        await store.saveDocumentPatch(documentId, {
          zoho_last_polled_at: at,
          zoho_last_error: { code, message: String((error && error.message) || 'Zoho Sign poll failed.'), at },
        });
      } catch (e) {
        log(`Zoho Sign poll could not record a failure for document ${documentId}`);
      }
      log(`Zoho Sign poll failed for document ${documentId} with ${code}`);
      return code === ZOHO_ERROR_CODES.RATE_LIMITED ? 'rate-limited' : 'failed';
    }

    const docPatch = buildDocumentStatusPatch(doc, zohoRequest, at) || {};

    // A document is only "completed" once CPQ actually holds the executed PDF. Zoho keeps the
    // signed copy; without this, status flips to completed while every download and preview
    // route still resolves doc.signed_file_path || ... || doc.file_path and serves the ORIGINAL,
    // unsigned file. Marking a contract executed while handing out the unsigned version is worse
    // than reporting it late, so the transition is held until the artifact is stored.
    // Keyed off what Zoho reports, NOT off docPatch.status. A document that already reads
    // `completed` in CPQ produces no status change, so a transition-based trigger would skip
    // the download forever — which is exactly the state the self-healing branch of
    // buildDueDocumentsQuery re-selects. The two conditions have to agree.
    const zohoSaysCompleted = String((zohoRequest && zohoRequest.request_status) || '').trim().toLowerCase() === 'completed';
    if (zohoSaysCompleted && typeof store.saveSignedPdf === 'function' && !doc.signed_file_path) {
      try {
        // with_coc + merge gives one file containing the document and the audit certificate.
        const signed = await client.downloadPdf(doc.zoho_request_id, { withCoc: true, merge: true });
        const filePatch = await store.saveSignedPdf(documentId, signed && signed.buffer);
        Object.assign(docPatch, filePatch || {});
        // Storing the executed PDF is itself a sync, even when no status word changed.
        if (Object.keys(filePatch || {}).length > 0) docPatch.zoho_last_synced_at = at;
      } catch (error) {
        const code = String((error && error.code) || ZOHO_ERROR_CODES.API_ERROR);
        try {
          // Neither status nor zoho_request_status is advanced, so the document stays in the
          // selection and the next tick tries again.
          await store.saveDocumentPatch(documentId, {
            zoho_last_polled_at: at,
            zoho_last_error: {
              code,
              message: 'Signed at Zoho Sign, but the signed PDF could not be downloaded yet. Retrying.',
              at,
            },
          });
        } catch (e) {
          log(`Zoho Sign poll could not record a download failure for document ${documentId}`);
        }
        log(`Zoho Sign poll could not download the signed PDF for document ${documentId} (${code})`);
        return 'failed';
      }
    }

    let recipientUpdates = [];
    try {
      const recipients = (await store.findRecipients(documentId)) || [];
      recipientUpdates = buildRecipientStatusPatches(recipients, zohoRequest, at);
    } catch (e) {
      // A recipient read failure should not lose the document-level status we just learned.
      log(`Zoho Sign poll could not read recipients for document ${documentId}`);
    }

    for (const update of recipientUpdates) {
      try {
        await store.saveRecipientPatch(update.recipientId, update.patch);
      } catch (e) {
        log(`Zoho Sign poll could not update recipient ${update.recipientId}`);
      }
    }

    // One write per document: the status change (if any) and the attempt stamp together.
    // A success also clears any stale zoho_last_error, so a document that failed once and now
    // polls cleanly does not keep showing an error that no longer applies.
    const patch = Object.assign({ zoho_last_polled_at: at }, docPatch);
    if (doc.zoho_last_error) patch.zoho_last_error = null;
    // A tick where only signers moved is still a sync: zoho_last_synced_at means "last time
    // status actually changed", and a recipient status is a status.
    if (recipientUpdates.length > 0) patch.zoho_last_synced_at = at;
    try {
      await store.saveDocumentPatch(documentId, patch);
    } catch (e) {
      // Wrapped like every other store call here: an unguarded throw would escape to the tick
      // handler and silently discard the rest of the batch.
      log(`Zoho Sign poll could not persist the status for document ${documentId}`);
      return 'failed';
    }

    const changed = Object.keys(docPatch).length > 0 || recipientUpdates.length > 0;
    if (changed && docPatch.status) {
      log(`Zoho Sign poll moved document ${documentId} to ${docPatch.status}`);
      // CLAUDE.md requires an audit row for sensitive operations, and every in-house status
      // transition writes one. A Zoho-driven transition is no less consequential.
      await recordAudit(documentId, docPatch.status, {
        source: 'zoho-poll',
        provider: 'zoho',
        zoho_request_status: zohoRequest && zohoRequest.request_status,
      });
    }
    return changed ? 'changed' : 'unchanged';
  }

  /**
   * One tick. Resolves with a summary; never rejects, so an unhandled rejection can never reach
   * the event loop from a setInterval callback.
   */
  async function runOnce() {
    const summary = { scanned: 0, changed: 0, unchanged: 0, failed: 0, skipped: false };

    if (ticking) {
      summary.skipped = true;
      return summary;
    }
    if (cooldownTicks > 0) {
      cooldownTicks -= 1;
      summary.skipped = true;
      return summary;
    }

    ticking = true;
    try {
      // 0.9, not 1.0. A document is stamped at T+ε (query + HTTP round trip) while the next tick
      // computes its cutoff from T+δ with δ≈0, so a full-interval cutoff makes `stamped < cutoff`
      // false on the very next tick and every document is picked up only every OTHER tick —
      // halving the real cadence against what §9.2 budgets. The slack absorbs ε.
      const cutoff = new Date(now().getTime() - Math.round(config.pollIntervalMs * 0.9));
      const due = (await store.findDueDocuments(cutoff, config.pollBatch)) || [];
      summary.scanned = due.length;

      let rateLimited = false;
      for (const doc of due) {
        if (rateLimited) break;
        const outcome = await pollDocument(doc);
        if (outcome === 'changed') summary.changed += 1;
        else if (outcome === 'unchanged') summary.unchanged += 1;
        else {
          summary.failed += 1;
          if (outcome === 'rate-limited') rateLimited = true;
        }
      }

      if (rateLimited) {
        consecutiveRateLimits += 1;
        cooldownTicks = Math.min(Math.pow(2, consecutiveRateLimits - 1), MAX_COOLDOWN_TICKS);
        log(`Zoho Sign poll hit the rate limit; backing off for ${cooldownTicks} tick(s)`);
      } else {
        consecutiveRateLimits = 0;
        cooldownTicks = 0;
      }
    } catch (error) {
      // Selection itself failed (database down, say). Log and let the next tick try again.
      summary.failed += 1;
      log(`Zoho Sign poll tick failed: ${String((error && error.message) || 'unknown error')}`);
    } finally {
      ticking = false;
    }
    return summary;
  }

  function start() {
    if (timer) return timer;
    // Run immediately as well as on the interval. The boot timer already delays start by two
    // minutes, so waiting a further full interval would leave the first sync ~7 minutes out.
    runOnce().catch(() => {});
    timer = setInterval(() => { runOnce().catch(() => {}); }, config.pollIntervalMs);
    // Never hold the process open for a background poll.
    if (typeof timer.unref === 'function') timer.unref();
    return timer;
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { runOnce, start, stop, pollDocument };
}

/** The selection query, exported so server.cjs and the tests cannot drift apart on it. */
function buildDueDocumentsQuery(cutoff) {
  return {
    provider: 'zoho',
    zoho_request_id: { $exists: true },
    $and: [
      {
        $or: [
          // Still moving.
          { zoho_request_status: { $in: ZOHO_ACTIVE_REQUEST_STATUSES.slice() } },
          // Finished at Zoho but CPQ never got the executed PDF — because it completed before
          // the download existed, or the download failed after the status had advanced. Without
          // this the document is terminal and the artifact is never retrieved, so "Completed"
          // would keep serving the unsigned original forever. It self-heals, then drops out.
          { zoho_request_status: 'completed', signed_file_path: { $exists: false } },
        ],
      },
      {
        $or: [
          { zoho_last_polled_at: { $exists: false } },
          { zoho_last_polled_at: { $lt: cutoff } },
        ],
      },
    ],
  };
}

module.exports = {
  MAX_COOLDOWN_TICKS,
  createZohoSignPoller,
  buildDueDocumentsQuery,
};
