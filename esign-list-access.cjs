'use strict';

// Who may see an agreement in the e-sign list routes. Kept out of server.cjs so both routes
// share one rule and it can be tested without a database.

const { esignDocumentCreatorEmail } = require('./esign-creator-utils.cjs');
const { normalizeEmail, isTrustedWorkflow } = require('./onlyoffice-redline.cjs');

function workflowGrantsAccess(workflow, email) {
  // Untrusted rows (creatorVerified:false) are forgeable, so they never grant visibility.
  return isTrustedWorkflow(workflow)
    && normalizeEmail(workflow.creatorEmail || workflow.createdBy) === email;
}

/**
 * True when `userEmail` may see this e-sign document in a list.
 * Admin: always. Others: the document creator (uploaded_by / requested_by_email), the creator of
 * a linked approval workflow, or a recipient. No resolvable match means admin-only.
 * `recipients` are rows with an `email`; `workflows` are the approval rows linked to this document.
 */
function canViewEsignDocument({ doc, recipients, workflows, userEmail, isAdmin }) {
  if (isAdmin) return true;
  const email = normalizeEmail(userEmail);
  if (!email || !doc) return false;

  if (normalizeEmail(esignDocumentCreatorEmail(doc)) === email) return true;
  if ((workflows || []).some((w) => workflowGrantsAccess(w, email))) return true;
  return (recipients || []).some((r) => r && normalizeEmail(r.email) === email);
}

function docIdString(id) {
  return id && typeof id.toString === 'function' ? id.toString() : String(id || '');
}

/**
 * One batched load of what the visibility rule needs for a page of documents (2 queries).
 * Returns { workflowsByDoc, recipientsByDoc } keyed by document id string.
 */
async function loadEsignAccessLinks(db, docs) {
  const docIds = docs.map((d) => d._id);
  const docIdStrings = docIds.map(docIdString);
  const workflowsByDoc = {};
  const recipientsByDoc = {};
  if (docs.length === 0) return { workflowsByDoc, recipientsByDoc };

  const workflows = await db.collection('approval_workflows')
    .find({ esignDocumentId: { $in: docIdStrings } })
    .toArray();
  workflows.forEach((w) => {
    const key = w.esignDocumentId != null ? String(w.esignDocumentId) : '';
    if (key) (workflowsByDoc[key] = workflowsByDoc[key] || []).push(w);
  });

  // document_id can be stored as ObjectId or string depending on where it was set
  const recipients = await db.collection('esign_recipients')
    .find({ $or: [{ document_id: { $in: docIdStrings } }, { document_id: { $in: docIds } }] })
    .toArray();
  recipients.forEach((r) => {
    const key = docIdString(r.document_id);
    if (key) (recipientsByDoc[key] = recipientsByDoc[key] || []).push(r);
  });
  return { workflowsByDoc, recipientsByDoc };
}

/** Keeps only the documents the caller may see; admins get the list back untouched. */
function filterEsignDocsForCaller({ docs, workflowsByDoc, recipientsByDoc, userEmail, isAdmin }) {
  if (isAdmin) return docs;
  return docs.filter((doc) => {
    const key = docIdString(doc._id);
    return canViewEsignDocument({
      doc,
      recipients: (recipientsByDoc || {})[key],
      workflows: (workflowsByDoc || {})[key],
      userEmail,
      isAdmin: false,
    });
  });
}

module.exports = {
  canViewEsignDocument,
  loadEsignAccessLinks,
  filterEsignDocsForCaller,
};
