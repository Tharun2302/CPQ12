import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import policy from '../../discount-policy.cjs';

type ValidateResult = { ok: boolean; value?: number; error?: string };
type CheckResult = { ok: boolean; value?: number; error?: string; code?: string; maxDiscountPercent: number };
type PolicyResponse = { maxDiscountPercent: number; updatedAt: unknown; updatedBy: unknown };
type Reader = { get: () => Promise<number>; invalidate: () => void };

const {
  DEFAULT_MAX_DISCOUNT_PERCENT,
  ABSOLUTE_MAX_DISCOUNT_PERCENT,
  INVALID_MAX_DISCOUNT_ERROR,
  validateMaxDiscountPercent,
  checkDiscountWithinMax,
  hasNestedDiscountKey,
  discountRejectionBody,
  toDiscountPolicyResponse,
  createMaxDiscountReader,
} = policy as {
  DEFAULT_MAX_DISCOUNT_PERCENT: number;
  ABSOLUTE_MAX_DISCOUNT_PERCENT: number;
  INVALID_MAX_DISCOUNT_ERROR: string;
  validateMaxDiscountPercent: (value: unknown) => ValidateResult;
  checkDiscountWithinMax: (discount: unknown, max: unknown) => CheckResult;
  hasNestedDiscountKey: (updates: unknown, field: string) => boolean;
  discountRejectionBody: (check: CheckResult) => Record<string, unknown>;
  toDiscountPolicyResponse: (doc: unknown, opts?: { includeUpdatedBy?: boolean }) => PolicyResponse;
  createMaxDiscountReader: (opts: {
    loadDoc: () => Promise<unknown>;
    ttlMs?: number;
    now?: () => number;
  }) => Reader;
};

describe('discount policy constants', () => {
  it('defaults to 15% with a hard ceiling of 100%', () => {
    expect(DEFAULT_MAX_DISCOUNT_PERCENT).toBe(15);
    expect(ABSOLUTE_MAX_DISCOUNT_PERCENT).toBe(100);
  });
});

describe('validateMaxDiscountPercent', () => {
  it.each([0, 15, 100, 12.5, 0.29, 99.99])('accepts %s', (value) => {
    expect(validateMaxDiscountPercent(value)).toEqual({ ok: true, value });
  });

  it.each([
    ['negative', -1],
    ['above 100', 101],
    ['numeric string', '15'],
    ['NaN', NaN],
    ['null', null],
    ['undefined', undefined],
    ['boolean', true],
    ['Infinity', Infinity],
    ['more than two decimals', 12.345],
    ['object', { value: 15 }],
  ])('rejects %s', (_label, value) => {
    expect(validateMaxDiscountPercent(value)).toEqual({ ok: false, error: INVALID_MAX_DISCOUNT_ERROR });
  });
});

