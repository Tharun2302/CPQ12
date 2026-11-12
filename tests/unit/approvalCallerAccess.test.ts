import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../approval-workflow-access.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import stepGuard from '../../approval-step-guard.cjs';

type Doc = Record<string, unknown>;
type Caller = { ok: boolean; kind?: string; role?: string; user?: Doc; httpStatus?: number; error?: string };
type Verdict = { ok: boolean; httpStatus?: number; code?: string };

const {
  resolveApprovalCaller, checkStepDecisionCaller, checkWorkflowUpdateCaller, canManageWorkflow,
  verifyApprovalPortalToken, PORTAL_ROLES, LINK_ROLES, CLIENT_LINK_ROLE,
} = access as {
  resolveApprovalCaller: (args: unknown) => Promise<Caller>;
  checkStepDecisionCaller: (args: unknown) => Verdict;
  checkWorkflowUpdateCaller: (caller: unknown) => Verdict;
  canManageWorkflow: (workflow: unknown, user: unknown, isAdmin: unknown) => boolean;
  verifyApprovalPortalToken: (db: unknown, query: unknown) => Promise<{ ok: boolean; message?: string }>;
  PORTAL_ROLES: string[];
  LINK_ROLES: string[];
  CLIENT_LINK_ROLE: string;
};
const { stripLockedWorkflowFields, LOCKED_WORKFLOW_FIELDS } = stepGuard as {
  stripLockedWorkflowFields: (body: unknown, opts?: { allow?: string[] }) => { updates: Doc; stripped: string[] };
  LOCKED_WORKFLOW_FIELDS: string[];
};

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

const TOKENS = [
  { workflowId: 'WF-1', role: 'teamlead', token: 'tok-lead', expiresAt: FUTURE },
  { workflowId: 'WF-1', role: 'client', token: 'tok-client', expiresAt: FUTURE },
  { workflowId: 'WF-1', role: 'legal', token: 'tok-old', expiresAt: PAST },
  { workflowId: 'WF-2', role: 'legal', token: 'tok-other', expiresAt: FUTURE },
];

const db = {
  collection: (name: string) => {
    if (name !== 'approval_access_tokens') throw new Error(`unexpected collection ${name}`);
    return {
      findOne: async (q: Doc) =>
        TOKENS.find((t) => t.workflowId === q.workflowId && t.role === q.role && t.token === q.token) ?? null,
    };
  },
};

function workflow(statuses: string[], extra: Doc = {}) {
  const roles = ['Team Approval', 'Technical Team', 'Legal Team', 'Deal Desk'];
  return {
    id: 'WF-1', status: 'in_progress', currentStep: 1, creatorEmail: 'owner@x.com',
    workflowSteps: statuses.map((status, i) => ({ step: i + 1, role: roles[i], email: `${i}@x.com`, status })),
    ...extra,
  };
}

const STAFF: Caller = { ok: true, kind: 'staff', user: { email: 'rep@x.com' } };
const link = (role: string): Caller => ({ ok: true, kind: 'link', role });

describe('resolveApprovalCaller', () => {
  it('refuses a caller with no login and no link token', async () => {
    const caller = await resolveApprovalCaller({ db, user: null, query: {}, workflowId: 'WF-1' });
    expect(caller).toEqual({ ok: false, httpStatus: 401, error: 'Authentication required' });
  });

  it('accepts a verified staff login without looking at the query', async () => {
    const user = { email: 'rep@x.com' };
    const caller = await resolveApprovalCaller({ db, user, query: { role: 'legal', token: 'nope' }, workflowId: 'WF-1' });
    expect(caller).toEqual({ ok: true, kind: 'staff', user });
  });

  it('accepts a valid link token for that workflow and reports its role', async () => {
    const caller = await resolveApprovalCaller({ db, user: null, query: { role: 'teamlead', token: 'tok-lead' }, workflowId: 'WF-1' });
    expect(caller).toEqual({ ok: true, kind: 'link', role: 'teamlead' });
  });

  it('accepts the read-only client link role', async () => {
    const caller = await resolveApprovalCaller({ db, user: null, query: { role: 'client', token: 'tok-client' }, workflowId: 'WF-1' });
    expect(caller).toEqual({ ok: true, kind: 'link', role: 'client' });
  });

  it('refuses a token that belongs to another workflow, even when the query names that workflow', async () => {
    const query = { workflowId: 'WF-2', role: 'legal', token: 'tok-other' };
    const caller = await resolveApprovalCaller({ db, user: null, query, workflowId: 'WF-1' });
    expect(caller.ok).toBe(false);
    expect(caller.httpStatus).toBe(401);
  });

  it('refuses expired, wrong-role and unknown tokens', async () => {
    for (const query of [
      { role: 'legal', token: 'tok-old' },
      { role: 'legal', token: 'tok-lead' },
      { role: 'teamlead', token: 'guess' },
      { role: 'admin', token: 'tok-lead' },
    ]) {
      const caller = await resolveApprovalCaller({ db, user: null, query, workflowId: 'WF-1' });
      expect(caller.ok, JSON.stringify(query)).toBe(false);
    }
  });
});

