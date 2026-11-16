import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import redline from '../../onlyoffice-redline.cjs';
import { authAwareError, getAuthHeaders, hasUsableAuthToken } from '../../src/utils/authUtils';
import { redlineSaveMessage } from '../../src/utils/redlineSaveMessage';

// "Edit for RedLine" during an active approval overwrites the agreement the remaining approvers
// review. That is only safe if the requester alone can do it, the edit can't land on an approval
// that finished meanwhile, the replaced version is kept, and approvals already given stay intact.

type Decision = { ok: boolean; httpStatus?: number; error?: string; adminOverride?: boolean };
const {
  actorIsWorkflowCreator, redlineNeedsAuth, redlineSaveDecision, saveRedlineOverDocument,
  redlineStartWithoutApprovalDecision, redlineAccessDecision,
} = redline as {
  actorIsWorkflowCreator: (workflow: unknown, actor: unknown) => boolean;
  redlineNeedsAuth: (session: unknown, linkedWorkflows: unknown[]) => boolean;
  redlineSaveDecision: (args: Record<string, unknown>) => Decision;
  redlineStartWithoutApprovalDecision: (args: Record<string, unknown>) => Decision;
  redlineAccessDecision: (args: Record<string, unknown>) => Decision;
  saveRedlineOverDocument: (db: unknown, args: Record<string, unknown>) => Promise<any>;
};

const REQUESTER = 'anush.dasari@cloudfuze.com';
const OTHER = 'tech.lead@cloudfuze.com';

const ACTIVE_WORKFLOW = {
  id: 'wf-1',
  documentId: 'doc-1',
  status: 'in_progress',
  creatorEmail: REQUESTER,
  workflowSteps: [
    { step: 1, role: 'Team Approval', status: 'approved' },
    { step: 2, role: 'Technical Team', status: 'pending' },
    { step: 3, role: 'Legal Team', status: 'pending' },
  ],
};

type Call = { collection: string; op: string; args: any[] };

function fakeDb(opts: { document?: any; workflow?: any; failBackup?: boolean; updateMatched?: number } = {}) {
  const calls: Call[] = [];
  const db = {
    collection(name: string) {
      const record = (op: string, args: any[]) => calls.push({ collection: name, op, args });
      return {
        findOne: async (...args: any[]) => {
          record('findOne', args);
          if (name === 'documents') return opts.document ?? null;
          if (name === 'approval_workflows') return opts.workflow ?? null;
          return null;
        },
        insertOne: async (...args: any[]) => {
          record('insertOne', args);
          if (opts.failBackup) throw new Error('backup write failed');
          return { acknowledged: true };
        },
        updateOne: async (...args: any[]) => { record('updateOne', args); return { matchedCount: opts.updateMatched ?? 1 }; },
        updateMany: async (...args: any[]) => { record('updateMany', args); return { matchedCount: 1 }; },
      };
    },
  };
  return { db, calls };
}

const ORIGINAL = {
  id: 'doc-1', fileName: 'Agreement.pdf', fileData: Buffer.from('old-pdf'),
  docxFileData: Buffer.from('old-docx'), fileSize: 7,
};
const EDITED_PDF = Buffer.from('new-pdf-bytes');
const EDITED_DOCX = Buffer.from('new-docx');

describe('actorIsWorkflowCreator', () => {
  it('allows the requester, ignoring case and spaces', () => {
    expect(actorIsWorkflowCreator(ACTIVE_WORKFLOW, { email: '  Anush.Dasari@CloudFuze.com ' })).toBe(true);
  });

  it('rejects an approver or any other user', () => {
    expect(actorIsWorkflowCreator(ACTIVE_WORKFLOW, { email: OTHER })).toBe(false);
  });

  it('rejects when either side has no email', () => {
    expect(actorIsWorkflowCreator(ACTIVE_WORKFLOW, {})).toBe(false);
    expect(actorIsWorkflowCreator({ creatorEmail: '' }, { email: REQUESTER })).toBe(false);
    expect(actorIsWorkflowCreator(null, null)).toBe(false);
  });

  it('falls back to createdBy on older workflows', () => {
    expect(actorIsWorkflowCreator({ createdBy: REQUESTER }, { email: REQUESTER })).toBe(true);
  });
});

