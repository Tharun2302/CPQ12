import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import sender from '../../zoho-sign-send.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import zohoConfig from '../../zoho-sign-config.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import zohoAuth from '../../zoho-sign-auth.cjs';

// Everything below is a fake. There is no MongoDB connection and no socket in this file, and
// that is not a convenience — the MONGODB_URI in .env IS the live production database
// (design §12.6), so the send path must be provable without ever running against it.
//
// The behaviours worth failing a build over:
//   1. the Zoho request id is persisted BEFORE submit, so a crash cannot orphan a request;
//   2. a Zoho 429 never marks the document sent;
//   3. an action id is matched to the right recipient even when Zoho reorders its echo;
//   4. no response body or stored error carries a credential.

type SendResult = { status: number; body: Record<string, any> };

const {
  ZOHO_MAX_PDF_BYTES,
  ZOHO_SEND_CLAIM_TTL_MS,
  isValidObjectIdString,
  isZohoManagedDocument,
  validateZohoSendOptions,
  checkDocumentSendable,
  creatorNote,
  matchZohoActionIds,
  normalizeZohoDocumentIds,
  httpStatusForZohoError,
  createZohoSignSender,
} = sender as {
  ZOHO_MAX_PDF_BYTES: number;
  ZOHO_SEND_CLAIM_TTL_MS: number;
  isValidObjectIdString: (value: unknown) => boolean;
  isZohoManagedDocument: (doc: unknown) => boolean;
  validateZohoSendOptions: (body: unknown) => { errors: string[]; options: Record<string, unknown> };
  checkDocumentSendable: (doc: unknown) => { status: number; error: string; code: string } | null;
  creatorNote: (name: unknown, email: unknown) => string;
  matchZohoActionIds: (zohoActions: unknown, mapped: unknown) => { actionIds: string[]; unmatched: string[] };
  normalizeZohoDocumentIds: (request: unknown) => Array<{ document_id: string; document_name: string; total_pages: number }>;
  httpStatusForZohoError: (error: unknown) => number;
  createZohoSignSender: (deps: Record<string, unknown>) => { send: (input: Record<string, unknown>) => Promise<SendResult> };
};

const { resolveZohoSignConfig } = zohoConfig as {
  resolveZohoSignConfig: (env: Record<string, string>) => Record<string, any>;
};
const { ZOHO_ERROR_CODES, zohoSignError } = zohoAuth as {
  ZOHO_ERROR_CODES: Record<string, string>;
  zohoSignError: (code: string, message: string, extra?: Record<string, unknown>) => Error & Record<string, unknown>;
};

const CLIENT_SECRET = 'zoho-client-secret-value-0001';
const REFRESH_TOKEN = 'zoho-refresh-token-value-0001';

const DOC_ID = '507f1f77bcf86cd799439011';
const SIGNER_ID = '507f191e810c19729de860aa';
const REVIEWER_ID = '507f191e810c19729de860bb';
const CREATOR = 'Anush.Dasari@cloudfuze.com';

function workingConfig(overrides: Record<string, string> = {}) {
  return resolveZohoSignConfig({
    ZOHO_SIGN_ENABLED: '1',
    ZOHO_SIGN_DC: 'us',
    ZOHO_SIGN_CLIENT_ID: 'client-id-0001',
    ZOHO_SIGN_CLIENT_SECRET: CLIENT_SECRET,
    ZOHO_SIGN_REFRESH_TOKEN: REFRESH_TOKEN,
    ...overrides,
  });
}

function draftDocument(overrides: Record<string, unknown> = {}) {
  return {
    _id: DOC_ID,
    file_name: 'Order Form.pdf',
    file_data: Buffer.from('%PDF-1.4 fake').toString('base64'),
    uploaded_by: CREATOR,
    status: 'draft',
    ...overrides,
  };
}

function recipients() {
  return [
    { _id: SIGNER_ID, name: 'Dana Signer', email: 'dana@example.com', order: 0, action: 'signer' },
    { _id: REVIEWER_ID, name: 'Rex Reviewer', email: 'rex@example.com', order: 1, action: 'reviewer' },
  ];
}

function fields() {
  return [
    { _id: 'f1', document_id: DOC_ID, recipient_id: SIGNER_ID, page: 1, type: 'signature', xNorm: 0.1, yNorm: 0.8, widthNorm: 0.25, heightNorm: 0.05 },
    { _id: 'f2', document_id: DOC_ID, recipient_id: REVIEWER_ID, page: 1, type: 'date', xNorm: 0.6, yNorm: 0.8, widthNorm: 0.2, heightNorm: 0.03 },
  ];
}

