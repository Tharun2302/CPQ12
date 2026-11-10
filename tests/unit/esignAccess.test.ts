import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import esignAccess from '../../esign-access.cjs';

const { coerceToken, isExpired, signerCanReadDocument, portalCanReadDocument, redactRecipientForViewer } = esignAccess;

const NOW = Date.parse('2026-11-10T12:00:00Z');
const FUTURE = '2026-11-20T00:00:00Z';
const PAST = '2026-11-01T00:00:00Z';
const TOKEN = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d';

describe('coerceToken', () => {
  it('accepts a plausible string token and trims it', () => {
    expect(coerceToken(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it('rejects objects so a MongoDB operator can never reach a filter', () => {
    expect(coerceToken({ $ne: null })).toBe('');
    expect(coerceToken({ $regex: '.*' })).toBe('');
    expect(coerceToken([TOKEN])).toBe('');
  });

  it('rejects missing, empty, too-short and absurdly long values', () => {
    expect(coerceToken(undefined)).toBe('');
    expect(coerceToken(null)).toBe('');
    expect(coerceToken('')).toBe('');
    expect(coerceToken('short')).toBe('');
    expect(coerceToken('x'.repeat(257))).toBe('');
  });
});

describe('isExpired', () => {
  it('treats a missing expiry as valid (links issued before expiry existed)', () => {
    expect(isExpired(undefined, NOW)).toBe(false);
    expect(isExpired(null, NOW)).toBe(false);
  });

  it('compares against now', () => {
    expect(isExpired(PAST, NOW)).toBe(true);
    expect(isExpired(FUTURE, NOW)).toBe(false);
  });
});

describe('signerCanReadDocument', () => {
  const recipient = { document_id: 'docA', email: 'Signer@Client.com', token_expires_at: FUTURE };

  it('allows the document the signing link belongs to', () => {
    expect(signerCanReadDocument({ recipient, docId: 'docA', now: NOW })).toBe(true);
  });

  it('allows another document on which the same email is a recipient (inbox history)', () => {
    expect(signerCanReadDocument({
      recipient, docId: 'docB', docRecipientEmails: ['other@x.com', ' signer@client.com '], now: NOW,
    })).toBe(true);
  });

  it('refuses a document the link holder is not a party to', () => {
    expect(signerCanReadDocument({
      recipient, docId: 'docB', docRecipientEmails: ['other@x.com'], now: NOW,
    })).toBe(false);
  });

  it('refuses an expired link, even for its own document', () => {
    expect(signerCanReadDocument({
      recipient: { ...recipient, token_expires_at: PAST }, docId: 'docA', now: NOW,
    })).toBe(false);
  });

  it('matches ObjectId-like ids by their string form', () => {
    const oid = { toString: () => '65f0c0ffee' };
    expect(signerCanReadDocument({ recipient: { ...recipient, document_id: oid }, docId: '65f0c0ffee', now: NOW })).toBe(true);
  });

  it('refuses when there is no recipient or no email to match on', () => {
    expect(signerCanReadDocument({ recipient: null, docId: 'docA', now: NOW })).toBe(false);
    expect(signerCanReadDocument({
      recipient: { document_id: 'docA', email: '' }, docId: 'docB', docRecipientEmails: [''], now: NOW,
    })).toBe(false);
  });
});

describe('portalCanReadDocument', () => {
  const record = { workflowId: 'wf-1', role: 'legal', token: 'x', expiresAt: FUTURE };
  const workflow = { id: 'wf-1', esignDocumentId: 'docA' };

  it("allows the e-sign document attached to the portal's workflow", () => {
    expect(portalCanReadDocument({ record, workflow, docId: 'docA', now: NOW })).toBe(true);
  });

  it('refuses any other document', () => {
    expect(portalCanReadDocument({ record, workflow, docId: 'docB', now: NOW })).toBe(false);
  });

  it('refuses when the workflow has no e-sign document yet', () => {
    expect(portalCanReadDocument({ record, workflow: { id: 'wf-1' }, docId: 'docA', now: NOW })).toBe(false);
  });

  it('refuses an expired or expiry-less portal token', () => {
    expect(portalCanReadDocument({ record: { ...record, expiresAt: PAST }, workflow, docId: 'docA', now: NOW })).toBe(false);
    expect(portalCanReadDocument({ record: { ...record, expiresAt: undefined }, workflow, docId: 'docA', now: NOW })).toBe(false);
  });

  it('refuses a token issued for a different workflow', () => {
    expect(portalCanReadDocument({ record: { ...record, workflowId: 'wf-2' }, workflow, docId: 'docA', now: NOW })).toBe(false);
  });
});

describe('redactRecipientForViewer', () => {
  const view = { id: 'r1', email: 'a@b.com', status: 'pending', signing_token: TOKEN, token_expires_at: FUTURE };

  it('keeps signing tokens for staff, who need them for "Copy signing link"', () => {
    expect(redactRecipientForViewer(view, 'staff')).toEqual(view);
  });

  it('strips signing tokens for signers and portal reviewers', () => {
    for (const kind of ['signer', 'portal']) {
      const out = redactRecipientForViewer(view, kind);
      expect(out).not.toHaveProperty('signing_token');
      expect(out).not.toHaveProperty('token_expires_at');
      expect(out).toEqual({ id: 'r1', email: 'a@b.com', status: 'pending' });
    }
  });
});
