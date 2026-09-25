'use strict';

// Zoho Sign status vocabulary -> CPQ's existing vocabulary (design §6.4).
//
// NO NEW VALUE IS ADDED to esign_documents.status or esign_recipients.status. Dashboards switch
// on those strings and an unknown value renders as a blank chip, so Zoho's states are folded
// onto the words CPQ already uses. Zoho's raw state is kept verbatim in zoho_request_status,
// which is what the UI shows as a sub-label when the two differ.
//
// Pure functions only: no database, no network, no clock. The poller owns all of that.

/** Zoho states that can still change. The poller's selection query uses exactly this list. */
const ZOHO_ACTIVE_REQUEST_STATUSES = Object.freeze(['draft', 'inprogress']);

/** Zoho states that never change again. Reaching one takes a document out of the poll queue. */
const ZOHO_TERMINAL_REQUEST_STATUSES = Object.freeze(['completed', 'declined', 'recalled', 'expired']);

/**
 * Zoho request_status -> esign_documents.status.
 *
 * `expired` is the one imperfect row: CPQ has no expired document status, and `voided` is the
 * closest true statement ("no longer actionable"). The precise state survives in
 * zoho_request_status, so nothing is lost — see design §6.4.
 */
const CPQ_STATUS_BY_ZOHO_REQUEST_STATUS = Object.freeze({
  draft: 'draft',
  inprogress: 'sent',
  completed: 'completed',
  declined: 'denied',
  recalled: 'voided',
  expired: 'voided',
});

/** Zoho action_status -> esign_recipients.status. */
const CPQ_STATUS_BY_ZOHO_ACTION_STATUS = Object.freeze({
  NOTACTIONYET: 'pending',
  VIEWED: 'viewed',
  SIGNED: 'signed',
  APPROVED: 'reviewed',
  DECLINED: 'denied',
});

/**
 * CPQ states the poller must never move a document out of.
 *
 * `voided` is the one that matters: POST /api/esign/documents/:id/void sets it without touching
 * zoho_request_status and without recalling at Zoho, so the document stays in the poll set with
 * Zoho still reporting `inprogress`. Without this guard the very next tick maps that back to
 * `sent` and silently un-voids a contract a user deliberately killed.
 */
const CPQ_TERMINAL_STATUSES = Object.freeze(['completed', 'voided', 'denied']);

// Zoho's status is a string from a third party and is used as a map key. A bare object literal
// still inherits Object.prototype, so a status of "__proto__" or "constructor" would resolve to
// an inherited member and be written into esign_documents.status as an object or a function.
// Own-property lookup plus a typeof check closes that off at both mappers.
function lookupStatus(table, key) {
  if (!Object.prototype.hasOwnProperty.call(table, key)) return undefined;
  const mapped = table[key];
  return typeof mapped === 'string' ? mapped : undefined;
}

// Zoho states are short tokens; anything longer is malformed. Capping bounds what a hostile or
// broken upstream can persist into a field the dashboards render.
const MAX_STORED_STATUS_LENGTH = 64;

function normalizeRequestStatus(value) {
  return String(value == null ? '' : value).trim().toLowerCase().slice(0, MAX_STORED_STATUS_LENGTH);
}

function normalizeActionStatus(value) {
  return String(value == null ? '' : value).trim().toUpperCase().slice(0, MAX_STORED_STATUS_LENGTH);
}

/**
 * @returns {string|undefined} the CPQ document status, or undefined for a Zoho state we do not
 *   recognise. Undefined is deliberate: the caller must leave CPQ's status alone rather than
 *   guess, because a wrong guess here silently mis-reports a contract.
 */
function mapZohoRequestStatus(zohoRequestStatus) {
  return lookupStatus(CPQ_STATUS_BY_ZOHO_REQUEST_STATUS, normalizeRequestStatus(zohoRequestStatus));
}

/** @returns {string|undefined} the CPQ recipient status, undefined when unrecognised. */
function mapZohoActionStatus(zohoActionStatus) {
  return lookupStatus(CPQ_STATUS_BY_ZOHO_ACTION_STATUS, normalizeActionStatus(zohoActionStatus));
}

/** True when CPQ's own status is settled and the poller must not move it. */
function isTerminalCpqStatus(cpqStatus) {
  return CPQ_TERMINAL_STATUSES.includes(String(cpqStatus == null ? '' : cpqStatus));
}

function isTerminalZohoRequestStatus(zohoRequestStatus) {
  return ZOHO_TERMINAL_REQUEST_STATUSES.includes(normalizeRequestStatus(zohoRequestStatus));
}