/** Records every write in order, so "persisted before submit" is an assertion and not a hope. */
function makeStore(overrides: Record<string, unknown> = {}, sharedCalls?: string[]) {
  const calls: string[] = sharedCalls || [];
  const writes: Record<string, any> = { request: null, sent: null, error: null, recipients: [] as any[] };
  // Stands in for the Mongo compare-and-set: the check and the write happen with no await
  // between them, so exactly one of any number of concurrent callers wins, as one updateOne does.
  const claimState: { claim: { token: string; at: Date } | null } = { claim: null };
  const base = {
    calls,
    writes,
    claimState,
    claimSend: vi.fn(async (_id: string, claim: { token: string; at: Date; staleBefore: Date }) => {
      calls.push('claimSend');
      if (writes.request) return false;
      if (claimState.claim && claimState.claim.at >= claim.staleBefore) return false;
      claimState.claim = { token: claim.token, at: claim.at };
      return true;
    }),
    releaseSend: vi.fn(async (_id: string, token: string) => {
      calls.push('releaseSend');
      if (claimState.claim && claimState.claim.token === token) claimState.claim = null;
    }),
    findDocument: vi.fn(async () => draftDocument()),
    findRecipients: vi.fn(async () => recipients()),
    findFields: vi.fn(async () => fields()),
    loadPdf: vi.fn(async () => ({ buffer: Buffer.from('%PDF-1.4 fake'), fileName: 'Order Form.pdf' })),
    resolvePageSizes: vi.fn(async () => ({ 1: { width: 612, height: 792 } })),
    saveZohoRequest: vi.fn(async (_id: string, patch: any, token?: string) => {
      calls.push('saveZohoRequest');
      if (writes.request || !claimState.claim || claimState.claim.token !== token) return false;
      writes.request = patch;
      return true;
    }),
    saveRecipientAction: vi.fn(async (id: string, patch: any) => { calls.push('saveRecipientAction'); writes.recipients.push({ id, patch }); }),
    saveSent: vi.fn(async (_id: string, patch: any) => { calls.push('saveSent'); writes.sent = patch; }),
    saveError: vi.fn(async (_id: string, patch: any) => { calls.push('saveError'); writes.error = patch; }),
  };
  return Object.assign(base, overrides);
}

function makeClient(overrides: Record<string, unknown> = {}, calls: string[] = []) {
  return Object.assign({
    createRequest: vi.fn(async () => {
      calls.push('createRequest');
      return {
        request_id: '9000000012345',
        request_status: 'draft',
        document_ids: [{ document_id: 'doc-77', document_name: 'Order Form.pdf', total_pages: 1 }],
        actions: [
          { action_id: 'act-dana', recipient_email: 'dana@example.com' },
          { action_id: 'act-rex', recipient_email: 'rex@example.com' },
        ],
      };
    }),
    submitRequest: vi.fn(async () => { calls.push('submitRequest'); return { request_status: 'inprogress' }; }),
  }, overrides);
}

function buildSender(opts: { config?: Record<string, any>; store?: any; client?: any; logAudit?: any; calls?: string[] } = {}) {
  // One shared call log, so the client calls and the store writes interleave in real order.
  const calls = opts.calls || (opts.store && opts.store.calls) || [];
  const store = opts.store || makeStore({}, calls);
  const client = opts.client || makeClient({}, calls);
  return {
    store,
    client,
    service: createZohoSignSender({
      config: opts.config || workingConfig(),
      client,
      store,
      logAudit: opts.logAudit,
      now: () => new Date('2026-09-14T10:00:00.000Z'),
    }),
  };
}

describe('zoho-sign-send: input validation', () => {
  it('accepts a 24-hex id and rejects anything else', () => {
    expect(isValidObjectIdString(DOC_ID)).toBe(true);
    expect(isValidObjectIdString('not-an-id')).toBe(false);
    expect(isValidObjectIdString('507f1f77bcf86cd79943901')).toBe(false);
    expect(isValidObjectIdString(null)).toBe(false);
  });

  it('omits absent options rather than inventing defaults', () => {
    expect(validateZohoSendOptions({})).toEqual({ errors: [], options: {} });
    expect(validateZohoSendOptions(undefined).options).toEqual({});
  });

  it('accepts a well-formed body', () => {
    const result = validateZohoSendOptions({
      expiration_days: 15, is_sequential: true, email_reminders: false, reminder_period: 5, notes: ' hello ',
    });
    expect(result.errors).toEqual([]);
    expect(result.options).toEqual({
      expirationDays: 15, isSequential: true, emailReminders: false, reminderPeriod: 5, notes: 'hello',
    });
  });

  it('rejects an out-of-range or non-integer expiration_days', () => {
    expect(validateZohoSendOptions({ expiration_days: 0 }).errors).toHaveLength(1);
    expect(validateZohoSendOptions({ expiration_days: 91 }).errors).toHaveLength(1);
    expect(validateZohoSendOptions({ expiration_days: 1.5 }).errors).toHaveLength(1);
    expect(validateZohoSendOptions({ expiration_days: 'soon' }).errors).toHaveLength(1);
  });

  it('rejects a stringy boolean instead of coercing it', () => {
    // "false" is truthy in JS; coercing it would send the contract to everyone at once.
    expect(validateZohoSendOptions({ is_sequential: 'false' }).errors).toHaveLength(1);
    expect(validateZohoSendOptions({ email_reminders: 1 }).errors).toHaveLength(1);
  });

  it('caps notes and request_name instead of letting them through', () => {
    const result = validateZohoSendOptions({ notes: 'n'.repeat(900), request_name: 'r'.repeat(900) });
    expect(result.errors).toEqual([]);
    expect(String(result.options.notes)).toHaveLength(500);
    expect(String(result.options.requestName)).toHaveLength(200);
  });
});

