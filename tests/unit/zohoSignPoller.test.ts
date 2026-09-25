import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const poller = require('../../zoho-sign-poller.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const status = require('../../zoho-sign-status.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { zohoSignError, ZOHO_ERROR_CODES } = require('../../zoho-sign-auth.cjs');

const NOW = new Date('2026-09-24T12:00:00.000Z');
const CONFIG = { pollIntervalMs: 300000, pollBatch: 20 };

type Doc = Record<string, unknown> & { _id: string };

/** A fake store that records every write, so a test can assert what was NOT written too. */
function makeStore(docs: Doc[], recipients: Record<string, Record<string, unknown>[]> = {}) {
  const docPatches: { id: string; patch: Record<string, unknown> }[] = [];
  const recipientPatches: { id: string; patch: Record<string, unknown> }[] = [];
  return {
    docPatches,
    recipientPatches,
    async findDueDocuments() { return docs; },
    async findRecipients(documentId: string) { return recipients[documentId] || []; },
    async saveDocumentPatch(id: string, patch: Record<string, unknown>) { docPatches.push({ id, patch }); },
    async saveRecipientPatch(id: string, patch: Record<string, unknown>) { recipientPatches.push({ id, patch }); },
  };
}

function makePoller(store: ReturnType<typeof makeStore>, getRequest: (id: string) => unknown) {
  return poller.createZohoSignPoller({
    config: CONFIG,
    client: { getRequest: async (id: string) => getRequest(id) },
    store,
    now: () => NOW,
  });
}

const sentDoc = (over: Partial<Doc> = {}): Doc => ({
  _id: 'doc1',
  provider: 'zoho',
  status: 'sent',
  zoho_request_id: 'req1',
  zoho_request_status: 'inprogress',
  ...over,
});

describe('zoho-sign-status — mapping', () => {
  it('maps every Zoho request status onto CPQ vocabulary', () => {
    expect(status.mapZohoRequestStatus('draft')).toBe('draft');
    expect(status.mapZohoRequestStatus('inprogress')).toBe('sent');
    expect(status.mapZohoRequestStatus('completed')).toBe('completed');
    expect(status.mapZohoRequestStatus('declined')).toBe('denied');
    expect(status.mapZohoRequestStatus('recalled')).toBe('voided');
    // CPQ has no "expired" document status; voided is the closest true statement (design §6.4).
    expect(status.mapZohoRequestStatus('expired')).toBe('voided');
  });

  it('returns undefined for an unknown status rather than guessing', () => {
    expect(status.mapZohoRequestStatus('teleported')).toBeUndefined();
    expect(status.mapZohoActionStatus('NOPE')).toBeUndefined();
  });

  it('maps recipient action statuses', () => {
    expect(status.mapZohoActionStatus('NOTACTIONYET')).toBe('pending');
    expect(status.mapZohoActionStatus('VIEWED')).toBe('viewed');
    expect(status.mapZohoActionStatus('SIGNED')).toBe('signed');
    expect(status.mapZohoActionStatus('APPROVED')).toBe('reviewed');
    expect(status.mapZohoActionStatus('DECLINED')).toBe('denied');
  });
});

describe('buildDueDocumentsQuery — terminal documents are never selected', () => {
  it('asks for the two non-terminal Zoho states', () => {
    const q = poller.buildDueDocumentsQuery(new Date(NOW.getTime() - 1000));
    expect(q.provider).toBe('zoho');
    const stateBranch = q.$and[0].$or;
    expect(stateBranch[0]).toEqual({ zoho_request_status: { $in: ['draft', 'inprogress'] } });
    // declined / recalled / expired drop out permanently rather than being re-polled forever.
    ['declined', 'recalled', 'expired'].forEach((terminal: string) => {
      expect(stateBranch[0].zoho_request_status.$in).not.toContain(terminal);
    });
  });

  it('also re-selects a completed document that never got its signed PDF', () => {
    const q = poller.buildDueDocumentsQuery(new Date(NOW.getTime() - 1000));
    expect(q.$and[0].$or[1]).toEqual({
      zoho_request_status: 'completed',
      signed_file_path: { $exists: false },
    });
  });

  it('only selects documents never polled or polled before the cutoff', () => {
    const cutoff = new Date(NOW.getTime() - CONFIG.pollIntervalMs);
    const q = poller.buildDueDocumentsQuery(cutoff);
    expect(q.$and[1].$or).toEqual([
      { zoho_last_polled_at: { $exists: false } },
      { zoho_last_polled_at: { $lt: cutoff } },
    ]);
  });
});

describe('createZohoSignPoller — happy paths', () => {
  it('polls a pending document and records the attempt', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => ({ request_status: 'inprogress', actions: [] }));
    const summary = await p.runOnce();

    expect(summary).toMatchObject({ scanned: 1, changed: 0, unchanged: 1, failed: 0 });
    // Unchanged still stamps the attempt, so one quiet document cannot starve the queue.
    expect(store.docPatches).toEqual([{ id: 'doc1', patch: { zoho_last_polled_at: NOW } }]);
  });

  it('completed moves the document to completed and stamps signed_at', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => ({ request_status: 'completed', actions: [] }));
    const summary = await p.runOnce();

    expect(summary.changed).toBe(1);
    expect(store.docPatches[0].patch).toEqual({
      zoho_last_polled_at: NOW,
      zoho_request_status: 'completed',
      status: 'completed',
      signed_at: NOW,
      zoho_last_synced_at: NOW,
    });
  });

  it('declined maps to denied', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => ({ request_status: 'declined', actions: [] }));
    await p.runOnce();
    expect(store.docPatches[0].patch).toMatchObject({ status: 'denied', zoho_request_status: 'declined' });
    expect(store.docPatches[0].patch.signed_at).toBeUndefined();
  });

  it('expired maps to voided', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => ({ request_status: 'expired', actions: [] }));
    await p.runOnce();
    expect(store.docPatches[0].patch).toMatchObject({ status: 'voided', zoho_request_status: 'expired' });
  });

  it('recalled maps to voided', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => ({ request_status: 'recalled', actions: [] }));
    await p.runOnce();
    expect(store.docPatches[0].patch).toMatchObject({ status: 'voided' });
  });

  it('updates recipients by zoho_action_id, not by position', async () => {
    const store = makeStore(
      [sentDoc()],
      { doc1: [
        { _id: 'r1', zoho_action_id: 'a1', status: 'pending' },
        { _id: 'r2', zoho_action_id: 'a2', status: 'pending' },
      ] },
    );
    // Zoho returns them in the opposite order on purpose.
    const p = makePoller(store, () => ({
      request_status: 'inprogress',
      actions: [
        { action_id: 'a2', action_status: 'VIEWED' },
        { action_id: 'a1', action_status: 'SIGNED' },
      ],
    }));
    await p.runOnce();

    const byId = Object.fromEntries(store.recipientPatches.map((u) => [u.id, u.patch]));
    expect(byId.r1).toMatchObject({ status: 'signed', zoho_action_status: 'SIGNED', signed_at: NOW });
    expect(byId.r2).toMatchObject({ status: 'viewed', zoho_action_status: 'VIEWED' });
    expect(byId.r2.signed_at).toBeUndefined();
  });

  it('writes nothing for a recipient whose status has not moved', async () => {
    const store = makeStore(
      [sentDoc()],
      { doc1: [{ _id: 'r1', zoho_action_id: 'a1', status: 'signed', zoho_action_status: 'SIGNED' }] },
    );
    const p = makePoller(store, () => ({
      request_status: 'inprogress',
      actions: [{ action_id: 'a1', action_status: 'SIGNED' }],
    }));
    await p.runOnce();
    expect(store.recipientPatches).toEqual([]);
  });
});

