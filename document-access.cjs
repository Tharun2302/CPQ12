'use strict';

// Who may read or delete a stored document (the `documents` collection), and how an id that
// has no exact match may be resolved. Kept out of server.cjs so the rules are unit tested.

const { LINK_ROLES } = require('./approval-workflow-access.cjs');
const { normalizeEmail } = require('./onlyoffice-redline.cjs');

// Ids are Company_Client_12345 with both names stripped to letters and digits (see POST /api/documents).
const ID_NAME_PART = /^[a-zA-Z0-9]{1,40}$/;
const ID_NAME_MAX_LENGTH = 20;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Company and client parts of a Company_Client_12345 id, or null for anything else.
 * A part that is not plain letters and digits is refused, so it can never act as a pattern.
 */
function parseDocumentId(id) {
  if (typeof id !== 'string') return null;
  const [company, client] = id.split('_');
  if (!ID_NAME_PART.test(company || '') || !ID_NAME_PART.test(client || '')) return null;
  return { company, client };
}

/** Ids generated for the same company and client, whatever their number suffix. */
function sameCustomerIdPattern({ company, client }) {
  return new RegExp(`^${escapeRegExp(company)}_${escapeRegExp(client)}_`, 'i');
}

/**
 * Matches a stored company or client name that produces `part` when stripped the way ids are:
 * the same letters and digits in the same order, never a mere substring.
 */
function storedNamePattern(part) {
  const letters = String(part).split('').map(escapeRegExp).join('[^a-zA-Z0-9]*');
  // Ids keep only the first 20 characters of a name, so a full-length part may have a longer name.
  const tail = part.length >= ID_NAME_MAX_LENGTH ? '' : '[^a-zA-Z0-9]*$';
  return new RegExp(`^[^a-zA-Z0-9]*${letters}${tail}`, 'i');
}

function idString(id) {
  return id === null || id === undefined ? '' : String(id);
}

/** Document ids a link for this workflow may open: its document and its redline copy. */
function workflowDocumentIds(workflow) {
  if (!workflow) return [];
  return [workflow.documentId, workflow.redlineDocumentId].map(idString).filter(Boolean);
}

function refuse(httpStatus, error) {
  return { ok: false, httpStatus, error };
}

/**
 * May this caller read `document`? `caller` is resolveApprovalCaller's answer for the workflow
 * named in the query; `linkDocumentIds` are the stored ids of that workflow's own documents.
 * Staff may read any document; a link only its own workflow's.
 */
function checkDocumentReadCaller({ caller, document, linkDocumentIds = [] }) {
  if (!caller || !caller.ok) return refuse(401, 'Authentication required');
  if (caller.kind === 'staff') return { ok: true };
  const documentId = idString(document && document.id);
  const isLink = caller.kind === 'link' && LINK_ROLES.includes(caller.role);
  if (isLink && documentId && linkDocumentIds.map(idString).includes(documentId)) return { ok: true };
  return refuse(403, 'This link cannot open this document.');
}

/** True when the signed-in user saved this document (recorded from the login when it is created). */
function isDocumentCreator(document, actorEmail) {
  const actor = normalizeEmail(actorEmail);
  return Boolean(actor) && normalizeEmail(document && document.createdBy) === actor;
}

module.exports = {
  escapeRegExp,
  parseDocumentId,
  sameCustomerIdPattern,
  storedNamePattern,
  workflowDocumentIds,
  checkDocumentReadCaller,
  isDocumentCreator,
};