describe('client link role stays out of the approver portals', () => {
  it('is a link role but not a portal role', () => {
    expect(CLIENT_LINK_ROLE).toBe('client');
    expect(LINK_ROLES).toContain('client');
    expect(PORTAL_ROLES).toEqual(['teamlead', 'technical', 'legal']);
  });

  it('does not pass the verify-access / list token check', async () => {
    const result = await verifyApprovalPortalToken(db, { workflowId: 'WF-1', role: 'client', token: 'tok-client' });
    expect(result).toEqual({ ok: false, message: 'Invalid role' });
  });
});

describe('checkStepDecisionCaller', () => {
  const fresh = workflow(['pending', 'pending', 'pending', 'pending']);
  const approve = { status: 'approved' };

  it('lets staff act on any step', () => {
    for (const stepNumber of [1, 2, 3, 4]) {
      expect(checkStepDecisionCaller({ caller: STAFF, workflow: fresh, stepNumber, updates: approve })).toEqual({ ok: true });
    }
  });

  it('lets each link role act only on its own step', () => {
    const own: Array<[string, number]> = [['teamlead', 1], ['technical', 2], ['legal', 3]];
    for (const [role, ownStep] of own) {
      for (const stepNumber of [1, 2, 3]) {
        const verdict = checkStepDecisionCaller({ caller: link(role), workflow: fresh, stepNumber, updates: approve });
        expect(verdict.ok, `${role} on step ${stepNumber}`).toBe(stepNumber === ownStep);
        if (stepNumber !== ownStep) expect(verdict).toMatchObject({ httpStatus: 403, code: 'NOT_YOUR_STEP' });
      }
    }
  });

  it('never lets a client link decide or comment on a step', () => {
    for (const stepNumber of [1, 2, 3, 4]) {
      const verdict = checkStepDecisionCaller({ caller: link('client'), workflow: fresh, stepNumber, updates: approve });
      expect(verdict).toMatchObject({ ok: false, httpStatus: 403 });
    }
    const comment = checkStepDecisionCaller({ caller: link('client'), workflow: fresh, stepNumber: 1, updates: { comments: 'hi' } });
    expect(comment.ok).toBe(false);
  });

  it('lets the Team Lead link skip Technical only on a stored overage deal it has approved', () => {
    const overage = workflow(['approved', 'pending', 'pending'], { isOverage: true, currentStep: 2 });
    const args = { caller: link('teamlead'), stepNumber: 2 };
    expect(checkStepDecisionCaller({ ...args, workflow: overage, updates: approve }).ok).toBe(true);
    expect(checkStepDecisionCaller({ ...args, workflow: overage, updates: { status: 'denied' } }).ok).toBe(false);
    expect(checkStepDecisionCaller({ ...args, workflow: { ...overage, isOverage: false }, updates: approve }).ok).toBe(false);
    const teamPending = workflow(['pending', 'pending', 'pending'], { isOverage: true });
    expect(checkStepDecisionCaller({ ...args, workflow: teamPending, updates: approve }).ok).toBe(false);
  });

  it('lets the Legal link mark Deal Desk notified but not deny it', () => {
    const done = workflow(['approved', 'approved', 'approved', 'pending'], { status: 'approved', currentStep: 4 });
    const args = { workflow: done, stepNumber: 4 };
    expect(checkStepDecisionCaller({ ...args, caller: link('legal'), updates: { status: 'approved', comments: 'Notified' } }).ok).toBe(true);
    expect(checkStepDecisionCaller({ ...args, caller: link('legal'), updates: { status: 'denied' } }).ok).toBe(false);
    expect(checkStepDecisionCaller({ ...args, caller: link('teamlead'), updates: approve }).ok).toBe(false);
    expect(checkStepDecisionCaller({ ...args, caller: link('technical'), updates: approve }).ok).toBe(false);
  });

  it('leaves a missing step to the step guard and refuses an unresolved caller', () => {
    expect(checkStepDecisionCaller({ caller: link('legal'), workflow: fresh, stepNumber: 9, updates: approve })).toEqual({ ok: true });
    expect(checkStepDecisionCaller({ caller: null, workflow: fresh, stepNumber: 1, updates: approve }).ok).toBe(false);
    expect(checkStepDecisionCaller({ caller: { ok: false }, workflow: fresh, stepNumber: 1, updates: approve }).ok).toBe(false);
  });
});