describe('createZohoSignPoller — failures must not corrupt state', () => {
  it('a Zoho failure stamps the attempt and the error but never touches status', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => { throw zohoSignError(ZOHO_ERROR_CODES.SERVER_ERROR, 'Zoho is unwell'); });
    const summary = await p.runOnce();

    expect(summary.failed).toBe(1);
    const patch = store.docPatches[0].patch as Record<string, unknown>;
    expect(patch.zoho_last_polled_at).toEqual(NOW);
    expect(patch.zoho_last_error).toMatchObject({ code: ZOHO_ERROR_CODES.SERVER_ERROR });
    // The contract is fine at Zoho; a transport blip must not downgrade it.
    expect(patch.status).toBeUndefined();
    expect(patch.zoho_request_status).toBeUndefined();
    expect(patch.zoho_last_synced_at).toBeUndefined();
  });

  it('one failing document does not stop the rest of the batch', async () => {
    const store = makeStore([
      sentDoc({ _id: 'doc1', zoho_request_id: 'bad' }),
      sentDoc({ _id: 'doc2', zoho_request_id: 'ok' }),
      sentDoc({ _id: 'doc3', zoho_request_id: 'ok' }),
    ]);
    const p = makePoller(store, (id: string) => {
      if (id === 'bad') throw zohoSignError(ZOHO_ERROR_CODES.NETWORK_ERROR, 'no route');
      return { request_status: 'completed', actions: [] };
    });
    const summary = await p.runOnce();

    expect(summary).toMatchObject({ scanned: 3, changed: 2, failed: 1 });
    expect(store.docPatches.map((p2) => p2.id)).toEqual(['doc1', 'doc2', 'doc3']);
    expect(store.docPatches[1].patch).toMatchObject({ status: 'completed' });
    expect(store.docPatches[2].patch).toMatchObject({ status: 'completed' });
  });

  it('an unknown Zoho status records the raw value but leaves CPQ status alone', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => ({ request_status: 'something_new', actions: [] }));
    await p.runOnce();
    const patch = store.docPatches[0].patch as Record<string, unknown>;
    expect(patch.zoho_request_status).toBe('something_new');
    expect(patch.status).toBeUndefined();
  });

  it('a selection failure is swallowed so the interval survives', async () => {
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: { getRequest: async () => ({}) },
      store: { async findDueDocuments() { throw new Error('mongo down'); } },
      now: () => NOW,
    });
    await expect(p.runOnce()).resolves.toMatchObject({ failed: 1, scanned: 0 });
  });

  it('a rate limit stops the batch and backs the poller off', async () => {
    const store = makeStore([sentDoc({ _id: 'doc1' }), sentDoc({ _id: 'doc2' })]);
    const p = makePoller(store, () => { throw zohoSignError(ZOHO_ERROR_CODES.RATE_LIMITED, 'slow down'); });

    const first = await p.runOnce();
    expect(first.failed).toBe(1);
    // Second document was not attempted — the limit is per account, not per document.
    expect(store.docPatches).toHaveLength(1);

    // The next tick is skipped entirely rather than spending more budget.
    const second = await p.runOnce();
    expect(second.skipped).toBe(true);
    expect(store.docPatches).toHaveLength(1);
  });
});

