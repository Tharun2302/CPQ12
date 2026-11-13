'use strict';

// Kept out of server.cjs so the e-sign state rules are unit tested: which agreements may be
// sent for signature, and what a signing link may still do.

const DRAFT_STATUSES = ['', 'draft', 'uploaded'];
const OUT_FOR_SIGNATURE_STATUS = 'sent';

// Sending again would hand every recipient a new link and wipe the signatures already recorded.
const UNSENDABLE_STATUS_ERRORS = {
  completed: 'This document is already signed and cannot be sent again.',
  signed: 'This document is already signed and cannot be sent again.',
  voided: 'This document has been voided and cannot be sent.',
  denied: 'This document was declined and cannot be sent again. Create a new signing request instead.',
};
const UNSENDABLE_FALLBACK_ERROR = 'This document cannot be sent for signature in its current state.';

function normalizedStatus(row) {
  return row && typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';
}

function ownMessage(messages, key) {
  return Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : null;
}

/**
 * Refusal message when this e-sign document must not be sent for signature, else null.
 * Only a document that has not been sent yet is sent; one that is already out for signature
 * also gets null, because the caller answers that with its harmless "already sent" no-op.
 */
function esignSendRefusal(doc) {
  const status = normalizedStatus(doc);
  if (DRAFT_STATUSES.includes(status) || status === OUT_FOR_SIGNATURE_STATUS) return null;
  return ownMessage(UNSENDABLE_STATUS_ERRORS, status) || UNSENDABLE_FALLBACK_ERROR;
}

const SIGNER_ACTIONS = ['deny-signing', 'mark-reviewed', 'reviewer-save-fields', 'generate-signed'];
const REVIEWER_ONLY_ACTIONS = ['mark-reviewed', 'reviewer-save-fields'];

const RECIPIENT_ACTED_ERRORS = {
  signed: 'You have already signed this document.',
  reviewed: 'You have already reviewed this document.',
  denied: 'You have already declined this document.',
};

const NOT_OUT_FOR_SIGNATURE_ERRORS = {
  completed: 'This document is already completed.',
  signed: 'This document is already completed.',
  denied: 'This document has been declined, so it can no longer be signed or reviewed.',
};
const NOT_OUT_FOR_SIGNATURE_FALLBACK_ERROR = 'This document is not out for signature.';

function refuse(httpStatus, code, error) {
  return { httpStatus, code, error };
}

/**
 * May the holder of a signing link still do `action`? Returns null when allowed, else
 * { httpStatus, code, error }. A link acts only while its document is out for signature and
 * its own recipient has not signed, reviewed or declined yet; the review actions are for
 * reviewers only, so a signer cannot finish a document without signing.
 * `recipientIsReviewer` comes from the server's own reviewer rule (action, then role).
 */
function esignSignerActionRefusal({ action, doc, recipient, recipientIsReviewer }) {
  if (!SIGNER_ACTIONS.includes(action) || !recipient) {
    return refuse(403, 'NOT_ALLOWED', 'This link cannot do that.');
  }
  if (!doc) return refuse(404, 'NOT_FOUND', 'Document not found');
  const docStatus = normalizedStatus(doc);
  if (docStatus === 'voided') return refuse(410, 'VOIDED', 'This signing request has been voided.');
  if (REVIEWER_ONLY_ACTIONS.includes(action) && recipientIsReviewer !== true) {
    return refuse(403, 'NOT_REVIEWER', 'Only reviewers can review this document. Please sign it instead.');
  }
  const acted = ownMessage(RECIPIENT_ACTED_ERRORS, normalizedStatus(recipient));
  if (acted) return refuse(409, 'ALREADY_ACTED', acted);
  if (docStatus !== OUT_FOR_SIGNATURE_STATUS) {
    return refuse(
      409,
      'NOT_OUT_FOR_SIGNATURE',
      ownMessage(NOT_OUT_FOR_SIGNATURE_ERRORS, docStatus) || NOT_OUT_FOR_SIGNATURE_FALLBACK_ERROR
    );
  }
  return null;
}

module.exports = { esignSendRefusal, esignSignerActionRefusal };
