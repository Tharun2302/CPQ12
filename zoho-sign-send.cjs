'use strict';

// The Zoho send (design §8, E2) as an injectable service. Kept out of server.cjs so the whole
// sequence — preconditions, create, persist-before-submit, submit, persist — can be unit tested
// with a fake Mongo layer and a fake Zoho client. server.cjs keeps only the glue: JWT, the rate
// limiter, and handing the returned {status, body} to res.
//
// Injected store contract (every method may be async; none of them is called by a test against
// a real database):
//   findDocument(documentId)            -> doc | null
//   findRecipients(documentId)          -> [esign_recipients row]
//   findFields(documentId)              -> [signature_fields row]
//   loadPdf(doc)                        -> { buffer, fileName } | null
//   resolvePageSizes(buffer)            -> { [1-based page]: { width, height } }   (optional)
//   claimSend(documentId, claim)        -> boolean  ATOMIC: true for exactly one concurrent caller
//   releaseSend(documentId, token)      -> void     drops the claim when no Zoho request exists
//   saveZohoRequest(documentId, patch, token) -> boolean  BEFORE submit; true only if token holds the claim
//   saveRecipientAction(recipientId, patch) -> void
//   saveSent(documentId, patch)         -> void
//   saveError(documentId, lastError)    -> void
//
// Nothing here logs or returns a Zoho raw body: callers get `message`, which is written to be
// shown to a user, and the redaction guard from zoho-sign-client owns anything that is logged.

const {
  ZOHO_ERROR_CODES,
  zohoSignError,
} = require('./zoho-sign-auth.cjs');

const { randomUUID } = require('crypto');

const { createRedactor } = require('./zoho-sign-client.cjs');

const { actorIsEsignDocumentCreator } = require('./esign-creator-utils.cjs');

const {
  ZOHO_ACTION_TYPES,
  DEFAULT_PAGE_SIZE_PT,
  mapRecipientsToZohoActions,
  mapSignatureFieldsToZoho,
  actionsMissingFields,
  buildCreateRequestPayload,
  buildSubmitPayload,
} = require('./zoho-sign-mapper.cjs');

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/** Zoho's single-document ceiling (design §7.7). Checked here so the upload is never attempted. */
const ZOHO_MAX_PDF_BYTES = 25 * 1024 * 1024;

const EXPIRATION_DAYS_MIN = 1;
const EXPIRATION_DAYS_MAX = 90;
const REMINDER_PERIOD_MIN = 1;
const REMINDER_PERIOD_MAX = 30;
const NOTES_MAX_LENGTH = 500;
const REQUEST_NAME_MAX_LENGTH = 200;

// Covers claim -> saveZohoRequest only; a create with retries, Retry-After and a token refresh
// can run ~8 minutes. A process that died holding the claim frees the document after this.
const ZOHO_SEND_CLAIM_TTL_MS = 15 * 60 * 1000;

