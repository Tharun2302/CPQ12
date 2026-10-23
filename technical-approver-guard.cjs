'use strict';

// Kept out of server.cjs so the Technical sign-in rules are testable without a database or Microsoft.

const TECHNICAL_ROLE = 'Technical Team';

const SIGNIN_REQUIRED_ERROR = 'Please sign in with your CloudFuze Microsoft account to act on the Technical step.';
const NOT_AUTHORIZED_ERROR = "You're not authorised to approve Technical steps.";

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Secure by default: only an explicit 'false' turns enforcement off.
function isSigninEnforced(env) {
  const raw = env && env.TECH_APPROVER_SIGNIN_REQUIRED;
  return String(raw ?? '').trim().toLowerCase() !== 'false';
}

function normalizeAllowList(allowList) {
  if (!Array.isArray(allowList)) return [];
  return allowList.map(normalizeEmail).filter(Boolean);
}

function isOnAllowList(email, allowList) {
  const target = normalizeEmail(email);
  return target !== '' && normalizeAllowList(allowList).includes(target);
}

// Not a signature check: Graph accepting the token is what proves it genuine; we only read tid.
function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

// Guest and personal accounts can have no mail, so the UPN is accepted too.
function graphIdentityMatches(graphUser, email) {
  const target = normalizeEmail(email);
  if (!target || !graphUser || typeof graphUser !== 'object') return false;
  return [graphUser.mail, graphUser.userPrincipalName].some((candidate) => normalizeEmail(candidate) === target);
}

// A verified sign-in is re-checked after this long so a disabled Entra account loses access the same day.
const VERIFIED_SIGNIN_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// Graph accepted the token, so its payload is genuine; a token minted for another app or a guest is not ours.
function verifiedClaimsFromGraph({ graphUser, email, tokenPayload, clientId, now = Date.now() } = {}) {
  if (!graphIdentityMatches(graphUser, email) || !tokenPayload || typeof tokenPayload.tid !== 'string') return null;
  const issuedTo = tokenPayload.appid || tokenPayload.azp;
  if (typeof clientId !== 'string' || clientId.trim() === '' || issuedTo !== clientId.trim()) return null;
  if (tokenPayload.acct === 1) return null;
  const name = typeof graphUser.displayName === 'string' ? graphUser.displayName.trim() : '';
  return { msVerified: true, tid: tokenPayload.tid, msName: name, msVerifiedAt: now };
}

function isVerificationFresh(claims, now = Date.now()) {
  const at = Number(claims && claims.msVerifiedAt);
  return Number.isFinite(at) && now - at >= 0 && now - at <= VERIFIED_SIGNIN_MAX_AGE_MS;
}

// Overage deals skip Technical once the Team Lead approves; the Team Lead portal sends that skip without a Technical sign-in.
function isOverageTechnicalSkip(workflow, updates) {
  if (!workflow || workflow.isOverage !== true || updates?.status !== 'approved') return false;
  const steps = Array.isArray(workflow.workflowSteps) ? workflow.workflowSteps : [];
  const teamStep = steps.find((s) => s && s.role === 'Team Approval');
  return Boolean(teamStep) && teamStep.status === 'approved';
}

function deny(httpStatus, code, reason) {
  return { allowed: false, httpStatus, code, reason };
}

function evaluateTechnicalApprover({ claims, allowList, tenantId, now = Date.now() } = {}) {
  if (!claims || typeof claims !== 'object' || !normalizeEmail(claims.email)) {
    return deny(401, 'TECH_SIGNIN_REQUIRED', 'NOT_SIGNED_IN');
  }
  // Without a tenant to pin, any Microsoft account could pass, so fail closed.
  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    return deny(403, 'TECH_NOT_AUTHORIZED', 'NOT_CONFIGURED');
  }
  if (claims.msVerified !== true || !isVerificationFresh(claims, now)) {
    return deny(401, 'TECH_SIGNIN_REQUIRED', 'NOT_VERIFIED');
  }
  if (normalizeEmail(claims.tid) !== normalizeEmail(tenantId)) return deny(403, 'TECH_NOT_AUTHORIZED', 'WRONG_TENANT');
  if (!isOnAllowList(claims.email, allowList)) return deny(403, 'TECH_NOT_AUTHORIZED', 'NOT_ON_LIST');
  return { allowed: true, httpStatus: 200, code: null, reason: null };
}

