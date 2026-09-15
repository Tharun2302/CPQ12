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
  isValidObjectIdString,
  validateZohoSendOptions,
  checkDocumentSendable,
  matchZohoActionIds,
  normalizeZohoDocumentIds,
  httpStatusForZohoError,
  createZohoSignSender,
} = sender as {
  ZOHO_MAX_PDF_BYTES: number;
  isValidObjectIdString: (value: unknown) => boolean;
  validateZohoSendOptions: (body: unknown) => { errors: string[]; options: Record<string, unknown> };
  checkDocumentSendable: (doc: unknown) => { status: number; error: string; code: string } | null;
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
  const base = {
    calls,
    writes,
    findDocument: vi.fn(async () => draftDocument()),
    findRecipients: vi.fn(async () => recipients()),
    findFields: vi.fn(async () => fields()),
    loadPdf: vi.fn(async () => ({ buffer: Buffer.from('%PDF-1.4 fake'), fileName: 'Order Form.pdf' })),
    resolvePageSizes: vi.fn(async () => ({ 1: { width: 612, height: 792 } })),
    saveZohoRequest: vi.fn(async (_id: string, patch: any) => { calls.push('saveZohoRequest'); writes.request = patch; }),
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
    expect(calls).toEqual(['createRequest', 'saveZohoRequest', 'submitRequest', 'saveRecipientAction', 'saveRecipientAction', 'saveSent']);
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