describe('redlineSaveDecision', () => {
  const openSession = { workflowId: 'wf-1', actorEmail: REQUESTER };

  it('allows the requester who opened the editor under this approval', () => {
    const out = redlineSaveDecision({ session: openSession, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER } });
    expect(out.ok).toBe(true);
  });

  it('rejects anyone who is not the requester (403)', () => {
    const out = redlineSaveDecision({ session: openSession, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: OTHER } });
    expect(out).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('rejects a save by a different user than the one who opened the editor', () => {
    const session = { workflowId: 'wf-1', actorEmail: 'someone.else@cloudfuze.com' };
    const out = redlineSaveDecision({ session, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER } });
    expect(out).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('refuses (409) when the approval finished while the requester was editing', () => {
    const out = redlineSaveDecision({ session: openSession, linkedWorkflows: [], actor: { email: REQUESTER } });
    expect(out).toMatchObject({ ok: false, httpStatus: 409 });
    const finished = { ...ACTIVE_WORKFLOW, status: 'approved' };
    const out2 = redlineSaveDecision({ session: openSession, linkedWorkflows: [finished], actor: { email: REQUESTER } });
    expect(out2).toMatchObject({ ok: false, httpStatus: 409 });
  });

  it('requires the requester when an approval started after the editor was opened', () => {
    const session = { workflowId: null, actorEmail: null };
    expect(redlineSaveDecision({ session, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: OTHER } }).ok).toBe(false);
    expect(redlineSaveDecision({ session, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER } }).ok).toBe(true);
  });

  it('stays requester-only after the approval finished (status flip cannot switch the check off)', () => {
    const session = { workflowId: null, actorEmail: null };
    const approved = { ...ACTIVE_WORKFLOW, status: 'approved' };
    expect(redlineNeedsAuth(session, [approved])).toBe(true);
    expect(redlineSaveDecision({ session, linkedWorkflows: [approved], actor: null }).ok).toBe(false);
    expect(redlineSaveDecision({ session, linkedWorkflows: [approved], actor: { email: OTHER } })).toMatchObject({ ok: false, httpStatus: 403 });
    expect(redlineSaveDecision({ session, linkedWorkflows: [approved], actor: { email: REQUESTER } }).ok).toBe(true);
  });

  it('lets whoever re-sent the document after an earlier approval ended edit it', () => {
    const session = { workflowId: null, actorEmail: null };
    const olderDenied = { ...ACTIVE_WORKFLOW, id: 'wf-old', status: 'denied', creatorEmail: OTHER, createdAt: '2026-09-01T00:00:00Z' };
    const newer = { ...ACTIVE_WORKFLOW, id: 'wf-new', status: 'approved', createdAt: '2026-09-20T00:00:00Z' };
    const linked = [olderDenied, newer];
    expect(redlineSaveDecision({ session, linkedWorkflows: linked, actor: { email: REQUESTER } }).ok).toBe(true);
    expect(redlineSaveDecision({ session, linkedWorkflows: linked, actor: { email: OTHER } }).ok).toBe(false);
  });

  it('ignores approvals created without a verified login (forged rows cannot take over or lock out)', () => {
    const session = { workflowId: null, actorEmail: null };
    const real = { ...ACTIVE_WORKFLOW, status: 'approved', createdAt: '2026-09-01T00:00:00Z' };
    const forged = { ...ACTIVE_WORKFLOW, id: 'wf-forged', creatorEmail: OTHER, creatorVerified: false, createdAt: '2026-09-30T00:00:00Z' };
    const linked = [real, forged];
    expect(redlineSaveDecision({ session, linkedWorkflows: linked, actor: { email: OTHER } })).toMatchObject({ ok: false, httpStatus: 403 });
    expect(redlineSaveDecision({ session, linkedWorkflows: linked, actor: { email: REQUESTER } }).ok).toBe(true);
  });

  it('does not lock everyone out of documents whose old approvals name no requester', () => {
    const session = { workflowId: null, actorEmail: null };
    const legacy = { id: 'wf-legacy', documentId: 'doc-1', status: 'approved' };
    expect(redlineSaveDecision({ session, linkedWorkflows: [legacy], actor: { email: OTHER } }).ok).toBe(true);
    // ...but still needs a login
    expect(redlineSaveDecision({ session, linkedWorkflows: [legacy], actor: null })).toMatchObject({ ok: false, httpStatus: 401 });
  });

  it('requires the caller to be the requester of every active approval on the document', () => {
    const second = { ...ACTIVE_WORKFLOW, id: 'wf-2', creatorEmail: OTHER };
    const out = redlineSaveDecision({ session: openSession, linkedWorkflows: [ACTIVE_WORKFLOW, second], actor: { email: REQUESTER } });
    expect(out).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('keeps the unauthenticated path for documents with no approval, as before', () => {
    const session = { workflowId: null, actorEmail: null };
    expect(redlineNeedsAuth(session, [])).toBe(false);
    expect(redlineSaveDecision({ session, linkedWorkflows: [], actor: null }).ok).toBe(true);
  });

  it('needs auth whenever an approval is involved, now or when the editor opened', () => {
    expect(redlineNeedsAuth({ workflowId: null }, [ACTIVE_WORKFLOW])).toBe(true);
    expect(redlineNeedsAuth({ workflowId: 'wf-1' }, [])).toBe(true);
  });
});

describe('redline admins', () => {
  const ADMIN = 'redline.admin@cloudfuze.com';
  const fresh = { workflowId: null, actorEmail: null };

  it('isRedlineAdmin defaults to false, so a non-requester is still refused', () => {
    expect(redlineSaveDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: ADMIN } }))
      .toMatchObject({ ok: false, httpStatus: 403 });
    expect(redlineSaveDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: ADMIN }, isRedlineAdmin: 'true' }).ok)
      .toBe(false);
  });

  it('bypasses the requester rule on an active approval', () => {
    expect(redlineSaveDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: ADMIN }, isRedlineAdmin: true }).ok)
      .toBe(true);
    const adminSession = { workflowId: 'wf-1', actorEmail: ADMIN };
    expect(redlineSaveDecision({ session: adminSession, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: ADMIN }, isRedlineAdmin: true }).ok)
      .toBe(true);
  });

  it('still gets 409 when the approval finished while editing', () => {
    const adminSession = { workflowId: 'wf-1', actorEmail: ADMIN };
    const finished = { ...ACTIVE_WORKFLOW, status: 'approved' };
    expect(redlineSaveDecision({ session: adminSession, linkedWorkflows: [finished], actor: { email: ADMIN }, isRedlineAdmin: true }))
      .toMatchObject({ ok: false, httpStatus: 409 });
  });

  it('cannot save the session of the requester, and the requester cannot save the admin session', () => {
    const requesterSession = { workflowId: 'wf-1', actorEmail: REQUESTER };
    expect(redlineSaveDecision({ session: requesterSession, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: ADMIN }, isRedlineAdmin: true }))
      .toMatchObject({ ok: false, httpStatus: 403 });
    const adminSession = { workflowId: 'wf-1', actorEmail: ADMIN };
    expect(redlineSaveDecision({ session: adminSession, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER } }))
      .toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('a bound session needs a login even when no approval is involved', () => {
    const bound = { workflowId: null, actorEmail: REQUESTER };
    expect(redlineSaveDecision({ session: bound, linkedWorkflows: [], actor: null })).toMatchObject({ ok: false, httpStatus: 401 });
    expect(redlineSaveDecision({ session: bound, linkedWorkflows: [], actor: { email: OTHER } })).toMatchObject({ ok: false, httpStatus: 403 });
  });
});