describe('zoho-sign-send: document preconditions', () => {
  it('lets a draft through', () => {
    expect(checkDocumentSendable(draftDocument())).toBeNull();
  });

  it('refuses a document that already has a Zoho request id', () => {
    const result = checkDocumentSendable(draftDocument({ zoho_request_id: '9000000012345' }));
    expect(result?.status).toBe(409);
    expect(result?.code).toBe('ZOHO_ALREADY_SENT');
  });

  it('refuses a document already marked as a Zoho document even without an id', () => {
    expect(checkDocumentSendable(draftDocument({ provider: 'zoho' }))?.status).toBe(409);
  });

  it('refuses an already-sent document with 409 and any other status with 400', () => {
    expect(checkDocumentSendable(draftDocument({ status: 'sent' }))?.status).toBe(409);
    expect(checkDocumentSendable(draftDocument({ status: 'completed' }))?.status).toBe(400);
    expect(checkDocumentSendable(draftDocument({ status: 'voided' }))?.status).toBe(400);
  });
});

describe('zoho-sign-send: Zoho response handling', () => {
  it('matches action ids by email even when Zoho reorders its echo', () => {
    const echoed = [
      { action_id: 'act-rex', recipient_email: 'REX@example.com' },
      { action_id: 'act-dana', recipient_email: 'dana@example.com' },
    ];
    const mapped = [{ recipient_email: 'dana@example.com' }, { recipient_email: 'rex@example.com' }];
    expect(matchZohoActionIds(echoed, mapped)).toEqual({ actionIds: ['act-dana', 'act-rex'], unmatched: [] });
  });

  it('falls back to position when Zoho omits the email', () => {
    const echoed = [{ action_id: 'a1' }, { action_id: 'a2' }];
    const mapped = [{ recipient_email: 'dana@example.com' }, { recipient_email: 'rex@example.com' }];
    expect(matchZohoActionIds(echoed, mapped).actionIds).toEqual(['a1', 'a2']);
  });

  it('reports a recipient Zoho gave no action id for', () => {
    const result = matchZohoActionIds([{ action_id: 'a1', recipient_email: 'dana@example.com' }], [
      { recipient_email: 'dana@example.com' }, { recipient_email: 'rex@example.com' },
    ]);
    expect(result.unmatched).toEqual(['rex@example.com']);
  });

  it('normalises document_ids and drops entries with no id', () => {
    expect(normalizeZohoDocumentIds({
      document_ids: [{ document_id: 'd1', document_name: 'a.pdf', total_pages: '3' }, { document_name: 'orphan' }],
    })).toEqual([{ document_id: 'd1', document_name: 'a.pdf', total_pages: 3 }]);
    expect(normalizeZohoDocumentIds(null)).toEqual([]);
  });

  it('maps Zoho error codes onto HTTP statuses, defaulting to 502', () => {
    expect(httpStatusForZohoError({ code: ZOHO_ERROR_CODES.RATE_LIMITED })).toBe(429);
    expect(httpStatusForZohoError({ code: ZOHO_ERROR_CODES.NOT_CONFIGURED })).toBe(503);
    expect(httpStatusForZohoError({ code: ZOHO_ERROR_CODES.AUTH_FAILED })).toBe(502);
    expect(httpStatusForZohoError({ code: ZOHO_ERROR_CODES.NOT_FOUND })).toBe(502);
    expect(httpStatusForZohoError(null)).toBe(502);
  });
});

