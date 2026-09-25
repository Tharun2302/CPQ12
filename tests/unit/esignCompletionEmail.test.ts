import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const completion = require('../../esign-completion-email.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const poller = require('../../zoho-sign-poller.cjs');

const NOW = new Date('2026-09-25T10:00:00.000Z');
const CONFIG = { pollIntervalMs: 300000, pollBatch: 20 };

type Row = Record<string, unknown>;
type Doc = Row & { _id: string };

const signer = (over: Row = {}): Row => ({
  _id: 'r1', name: 'Chitradip Saha', email: 'chitradip@example.com',
  action: 'signer', zoho_action_type: 'SIGN', status: 'signed', ...over,
});

/** A completed-at-Zoho document that already holds its executed PDF. */
const completedDoc = (over: Partial<Doc> = {}): Doc => ({
  _id: 'doc1',
  provider: 'zoho',
  status: 'sent',
  file_name: 'ContactCompanyInc_JohnSmith.pdf',
  uploaded_by: 'creator@cloudfuze.com',
  zoho_request_id: 'req1',
  zoho_request_status: 'inprogress',
  signed_file_path: '/signed/doc1.pdf',
  ...over,
});

/**
 * Fake store + a notifyCompleted spy. Patches are applied to the in-memory row so a second
 * tick sees what the first one wrote — which is what makes the idempotency tests meaningful.
 */
function makeHarness(docs: Doc[], recipients: Row[], notify: (doc: Doc) => Row | null) {
  const calls: Doc[] = [];
  const docPatches: { id: string; patch: Row }[] = [];
  const store = {
    docPatches,
    async findDueDocuments() { return docs; },
    async findRecipients() { return recipients; },
    async saveDocumentPatch(id: string, patch: Row) {
      docPatches.push({ id, patch });
      const row = docs.find((d) => d._id === id);
      if (row) Object.assign(row, patch);
    },
    async saveRecipientPatch() { /* not under test here */ },
    async saveSignedPdf() { return { signed_file_path: '/signed/doc1.pdf' }; },
  };
  const p = poller.createZohoSignPoller({
    config: CONFIG,
    client: {
      getRequest: async () => ({ request_status: 'completed', actions: [] }),
      downloadPdf: async () => ({ buffer: Buffer.from('%PDF-1.4 signed') }),
    },
    store,
    now: () => NOW,
    notifyCompleted: async (doc: Doc) => { calls.push(doc); return notify(doc); },
  });
  return { store, poller: p, calls, docs, docPatches };
}

/** The patch a successful send produces, matching the server handler's contract. */
const sentPatch = () => ({
  completion_email_sent_at: NOW,
  completion_email_pending: false,
  completion_email_attempts: 1,
  completion_email_error: null,
});

describe('esign-completion-email — required signers', () => {
  // Case 1 + 7
  it('reports complete only when every required signer is done', () => {
    expect(completion.allRequiredRecipientsSigned([signer()])).toBe(true);
    expect(completion.allRequiredRecipientsSigned([
      signer({ _id: 'r1' }), signer({ _id: 'r2', email: 'b@x.com' }),
    ])).toBe(true);
  });

  // Case 2 + 7
  it('reports incomplete while any required signer is outstanding', () => {
    expect(completion.allRequiredRecipientsSigned([
      signer({ _id: 'r1' }),
      signer({ _id: 'r2', email: 'b@x.com', status: 'viewed' }),
    ])).toBe(false);
    expect(completion.allRequiredRecipientsSigned([signer({ status: 'pending' })])).toBe(false);
    expect(completion.allRequiredRecipientsSigned([signer({ status: 'denied' })])).toBe(false);
  });

  it('counts a reviewer approval as done, reusing the existing done vocabulary', () => {
    expect(completion.allRequiredRecipientsSigned([
      signer({ _id: 'r1' }),
      signer({ _id: 'r2', action: 'reviewer', zoho_action_type: 'APPROVER', status: 'reviewed' }),
    ])).toBe(true);
  });

  it('does not wait on a VIEW-only recipient, who has nothing to sign', () => {
    expect(completion.allRequiredRecipientsSigned([
      signer({ _id: 'r1' }),
      signer({ _id: 'r2', action: 'viewer', zoho_action_type: 'VIEW', status: 'viewed' }),
    ])).toBe(true);
  });

  it('never calls an envelope with no required signer complete', () => {
    expect(completion.allRequiredRecipientsSigned([])).toBe(false);
    expect(completion.allRequiredRecipientsSigned([
      signer({ action: 'viewer', zoho_action_type: 'VIEW', status: 'viewed' }),
    ])).toBe(false);
  });
});

describe('esign-completion-email — send decision', () => {
  const base = {
    doc: { status: 'completed' },
    recipients: [signer()],
    creatorEmail: 'creator@cloudfuze.com',
    agreementLink: 'https://cpq.example/esign/doc1/status',
    signedFileAvailable: true,
  };

  it('sends when the document is completed, everyone signed and the PDF is in hand', () => {
    expect(completion.evaluateCompletionEmail(base)).toMatchObject({ send: true, reason: 'ready' });
  });

  // Case 3 / 4: the idempotency marker is the guard.
  it('never sends twice for the same agreement', () => {
    const decision = completion.evaluateCompletionEmail({
      ...base, doc: { status: 'completed', completion_email_sent_at: NOW },
    });
    expect(decision).toMatchObject({ send: false, permanent: true, reason: 'already-sent' });
  });

  it('does not send for a document that is not completed in CPQ', () => {
    expect(completion.evaluateCompletionEmail({ ...base, doc: { status: 'sent' } }))
      .toMatchObject({ send: false, reason: 'document-not-completed' });
    // A deliberately voided document is not resurrected into a completion email either.
    expect(completion.evaluateCompletionEmail({ ...base, doc: { status: 'voided' } }))
      .toMatchObject({ send: false, reason: 'document-not-completed' });
  });

  // Case 2
  it('defers, rather than gives up, while a signer is outstanding', () => {
    const decision = completion.evaluateCompletionEmail({
      ...base, recipients: [signer(), signer({ _id: 'r2', status: 'viewed' })],
    });
    expect(decision).toMatchObject({ send: false, permanent: false, reason: 'recipients-incomplete' });
  });

  // Case 8
  it('does not send while the executed PDF is unavailable, and stays retryable', () => {
    const decision = completion.evaluateCompletionEmail({ ...base, signedFileAvailable: false });
    expect(decision).toMatchObject({ send: false, permanent: false, reason: 'signed-file-unavailable' });
  });

  // Case 6
  it('permanently skips when the creator has no usable address', () => {
    for (const creatorEmail of ['', '   ', 'not-an-address', null, undefined]) {
      expect(completion.evaluateCompletionEmail({ ...base, creatorEmail }))
        .toMatchObject({ send: false, permanent: true, reason: 'no-creator-email' });
    }
  });

  // Case 8: the executed PDF is attached, so a missing link costs a convenience, not the contract.
  it('still sends when no agreement link can be built, because the PDF is attached', () => {
    expect(completion.evaluateCompletionEmail({ ...base, agreementLink: '' }))
      .toMatchObject({ send: true, reason: 'ready' });
  });

  it('gives up after the retry budget is spent so a broken mailer cannot loop forever', () => {
    const decision = completion.evaluateCompletionEmail({
      ...base,
      doc: { status: 'completed', completion_email_attempts: completion.COMPLETION_EMAIL_MAX_ATTEMPTS },
    });
    expect(decision).toMatchObject({ send: false, permanent: true, reason: 'attempts-exhausted' });
  });
});

describe('esign-completion-email — message and link', () => {
  it('builds the creator link from the existing authenticated status route', () => {
    expect(completion.buildAgreementLink('https://cpq.cftools.live', 'doc1'))
      .toBe('https://cpq.cftools.live/esign/doc1/status');
    // A trailing slash must not produce a double slash.
    expect(completion.buildAgreementLink('https://cpq.cftools.live/', 'doc1'))
      .toBe('https://cpq.cftools.live/esign/doc1/status');
  });

  it('returns no link rather than a broken one when the base URL or id is missing', () => {
    expect(completion.buildAgreementLink('', 'doc1')).toBe('');
    expect(completion.buildAgreementLink('https://cpq.example', '')).toBe('');
  });

  it('states the agreement, the completion and the date, and carries the link', () => {
    const mail = completion.buildCompletionEmail({
      documentName: 'ContactCompanyInc_JohnSmith.pdf',
      creatorName: 'Abhilasha',
      creatorEmail: 'creator@cloudfuze.com',
      completedAt: NOW,
      agreementLink: 'https://cpq.example/esign/doc1/status',
    });
    expect(mail.subject).toBe('Agreement Completed – ContactCompanyInc_JohnSmith.pdf');
    expect(mail.html).toContain('Hi Abhilasha,');
    expect(mail.html).toContain('All recipients have completed their signatures.');
    expect(mail.html).toContain('<strong>Status:</strong> Completed');
    expect(mail.html).toContain(completion.formatCompletedOn(NOW));
    expect(mail.html).toContain('https://cpq.example/esign/doc1/status');
  });

  it('tells the creator the executed document is attached', () => {
    const mail = completion.buildCompletionEmail({
      documentName: 'Teams to Slack Outscope.pdf',
      creatorEmail: 'creator@cloudfuze.com',
      completedAt: NOW,
      agreementLink: 'https://cpq.example/esign/doc1/status',
      hasAttachment: true,
    });
    expect(mail.html).toContain('Everyone has signed the agreement');
    expect(mail.html).toContain('fully executed document attached to this email');
  });

  it('never promises an attachment that was dropped for size', () => {
    const mail = completion.buildCompletionEmail({
      documentName: 'Huge.pdf',
      creatorEmail: 'creator@cloudfuze.com',
      completedAt: NOW,
      agreementLink: 'https://cpq.example/esign/doc1/status',
      hasAttachment: false,
    });
    expect(mail.html).not.toContain('attached to this email');
    // The link is still there, so the creator can still reach the executed copy.
    expect(mail.html).toContain('https://cpq.example/esign/doc1/status');
  });

  it('omits the link block entirely when no link could be built', () => {
    const mail = completion.buildCompletionEmail({
      documentName: 'a.pdf', creatorEmail: 'c@x.com', completedAt: NOW,
      agreementLink: '', hasAttachment: true,
    });
    expect(mail.html).not.toContain('<a href');
    expect(mail.html).not.toContain('access the completed agreement here');
    expect(mail.html).toContain('fully executed document attached');
  });

  it('escapes a document name so an uploaded filename cannot inject markup', () => {
    const mail = completion.buildCompletionEmail({
      documentName: '<img src=x onerror=alert(1)>.pdf',
      creatorEmail: 'creator@cloudfuze.com',
      completedAt: NOW,
      agreementLink: 'https://cpq.example/esign/doc1/status',
    });
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x');
  });

  it('falls back to the address, then a neutral greeting, when there is no creator name', () => {
    expect(completion.buildCompletionEmail({
      documentName: 'a.pdf', creatorEmail: 'creator@cloudfuze.com', completedAt: NOW, agreementLink: 'x',
    }).html).toContain('Hi creator@cloudfuze.com,');
    expect(completion.buildCompletionEmail({
      documentName: 'a.pdf', completedAt: NOW, agreementLink: 'x',
    }).html).toContain('Hi there,');
  });
});

describe('zoho poller — completion email trigger', () => {
  // Case 1
  it('calls the notifier once the document reaches completed, after the status is persisted', async () => {
    const h = makeHarness([completedDoc()], [signer()], () => sentPatch());
    await h.poller.runOnce();

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ _id: 'doc1', status: 'completed' });
    // The status write lands before the notifier is called.
    expect(h.docPatches[0].patch).toMatchObject({ status: 'completed' });
    expect(h.docs[0].completion_email_sent_at).toEqual(NOW);
  });

  // Case 4
  it('sends exactly one email across repeated polls of a completed document', async () => {
    const h = makeHarness([completedDoc()], [signer()], () => sentPatch());
    await h.poller.runOnce();
    await h.poller.runOnce();
    await h.poller.runOnce();

    expect(h.calls).toHaveLength(1);
  });

  // Case 3
  it('does not call the notifier for a document already marked as emailed', async () => {
    const h = makeHarness(
      [completedDoc({ status: 'completed', zoho_request_status: 'completed', completion_email_sent_at: NOW })],
      [signer()],
      () => sentPatch(),
    );
    await h.poller.runOnce();

    expect(h.calls).toHaveLength(0);
  });

  // Case 5
  it('keeps the document completed when the email fails, and does not mark it sent', async () => {
    const failPatch = {
      completion_email_pending: true,
      completion_email_attempts: 1,
      completion_email_error: { reason: 'send-failed', at: NOW },
    };
    const h = makeHarness([completedDoc()], [signer()], () => failPatch);
    const summary = await h.poller.runOnce();

    expect(h.docs[0].status).toBe('completed');
    expect(h.docs[0].completion_email_sent_at).toBeUndefined();
    expect(h.docs[0].completion_email_pending).toBe(true);
    // The poll itself still counts as a successful, changed poll.
    expect(summary.failed).toBe(0);
    expect(summary.changed).toBe(1);
  });

  // Case 5 / 6: a throwing notifier must never take down the tick or the status.
  it('survives a notifier that throws, leaving the document completed', async () => {
    const h = makeHarness([completedDoc()], [signer()], () => { throw new Error('SendGrid exploded'); });
    const summary = await h.poller.runOnce();

    expect(h.docs[0].status).toBe('completed');
    expect(h.docs[0].completion_email_sent_at).toBeUndefined();
    expect(summary.failed).toBe(0);
  });

  // Case 6
  it('takes a document with no creator address out of the retry queue without marking it sent', async () => {
    const h = makeHarness(
      [completedDoc({ uploaded_by: 'Approval Workflow' })],
      [signer()],
      () => ({ completion_email_pending: false, completion_email_skipped_reason: 'no-creator-email' }),
    );
    await h.poller.runOnce();

    expect(h.docs[0].status).toBe('completed');
    expect(h.docs[0].completion_email_sent_at).toBeUndefined();
    expect(h.docs[0].completion_email_pending).toBe(false);
    expect(h.docs[0].completion_email_skipped_reason).toBe('no-creator-email');
  });

  it('flags the document as pending before the email is attempted, so a crash still retries', async () => {
    const h = makeHarness([completedDoc()], [signer()], () => null);
    await h.poller.runOnce();

    expect(h.docPatches[0].patch).toMatchObject({ status: 'completed', completion_email_pending: true });
  });

  it('does not notify when the document never reaches completed', async () => {
    const store = {
      docPatches: [] as { id: string; patch: Row }[],
      async findDueDocuments() { return [completedDoc()]; },
      async findRecipients() { return [signer({ status: 'viewed' })]; },
      async saveDocumentPatch() { /* ignored */ },
      async saveRecipientPatch() { /* ignored */ },
    };
    const calls: Doc[] = [];
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: { getRequest: async () => ({ request_status: 'inprogress', actions: [] }) },
      store,
      now: () => NOW,
      notifyCompleted: async (doc: Doc) => { calls.push(doc); return null; },
    });
    await p.runOnce();

    expect(calls).toHaveLength(0);
  });
});