function isActiveZohoRequestStatus(zohoRequestStatus) {
  return ZOHO_ACTIVE_REQUEST_STATUSES.includes(normalizeRequestStatus(zohoRequestStatus));
}

/**
 * The document-level patch for one poll result, or null when nothing changed.
 *
 * Returning null rather than an empty object is what lets the poller skip the write entirely and
 * report "unchanged" honestly. `zoho_last_polled_at` is NOT set here — the poller stamps that on
 * every attempt including failures, which is a different concern from "did anything change".
 *
 * @param {object} doc          the stored esign_documents row
 * @param {object} zohoRequest  the object getRequest() returned
 * @param {Date}   at           the clock reading for this tick
 */
function buildDocumentStatusPatch(doc, zohoRequest, at) {
  const rawStatus = zohoRequest && zohoRequest.request_status;
  const zohoStatus = normalizeRequestStatus(rawStatus);
  if (zohoStatus === '') return null;

  const mapped = mapZohoRequestStatus(zohoStatus);
  const patch = {};

  if (zohoStatus !== normalizeRequestStatus(doc && doc.zoho_request_status)) {
    patch.zoho_request_status = zohoStatus;
  }
  // An unrecognised Zoho state still updates zoho_request_status above, so the raw truth is
  // recorded, but CPQ's own status is left exactly as it was.
  // A settled CPQ status is never reopened. Zoho does not know about a CPQ-side void, so it
  // keeps reporting `inprogress` and would otherwise drag the document back to `sent`.
  const currentStatus = doc && doc.status;
  if (mapped && mapped !== currentStatus && !isTerminalCpqStatus(currentStatus)) {
    patch.status = mapped;
    // signed_at only. The signed PDF is NOT fetched here, so signed_file_path stays unset and
    // the download routes still serve the original — see the limitation noted in the design's
    // §6.5 question, which is deliberately out of scope for the poller.
    if (mapped === 'completed' && !(doc && doc.signed_at)) patch.signed_at = at;
  }

  if (Object.keys(patch).length === 0) return null;
  patch.zoho_last_synced_at = at;
  return patch;
}

/**
 * Recipient patches for one poll result, keyed by the CPQ recipient _id as a string.
 *
 * The join is `zoho_action_id`, written at send time. Matching on that rather than on position
 * or email means a reordered or re-sent action can never move one signer's status onto another.
 *
 * @returns {Array<{recipientId: string, patch: object}>} only recipients that actually changed
 */
function buildRecipientStatusPatches(recipients, zohoRequest, at) {
  const actions = zohoRequest && Array.isArray(zohoRequest.actions) ? zohoRequest.actions : [];
  const byActionId = new Map();
  actions.forEach((action) => {
    const id = String((action && action.action_id) || '').trim();
    if (id !== '') byActionId.set(id, action);
  });

  const updates = [];
  (Array.isArray(recipients) ? recipients : []).forEach((recipient) => {
    const actionId = String((recipient && recipient.zoho_action_id) || '').trim();
    if (actionId === '') return;
    const action = byActionId.get(actionId);
    if (!action) return;

    const zohoActionStatus = normalizeActionStatus(action.action_status);
    if (zohoActionStatus === '') return;

    const patch = {};
    if (zohoActionStatus !== normalizeActionStatus(recipient.zoho_action_status)) {
      patch.zoho_action_status = zohoActionStatus;
    }
    const mapped = mapZohoActionStatus(zohoActionStatus);
    if (mapped && mapped !== recipient.status) {
      patch.status = mapped;
      if (mapped === 'signed' && !recipient.signed_at) patch.signed_at = at;
    }
    if (Object.keys(patch).length === 0) return;
    updates.push({ recipientId: String(recipient._id), patch });
  });
  return updates;
}

module.exports = {
  ZOHO_ACTIVE_REQUEST_STATUSES,
  ZOHO_TERMINAL_REQUEST_STATUSES,
  CPQ_TERMINAL_STATUSES,
  isTerminalCpqStatus,
  CPQ_STATUS_BY_ZOHO_REQUEST_STATUS,
  CPQ_STATUS_BY_ZOHO_ACTION_STATUS,
  mapZohoRequestStatus,
  mapZohoActionStatus,
  isTerminalZohoRequestStatus,
  isActiveZohoRequestStatus,
  buildDocumentStatusPatch,
  buildRecipientStatusPatches,
};
