'use strict';

// Kept out of server.cjs so the visibility rules and token check are testable without a database.

const { areAllApprovalStepsComplete } = require('./approval-step-guard.cjs');
const { normalizeEmail } = require('./onlyoffice-redline.cjs');
const { isOverageTechnicalSkip } = require('./technical-approver-guard.cjs');

const PORTAL_ROLES = ['teamlead', 'technical', 'legal'];

// Read-only link for the customer page and the emailed download link; never an approver portal.
const CLIENT_LINK_ROLE = 'client';
const LINK_ROLES = [...PORTAL_ROLES, CLIENT_LINK_ROLE];

const STEP_ROLE_BY_LINK_ROLE = { teamlead: 'Team Approval', technical: 'Technical Team', legal: 'Legal Team' };

const deny = (message) => ({ ok: false, message });

/**
 * Validates an approval-portal link (workflowId + role + token) against approval_access_tokens.
 * Returns { ok: true, workflowId, role } or { ok: false, message }.
 * Shared by verify-access and the workflow list so they cannot drift.
 */
async function verifyApprovalPortalToken(db, query, { roles = PORTAL_ROLES } = {}) {
  const { workflowId, role, token } = query || {};
  if (!workflowId || !role || !token) return deny('Missing workflowId, role, or token');

  const normalizedRole = String(role).toLowerCase();
  if (!roles.includes(normalizedRole)) return deny('Invalid role');

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

/**
 * Who is calling a route about ONE workflow; `user` is the verified login or null.
 * A staff login wins; otherwise the link's role + token must belong to `workflowId`
 * (the id from the route or body, never the one in the query string).
 * Returns { ok: true, kind: 'staff', user } or { ok: true, kind: 'link', role },
 * else { ok: false, httpStatus: 401, error }.
 */
async function resolveApprovalCaller({ db, user, query, workflowId }) {
  if (user) return { ok: true, kind: 'staff', user };
  const { role, token } = query || {};
  const access = await verifyApprovalPortalToken(db, { workflowId, role, token }, { roles: LINK_ROLES });
  if (!access.ok) return { ok: false, httpStatus: 401, error: 'Authentication required' };
  return { ok: true, kind: 'link', role: access.role };
}

function forbid(code, error) {
  return { ok: false, httpStatus: 403, code, error };
}

// A link could otherwise rewrite status and steps here and sidestep the per-role step rule.
function checkWorkflowUpdateCaller(caller) {
  if (caller && caller.ok && caller.kind === 'staff') return { ok: true };
  return forbid('SIGN_IN_REQUIRED', 'Sign in to CPQ to change this approval.');
}

function findStep(workflow, stepNumber) {
  const steps = Array.isArray(workflow && workflow.workflowSteps) ? workflow.workflowSteps : [];
  return steps.find((s) => s && Number(s.step) === stepNumber) || null;
}

function linkMayDecideStep(role, workflow, step, updates) {
  if (STEP_ROLE_BY_LINK_ROLE[role] === step.role) return true;
  // The Team Lead portal skips Technical on overage deals right after approving.
  if (role === 'teamlead' && step.role === 'Technical Team') return isOverageTechnicalSkip(workflow, updates);
  // The Legal portal marks Deal Desk "Notified" once the deal is approved.
  return role === 'legal' && step.role === 'Deal Desk' && (!updates || updates.status !== 'denied');
}

/**
 * May this caller decide or comment on step `stepNumber`? Staff may (the Technical sign-in
 * rule is applied separately); a link only on the step its role was emailed for.
 * A step that does not exist is left to the step guard to report.
 */
function checkStepDecisionCaller({ caller, workflow, stepNumber, updates }) {
  if (!caller || !caller.ok) return forbid('NOT_YOUR_STEP', 'This link cannot act on this approval step.');
  if (caller.kind === 'staff') return { ok: true };
  const step = findStep(workflow, stepNumber);
  if (!step) return { ok: true };
  if (linkMayDecideStep(caller.role, workflow, step, updates)) return { ok: true };
  return forbid('NOT_YOUR_STEP', 'This link cannot act on this approval step.');
}

// Staff may see a workflow's link or nudge its approver only when the workflow is theirs.
function canManageWorkflow(workflow, user, isAdmin) {
  return Boolean(user) && (isAdmin === true || isWorkflowVisibleToUser(workflow, user.email));
}

module.exports = {
  PORTAL_ROLES,
  CLIENT_LINK_ROLE,
  LINK_ROLES,
  STEP_ROLE_BY_LINK_ROLE,
  verifyApprovalPortalToken,
  isWorkflowVisibleToUser,
  listApprovalWorkflowsForCaller,
  resolveApprovalCaller,
  checkWorkflowUpdateCaller,
  checkStepDecisionCaller,
  canManageWorkflow,
};