describe('zoho-sign-send: the send sequence', () => {
  it('sends, and persists the Zoho request id BEFORE submitting', async () => {
    const calls: string[] = [];
    const store = makeStore({}, calls);
    const client = makeClient({}, calls);
    const audit = vi.fn(async () => undefined);
    const { service } = buildSender({ store, client, calls, logAudit: audit });

    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {}, ip: '10.0.0.1' });

    expect(result.status).toBe(200);
    expect(calls).toEqual(['claimSend', 'createRequest', 'saveZohoRequest', 'releaseSend', 'submitRequest', 'saveRecipientAction', 'saveRecipientAction', 'saveSent']);
    expect(calls.indexOf('saveZohoRequest')).toBeLessThan(calls.indexOf('submitRequest'));
    expect(store.writes.request).toMatchObject({
      provider: 'zoho',
      zoho_request_id: '9000000012345',
      zoho_dc: 'us',
      zoho_document_ids: [{ document_id: 'doc-77', document_name: 'Order Form.pdf', total_pages: 1 }],
    });
    expect(store.writes.sent).toMatchObject({ status: 'sent', zoho_request_status: 'inprogress' });
    expect(audit).toHaveBeenCalledWith(DOC_ID, 'sent', CREATOR, '10.0.0.1', expect.objectContaining({
      provider: 'zoho', zoho_request_id: '9000000012345',
    }));
  });

  it('returns the recipients with their Zoho action ids and types', async () => {
    const { service, store } = buildSender();
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });

    expect(result.body.recipients).toEqual([
      { id: SIGNER_ID, email: 'dana@example.com', zoho_action_id: 'act-dana', zoho_action_type: 'SIGN' },
      { id: REVIEWER_ID, email: 'rex@example.com', zoho_action_id: 'act-rex', zoho_action_type: 'APPROVER' },
    ]);
    expect(store.writes.recipients.map((r: any) => r.patch.zoho_action_id)).toEqual(['act-dana', 'act-rex']);
  });

  it('stamps the Zoho document_id onto every field, which is only knowable after create', async () => {
    const calls: string[] = [];
    const client = makeClient({}, calls);
    const { service } = buildSender({ client, calls });
    await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });

    const payload = (client.submitRequest as any).mock.calls[0][1];
    const allFields = payload.requests.actions.flatMap((a: any) => a.fields);
    expect(allFields).toHaveLength(2);
    expect(allFields.every((f: any) => f.document_id === 'doc-77')).toBe(true);
    // CPQ page 1 is Zoho page_no 0. An untested conversion puts every field one page out.
    expect(allFields.every((f: any) => f.page_no === 0)).toBe(true);
  });

  it("submits full writable action attributes and never a read-only key from Zoho's own echo", async () => {
    // VERIFIED LIVE 2026-09-14: {action_id, fields} alone is refused with the generic 9039, and
    // handing Zoho's echoed action back verbatim is refused with 9043 "Extra key found". The
    // echo below carries the read-only keys Zoho really sends.
    const calls: string[] = [];
    const client = makeClient({
      createRequest: vi.fn(async () => {
        calls.push('createRequest');
        return {
          request_id: '9000000012345',
          request_status: 'draft',
          document_ids: [{ document_id: 'doc-77', document_name: 'Order Form.pdf', total_pages: 1 }],
          actions: [
            { action_id: 'act-dana', recipient_email: 'dana@example.com', action_status: 'NOTACTIONYET', delivery_mode: 'EMAIL', is_bulk: false, cloud_provider_name: 'Other', recipient_phonenumber: '' },
            { action_id: 'act-rex', recipient_email: 'rex@example.com', action_status: 'NOTACTIONYET', delivery_mode: 'EMAIL', is_bulk: false, cloud_provider_name: 'Other', recipient_phonenumber: '' },
          ],
        };
      }),
    }, calls);
    const { service } = buildSender({ client, calls });
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });
    expect(result.status).toBe(200);

    const payload = (client.submitRequest as any).mock.calls[0][1];
    const [signer, reviewer] = payload.requests.actions;

    expect(signer).toMatchObject({
      action_id: 'act-dana',
      action_type: 'SIGN',
      recipient_name: 'Dana Signer',
      recipient_email: 'dana@example.com',
      signing_order: 0,
      verify_recipient: false,
    });
    expect(reviewer).toMatchObject({ action_id: 'act-rex', action_type: 'APPROVER', signing_order: 1 });

    const READ_ONLY = [
      'action_status', 'cloud_provider_name', 'cloud_provider_id', 'is_bulk', 'is_signing_group',
      'delivery_mode', 'send_completed_document', 'recipient_countrycode', 'recipient_countrycode_iso',
      'recipient_phonenumber',
    ];
    payload.requests.actions.forEach((action: any) => {
      READ_ONLY.forEach((key) => expect(action).not.toHaveProperty(key));
      action.fields.forEach((field: any) => {
        expect(field).not.toHaveProperty('field_category');
        expect(typeof field.abs_width).toBe('number');
        expect(typeof field.abs_height).toBe('number');
      });
    });
  });

  it('carries the creator-supplied options into the create payload', async () => {
    const calls: string[] = [];
    const client = makeClient({}, calls);
    const { service } = buildSender({ client, calls });
    await service.send({
      documentId: DOC_ID,
      actorEmail: CREATOR,
      body: { expiration_days: 12, is_sequential: false, email_reminders: true, reminder_period: 3, request_name: 'Q4 Order Form' },
    });

    const { data } = (client.createRequest as any).mock.calls[0][0];
    expect(data.requests).toMatchObject({
      request_name: 'Q4 Order Form', expiration_days: 12, is_sequential: false, email_reminders: true, reminder_period: 3,
    });
    expect(data.requests.actions).toHaveLength(2);
  });
});