describe('redlineStartWithoutApprovalDecision (documents never sent for approval)', () => {
  const doc = { id: 'doc-1', createdByEmail: REQUESTER };

  it('allows the creator and a redline admin', () => {
    expect(redlineStartWithoutApprovalDecision({ doc, actor: { email: ' Anush.Dasari@CloudFuze.com' } }).ok).toBe(true);
    expect(redlineStartWithoutApprovalDecision({ doc, actor: { email: OTHER }, isRedlineAdmin: true }).ok).toBe(true);
  });

  it('refuses a stranger (403) and an anonymous caller (401)', () => {
    expect(redlineStartWithoutApprovalDecision({ doc, actor: { email: OTHER } })).toMatchObject({ ok: false, httpStatus: 403 });
    expect(redlineStartWithoutApprovalDecision({ doc, actor: null })).toMatchObject({ ok: false, httpStatus: 401 });
  });

  it('a legacy document with no creator is redline-admin only', () => {
    const legacy = { id: 'doc-old' };
    expect(redlineStartWithoutApprovalDecision({ doc: legacy, actor: { email: OTHER } })).toMatchObject({ ok: false, httpStatus: 403 });
    expect(redlineStartWithoutApprovalDecision({ doc: legacy, actor: { email: OTHER }, isRedlineAdmin: true }).ok).toBe(true);
  });
});

