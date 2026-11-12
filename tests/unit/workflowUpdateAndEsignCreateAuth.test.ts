import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../approval-workflow-access.cjs';

const { checkWorkflowUpdate } = access as {
  checkWorkflowUpdate: (args: { updates: unknown; isAdmin?: unknown }) => { ok: boolean; httpStatus?: number; code?: string };
};

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function routeSource(method: string, routePath: string): string {
  const start = serverSrc.indexOf(`\napp.${method}('${routePath}'`);
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 2);
  return serverSrc.slice(start + 1, end === -1 ? undefined : end).replace(/\/\/.*$/gm, '');
}

describe('checkWorkflowUpdate', () => {
  it('lets the requester cancel', () => {
    expect(checkWorkflowUpdate({ updates: { status: 'denied' }, isAdmin: false }).ok).toBe(true);
  });

  it('blocks setting "approved" directly, even for an admin', () => {
    for (const isAdmin of [false, true]) {
      const r = checkWorkflowUpdate({ updates: { status: 'approved' }, isAdmin });
      expect(r.ok).toBe(false);
      expect(r.code).toBe('APPROVE_VIA_STEPS');
    }
  });

  it('stops a requester from changing approvers, steps or progress', () => {
    const cases = [
      { workflowSteps: [{ step: 3, role: 'Legal Team', email: 'me@cloudfuze.com' }] },
      { 'workflowSteps.2.email': 'me@cloudfuze.com' },
      { currentStep: 4 },
      { status: 'in_progress' },
      { status: 'denied', currentStep: 4 },
    ];
    for (const updates of cases) {
      const r = checkWorkflowUpdate({ updates, isAdmin: false });
      expect(r.ok, JSON.stringify(updates)).toBe(false);
      expect(r.httpStatus).toBe(403);
    }
  });

  it('lets an approval admin change steps and progress', () => {
    expect(checkWorkflowUpdate({ updates: { workflowSteps: [], currentStep: 2, status: 'in_progress' }, isAdmin: true }).ok).toBe(true);
  });

  it('treats only a real true as admin', () => {
    expect(checkWorkflowUpdate({ updates: { currentStep: 2 }, isAdmin: 'true' }).ok).toBe(false);
  });
});

describe('PUT /api/approval-workflows/:id', () => {
  const route = routeSource('put', '/api/approval-workflows/:id');

  it('checks requester-or-admin, then the allowed changes, before writing', () => {
    const who = route.indexOf('mayManageApprovalWorkflow(');
    const what = route.indexOf('checkWorkflowUpdate(');
    const write = route.indexOf('.updateOne(');
    expect(who).toBeGreaterThan(-1);
    expect(what).toBeGreaterThan(who);
    expect(write).toBeGreaterThan(what);
  });

  it('does not send internal error text to the caller', () => {
    expect(route).not.toMatch(/res\.status\(500\)\.json\(\{[^}]*error\.message/);
  });
});

describe('e-sign creation and sending', () => {
  it('upload checks the login before multer writes the file, and records the login as creator', () => {
    const route = routeSource('post', '/api/esign/documents/upload');
    expect(route.indexOf('getAuthenticatedUser(')).toBeLessThan(route.indexOf('esignDocumentUpload.single('));
    expect(route).toContain('const uploadedBy = req.authUser.email;');
    expect(route).not.toMatch(/req\.body\.uploaded_by/);
  });

  it('from-approval takes the creator from the login or the linked approval, never the body', () => {
    const route = routeSource('post', '/api/esign/documents/from-approval');
    expect(route).not.toMatch(/uploaded_by:\s*uploadedBy|requested_by_email:\s*requestedByEmailBody/);
    expect(route).not.toMatch(/requestedByEmailBody|req\.body\??\.uploaded_by/);
    expect(route.indexOf('mayManageApprovalWorkflow(')).toBeLessThan(route.indexOf("collection('esign_documents').insertOne"));
  });

  it('from-approval refuses to link an approval for a different document', () => {
    expect(routeSource('post', '/api/esign/documents/from-approval')).toContain('workflow.documentId !== documentId');
  });

  it.each([
    ['post', '/api/esign/documents/:id/send'],
    ['post', '/api/esign/documents/:id/send-for-signature'],
    ['post', '/api/esign/signature-fields'],
  ])('%s %s is limited to the creator or an approval admin', (method, routePath) => {
    const route = routeSource(method, routePath);
    expect(route).toMatch(/callerMaySeeRecipientTokens\(\{ doc(: existing)?, user, isApprovalAdmin/);
    expect(route).not.toMatch(/req\.body\??\.uploaded_by/);
  });

  it('the unused POST /api/esign/signatures/save is removed', () => {
    expect(serverSrc).not.toMatch(/app\.post\(\s*'\/api\/esign\/signatures\/save'/);
  });
});

describe('retired client-approval and infra-team flows stay removed', () => {
  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it.each(['/api/send-client-email', '/api/send-approval-emails'])('%s is not registered', (route) => {
    expect(serverSrc).not.toContain(`app.post('${route}'`);
  });

  it('no email links to the old client approval page', () => {
    expect(serverSrc).not.toContain('/client-notification');
  });

  it.each(['/client-notification', '/infrateam'])('%s has no page route', (route) => {
    expect(appSrc).not.toContain(`path="${route}"`);
  });
});
