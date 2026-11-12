import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../approval-workflow-access.cjs';

const { pendingNewWorkflowSteps } = access as {
  pendingNewWorkflowSteps: (steps: unknown) => unknown;
};

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
const start = serverSrc.indexOf("\napp.post('/api/approval-workflows'");
const route = serverSrc.slice(start, serverSrc.indexOf('\napp.', start + 2)).replace(/\/\/.*$/gm, '');

describe('pendingNewWorkflowSteps', () => {
  it('resets every step to pending and drops decision fields', () => {
    const out = pendingNewWorkflowSteps([
      { step: 1, role: 'Team Approval', email: 'lead@cloudfuze.com', status: 'approved', timestamp: 't', actedBy: { email: 'x' }, group: 'SMB', comments: '' },
      { step: 3, role: 'Legal Team', email: 'legal@cloudfuze.com', status: 'approved', approvedAt: 't', approvedBy: 'me' },
    ]) as Array<Record<string, unknown>>;
    expect(out.map((s) => s.status)).toEqual(['pending', 'pending']);
    for (const s of out) {
      for (const f of ['timestamp', 'actedBy', 'approvedAt', 'approvedBy', 'deniedAt', 'deniedBy', 'decidedAt']) {
        expect(s).not.toHaveProperty(f);
      }
    }
    expect(out[0]).toMatchObject({ role: 'Team Approval', email: 'lead@cloudfuze.com', group: 'SMB' });
  });

  it('leaves non-arrays and odd entries alone', () => {
    expect(pendingNewWorkflowSteps(undefined)).toBeUndefined();
    expect(pendingNewWorkflowSteps([null, 'x'])).toEqual([null, 'x']);
  });
});

describe('POST /api/approval-workflows', () => {
  it('exists', () => {
    expect(start).toBeGreaterThan(-1);
  });

  it('requires a login before reading the body', () => {
    const authAt = route.indexOf('await getAuthenticatedUser(req, res)');
    expect(authAt).toBeGreaterThan(-1);
    expect(route.indexOf('req.body')).toBeGreaterThan(authAt);
    expect(route).not.toContain('getOptionalAuthenticatedUser');
  });

  it('takes the requester from the login only, never from the body', () => {
    expect(route).toContain('const creatorEmail = normalizeEmail(actor.email);');
    expect(route).not.toMatch(/req\.body\??\.creatorEmail/);
  });

  it('forces every step to pending before saving', () => {
    const resetAt = route.indexOf('pendingNewWorkflowSteps(');
    expect(resetAt).toBeGreaterThan(-1);
    expect(route.indexOf('.insertOne(')).toBeGreaterThan(resetAt);
  });

  it('lets only the e-sign document creator or an approval admin attach it', () => {
    const checkAt = route.indexOf('callerMaySeeRecipientTokens({ doc: esignDoc, user: actor, isApprovalAdmin })');
    expect(checkAt).toBeGreaterThan(-1);
    expect(route.indexOf('.insertOne(')).toBeGreaterThan(checkAt);
  });

  it('does not send internal error text to the caller', () => {
    expect(route).not.toMatch(/details:\s*error\.message/);
  });
});
