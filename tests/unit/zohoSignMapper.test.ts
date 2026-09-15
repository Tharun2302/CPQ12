import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import mapper from '../../zoho-sign-mapper.cjs';

// Two of these rules are known production hazards rather than theory. Zoho's page_no is 0-based
// and CPQ's page is 1-based, so an untested conversion puts every field one page out. And Zoho
// publishes no unit, origin or reference size for coordinates, so the conversion is written with
// origin and unit as PARAMETERS — these tests prove both directions work, and deliberately do
// NOT pin which one is correct. That answer comes from calibration against a real account.

type Rect = { x: number; y: number; width: number; height: number; source: string };
type ZohoCoords = { x_coord: number; y_coord: number; abs_width: number; abs_height: number };
type ZohoAction = { action_type: string; recipient_name: string; recipient_email: string; signing_order: number; private_notes?: string; is_embedded?: boolean };
type ZohoField = Record<string, unknown>;

const {
  ZOHO_ACTION_TYPES, ZOHO_MAX_RECIPIENTS, DEFAULT_PAGE_SIZE_PT, ZOHO_COORD_UNIT_SCALES,
  ZOHO_WRITABLE_ACTION_KEYS, ZOHO_READONLY_ACTION_KEYS,
  zohoActionTypeForRecipient, sortRecipientsForZoho, validateZohoRecipients,
  mapRecipientsToZohoActions, toZohoPageNo, zohoFieldTypeForCpqType, resolveFieldRect,
  normToZohoCoords, mapSignatureFieldToZoho, mapSignatureFieldsToZoho, actionsMissingFields,
  buildCreateRequestPayload, buildSubmitPayload,
} = mapper as {
  ZOHO_ACTION_TYPES: Record<string, string>;
  ZOHO_MAX_RECIPIENTS: number;
  DEFAULT_PAGE_SIZE_PT: { width: number; height: number };
  ZOHO_COORD_UNIT_SCALES: Record<string, number>;
  ZOHO_WRITABLE_ACTION_KEYS: string[];
  ZOHO_READONLY_ACTION_KEYS: string[];
  zohoActionTypeForRecipient: (recipient: unknown) => string;
  sortRecipientsForZoho: (recipients: unknown) => Array<Record<string, unknown>>;
  validateZohoRecipients: (recipients: unknown) => string[];
  mapRecipientsToZohoActions: (recipients: unknown, options?: Record<string, unknown>) => { actions: ZohoAction[]; recipientIds: string[]; errors: string[] };
  toZohoPageNo: (page: unknown) => number;
  zohoFieldTypeForCpqType: (type: unknown) => string;
  resolveFieldRect: (field: unknown, pageWidth?: number, pageHeight?: number) => Rect;
  normToZohoCoords: (rect: unknown, pageWidth: number, pageHeight: number, opts?: Record<string, unknown>) => ZohoCoords;
  mapSignatureFieldToZoho: (field: unknown, opts?: Record<string, unknown>) => ZohoField;
  mapSignatureFieldsToZoho: (fields: unknown, opts?: Record<string, unknown>) => { byRecipient: Map<string, ZohoField[]>; unassigned: unknown[] };
  actionsMissingFields: (actions: unknown, recipientIds: unknown, fieldsByRecipient: unknown) => Array<{ index: number; recipientId: string; email: string }>;
  buildCreateRequestPayload: (options: unknown) => { requests: Record<string, unknown> };
  buildSubmitPayload: (actionIds: unknown, mappedActions: unknown, recipientIds: unknown, fieldsByRecipient: unknown) => { requests: { actions: Array<Record<string, unknown> & { action_id: string; fields: ZohoField[] }> } };
};

const A4 = { width: 595, height: 842 };

function recipient(overrides: Record<string, unknown> = {}) {
  return { _id: 'r1', name: 'Jane Signer', email: 'jane@example.com', order: 0, action: 'signer', ...overrides };
}

