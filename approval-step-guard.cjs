'use strict';

// Kept out of server.cjs so the stale-link and double-click rules are testable without a database.

// Only these roles gate the deal; Deal Desk and other steps are notifications.
const APPROVAL_ROLES = ['Team Approval', 'Technical Team', 'Legal Team'];

const OPEN_STEP_STATUSES = ['pending', 'in_progress'];

// Any other status from the client could reopen or corrupt a step.
const ALLOWED_STEP_STATUSES = ['approved', 'denied'];

// Bounds each workflow document so one oversized comment cannot push it past Mongo's 16 MB limit.
const MAX_COMMENT_LENGTH = 10000;

// The lead's stored role is "Team Approval", but the UI and emails call them the Team Lead.
function approverLabel(role) {
  if (!role) return 'approver';
  return role === 'Team Approval' ? 'Team Lead' : role;
}

// parseInt would read "1e3" as step 1 and "2abc" as step 2.
function parseStepNumber(raw) {
  return /^\d{1,3}$/.test(String(raw)) ? Number(raw) : NaN;
}

function invalid(code, error) {
  return { ok: false, httpStatus: 400, code, error };
}

// Role, email, step number and timestamp come from the stored workflow, never the request body.
function sanitizeStepUpdates(body) {
  const source = body && typeof body === 'object' ? body : {};
  const updates = {};

  if (source.status !== undefined) {
    if (!ALLOWED_STEP_STATUSES.includes(source.status)) {
      return invalid('INVALID_STEP_STATUS', 'Invalid step status.');
    }
    updates.status = source.status;
  }

  if (source.comments !== undefined) {
    if (typeof source.comments !== 'string') return invalid('INVALID_COMMENTS', 'Comments must be text.');
    const comments = source.comments.trim();
    if (comments.length > MAX_COMMENT_LENGTH) {
      return invalid('COMMENTS_TOO_LONG', `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
    }
    updates.comments = comments;
  }

  if (Object.keys(updates).length === 0) return invalid('NO_CHANGES', 'Nothing to update.');

  return { ok: true, updates };
}

// Manual workflows have no Team Approval step, so only Technical and Legal are required there.
function areAllApprovalStepsComplete(workflowSteps) {
  if (!Array.isArray(workflowSteps)) return false;
  const statusOf = (role) => workflowSteps.find((s) => s && s.role === role)?.status;
  const hasTeamStep = workflowSteps.some((s) => s && s.role === 'Team Approval');
  const required = hasTeamStep ? APPROVAL_ROLES : ['Technical Team', 'Legal Team'];
  return required.every((role) => statusOf(role) === 'approved');
}

function findStep(workflow, stepNumber) {
  const steps = Array.isArray(workflow?.workflowSteps) ? workflow.workflowSteps : [];
  return steps.find((s) => s && Number(s.step) === stepNumber) || null;
}

function blocked(httpStatus, code, error, step) {
  return {
    allowed: false,
    httpStatus,
    code,
    error,
    stepRole: step?.role ?? null,
    stepStatus: step?.status ?? null,
    actedAt: step?.timestamp || null,
  };
}

function alreadyHandledMessage(step) {
  const label = approverLabel(step.role);
  if (step.status === 'approved' || step.status === 'denied') {
    return `This document is already ${step.status} by the ${label}.`;
  }
  return `This step was already completed by the ${label}.`;
}

function deniedWorkflowResult(workflow) {
  const deniedStep = (workflow.workflowSteps || []).find((s) => s && s.status === 'denied');
  if (!deniedStep) return blocked(409, 'WORKFLOW_CLOSED', 'This document was already denied.', null);
  const message = `This document was already denied by the ${approverLabel(deniedStep.role)}.`;
  return blocked(409, 'WORKFLOW_CLOSED', message, deniedStep);
}

// Group mailboxes share one link, so a stale page must not overturn a decision or skip the order.
function checkStepUpdateAllowed(workflow, stepNumber, updates) {
  const step = Number.isInteger(stepNumber) ? findStep(workflow, stepNumber) : null;
  if (!step) return blocked(404, 'STEP_NOT_FOUND', 'This approval step does not exist.', null);

  if (!OPEN_STEP_STATUSES.includes(step.status)) {
    return blocked(409, 'STEP_ALREADY_HANDLED', alreadyHandledMessage(step), step);
  }

  if (workflow.status === 'denied') return deniedWorkflowResult(workflow);

  if (workflow.status === 'approved') {
    // Legal marks Deal Desk "Notified" after approval, but a notification step must never deny the deal.
    if (!APPROVAL_ROLES.includes(step.role) && updates?.status !== 'denied') return { allowed: true, step };
    return blocked(409, 'WORKFLOW_CLOSED', 'This document is already approved.', step);
  }

  if (Number(workflow.currentStep) !== stepNumber) {
    const currentStepObj = findStep(workflow, Number(workflow.currentStep));
    const message = currentStepObj
      ? `This document is waiting on the ${approverLabel(currentStepObj.role)} first.`
      : 'This step is not open for approval yet.';
    return blocked(409, 'NOT_CURRENT_STEP', message, step);
  }

  return { allowed: true, step };
}

function nextWorkflowState(workflow, stepNum, updates, updatedSteps) {
  if (updates.status === 'denied') return { currentStep: workflow.currentStep, status: 'denied' };
  if (updates.status !== 'approved') return { currentStep: workflow.currentStep, status: workflow.status };

  // Old records may lack totalSteps; without it the first approval would close the whole deal.
  const totalSteps = Number(workflow.totalSteps) || updatedSteps.length;
  const next = stepNum < totalSteps
    ? { currentStep: stepNum + 1, status: 'in_progress' }
    : { currentStep: workflow.currentStep, status: 'approved' };
  if (areAllApprovalStepsComplete(updatedSteps)) next.status = 'approved';
  return next;
}

// Writes only the target step's fields so a teammate's concurrent comment on it is not overwritten.
function planStepWrite(workflow, targetStep, stepNum, updates, now) {
  const timestamp = now.toISOString();
  const updatedSteps = workflow.workflowSteps.map((s) => (s === targetStep ? { ...s, ...updates, timestamp } : s));
  const next = nextWorkflowState(workflow, stepNum, updates, updatedSteps);

  const $set = { currentStep: next.currentStep, status: next.status, updatedAt: timestamp };
  for (const [key, value] of Object.entries({ ...updates, timestamp })) {
    $set[`workflowSteps.$[target].${key}`] = value;
  }

  return {
    filter: {
      id: workflow.id,
      status: workflow.status,
      currentStep: workflow.currentStep,
      workflowSteps: { $elemMatch: { step: targetStep.step, status: targetStep.status } },
    },
    update: { $set },
    options: { arrayFilters: [{ 'target.step': targetStep.step, 'target.status': targetStep.status }] },
    nextStatus: next.status,
  };
}

async function applyStepUpdate(collection, workflow, stepNum, updates, now = new Date()) {
  const guard = checkStepUpdateAllowed(workflow, stepNum, updates);
  if (!guard.allowed) return guard;

  const plan = planStepWrite(workflow, guard.step, stepNum, updates, now);
  const result = await collection.updateOne(plan.filter, plan.update, plan.options);
  if (result.matchedCount > 0) return { allowed: true, step: guard.step, nextStatus: plan.nextStatus };

  // A teammate changed the workflow between our read and write, so report what they did.
  const latest = await collection.findOne({ id: workflow.id });
  const recheck = checkStepUpdateAllowed(latest, stepNum, updates);
  if (!recheck.allowed) return { ...recheck, lostRace: true };
  const conflict = 'Someone else just updated this document. Please refresh and try again.';
  return { ...blocked(409, 'CONFLICT', conflict, null), lostRace: true };
}

// Ownership and history fields the generic workflow update must never change: rewriting
// creatorEmail would hand someone else the requester-only actions (Edit for RedLine, delete).
const LOCKED_WORKFLOW_FIELDS = [
  '_id', 'id', 'documentId', 'creatorEmail', 'createdBy', 'createdAt', 'creatorVerified',
  'hasRedlineEdit', 'redlineEditedAt', 'redlineDocumentId', 'redlineForked', 'redlineEdits',
];

// Drops locked fields, including dotted paths into them and Mongo operator keys.
// `allow` lets creation keep fields that are only locked once the workflow exists (documentId).
function stripLockedWorkflowFields(body, { allow = [] } = {}) {
  const updates = {};
  const stripped = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { updates, stripped };
  for (const [key, value] of Object.entries(body)) {
    const root = key.split('.')[0];
    if (key.startsWith('$') || (LOCKED_WORKFLOW_FIELDS.includes(root) && !allow.includes(root))) {
      stripped.push(key);
      continue;
    }
    updates[key] = value;
  }
  return { updates, stripped };
}

module.exports = {
  APPROVAL_ROLES,
  LOCKED_WORKFLOW_FIELDS,
  stripLockedWorkflowFields,
  MAX_COMMENT_LENGTH,
  approverLabel,
  parseStepNumber,
  sanitizeStepUpdates,
  areAllApprovalStepsComplete,
  checkStepUpdateAllowed,
  planStepWrite,
  applyStepUpdate,
};
