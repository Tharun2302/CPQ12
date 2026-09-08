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

describe('resolveEsignSigningOrderEnforced', () => {
  const { resolveEsignSigningOrderEnforced } = sequentialUtils as {
    resolveEsignSigningOrderEnforced: (doc: unknown, optionValue?: unknown) => boolean;
  };

  it('honours the flag stored on the document when the caller supplies nothing', () => {
    expect(resolveEsignSigningOrderEnforced({ signing_order_enforced: true }, undefined)).toBe(true);
  });

  it('stays simultaneous when the document was never set to sequential', () => {
    expect(resolveEsignSigningOrderEnforced({ signing_order_enforced: false }, undefined)).toBe(false);
    expect(resolveEsignSigningOrderEnforced({}, undefined)).toBe(false);
  });

  it('lets an explicit caller option override the stored flag in both directions', () => {
    expect(resolveEsignSigningOrderEnforced({ signing_order_enforced: true }, false)).toBe(false);
    expect(resolveEsignSigningOrderEnforced({ signing_order_enforced: false }, true)).toBe(true);
  });

  it('requires a real boolean on the document to enforce', () => {
    expect(resolveEsignSigningOrderEnforced({ signing_order_enforced: 'yes' }, undefined)).toBe(false);
  });

  it('falls back to the document when the caller option is not a boolean', () => {
    expect(resolveEsignSigningOrderEnforced({ signing_order_enforced: true }, 'true')).toBe(true);
    expect(resolveEsignSigningOrderEnforced({ signing_order_enforced: true }, null)).toBe(true);
    expect(resolveEsignSigningOrderEnforced({ signing_order_enforced: false }, null)).toBe(false);
  });

  it('does not crash on a missing document', () => {
    expect(resolveEsignSigningOrderEnforced(null, undefined)).toBe(false);
  });
});

describe('esignRecipientEmailWithheld', () => {
  const { esignRecipientEmailWithheld } = sequentialUtils as {
    esignRecipientEmailWithheld: (doc: unknown, rec: unknown) => boolean;
  };
  const sequential = { signing_order_enforced: true };

  it('withholds mail from a recipient whose turn has not come up', () => {
    expect(esignRecipientEmailWithheld(sequential, deferredSigner())).toBe(true);
  });

  it('allows mail once the recipient has been invited', () => {
    expect(esignRecipientEmailWithheld(sequential, reviewer())).toBe(false);
    expect(esignRecipientEmailWithheld(sequential, deferredSigner({ sent_at: new Date() }))).toBe(false);
  });

  it('never withholds on a simultaneous envelope', () => {
    expect(esignRecipientEmailWithheld({ signing_order_enforced: false }, deferredSigner())).toBe(false);
    expect(esignRecipientEmailWithheld({}, deferredSigner())).toBe(false);
  });

  it('treats an undefined sent_at the same as null', () => {
    expect(esignRecipientEmailWithheld(sequential, { email: 'a@b.com', signing_token: 't' })).toBe(true);
  });

  it('does not crash on missing document or recipient', () => {
    expect(esignRecipientEmailWithheld(null, deferredSigner())).toBe(false);
    expect(esignRecipientEmailWithheld(sequential, null)).toBe(false);
  });
});

describe('findEsignBlockingPredecessor', () => {
  const { findEsignBlockingPredecessor } = sequentialUtils as {
    findEsignBlockingPredecessor: (doc: unknown, recipients: unknown, recipientId: unknown) => Recipient | null;
  };
  const sequential = { signing_order_enforced: true };
  const first = (over: Partial<Recipient> = {}) => ({ ...reviewer(over), _id: 'r1' });
  const second = (over: Partial<Recipient> = {}) => ({ ...deferredSigner(over), _id: 'r2' });

  it('blocks the signer while the reviewer ahead of them has not acted', () => {
    const blocker = findEsignBlockingPredecessor(sequential, [first({ status: 'viewed' }), second()], 'r2');
    expect(blocker?.email).toBe('joanna.wald@example.com');
  });

  it('lets the signer through once the reviewer has approved', () => {
    expect(findEsignBlockingPredecessor(sequential, [first(), second()], 'r2')).toBeNull();
  });

  it('never blocks the first recipient', () => {
    expect(findEsignBlockingPredecessor(sequential, [first({ status: 'pending' }), second()], 'r1')).toBeNull();
  });

  it('treats a signed predecessor as done and a denied one as blocking', () => {
    expect(findEsignBlockingPredecessor(sequential, [first({ status: 'signed' }), second()], 'r2')).toBeNull();
    expect(findEsignBlockingPredecessor(sequential, [first({ status: 'denied' }), second()], 'r2')?._id).toBe('r1');
  });

  it('reports the earliest outstanding recipient, not the nearest', () => {
    const rows = [first({ status: 'pending' }), { ...second({ status: 'viewed' }), _id: 'r2' }, { ...second(), _id: 'r3' }];
    expect(findEsignBlockingPredecessor(sequential, rows, 'r3')?._id).toBe('r1');
  });

  it('never blocks on a simultaneous envelope', () => {
    expect(findEsignBlockingPredecessor({ signing_order_enforced: false }, [first({ status: 'pending' }), second()], 'r2')).toBeNull();
  });

  it('handles unknown ids, malformed lists and a missing document', () => {
    expect(findEsignBlockingPredecessor(sequential, [first(), second()], 'nope')).toBeNull();
    expect(findEsignBlockingPredecessor(sequential, null, 'r2')).toBeNull();
    expect(findEsignBlockingPredecessor(sequential, [null, second()], 'r2')).toBeNull();
    expect(findEsignBlockingPredecessor(null, [first({ status: 'pending' }), second()], 'r2')).toBeNull();
  });
});