describe('zoho poller — the back catalogue is never mailed', () => {
  /** A document that completed long before this feature existed: no completion_email_* fields,
   *  and re-selected only because its executed PDF was never stored. */
  const historicDoc = (): Doc => ({
    _id: 'old1',
    provider: 'zoho',
    status: 'completed',
    file_name: 'SignedLastYear.pdf',
    uploaded_by: 'creator@cloudfuze.com',
    zoho_request_id: 'reqOld',
    zoho_request_status: 'completed',
  });

  it('does not email a document that was already completed before this tick', async () => {
    const h = makeHarness([historicDoc()], [signer()], () => sentPatch());
    await h.poller.runOnce();

    expect(h.calls).toHaveLength(0);
    expect(h.docs[0].completion_email_pending).toBeUndefined();
  });

  it('still lets the signed-PDF self-heal branch fix a historic document, silently', async () => {
    const h = makeHarness([historicDoc()], [signer()], () => sentPatch());
    await h.poller.runOnce();

    // The PDF is stored — the pre-existing behaviour is untouched...
    expect(h.docs[0].signed_file_path).toBe('/signed/doc1.pdf');
    // ...but no completion email is triggered by it.
    expect(h.calls).toHaveLength(0);
  });

  it('does email a document that reaches completed on this tick', async () => {
    const h = makeHarness([completedDoc()], [signer()], () => sentPatch());
    await h.poller.runOnce();
    expect(h.calls).toHaveLength(1);
  });

  it('resumes a claim a previous tick opened, so a failed send is not lost', async () => {
    const h = makeHarness(
      [completedDoc({ status: 'completed', zoho_request_status: 'completed', completion_email_pending: true })],
      [signer()],
      () => sentPatch(),
    );
    await h.poller.runOnce();
    expect(h.calls).toHaveLength(1);
  });

  it('does not reconsider a document already abandoned for a permanent reason', async () => {
    const h = makeHarness(
      [completedDoc({
        status: 'completed',
        zoho_request_status: 'completed',
        completion_email_pending: false,
        completion_email_skipped_reason: 'no-creator-email',
      })],
      [signer()],
      () => sentPatch(),
    );
    await h.poller.runOnce();

    expect(h.calls).toHaveLength(0);
    expect(h.docs[0].completion_email_pending).toBe(false);
  });
});

