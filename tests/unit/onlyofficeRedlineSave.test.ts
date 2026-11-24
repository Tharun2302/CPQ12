import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import redline from '../../onlyoffice-redline.cjs';
import { authAwareError, getAuthHeaders, hasUsableAuthToken } from '../../src/utils/authUtils';
import { redlineSaveMessage } from '../../src/utils/redlineSaveMessage';

// "Edit for RedLine" during an active approval overwrites the agreement the remaining approvers
// review. Any signed-in user may do it, so it is only safe if the edit is bound to whoever opened it, the edit can't land on an approval
// that finished meanwhile, the replaced version is kept, and approvals already given stay intact.

type Decision = { ok: boolean; httpStatus?: number; error?: string };
const { actorIsWorkflowCreator, redlineSaveDecision, saveRedlineOverDocument } = redline as {
  actorIsWorkflowCreator: (workflow: unknown, actor: unknown) => boolean;
  redlineSaveDecision: (args: Record<string, unknown>) => Decision;
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

describe('redlineSaveDecision (any signed-in user may redline an agreement)', () => {
  const fresh = { workflowId: null, actorEmail: null };
  const openSession = { workflowId: 'wf-1', actorEmail: REQUESTER };

  it('lets any signed-in user start, with or without an approval on the document', () => {
    expect(redlineSaveDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: OTHER } }).ok).toBe(true);
    expect(redlineSaveDecision({ session: fresh, linkedWorkflows: [], actor: { email: OTHER } }).ok).toBe(true);
    const approved = { ...ACTIVE_WORKFLOW, status: 'approved' };
    expect(redlineSaveDecision({ session: fresh, linkedWorkflows: [approved], actor: { email: OTHER } }).ok).toBe(true);
  });

  it('lets the person who opened the editor save, whoever they are', () => {
    const otherSession = { workflowId: 'wf-1', actorEmail: OTHER };
    expect(redlineSaveDecision({ session: otherSession, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: ' Tech.Lead@CloudFuze.com ' } }).ok)
      .toBe(true);
    expect(redlineSaveDecision({ session: openSession, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER } }).ok).toBe(true);
  });

  it('anonymous: 401, with or without an approval', () => {
    expect(redlineSaveDecision({ session: fresh, linkedWorkflows: [], actor: null })).toMatchObject({ ok: false, httpStatus: 401 });
    expect(redlineSaveDecision({ session: fresh, linkedWorkflows: [ACTIVE_WORKFLOW], actor: {} }))
      .toMatchObject({ ok: false, httpStatus: 401 });
    expect(redlineSaveDecision({ session: { workflowId: null, actorEmail: REQUESTER }, linkedWorkflows: [], actor: null }))
      .toMatchObject({ ok: false, httpStatus: 401 });
  });

  it('someone other than the opener cannot save (403), not even the requester', () => {
    const otherSession = { workflowId: 'wf-1', actorEmail: OTHER };
    expect(redlineSaveDecision({ session: otherSession, linkedWorkflows: [ACTIVE_WORKFLOW], actor: { email: REQUESTER } }))
      .toMatchObject({ ok: false, httpStatus: 403, error: 'Only the person who opened this editor can save it' });
    expect(redlineSaveDecision({ session: { workflowId: null, actorEmail: REQUESTER }, linkedWorkflows: [], actor: { email: OTHER } }))
      .toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('refuses (409) when the approval finished or vanished while editing', () => {
    expect(redlineSaveDecision({ session: openSession, linkedWorkflows: [], actor: { email: REQUESTER } }))
      .toMatchObject({ ok: false, httpStatus: 409 });
    const finished = { ...ACTIVE_WORKFLOW, status: 'approved' };
    expect(redlineSaveDecision({ session: openSession, linkedWorkflows: [finished], actor: { email: REQUESTER } }))
      .toMatchObject({ ok: false, httpStatus: 409 });
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
  });

  it('persist requires a login before looking up the session', () => {
    expect(persist).toMatch(/const actor = await getAuthenticatedUser\(req, res\);\s*if \(!actor\) return;/);
    expect(persist.indexOf('await getAuthenticatedUser(req, res)')).toBeLessThan(persist.indexOf('onlyofficeSessions.get('));
  });

  it('start and persist use the shared decision and no longer gate on requester, creator or redline admin', () => {
    for (const src of [start, persist]) {
      expect(src).toContain('redlineSaveDecision({');
      expect(src).not.toMatch(/hasRedlineAdminAccess|redlineAccessDecision|createdByEmail|Redline admin override/);
    }
  });

  it('start always binds the session to the opener and the active approval', () => {
    expect(start).toContain('const editorEmail = normalizeEmail(actor.email);');
    expect(start).toMatch(/actorEmail: editorEmail/);
    expect(start).toMatch(/workflowId: activeWorkflows\.length \? activeWorkflows\[0\]\.id : null/);
  });

  it('the approver email names the editor and says when it was not the requester', () => {
    const notify = serverSrc.slice(serverSrc.indexOf('async function notifyCurrentApproverOfRedline'), serverSrc.indexOf("app.post('/api/onlyoffice/persist-to-document/:sessionId'"));
    expect(notify).toContain('!actorIsWorkflowCreator(workflow, actor)');
    expect(notify).toContain('(not the requester)');
    expect(notify).not.toContain('redline admin');
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
    expect(Object.keys(overwrite)).toEqual(['$set', '$unset']);
    expect(Object.keys(overwrite.$set).some(k => k.startsWith('createdBy'))).toBe(false);
  });

  it('drops the template tags, so Edit Dates is strict about text typed in the redline', async () => {
    const { db, calls } = fakeDb({ document: { ...ORIGINAL, templateTags: ['Effective Date'] } });
    await saveRedlineOverDocument(db, {
      documentId: 'doc-1', editedPdf: EDITED_PDF, editedDocx: EDITED_DOCX,
      activeWorkflows: [], actor: { email: OTHER }, backupVersionId: 'v-9',
    });
    const overwrite = calls.find(c => c.collection === 'documents' && c.op === 'updateOne')!.args[1];
    expect(overwrite.$unset).toEqual({ templateTags: '' });
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
