'use strict';

// Who may read an e-sign document, kept out of server.cjs so the rules can be unit tested.
//
// Three kinds of caller reach the e-sign read routes (document, file, fields, recipients):
//   - staff:  a signed-in CPQ user (Bearer JWT). May read any document.
//   - signer: someone holding a recipient's signing link (esign_recipients.signing_token).
//             May read the document the link belongs to, plus any other document on which the
//             same email address is a recipient (the e-sign inbox lists those as history).
//   - portal: an approval-portal reviewer (approval_access_tokens.token, role teamlead,
//             technical or legal) with no CPQ login. May read only the e-sign document attached to that workflow.
// The database lookups live in server.cjs; these functions only decide.

const { PORTAL_ROLES } = require('./approval-workflow-access.cjs');

const MIN_TOKEN_LENGTH = 16;
const MAX_TOKEN_LENGTH = 256;

/**
 * A token from a query string or JSON body, or '' when it is not a plausible token.
 * Anything that is not a string is rejected so an object such as {"$ne": null} can never
 * reach a MongoDB filter and match some other recipient's record.
 */
function coerceToken(raw) {
  if (typeof raw !== 'string') return '';
  const token = raw.trim();
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) return '';
  return token;
}

function normalizeEmail(e) {
  return typeof e === 'string' ? e.trim().toLowerCase() : '';
}

function idString(id) {
  if (id === null || id === undefined) return '';
  return String(id);
}

/** Missing expiry counts as valid, matching links issued before expiry existed. */
function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t < now;
}

/**
 * Can the holder of this signing link read document `docId`?
 * `docRecipientEmails` are the emails of every recipient on that document.
 */
function signerCanReadDocument({ recipient, docId, docRecipientEmails = [], now = Date.now() }) {
  if (!recipient || !docId) return false;
  if (isExpired(recipient.token_expires_at, now)) return false;
  if (idString(recipient.document_id) === idString(docId)) return true;
  const email = normalizeEmail(recipient.email);
  if (!email) return false;
  return docRecipientEmails.some((e) => normalizeEmail(e) === email);
}

/** Can the holder of this approval-portal token read document `docId`? */
function portalCanReadDocument({ record, workflow, docId, now = Date.now() }) {
  if (!record || !workflow || !docId) return false;
  // The read-only customer link must not open the agreement, its fields or its recipients.
  if (!PORTAL_ROLES.includes(String(record.role || '').toLowerCase())) return false;
  if (!record.expiresAt || isExpired(record.expiresAt, now)) return false;
  if (idString(record.workflowId) !== idString(workflow.id)) return false;
  const attached = idString(workflow.esignDocumentId);
  return attached !== '' && attached === idString(docId);
}

/**
 * Signing tokens are bearer credentials: whoever holds one can sign as that recipient.
 * Only staff (who need them for "Copy signing link") ever receive them.
 */
function redactRecipientForViewer(recipientView, viewerKind) {
  if (viewerKind === 'staff') return recipientView;
  const { signing_token, token_expires_at, ...rest } = recipientView;
  return rest;
}

module.exports = {
  coerceToken,
  isExpired,
  signerCanReadDocument,
  portalCanReadDocument,
  redactRecipientForViewer,
};