describe('checkDiscountWithinMax', () => {
  it('accepts a discount exactly at the limit', () => {
    expect(checkDiscountWithinMax(15, 15)).toMatchObject({ ok: true, value: 15, maxDiscountPercent: 15 });
  });

  it('rejects a discount above the limit with the cap in the message', () => {
    expect(checkDiscountWithinMax(15.01, 15)).toEqual({
      ok: false,
      code: 'DISCOUNT_EXCEEDS_MAX',
      error: 'Discount exceeds the maximum allowed (15%)',
      maxDiscountPercent: 15,
    });
  });

  it.each([undefined, null, ''])('treats %s as no discount', (discount) => {
    expect(checkDiscountWithinMax(discount, 15)).toMatchObject({ ok: true, value: 0 });
  });

  it('rejects a negative discount', () => {
    expect(checkDiscountWithinMax(-5, 15)).toMatchObject({ ok: false, code: 'INVALID_DISCOUNT' });
  });

  it('parses numeric strings sent by older clients', () => {
    expect(checkDiscountWithinMax('10', 15)).toMatchObject({ ok: true, value: 10 });
    expect(checkDiscountWithinMax(' 12.5 ', 15)).toMatchObject({ ok: true, value: 12.5 });
    expect(checkDiscountWithinMax('20', 15)).toMatchObject({ ok: false, code: 'DISCOUNT_EXCEEDS_MAX' });
  });

  it.each(['abc', '10%', '0x10', '1e3', true, {}, [], NaN, Infinity])('rejects non-numeric %s', (discount) => {
    expect(checkDiscountWithinMax(discount, 15)).toMatchObject({ ok: false, code: 'INVALID_DISCOUNT' });
  });

  it('blocks any discount when the cap is 0', () => {
    expect(checkDiscountWithinMax(0, 0).ok).toBe(true);
    expect(checkDiscountWithinMax(0.01, 0)).toMatchObject({ ok: false, code: 'DISCOUNT_EXCEEDS_MAX', maxDiscountPercent: 0 });
  });

  it('rounds discounts to 2 decimals instead of rejecting them', () => {
    expect(checkDiscountWithinMax(12.345, 15)).toMatchObject({ ok: true, value: 12.35 });
    expect(checkDiscountWithinMax(12.344, 15)).toMatchObject({ ok: true, value: 12.34 });
    expect(checkDiscountWithinMax('9.999', 15)).toMatchObject({ ok: true, value: 10 });
  });

  it('absorbs float noise at the cap but still rejects a cent over', () => {
    expect(checkDiscountWithinMax(15.0000001, 15)).toMatchObject({ ok: true, value: 15 });
    expect(checkDiscountWithinMax(15.004, 15)).toMatchObject({ ok: true, value: 15 });
    expect(checkDiscountWithinMax(15.006, 15)).toMatchObject({ ok: false, code: 'DISCOUNT_EXCEEDS_MAX' });
    expect(checkDiscountWithinMax(15.01, 15)).toMatchObject({ ok: false, code: 'DISCOUNT_EXCEEDS_MAX' });
    expect(checkDiscountWithinMax(0.29 * 100, 29)).toMatchObject({ ok: true, value: 29 });
  });

  it('rejects a tiny negative discount even though it rounds to 0', () => {
    expect(checkDiscountWithinMax(-0.001, 15)).toMatchObject({ ok: false, code: 'INVALID_DISCOUNT' });
  });

  it('falls back to the default cap when the given cap is invalid', () => {
    expect(checkDiscountWithinMax(20, 'bogus')).toMatchObject({ ok: false, maxDiscountPercent: 15 });
    expect(checkDiscountWithinMax(15, undefined)).toMatchObject({ ok: true, maxDiscountPercent: 15 });
  });
});

describe('hasNestedDiscountKey', () => {
  it('flags dotted paths under the discount field', () => {
    expect(hasNestedDiscountKey({ 'discountPercent.x': 50 }, 'discountPercent')).toBe(true);
    expect(hasNestedDiscountKey({ status: 'approved', 'discountPercent.0': 1 }, 'discountPercent')).toBe(true);
  });

  it('allows the plain field and unrelated keys', () => {
    expect(hasNestedDiscountKey({ discountPercent: 10, status: 'x' }, 'discountPercent')).toBe(false);
    expect(hasNestedDiscountKey({ discountPercentNote: 'x', 'meta.discountPercent': 1 }, 'discountPercent')).toBe(false);
    expect(hasNestedDiscountKey(null, 'discountPercent')).toBe(false);
  });
});

describe('discountRejectionBody', () => {
  it('builds the 400 body the API returns', () => {
    expect(discountRejectionBody(checkDiscountWithinMax(30, 20))).toEqual({
      success: false,
      error: 'Discount exceeds the maximum allowed (20%)',
      code: 'DISCOUNT_EXCEEDS_MAX',
      maxDiscountPercent: 20,
    });
  });
});