describe('redlineAccessDecision', () => {
  const fresh = { workflowId: null, actorEmail: null };
  const doc = { id: 'doc-1', createdByEmail: OTHER };

  it('uses the approval rule when an approval exists and the creator rule otherwise', () => {
    expect(redlineAccessDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], doc, actor: { email: OTHER } }).ok).toBe(false);
    expect(redlineAccessDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], doc, actor: { email: REQUESTER } }).ok).toBe(true);
    expect(redlineAccessDecision({ session: fresh, linkedWorkflows: [], doc, actor: { email: OTHER } }).ok).toBe(true);
    expect(redlineAccessDecision({ session: fresh, linkedWorkflows: [], doc, actor: { email: REQUESTER } }).ok).toBe(false);
  });

  it('flags adminOverride only when the bypass was what allowed it', () => {
    const viaAdmin = redlineAccessDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], doc, actor: { email: OTHER }, isRedlineAdmin: true });
    expect(viaAdmin).toMatchObject({ ok: true, adminOverride: true });
    const ownRight = redlineAccessDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], doc, actor: { email: REQUESTER }, isRedlineAdmin: true });
    expect(ownRight).toMatchObject({ ok: true, adminOverride: false });
  });

  it('never lets an admin past the 409 or session binding', () => {
    const finished = { ...ACTIVE_WORKFLOW, status: 'approved' };
    expect(redlineAccessDecision({ session: { workflowId: 'wf-1', actorEmail: OTHER }, linkedWorkflows: [finished], doc, actor: { email: OTHER }, isRedlineAdmin: true }))
      .toMatchObject({ ok: false, httpStatus: 409, adminOverride: false });
    expect(redlineAccessDecision({ session: { workflowId: null, actorEmail: REQUESTER }, linkedWorkflows: [], doc, actor: { email: OTHER }, isRedlineAdmin: true }))
      .toMatchObject({ ok: false, httpStatus: 403 });
  });
});