describe('createZohoSignPoller — scheduling', () => {
  it('start() is idempotent and stop() clears the timer', () => {
    const store = makeStore([]);
    const p = makePoller(store, () => ({ request_status: 'inprogress' }));
    const a = p.start();
    const b = p.start();
    expect(a).toBe(b);
    p.stop();
    p.stop();
  });
});

describe('security review regressions', () => {
  it('H1: never reopens a CPQ-terminal status (a void must stay voided)', async () => {
    // Zoho does not know about a CPQ-side void, so it still reports inprogress.
    const store = makeStore([sentDoc({ status: 'voided' })]);
    const p = makePoller(store, () => ({ request_status: 'inprogress', actions: [] }));
    await p.runOnce();
    expect(store.docPatches[0].patch.status).toBeUndefined();

    for (const terminal of ['completed', 'voided', 'denied']) {
      const s2 = makeStore([sentDoc({ status: terminal })]);
      const p2 = makePoller(s2, () => ({ request_status: 'inprogress', actions: [] }));
      await p2.runOnce();
      expect(s2.docPatches[0].patch.status).toBeUndefined();
    }
  });

  it('H3: a prototype-chain request_status can never reach status', async () => {
    for (const hostile of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(status.mapZohoRequestStatus(hostile)).toBeUndefined();
      const store = makeStore([sentDoc()]);
      const p = makePoller(store, () => ({ request_status: hostile, actions: [] }));
      await p.runOnce();
      expect(store.docPatches[0].patch.status).toBeUndefined();
    }
    expect(status.mapZohoActionStatus('__proto__')).toBeUndefined();
  });

  it('M3: a failed persist is contained and does not abort the batch', async () => {
    const saved: string[] = [];
    const store = {
      docPatches: [] as { id: string; patch: Record<string, unknown> }[],
      recipientPatches: [] as { id: string; patch: Record<string, unknown> }[],
      async findDueDocuments() { return [sentDoc({ _id: 'bad' }), sentDoc({ _id: 'good' })]; },
      async findRecipients() { return []; },
      async saveDocumentPatch(id: string) {
        if (id === 'bad') throw new Error('write conflict');
        saved.push(id);
      },
      async saveRecipientPatch() { /* unused */ },
    };
    const p = makePoller(store as never, () => ({ request_status: 'completed', actions: [] }));
    const summary = await p.runOnce();
    expect(summary).toMatchObject({ scanned: 2, failed: 1, changed: 1 });
    expect(saved).toEqual(['good']);
  });

  it('L1: the rate-limit backoff actually escalates', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => { throw zohoSignError(ZOHO_ERROR_CODES.RATE_LIMITED, 'slow down'); });

    await p.runOnce();                                    // 1st 429 -> cooldown 1
    expect((await p.runOnce()).skipped).toBe(true);        // burns it
    await p.runOnce();                                    // 2nd 429 -> cooldown 2
    expect((await p.runOnce()).skipped).toBe(true);
    expect((await p.runOnce()).skipped).toBe(true);        // two skips proves escalation
    expect((await p.runOnce()).skipped).toBe(false);
  });

  it('L2: a clean poll clears a stale zoho_last_error', async () => {
    const store = makeStore([sentDoc({ zoho_last_error: { code: 'ZOHO_SERVER_ERROR' } })]);
    const p = makePoller(store, () => ({ request_status: 'inprogress', actions: [] }));
    await p.runOnce();
    expect(store.docPatches[0].patch.zoho_last_error).toBeNull();
  });

  it('M1: a status change writes an audit row', async () => {
    const rows: unknown[] = [];
    const store = makeStore([sentDoc()]);
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: { getRequest: async () => ({ request_status: 'completed', actions: [] }) },
      store,
      now: () => NOW,
      logAudit: async (...args: unknown[]) => { rows.push(args); },
    });
    await p.runOnce();
    expect(rows).toHaveLength(1);
    expect((rows[0] as unknown[])[1]).toBe('completed');
  });

  it('M4: an over-long Zoho status is capped before it is stored', async () => {
    const store = makeStore([sentDoc()]);
    const p = makePoller(store, () => ({ request_status: 'x'.repeat(5000), actions: [] }));
    await p.runOnce();
    expect(String(store.docPatches[0].patch.zoho_request_status)).toHaveLength(64);
  });
});