describe('zoho-sign-send: refusals', () => {
  it('returns 503 when Zoho Sign is switched off', async () => {
    const { service, client } = buildSender({ config: workingConfig({ ZOHO_SIGN_ENABLED: '' }) });
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('ZOHO_DISABLED');
    expect(client.createRequest).not.toHaveBeenCalled();
  });

  it('returns 503 naming the missing env keys, and never their values', async () => {
    const { service } = buildSender({
      config: workingConfig({ ZOHO_SIGN_REFRESH_TOKEN: '', ZOHO_SIGN_CLIENT_SECRET: '' }),
    });
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });
    expect(result.status).toBe(503);
    expect(result.body.missing_keys).toEqual(['ZOHO_SIGN_CLIENT_SECRET', 'ZOHO_SIGN_REFRESH_TOKEN']);
    expect(JSON.stringify(result.body)).not.toContain(REFRESH_TOKEN);
  });

  it('returns 400 for a malformed document id before any lookup', async () => {
    const { service, store } = buildSender();
    const result = await service.send({ documentId: 'drop-table', actorEmail: CREATOR, body: {} });
    expect(result.status).toBe(400);
    expect(store.findDocument).not.toHaveBeenCalled();
  });

  it('returns 400 and does not call Zoho when the body is invalid', async () => {
    const { service, client } = buildSender();
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: { expiration_days: 400 } });
    expect(result.status).toBe(400);
    expect(result.body.details).toHaveLength(1);
    expect(client.createRequest).not.toHaveBeenCalled();
  });

  it('returns 404 for a document that does not exist', async () => {
    const store = makeStore({ findDocument: vi.fn(async () => null) });
    const { service } = buildSender({ store });
    expect((await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} })).status).toBe(404);
  });

  it('returns 403 for anyone who is not the document creator', async () => {
    const { service, client } = buildSender();
    const result = await service.send({ documentId: DOC_ID, actorEmail: 'someone.else@cloudfuze.com', body: {} });
    expect(result.status).toBe(403);
    expect(client.createRequest).not.toHaveBeenCalled();
  });

  it('accepts the creator of an approval-generated document via requested_by_email', async () => {
    const store = makeStore({
      findDocument: vi.fn(async () => draftDocument({ uploaded_by: 'Anush Dasari', requested_by_email: CREATOR })),
    });
    const { service } = buildSender({ store });
    expect((await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} })).status).toBe(200);
  });

  it('returns 409 rather than creating a second Zoho request for the same contract', async () => {
    const store = makeStore({ findDocument: vi.fn(async () => draftDocument({ zoho_request_id: '9000000012345', provider: 'zoho' })) });
    const { service, client } = buildSender({ store });
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });
    expect(result.status).toBe(409);
    expect(client.createRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when the document has no recipients', async () => {
    const store = makeStore({ findRecipients: vi.fn(async () => []) });
    const { service, client } = buildSender({ store });
    expect((await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} })).status).toBe(400);
    expect(client.createRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when a recipient list exceeds Zoho 25-recipient ceiling', async () => {
    const many = Array.from({ length: 26 }, (_, i) => ({
      _id: `${i}`.padStart(24, '0'), name: `P${i}`, email: `p${i}@example.com`, order: i, action: 'signer',
    }));
    const store = makeStore({ findRecipients: vi.fn(async () => many) });
    const { service, client } = buildSender({ store });
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('25');
    expect(client.createRequest).not.toHaveBeenCalled();
  });

  it('returns 400 naming a signer with no fields, before anything exists at Zoho', async () => {
    // Zoho rejects any non-VIEW action with no fields. Catching it late leaves an orphaned
    // draft in the Zoho account that nothing in CPQ ever cleans up.
    const store = makeStore({ findFields: vi.fn(async () => fields().slice(0, 1)) });
    const { service, client } = buildSender({ store });
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });
    expect(result.status).toBe(400);
    expect(result.body.recipients_without_fields).toEqual(['rex@example.com']);
    expect(client.createRequest).not.toHaveBeenCalled();
  });

  it('returns 404 when the PDF cannot be resolved from disk or base64', async () => {
    const store = makeStore({ loadPdf: vi.fn(async () => null) });
    const { service } = buildSender({ store });
    expect((await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} })).status).toBe(404);
  });

  it('returns 413 for a PDF over Zoho 25 MB single-document limit', async () => {
    const store = makeStore({
      loadPdf: vi.fn(async () => ({ buffer: Buffer.alloc(ZOHO_MAX_PDF_BYTES + 1), fileName: 'big.pdf' })),
    });
    const { service, client } = buildSender({ store });
    expect((await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} })).status).toBe(413);
    expect(client.createRequest).not.toHaveBeenCalled();
  });
});