describe('redline routes in server.cjs', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
  const routeSrc = (opening: string) => {
    const start = serverSrc.indexOf(opening);
    expect(start, opening).toBeGreaterThan(-1);
    return serverSrc.slice(start, serverSrc.indexOf('\napp.', start + 1));
  };
  const start = routeSrc("app.post('/api/onlyoffice/start-session-from-document/:id'");
  const persist = routeSrc("app.post('/api/onlyoffice/persist-to-document/:sessionId'");

  it('start always requires a login before reading the document or the id', () => {
    const authAt = start.indexOf('await getAuthenticatedUser(req, res)');
    expect(authAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(start.indexOf("db.collection('documents')"));
    expect(authAt).toBeLessThan(start.indexOf('req.params'));
    expect(start).not.toMatch(/if \(linkedWorkflows\.length\) \{\s*const actor/);
  });

  it('start and persist check redline admin status live and use the shared decision', () => {
    for (const src of [start, persist]) {
      expect(src).toContain('await hasRedlineAdminAccess(actor)');
      expect(src).toContain('redlineAccessDecision({');
      expect(src).toContain("logger.info('Redline admin override'");
    }
  });

  it('start always binds the session to the opener', () => {
    expect(start).toContain('const editorEmail = normalizeEmail(actor.email);');
    expect(start).toMatch(/actorEmail: editorEmail/);
  });

  it('persist always requires a login', () => {
    expect(persist).toMatch(/const actor = await getAuthenticatedUser\(req, res\);\s*if \(!actor\) return;/);
    expect(persist).not.toContain('redlineNeedsAuth(');
  });
});

describe('saveRedlineOverDocument keeps the creator', () => {
  it('never touches the creator fields', async () => {
    const { db, calls } = fakeDb({ document: { ...ORIGINAL, createdByEmail: REQUESTER } });
    await saveRedlineOverDocument(db, {
      documentId: 'doc-1', editedPdf: EDITED_PDF, editedDocx: EDITED_DOCX,
      activeWorkflows: [], actor: { email: OTHER }, backupVersionId: 'v-9',
    });
    const overwrite = calls.find(c => c.collection === 'documents' && c.op === 'updateOne')!.args[1];
    expect(Object.keys(overwrite)).toEqual(['$set']);
    expect(Object.keys(overwrite.$set).some(k => k.startsWith('createdBy'))).toBe(false);
  });
});

describe('saveRedlineOverDocument', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mid-approval: backs up, overwrites in place, keeps approvals and records history', async () => {
    const { db, calls } = fakeDb({ document: ORIGINAL, workflow: ACTIVE_WORKFLOW });

    const out = await saveRedlineOverDocument(db, {
      documentId: 'doc-1', editedPdf: EDITED_PDF, editedDocx: EDITED_DOCX,
      activeWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER }, backupVersionId: 'v-1',
    });

    expect(out).toEqual({ ok: true, backupVersionId: 'v-1' });

    const ops = calls.map(c => `${c.collection}.${c.op}`);
    expect(ops.indexOf('document_versions.insertOne')).toBeLessThan(ops.indexOf('documents.updateOne'));

    const backup = calls.find(c => c.collection === 'document_versions')!.args[0];
    expect(backup).toMatchObject({
      id: 'v-1', documentId: 'doc-1', fileData: ORIGINAL.fileData, docxFileData: ORIGINAL.docxFileData,
      workflowId: 'wf-1', replacedBy: REQUESTER, reason: 'redline',
    });

    const overwrite = calls.find(c => c.collection === 'documents' && c.op === 'updateOne')!.args;
    expect(overwrite[0]).toEqual({ id: 'doc-1' });
    expect(overwrite[1].$set).toMatchObject({ fileData: EDITED_PDF, docxFileData: EDITED_DOCX, fileSize: EDITED_PDF.length });

    // No fork: nothing new is inserted into documents
    expect(calls.some(c => c.collection === 'documents' && c.op === 'insertOne')).toBe(false);

    const wfUpdates = calls.filter(c => c.collection === 'approval_workflows' && c.op !== 'findOne');
    const history = wfUpdates.find(c => c.op === 'updateOne')!.args;
    expect(history[0]).toEqual({ id: 'wf-1' });
    expect(history[1].$push.redlineEdits.$each[0]).toMatchObject({
      editedBy: REQUESTER, backupVersionId: 'v-1', approvedStepsBefore: ['Team Approval'],
    });
    // Approvals already given are kept: no step status is touched
    for (const c of wfUpdates) expect(JSON.stringify(c.args)).not.toContain('workflowSteps');
  });

  it('counts approvals that landed while the save was running', async () => {
    const nowApproved = {
      ...ACTIVE_WORKFLOW,
      workflowSteps: ACTIVE_WORKFLOW.workflowSteps.map(s => (s.step === 2 ? { ...s, status: 'approved' } : s)),
    };
    const { db, calls } = fakeDb({ document: ORIGINAL, workflow: nowApproved });

    await saveRedlineOverDocument(db, {
      documentId: 'doc-1', editedPdf: EDITED_PDF, editedDocx: EDITED_DOCX,
      activeWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER }, backupVersionId: 'v-5',
    });

    const history = calls.find(c => c.collection === 'approval_workflows' && c.op === 'updateOne')!.args;
    expect(history[1].$push.redlineEdits.$each[0].approvedStepsBefore).toEqual(['Team Approval', 'Technical Team']);
  });

  it('flags the badge without overwriting older forked-copy records', async () => {
    const { db, calls } = fakeDb({ document: ORIGINAL, workflow: ACTIVE_WORKFLOW });

    await saveRedlineOverDocument(db, {
      documentId: 'doc-1', editedPdf: EDITED_PDF, editedDocx: EDITED_DOCX,
      activeWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER }, backupVersionId: 'v-6',
    });

    const badge = calls.find(c => c.collection === 'approval_workflows' && c.op === 'updateMany')!.args;
    expect(badge[0]).toEqual({ documentId: 'doc-1', redlineForked: { $ne: true } });
    expect(badge[1].$set).toMatchObject({ hasRedlineEdit: true, redlineDocumentId: 'doc-1', redlineForked: false });
  });

  it('no active approval: backs up and overwrites, without approval history', async () => {
    const { db, calls } = fakeDb({ document: ORIGINAL });

    const out = await saveRedlineOverDocument(db, {
      documentId: 'doc-1', editedPdf: EDITED_PDF, editedDocx: EDITED_DOCX,
      activeWorkflows: [], actor: null, backupVersionId: 'v-2',
    });

    expect(out.ok).toBe(true);
    const backup = calls.find(c => c.collection === 'document_versions')!.args[0];
    expect(backup).toMatchObject({ workflowId: null, replacedBy: null });
    expect(calls.some(c => c.collection === 'approval_workflows' && c.op === 'updateOne')).toBe(false);
  });

  it('leaves the document untouched when the backup cannot be written', async () => {
    const { db, calls } = fakeDb({ document: ORIGINAL, failBackup: true });

    await expect(saveRedlineOverDocument(db, {
      documentId: 'doc-1', editedPdf: EDITED_PDF, editedDocx: EDITED_DOCX,
      activeWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER }, backupVersionId: 'v-3',
    })).rejects.toThrow('backup write failed');

    expect(calls.some(c => c.collection === 'documents' && c.op === 'updateOne')).toBe(false);
  });

  it('returns 404 when the document does not exist', async () => {
    const { db, calls } = fakeDb({ document: null });

    const out = await saveRedlineOverDocument(db, {
      documentId: 'missing', editedPdf: EDITED_PDF, editedDocx: EDITED_DOCX,
      activeWorkflows: [], actor: null, backupVersionId: 'v-4',
    });

    expect(out).toEqual({ ok: false, httpStatus: 404, error: 'Document not found' });
    expect(calls.some(c => c.op === 'insertOne' || c.op === 'updateOne')).toBe(false);
  });
});

