'use strict';

// Translation layer between CPQ's e-sign data and Zoho Sign's request payloads: recipients to
// actions, signature_fields to fields, and the coordinate conversion. Kept out of server.cjs so
// every rule here can be unit tested without a database, and because the coordinate conversion
// is the one part of this feature that is known to need empirical correction (design §7.4).
//
// THE ORIGIN AND UNIT ARE PARAMETERS, NOT CONSTANTS. Zoho documents x_coord/y_coord/abs_width/
// abs_height as bare numbers and never says what unit they are in, where the origin sits, or
// what page size they are relative to. The values below are the starting hypothesis; only
// calibration against a real Zoho account can confirm them, and when it does the answer belongs
// in ZOHO_SIGN_COORD_ORIGIN / ZOHO_SIGN_COORD_UNIT, not in this file. A live send on 2026-09-14
// proved Zoho stores x_coord/y_coord exactly as sent, so the API round-trip cannot answer the
// origin question — it stays open until a human looks at a rendered document.
//
// Everything else in the shapes below was verified by that same send (request_id …046007,
// status inprogress). Debugging note for anyone changing the submit payload: Zoho's 9039
// "Unable to process your request" names nothing at all, while 9043 "Extra key found" puts the
// offending key in error_param. So when a submit is refused, send a superset and let 9043 name
// what to strip — do not guess against 9039.

/** Zoho rejects any action type outside this set. VIEW is the only one allowed to have no fields. */
const ZOHO_ACTION_TYPES = Object.freeze({
  SIGN: 'SIGN',
  APPROVER: 'APPROVER',
  VIEW: 'VIEW',
  INPERSONSIGN: 'INPERSONSIGN',
});

const ZOHO_MAX_RECIPIENTS = 25;

/** CPQ's five field types onto Zoho's vocabulary. Anything unrecognised degrades to a text box. */
const ZOHO_FIELD_TYPE_BY_CPQ_TYPE = Object.freeze({
  signature: 'Signature',
  initial: 'Initial',
  name: 'Name',
  title: 'Jobtitle',
  date: 'Date',
  text: 'Textfield',
});
const DEFAULT_ZOHO_FIELD_TYPE = 'Textfield';

// VERIFIED 2026-09-14: field_category must NOT be sent. Zoho's examples show it beside
// field_type_name, but it belongs to payment/checkout fields only; on a signature field it is
// what produced the generic 9039 refusal. field_type_name alone places the field.

/**
 * The ONLY action keys a submit may carry beside action_id. Verified 2026-09-14: a submit action
 * of just {action_id, fields} is refused with 9039, and all five of these have to be present.
 *
 * It is an allowlist rather than a denylist on purpose. The action objects Zoho echoes back from
 * create carry read-only keys (action_status, cloud_provider_name, delivery_mode and friends)
 * that a submit rejects with 9043 "Extra key found", and Zoho is free to add more of them
 * tomorrow. Filtering by what is known-writable means a new response key can never leak into a
 * submit; filtering by what is known-bad would break the next time Zoho adds a field.
 *
 * private_notes and is_embedded are documented writable action attributes but were NOT part of
 * the verified submit, so they stay out until a live send proves them. They are applied at
 * create time, which is where they take effect anyway.
 */
const ZOHO_WRITABLE_ACTION_KEYS = Object.freeze([
  'action_type',
  'recipient_name',
  'recipient_email',
  'signing_order',
  'verify_recipient',
]);

/** Read-only keys observed on Zoho's echoed actions; each one is a 9043 if it reaches a submit. */
const ZOHO_READONLY_ACTION_KEYS = Object.freeze([
  'action_status',
  'cloud_provider_name',
  'cloud_provider_id',
  'is_bulk',
  'is_signing_group',
  'delivery_mode',
  'send_completed_document',
  'recipient_countrycode',
  'recipient_countrycode_iso',
  'recipient_phonenumber',
]);

const ZOHO_FIELD_LABELS = Object.freeze({
  Signature: 'Signature',
  Initial: 'Initials',
  Name: 'Name',
  Jobtitle: 'Title',
  Date: 'Date',
  Textfield: 'Text',
});

/** US Letter in PDF points. Only used when the caller cannot supply the real page size. */
const DEFAULT_PAGE_SIZE_PT = Object.freeze({ width: 612, height: 792 });

