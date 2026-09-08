'use strict';

// Selection rules for sequential ("signing order") e-sign envelopes. Kept out of server.cjs
// so the ordering logic can be unit tested without a database or SendGrid.

/** Envelope states where the chain must stop instead of emailing the next recipient. */
const ESIGN_SEQUENTIAL_BLOCKED_STATUSES = ['completed', 'denied', 'voided'];

/** Recipient states that count as "their turn is over". */
const ESIGN_RECIPIENT_DONE_STATUSES = ['signed', 'reviewed'];

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

/**
 * Whether a send must defer recipients after the first. The send pages post no flag, so the
 * envelope's stored setting decides; only a real boolean from the caller overrides it.
 */
function resolveEsignSigningOrderEnforced(doc, optionValue) {
  if (typeof optionValue === 'boolean') return optionValue;
  return !!doc && doc.signing_order_enforced === true;
}

/**
 * True when this recipient's turn has not come up yet, so no mail of any kind may go to them.
 * Reminder/expiry paths must check this or they leak a signing link ahead of the order, and
 * leave `sent_at` unset so the hand-off emails the same person a second time later.
 */
function esignRecipientEmailWithheld(doc, rec) {
  if (!doc || doc.signing_order_enforced !== true) return false;
  return !!rec && rec.sent_at == null;
}

/**
 * The recipient ahead of `recipientId` who still owes an action, or null when it is this person's
 * turn. Withholding email cannot enforce order on its own — a copied or forwarded link arrives out
 * of turn — so the open and submit paths both have to ask this. `recipients` must be in order.
 */
function findEsignBlockingPredecessor(doc, recipients, recipientId) {
  if (!doc || doc.signing_order_enforced !== true) return null;
  if (!Array.isArray(recipients) || recipientId == null) return null;
  const position = recipients.findIndex((r) => r && String(r._id) === String(recipientId));
  if (position <= 0) return null;
  return (
    recipients
      .slice(0, position)
      .find((r) => r && !ESIGN_RECIPIENT_DONE_STATUSES.includes(String(r.status || ''))) || null
  );
}

module.exports = {
  ESIGN_SEQUENTIAL_BLOCKED_STATUSES,
  ESIGN_RECIPIENT_DONE_STATUSES,
  findEsignBlockingPredecessor,
  esignSequentialAdvanceAllowed,
  esignRecipientAwaitingFirstEmail,
  pickNextEsignSequentialRecipient,
  resolveEsignSigningOrderEnforced,
  esignRecipientEmailWithheld,
};