describe('checkWorkflowUpdateCaller', () => {
  it('allows staff and refuses every link role', () => {
    expect(checkWorkflowUpdateCaller(STAFF)).toEqual({ ok: true });
    for (const role of LINK_ROLES) {
      expect(checkWorkflowUpdateCaller(link(role))).toMatchObject({ ok: false, httpStatus: 403 });
    }
    expect(checkWorkflowUpdateCaller(null).ok).toBe(false);
  });
});

describe('canManageWorkflow', () => {
  const wf = workflow(['pending', 'pending', 'pending']);

  it('allows the creator, an assigned approver and an admin; refuses other staff and no login', () => {
    expect(canManageWorkflow(wf, { email: 'OWNER@x.com' }, false)).toBe(true);
    expect(canManageWorkflow(wf, { email: '1@x.com' }, false)).toBe(true);
    expect(canManageWorkflow(wf, { email: 'boss@x.com' }, true)).toBe(true);
    expect(canManageWorkflow(wf, { email: 'stranger@x.com' }, false)).toBe(false);
    expect(canManageWorkflow(wf, null, true)).toBe(false);
  });
});

describe('locked workflow fields', () => {
  it('locks isOverage and esignDocumentId on the generic update', () => {
    expect(LOCKED_WORKFLOW_FIELDS).toEqual(expect.arrayContaining(['isOverage', 'esignDocumentId']));
    const { updates, stripped } = stripLockedWorkflowFields({ isOverage: true, esignDocumentId: 'abc', clientName: 'Acme' });
    expect(updates).toEqual({ clientName: 'Acme' });
    expect(stripped).toEqual(['isOverage', 'esignDocumentId']);
  });

  it('keeps them at creation, where the route allows them', () => {
    const { updates } = stripLockedWorkflowFields(
      { isOverage: true, esignDocumentId: 'abc', creatorEmail: 'x@x.com' },
      { allow: ['documentId', 'isOverage', 'esignDocumentId'] },
    );
    expect(updates).toEqual({ isOverage: true, esignDocumentId: 'abc' });
  });
});