describe('toDiscountPolicyResponse', () => {
  it('returns defaults when no policy has been saved', () => {
    expect(toDiscountPolicyResponse(null)).toEqual({ maxDiscountPercent: 15, updatedAt: null, updatedBy: null });
  });

  it('returns the stored policy', () => {
    const updatedAt = new Date('2026-10-01T00:00:00Z');
    expect(toDiscountPolicyResponse({ maxDiscountPercent: 20, updatedAt, updatedBy: 'a@x.com' })).toEqual({
      maxDiscountPercent: 20,
      updatedAt,
      updatedBy: 'a@x.com',
    });
  });

  it('hides who last edited the policy from non-admins', () => {
    const doc = { maxDiscountPercent: 20, updatedAt: null, updatedBy: 'a@x.com' };
    expect(toDiscountPolicyResponse(doc, { includeUpdatedBy: false })).toEqual({
      maxDiscountPercent: 20,
      updatedAt: null,
      updatedBy: null,
    });
    expect(toDiscountPolicyResponse(doc, { includeUpdatedBy: true }).updatedBy).toBe('a@x.com');
  });

  it('ignores a corrupt stored value', () => {
    expect(toDiscountPolicyResponse({ maxDiscountPercent: '50' }).maxDiscountPercent).toBe(15);
  });
});

describe('createMaxDiscountReader', () => {
  it('caches the cap for the TTL and reloads after it expires', async () => {
    let clock = 0;
    const loadDoc = vi.fn().mockResolvedValue({ maxDiscountPercent: 20 });
    const reader = createMaxDiscountReader({ loadDoc, ttlMs: 1000, now: () => clock });

    expect(await reader.get()).toBe(20);
    clock = 999;
    expect(await reader.get()).toBe(20);
    expect(loadDoc).toHaveBeenCalledTimes(1);

    clock = 1000;
    await reader.get();
    expect(loadDoc).toHaveBeenCalledTimes(2);
  });

  it('reloads immediately after invalidate so a saved policy applies at once', async () => {
    const loadDoc = vi.fn()
      .mockResolvedValueOnce({ maxDiscountPercent: 20 })
      .mockResolvedValueOnce({ maxDiscountPercent: 5 });
    const reader = createMaxDiscountReader({ loadDoc, now: () => 0 });

    expect(await reader.get()).toBe(20);
    reader.invalidate();
    expect(await reader.get()).toBe(5);
  });

  it('returns the default when the doc is missing or invalid', async () => {
    expect(await createMaxDiscountReader({ loadDoc: async () => null }).get()).toBe(15);
    expect(await createMaxDiscountReader({ loadDoc: async () => ({ maxDiscountPercent: 500 }) }).get()).toBe(15);
  });

  it('returns the default on a DB error without caching it', async () => {
    const loadDoc = vi.fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ maxDiscountPercent: 25 });
    const reader = createMaxDiscountReader({ loadDoc, now: () => 0 });

    expect(await reader.get()).toBe(15);
    expect(await reader.get()).toBe(25);
  });
});

