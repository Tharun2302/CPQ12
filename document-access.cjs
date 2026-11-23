'use strict';

// Who may list, open or delete a saved agreement in the `documents` collection. Pure, so the
// rules are unit tested without a database; server.cjs supplies the admin flags and linked rows.

const { normalizeEmail } = require('./onlyoffice-redline.cjs');
const { isWorkflowVisibleToUser } = require('./approval-workflow-access.cjs');
const { actorIsEsignDocumentCreator } = require('./esign-creator-utils.cjs');

/** Creator stamped from the verified login at save time (or by the backfill); '' when unknown. */
function documentCreatorEmail(doc) {
  return normalizeEmail(doc && doc.createdByEmail);
}

/** Mongo filter limiting the Documents list to what the caller may see. */
function documentListOwnerMatch({ user, isDocumentAdmin }) {
  if (isDocumentAdmin === true) return {};
  const email = normalizeEmail(user && user.email);
  // A login without an email must see nothing, not everything.
  return email ? { createdByEmail: email } : { _id: null };
}

/** Joins non-empty filters with $and; {} when there is nothing to filter on. */
function combineMatches(...matches) {
  const parts = matches.filter((m) => m && Object.keys(m).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

function isCreator(doc, email) {
  const creator = documentCreatorEmail(doc);
  return !!creator && creator === email;
}

/**
 * GET /api/documents/:id. Approvers and e-sign creators keep access to documents they did not
 * create; `linkedWorkflows` / `linkedEsignDocs` are the rows pointing at this document.
 */
function mayReadDocument({
  doc, user, isDocumentAdmin = false, isApprovalAdmin = false,
  linkedWorkflows = [], linkedEsignDocs = [],
}) {
  const email = normalizeEmail(user && user.email);
  if (!doc || !email) return false;
  if (isDocumentAdmin === true || isApprovalAdmin === true) return true;
  if (isCreator(doc, email)) return true;
  if ((linkedWorkflows || []).some((w) => isWorkflowVisibleToUser(w, email))) return true;
  return (linkedEsignDocs || []).some((e) => actorIsEsignDocumentCreator(e, email));
}

/** DELETE /api/documents/:id: document admins only; creators cannot delete their own. */
function mayDeleteDocument({ doc, user, isDocumentAdmin = false }) {
  const email = normalizeEmail(user && user.email);
  if (!doc || !email) return false;
  return isDocumentAdmin === true;
}

const MAX_DOCUMENT_ID_LENGTH = 200;

/**
 * Validates a client-supplied document id before it is stored or used in a query. An array or
 * object would otherwise be stored as-is and later match `{ documentId: doc.id }` by membership.
 * Returns { ok: true, value: string | null } (null = no document) or { ok: false }.
 */
function parseDocumentIdInput(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const value = raw.trim();
  if (!value || value.length > MAX_DOCUMENT_ID_LENGTH) return { ok: false };
  return { ok: true, value };
}

/** Linking a document to a new approval or e-sign: its creator, a document admin
 *  or an approval admin. */
function mayLinkDocument({ doc, user, isDocumentAdmin = false, isApprovalAdmin = false }) {
  const email = normalizeEmail(user && user.email);
  if (!doc || typeof doc.id !== 'string' || !email) return false;
  return isDocumentAdmin === true || isApprovalAdmin === true || isCreator(doc, email);
}

/** Creator fields for a new document, from the verified login only; never from the request body. */
function creatorStampFromLogin(user) {
  return {
    createdByEmail: normalizeEmail(user && user.email) || null,
    createdByUserId: (user && user.id) || null,
    createdBySource: 'login',
  };
}

module.exports = {
  documentCreatorEmail,
  documentListOwnerMatch,
  combineMatches,
  mayReadDocument,
  mayDeleteDocument,
  mayLinkDocument,
  parseDocumentIdInput,
  creatorStampFromLogin,
};