describe('zohoActionTypeForRecipient', () => {
  it('maps a CPQ reviewer to APPROVER and a signer to SIGN', () => {
    expect(zohoActionTypeForRecipient(recipient({ action: 'reviewer' }))).toBe(ZOHO_ACTION_TYPES.APPROVER);
    expect(zohoActionTypeForRecipient(recipient({ action: 'signer' }))).toBe(ZOHO_ACTION_TYPES.SIGN);
  });

  it('reads the action, not the role, so approval-workflow labels do not change what someone must do', () => {
    // role carries 'Legal Team', 'Team Lead' and friends — that says who a person is, not
    // whether they sign.
    expect(zohoActionTypeForRecipient({ role: 'Legal Team', action: 'signer' })).toBe(ZOHO_ACTION_TYPES.SIGN);
    expect(zohoActionTypeForRecipient({ role: 'Legal Team', action: 'reviewer' })).toBe(ZOHO_ACTION_TYPES.APPROVER);
  });

  it('defaults to SIGN when the action is absent, which is what the CPQ default means', () => {
    expect(zohoActionTypeForRecipient({})).toBe(ZOHO_ACTION_TYPES.SIGN);
    expect(zohoActionTypeForRecipient(null)).toBe(ZOHO_ACTION_TYPES.SIGN);
  });
});

describe('sortRecipientsForZoho', () => {
  it('orders by the CPQ order field, breaking ties stably by id', () => {
    const sorted = sortRecipientsForZoho([
      { _id: 'b', order: 1 }, { _id: 'a', order: 0 }, { _id: 'c', order: 1 },
    ]);
    expect(sorted.map((r) => r._id)).toEqual(['a', 'b', 'c']);
  });

  it('puts recipients with no order last rather than first', () => {
    const sorted = sortRecipientsForZoho([{ _id: 'x' }, { _id: 'y', order: 3 }]);
    expect(sorted.map((r) => r._id)).toEqual(['y', 'x']);
  });

  it('does not mutate the caller array and survives a non-array', () => {
    const input = [{ _id: 'b', order: 1 }, { _id: 'a', order: 0 }];
    sortRecipientsForZoho(input);
    expect(input[0]._id).toBe('b');
    expect(sortRecipientsForZoho(null)).toEqual([]);
  });
});

describe('validateZohoRecipients', () => {
  it('passes a well-formed list', () => {
    expect(validateZohoRecipients([recipient()])).toEqual([]);
  });

  it('rejects an empty list', () => {
    expect(validateZohoRecipients([])).toContain('This document has no recipients.');
  });

  it('rejects more recipients than Zoho accepts', () => {
    const many = Array.from({ length: ZOHO_MAX_RECIPIENTS + 1 }, (_, i) => recipient({ _id: `r${i}`, email: `p${i}@example.com` }));
    expect(validateZohoRecipients(many).join(' ')).toMatch(/at most 25 recipients/);
  });

  it('names the recipient with a missing name or a malformed address', () => {
    const errors = validateZohoRecipients([recipient({ name: '  ' }), recipient({ _id: 'r2', email: 'not-an-address' })]);
    expect(errors.join(' ')).toMatch(/jane@example.com has no name/);
    expect(errors.join(' ')).toMatch(/does not have a valid email address/);
  });

  it('catches a duplicated address, which fails the whole Zoho request rather than one action', () => {
    const errors = validateZohoRecipients([recipient(), recipient({ _id: 'r2', email: 'JANE@example.com' })]);
    expect(errors.join(' ')).toMatch(/appears more than once/);
  });
});