// CPQ geometry is stored in PDF points (the merger reads page.getWidth() straight out of
// pdf-lib), so 'pt' is a pass-through and 'px' is the CSS-pixel reading at 96dpi.
const ZOHO_COORD_UNIT_SCALES = Object.freeze({ pt: 1, px: 96 / 72 });

// Mirrors the defaults the in-house pdf-lib merger applies to a partially filled row, so the
// same stored field lands in the same place whichever provider renders it.
const FIELD_GEOMETRY_DEFAULTS = Object.freeze({
  xPct: 10, yPct: 80, widthPct: 20, heightPct: 4, width: 100, height: 40,
});

function isFiniteNumber(value) {
  return value != null && value !== '' && Number.isFinite(Number(value));
}

function trimmedString(value, maxLength) {
  const text = String(value == null ? '' : value).trim();
  return maxLength ? text.slice(0, maxLength) : text;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value == null ? '' : value).trim());
}

// ---- Recipients -> actions ------------------------------------------------

/**
 * CPQ's `action` discriminator decides, not `role`: role carries approval-workflow labels
 * ('Legal Team' and friends) that say who a person is, not what they must do on the document.
 */
function zohoActionTypeForRecipient(recipient) {
  const action = trimmedString(recipient && recipient.action).toLowerCase();
  if (action === 'reviewer') return ZOHO_ACTION_TYPES.APPROVER;
  if (action === 'viewer') return ZOHO_ACTION_TYPES.VIEW;
  return ZOHO_ACTION_TYPES.SIGN;
}

/** Signing order is positional, so the sort has to be stable and match what the UI showed. */
function sortRecipientsForZoho(recipients) {
  return (Array.isArray(recipients) ? recipients.slice() : []).sort((a, b) => {
    const orderA = isFiniteNumber(a && a.order) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const orderB = isFiniteNumber(b && b.order) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return String((a && a._id) || '').localeCompare(String((b && b._id) || ''));
  });
}

/**
 * Everything Zoho will reject, found before the request exists at Zoho. A failure at submit
 * leaves an orphaned draft in the Zoho account that nobody in CPQ will ever clean up, so these
 * checks run on the CPQ side first.
 */
function validateZohoRecipients(recipients) {
  const errors = [];
  const list = Array.isArray(recipients) ? recipients : [];
  if (list.length === 0) errors.push('This document has no recipients.');
  if (list.length > ZOHO_MAX_RECIPIENTS) {
    errors.push(`Zoho Sign allows at most ${ZOHO_MAX_RECIPIENTS} recipients per request; this document has ${list.length}.`);
  }
  const seen = new Set();
  list.forEach((recipient, index) => {
    const label = trimmedString(recipient && recipient.email) || `recipient ${index + 1}`;
    if (!trimmedString(recipient && recipient.name)) errors.push(`${label} has no name.`);
    if (!looksLikeEmail(recipient && recipient.email)) errors.push(`${label} does not have a valid email address.`);
    const key = trimmedString(recipient && recipient.email).toLowerCase();
    if (key && seen.has(key)) errors.push(`${key} appears more than once.`);
    if (key) seen.add(key);
  });
  return errors;
}

/**
 * CPQ recipients to Zoho actions.
 *
 * `recipientIds` is returned alongside rather than folded into the action objects: Zoho rejects
 * unknown keys in the payload (error 9015), so the join back from action_id to the CPQ
 * recipient row travels beside the payload, never inside it.
 */
function mapRecipientsToZohoActions(recipients, options) {
  const opts = options || {};
  const errors = validateZohoRecipients(recipients);
  const ordered = sortRecipientsForZoho(recipients);
  const actions = [];
  const recipientIds = [];

  ordered.forEach((recipient, index) => {
    const action = {
      action_type: zohoActionTypeForRecipient(recipient),
      recipient_name: trimmedString(recipient.name, 200),
      recipient_email: trimmedString(recipient.email).toLowerCase(),
      signing_order: index,
      verify_recipient: false,
    };
    const note = trimmedString(recipient.email_message, 500);
    if (note) action.private_notes = note;
    if (opts.isEmbedded === true) action.is_embedded = true;
    actions.push(action);
    recipientIds.push(recipient._id == null ? '' : String(recipient._id));
  });

  return { actions, recipientIds, errors };
}

// ---- Fields ---------------------------------------------------------------