describe('code review regressions', () => {
  it('M1: a document polled during the previous tick is due again on the next one', async () => {
    // Stamped at T+ε by the previous tick; a full-interval cutoff would skip it until T+2I.
    const stampedAt = new Date(NOW.getTime() - CONFIG.pollIntervalMs + 1200);
    let captured: Date | null = null;
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: { getRequest: async () => ({ request_status: 'inprogress' }) },
      store: {
        async findDueDocuments(cutoff: Date) { captured = cutoff; return []; },
        async findRecipients() { return []; },
        async saveDocumentPatch() { /* unused */ },
        async saveRecipientPatch() { /* unused */ },
      },
      now: () => NOW,
    });
    await p.runOnce();
    expect(captured).not.toBeNull();
    expect((captured as unknown as Date).getTime()).toBeGreaterThan(stampedAt.getTime());
  });

  it('M4: a synchronous store does not kill the batch on the failure path', async () => {
    const writes: string[] = [];
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: { getRequest: async () => { throw zohoSignError(ZOHO_ERROR_CODES.NETWORK_ERROR, 'down'); } },
      store: {
        findDueDocuments: () => [sentDoc({ _id: 'd1' }), sentDoc({ _id: 'd2' })],
        findRecipients: () => [],
        saveDocumentPatch: (id: string) => { writes.push(id); },   // deliberately NOT async
        saveRecipientPatch: () => {},
      },
      now: () => NOW,
    });
    const summary = await p.runOnce();
    expect(summary).toMatchObject({ scanned: 2, failed: 2 });
    expect(writes).toEqual(['d1', 'd2']);
  });

  it('M6: a recipient-only change still stamps zoho_last_synced_at', async () => {
    const store = makeStore(
      [sentDoc()],
      { doc1: [{ _id: 'r1', zoho_action_id: 'a1', status: 'pending' }] },
    );
    const p = makePoller(store, () => ({
      request_status: 'inprogress',
      actions: [{ action_id: 'a1', action_status: 'VIEWED' }],
    }));
    await p.runOnce();
    expect(store.docPatches[0].patch.zoho_last_synced_at).toEqual(NOW);
  });

  it('re-entrancy: an overlapping tick is skipped, not run twice', async () => {
    let calls = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => { release = r; });
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: { getRequest: async () => { calls += 1; await gate; return { request_status: 'inprogress' }; } },
      store: {
        async findDueDocuments() { return [sentDoc()]; },
        async findRecipients() { return []; },
        async saveDocumentPatch() { /* unused */ },
        async saveRecipientPatch() { /* unused */ },
      },
      now: () => NOW,
    });
    const first = p.runOnce();
    const second = await p.runOnce();
    expect(second.skipped).toBe(true);
    (release as unknown as () => void)();
    await first;
    expect(calls).toBe(1);
  });

  it('signed_at is preserved when the document already has one', async () => {
    const earlier = new Date(NOW.getTime() - 86400000);
    const store = makeStore([sentDoc({ signed_at: earlier })]);
    const p = makePoller(store, () => ({ request_status: 'completed', actions: [] }));
    await p.runOnce();
    expect(store.docPatches[0].patch.signed_at).toBeUndefined();
  });
});