describe('zoho-sign-send: Zoho failures', () => {
  it('never marks the document sent on a 429, and records a retryable error', async () => {
    const rateLimited = zohoSignError(ZOHO_ERROR_CODES.RATE_LIMITED, 'Zoho Sign is rate limiting us.');
    const client = makeClient({ createRequest: vi.fn(async () => { throw rateLimited; }) });
    const { service, store } = buildSender({ client });

    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });

    expect(result.status).toBe(429);
    expect(store.saveSent).not.toHaveBeenCalled();
    expect(store.saveZohoRequest).not.toHaveBeenCalled();
    expect(store.writes.error).toMatchObject({ code: ZOHO_ERROR_CODES.RATE_LIMITED });
    expect(client.submitRequest).not.toHaveBeenCalled();
  });

  it('surfaces an auth failure as 502 without ever exposing a credential', async () => {
    const authFailed = zohoSignError(ZOHO_ERROR_CODES.AUTH_FAILED, 'Zoho Sign rejected our credentials.', {
      zohoMessage: `token ${REFRESH_TOKEN} rejected`,
    });
    const client = makeClient({ createRequest: vi.fn(async () => { throw authFailed; }) });
    const { service, store } = buildSender({ client });

    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });

    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).not.toContain(REFRESH_TOKEN);
    expect(JSON.stringify(result.body)).not.toContain(CLIENT_SECRET);
    // zoho_last_error is rendered in the UI, so Zoho's raw message must not reach it either.
    expect(JSON.stringify(store.writes.error)).not.toContain(REFRESH_TOKEN);
  });

  it('returns 502 and keeps the document recoverable when Zoho returns no request id', async () => {
    const client = makeClient({ createRequest: vi.fn(async () => ({ request_status: 'draft' })) });
    const { service, store } = buildSender({ client });
    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });
    expect(result.status).toBe(502);
    expect(store.saveZohoRequest).not.toHaveBeenCalled();
    expect(store.saveSent).not.toHaveBeenCalled();
  });

  it('leaves the persisted request id in place when submit fails, so the draft is recoverable', async () => {
    const client = makeClient({
      submitRequest: vi.fn(async () => { throw zohoSignError(ZOHO_ERROR_CODES.SERVER_ERROR, 'Zoho Sign is having trouble.'); }),
    });
    const { service, store } = buildSender({ client });

    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });

    expect(result.status).toBe(502);
    expect(result.body.zoho_request_id).toBe('9000000012345');
    expect(store.saveZohoRequest).toHaveBeenCalled();
    expect(store.saveSent).not.toHaveBeenCalled();
    expect(store.writes.error).toMatchObject({ code: ZOHO_ERROR_CODES.SERVER_ERROR });
  });

  it('refuses to submit when Zoho returns no action id for a recipient', async () => {
    const client = makeClient({
      createRequest: vi.fn(async () => ({
        request_id: '9000000012345',
        document_ids: [{ document_id: 'doc-77', document_name: 'a.pdf', total_pages: 1 }],
        actions: [{ action_id: 'act-dana', recipient_email: 'dana@example.com' }],
      })),
    });
    const { service, store } = buildSender({ client });

    const result = await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });

    expect(result.status).toBe(502);
    expect(result.body.error).toContain('rex@example.com');
    expect(client.submitRequest).not.toHaveBeenCalled();
    expect(store.saveSent).not.toHaveBeenCalled();
  });

  it('still sends when the page sizes cannot be read', async () => {
    const store = makeStore({ resolvePageSizes: vi.fn(async () => { throw new Error('corrupt pdf header'); }) });
    const { service } = buildSender({ store });
    expect((await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} })).status).toBe(200);
  });

  it('still reports success when the audit write fails', async () => {
    const { service } = buildSender({ logAudit: vi.fn(async () => { throw new Error('audit_logs unavailable'); }) });
    expect((await service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} })).status).toBe(200);
  });
});