describe('zoho poller — the retry budget cannot be escaped', () => {
  it('counts the attempt before the email is sent, in the status write itself', async () => {
    const h = makeHarness([completedDoc()], [signer()], () => sentPatch());
    await h.poller.runOnce();

    expect(h.docPatches[0].patch).toMatchObject({
      status: 'completed',
      completion_email_pending: true,
      completion_email_attempts: 1,
    });
  });

  it('does not resend without bound when the result write keeps failing after a successful send', async () => {
    const docs = [completedDoc()];
    const sends: string[] = [];
    let allowResultWrite = false;
    const store = {
      async findDueDocuments() { return docs; },
      async findRecipients() { return [signer()]; },
      async saveDocumentPatch(id: string, patch: Row) {
        // The email result write always fails; the status/attempt write always succeeds.
        if (!allowResultWrite && Object.prototype.hasOwnProperty.call(patch, 'completion_email_sent_at')) {
          throw new Error('ReplicaSetNoPrimary');
        }
        const row = docs.find((d) => d._id === id);
        if (row) Object.assign(row, patch);
      },
      async saveRecipientPatch() { /* not under test */ },
      async saveSignedPdf() { return { signed_file_path: '/signed/doc1.pdf' }; },
    };
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: { getRequest: async () => ({ request_status: 'completed', actions: [] }) },
      store,
      now: () => NOW,
      notifyCompleted: async (doc: Doc) => {
        // Mirrors the real handler: it only sends when evaluate says so.
        const decision = completion.evaluateCompletionEmail({
          doc,
          recipients: [signer()],
          creatorEmail: 'creator@cloudfuze.com',
          agreementLink: 'https://cpq.example/esign/doc1/status',
          signedFileAvailable: true,
        });
        if (!decision.send) return { completion_email_pending: false, completion_email_skipped_reason: decision.reason };
        sends.push(String(doc._id));
        return sentPatch();
      },
    });

    for (let tick = 0; tick < 40; tick += 1) await p.runOnce();

    // Without the pre-counted attempt this resends on every one of the 40 ticks.
    expect(sends.length).toBeLessThanOrEqual(completion.COMPLETION_EMAIL_MAX_ATTEMPTS);
    expect(docs[0].completion_email_attempts).toBe(completion.COMPLETION_EMAIL_MAX_ATTEMPTS);
    expect(docs[0].completion_email_skipped_reason).toBe('attempts-exhausted');
    expect(docs[0].status).toBe('completed');
    // And once the database recovers, the document is out of the queue rather than looping.
    allowResultWrite = true;
    await p.runOnce();
    expect(sends.length).toBeLessThanOrEqual(completion.COMPLETION_EMAIL_MAX_ATTEMPTS);
  });

  it('bounds a document that can never satisfy the send conditions', async () => {
    const docs = [completedDoc()];
    const store = {
      async findDueDocuments() { return docs; },
      async findRecipients() { return [signer({ status: 'viewed' })]; },
      async saveDocumentPatch(id: string, patch: Row) {
        const row = docs.find((d) => d._id === id);
        if (row) Object.assign(row, patch);
      },
      async saveRecipientPatch() { /* not under test */ },
      async saveSignedPdf() { return { signed_file_path: '/signed/doc1.pdf' }; },
    };
    let notifyCalls = 0;
    const p = poller.createZohoSignPoller({
      config: CONFIG,
      client: { getRequest: async () => ({ request_status: 'completed', actions: [] }) },
      store,
      now: () => NOW,
      notifyCompleted: async (doc: Doc) => {
        notifyCalls += 1;
        const decision = completion.evaluateCompletionEmail({
          doc,
          recipients: [signer({ status: 'viewed' })],
          creatorEmail: 'creator@cloudfuze.com',
          agreementLink: 'https://cpq.example/esign/doc1/status',
          signedFileAvailable: true,
        });
        return decision.permanent
          ? { completion_email_pending: false, completion_email_skipped_reason: decision.reason }
          : { completion_email_pending: true };
      },
    });

    for (let tick = 0; tick < 40; tick += 1) await p.runOnce();

    // A deferral is an attempt too, or a permanently stuck document polls Zoho forever.
    expect(notifyCalls).toBeLessThanOrEqual(completion.COMPLETION_EMAIL_MAX_ATTEMPTS);
    expect(docs[0].completion_email_pending).toBe(false);
    expect(docs[0].completion_email_sent_at).toBeUndefined();
    expect(docs[0].status).toBe('completed');
  });
});

