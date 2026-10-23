import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import guard from '../../technical-approver-guard.cjs';

const TENANT = '66d8848d-26b6-4147-8124-127624d7b3a6';
const ALLOW_LIST = ['cpq.zenop.ai.technical@cloudfuze.com', ' Jane.Doe@CloudFuze.com '];

const verifiedClaims = (overrides: Record<string, unknown> = {}) => ({
  userId: 'microsoft_1',
  email: 'jane.doe@cloudfuze.com',
  msVerified: true,
  tid: TENANT,
  msVerifiedAt: Date.now(),
  ...overrides,
});

const CLIENT_ID = 'cpq-client-id';

function fakeJwt(payload: Record<string, unknown>) {
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.sig`;
}

describe('isSigninEnforced', () => {
  it('is on when the variable is unset', () => {
    expect(guard.isSigninEnforced({})).toBe(true);
    expect(guard.isSigninEnforced(undefined)).toBe(true);
  });

  it('is on for any value other than false', () => {
    expect(guard.isSigninEnforced({ TECH_APPROVER_SIGNIN_REQUIRED: 'true' })).toBe(true);
    expect(guard.isSigninEnforced({ TECH_APPROVER_SIGNIN_REQUIRED: '0' })).toBe(true);
    expect(guard.isSigninEnforced({ TECH_APPROVER_SIGNIN_REQUIRED: '' })).toBe(true);
  });

  it('is off only when explicitly false', () => {
    expect(guard.isSigninEnforced({ TECH_APPROVER_SIGNIN_REQUIRED: 'false' })).toBe(false);
    expect(guard.isSigninEnforced({ TECH_APPROVER_SIGNIN_REQUIRED: ' FALSE ' })).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(guard.normalizeEmail('  Jane.Doe@CloudFuze.COM ')).toBe('jane.doe@cloudfuze.com');
  });

  it('returns empty string for non-strings', () => {
    expect(guard.normalizeEmail(undefined)).toBe('');
    expect(guard.normalizeEmail(42)).toBe('');
  });
});

describe('evaluateTechnicalApprover', () => {
  const evaluate = (claims: unknown, allowList: unknown = ALLOW_LIST, tenantId: unknown = TENANT) =>
    guard.evaluateTechnicalApprover({ claims, allowList, tenantId });

  it('allows a verified, in-tenant approver on the list', () => {
    expect(evaluate(verifiedClaims())).toEqual({ allowed: true, httpStatus: 200, code: null, reason: null });
  });

  it('matches the allow-list case-insensitively and trimmed', () => {
    expect(evaluate(verifiedClaims({ email: 'JANE.DOE@cloudfuze.com ' })).allowed).toBe(true);
    expect(evaluate(verifiedClaims({ email: 'cpq.zenop.ai.technical@CLOUDFUZE.com' })).allowed).toBe(true);
  });

  it('requires sign-in when there are no claims', () => {
    expect(evaluate(null)).toEqual({ allowed: false, httpStatus: 401, code: 'TECH_SIGNIN_REQUIRED', reason: 'NOT_SIGNED_IN' });
    expect(evaluate({ userId: 'x' }).reason).toBe('NOT_SIGNED_IN');
  });

  it('requires a Microsoft-verified sign-in', () => {
    const result = evaluate(verifiedClaims({ msVerified: undefined }));
    expect(result).toMatchObject({ allowed: false, httpStatus: 401, code: 'TECH_SIGNIN_REQUIRED', reason: 'NOT_VERIFIED' });
    expect(evaluate(verifiedClaims({ msVerified: 'true' })).reason).toBe('NOT_VERIFIED');
  });

  it('rejects another tenant', () => {
    const result = evaluate(verifiedClaims({ tid: '00000000-0000-0000-0000-000000000000' }));
    expect(result).toMatchObject({ allowed: false, httpStatus: 403, code: 'TECH_NOT_AUTHORIZED', reason: 'WRONG_TENANT' });
    expect(evaluate(verifiedClaims({ tid: undefined })).reason).toBe('WRONG_TENANT');
  });

  it('compares the tenant id case-insensitively', () => {
    expect(evaluate(verifiedClaims({ tid: TENANT.toUpperCase() })).allowed).toBe(true);
  });

  it('fails closed when the tenant is not configured', () => {
    for (const tenantId of [undefined, '', '   ']) {
      expect(guard.evaluateTechnicalApprover({ claims: verifiedClaims(), allowList: ALLOW_LIST, tenantId })).toMatchObject({
        allowed: false, httpStatus: 403, code: 'TECH_NOT_AUTHORIZED', reason: 'NOT_CONFIGURED',
      });
    }
  });

  it('rejects an approver who is not on the list', () => {
    const result = evaluate(verifiedClaims({ email: 'someone.else@cloudfuze.com' }));
    expect(result).toMatchObject({ allowed: false, httpStatus: 403, code: 'TECH_NOT_AUTHORIZED', reason: 'NOT_ON_LIST' });
  });

  it('lets nobody through when the list is empty or missing', () => {
    expect(evaluate(verifiedClaims(), []).reason).toBe('NOT_ON_LIST');
    expect(guard.evaluateTechnicalApprover({ claims: verifiedClaims(), tenantId: TENANT }).reason).toBe('NOT_ON_LIST');
    expect(evaluate(verifiedClaims(), ['', null]).reason).toBe('NOT_ON_LIST');
  });
});

describe('errorMessageFor', () => {
  it('maps codes to the contract messages', () => {
    expect(guard.errorMessageFor('TECH_SIGNIN_REQUIRED')).toBe(
      'Please sign in with your CloudFuze Microsoft account to act on the Technical step.',
    );
    expect(guard.errorMessageFor('TECH_NOT_AUTHORIZED')).toBe("You're not authorised to approve Technical steps.");
  });
});

describe('graphIdentityMatches', () => {
  it('matches on mail or userPrincipalName, case-insensitively', () => {
    expect(guard.graphIdentityMatches({ mail: 'Jane.Doe@cloudfuze.com' }, 'jane.doe@cloudfuze.com')).toBe(true);
    expect(guard.graphIdentityMatches({ mail: null, userPrincipalName: 'JANE.DOE@cloudfuze.com' }, 'jane.doe@cloudfuze.com')).toBe(true);
  });

  it('rejects a different identity or missing input', () => {
    expect(guard.graphIdentityMatches({ mail: 'other@cloudfuze.com' }, 'jane.doe@cloudfuze.com')).toBe(false);
    expect(guard.graphIdentityMatches(null, 'jane.doe@cloudfuze.com')).toBe(false);
    expect(guard.graphIdentityMatches({ mail: '' }, '')).toBe(false);
  });
});

describe('verifiedClaimsFromGraph', () => {
  const graphUser = { mail: 'jane.doe@cloudfuze.com', displayName: ' Jane Doe ' };
  const verify = (overrides: Record<string, unknown> = {}) =>
    guard.verifiedClaimsFromGraph({
      graphUser,
      email: 'jane.doe@cloudfuze.com',
      tokenPayload: { tid: TENANT, appid: CLIENT_ID },
      clientId: CLIENT_ID,
      now: 1000,
      ...overrides,
    });

  it('returns verified claims with the Graph display name for a token issued to this app', () => {
    expect(verify()).toEqual({ msVerified: true, tid: TENANT, msName: 'Jane Doe', msVerifiedAt: 1000 });
    expect(verify({ tokenPayload: { tid: TENANT, azp: CLIENT_ID } })).not.toBeNull();
  });

  it('rejects a token issued to another app or when no client id is configured', () => {
    expect(verify({ tokenPayload: { tid: TENANT, appid: 'some-other-app' } })).toBeNull();
    expect(verify({ tokenPayload: { tid: TENANT } })).toBeNull();
    expect(verify({ clientId: undefined })).toBeNull();
    expect(verify({ clientId: '  ' })).toBeNull();
  });

  it('rejects guest accounts, a missing tid and a mismatched identity', () => {
    expect(verify({ tokenPayload: { tid: TENANT, appid: CLIENT_ID, acct: 1 } })).toBeNull();
    expect(verify({ tokenPayload: { appid: CLIENT_ID } })).toBeNull();
    expect(verify({ tokenPayload: null })).toBeNull();
    expect(verify({ email: 'someone.else@cloudfuze.com' })).toBeNull();
  });
});

describe('isOverageTechnicalSkip', () => {
  const workflow = (overrides: Record<string, unknown> = {}) => ({
    isOverage: true,
    workflowSteps: [
      { step: 1, role: 'Team Approval', status: 'approved' },
      { step: 2, role: 'Technical Team', status: 'pending' },
    ],
    ...overrides,
  });

  it('allows the automatic approve once the Team Lead has approved an overage deal', () => {
    expect(guard.isOverageTechnicalSkip(workflow(), { status: 'approved', comments: 'Skipped for overage agreement' })).toBe(true);
  });

  it('does not skip for non-overage deals, denials, comments, or before the Team Lead approves', () => {
    expect(guard.isOverageTechnicalSkip(workflow({ isOverage: false }), { status: 'approved' })).toBe(false);
    expect(guard.isOverageTechnicalSkip(workflow({ isOverage: 'true' }), { status: 'approved' })).toBe(false);
    expect(guard.isOverageTechnicalSkip(workflow(), { status: 'denied' })).toBe(false);
    expect(guard.isOverageTechnicalSkip(workflow(), { comments: 'hi' })).toBe(false);
    const pendingTeam = workflow({
      workflowSteps: [
        { step: 1, role: 'Team Approval', status: 'pending' },
        { step: 2, role: 'Technical Team', status: 'pending' },
      ],
    });
    expect(guard.isOverageTechnicalSkip(pendingTeam, { status: 'approved' })).toBe(false);
    expect(guard.isOverageTechnicalSkip(workflow({ workflowSteps: [] }), { status: 'approved' })).toBe(false);
    expect(guard.isOverageTechnicalSkip(null, { status: 'approved' })).toBe(false);
  });
});

describe('isVerificationFresh', () => {
  const now = 50 * 60 * 60 * 1000;

  it('accepts a sign-in within the max age and rejects older, future or missing ones', () => {
    expect(guard.isVerificationFresh({ msVerifiedAt: now - 60_000 }, now)).toBe(true);
    expect(guard.isVerificationFresh({ msVerifiedAt: now - guard.VERIFIED_SIGNIN_MAX_AGE_MS - 1 }, now)).toBe(false);
    expect(guard.isVerificationFresh({ msVerifiedAt: now + 60_000 }, now)).toBe(false);
    expect(guard.isVerificationFresh({}, now)).toBe(false);
  });

  it('makes evaluateTechnicalApprover ask for a fresh sign-in once it is stale', () => {
    const stale = verifiedClaims({ msVerifiedAt: Date.now() - guard.VERIFIED_SIGNIN_MAX_AGE_MS - 1 });
    expect(guard.evaluateTechnicalApprover({ claims: stale, allowList: ALLOW_LIST, tenantId: TENANT })).toMatchObject({
      allowed: false,
      code: 'TECH_SIGNIN_REQUIRED',
      reason: 'NOT_VERIFIED',
    });
  });
});

describe('decodeJwtPayload', () => {
  it('reads the tid claim from a token payload', () => {
    expect(guard.decodeJwtPayload(fakeJwt({ tid: TENANT }))).toEqual({ tid: TENANT });
  });

  it('returns null for malformed tokens', () => {
    expect(guard.decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(guard.decodeJwtPayload('a.!!!.c')).toBeNull();
    expect(guard.decodeJwtPayload(undefined)).toBeNull();
  });
});

describe('buildSigninStatus', () => {
  const build = (overrides: Record<string, unknown> = {}) =>
    guard.buildSigninStatus({ claims: verifiedClaims(), allowList: ALLOW_LIST, tenantId: TENANT, enforced: true, ...overrides });

  it('reports an allowed approver with name and email', () => {
    expect(build({ name: 'Jane Doe', email: 'jane.doe@cloudfuze.com' })).toEqual({
      success: true, signedIn: true, verified: true, allowed: true, enforced: true,
      name: 'Jane Doe', email: 'jane.doe@cloudfuze.com',
    });
  });

  it('reports not signed in without identity fields', () => {
    expect(build({ claims: undefined })).toEqual({
      success: true, signedIn: false, verified: false, allowed: false, enforced: true, reason: 'NOT_SIGNED_IN',
    });
  });

  it('reports the blocking reason when signed in but not allowed', () => {
    expect(build({ claims: verifiedClaims({ msVerified: false }) })).toMatchObject({ signedIn: true, verified: false, allowed: false, reason: 'NOT_VERIFIED' });
    expect(build({ allowList: [] })).toMatchObject({ allowed: false, reason: 'NOT_ON_LIST' });
    expect(build({ tenantId: undefined })).toMatchObject({ allowed: false, reason: 'NOT_CONFIGURED' });
  });

  it('allows everyone and omits reason when enforcement is off', () => {
    const status = build({ enforced: false, claims: undefined });
    expect(status).toEqual({ success: true, signedIn: false, verified: false, allowed: true, enforced: false });
  });
});

describe('generic create/update cannot decide the Technical step', () => {
  const steps = (techStatus: string, extra: Record<string, unknown> = {}) => [
    { step: 1, role: 'Team Approval', email: 'lead@cloudfuze.com', status: 'approved' },
    { step: 2, role: 'Technical Team', email: 'tech@cloudfuze.com', status: techStatus, comments: '', ...extra },
    { step: 3, role: 'Legal Team', email: 'legal@cloudfuze.com', status: 'pending' },
  ];
  const approvedByTech = { actedBy: { name: 'Jane', email: 'jane.doe@cloudfuze.com' }, timestamp: '2026-10-22T10:00:00.000Z' };

  it('a new workflow always starts with the Technical step pending', () => {
    const created = guard.withPendingTechnicalStep(steps('approved', { ...approvedByTech, comments: 'ok' }));
    expect(created[1]).toEqual({ step: 2, role: 'Technical Team', email: 'tech@cloudfuze.com', status: 'pending', comments: '' });
    expect(created[0].status).toBe('approved');
    expect(guard.withPendingTechnicalStep(undefined)).toBeUndefined();
  });

  it('an update that approves the Technical step keeps it as stored', () => {
    const workflow = { workflowSteps: steps('pending') };
    const result = guard.protectTechnicalStep(workflow, { workflowSteps: steps('approved', approvedByTech) });
    expect(result.ok).toBe(true);
    expect(result.kept).toBe(true);
    expect(result.updates.workflowSteps[1]).toEqual(workflow.workflowSteps[1]);
  });

  it('an update that drops the Technical step puts it back', () => {
    const workflow = { workflowSteps: steps('pending') };
    const without = steps('pending').filter((s) => s.role !== 'Technical Team');
    const result = guard.protectTechnicalStep(workflow, { workflowSteps: without });
    expect(result.updates.workflowSteps.map((s: { role: string }) => s.role)).toEqual(['Team Approval', 'Technical Team', 'Legal Team']);
  });

  it('a dotted path into the steps is dropped', () => {
    const result = guard.protectTechnicalStep({ workflowSteps: steps('pending') }, { 'workflowSteps.1.status': 'approved', notes: 'x' });
    expect(result.updates).toEqual({ notes: 'x' });
    expect(result.dropped).toEqual(['workflowSteps.1.status']);
  });

  it('the workflow cannot be marked approved while the Technical step is not', () => {
    const blocked = guard.protectTechnicalStep({ workflowSteps: steps('pending') }, { status: 'approved' });
    expect(blocked).toMatchObject({ ok: false, httpStatus: 409, code: 'TECH_NOT_APPROVED' });
    expect(guard.protectTechnicalStep({ workflowSteps: steps('approved', approvedByTech) }, { status: 'approved', currentStep: 4 }).ok).toBe(true);
  });

  it('other updates pass through untouched: denial, extra steps, the Technical step unchanged', () => {
    const workflow = { workflowSteps: steps('approved', approvedByTech) };
    expect(guard.protectTechnicalStep(workflow, { status: 'denied' })).toMatchObject({ ok: true, kept: false, updates: { status: 'denied' } });
    const appended = [...workflow.workflowSteps, { step: 5, role: 'Infrateam', status: 'approved' }];
    const result = guard.protectTechnicalStep(workflow, { workflowSteps: appended, currentStep: 5, status: 'in_progress' });
    expect(result.ok).toBe(true);
    expect(result.kept).toBe(false);
    expect(result.updates.workflowSteps).toEqual(appended);
  });

  it('a workflow without a Technical step cannot gain an approved one', () => {
    const workflow = { workflowSteps: [{ step: 1, role: 'Legal Team', status: 'pending' }] };
    const result = guard.protectTechnicalStep(workflow, { workflowSteps: [...workflow.workflowSteps, { step: 2, role: 'Technical Team', status: 'approved' }] });
    expect(result.updates.workflowSteps[1].status).toBe('pending');
  });
});