/** CPQ pages are 1-based, Zoho's page_no is 0-based. The whole off-by-one lives here. */
function toZohoPageNo(page) {
  const parsed = Number(page);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed) - 1);
}

function zohoFieldTypeForCpqType(type) {
  const key = trimmedString(type).toLowerCase();
  return ZOHO_FIELD_TYPE_BY_CPQ_TYPE[key] || DEFAULT_ZOHO_FIELD_TYPE;
}

/**
 * The stored geometry as a top-origin rectangle in PDF points, resolving CPQ's three mutually
 * exclusive geometries in the same precedence the pdf-lib merger uses (normalized, then
 * percentage, then absolute). Diverging from that precedence would put a field in one place in
 * the in-house PDF and another at Zoho for the identical stored row.
 */
function resolveFieldRect(field, pageWidth, pageHeight) {
  const w = isFiniteNumber(pageWidth) ? Number(pageWidth) : DEFAULT_PAGE_SIZE_PT.width;
  const h = isFiniteNumber(pageHeight) ? Number(pageHeight) : DEFAULT_PAGE_SIZE_PT.height;
  const f = field || {};

  if (isFiniteNumber(f.xNorm) && isFiniteNumber(f.yNorm) && isFiniteNumber(f.widthNorm) && isFiniteNumber(f.heightNorm)) {
    return {
      x: Number(f.xNorm) * w,
      y: Number(f.yNorm) * h,
      width: Number(f.widthNorm) * w,
      height: Number(f.heightNorm) * h,
      source: 'norm',
    };
  }

  if (isFiniteNumber(f.xPct) || isFiniteNumber(f.yPct)) {
    const xPct = (isFiniteNumber(f.xPct) ? Number(f.xPct) : FIELD_GEOMETRY_DEFAULTS.xPct) / 100;
    const yPct = (isFiniteNumber(f.yPct) ? Number(f.yPct) : FIELD_GEOMETRY_DEFAULTS.yPct) / 100;
    const wPct = (isFiniteNumber(f.widthPct) ? Number(f.widthPct) : FIELD_GEOMETRY_DEFAULTS.widthPct) / 100;
    const hPct = (isFiniteNumber(f.heightPct) ? Number(f.heightPct) : FIELD_GEOMETRY_DEFAULTS.heightPct) / 100;
    return { x: w * xPct, y: h * yPct, width: w * wPct, height: h * hPct, source: 'pct' };
  }

  return {
    x: isFiniteNumber(f.x) ? Number(f.x) : w * 0.1,
    y: isFiniteNumber(f.y) ? Number(f.y) : 0,
    width: isFiniteNumber(f.width) ? Number(f.width) : FIELD_GEOMETRY_DEFAULTS.width,
    height: isFiniteNumber(f.height) ? Number(f.height) : FIELD_GEOMETRY_DEFAULTS.height,
    source: 'abs',
  };
}

/**
 * Top-origin PDF-point rectangle to Zoho's four numbers.
 *
 * @param {object} rect      { x, y, width, height } in points, y measured from the page TOP
 * @param {number} pageWidth  page width in points
 * @param {number} pageHeight page height in points
 * @param {object} [opts]
 * @param {'top'|'bottom'} [opts.origin]  where Zoho measures y from — CONFIG, from
 *   ZOHO_SIGN_COORD_ORIGIN, because Zoho does not document it
 * @param {'pt'|'px'} [opts.unit]         the unit Zoho expects — CONFIG, from ZOHO_SIGN_COORD_UNIT
 * @param {number} [opts.unitScale]       explicit multiplier, overriding the unit table; the knob
 *   calibration turns if the answer is neither pt nor px
 */
function normToZohoCoords(rect, pageWidth, pageHeight, opts) {
  const options = opts || {};
  const origin = options.origin === 'bottom' ? 'bottom' : 'top';
  const unit = Object.prototype.hasOwnProperty.call(ZOHO_COORD_UNIT_SCALES, options.unit) ? options.unit : 'pt';
  const scale = isFiniteNumber(options.unitScale) ? Number(options.unitScale) : ZOHO_COORD_UNIT_SCALES[unit];
  const h = isFiniteNumber(pageHeight) ? Number(pageHeight) : DEFAULT_PAGE_SIZE_PT.height;

  const width = Math.max(1, Number(rect.width) || 0);
  const height = Math.max(1, Number(rect.height) || 0);
  // A bottom origin measures to the field's bottom edge, which is the top offset plus its own
  // height subtracted from the page — not simply h - y.
  const y = origin === 'bottom' ? h - Number(rect.y || 0) - height : Number(rect.y || 0);

  // VERIFIED 2026-09-14: all four go over the wire as numbers. The docs show abs_width/abs_height
  // quoted ("150"); a string is part of what Zoho refused with 9039.
  return {
    x_coord: Math.round(Number(rect.x || 0) * scale),
    y_coord: Math.round(y * scale),
    abs_width: Math.round(width * scale),
    abs_height: Math.round(height * scale),
  };
}

