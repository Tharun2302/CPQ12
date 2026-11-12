import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
const ui = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ApprovalDashboard.tsx'), 'utf8');

function routeSource(method: string, routePath: string): string {
  const start = serverSrc.indexOf(`\napp.${method}('${routePath}'`);
  expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 2);
  return serverSrc.slice(start + 1, end === -1 ? undefined : end);
}

const code = (src: string) => src.replace(/\/\/.*$/gm, '');

describe('void, remind and extend-expiry use the verified login, not a typed email', () => {
  it.each(['void', 'remind', 'extend-expiry'])('%s ignores actor_email and user_email in the body', (action) => {
    const route = code(routeSource('post', `/api/esign/documents/:id/${action}`));
    expect(route).not.toMatch(/req\.body\??\.(actor_email|user_email)/);
    expect(route).toMatch(/const actorEmail = (String\()?user\.email/);
  });
});

describe('POST /api/esign/documents/:id/recipients', () => {
  const route = code(routeSource('post', '/api/esign/documents/:id/recipients'));

  it('checks creator-or-admin before reading or changing recipients', () => {
    const checkAt = route.indexOf('callerMaySeeRecipientTokens(');
    expect(checkAt).toBeGreaterThan(-1);
    expect(route.indexOf('req.body')).toBeGreaterThan(checkAt);
    expect(route.indexOf("collection('esign_recipients')")).toBeGreaterThan(checkAt);
  });

  it('passes the verified user, never a body value, to the rule', () => {
    expect(route).toMatch(/callerMaySeeRecipientTokens\(\{ doc, user, isApprovalAdmin \}\)/);
  });
});

describe('POST /api/approval-workflows/:workflowId/reset-esign', () => {
  const route = code(routeSource('post', '/api/approval-workflows/:workflowId/reset-esign'));

  it('checks requester-or-admin before anything is deleted', () => {
    const checkAt = route.indexOf('mayManageApprovalWorkflow(');
    expect(checkAt).toBeGreaterThan(-1);
    expect(route.indexOf('deleteMany(')).toBeGreaterThan(checkAt);
    expect(route.indexOf('deleteOne(')).toBeGreaterThan(checkAt);
  });

  it('also requires the caller to own the linked e-sign document before deleting it', () => {
    const ownerCheckAt = route.indexOf('esignActorIsDocumentCreator(esignDoc, user.email)');
    expect(ownerCheckAt).toBeGreaterThan(-1);
    expect(route.indexOf('deleteMany(')).toBeGreaterThan(ownerCheckAt);
  });

  it('answers a non-admin the same way for a missing workflow (403 before 404)', () => {
    expect(route.indexOf("status(404)")).toBeGreaterThan(route.indexOf('mayManageApprovalWorkflow('));
  });
});

describe('ApprovalDashboard reset e-sign request', () => {
  it('sends the login and no longer sends a typed actor_email', () => {
    const at = ui.indexOf('/reset-esign`');
    expect(at).toBeGreaterThan(-1);
    const call = ui.slice(at, at + 200);
    expect(call).toContain('headers: getAuthHeaders()');
    expect(call).not.toContain('actor_email');
  });
});