describe('redlineSaveMessage', () => {
  it('names the approver who is being emailed', () => {
    const msg = redlineSaveMessage({ updatedDuringApproval: true, notifiedApprover: { role: 'Technical Team' } });
    expect(msg).toContain('remaining approvers will review the new version');
    expect(msg).toContain('on its way to Tech');
  });

  it('says plainly when no email could be sent', () => {
    const msg = redlineSaveMessage({ updatedDuringApproval: true, notifiedApprover: null });
    expect(msg).toContain('No email was sent');
  });

  it('keeps the plain message when no approval is active', () => {
    expect(redlineSaveMessage({ updatedDuringApproval: false })).toBe('Redline saved — document updated');
  });
});

describe('auth helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the stored token as a Bearer header', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'cpq_token' ? 'a.b.c' : null) });
    expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer a.b.c' });
  });

  it('sends nothing when signed out', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(getAuthHeaders()).toEqual({});
  });

  it('treats only an unexpired JWT as a usable login', () => {
    const jwtWith = (payload: object) => `h.${btoa(JSON.stringify(payload))}.s`;
    const now = 1_800_000_000_000;
    const stub = (token: string | null) => vi.stubGlobal('localStorage', { getItem: () => token });
    stub(jwtWith({ exp: now / 1000 + 3600 }));
    expect(hasUsableAuthToken(now)).toBe(true);
    stub(jwtWith({ exp: now / 1000 - 1 }));
    expect(hasUsableAuthToken(now)).toBe(false);
    stub('mock_token_123');
    expect(hasUsableAuthToken(now)).toBe(false);
    stub(null);
    expect(hasUsableAuthToken(now)).toBe(false);
  });

  it('turns a 401 into a sign-in-again message and passes other errors through', () => {
    expect(authAwareError(401, 'Invalid token', 'x')).toContain('sign in again');
    expect(authAwareError(403, 'Only the requester can edit', 'x')).toBe('Only the requester can edit');
    expect(authAwareError(500, undefined, 'fallback')).toBe('fallback');
  });
});