// Anything not listed maps to 502: the browser learns "Zoho refused this" and the precise cause
// stays in zoho_last_error, where it cannot leak account detail into a response body.
const HTTP_STATUS_BY_ZOHO_ERROR = Object.freeze({
  [ZOHO_ERROR_CODES.NOT_CONFIGURED]: 503,
  [ZOHO_ERROR_CODES.RATE_LIMITED]: 429,
  [ZOHO_ERROR_CODES.INVALID_INPUT]: 400,
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function capString(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

/**
 * Zoho takes the sender identity from whoever owns the OAuth token, and CPQ holds one token for
 * the whole org — so every signature email says the same name no matter who built the SOW. There
 * is no sender field on POST /requests and no impersonation header, so the creator is surfaced in
 * `notes` instead, which Zoho renders as "Message to all" in the email the signer receives.
 *
 * Returns '' when there is no usable identity, so the caller omits `notes` rather than sending
 * "Prepared by".
 */
function creatorNote(actorName, actorEmail) {
  const name = capString(actorName, 120);
  const email = capString(actorEmail, 200);
  if (name === '' && email === '') return '';
  if (name === '') return capString(`Prepared by ${email}`, NOTES_MAX_LENGTH);
  if (email === '' || name.toLowerCase() === email.toLowerCase()) {
    return capString(`Prepared by ${name}`, NOTES_MAX_LENGTH);
  }
  return capString(`Prepared by ${name} (${email})`, NOTES_MAX_LENGTH);
}

/** True for a 24-hex id. Checked before `new ObjectId()` so a malformed id is a 400, not a throw. */
function isValidObjectIdString(value) {
  return OBJECT_ID_PATTERN.test(String(value == null ? '' : value).trim());
}

/**
 * Whether Zoho, not CPQ, owns this document's signer communications.
 *
 * Both halves matter. `provider` alone is not enough: a send that failed before Zoho returned a
 * request id leaves provider set with nothing to address at Zoho, and calling a Zoho endpoint
 * with an empty id would be a 400 from Zoho rather than a clean CPQ answer.
 *
 * This is the reminder route's fork. The in-house reminder selects recipients by
 * `signing_token`, which a Zoho recipient never has — so routing a Zoho document down that path
 * matches zero recipients and reports success having emailed nobody.
 */
function isZohoManagedDocument(doc) {
  if (!doc || typeof doc !== 'object') return false;
  return doc.provider === 'zoho' && isNonEmptyString(doc.zoho_request_id);
}

/**
 * Backend validation of the request body (design §12.4).
 *
 * Absent keys are not defaults — they are simply omitted, so Zoho applies its own account
 * settings. Present-but-wrong is always an error rather than a silent coercion: a caller that
 * sent `is_sequential: "false"` meant something, and quietly reading that as true would send a
 * contract to every recipient at once.
 */
function validateZohoSendOptions(body) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = [];
  const options = {};

  if (hasOwn(source, 'expiration_days') && source.expiration_days !== null && source.expiration_days !== '') {
    const days = Number(source.expiration_days);
    if (!Number.isInteger(days) || days < EXPIRATION_DAYS_MIN || days > EXPIRATION_DAYS_MAX) {
      errors.push(`expiration_days must be a whole number between ${EXPIRATION_DAYS_MIN} and ${EXPIRATION_DAYS_MAX}.`);
    } else {
      options.expirationDays = days;
    }
  }

  if (hasOwn(source, 'reminder_period') && source.reminder_period !== null && source.reminder_period !== '') {
    const period = Number(source.reminder_period);
    if (!Number.isInteger(period) || period < REMINDER_PERIOD_MIN || period > REMINDER_PERIOD_MAX) {
      errors.push(`reminder_period must be a whole number between ${REMINDER_PERIOD_MIN} and ${REMINDER_PERIOD_MAX}.`);
    } else {
      options.reminderPeriod = period;
    }
  }

  if (hasOwn(source, 'is_sequential')) {
    if (typeof source.is_sequential !== 'boolean') errors.push('is_sequential must be true or false.');
    else options.isSequential = source.is_sequential;
  }

  if (hasOwn(source, 'email_reminders')) {
    if (typeof source.email_reminders !== 'boolean') errors.push('email_reminders must be true or false.');
    else options.emailReminders = source.email_reminders;
  }

  if (hasOwn(source, 'notes') && source.notes !== null && source.notes !== '') {
    if (typeof source.notes !== 'string') errors.push('notes must be text.');
    else options.notes = capString(source.notes, NOTES_MAX_LENGTH);
  }

  if (hasOwn(source, 'request_name') && source.request_name !== null && source.request_name !== '') {
    if (typeof source.request_name !== 'string') errors.push('request_name must be text.');
    else options.requestName = capString(source.request_name, REQUEST_NAME_MAX_LENGTH);
  }

  return { errors, options };
}

const ZOHO_ALREADY_SENT = Object.freeze({
  status: 409,
  error: 'This document has already been handed to Zoho Sign.',
  code: 'ZOHO_ALREADY_SENT',
});

/**
 * Whether this document may be handed to Zoho at all. Returns null when it may.
 *
 * The zoho_request_id check comes first: it refuses a repeat send once E2 has persisted that id.
 * Being a read, it cannot stop two concurrent sends — the atomic claimSend in send() does that.
 */
function checkDocumentSendable(doc) {
  if (doc && (doc.zoho_request_id || doc.provider === 'zoho')) {
    return Object.assign({}, ZOHO_ALREADY_SENT);
  }
  if (doc && doc.status === 'sent') {
    return { status: 409, error: 'This document has already been sent.', code: 'ALREADY_SENT' };
  }
  if (!doc || doc.status !== 'draft') {
    return {
      status: 400,
      error: `Only draft documents can be sent. This one is "${(doc && doc.status) || 'unknown'}".`,
      code: 'NOT_DRAFT',
    };
  }
  return null;
}

/**
 * Zoho's action_ids, lined up with the actions we asked for.
 *
 * Positional alignment is what the mapper's buildSubmitPayload expects, but matching on email
 * first means a reordered echo puts each signer's fields on their own page rather than on
 * somebody else's. Falling back to position keeps a Zoho response that omits the email usable.
 */
function matchZohoActionIds(zohoActions, mappedActions) {
  const echoed = Array.isArray(zohoActions) ? zohoActions : [];
  const byEmail = new Map();
  echoed.forEach((action) => {
    const email = String((action && action.recipient_email) || '').trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, action);
  });

  const actionIds = [];
  const unmatched = [];
  (Array.isArray(mappedActions) ? mappedActions : []).forEach((action, index) => {
    const hit = byEmail.get(String(action.recipient_email || '').toLowerCase()) || echoed[index];
    const id = hit && hit.action_id != null ? String(hit.action_id) : '';
    if (id === '') unmatched.push(action.recipient_email || `recipient ${index + 1}`);
    actionIds.push(id);
  });
  return { actionIds, unmatched };
}

/** Zoho's document_ids echo, reduced to what we store and what the field mapper addresses. */
function normalizeZohoDocumentIds(zohoRequest) {
  const list = zohoRequest && Array.isArray(zohoRequest.document_ids) ? zohoRequest.document_ids : [];
  return list.map((entry) => ({
    document_id: String((entry && entry.document_id) || ''),
    document_name: String((entry && entry.document_name) || ''),
    total_pages: Number((entry && entry.total_pages) || 0) || 0,
  })).filter((entry) => entry.document_id !== '');
}

function httpStatusForZohoError(error) {
  return HTTP_STATUS_BY_ZOHO_ERROR[error && error.code] || 502;
}

/**
 * The stored failure record. Deliberately narrow: code, a user-safe message and a timestamp.
 * Zoho's raw body is not kept — it can carry account detail and the UI renders this field.
 */
function toStoredError(error, at) {
  return {
    code: String((error && error.code) || ZOHO_ERROR_CODES.API_ERROR),
    message: String((error && error.message) || 'Zoho Sign refused the request.'),
    at,
  };
}

/**
 * The E2 service.
 *
 * @param {object} deps
 * @param {object} deps.config   resolved zoho-sign-config object
 * @param {object} deps.client   zoho-sign-client instance
 * @param {object} deps.store    see the header contract
 * @param {Function} [deps.logAudit] (documentId, action, email, ip, extra) => Promise
 * @param {Function} [deps.now]  clock, for tests
 * @param {Function} [deps.logger] (message) => void; only ever receives redacted text
 */
function createZohoSignSender(deps) {
  const { config, client, store } = deps || {};
  const now = (deps && deps.now) || (() => new Date());
  const audit = (deps && deps.logAudit) || null;
  const logger = deps && typeof deps.logger === 'function' ? deps.logger : null;

  if (!config) throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createZohoSignSender requires a config');
  if (!store) throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createZohoSignSender requires a store');
  if (!client) throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createZohoSignSender requires a Zoho client');
  if (typeof store.claimSend !== 'function' || typeof store.releaseSend !== 'function') {
    throw zohoSignError(ZOHO_ERROR_CODES.INVALID_INPUT, 'createZohoSignSender requires claimSend and releaseSend');
  }

  const redact = createRedactor([config.clientSecret, config.refreshToken, config.webhookSecret]);

  function warn(message) {
    if (!logger) return;
    const safe = redact(message);
    if (safe === null) return;
    logger(safe);
  }

  function fail(status, error, code, extra) {
    return { status, body: Object.assign({ success: false, error, code }, extra || {}) };
  }

  async function recordFailure(documentId, error) {
    if (typeof store.saveError !== 'function') return;
    try {
      await store.saveError(documentId, toStoredError(error, now()));
    } catch (e) {
      // A failure to record a failure must not replace the real error the caller is about to see.
      warn(`Zoho Sign could not record the last error for document ${documentId}`);
    }
  }

  async function releaseClaim(documentId, token) {
    try {
      await store.releaseSend(documentId, token);
    } catch (e) {
      // The lease expires on its own, so a failed release only delays a retry.
      warn(`Zoho Sign could not release the send claim for document ${documentId}`);
    }
  }

  /**
   * @param {object} input
   * @param {string} input.documentId  the :id path parameter, unvalidated
   * @param {string} input.actorEmail  the VERIFIED JWT email, never a body-supplied address
   * @param {string} [input.actorName] the VERIFIED JWT display name, shown to signers as the preparer
   * @param {object} input.body        the request body, unvalidated
   * @param {string} [input.ip]        for the audit row
   * @returns {Promise<{status:number, body:object}>}
   */
  async function send(input) {
    const documentId = String((input && input.documentId) || '').trim();
    const actorEmail = String((input && input.actorEmail) || '').trim();
    const actorName = String((input && input.actorName) || '').trim();
    const ip = (input && input.ip) || null;

    if (config.enabled !== true) {
      return fail(503, 'Zoho Sign is not enabled.', 'ZOHO_DISABLED');
    }
    if (config.configured !== true) {
      return fail(
        503,
        config.dcError || `Zoho Sign is enabled but not configured. Missing .env values: ${config.missingKeys.join(', ')}`,
        'ZOHO_NOT_CONFIGURED',
        { missing_keys: config.missingKeys.slice() },
      );
    }
    if (!isValidObjectIdString(documentId)) {
      return fail(400, 'Invalid document ID', 'INVALID_DOCUMENT_ID');
    }

    const { errors: optionErrors, options } = validateZohoSendOptions(input && input.body);
    if (optionErrors.length > 0) {
      return fail(400, optionErrors.join(' '), 'INVALID_INPUT', { details: optionErrors });
    }

    const doc = await store.findDocument(documentId);
    if (!doc) return fail(404, 'Document not found', 'NOT_FOUND');

    if (!actorIsEsignDocumentCreator(doc, actorEmail)) {
      return fail(403, 'Only the document creator can send this document with Zoho Sign.', 'NOT_CREATOR');
    }

    const stateError = checkDocumentSendable(doc);
    if (stateError) return fail(stateError.status, stateError.error, stateError.code);

    const recipients = (await store.findRecipients(documentId)) || [];
    const mapped = mapRecipientsToZohoActions(recipients, {});
    if (mapped.errors.length > 0) {
      return fail(400, mapped.errors.join(' '), 'INVALID_RECIPIENTS', { details: mapped.errors });
    }

    const fields = (await store.findFields(documentId)) || [];

    const pdf = await store.loadPdf(doc);
    if (!pdf || !pdf.buffer || pdf.buffer.length === 0) {
      return fail(404, 'The PDF for this document could not be found.', 'FILE_NOT_FOUND');
    }
    if (pdf.buffer.length > ZOHO_MAX_PDF_BYTES) {
      return fail(
        413,
        `Zoho Sign accepts documents up to 25 MB; this one is ${Math.ceil(pdf.buffer.length / (1024 * 1024))} MB.`,
        'FILE_TOO_LARGE',
      );
    }

    let pageSizes = {};
    if (typeof store.resolvePageSizes === 'function') {
      try {
        pageSizes = (await store.resolvePageSizes(pdf.buffer)) || {};
      } catch (e) {
        // A page-size read failure is not fatal: the mapper falls back to US Letter, which is
        // what every CPQ agreement template uses anyway.
        warn(`Zoho Sign could not read page sizes for document ${documentId}; falling back to US Letter`);
        pageSizes = {};
      }
    }

    // Field mapping runs before anything is created at Zoho. A rejected submit would otherwise
    // leave an orphaned draft in the Zoho account that nothing in CPQ ever cleans up.
    const { byRecipient, unassigned } = mapSignatureFieldsToZoho(fields, {
      documentId: '',
      pageSizes,
      pageSize: DEFAULT_PAGE_SIZE_PT,
      origin: config.coordOrigin,
      unit: config.coordUnit,
    });

    const missing = actionsMissingFields(mapped.actions, mapped.recipientIds, byRecipient);
    if (missing.length > 0) {
      const who = missing.map((entry) => entry.email).join(', ');
      return fail(
        400,
        `Zoho Sign requires at least one field for every signer and reviewer. These have none: ${who}.`,
        'RECIPIENT_HAS_NO_FIELDS',
        { recipients_without_fields: missing.map((entry) => entry.email) },
      );
    }

    const createPayload = buildCreateRequestPayload({
      requestName: options.requestName || doc.file_name || 'CPQ Agreement',
      actions: mapped.actions,
      // An explicit note from the caller wins: it is a deliberate message to the signers, and
      // overwriting it with the preparer line would lose real content.
      notes: options.notes || creatorNote(actorName, actorEmail),
      isSequential: hasOwn(options, 'isSequential') ? options.isSequential : doc.signing_order_enforced === true,
      expirationDays: options.expirationDays,
      emailReminders: options.emailReminders,
      reminderPeriod: options.reminderPeriod,
    });

    // The findDocument check above is a read, so two near-simultaneous sends both pass it. This
    // compare-and-set is what lets only one of them create an envelope at Zoho.
    const claimedAt = now();
    const claimToken = randomUUID();
    const claimed = await store.claimSend(documentId, {
      token: claimToken,
      at: claimedAt,
      staleBefore: new Date(claimedAt.getTime() - ZOHO_SEND_CLAIM_TTL_MS),
    });
    if (claimed !== true) {
      return fail(ZOHO_ALREADY_SENT.status, ZOHO_ALREADY_SENT.error, ZOHO_ALREADY_SENT.code);
    }

    let zohoRequest;
    try {
      zohoRequest = await client.createRequest({
        files: [{ buffer: pdf.buffer, fileName: pdf.fileName || 'document.pdf', contentType: 'application/pdf' }],
        data: createPayload,
      });
    } catch (error) {
      await recordFailure(documentId, error);
      await releaseClaim(documentId, claimToken);
      return fail(httpStatusForZohoError(error), error.message, error.code || ZOHO_ERROR_CODES.API_ERROR);
    }

    const requestId = zohoRequest && zohoRequest.request_id != null ? String(zohoRequest.request_id) : '';
    if (requestId === '') {
      const error = zohoSignError(ZOHO_ERROR_CODES.API_ERROR, 'Zoho Sign did not return a request id.');
      await recordFailure(documentId, error);
      await releaseClaim(documentId, claimToken);
      return fail(502, error.message, error.code);
    }

    const zohoDocumentIds = normalizeZohoDocumentIds(zohoRequest);
    const sentAt = now();

    // Persisted BEFORE submit, deliberately: a crash between the two calls then leaves a
    // recoverable CPQ record pointing at a real Zoho draft, rather than an orphan at Zoho that
    // nothing here can find again.
    const saved = await store.saveZohoRequest(documentId, {
      provider: 'zoho',
      zoho_request_id: requestId,
      zoho_document_ids: zohoDocumentIds,
      zoho_dc: config.dc,
      zoho_request_status: String((zohoRequest && zohoRequest.request_status) || 'draft'),
    }, claimToken);
    if (saved !== true) {
      // Our claim went stale during a slow create and another send took over. Stopping before
      // submit leaves this Zoho draft unsent, so no signer is emailed twice.
      warn(`Zoho Sign lost the send claim for document ${documentId}; request ${requestId} left unsubmitted`);
      return fail(ZOHO_ALREADY_SENT.status, ZOHO_ALREADY_SENT.error, ZOHO_ALREADY_SENT.code);
    }
    // zoho_request_id now blocks any further claim by itself, so the lease has done its job.
    await releaseClaim(documentId, claimToken);

    const { actionIds, unmatched } = matchZohoActionIds(zohoRequest && zohoRequest.actions, mapped.actions);
    if (unmatched.length > 0) {
      const error = zohoSignError(
        ZOHO_ERROR_CODES.API_ERROR,
        `Zoho Sign did not return an action id for: ${unmatched.join(', ')}.`,
      );
      await recordFailure(documentId, error);
      return fail(502, error.message, error.code, { zoho_request_id: requestId });
    }

    const primaryDocumentId = zohoDocumentIds.length > 0 ? zohoDocumentIds[0].document_id : '';
    // The attributes come from mapped.actions — our own CPQ-sourced objects — not from the
    // actions Zoho echoed at create. Zoho's echo carries read-only keys (action_status and
    // friends) and a submit refuses them with 9043 "Extra key found".
    const submitPayload = buildSubmitPayload(actionIds, mapped.actions, mapped.recipientIds, byRecipient);
    // document_id is only knowable after create, so it is stamped onto the mapped fields here
    // rather than guessed at mapping time.
    submitPayload.requests.actions.forEach((action) => {
      action.fields.forEach((field) => { field.document_id = primaryDocumentId; });
    });

    try {
      await client.submitRequest(requestId, submitPayload);
    } catch (error) {
      await recordFailure(documentId, error);
      return fail(httpStatusForZohoError(error), error.message, error.code || ZOHO_ERROR_CODES.API_ERROR, {
        zoho_request_id: requestId,
      });
    }

    const recipientResults = [];
    for (let index = 0; index < mapped.recipientIds.length; index += 1) {
      const recipientId = mapped.recipientIds[index];
      const patch = {
        zoho_action_id: actionIds[index],
        zoho_action_type: mapped.actions[index].action_type,
        zoho_action_status: 'NOTACTIONYET',
        status: 'pending',
        sent_at: sentAt,
      };
      if (recipientId) await store.saveRecipientAction(recipientId, patch);
      recipientResults.push({
        id: recipientId,
        email: mapped.actions[index].recipient_email,
        zoho_action_id: actionIds[index],
        zoho_action_type: mapped.actions[index].action_type,
      });
    }

    await store.saveSent(documentId, {
      status: 'sent',
      sent_at: sentAt,
      zoho_sent_at: sentAt,
      zoho_request_status: 'inprogress',
      zoho_last_synced_at: sentAt,
    });

    if (audit) {
      try {
        await audit(documentId, 'sent', actorEmail, ip, {
          provider: 'zoho',
          zoho_request_id: requestId,
          zoho_dc: config.dc,
          recipients: recipientResults.length,
        });
      } catch (e) {
        warn(`Zoho Sign could not write the audit row for document ${documentId}`);
      }
    }

    return {
      status: 200,
      body: {
        success: true,
        message: `Sent to Zoho Sign. Zoho will email ${recipientResults.length} recipient(s).`,
        document: {
          id: documentId,
          provider: 'zoho',
          status: 'sent',
          zoho_request_id: requestId,
          zoho_dc: config.dc,
        },
        recipients: recipientResults,
      },
    };
  }

  return { send };
}

module.exports = {
  ZOHO_MAX_PDF_BYTES,
  ZOHO_SEND_CLAIM_TTL_MS,
  OBJECT_ID_PATTERN,
  ZOHO_ACTION_TYPES,
  isValidObjectIdString,
  isZohoManagedDocument,
  creatorNote,
  validateZohoSendOptions,
  checkDocumentSendable,
  matchZohoActionIds,
  normalizeZohoDocumentIds,
  httpStatusForZohoError,
  toStoredError,
  createZohoSignSender,
};