/**
 * One CPQ signature_fields row to one Zoho field object.
 *
 * @param {object} field   the stored row
 * @param {object} opts    { documentId, pageSizes, origin, unit, unitScale, index }
 */
function mapSignatureFieldToZoho(field, opts) {
  const options = opts || {};
  const f = field || {};
  const fieldType = zohoFieldTypeForCpqType(f.type);
  const pageNo = toZohoPageNo(f.page);
  const pageSize = (options.pageSizes && options.pageSizes[Number(f.page)]) || options.pageSize || DEFAULT_PAGE_SIZE_PT;
  const rect = resolveFieldRect(f, pageSize.width, pageSize.height);
  const coords = normToZohoCoords(rect, pageSize.width, pageSize.height, options);
  const index = Number(options.index) >= 0 ? Number(options.index) + 1 : 1;

  return Object.assign({
    document_id: String(options.documentId == null ? '' : options.documentId),
    field_name: `${fieldType}_${index}`,
    field_type_name: fieldType,
    field_label: ZOHO_FIELD_LABELS[fieldType] || fieldType,
    is_mandatory: true,
    page_no: pageNo,
  }, coords);
}

/**
 * All of a document's fields, grouped by the CPQ recipient they belong to.
 *
 * Fields with no `recipient_id` are returned in `unassigned` rather than guessed at: Zoho hangs
 * every field off an action, so a field with no owner has nowhere to go, and silently attaching
 * it to the first signer would put someone else's signature box on their page.
 */
function mapSignatureFieldsToZoho(fields, opts) {
  const options = opts || {};
  const byRecipient = new Map();
  const unassigned = [];
  const counters = new Map();

  (Array.isArray(fields) ? fields : []).forEach((field) => {
    const recipientId = field && field.recipient_id != null ? String(field.recipient_id) : '';
    if (recipientId === '') {
      unassigned.push(field);
      return;
    }
    const index = counters.get(recipientId) || 0;
    counters.set(recipientId, index + 1);
    const mapped = mapSignatureFieldToZoho(field, Object.assign({}, options, { index }));
    if (!byRecipient.has(recipientId)) byRecipient.set(recipientId, []);
    byRecipient.get(recipientId).push(mapped);
  });

  return { byRecipient, unassigned };
}

/**
 * Zoho's hard rule: "every action except VIEW must have at least one field." Checked here so
 * the send fails in CPQ with a fixable message instead of at submit, after the request already
 * exists in the Zoho account.
 */
function actionsMissingFields(actions, recipientIds, fieldsByRecipient) {
  const missing = [];
  (Array.isArray(actions) ? actions : []).forEach((action, index) => {
    if (action.action_type === ZOHO_ACTION_TYPES.VIEW) return;
    const recipientId = recipientIds && recipientIds[index] != null ? String(recipientIds[index]) : '';
    const fields = fieldsByRecipient && typeof fieldsByRecipient.get === 'function'
      ? fieldsByRecipient.get(recipientId)
      : (fieldsByRecipient || {})[recipientId];
    if (!fields || fields.length === 0) {
      missing.push({ index, recipientId, email: action.recipient_email });
    }
  });
  return missing;
}

/** The `data` payload for POST /requests. Only keys Zoho documents — 9015 rejects the rest. */
function buildCreateRequestPayload(options) {
  const opts = options || {};
  const requests = {
    request_name: trimmedString(opts.requestName, 200) || 'CPQ Agreement',
    actions: Array.isArray(opts.actions) ? opts.actions : [],
  };
  if (opts.description) requests.description = trimmedString(opts.description, 500);
  if (opts.notes) requests.notes = trimmedString(opts.notes, 500);
  if (typeof opts.isSequential === 'boolean') requests.is_sequential = opts.isSequential;
  if (isFiniteNumber(opts.expirationDays)) {
    requests.expiration_days = Math.min(90, Math.max(1, Math.round(Number(opts.expirationDays))));
  }
  if (typeof opts.emailReminders === 'boolean') requests.email_reminders = opts.emailReminders;
  if (isFiniteNumber(opts.reminderPeriod)) {
    requests.reminder_period = Math.min(30, Math.max(1, Math.round(Number(opts.reminderPeriod))));
  }
  return { requests };
}

