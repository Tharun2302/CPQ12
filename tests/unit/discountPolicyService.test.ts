import { describe, it, expect, afterEach, vi } from 'vitest';

import { discountPolicyErrorMessage, getDiscountPolicy } from '../../src/services/discountPolicyService';
import { approvalWorkflowServiceMongoDB } from '../../src/services/approvalWorkflowServiceMongoDB';

const response = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discountPolicyErrorMessage', () => {
  it('returns the server message for discount policy codes', () => {
    const err = Object.assign(new Error('Discount exceeds the maximum allowed (15%)'), { code: 'DISCOUNT_EXCEEDS_MAX' });
    expect(discountPolicyErrorMessage(err)).toBe('Discount exceeds the maximum allowed (15%)');
    expect(discountPolicyErrorMessage(Object.assign(new Error('bad'), { code: 'INVALID_DISCOUNT' }))).toBe('bad');
  });

  it('returns null for unrelated errors', () => {
    expect(discountPolicyErrorMessage(new Error('boom'))).toBeNull();
    expect(discountPolicyErrorMessage(Object.assign(new Error('x'), { code: 'CONFLICT' }))).toBeNull();
    expect(discountPolicyErrorMessage('nope')).toBeNull();
  });
});

describe('getDiscountPolicy', () => {
  it('replaces an out-of-range server value with the safe default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(200, { success: true, data: { maxDiscountPercent: 500 } })));
    const result = await getDiscountPolicy();
    expect(result).toEqual({ success: true, data: { maxDiscountPercent: 15, updatedAt: null, updatedBy: null } });
  });

  it('maps a 401 to the login-expired message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(401, { success: false, error: 'Unauthorized' })));
    const result = await getDiscountPolicy();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/login has expired/);
  });
});

describe('saveWorkflow discount rejection', () => {
  it('throws an error carrying the server code and message', async () => {
    const body = {
      success: false,
      error: 'Discount exceeds the maximum allowed (15%)',
      code: 'DISCOUNT_EXCEEDS_MAX',
      maxDiscountPercent: 15,
    };
    vi.stubGlobal('fetch', vi.fn(async () => response(400, body)));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const error = await approvalWorkflowServiceMongoDB
      .saveWorkflow({ discountPercent: 40 } as never)
      .catch((e: unknown) => e);

    expect(discountPolicyErrorMessage(error)).toBe('Discount exceeds the maximum allowed (15%)');
    expect((error as { status: number }).status).toBe(400);
  });
});