describe('esign-completion-email — address and subject hardening', () => {
  it('rejects a display-name address that would redirect the agreement link', () => {
    // `uploaded_by` is written verbatim from an unauthenticated upload body.
    expect(completion.isDeliverableCreatorEmail('"CloudFuze Finance" <attacker@example.com>')).toBe(false);
    expect(completion.isDeliverableCreatorEmail('creator@cloudfuze.com, attacker@example.com')).toBe(false);
    expect(completion.isDeliverableCreatorEmail('<attacker@example.com>')).toBe(false);
    expect(completion.isDeliverableCreatorEmail('creator@cloudfuze.com')).toBe(true);
  });

  it('refuses to send to an address that is not a single plain mailbox', () => {
    const base = {
      doc: { status: 'completed' },
      recipients: [signer()],
      agreementLink: 'https://cpq.example/esign/doc1/status',
      signedFileAvailable: true,
    };
    expect(completion.evaluateCompletionEmail({ ...base, creatorEmail: '"X" <attacker@example.com>' }))
      .toMatchObject({ send: false, permanent: true, reason: 'no-creator-email' });
  });

  it('caps and cleans the subject so an uploaded filename cannot run away with it', () => {
    const long = `${'a'.repeat(500)}.pdf`;
    const mail = completion.buildCompletionEmail({
      documentName: long, creatorEmail: 'c@x.com', completedAt: NOW, agreementLink: 'x',
    });
    expect(mail.subject.length).toBeLessThan(160);
    // Control characters and bidi overrides are stripped, not carried into the header.
    expect(completion.sanitizeSubjectFileName('a‮b\u0000c\r\nd')).toBe('a b c d');
  });

  it('treats a corrupt attempt counter as exhausted rather than as zero', () => {
    const decision = completion.evaluateCompletionEmail({
      doc: { status: 'completed', completion_email_attempts: 'lots' },
      recipients: [signer()],
      creatorEmail: 'creator@cloudfuze.com',
      agreementLink: 'https://cpq.example/esign/doc1/status',
      signedFileAvailable: true,
    });
    expect(decision).toMatchObject({ send: false, permanent: true, reason: 'attempts-exhausted' });
  });
});

describe('zoho poller — completion email retry selection', () => {
  it('re-selects a completed document whose completion email has not gone out', () => {
    const q = poller.buildDueDocumentsQuery(NOW);
    const stateBranch = q.$and[0].$or;
    expect(stateBranch).toContainEqual({ zoho_request_status: 'completed', completion_email_pending: true });
  });

  it('leaves the existing selection branches untouched', () => {
    const q = poller.buildDueDocumentsQuery(NOW);
    const stateBranch = q.$and[0].$or;
    expect(stateBranch[0]).toEqual({ zoho_request_status: { $in: ['draft', 'inprogress'] } });
    expect(stateBranch[1]).toEqual({ zoho_request_status: 'completed', signed_file_path: { $exists: false } });
    expect(q.provider).toBe('zoho');
  });

  it('does not re-select documents completed before the feature existed', () => {
    const q = poller.buildDueDocumentsQuery(NOW);
    const branch = q.$and[0].$or.find(
      (b: Row) => Object.prototype.hasOwnProperty.call(b, 'completion_email_pending'),
    );
    // `true`, not `$exists: false` — a historic row carries no flag and is never picked up,
    // so turning this on cannot mail out every agreement ever completed.
    expect(branch.completion_email_pending).toBe(true);
  });
});