// Two sends for one document arriving together both pass the findDocument read, because neither
// has persisted a Zoho request id yet. Before the atomic claim, both created an envelope and the
// signer received every Zoho email twice.
describe('zoho-sign-send: concurrent sends of the same document', () => {
  const send = (service: { send: (input: Record<string, unknown>) => Promise<SendResult> }) =>
    service.send({ documentId: DOC_ID, actorEmail: CREATOR, body: {} });

  it('creates exactly one Zoho request when two sends arrive at the same time', async () => {
    const calls: string[] = [];
    const store = makeStore({}, calls);
    const client = makeClient({}, calls);
    const { service } = buildSender({ store, client, calls });

    const results = await Promise.all([send(service), send(service)]);

    // Both got past the read check, so this really is the race and not a sequential repeat.
    expect(store.findDocument).toHaveBeenCalledTimes(2);
    expect(store.claimSend).toHaveBeenCalledTimes(2);
    expect(client.createRequest).toHaveBeenCalledTimes(1);
    expect(client.submitRequest).toHaveBeenCalledTimes(1);
    expect(store.saveZohoRequest).toHaveBeenCalledTimes(1);
    expect(store.saveSent).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('answers the losing request with the existing "already sent" response', async () => {
    const { service, store } = buildSender();

    const [first, second] = await Promise.all([send(service), send(service)]);
    const loser = first.status === 409 ? first : second;
    const winner = first.status === 409 ? second : first;
    const { status: alreadySentStatus, ...alreadySent } = checkDocumentSendable({ provider: 'zoho' })!;

    expect(winner.body.document.zoho_request_id).toBe('9000000012345');
    expect(loser.status).toBe(alreadySentStatus);
    expect(loser.body).toEqual({ success: false, ...alreadySent });
    expect(loser.body.code).toBe('ZOHO_ALREADY_SENT');
    // Only the winner releases, and only after its request id is saved; the loser writes nothing.
    expect(store.saveError).not.toHaveBeenCalled();
    expect(store.releaseSend).toHaveBeenCalledTimes(1);
  });

  it('still sends only once when five sends arrive together', async () => {
    const { service, client } = buildSender();
    const results = await Promise.all(Array.from({ length: 5 }, () => send(service)));
    expect(client.createRequest).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.code === 'ZOHO_ALREADY_SENT')).toHaveLength(4);
  });

  it('claims with a unique token and a stale cutoff one TTL before now', async () => {
    const { service, store } = buildSender();
    await send(service);

    const [id, claim] = store.claimSend.mock.calls[0];
    const at = new Date('2026-09-14T10:00:00.000Z');
    expect(id).toBe(DOC_ID);
    expect(typeof claim.token).toBe('string');
    expect(claim.token.length).toBeGreaterThan(0);
    expect(claim.at).toEqual(at);
    expect(claim.staleBefore).toEqual(new Date(at.getTime() - ZOHO_SEND_CLAIM_TTL_MS));
  });

  it('does not claim when validation fails, so a fixed document can still be sent', async () => {
    const store = makeStore({ findRecipients: vi.fn(async () => []) });
    const { service } = buildSender({ store });
    expect((await send(service)).status).toBe(400);
    expect(store.claimSend).not.toHaveBeenCalled();
  });

  it('releases the claim when Zoho refuses the create, so the user can retry', async () => {
    const calls: string[] = [];
    const store = makeStore({}, calls);
    const good = makeClient({}, calls);
    let attempt = 0;
    const client = makeClient({
      createRequest: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw zohoSignError(ZOHO_ERROR_CODES.RATE_LIMITED, 'Zoho Sign is rate limiting us.');
        return good.createRequest();
      }),
    }, calls);
    const { service } = buildSender({ store, client, calls });

    expect((await send(service)).status).toBe(429);
    expect(store.releaseSend).toHaveBeenCalledWith(DOC_ID, store.claimSend.mock.calls[0][1].token);
    expect(store.claimState.claim).toBeNull();

    expect((await send(service)).status).toBe(200);
  });

  it('releases the claim when Zoho returns no request id', async () => {
    const client = makeClient({ createRequest: vi.fn(async () => ({ request_status: 'draft' })) });
    const { service, store } = buildSender({ client });
    expect((await send(service)).status).toBe(502);
    expect(store.releaseSend).toHaveBeenCalledTimes(1);
    expect(store.claimState.claim).toBeNull();
  });

  it('once the request id is saved, a retry after a failed submit is refused without a new envelope', async () => {
    const client = makeClient({
      submitRequest: vi.fn(async () => { throw zohoSignError(ZOHO_ERROR_CODES.SERVER_ERROR, 'Zoho Sign is having trouble.'); }),
    });
    const store = makeStore();
    // The real findDocument would now see the saved request id.
    store.findDocument.mockImplementation(async () => draftDocument(store.writes.request || {}));
    const { service } = buildSender({ client, store });
    expect((await send(service)).status).toBe(502);
    expect((await send(service)).body.code).toBe('ZOHO_ALREADY_SENT');
    expect(client.createRequest).toHaveBeenCalledTimes(1);
  });

  it('takes over a claim left stale by a crashed send', async () => {
    const { service, store } = buildSender();
    store.claimState.claim = { token: 'dead', at: new Date(new Date('2026-09-14T10:00:00.000Z').getTime() - ZOHO_SEND_CLAIM_TTL_MS - 1) };
    expect((await send(service)).status).toBe(200);
  });

  it('is refused while an earlier, still-live claim is held', async () => {
    const { service, store, client } = buildSender();
    store.claimState.claim = { token: 'alive', at: new Date('2026-09-14T09:59:00.000Z') };
    expect((await send(service)).body.code).toBe('ZOHO_ALREADY_SENT');
    expect(client.createRequest).not.toHaveBeenCalled();
  });

  it('never submits when its lease was taken over during a slow create', async () => {
    const store = makeStore();
    const good = makeClient();
    const client = makeClient({
      createRequest: vi.fn(async () => {
        // Another send takes the stale claim while our create is still at Zoho.
        store.claimState.claim = { token: 'newer', at: new Date() };
        return good.createRequest();
      }),
    });
    const { service } = buildSender({ store, client });
    const result = await send(service);
    expect(result.body.code).toBe('ZOHO_ALREADY_SENT');
    expect(client.submitRequest).not.toHaveBeenCalled();
    expect(store.saveSent).not.toHaveBeenCalled();
    expect(store.claimState.claim).toEqual(expect.objectContaining({ token: 'newer' }));
  });

  it('keeps the claim when saving the request id throws, so a retry cannot create a second envelope', async () => {
    const store = makeStore({ saveZohoRequest: vi.fn(async () => { throw new Error('mongo blip'); }) });
    const { service } = buildSender({ store });
    await expect(send(service)).rejects.toThrow('mongo blip');
    expect(store.releaseSend).not.toHaveBeenCalled();
    expect(store.claimState.claim).not.toBeNull();
  });

  it('returns the real Zoho error even when releasing the claim fails', async () => {
    const store = makeStore({ releaseSend: vi.fn(async () => { throw new Error('mongo down'); }) });
    const client = makeClient({
      createRequest: vi.fn(async () => { throw zohoSignError(ZOHO_ERROR_CODES.RATE_LIMITED, 'Zoho Sign is rate limiting us.'); }),
    });
    const { service } = buildSender({ store, client });
    const result = await send(service);
    expect(result.status).toBe(429);
    expect(result.body.code).toBe(ZOHO_ERROR_CODES.RATE_LIMITED);
  });

  it('refuses to build a sender whose store cannot claim atomically', () => {
    const store = makeStore();
    Reflect.deleteProperty(store, 'claimSend');
    expect(() => createZohoSignSender({ config: workingConfig(), client: makeClient(), store })).toThrow(/claimSend/);
  });
});

