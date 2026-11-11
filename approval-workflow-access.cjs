'use strict';

// Kept out of server.cjs so the visibility rules and token check are testable without a database.

const { areAllApprovalStepsComplete } = require('./approval-step-guard.cjs');
const { normalizeEmail } = require('./onlyoffice-redline.cjs');

const PORTAL_ROLES = ['teamlead', 'technical', 'legal'];

const deny = (message) => ({ ok: false, message });

/**
 * Validates an approval-portal link (workflowId + role + token) against approval_access_tokens.
 * Returns { ok: true, workflowId, role } or { ok: false, message }.
 * Shared by verify-access and the workflow list so they cannot drift.
 */
async function verifyApprovalPortalToken(db, query) {
  const { workflowId, role, token } = query || {};
  if (!workflowId || !role || !token) return deny('Missing workflowId, role, or token');

  const normalizedRole = String(role).toLowerCase();
  if (!PORTAL_ROLES.includes(normalizedRole)) return deny('Invalid role');

  const record = await db.collection('approval_access_tokens').findOne({
    workflowId: String(workflowId),
    role: normalizedRole,
    token: String(token)
  });
  if (!record) return deny('Invalid or unknown token');

  const expiresAt = record.expiresAt instanceof Date
    ? record.expiresAt
    : new Date(record.expiresAt);
  if (expiresAt < new Date()) return deny('Token has expired');

  return { ok: true, workflowId: record.workflowId, role: normalizedRole };
}

// Mirrors workflowCreatorEmail in onlyoffice-redline.cjs (not exported there) so legacy rows match.
function workflowCreatorEmail(workflow) {
  return normalizeEmail(workflow && (workflow.creatorEmail || workflow.createdBy));
}

// Approvers are stored on each step as `email` (see POST /api/approval-workflows).
function isStepApprover(workflow, email) {
  if (!email || !Array.isArray(workflow && workflow.workflowSteps)) return false;
  return workflow.workflowSteps.some((step) => step && normalizeEmail(step.email) === email);
}

/** True when the signed-in user created the workflow or is an assigned approver on any step. */
function isWorkflowVisibleToUser(workflow, userEmail) {
  const email = normalizeEmail(userEmail);
  if (!email || !workflow) return false;
  return workflowCreatorEmail(workflow) === email || isStepApprover(workflow, email);
}

// Mutates the returned objects so the response matches what updateMany just wrote.
async function settleCompletedWorkflows(db, workflows) {
  const completed = workflows.filter((w) => w.id
    && (w.status === 'in_progress' || w.status === 'pending')
    && areAllApprovalStepsComplete(w.workflowSteps));
  if (completed.length === 0) return;

  const updatedAt = new Date().toISOString();
  await db.collection('approval_workflows').updateMany(
    { id: { $in: completed.map((w) => w.id) } },
    { $set: { status: 'approved', updatedAt } }
  );
  completed.forEach((w) => { w.status = 'approved'; w.updatedAt = updatedAt; });
}

function newestFirst(a, b) {
  return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

/**
 * Decides what GET /api/approval-workflows returns; `user` is the verified login or null.
 * Admin: everything. Other users: their own and assigned workflows.
 * A valid portal token adds exactly its one workflow, so emailed links work without a login.
 * Neither proof valid: 401 with no data. Returns { status, body } for the route to send as-is.
 */
async function listApprovalWorkflowsForCaller({ db, user, isAdmin, query }) {
  const collection = db.collection('approval_workflows');
  let workflows = [];

  if (user) {
    const all = await collection.find({}).sort({ createdAt: -1 }).toArray();
    workflows = isAdmin ? all : all.filter((w) => isWorkflowVisibleToUser(w, user.email));
  }

  if (!user || !isAdmin) {
    const access = await verifyApprovalPortalToken(db, query);
    if (access.ok) {
      const granted = await collection.findOne({ id: access.workflowId });
      if (granted && !workflows.some((w) => w.id === granted.id)) {
        workflows = [...workflows, granted].sort(newestFirst);
      }
    } else if (!user) {
      return { status: 401, body: { success: false, error: 'Authentication required' } };
    }
  }

  await settleCompletedWorkflows(db, workflows);
  return { status: 200, body: { success: true, workflows, count: workflows.length } };
}

module.exports = {
  PORTAL_ROLES,
  verifyApprovalPortalToken,
  isWorkflowVisibleToUser,
  listApprovalWorkflowsForCaller,
};
