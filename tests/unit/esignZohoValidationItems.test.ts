import { describe, it, expect } from 'vitest';
import {
  ZOHO_SEND_SUCCESS_LINE,
  isEsignSendSuccessMessage,
  zohoValidationItems,
} from '../../src/utils/esignProviderCopy';

// These two rules are Zoho's, not CPQ's. They must never appear on, or block, an in-house send —
// the pages gate them on the selected provider, and these cover the rules themselves.

const field = (recipientId?: string | null) => ({ recipient_id: recipientId ?? null });

describe('zohoValidationItems', () => {
  it('passes a small, fully-fielded request', () => {
    const items = zohoValidationItems(2, ['a', 'b'], [field('a'), field('b')]);
    expect(items.map((i) => i.done)).toEqual([true, true]);
    expect(items.map((i) => i.label)).toEqual(['25 recipients or fewer', 'Every signer has at least one field']);
  });

  it('accepts unassigned fields as covering every signer, matching the in-house rule', () => {
    const items = zohoValidationItems(3, ['a', 'b', 'c'], [field(null)]);
    expect(items[1].done).toBe(true);
  });

  it('fails when one signer has no field of their own and none are shared', () => {
    const items = zohoValidationItems(2, ['a', 'b'], [field('a')]);
    expect(items[1].done).toBe(false);
  });

  it('fails above Zoho’s 25-recipient ceiling and passes at exactly 25', () => {
    expect(zohoValidationItems(26, [], [])[0].done).toBe(false);
    expect(zohoValidationItems(25, [], [])[0].done).toBe(true);
  });

  it('does not demand fields for a review-only send', () => {
    expect(zohoValidationItems(2, [], [])[1].done).toBe(true);
  });

  it('marks neither check optional, so a failing one blocks the send button', () => {
    expect(zohoValidationItems(26, ['a'], []).every((i) => i.optional === undefined)).toBe(true);
  });
});

describe('isEsignSendSuccessMessage', () => {
  it('treats the Zoho line as success so the banner is green, not amber', () => {
    expect(isEsignSendSuccessMessage(ZOHO_SEND_SUCCESS_LINE)).toBe(true);
  });

  it('keeps the in-house banners classified exactly as before', () => {
    expect(isEsignSendSuccessMessage('Successfully sent email to recipient(s).')).toBe(true);
    expect(isEsignSendSuccessMessage('Document already sent.')).toBe(true);
    expect(isEsignSendSuccessMessage('Signing links issued.')).toBe(true);
    expect(isEsignSendSuccessMessage('Failed to send.')).toBe(false);
    expect(isEsignSendSuccessMessage('Could not save recipients. Please try again.')).toBe(false);
  });
});
