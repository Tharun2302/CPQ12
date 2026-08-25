'use strict';

// Selection rules for sequential ("signing order") e-sign envelopes. Kept out of server.cjs
// so the ordering logic can be unit tested without a database or SendGrid.

/** Envelope states where the chain must stop instead of emailing the next recipient. */
const ESIGN_SEQUENTIAL_BLOCKED_STATUSES = ['completed', 'denied', 'voided'];

function esignSequentialAdvanceAllowed(doc) {
  if (!doc || doc.signing_order_enforced !== true) return false;
  return !ESIGN_SEQUENTIAL_BLOCKED_STATUSES.includes(String(doc.status || ''));
}

/** A deferred recipient has a token but no `sent_at` — sequential send withholds it until the email goes out. */
function esignRecipientAwaitingFirstEmail(rec) {
  if (!rec || !rec.email || !rec.signing_token) return false;
  if (rec.status !== 'pending') return false;
  return rec.sent_at == null;
}

/**
 * Next recipient owed their first email. `recipients` must already be in signing order
 * (callers sort by `order` then `_id`). Returns null when nobody is waiting.
 */
function pickNextEsignSequentialRecipient(recipients) {
  if (!Array.isArray(recipients)) return null;
  return recipients.find(esignRecipientAwaitingFirstEmail) || null;
}

module.exports = {
  ESIGN_SEQUENTIAL_BLOCKED_STATUSES,
  esignSequentialAdvanceAllowed,
  esignRecipientAwaitingFirstEmail,
  pickNextEsignSequentialRecipient,
};