describe('mapRecipientsToZohoActions', () => {
  it('produces signing_order from position, in CPQ order', () => {
    const { actions } = mapRecipientsToZohoActions([
      recipient({ _id: 'r2', name: 'Bob', email: 'bob@example.com', order: 1 }),
      recipient({ _id: 'r1', name: 'Jane', email: 'jane@example.com', order: 0 }),
    ]);
    expect(actions.map((a) => [a.recipient_email, a.signing_order])).toEqual([
      ['jane@example.com', 0], ['bob@example.com', 1],
    ]);
  });

  it('lower-cases the address and keeps the CPQ recipient ids beside the payload, not inside it', () => {
    // Zoho rejects unknown keys (error 9015), so the join key travels alongside.
    const { actions, recipientIds } = mapRecipientsToZohoActions([recipient({ email: 'Jane@Example.com' })]);
    expect(actions[0].recipient_email).toBe('jane@example.com');
    expect(recipientIds).toEqual(['r1']);
    expect(Object.keys(actions[0]).sort()).toEqual(['action_type', 'recipient_email', 'recipient_name', 'signing_order', 'verify_recipient']);
  });

  it('carries the per-recipient message as private notes, capped', () => {
    const { actions } = mapRecipientsToZohoActions([recipient({ email_message: 'x'.repeat(900) })]);
    expect(actions[0].private_notes?.length).toBe(500);
  });

  it('marks actions embedded only when asked', () => {
    expect(mapRecipientsToZohoActions([recipient()]).actions[0].is_embedded).toBeUndefined();
    expect(mapRecipientsToZohoActions([recipient()], { isEmbedded: true }).actions[0].is_embedded).toBe(true);
  });

  it('returns the validation errors alongside, so the caller can refuse before calling Zoho', () => {
    const { errors } = mapRecipientsToZohoActions([recipient({ email: 'nope' })]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('toZohoPageNo', () => {
  it('converts CPQ 1-based pages to Zoho 0-based pages', () => {
    // The off-by-one that would otherwise put every field on the wrong page.
    expect(toZohoPageNo(1)).toBe(0);
    expect(toZohoPageNo(2)).toBe(1);
    expect(toZohoPageNo(17)).toBe(16);
  });

  it('never returns a negative page for a missing or bad value', () => {
    expect(toZohoPageNo(0)).toBe(0);
    expect(toZohoPageNo(-4)).toBe(0);
    expect(toZohoPageNo(undefined)).toBe(0);
    expect(toZohoPageNo('three')).toBe(0);
  });

  it('accepts a numeric string, which is what a form post produces', () => {
    expect(toZohoPageNo('3')).toBe(2);
  });
});

describe('zohoFieldTypeForCpqType', () => {
  it('maps every CPQ field type the schema allows', () => {
    expect(zohoFieldTypeForCpqType('signature')).toBe('Signature');
    expect(zohoFieldTypeForCpqType('name')).toBe('Name');
    expect(zohoFieldTypeForCpqType('title')).toBe('Jobtitle');
    expect(zohoFieldTypeForCpqType('date')).toBe('Date');
    expect(zohoFieldTypeForCpqType('text')).toBe('Textfield');
  });

  it('degrades an unknown type to a text box instead of dropping the field', () => {
    expect(zohoFieldTypeForCpqType('wingding')).toBe('Textfield');
    expect(zohoFieldTypeForCpqType(undefined)).toBe('Textfield');
  });
});

describe('resolveFieldRect', () => {
  it('prefers the normalized overlay, exactly as the in-house PDF merger does', () => {
    const rect = resolveFieldRect(
      { xNorm: 0.5, yNorm: 0.25, widthNorm: 0.2, heightNorm: 0.05, xPct: 99, x: 999 },
      A4.width, A4.height,
    );
    expect(rect.source).toBe('norm');
    expect(rect.x).toBeCloseTo(297.5);
    expect(rect.y).toBeCloseTo(210.5);
    expect(rect.width).toBeCloseTo(119);
  });

  it('falls back to percentages, with the merger defaults for the missing halves', () => {
    const rect = resolveFieldRect({ xPct: 10 }, A4.width, A4.height);
    expect(rect.source).toBe('pct');
    expect(rect.x).toBeCloseTo(59.5);
    expect(rect.y).toBeCloseTo(673.6);
    expect(rect.width).toBeCloseTo(119);
  });

  it('falls back to absolute points last', () => {
    const rect = resolveFieldRect({ x: 40, y: 60, width: 150, height: 20 }, A4.width, A4.height);
    expect(rect).toMatchObject({ x: 40, y: 60, width: 150, height: 20, source: 'abs' });
  });

  it('uses US Letter when no page size is known rather than producing NaN', () => {
    const rect = resolveFieldRect({ xNorm: 0.5, yNorm: 0.5, widthNorm: 0.1, heightNorm: 0.1 });
    expect(rect.x).toBeCloseTo(DEFAULT_PAGE_SIZE_PT.width / 2);
    expect(rect.y).toBeCloseTo(DEFAULT_PAGE_SIZE_PT.height / 2);
  });

  it('ignores a partial normalized overlay, because three of four values cannot place a box', () => {
    expect(resolveFieldRect({ xNorm: 0.5, yNorm: 0.5, widthNorm: 0.1 }, A4.width, A4.height).source).toBe('abs');
  });
});

describe('normToZohoCoords', () => {
  const rect = { x: 100, y: 200, width: 150, height: 20 };

  it('passes points straight through with a top origin', () => {
    expect(normToZohoCoords(rect, A4.width, A4.height, { origin: 'top', unit: 'pt' }))
      .toEqual({ x_coord: 100, y_coord: 200, abs_width: 150, abs_height: 20 });
  });

  it('flips to the bottom edge of the field for a bottom origin', () => {
    // Not simply pageHeight - y: a bottom origin measures to the BOTTOM of the box, so its own
    // height comes off too. Getting this wrong shifts every field by its own height.
    expect(normToZohoCoords(rect, A4.width, A4.height, { origin: 'bottom', unit: 'pt' }).y_coord)
      .toBe(A4.height - 200 - 20);
  });

  it('scales to CSS pixels when the unit says px', () => {
    const coords = normToZohoCoords(rect, A4.width, A4.height, { origin: 'top', unit: 'px' });
    expect(coords.x_coord).toBe(Math.round(100 * ZOHO_COORD_UNIT_SCALES.px));
    expect(coords.abs_width).toBe(Math.round(150 * ZOHO_COORD_UNIT_SCALES.px));
  });

  it('accepts an explicit scale, which is the knob calibration turns if neither pt nor px is right', () => {
    expect(normToZohoCoords(rect, A4.width, A4.height, { unitScale: 2 }).x_coord).toBe(200);
  });

  it('defaults to top and pt, and ignores a unit it does not know', () => {
    expect(normToZohoCoords(rect, A4.width, A4.height)).toEqual(normToZohoCoords(rect, A4.width, A4.height, { origin: 'top', unit: 'pt' }));
    expect(normToZohoCoords(rect, A4.width, A4.height, { unit: 'furlongs' }).x_coord).toBe(100);
  });

  it('emits width and height as NUMBERS, and never a zero-size box', () => {
    // Zoho's docs quote these ("150"); the live send on 2026-09-14 proved a string is part of
    // what earns the generic 9039 refusal.
    const coords = normToZohoCoords({ x: 0, y: 0, width: 0, height: 0 }, A4.width, A4.height);
    expect(typeof coords.abs_width).toBe('number');
    expect(typeof coords.abs_height).toBe('number');
    expect(coords.abs_width).toBeGreaterThan(0);
    expect(coords.abs_height).toBeGreaterThan(0);
  });
});

describe('mapSignatureFieldToZoho', () => {
  it('produces the full Zoho field object for a normalized signature box', () => {
    const field = mapSignatureFieldToZoho(
      { type: 'signature', page: 2, recipient_id: 'r1', xNorm: 0.1, yNorm: 0.8, widthNorm: 0.25, heightNorm: 0.04 },
      { documentId: 'doc-1', pageSize: A4, origin: 'top', unit: 'pt', index: 0 },
    );
    expect(field).toMatchObject({
      document_id: 'doc-1',
      field_type_name: 'Signature',
      field_label: 'Signature',
      field_name: 'Signature_1',
      is_mandatory: true,
      page_no: 1,
    });
    expect(field.x_coord).toBe(Math.round(0.1 * A4.width));
  });

  it('uses the real size of the page the field sits on when page sizes are supplied', () => {
    const pageSizes = { 1: { width: 612, height: 792 }, 2: { width: 1224, height: 792 } };
    const wide = mapSignatureFieldToZoho(
      { type: 'text', page: 2, xNorm: 0.5, yNorm: 0.5, widthNorm: 0.1, heightNorm: 0.1 },
      { documentId: 'd', pageSizes },
    );
    expect(wide.x_coord).toBe(612);
  });

  it('gives every field a distinct name per recipient', () => {
    const first = mapSignatureFieldToZoho({ type: 'title', page: 1 }, { documentId: 'd', index: 0 });
    const second = mapSignatureFieldToZoho({ type: 'title', page: 1 }, { documentId: 'd', index: 1 });
    expect(first.field_type_name).toBe('Jobtitle');
    expect(first.field_name).toBe('Jobtitle_1');
    expect(second.field_name).toBe('Jobtitle_2');
  });

  it('never emits field_category, on a signature field or any other', () => {
    // VERIFIED 2026-09-14: field_category is a payment/checkout attribute. Sending it on a
    // signature field is refused with the generic 9039, which names nothing.
    const signature = mapSignatureFieldToZoho({ type: 'signature', page: 1 }, { documentId: 'd', index: 0 });
    const date = mapSignatureFieldToZoho({ type: 'date', page: 1 }, { documentId: 'd', index: 0 });
    expect(signature).not.toHaveProperty('field_category');
    expect(date).not.toHaveProperty('field_category');
  });
});

describe('mapSignatureFieldsToZoho', () => {
  it('groups fields under the recipient that owns them', () => {
    const { byRecipient, unassigned } = mapSignatureFieldsToZoho([
      { type: 'signature', page: 1, recipient_id: 'r1', xNorm: 0.1, yNorm: 0.1, widthNorm: 0.2, heightNorm: 0.05 },
      { type: 'date', page: 1, recipient_id: 'r1' },
      { type: 'signature', page: 2, recipient_id: 'r2' },
    ], { documentId: 'doc-1', pageSize: A4 });

    expect(byRecipient.get('r1')).toHaveLength(2);
    expect(byRecipient.get('r2')).toHaveLength(1);
    expect(unassigned).toHaveLength(0);
  });

  it('sets aside a field with no recipient instead of guessing an owner', () => {
    // Attaching an ownerless field to the first signer puts someone else's signature box on
    // their page — a customer-visible mistake, so the caller decides.
    const { byRecipient, unassigned } = mapSignatureFieldsToZoho([
      { type: 'signature', page: 1, recipient_id: null },
      { type: 'signature', page: 1, recipient_id: 'r1' },
    ], { documentId: 'doc-1' });

    expect(unassigned).toHaveLength(1);
    expect(byRecipient.get('r1')).toHaveLength(1);
  });

  it('numbers field names per recipient, so two signers both get Signature_1', () => {
    const { byRecipient } = mapSignatureFieldsToZoho([
      { type: 'signature', page: 1, recipient_id: 'r1' },
      { type: 'signature', page: 1, recipient_id: 'r2' },
    ], { documentId: 'doc-1' });
    expect(byRecipient.get('r1')?.[0].field_name).toBe('Signature_1');
    expect(byRecipient.get('r2')?.[0].field_name).toBe('Signature_1');
  });

  it('survives an empty or missing field list', () => {
    expect(mapSignatureFieldsToZoho(null, {}).byRecipient.size).toBe(0);
    expect(mapSignatureFieldsToZoho([], {}).unassigned).toEqual([]);
  });
});

describe('actionsMissingFields', () => {
  it('flags a signer with no fields, which Zoho rejects at submit', () => {
    // By then the request already exists in the Zoho account with nothing in CPQ pointing at it.
    const { actions, recipientIds } = mapRecipientsToZohoActions([
      recipient({ _id: 'r1', email: 'jane@example.com' }),
      recipient({ _id: 'r2', email: 'bob@example.com', order: 1 }),
    ]);
    const { byRecipient } = mapSignatureFieldsToZoho([{ type: 'signature', page: 1, recipient_id: 'r1' }], { documentId: 'd' });

    const missing = actionsMissingFields(actions, recipientIds, byRecipient);
    expect(missing).toHaveLength(1);
    expect(missing[0].email).toBe('bob@example.com');
  });

  it('flags a reviewer too, because APPROVER is not exempt — only VIEW is', () => {
    const { actions, recipientIds } = mapRecipientsToZohoActions([recipient({ action: 'reviewer' })]);
    expect(actionsMissingFields(actions, recipientIds, new Map())).toHaveLength(1);
  });

  it('exempts a VIEW action', () => {
    const { actions, recipientIds } = mapRecipientsToZohoActions([recipient({ action: 'viewer' })]);
    expect(actionsMissingFields(actions, recipientIds, new Map())).toEqual([]);
  });

  it('accepts a plain object as well as a Map', () => {
    const { actions, recipientIds } = mapRecipientsToZohoActions([recipient()]);
    expect(actionsMissingFields(actions, recipientIds, { r1: [{}] })).toEqual([]);
  });
});

describe('buildCreateRequestPayload', () => {
  it('wraps the actions under the requests key Zoho expects', () => {
    const payload = buildCreateRequestPayload({ requestName: 'CloudFuze MSA', actions: [{ action_type: 'SIGN' }] });
    expect(payload.requests.request_name).toBe('CloudFuze MSA');
    expect(payload.requests.actions).toHaveLength(1);
  });

  it('omits every optional key that was not supplied, because Zoho rejects unknown or empty keys', () => {
    const payload = buildCreateRequestPayload({ actions: [] });
    expect(Object.keys(payload.requests).sort()).toEqual(['actions', 'request_name']);
    expect(payload.requests.request_name).toBe('CPQ Agreement');
  });

  it('clamps expiry and reminder period into the ranges the design validates', () => {
    expect(buildCreateRequestPayload({ actions: [], expirationDays: 900 }).requests.expiration_days).toBe(90);
    expect(buildCreateRequestPayload({ actions: [], expirationDays: 0 }).requests.expiration_days).toBe(1);
    expect(buildCreateRequestPayload({ actions: [], reminderPeriod: 99 }).requests.reminder_period).toBe(30);
  });

  it('keeps booleans strictly boolean', () => {
    expect(buildCreateRequestPayload({ actions: [], isSequential: false }).requests.is_sequential).toBe(false);
    expect(buildCreateRequestPayload({ actions: [], isSequential: 'yes' }).requests.is_sequential).toBeUndefined();
  });
});

describe('buildSubmitPayload', () => {
  // Every shape asserted here was verified against the real Zoho account on 2026-09-14
  // (request_id 610752000000046007 went to `inprogress`). They are not read off the docs.
  const MAPPED_ACTIONS = [
    { action_type: 'SIGN', recipient_name: 'Dana Signer', recipient_email: 'dana@example.com', signing_order: 0, verify_recipient: false },
    { action_type: 'APPROVER', recipient_name: 'Rex Reviewer', recipient_email: 'rex@example.com', signing_order: 1, verify_recipient: false },
  ];

  it('echoes each Zoho action id back with the fields belonging to its CPQ recipient', () => {
    const { byRecipient } = mapSignatureFieldsToZoho([
      { type: 'signature', page: 1, recipient_id: 'r1' },
      { type: 'date', page: 1, recipient_id: 'r2' },
    ], { documentId: 'doc-1' });

    const payload = buildSubmitPayload(['action-a', 'action-b'], MAPPED_ACTIONS, ['r1', 'r2'], byRecipient);
    expect(payload.requests.actions.map((a) => a.action_id)).toEqual(['action-a', 'action-b']);
    expect(payload.requests.actions[0].fields[0].field_type_name).toBe('Signature');
    expect(payload.requests.actions[1].fields[0].field_type_name).toBe('Date');
  });

  it('carries the full writable action attribute set, because action_id alone is refused with 9039', () => {
    const { byRecipient } = mapSignatureFieldsToZoho([{ type: 'signature', page: 1, recipient_id: 'r1' }], { documentId: 'doc-1' });
    const action = buildSubmitPayload(['action-a'], MAPPED_ACTIONS, ['r1'], byRecipient).requests.actions[0];

    expect(action).toMatchObject({
      action_id: 'action-a',
      action_type: 'SIGN',
      recipient_name: 'Dana Signer',
      recipient_email: 'dana@example.com',
      signing_order: 0,
      verify_recipient: false,
    });
    ZOHO_WRITABLE_ACTION_KEYS.forEach((key) => expect(action).toHaveProperty(key));
  });

  it('emits no field_category and no read-only action key — the two rejections we hit live', () => {
    const { byRecipient } = mapSignatureFieldsToZoho([
      { type: 'signature', page: 1, recipient_id: 'r1' },
      { type: 'date', page: 1, recipient_id: 'r1' },
    ], { documentId: 'doc-1' });

    // A response-shaped action, as Zoho echoes it from create: writable keys mixed with
    // read-only ones. Handing it straight back is 9043 "Extra key found".
    const echoedBack = Object.assign({}, MAPPED_ACTIONS[0], {
      action_status: 'NOTACTIONYET',
      cloud_provider_name: 'Other',
      cloud_provider_id: '-1',
      is_bulk: false,
      is_signing_group: false,
      delivery_mode: 'EMAIL',
      send_completed_document: true,
      recipient_countrycode: '',
      recipient_countrycode_iso: '',
      recipient_phonenumber: '',
    });

    const action = buildSubmitPayload(['action-a'], [echoedBack], ['r1'], byRecipient).requests.actions[0];

    ZOHO_READONLY_ACTION_KEYS.forEach((key) => expect(action).not.toHaveProperty(key));
    expect(Object.keys(action).sort()).toEqual(['action_id', 'fields', ...ZOHO_WRITABLE_ACTION_KEYS].sort());
    action.fields.forEach((field) => {
      expect(field).not.toHaveProperty('field_category');
      expect(typeof field.abs_width).toBe('number');
      expect(typeof field.abs_height).toBe('number');
    });
  });

  it('falls back to a SIGN action at its own position when the mapped action is missing', () => {
    const action = buildSubmitPayload(['action-a'], [], ['r1'], new Map()).requests.actions[0];
    expect(action.action_type).toBe('SIGN');
    expect(action.signing_order).toBe(0);
    expect(action.verify_recipient).toBe(false);
  });

  it('emits an empty field list rather than undefined when a recipient has none', () => {
    const payload = buildSubmitPayload(['action-a'], MAPPED_ACTIONS, ['r1'], new Map());
    expect(payload.requests.actions[0].fields).toEqual([]);
  });

  it('survives a missing action id list', () => {
    expect(buildSubmitPayload(null, null, null, null).requests.actions).toEqual([]);
  });
});