function errorMessageFor(code) {
  return code === 'TECH_SIGNIN_REQUIRED' ? SIGNIN_REQUIRED_ERROR : NOT_AUTHORIZED_ERROR;
}

// Shapes the signin-status contract the portal reads; when enforcement is off nobody is blocked.
function buildSigninStatus({ claims, allowList, tenantId, enforced, name, email, now = Date.now() } = {}) {
  const evaluation = evaluateTechnicalApprover({ claims, allowList, tenantId, now });
  const signedIn = evaluation.reason !== 'NOT_SIGNED_IN';
  const allowed = !enforced || evaluation.allowed;
  const status = {
    success: true,
    signedIn,
    verified: signedIn && claims.msVerified === true && isVerificationFresh(claims, now),
    allowed,
    enforced: Boolean(enforced),
  };
  if (signedIn) {
    if (name) status.name = name;
    status.email = email || claims.email;
  }
  if (!allowed) status.reason = evaluation.reason;
  return status;
}

// Only the signed-in step route may decide the Technical step. The generic create and update
// routes take whole workflowSteps arrays, so without these a body could carry an approval.
const TECHNICAL_DECISION_FIELDS = ['actedBy', 'timestamp'];
const TECH_NOT_APPROVED_ERROR = 'The Technical step has not been approved yet.';

const isTechnicalStep = (step) => Boolean(step) && typeof step === 'object' && step.role === TECHNICAL_ROLE;

function pendingTechnicalStep(step) {
  const reset = { ...step, status: 'pending', comments: '' };
  TECHNICAL_DECISION_FIELDS.forEach((field) => delete reset[field]);
  return reset;
}

// A new workflow always starts with the Technical step undecided.
function withPendingTechnicalStep(steps) {
  if (!Array.isArray(steps)) return steps;
  return steps.map((step) => (isTechnicalStep(step) ? pendingTechnicalStep(step) : step));
}

const stepOrder = (step) => {
  const n = Number(step && step.step);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

// Generic update: the Technical step keeps what is stored, a dotted path into the steps is dropped,
// and the workflow cannot be marked approved while the Technical step is not.
function protectTechnicalStep(workflow, updates) {
  const out = { ...(updates || {}) };
  const dropped = [];
  Object.keys(out).forEach((key) => {
    if (key.startsWith('workflowSteps.')) {
      dropped.push(key);
      delete out[key];
    }
  });

  const storedSteps = Array.isArray(workflow && workflow.workflowSteps) ? workflow.workflowSteps : [];
  const stored = storedSteps.find(isTechnicalStep);
  let kept = dropped.length > 0;
  if (Array.isArray(out.workflowSteps)) {
    const incoming = out.workflowSteps;
    let next = incoming.map((step) => {
      if (!isTechnicalStep(step)) return step;
      const safe = stored || pendingTechnicalStep(step);
      if (JSON.stringify(step) !== JSON.stringify(safe)) kept = true;
      return safe;
    });
    // Dropping the step would leave the workflow with no Technical approval to wait for.
    if (stored && !incoming.some(isTechnicalStep)) {
      next = [...next, stored].sort((a, b) => stepOrder(a) - stepOrder(b));
      kept = true;
    }
    out.workflowSteps = next;
  }

  const technical = (Array.isArray(out.workflowSteps) ? out.workflowSteps : storedSteps).find(isTechnicalStep);
  if (out.status === 'approved' && technical && technical.status !== 'approved') {
    return { ok: false, httpStatus: 409, code: 'TECH_NOT_APPROVED', error: TECH_NOT_APPROVED_ERROR, dropped };
  }
  return { ok: true, updates: out, kept, dropped };
}

module.exports = {
  TECHNICAL_ROLE,
  TECH_NOT_APPROVED_ERROR,
  withPendingTechnicalStep,
  protectTechnicalStep,
  VERIFIED_SIGNIN_MAX_AGE_MS,
  SIGNIN_REQUIRED_ERROR,
  NOT_AUTHORIZED_ERROR,
  normalizeEmail,
  isSigninEnforced,
  isOnAllowList,
  decodeJwtPayload,
  graphIdentityMatches,
  verifiedClaimsFromGraph,
  isVerificationFresh,
  isOverageTechnicalSkip,
  evaluateTechnicalApprover,
  errorMessageFor,
  buildSigninStatus,
};
