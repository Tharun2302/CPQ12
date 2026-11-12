import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../approval-workflow-access.cjs';

const { mayManageApprovalWorkflow } = access as {
  mayManageApprovalWorkflow: (args: { workflow: unknown; user: unknown; isAdmin?: unknown }) => boolean;
};

const WF = {
  id: 'WF-1775162752752',
  status: 'pending',
  creatorEmail: 'Owner@CloudFuze.com',
  workflowSteps: [
    { step: 1, role: 'Team Approval', email: 'lead@cloudfuze.com', status: 'pending' },
    { step: 2, role: 'Legal Team', email: 'legal@cloudfuze.com', status: 'pending' },
  ],
};

describe('mayManageApprovalWorkflow (copy approver link, reset e-sign)', () => {
  it('allows the workflow creator, ignoring case and spaces', () => {
    expect(mayManageApprovalWorkflow({ workflow: WF, user: { email: ' owner@cloudfuze.com ' }, isAdmin: false })).toBe(true);
  });

  it('allows a legacy workflow creator stored as createdBy', () => {
    const legacy = { ...WF, creatorEmail: undefined, createdBy: 'owner@cloudfuze.com' };
    expect(mayManageApprovalWorkflow({ workflow: legacy, user: { email: 'owner@cloudfuze.com' }, isAdmin: false })).toBe(true);
  });

  it('allows an approval admin on any workflow', () => {
    expect(mayManageApprovalWorkflow({ workflow: WF, user: { email: 'admin@cloudfuze.com' }, isAdmin: true })).toBe(true);
  });

  it('refuses a signed-in stranger', () => {
    expect(mayManageApprovalWorkflow({ workflow: WF, user: { email: 'stranger@cloudfuze.com' }, isAdmin: false })).toBe(false);
  });

  it('refuses an approver on the workflow, since the link acts as whichever step is pending', () => {
    expect(mayManageApprovalWorkflow({ workflow: WF, user: { email: 'legal@cloudfuze.com' }, isAdmin: false })).toBe(false);
  });

  it('refuses when there is no login', () => {
    expect(mayManageApprovalWorkflow({ workflow: WF, user: null, isAdmin: false })).toBe(false);
    expect(mayManageApprovalWorkflow({ workflow: WF, user: {}, isAdmin: true })).toBe(false);
  });

  it('refuses everyone when the workflow has no creator recorded, except admins', () => {
    const orphan = { ...WF, creatorEmail: undefined };
    expect(mayManageApprovalWorkflow({ workflow: orphan, user: { email: 'someone@cloudfuze.com' }, isAdmin: false })).toBe(false);
    expect(mayManageApprovalWorkflow({ workflow: orphan, user: { email: 'admin@cloudfuze.com' }, isAdmin: true })).toBe(true);
  });

  it('refuses a non-admin for a missing workflow, so IDs cannot be probed', () => {
    expect(mayManageApprovalWorkflow({ workflow: null, user: { email: 'owner@cloudfuze.com' }, isAdmin: false })).toBe(false);
  });

  it('treats only a real true as admin', () => {
    expect(mayManageApprovalWorkflow({ workflow: WF, user: { email: 'x@cloudfuze.com' }, isAdmin: 'true' })).toBe(false);
  });
});

describe('GET /api/approval-workflows/:workflowId/portal-link route', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
  const start = src.indexOf("\napp.get('/api/approval-workflows/:workflowId/portal-link'");
  const route = src.slice(start, src.indexOf('\napp.', start + 2));

  it('checks permission before a token is created', () => {
    expect(start).toBeGreaterThan(-1);
    const checkAt = route.indexOf('mayManageApprovalWorkflow(');
    const mintAt = route.indexOf('createApprovalAccessToken(');
    expect(checkAt).toBeGreaterThan(-1);
    expect(mintAt).toBeGreaterThan(checkAt);
  });

  it('does not send internal error text to the caller', () => {
    expect(route).toMatch(/res\.status\(500\)\.json\(/);
    expect(route).not.toMatch(/res\.status\(500\)\.json\([^)]*err\.message/);
  });
});

describe('ApprovalDashboard copy-link request', () => {
  const ui = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ApprovalDashboard.tsx'), 'utf8');

  it('sends the login with the portal-link request', () => {
    const at = ui.indexOf('/portal-link`');
    expect(at).toBeGreaterThan(-1);
    expect(ui.slice(at, at + 120)).toContain('headers: getAuthHeaders()');
  });
});
