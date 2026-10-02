import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import exhibitRedline from '../../exhibit-redline.cjs';

// "Edit for RedLine" on an exhibit overwrites the DOCX every future quote pulls in. That is only
// safe if the old file is backed up first and a failed backup leaves the exhibit untouched.

const {
  EXHIBIT_LOCK_STALE_MS, findExhibitEditLock,
  isDocxBuffer, exhibitFileBuffer, exhibitCallbackStep, applyExhibitDownload, statusAfterForceSave, saveRedlineOverExhibit,
} = exhibitRedline as {
  EXHIBIT_LOCK_STALE_MS: number;
  findExhibitEditLock: (sessions: Iterable<any>, exhibitId: string, now: number) => any;
  isDocxBuffer: (buf: unknown) => boolean;
  exhibitFileBuffer: (exhibit: unknown) => Buffer | null;
  exhibitCallbackStep: (sessionId: string, body: unknown) => string;
  applyExhibitDownload: (session: any, buf: Buffer) => string;
  statusAfterForceSave: (session: any, commandError: unknown) => string;
  saveRedlineOverExhibit: (db: unknown, args: Record<string, unknown>) => Promise<any>;
};

const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
const ORIGINAL = {
  _id: 'ex-1',
  fileName: 'ShareFile to OneDrive Basic Plan - Basic Include.docx',
  fileData: Buffer.from([0x50, 0x4b, 0x09]).toString('base64'),
  fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  fileSize: 3,
  version: 2,
};

type Call = { collection: string; op: string; args: any[] };

function fakeDb(opts: { exhibit?: any; failBackup?: boolean; updateMatched?: number } = {}) {
  const calls: Call[] = [];
  const db = {
    collection(name: string) {
      const record = (op: string, args: any[]) => calls.push({ collection: name, op, args });
      return {
        findOne: async (...args: any[]) => { record('findOne', args); return opts.exhibit ?? null; },
        insertOne: async (...args: any[]) => {
          record('insertOne', args);
          if (opts.failBackup) throw new Error('backup write failed');
          return { acknowledged: true };
        },
        updateOne: async (...args: any[]) => { record('updateOne', args); return { matchedCount: opts.updateMatched ?? 1 }; },
      };
    },
  };
  return { db, calls };
}

const save = (db: unknown, overrides: Record<string, unknown> = {}) => saveRedlineOverExhibit(db, {
  filter: { _id: 'ex-1' },
  exhibitId: 'ex-1',
  editedDocx: DOCX,
  editorEmail: 'anush.dasari@cloudfuze.com',
  backupVersionId: 'backup-1',
  ...overrides,
});

describe('saveRedlineOverExhibit', () => {
  it('backs up the old file, then overwrites the exhibit and bumps its version', async () => {
    const { db, calls } = fakeDb({ exhibit: ORIGINAL });

    const result = await save(db);

    expect(result).toEqual({ ok: true, backupVersionId: 'backup-1', fileName: ORIGINAL.fileName, version: 3 });
    const writes = calls.filter(c => c.op !== 'findOne');
    expect(writes.map(c => `${c.collection}.${c.op}`)).toEqual(['exhibit_versions.insertOne', 'exhibits.updateOne']);

    const backup = writes[0].args[0];
    expect(backup).toMatchObject({
      id: 'backup-1', exhibitId: 'ex-1', fileName: ORIGINAL.fileName, fileData: ORIGINAL.fileData,
      version: 2, reason: 'redline', replacedBy: 'anush.dasari@cloudfuze.com',
    });

    const [filter, update] = writes[1].args;
    expect(filter).toEqual({ _id: 'ex-1', version: 2 });
    expect(update.$set).toMatchObject({ fileData: DOCX.toString('base64'), fileSize: DOCX.length, version: 3 });
    expect(update.$set.fileName).toBeUndefined();
  });

  it('leaves the exhibit untouched when the backup fails', async () => {
    const { db, calls } = fakeDb({ exhibit: ORIGINAL, failBackup: true });

    await expect(save(db)).rejects.toThrow('backup write failed');
    expect(calls.some(c => c.collection === 'exhibits' && c.op === 'updateOne')).toBe(false);
  });

  it('returns 404 without writing when the exhibit is gone', async () => {
    const { db, calls } = fakeDb({ exhibit: null });

    expect(await save(db)).toMatchObject({ ok: false, httpStatus: 404 });
    expect(calls.filter(c => c.op !== 'findOne')).toEqual([]);
  });

  it('rejects an edited file that is not a DOCX before touching the database', async () => {
    const { db, calls } = fakeDb({ exhibit: ORIGINAL });

    expect(await save(db, { editedDocx: Buffer.from('%PDF-1.7') })).toMatchObject({ ok: false, httpStatus: 400 });
    expect(calls).toEqual([]);
  });

  it('starts the version at 1 for exhibits saved before versions existed', async () => {
    const { db, calls } = fakeDb({ exhibit: { ...ORIGINAL, version: undefined } });

    expect((await save(db, { expectedVersion: 0 })).version).toBe(1);
    // null matches a missing field, so the version guard still works on old rows
    expect(calls.find(c => c.op === 'updateOne')!.args[0]).toEqual({ _id: 'ex-1', version: null });
  });

  it('refuses to overwrite a file someone replaced while the editor was open', async () => {
    const { db, calls } = fakeDb({ exhibit: ORIGINAL });

    expect(await save(db, { expectedVersion: 1 })).toMatchObject({ ok: false, httpStatus: 409 });
    expect(calls.filter(c => c.op !== 'findOne')).toEqual([]);
  });

  it('reports a conflict when the exhibit changes between the read and the write', async () => {
    const { db } = fakeDb({ exhibit: ORIGINAL, updateMatched: 0 });

    expect(await save(db, { expectedVersion: 2 })).toMatchObject({ ok: false, httpStatus: 409 });
  });
});