describe('server.cjs wiring', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');

  function routeSource(method: string, routePath: string): string {
    const escaped = routePath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const start = serverSrc.search(new RegExp(`\\napp\\.${method}\\(\\s*['"]${escaped}['"]\\s*,`));
    expect(start, `route not found: ${method.toUpperCase()} ${routePath}`).toBeGreaterThan(-1);
    const end = serverSrc.indexOf('\napp.', start + 2);
    return serverSrc.slice(start + 1, end === -1 ? undefined : end).replace(/\/\/.*$/gm, '');
  }

  function functionSource(name: string): string {
    const start = serverSrc.search(new RegExp(`\\n(async )?function ${name}\\(`));
    expect(start, `function not found: ${name}`).toBeGreaterThan(-1);
    return serverSrc.slice(start, serverSrc.indexOf('\n}\n', start));
  }

  const CALLER_ROUTES: Array<{ method: string; path: string; id: string }> = [
    { method: 'get', path: '/api/approval-workflows/:id', id: 'id' },
    { method: 'get', path: '/api/approval-workflows/:workflowId/document', id: 'workflowId' },
    { method: 'put', path: '/api/approval-workflows/:id', id: 'id' },
    { method: 'put', path: '/api/approval-workflows/:id/step/:stepNumber', id: 'id' },
  ];

  it.each(CALLER_ROUTES)('$method $path asks for an approval caller before reading the workflow', ({ method, path: routePath, id }) => {
    const route = routeSource(method, routePath);
    const call = `const caller = await requireApprovalCaller(req, res, ${id});`;
    expect(route).toContain(call);
    expect(route).toMatch(/requireApprovalCaller\([^)]*\);\s*if \(!caller\) return;/);
    const firstRead = route.search(/\.findOne\(|\.updateOne\(/);
    expect(firstRead).toBeGreaterThan(route.indexOf(call));
  });

  it('requireApprovalCaller takes the login from the JWT, the workflow id from the route, and answers 401 itself', () => {
    const fn = functionSource('requireApprovalCaller');
    expect(fn).toContain('getOptionalAuthenticatedUser(req)');
    expect(fn).toContain('resolveApprovalCaller({ db, user, query: req.query, workflowId })');
    expect(fn).toContain('res.status(caller.httpStatus)');
    expect(fn).not.toContain('req.body');
  });

  it('the generic update is refused for link callers before anything is written', () => {
    const route = routeSource('put', '/api/approval-workflows/:id');
    const check = route.indexOf('checkWorkflowUpdateCaller(caller)');
    expect(check).toBeGreaterThan(-1);
    expect(route).toMatch(/if \(!mayUpdate\.ok\) \{\s*return res\.status\(mayUpdate\.httpStatus\)/);
    expect(route.indexOf('.updateOne(')).toBeGreaterThan(check);
  });

  it('the step route checks the link role before the write and records the staff login as actedBy', () => {
    const route = routeSource('put', '/api/approval-workflows/:id/step/:stepNumber');
    const check = route.indexOf('checkStepDecisionCaller({ caller, workflow,');
    expect(check).toBeGreaterThan(-1);
    expect(route).toMatch(/if \(!mayDecide\.ok\) \{[\s\S]{0,200}return res\.status\(mayDecide\.httpStatus\)/);
    expect(route.indexOf('applyStepUpdate(')).toBeGreaterThan(check);
    expect(route).toMatch(/caller\.kind === 'staff' && stepUpdates\.status\) \{\s*stepUpdates\.actedBy = \{ name: caller\.user\.name \|\| caller\.user\.email, email: caller\.user\.email \}/);
    expect(route).not.toMatch(/actedBy\s*=\s*req\.body/);
  });

  it('creating a workflow needs a login and takes the creator from it', () => {
    const route = routeSource('post', '/api/approval-workflows');
    expect(route).toMatch(/const actor = await getAuthenticatedUser\(req, res\);\s*if \(!actor\) return;/);
    expect(route.indexOf('getAuthenticatedUser(req, res)')).toBeLessThan(route.indexOf('.insertOne('));
    expect(route).toContain('const creatorEmail = normalizeEmail(actor.email);');
    expect(route).not.toContain('req.body?.creatorEmail');
    expect(route).not.toContain('getOptionalAuthenticatedUser');
  });

  it('a new workflow keeps esignDocumentId only for the agreement creator or an admin', () => {
    const route = routeSource('post', '/api/approval-workflows');
    expect(route).toMatch(/!\(await actorMayLinkEsignDocument\(workflowData\.esignDocumentId, actor\)\)\) \{[\s\S]{0,200}delete workflowData\.esignDocumentId;/);
    const fn = functionSource('actorMayLinkEsignDocument');
    expect(fn).toContain('ObjectId.isValid(esignDocumentId)');
    expect(fn).toContain('esignActorIsDocumentCreator(esignDoc, actor.email)');
    expect(fn).toContain('hasApprovalAdminAccess(actor)');
  });

  const MANAGE_ROUTES = [
    { method: 'post', path: '/api/approval-workflows/:workflowId/remind' },
    { method: 'get', path: '/api/approval-workflows/:workflowId/portal-link' },
  ];

  it.each(MANAGE_ROUTES)('$method $path needs a login that may see the workflow', ({ method, path: routePath }) => {
    const route = routeSource(method, routePath);
    const auth = route.search(/const authUser = await getAuthenticatedUser\(req, res\);\s*if \(!authUser\) return;/);
    expect(auth).toBeGreaterThan(-1);
    expect(route.indexOf('.findOne(')).toBeGreaterThan(auth);
    const allowed = route.indexOf('canManageWorkflow(workflow, authUser, await hasApprovalAdminAccess(authUser))');
    expect(allowed).toBeGreaterThan(-1);
    const sideEffect = route.search(/createApprovalAccessToken\(|buildCurrentApproverEmail\(|sendEmail\(|\.updateOne\(/);
    expect(sideEffect).toBeGreaterThan(allowed);
  });

  it('verify-access still accepts only the approver roles', () => {
    const route = routeSource('get', '/api/approval-workflows/verify-access');
    expect(route).toContain('verifyApprovalPortalToken(db, req.query)');
  });

  it('the client email link and the completion download link carry a client link token', () => {
    const mint = functionSource('createClientLinkQuery');
    expect(mint).toContain('createApprovalAccessToken(db, String(workflowId), CLIENT_LINK_ROLE)');
    expect(functionSource('generateClientEmailHTML')).toContain(
      "/client-notification?workflow=${encodeURIComponent(workflowData.workflowId)}${linkQuery ? `&${linkQuery}` : ''}",
    );
    expect(functionSource('generateDealDeskEmailHTML')).toContain("/document${linkQuery ? `?${linkQuery}` : ''}");
    expect(serverSrc.match(/generateClientEmailHTML\(workflowData, await createClientLinkQuery\(/g)).toHaveLength(2);
    expect(serverSrc).toMatch(/generateDealDeskEmailHTML\(workflowData, await createClientLinkQuery\(/);
    expect(serverSrc).not.toMatch(/generate(Client|DealDesk)EmailHTML\(workflowData\)/);
  });
});
