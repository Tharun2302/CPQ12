'use strict';

// Creator identity for e-sign documents. Kept out of server.cjs so the rule can be unit
// tested, and so every creator-only action resolves identity the exact same way.

function normalizeEmail(e) {
  if (!e || typeof e !== 'string') return '';
  return e.trim().toLowerCase();
}

/**
 * Canonical creator address for an e-sign document.
 *
 * `uploaded_by` holds an email address for manually uploaded documents, but a display NAME
 * for documents generated through the approval workflow — those carry the address in
 * `requested_by_email`. Anything authorizing "creator only" must accept both, or the creator
 * of an approval-generated agreement is locked out of their own document while the UI still
 * shows the action as available to them.
 */
function esignDocumentCreatorEmail(doc) {
  if (!doc) return '';
  const uploader = String(doc.uploaded_by || '').trim();
  if (uploader.includes('@')) return uploader;
  const requested = String(doc.requested_by_email || '').trim();
  if (requested.includes('@')) return requested;
  return '';
}

/** True when actor is the creator of the e-sign document. Case- and whitespace-insensitive. */
function actorIsEsignDocumentCreator(doc, actorEmail) {
  const creator = normalizeEmail(esignDocumentCreatorEmail(doc));
  const actor = normalizeEmail(actorEmail);
  return creator !== '' && actor !== '' && creator === actor;
}

module.exports = {
  esignDocumentCreatorEmail,
  actorIsEsignDocumentCreator,
};
