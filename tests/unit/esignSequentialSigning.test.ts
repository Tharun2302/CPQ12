import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import sequentialUtils from '../../esign-sequential-utils.cjs';

type Recipient = {
  email?: string;
  signing_token?: string;
  status?: string;
  sent_at?: Date | null;
  role?: string;
  action?: string;
};

const { esignSequentialAdvanceAllowed, esignRecipientAwaitingFirstEmail, pickNextEsignSequentialRecipient } =
  sequentialUtils as {
    esignSequentialAdvanceAllowed: (doc: unknown) => boolean;
    esignRecipientAwaitingFirstEmail: (rec: unknown) => boolean;
    pickNextEsignSequentialRecipient: (recipients: unknown) => Recipient | null;
  };

const reviewer = (over: Partial<Recipient> = {}): Recipient => ({
  email: 'joanna.wald@example.com',
  signing_token: 'tok-reviewer',
  status: 'reviewed',
  sent_at: new Date('2026-08-24T10:00:00Z'),
  action: 'reviewer',
  ...over,
});

const deferredSigner = (over: Partial<Recipient> = {}): Recipient => ({
  email: 'christopher.dunn@example.com',
  signing_token: 'tok-signer',
  status: 'pending',
  sent_at: null,
  action: 'signer',
  ...over,
});

describe('esignSequentialAdvanceAllowed', () => {
  it('allows advancing a sent envelope with signing order enforced', () => {
    expect(esignSequentialAdvanceAllowed({ signing_order_enforced: true, status: 'sent' })).toBe(true);
  });

  it('does not advance when signing order was never enforced', () => {
    expect(esignSequentialAdvanceAllowed({ signing_order_enforced: false, status: 'sent' })).toBe(false);
    expect(esignSequentialAdvanceAllowed({ status: 'sent' })).toBe(false);
  });

  it('stops on completed, denied and voided envelopes', () => {
    for (const status of ['completed', 'denied', 'voided']) {
      expect(esignSequentialAdvanceAllowed({ signing_order_enforced: true, status })).toBe(false);
    }
  });

  it('handles a missing document without throwing', () => {
    expect(esignSequentialAdvanceAllowed(null)).toBe(false);
  });
});

describe('esignRecipientAwaitingFirstEmail', () => {
  it('accepts a deferred pending recipient that has a token but no sent_at', () => {
    expect(esignRecipientAwaitingFirstEmail(deferredSigner())).toBe(true);
    expect(esignRecipientAwaitingFirstEmail(deferredSigner({ sent_at: undefined }))).toBe(true);
  });

  it('skips a recipient whose email already went out', () => {
    expect(esignRecipientAwaitingFirstEmail(deferredSigner({ sent_at: new Date() }))).toBe(false);
  });

  it('skips recipients that already acted or cannot be emailed', () => {
    expect(esignRecipientAwaitingFirstEmail(deferredSigner({ status: 'signed' }))).toBe(false);
    expect(esignRecipientAwaitingFirstEmail(deferredSigner({ status: 'reviewed' }))).toBe(false);
    expect(esignRecipientAwaitingFirstEmail(deferredSigner({ status: 'denied' }))).toBe(false);
    expect(esignRecipientAwaitingFirstEmail(deferredSigner({ email: '' }))).toBe(false);
    expect(esignRecipientAwaitingFirstEmail(deferredSigner({ signing_token: undefined }))).toBe(false);
  });
});

describe('pickNextEsignSequentialRecipient', () => {
  it('emails the signer once the reviewer ahead of them has approved', () => {
    const next = pickNextEsignSequentialRecipient([reviewer(), deferredSigner()]);
    expect(next?.email).toBe('christopher.dunn@example.com');
  });

  it('returns the first waiting recipient in signing order, not a later one', () => {
    const next = pickNextEsignSequentialRecipient([
      reviewer(),
      deferredSigner({ email: 'second@example.com', signing_token: 'tok-2' }),
      deferredSigner({ email: 'third@example.com', signing_token: 'tok-3' }),
    ]);
    expect(next?.email).toBe('second@example.com');
  });

  it('returns null when the recipient in front is still pending and already emailed', () => {
    expect(pickNextEsignSequentialRecipient([reviewer({ status: 'pending' })])).toBeNull();
  });

  it('returns null when everyone has completed', () => {
    expect(pickNextEsignSequentialRecipient([reviewer(), deferredSigner({ status: 'signed', sent_at: new Date() })])).toBeNull();
  });

  it('handles empty and malformed input', () => {
    expect(pickNextEsignSequentialRecipient([])).toBeNull();
    expect(pickNextEsignSequentialRecipient(null)).toBeNull();
    expect(pickNextEsignSequentialRecipient([null, deferredSigner()])?.email).toBe('christopher.dunn@example.com');
  });
});