describe('server.cjs wiring — discount cap', () => {
  const serverPath = fileURLToPath(new URL('../../server.cjs', import.meta.url));
  const serverSrc = fs.readFileSync(serverPath, 'utf8');

  function routeSource(pattern: RegExp) {
    const start = serverSrc.search(pattern);
    const end = serverSrc.indexOf('\napp.', start + 1);
    return { start, route: serverSrc.slice(start, end === -1 ? undefined : end) };
  }

  it('loads the shared policy module', () => {
    expect(serverSrc).toMatch(/require\(['"]\.\/discount-policy\.cjs['"]\)/);
  });

  it('lets any logged-in user read the policy', () => {
    const { start, route } = routeSource(/app\.get\(\s*['"]\/api\/settings\/discount-policy['"]/);
    expect(start).toBeGreaterThan(-1);
    expect(route).toContain('getAuthenticatedUser(req, res)');
    expect(route).not.toContain('getApprovalAdminUser(');
  });

  it('only shows updatedBy to approval admins on read', () => {
    const { route } = routeSource(/app\.get\(\s*['"]\/api\/settings\/discount-policy['"]/);
    expect(route).toContain('hasApprovalAdminAccess(authUser)');
    expect(route).toContain('toDiscountPolicyResponse(doc, { includeUpdatedBy })');
    expect(route).toContain('logger.error(');
    expect(route).not.toContain('console.error');
  });

  it('lets only approval admins change the policy, rate limited, validated and audited', () => {
    const { start, route } = routeSource(/app\.put\(\s*['"]\/api\/settings\/discount-policy['"]/);
    expect(start).toBeGreaterThan(-1);
    expect(route).toContain('discountPolicyLimiter');
    expect(route).toContain("getApprovalAdminUser(req, res, 'Only approval admins can change the discount policy')");
    expect(route).toContain('logger.error(');
    expect(route).not.toContain('console.error');
    expect(route.indexOf('validateMaxDiscountPercent(')).toBeLessThan(route.indexOf('.updateOne('));
    expect(route).toContain('invalidateMaxDiscountCache()');
    expect(route).toContain("logger.info('Discount policy updated'");
    expect(route).not.toMatch(/res\.status\(500\)\.json\(\{[^}]*e\.message/);
  });

  it('enforces the cap when a quote is saved and persists the discount', () => {
    const { route } = routeSource(/app\.post\(\s*['"]\/api\/quotes['"]/);
    expect(route).toContain('enforceDiscountCap(discount, res)');
    expect(route).toContain('discount: discountCheck.value');
    expect(route.indexOf('enforceDiscountCap(')).toBeLessThan(route.indexOf('.replaceOne('));
  });

  it('keeps the generic 403 message for the approval-admins list', () => {
    expect(serverSrc).toContain("getApprovalAdminUser(req, res, forbiddenMessage = 'Only approval admins can manage this list')");
  });

  it('enforces the cap before an approval workflow is created and stores the rounded value', () => {
    const { route } = routeSource(/app\.post\(\s*['"]\/api\/approval-workflows['"]/);
    expect(route).toContain("hasNestedDiscountKey(workflowData, 'discountPercent')");
    expect(route).toContain('enforceDiscountCap(workflowData.discountPercent, res)');
    const normalised = route.indexOf('workflowData.discountPercent = discountCheck.value');
    expect(normalised).toBeGreaterThan(route.indexOf('enforceDiscountCap('));
    expect(normalised).toBeLessThan(route.indexOf('.insertOne('));
  });

  it('enforces the cap on workflow updates only when the discount is being changed', () => {
    const { route } = routeSource(/app\.put\(\s*['"]\/api\/approval-workflows\/:id['"]/);
    expect(route).toMatch(/hasOwnProperty\.call\(updates, 'discountPercent'\)/);
    expect(route.indexOf('enforceDiscountCap(updates.discountPercent, res)')).toBeLessThan(route.indexOf('.updateOne('));
  });

  it('stores the rounded discount on workflow updates and rejects dotted discount keys', () => {
    const { route } = routeSource(/app\.put\(\s*['"]\/api\/approval-workflows\/:id['"]/);
    const nested = route.indexOf("hasNestedDiscountKey(updates, 'discountPercent')");
    expect(nested).toBeGreaterThan(-1);
    expect(nested).toBeLessThan(route.indexOf('.updateOne('));
    expect(route.slice(nested, nested + 250)).toContain("code: 'INVALID_DISCOUNT'");
    const normalised = route.indexOf('updates.discountPercent = discountCheck.value');
    expect(normalised).toBeGreaterThan(route.indexOf('enforceDiscountCap('));
    expect(normalised).toBeLessThan(route.indexOf('.updateOne('));
  });

  it('no longer sends the High Discount Alert in approval emails', () => {
    expect(serverSrc).not.toContain('High Discount Alert');
    expect(serverSrc).not.toContain('highDiscountNote');
  });
});