describe('findExhibitEditLock', () => {
  const NOW = 10_000_000;
  const open = (overrides: Record<string, unknown> = {}) => ({
    exhibitId: 'ex-1', status: 'editing', actorEmail: 'a@cloudfuze.com', createdAt: NOW - 1000, lastSeenAt: NOW - 1000, ...overrides,
  });

  it('finds another open editor on the same exhibit', () => {
    const holder = open();
    expect(findExhibitEditLock([open({ exhibitId: 'ex-2' }), holder], 'ex-1', NOW)).toBe(holder);
  });

  it('keeps the exhibit locked while an edit is being saved', () => {
    expect(findExhibitEditLock([open({ status: 'persisting' })], 'ex-1', NOW)).not.toBeNull();
  });

  it('frees the exhibit once the editor saved or closed', () => {
    expect(findExhibitEditLock([open({ status: 'persisted' }), open({ status: 'closed' })], 'ex-1', NOW)).toBeNull();
  });

  it('frees the exhibit when the editor stopped pinging (tab closed)', () => {
    expect(findExhibitEditLock([open({ lastSeenAt: NOW - EXHIBIT_LOCK_STALE_MS - 1 })], 'ex-1', NOW)).toBeNull();
    expect(findExhibitEditLock([open({ lastSeenAt: NOW - EXHIBIT_LOCK_STALE_MS + 1000 })], 'ex-1', NOW)).not.toBeNull();
  });
});

describe('exhibit OnlyOffice session rules', () => {
  it('only downloads saves signed for this exact session', () => {
    expect(exhibitCallbackStep('s-1', { key: 's-1', status: 6, url: 'http://oo/out.docx' })).toBe('download');
    expect(exhibitCallbackStep('s-1', { key: 's-1', status: 2, url: 'http://oo/out.docx' })).toBe('download');
    expect(exhibitCallbackStep('s-1', { key: 'other', status: 2, url: 'http://169.254.169.254/' })).toBe('reject');
    expect(exhibitCallbackStep('s-1', { status: 2, url: 'http://oo/out.docx' })).toBe('reject');
    expect(exhibitCallbackStep('s-1', null)).toBe('reject');
    expect(exhibitCallbackStep('s-1', { key: 's-1', status: 4 })).toBe('no-changes');
    expect(exhibitCallbackStep('s-1', { key: 's-1', status: 7 })).toBe('error');
    expect(exhibitCallbackStep('s-1', { key: 's-1', status: 1 })).toBe('ignore');
  });

  it('drops a download that lands after Done claimed the session', () => {
    const session = { status: 'persisting', editedDocx: Buffer.from([0x50, 0x4b, 0x01]) };

    expect(applyExhibitDownload(session, DOCX)).toBe('discarded');
    expect(session.editedDocx).not.toBe(DOCX);
    expect(session.status).toBe('persisting');
  });

  it('marks the session failed instead of ready when the download is not a DOCX', () => {
    const session: any = { status: 'saving', editedDocx: null };

    expect(applyExhibitDownload(session, Buffer.from('<html>metadata</html>'))).toBe('invalid');
    expect(session).toMatchObject({ status: 'editor-error', editedDocx: null });
  });

  it('stores a valid download and marks the session ready', () => {
    const session: any = { status: 'saving', editedDocx: null };

    expect(applyExhibitDownload(session, DOCX)).toBe('stored');
    expect(session).toMatchObject({ status: 'ready', editedDocx: DOCX });
  });

  it('waits for the forcesave callback instead of using an earlier manual save', () => {
    expect(statusAfterForceSave({ editedDocx: DOCX }, 0)).toBe('saving');
    expect(statusAfterForceSave({ editedDocx: DOCX }, 4)).toBe('ready');
    expect(statusAfterForceSave({ editedDocx: null }, 4)).toBe('no-changes');
    expect(statusAfterForceSave({ editedDocx: DOCX }, 1)).toBe('editor-error');
    expect(statusAfterForceSave({ editedDocx: DOCX }, undefined)).toBe('editor-error');
  });
});

describe('exhibitFileBuffer', () => {
  it('reads base64 strings and buffers, and returns null when there is no file', () => {
    expect(isDocxBuffer(exhibitFileBuffer({ fileData: DOCX.toString('base64') }))).toBe(true);
    expect(isDocxBuffer(exhibitFileBuffer({ fileData: DOCX }))).toBe(true);
    expect(exhibitFileBuffer({})).toBeNull();
  });
});
