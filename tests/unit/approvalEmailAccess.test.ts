import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import emailAccess from '../../approval-email-access.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import sendGuard from '../../esign-send-guard.cjs';

// Approval emails carry a portal link and the agreement PDF, and the completion email also
// sends the agreement for signature. These rules decide who may trigger each one, who receives
// it and which workflow's details it shows.

type Doc = Record<string, unknown>;
type Verdict = { ok: boolean; httpStatus?: number; code?: string };

const { checkApprovalEmailTrigger, resolveApprovalEmailRecipient, buildApprovalEmailData } = emailAccess as {
  checkApprovalEmailTrigger: (args: unknown) => Verdict;
  resolveApprovalEmailRecipient: (args: unknown) => string;
  buildApprovalEmailData: (args: unknown) => Doc;
};
const { esignSendRefusal } = sendGuard as { esignSendRefusal: (doc: unknown) => string | null };

const STAFF = { ok: true, kind: 'staff', user: { email: 'rep@cloudfuze.com' } };
const link = (role: string) => ({ ok: true, kind: 'link', role });

function workflow(statuses: { team?: string; technical?: string; legal?: string }, extra: Doc = {}): Doc {
  return {
    id: 'WF-1',
    documentId: 'DOC-1',
    clientName: 'Stored Client',
    amount: 1200,
    creatorEmail: 'rep@cloudfuze.com',
    creatorName: 'Rep',
    workflowSteps: [
      { step: 1, role: 'Team Approval', email: 'lead@cloudfuze.com', group: 'smb', status: statuses.team ?? 'pending' },
      { step: 2, role: 'Technical Team', email: 'tech@cloudfuze.com', status: statuses.technical ?? 'pending' },
      { step: 3, role: 'Legal Team', email: 'legal@cloudfuze.com', status: statuses.legal ?? 'pending' },
    ],
    ...extra,
  };
}

const allowed = (kind: string, caller: unknown, wf: Doc) => checkApprovalEmailTrigger({ kind, caller, workflow: wf });

describe('checkApprovalEmailTrigger — who may send which approval email', () => {
  it('lets signed-in staff send every step email', () => {
    const wf = workflow({});
    for (const kind of ['team', 'technical', 'legal', 'client', 'legacyAll']) {
      expect(allowed(kind, STAFF, wf).ok, kind).toBe(true);
    }
  });

  it('refuses a caller with no proof of access, an unknown email kind and a missing workflow', () => {
    expect(allowed('technical', { ok: false }, workflow({ team: 'approved' }))).toMatchObject({ ok: false, httpStatus: 403 });
    expect(allowed('technical', null, workflow({ team: 'approved' })).ok).toBe(false);
    expect(allowed('everything', STAFF, workflow({})).ok).toBe(false);
    expect(checkApprovalEmailTrigger({ kind: 'technical', caller: STAFF, workflow: null }).ok).toBe(false);
  });

  it('lets the Team Lead link notify Technical only after the Team Lead step is approved', () => {
    expect(allowed('technical', link('teamlead'), workflow({ team: 'approved' })).ok).toBe(true);
    expect(allowed('technical', link('teamlead'), workflow({ team: 'pending' }))).toMatchObject({ ok: false, httpStatus: 403 });
    expect(allowed('technical', link('teamlead'), workflow({ team: 'denied' })).ok).toBe(false);
  });

  it('stops a link from re-sending an email for a step that is already decided', () => {
    expect(allowed('technical', link('teamlead'), workflow({ team: 'approved', technical: 'approved' })).ok).toBe(false);
    expect(allowed('legal', link('technical'), workflow({ team: 'approved', technical: 'approved', legal: 'denied' })).ok).toBe(false);
  });

  it('lets the Technical link notify Legal only after the Technical step is approved', () => {
    expect(allowed('legal', link('technical'), workflow({ team: 'approved', technical: 'approved' })).ok).toBe(true);
    expect(allowed('legal', link('technical'), workflow({ team: 'approved' })).ok).toBe(false);
  });

  it('lets the Team Lead link notify Legal only on an overage deal', () => {
    const steps = { team: 'approved', technical: 'approved' };
    expect(allowed('legal', link('teamlead'), workflow(steps, { isOverage: true })).ok).toBe(true);
    expect(allowed('legal', link('teamlead'), workflow(steps)).ok).toBe(false);
    expect(allowed('legal', link('teamlead'), workflow(steps, { isOverage: 'true' })).ok).toBe(false);
  });

  it('refuses every link the emails no portal sends', () => {
    const wf = workflow({ team: 'approved', technical: 'approved', legal: 'approved' }, { isOverage: true });
    for (const role of ['teamlead', 'technical', 'legal', 'client']) {
      for (const kind of ['team', 'client', 'legacyAll']) {
        expect(allowed(kind, link(role), wf), `${role} -> ${kind}`).toMatchObject({ ok: false, httpStatus: 403 });
      }
    }
    const open = workflow({ team: 'approved', technical: 'approved' });
    expect(allowed('technical', link('technical'), workflow({ team: 'approved' })).ok).toBe(false);
    expect(allowed('technical', link('legal'), workflow({ team: 'approved' })).ok).toBe(false);
    expect(allowed('technical', link('client'), workflow({ team: 'approved' })).ok).toBe(false);
    expect(allowed('legal', link('legal'), open).ok).toBe(false);
    expect(allowed('legal', link('client'), open).ok).toBe(false);
  });
});