/**
 * One submit action's attributes, taken from the CPQ-side mapped action and passed through the
 * writable allowlist. The source is deliberately our own mapped action rather than the object
 * Zoho echoed from create: echoing Zoho's action back verbatim is what triggers 9043.
 *
 * @param {object} mappedAction  an entry from mapRecipientsToZohoActions().actions
 * @param {number} index         position, used as the signing_order fallback
 */
function pickWritableActionAttributes(mappedAction, index) {
  const source = mappedAction || {};
  const actionType = trimmedString(source.action_type).toUpperCase();
  const attributes = {
    action_type: ZOHO_ACTION_TYPES[actionType] || ZOHO_ACTION_TYPES.SIGN,
    recipient_name: trimmedString(source.recipient_name, 200),
    recipient_email: trimmedString(source.recipient_email).toLowerCase(),
    signing_order: isFiniteNumber(source.signing_order) ? Number(source.signing_order) : Number(index) || 0,
    verify_recipient: source.verify_recipient === true,
  };
  // Built key by key above, then filtered again: the allowlist is the contract, so nothing can
  // be added to this object later without also being declared writable.
  return ZOHO_WRITABLE_ACTION_KEYS.reduce((picked, key) => {
    if (Object.prototype.hasOwnProperty.call(attributes, key)) picked[key] = attributes[key];
    return picked;
  }, {});
}

/**
 * The `data` payload for POST /requests/{id}/submit: each Zoho action_id echoed back with the
 * full writable attribute set and the fields that belong to it.
 *
 * VERIFIED 2026-09-14: {action_id, fields} alone is refused with 9039. action_type,
 * recipient_name, recipient_email, signing_order and verify_recipient must all be present.
 *
 * All three list arguments are positional against the actions array returned by
 * mapRecipientsToZohoActions, which is the same order Zoho echoed them in.
 *
 * @param {string[]} zohoActionIds    action ids from the create response
 * @param {object[]} mappedActions    the CPQ-side actions the ids belong to
 * @param {string[]} recipientIds     CPQ recipient ids, for the field lookup
 * @param {Map|object} fieldsByRecipient
 */
function buildSubmitPayload(zohoActionIds, mappedActions, recipientIds, fieldsByRecipient) {
  const actions = (Array.isArray(zohoActionIds) ? zohoActionIds : []).map((actionId, index) => {
    const recipientId = recipientIds && recipientIds[index] != null ? String(recipientIds[index]) : '';
    const fields = (fieldsByRecipient && typeof fieldsByRecipient.get === 'function'
      ? fieldsByRecipient.get(recipientId)
      : (fieldsByRecipient || {})[recipientId]) || [];
    const mappedAction = Array.isArray(mappedActions) ? mappedActions[index] : null;
    return Object.assign(
      { action_id: String(actionId) },
      pickWritableActionAttributes(mappedAction, index),
      { fields },
    );
  });
  return { requests: { actions } };
}

module.exports = {
  ZOHO_ACTION_TYPES,
  ZOHO_MAX_RECIPIENTS,
  ZOHO_FIELD_TYPE_BY_CPQ_TYPE,
  ZOHO_WRITABLE_ACTION_KEYS,
  ZOHO_READONLY_ACTION_KEYS,
  ZOHO_COORD_UNIT_SCALES,
  DEFAULT_PAGE_SIZE_PT,
  zohoActionTypeForRecipient,
  sortRecipientsForZoho,
  validateZohoRecipients,
  mapRecipientsToZohoActions,
  toZohoPageNo,
  zohoFieldTypeForCpqType,
  resolveFieldRect,
  normToZohoCoords,
  mapSignatureFieldToZoho,
  mapSignatureFieldsToZoho,
  actionsMissingFields,
  buildCreateRequestPayload,
  pickWritableActionAttributes,
  buildSubmitPayload,
};