describe('signed PDF retrieval on completion', () => {
  const completedDoc = () => sentDoc();

  function makeStoreWithPdf(docs: Doc[], saveSignedPdf: (id: string, buf: unknown) => unknown) {
    const base = makeStore(docs);
    return Object.assign(base, { saveSignedPdf: async (id: string, buf: unknown) => saveSignedPdf(id, buf) });
  }

  it('downloads the executed PDF and merges the file fields into the same write', async () => {
    let asked: unknown = null;
    const store = makeStoreWithPdf([completedDoc()], () => ({
      signed_file_path: '/uploads/signed/signed-doc1-1.pdf',
      zoho_signed_file_path: '/uploads/signed/signed-doc1-1.pdf',
    }));
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: {
        getRequest: async () => ({ request_status: 'completed', actions: [] }),
        downloadPdf: async (id: string, opts: unknown) => { asked = { id, opts }; return { buffer: Buffer.from('%PDF-') }; },
      },
      store,
      now: () => NOW,
    });
    await p.runOnce();

    // Certificate merged into the one file, so the audit trail travels with the contract.
    expect(asked).toEqual({ id: 'req1', opts: { withCoc: true, merge: true } });
    expect(store.docPatches).toHaveLength(1);
    expect(store.docPatches[0].patch).toMatchObject({
      status: 'completed',
      signed_file_path: '/uploads/signed/signed-doc1-1.pdf',
      zoho_signed_file_path: '/uploads/signed/signed-doc1-1.pdf',
    });
  });

  it('holds the completed transition when the download fails, and retries next tick', async () => {
    const store = makeStoreWithPdf([completedDoc()], () => { throw new Error('unreachable'); });
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: {
        getRequest: async () => ({ request_status: 'completed', actions: [] }),
        downloadPdf: async () => { throw zohoSignError(ZOHO_ERROR_CODES.NETWORK_ERROR, 'no route'); },
      },
      store,
      now: () => NOW,
    });
    const summary = await p.runOnce();

    expect(summary.failed).toBe(1);
    const patch = store.docPatches[0].patch as Record<string, unknown>;
    // Neither field advances, so the document stays in the selection query and is retried.
    expect(patch.status).toBeUndefined();
    expect(patch.zoho_request_status).toBeUndefined();
    expect(patch.zoho_last_polled_at).toEqual(NOW);
    expect(patch.zoho_last_error).toMatchObject({ code: ZOHO_ERROR_CODES.NETWORK_ERROR });
  });

  it('does not re-download when the document already has a signed file', async () => {
    let calls = 0;
    const store = makeStoreWithPdf([sentDoc({ signed_file_path: '/already/there.pdf' })], () => ({}));
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: {
        getRequest: async () => ({ request_status: 'completed', actions: [] }),
        downloadPdf: async () => { calls += 1; return { buffer: Buffer.from('x') }; },
      },
      store,
      now: () => NOW,
    });
    await p.runOnce();
    expect(calls).toBe(0);
    expect(store.docPatches[0].patch).toMatchObject({ status: 'completed' });
  });

  it('a non-completed transition never downloads', async () => {
    let calls = 0;
    const store = makeStoreWithPdf([completedDoc()], () => ({}));
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: {
        getRequest: async () => ({ request_status: 'declined', actions: [] }),
        downloadPdf: async () => { calls += 1; return { buffer: Buffer.from('x') }; },
      },
      store,
      now: () => NOW,
    });
    await p.runOnce();
    expect(calls).toBe(0);
    expect(store.docPatches[0].patch).toMatchObject({ status: 'denied' });
  });
});

describe('regression: already-completed document still fetches its PDF', () => {
  // The bug: the download was triggered by a status TRANSITION, so a document that already read
  // 'completed' in CPQ produced no patch and the artifact was never retrieved — forever.
  it('downloads for a document whose CPQ status is already completed', async () => {
    let calls = 0;
    const store = Object.assign(
      makeStore([sentDoc({ status: 'completed', zoho_request_status: 'completed' })]),
      { saveSignedPdf: async () => ({ signed_file_path: '/uploads/signed/s.pdf', zoho_signed_file_path: '/uploads/signed/s.pdf' }) },
    );
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: {
        getRequest: async () => ({ request_status: 'completed', actions: [] }),
        downloadPdf: async () => { calls += 1; return { buffer: Buffer.from('%PDF-') }; },
      },
      store,
      now: () => NOW,
    });
    const summary = await p.runOnce();

    expect(calls).toBe(1);
    expect(summary.changed).toBe(1);
    expect(store.docPatches[0].patch).toMatchObject({
      signed_file_path: '/uploads/signed/s.pdf',
      zoho_last_synced_at: NOW,
    });
    // No status word changed, and none should have been invented.
    expect(store.docPatches[0].patch.status).toBeUndefined();
  });
});
