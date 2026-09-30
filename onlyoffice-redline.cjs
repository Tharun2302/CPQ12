'use strict';

// Saving an "Edit for RedLine" edit over a document. Kept out of server.cjs so the rules
// (requester-only during approval, backup before overwrite, approval history) can be unit tested.

const ACTIVE_APPROVAL_STATUSES = ['pending', 'in_progress'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function workflowCreatorEmail(workflow) {
  return normalizeEmail(workflow && (workflow.creatorEmail || workflow.createdBy));
}

function actorIsWorkflowCreator(workflow, actor) {
  const actorEmail = normalizeEmail(actor && actor.email);
  return !!actorEmail && actorEmail === workflowCreatorEmail(workflow);
}

function isActiveApproval(workflow) {
  return ACTIVE_APPROVAL_STATUSES.includes(workflow && workflow.status);
}

// Rows created without a verified login are marked creatorVerified:false, so a forged
// POST can neither take over a document nor lock its real requester out. Older rows
// (no flag) keep being trusted as before.
function isTrustedWorkflow(workflow) {
  return !!workflow && workflow.creatorVerified !== false && !!workflowCreatorEmail(workflow);
}

function latestWorkflow(workflows) {
  return workflows.reduce((latest, w) => (
    !latest || String(w.createdAt || '') > String(latest.createdAt || '') ? w : latest
  ), null);
}

/** Approvals whose requester decides who may change the document: every active one plus the
 *  most recent one, trusted rows only. Empty when no trusted approval names a requester. */
function requesterWorkflows(linkedWorkflows) {
  const trusted = linkedWorkflows.filter(isTrustedWorkflow);
  const gates = trusted.filter(isActiveApproval);
  const latest = latestWorkflow(trusted);
  if (latest && !gates.includes(latest)) gates.push(latest);
  return gates;
}

// Any approval, finished or not, puts the document behind a login: checking only active ones
// let a status flipped to "approved" for a moment switch the check off.
function redlineNeedsAuth(session, linkedWorkflows) {
  return linkedWorkflows.length > 0 || !!(session && session.workflowId);
}

/**
 * Decides whether `actor` may open or save a redline over the document.
 * `linkedWorkflows` are all approvals on the document (any status), read live.
 * Returns { ok: true } or { ok: false, httpStatus, error }.
 */
function redlineSaveDecision({ session, linkedWorkflows, actor }) {
  // An edit begun under an approval must not land on it once it has finished or been cancelled.
  const startedUnder = session.workflowId && linkedWorkflows.find(w => w.id === session.workflowId);
  if (session.workflowId && !isActiveApproval(startedUnder)) {
    return {
      ok: false,
      httpStatus: 409,
      error: 'The approval finished or changed while you were editing, so your edit was not saved.',
    };
  }
  if (!redlineNeedsAuth(session, linkedWorkflows)) return { ok: true };
  if (!normalizeEmail(actor && actor.email)) {
    return { ok: false, httpStatus: 401, error: 'Authentication required' };
  }

  const onlyRequester = 'Only the requester can edit this document because it has an approval';
  if (!requesterWorkflows(linkedWorkflows).every(w => actorIsWorkflowCreator(w, actor))) {
    return { ok: false, httpStatus: 403, error: onlyRequester };
  }
  if (session.actorEmail && session.actorEmail !== normalizeEmail(actor.email)) {
    return { ok: false, httpStatus: 403, error: onlyRequester };
  }
  return { ok: true };
}

// Flags workflows so the dashboard shows a "Redline Agreement" badge. Older rows whose redline
// was forked to a separate copy keep pointing at that copy.
async function markWorkflowsRedlined(db, documentId) {
  if (!db || !documentId) return;
  try {
    const now = new Date().toISOString();
    await db.collection('approval_workflows').updateMany(
      { documentId, redlineForked: { $ne: true } },
      {
        $set: {
          hasRedlineEdit: true,
          redlineEditedAt: now,
          redlineDocumentId: documentId,
          redlineForked: false,
          updatedAt: now,
        },
      }
    );
  } catch (e) {
    // Never fail the save because the badge metadata couldn't be written.
    console.warn('⚠️ Could not flag workflows as redlined for', documentId, (e && e.message) || e);
  }
}

async function recordRedlineOnWorkflow(db, workflowId, editorEmail, backupVersionId) {
  // Re-read so an approval that landed while the edit was saving is counted.
  const current = await db.collection('approval_workflows').findOne({ id: workflowId });
  const approvedStepsBefore = ((current && current.workflowSteps) || [])
    .filter(step => step.status === 'approved')
    .map(step => step.role);
  const edit = { editedAt: new Date().toISOString(), editedBy: editorEmail, backupVersionId, approvedStepsBefore };
  await db.collection('approval_workflows').updateOne(
    { id: workflowId },
    { $push: { redlineEdits: { $each: [edit], $slice: -50 } } }
  );
}

/**
 * Overwrites the document with the edited PDF + DOCX after copying the current version into
 * `document_versions`. For each active workflow, approvals already given are kept and the
 * edit is appended to its `redlineEdits` history.
 * Returns { ok: true, backupVersionId } or { ok: false, httpStatus, error }.
 */
async function saveRedlineOverDocument(db, { documentId, editedPdf, editedDocx, activeWorkflows, actor, backupVersionId }) {
  const original = await db.collection('documents').findOne(
    { id: documentId },
    { projection: { fileName: 1, fileData: 1, docxFileData: 1, fileSize: 1 } }
  );
  if (!original) return { ok: false, httpStatus: 404, error: 'Document not found' };

  const editorEmail = actor ? normalizeEmail(actor.email) : null;
  const workflows = activeWorkflows || [];

  // Written before the overwrite: if the backup fails, the document is left untouched.
  await db.collection('document_versions').insertOne({
    id: backupVersionId,
    documentId,
    fileName: original.fileName || null,
    fileData: original.fileData || null,
    docxFileData: original.docxFileData || null,
    fileSize: original.fileSize || null,
    reason: 'redline',
    workflowId: workflows.length ? workflows[0].id : null,
    replacedBy: editorEmail,
    createdAt: new Date(),
  });

  const result = await db.collection('documents').updateOne(
    { id: documentId },
    { $set: { fileData: editedPdf, docxFileData: editedDocx, fileSize: editedPdf.length, updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) return { ok: false, httpStatus: 404, error: 'Document not found' };

  await markWorkflowsRedlined(db, documentId);
  for (const workflow of workflows) {
    await recordRedlineOnWorkflow(db, workflow.id, editorEmail, backupVersionId);
  }

  return { ok: true, backupVersionId };
}

module.exports = {
  ACTIVE_APPROVAL_STATUSES,
  normalizeEmail,
  actorIsWorkflowCreator,
  isActiveApproval,
  isTrustedWorkflow,
  requesterWorkflows,
  redlineNeedsAuth,
  redlineSaveDecision,
  markWorkflowsRedlined,
  saveRedlineOverDocument,
};