describe('checkApprovalEmailTrigger — completion email (sends the agreement for signature)', () => {
  const approved = workflow({ team: 'approved', technical: 'approved', legal: 'approved' });

  it('is allowed for staff, the Legal link and the client link once every step is approved', () => {
    for (const caller of [STAFF, link('legal'), link('client')]) {
      expect(allowed('dealDesk', caller, approved).ok).toBe(true);
    }
  });

  it('is refused for everyone, staff included, while any approval step is not approved', () => {
    const cases = [workflow({}), workflow({ team: 'approved', technical: 'approved' }), workflow({ team: 'approved', technical: 'approved', legal: 'denied' })];
    for (const wf of cases) {
      for (const caller of [STAFF, link('legal'), link('client')]) {
        expect(allowed('dealDesk', caller, wf)).toMatchObject({ ok: false, httpStatus: 409, code: 'APPROVAL_NOT_COMPLETE' });
      }
    }
  });

  it('is refused for the Team Lead and Technical links even when everything is approved', () => {
    expect(allowed('dealDesk', link('teamlead'), approved)).toMatchObject({ ok: false, httpStatus: 403 });
    expect(allowed('dealDesk', link('technical'), approved)).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('accepts a manual workflow that has no Team Lead step', () => {
    const manual = workflow({ technical: 'approved', legal: 'approved' });
    manual.workflowSteps = (manual.workflowSteps as Doc[]).filter((s) => s.role !== 'Team Approval');
    expect(allowed('dealDesk', link('legal'), manual).ok).toBe(true);
  });
});

describe('resolveApprovalEmailRecipient — a link never chooses where the email goes', () => {
  const wf = workflow({ team: 'approved' });
  const env = { TECHNICAL_TEAM_EMAIL: 'tech-team@cloudfuze.com', LEGAL_TEAM_EMAIL: 'legal-team@cloudfuze.com' };

  it('ignores the address a link caller sends and uses the stored approver of the notified step', () => {
    expect(resolveApprovalEmailRecipient({ kind: 'technical', caller: link('teamlead'), workflow: wf, requested: 'attacker@evil.test', env }))
      .toBe('tech@cloudfuze.com');
    expect(resolveApprovalEmailRecipient({ kind: 'legal', caller: link('technical'), workflow: wf, requested: 'attacker@evil.test', env }))
      .toBe('legal@cloudfuze.com');
  });

  it('falls back to the configured team address, then the built-in one, when the step has no email', () => {
    const noEmails = workflow({ team: 'approved' });
    (noEmails.workflowSteps as Doc[]).forEach((s) => { delete s.email; });
    const args = { kind: 'technical', caller: link('teamlead'), workflow: noEmails, requested: 'attacker@evil.test' };
    expect(resolveApprovalEmailRecipient({ ...args, env })).toBe('tech-team@cloudfuze.com');
    expect(resolveApprovalEmailRecipient({ ...args, env: {} })).toBe('cpq.zenop.ai.technical@cloudfuze.com');
  });

  it('never returns a body address for a link, even for an email kind with no stored step', () => {
    expect(resolveApprovalEmailRecipient({ kind: 'client', caller: link('client'), workflow: wf, requested: 'attacker@evil.test', env })).toBe('');
    expect(resolveApprovalEmailRecipient({ kind: 'technical', caller: null, workflow: wf, requested: 'attacker@evil.test', env })).toBe('tech@cloudfuze.com');
  });

  it('keeps letting staff name the approver, with the configured address as the default', () => {
    expect(resolveApprovalEmailRecipient({ kind: 'team', caller: STAFF, workflow: wf, requested: ' picked@cloudfuze.com ', env })).toBe('picked@cloudfuze.com');
    expect(resolveApprovalEmailRecipient({ kind: 'technical', caller: STAFF, workflow: wf, requested: '', env })).toBe('tech-team@cloudfuze.com');
    expect(resolveApprovalEmailRecipient({ kind: 'technical', caller: STAFF, workflow: wf, requested: { $ne: null }, env })).toBe('tech-team@cloudfuze.com');
  });
});

describe('buildApprovalEmailData — the email is about the stored workflow', () => {
  const wf = workflow({ team: 'approved' }, { companyName: 'Stored Co', hasCustomLineItems: true });
  const forged = { workflowId: 'WF-OTHER', documentId: 'DOC-OTHER', clientName: '<b>Forged</b>', amount: 1, requestedByName: 'CEO', teamGroup: 'x' };

  it('uses only stored details for a link caller', () => {
    expect(buildApprovalEmailData({ caller: link('teamlead'), workflow: wf, bodyData: forged })).toEqual({
      workflowId: 'WF-1',
      documentId: 'DOC-1',
      documentType: undefined,
      clientName: 'Stored Client',
      companyName: 'Stored Co',
      amount: 1200,
      hasCustomLineItems: true,
      teamGroup: 'smb',
      creatorEmail: 'rep@cloudfuze.com',
      requestedByName: 'Rep',
    });
  });

  it('keeps what staff sent but pins the workflow id and document id to the stored workflow', () => {
    const data = buildApprovalEmailData({ caller: STAFF, workflow: wf, bodyData: forged });
    expect(data).toMatchObject({ workflowId: 'WF-1', documentId: 'DOC-1', clientName: '<b>Forged</b>', requestedByName: 'CEO' });
  });

  it('survives a missing or non-object body', () => {
    expect(buildApprovalEmailData({ caller: STAFF, workflow: wf, bodyData: undefined })).toEqual({ workflowId: 'WF-1', documentId: 'DOC-1' });
    expect(buildApprovalEmailData({ caller: STAFF, workflow: wf, bodyData: 'x' })).toEqual({ workflowId: 'WF-1', documentId: 'DOC-1' });
  });
});

describe('esignSendRefusal — a finished agreement is never sent again', () => {
  it('refuses completed and voided documents', () => {
    expect(esignSendRefusal({ status: 'completed' })).toMatch(/already signed/);
    expect(esignSendRefusal({ status: 'voided' })).toMatch(/voided/);
    expect(esignSendRefusal({ status: ' Completed ' })).toMatch(/already signed/);
  });

  it('allows drafts and leaves an already sent document to the existing no-op', () => {
    expect(esignSendRefusal({ status: 'draft' })).toBeNull();
    expect(esignSendRefusal({ status: 'sent' })).toBeNull();
    expect(esignSendRefusal({})).toBeNull();
    expect(esignSendRefusal({ status: 'constructor' })).toBeNull();
  });
});

describe('server.cjs wiring', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

  function between(startMarker: string, endMarker: string): string {
    const start = serverSrc.indexOf(startMarker);
    expect(start, `not found: ${startMarker}`).toBeGreaterThan(-1);
    const end = serverSrc.indexOf(endMarker, start + startMarker.length);
    return serverSrc.slice(start, end === -1 ? undefined : end);
  }
  const route = (routePath: string) => between(`\napp.post('${routePath}',`, '\napp.');

  const ROUTES: Array<[string, string]> = [
    ['/api/send-manager-email', "resolveApprovalEmailRequest(req, res, 'technical', 'managerEmail')"],
    ['/api/send-team-email', "resolveApprovalEmailRequest(req, res, 'team', 'teamEmail')"],
    ['/api/send-ceo-email', "resolveApprovalEmailRequest(req, res, 'legal', 'ceoEmail')"],
    ['/api/send-client-email', "resolveApprovalEmailRequest(req, res, 'client', 'clientEmail')"],
    ['/api/send-deal-desk-email', "resolveApprovalEmailRequest(req, res, 'dealDesk')"],
    ['/api/send-approval-emails', "resolveApprovalEmailRequest(req, res, 'legacyAll')"],
  ];

  it.each(ROUTES)('%s goes through the approval-email gate before doing anything else', (routePath, call) => {
    const src = route(routePath);
    const gate = src.indexOf(`const emailRequest = await ${call};`);
    expect(gate).toBeGreaterThan(-1);
    expect(src.slice(gate)).toMatch(/^[^\n]*\r?\n\s*if \(!emailRequest\) return;/);
    for (const effect of ['createApprovalAccessToken(', 'sendEmail(', 'sendDocumentForSignatureInternal(', 'createClientLinkQuery(']) {
      const at = src.indexOf(effect);
      if (at !== -1) expect(at, effect).toBeGreaterThan(gate);
    }
  });

  it.each(ROUTES)('%s never looks a document up by an id from the request', (routePath) => {
    const src = route(routePath);
    expect(src).not.toMatch(/collection\('documents'\)/);
    expect(src).not.toMatch(/workflowData\s*\}\s*=\s*req\.body/);
  });

  it('the gate checks proof of access for the body workflow, loads it and applies the trigger rule', () => {
    const gate = between('async function resolveApprovalEmailRequest(', '// Create approval workflow');
    expect(gate).toMatch(/typeof workflowId !== 'string'/);
    const order = [
      'await requireApprovalCaller(req, res, workflowId)',
      "collection('approval_workflows').findOne({ id: workflowId })",
      'checkApprovalEmailTrigger({ kind, caller, workflow })',
      'buildApprovalEmailData({ caller, workflow, bodyData: body.workflowData })',
      'loadDocumentPdfAttachment(workflow.documentId)',
    ].map((needle) => gate.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('the completion route sends the stored workflow\'s own e-sign document', () => {
    const src = route('/api/send-deal-desk-email');
    expect(src).toContain('const esignId = storedWorkflow.esignDocumentId;');
    expect(src).toContain('const creatorEmailForNotification = storedWorkflow.creatorEmail || null;');
  });

  it('sendDocumentForSignatureInternal refuses before it touches any recipient', () => {
    const src = between('async function sendDocumentForSignatureInternal(', "await logAudit(docId, 'sent', uploadedBy, null);");
    const guard = src.indexOf('const sendRefusal = esignSendRefusal(doc);');
    expect(guard).toBeGreaterThan(-1);
    expect(src).toContain('if (sendRefusal) return { success: false, error: sendRefusal, not_sendable: true };');
    expect(src.indexOf("collection('esign_recipients')")).toBeGreaterThan(guard);
  });

  it('POST /api/email/test is for approval admins only', () => {
    const src = route('/api/email/test');
    const check = src.indexOf('await getApprovalAdminUser(req, res,');
    expect(check).toBeGreaterThan(-1);
    expect(src.indexOf('sendEmail(')).toBeGreaterThan(check);
  });
});

describe('frontend callers send the login and the emailed link', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

  function callWindow(file: string, routePath: string): string[] {
    const src = read(file);
    const windows: string[] = [];
    let at = src.indexOf(routePath);
    while (at !== -1) {
      windows.push(src.slice(src.lastIndexOf('fetch(', at), src.indexOf('body:', at)));
      at = src.indexOf(routePath, at + 1);
    }
    expect(windows.length, `${file} does not call ${routePath}`).toBeGreaterThan(0);
    return windows;
  }

  const PORTAL: Array<[string, string]> = [
    ['src/components/TeamApprovalDashboard.tsx', '/api/send-manager-email'],
    ['src/components/TeamApprovalDashboard.tsx', '/api/send-ceo-email'],
    ['src/components/TechnicalTeamApprovalDashboard.tsx', '/api/send-ceo-email'],
    ['src/components/LegalTeamApprovalDashboard.tsx', '/api/send-deal-desk-email'],
    ['src/components/ClientNotification.tsx', '/api/send-deal-desk-email'],
  ];
  const STAFF_ONLY: Array<[string, string]> = [
    ['src/components/ApprovalWorkflow.tsx', '/api/send-team-email'],
    ['src/components/QuoteGenerator.tsx', '/api/send-team-email'],
    ['src/pages/EsignPlaceFieldsPage.tsx', '/api/send-team-email'],
    ['src/components/InfrateamDashboard.tsx', '/api/send-manager-email'],
  ];

  it.each(PORTAL)('%s -> %s sends the login header and the link parameters', (file, routePath) => {
    for (const win of callWindow(file, routePath)) {
      expect(win).toMatch(/fetch\(withApprovalPortalQuery\(/);
      expect(win).toMatch(/\.\.\.getAuthHeaders\(\)/);
    }
  });

  it.each(STAFF_ONLY)('%s -> %s sends the login header', (file, routePath) => {
    expect(read(file)).toMatch(/import \{[^}]*getAuthHeaders[^}]*\} from/);
    for (const win of callWindow(file, routePath)) expect(win).toMatch(/\.\.\.getAuthHeaders\(\)/);
  });
});
