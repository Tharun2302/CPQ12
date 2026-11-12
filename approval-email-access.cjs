'use strict';

// Kept out of server.cjs so who may trigger which approval email is testable without a database.

const { areAllApprovalStepsComplete } = require('./approval-step-guard.cjs');
const { STEP_ROLE_BY_LINK_ROLE } = require('./approval-workflow-access.cjs');

const DECIDED_STEP_STATUSES = ['approved', 'denied'];

/**
 * One entry per approval email. `notifies` is the step role that receives it, `envKey` and
 * `fallback` the configured team address, and `linkRoles` the emailed-link roles whose portal
 * sends it right after approving. Kinds without `linkRoles` are sent by signed-in staff only.
 */
const APPROVAL_EMAIL_KINDS = {
  team: { notifies: 'Team Approval', envKey: 'TEAM_APPROVAL_EMAIL', fallback: 'abhilasha.kandakatla@cloudfuze.com' },
  technical: {
    notifies: 'Technical Team',
    envKey: 'TECHNICAL_TEAM_EMAIL',
    fallback: 'cpq.zenop.ai.technical@cloudfuze.com',
    linkRoles: ['teamlead'],
  },
  legal: {
    notifies: 'Legal Team',
    envKey: 'LEGAL_TEAM_EMAIL',
    fallback: 'cpq.zenop.ai.legal@cloudfuze.com',
    linkRoles: ['technical', 'teamlead'],
  },
  client: {},
  legacyAll: {},
  dealDesk: { completion: true, linkRoles: ['legal', 'client'] },
};

function refuse(httpStatus, code, error) {
  return { ok: false, httpStatus, code, error };
}

function stepByRole(workflow, role) {
  const steps = Array.isArray(workflow && workflow.workflowSteps) ? workflow.workflowSteps : [];
  return steps.find((s) => s && s.role === role) || null;
}

function isStepApproved(workflow, role) {
  const step = stepByRole(workflow, role);
  return Boolean(step) && step.status === 'approved';
}

function isStepOpen(workflow, role) {
  const step = stepByRole(workflow, role);
  return Boolean(step) && !DECIDED_STEP_STATUSES.includes(step.status);
}

// A portal notifies the next approver only after its own step is approved and while theirs is open.
function linkMayNotify(kind, role, workflow) {
  const rule = APPROVAL_EMAIL_KINDS[kind];
  if (!rule.linkRoles || !rule.linkRoles.includes(role)) return false;
  if (!isStepApproved(workflow, STEP_ROLE_BY_LINK_ROLE[role]) || !isStepOpen(workflow, rule.notifies)) return false;
  // The Team Lead portal goes straight to Legal only on overage deals, where Technical is skipped.
  if (kind === 'legal' && role === 'teamlead') return workflow.isOverage === true;
  return true;
}

/**
 * May this caller send approval email `kind` for the stored `workflow`?
 * Staff may send any of them; a link only the one its portal sends after approving.
 * The completion email (which also sends the agreement for signature) needs every approval
 * step approved, whoever asks. Returns { ok: true } or { ok: false, httpStatus, code, error }.
 */
function checkApprovalEmailTrigger({ kind, caller, workflow }) {
  const rule = APPROVAL_EMAIL_KINDS[kind];
  if (!rule || !caller || !caller.ok || !workflow) {
    return refuse(403, 'EMAIL_NOT_ALLOWED', 'This approval email cannot be sent.');
  }
  if (rule.completion) {
    if (caller.kind !== 'staff' && !rule.linkRoles.includes(caller.role)) {
      return refuse(403, 'EMAIL_NOT_ALLOWED', 'This link cannot send this approval email.');
    }
    if (!areAllApprovalStepsComplete(workflow.workflowSteps)) {
      return refuse(409, 'APPROVAL_NOT_COMPLETE', 'This approval is not fully approved yet.');
    }
    return { ok: true };
  }
  if (caller.kind === 'staff' || linkMayNotify(kind, caller.role, workflow)) return { ok: true };
  return refuse(403, 'EMAIL_NOT_ALLOWED', 'This link cannot send this approval email.');
}

function cleanEmail(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Who receives approval email `kind`. Staff may name the recipient (they choose the approver
 * when a workflow is created); for a link the server picks the stored approver of the notified
 * step, else the configured team address, so a link can never mail the document elsewhere.
 */
function resolveApprovalEmailRecipient({ kind, caller, workflow, requested, env = {} }) {
  const rule = APPROVAL_EMAIL_KINDS[kind] || {};
  const configured = cleanEmail(rule.envKey && env[rule.envKey]) || rule.fallback || '';
  if (caller && caller.kind === 'staff') return cleanEmail(requested) || configured;
  const step = rule.notifies ? stepByRole(workflow, rule.notifies) : null;
  return cleanEmail(step && step.email) || configured;
}

// What a link's email says comes from the stored workflow only; nothing it sends is trusted.
function storedWorkflowData(workflow) {
  const teamStep = stepByRole(workflow, 'Team Approval');
  return {
    workflowId: workflow.id,
    documentId: workflow.documentId,
    documentType: workflow.documentType,
    clientName: workflow.clientName,
    companyName: workflow.companyName,
    amount: workflow.amount,
    hasCustomLineItems: workflow.hasCustomLineItems,
    teamGroup: (teamStep && teamStep.group) || workflow.teamGroup,
    creatorEmail: workflow.creatorEmail,
    requestedByName: workflow.creatorName || workflow.creatorEmail,
  };
}

/**
 * The details the email shows. The workflow id and document id always come from the stored
 * workflow, so the attachment and links can never point at another workflow's document.
 */
function buildApprovalEmailData({ caller, workflow, bodyData }) {
  const stored = storedWorkflowData(workflow);
  if (!caller || caller.kind !== 'staff') return stored;
  const sent = bodyData && typeof bodyData === 'object' ? bodyData : {};
  return { ...sent, workflowId: stored.workflowId, documentId: stored.documentId };
}

module.exports = {
  APPROVAL_EMAIL_KINDS,
  checkApprovalEmailTrigger,
  resolveApprovalEmailRecipient,
  buildApprovalEmailData,
};