// Zoho takes the sender from the OAuth token owner and CPQ holds one org-wide token, so every
// signature email names the same person however built the SOW. The preparer line in `notes` is
// the only place the real creator reaches the signer, which makes these cases user-visible.
describe('creatorNote', () => {
  it('names the creator and their email', () => {
    expect(creatorNote('Abhilasha Kandakatla', 'abhilasha.k@cloudfuze.com'))
      .toBe('Prepared by Abhilasha Kandakatla (abhilasha.k@cloudfuze.com)');
  });

  it('falls back to the email alone when the user record has no name', () => {
    expect(creatorNote('', 'anush.dasari@cloudfuze.com')).toBe('Prepared by anush.dasari@cloudfuze.com');
  });

  it('does not print the same address twice when the name IS the email', () => {
    expect(creatorNote('x@y.com', 'x@y.com')).toBe('Prepared by x@y.com');
  });

  it('returns empty rather than a dangling "Prepared by" when there is no identity', () => {
    expect(creatorNote('', '')).toBe('');
    expect(creatorNote(null, undefined)).toBe('');
  });

  it('stays inside the 500-character notes limit Zoho enforces', () => {
    expect(creatorNote('A'.repeat(400), `${'b'.repeat(400)}@example.com`).length).toBeLessThanOrEqual(500);
  });
});

describe('isZohoManagedDocument — which reminder path a document takes', () => {
  // The in-house reminder selects recipients by signing_token. A Zoho recipient never has one,
  // so sending a Zoho document down that path matched zero recipients and silently emailed
  // nobody while reporting success. This predicate is the fork that prevents it.
  it('is true only for a Zoho document that actually reached Zoho', () => {
    expect(isZohoManagedDocument({ provider: 'zoho', zoho_request_id: '610752000000061001' })).toBe(true);
  });

  it('is false for an in-house document', () => {
    expect(isZohoManagedDocument({ provider: 'cpq' })).toBe(false);
    expect(isZohoManagedDocument({})).toBe(false);
  });

  it('is false when the Zoho send never produced a request id', () => {
    // A send that failed before create returned leaves provider set with nothing addressable.
    expect(isZohoManagedDocument({ provider: 'zoho' })).toBe(false);
    expect(isZohoManagedDocument({ provider: 'zoho', zoho_request_id: '' })).toBe(false);
    expect(isZohoManagedDocument({ provider: 'zoho', zoho_request_id: '   ' })).toBe(false);
    expect(isZohoManagedDocument({ provider: 'zoho', zoho_request_id: null })).toBe(false);
  });

  it('tolerates a missing or non-object document', () => {
    expect(isZohoManagedDocument(undefined)).toBe(false);
    expect(isZohoManagedDocument(null)).toBe(false);
    expect(isZohoManagedDocument('zoho')).toBe(false);
  });
});
