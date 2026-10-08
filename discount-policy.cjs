'use strict';

// Kept out of server.cjs so the cap rules and cache behaviour are testable without a database.

const DEFAULT_MAX_DISCOUNT_PERCENT = 15;
const ABSOLUTE_MAX_DISCOUNT_PERCENT = 100;
const DISCOUNT_POLICY_SETTINGS_ID = 'discount_policy';
const MAX_DISCOUNT_CACHE_TTL_MS = 30 * 1000;
const INVALID_MAX_DISCOUNT_ERROR = 'maxDiscountPercent must be a number between 0 and 100';

// Absorbs float noise such as 0.29 * 100 = 28.999999999999996 without accepting 12.345.
const DECIMAL_TOLERANCE = 1e-6;

// Strings are accepted for discounts only because older clients send "10" from form inputs.
const NUMERIC_STRING = /^-?(\d+(\.\d*)?|\.\d+)$/;

function hasAtMostTwoDecimals(n) {
  const scaled = n * 100;
  return Math.abs(scaled - Math.round(scaled)) < DECIMAL_TOLERANCE;
}

/**
 * Validates an admin-supplied cap. Only real numbers are accepted so "15" or true
 * cannot slip into the settings document.
 * @param {unknown} value
 * @returns {{ ok: boolean, value?: number, error?: string }}
 */
function validateMaxDiscountPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, error: INVALID_MAX_DISCOUNT_ERROR };
  }
  if (value < 0 || value > ABSOLUTE_MAX_DISCOUNT_PERCENT || !hasAtMostTwoDecimals(value)) {
    return { ok: false, error: INVALID_MAX_DISCOUNT_ERROR };
  }
  return { ok: true, value };
}

function resolveMax(max) {
  const check = validateMaxDiscountPercent(max);
  return check.ok ? check.value : DEFAULT_MAX_DISCOUNT_PERCENT;
}

function parseDiscount(discount) {
  if (discount === undefined || discount === null || discount === '') return 0;
  if (typeof discount === 'number') return Number.isFinite(discount) ? discount : NaN;
  if (typeof discount === 'string') {
    const trimmed = discount.trim();
    if (trimmed === '') return 0;
    return NUMERIC_STRING.test(trimmed) ? Number(trimmed) : NaN;
  }
  return NaN;
}

/**
 * Checks a quote/workflow discount against the current cap.
 * Missing values mean "no discount"; numeric strings are parsed.
 * @param {unknown} discount
 * @param {number} max
 * @returns {{ ok: boolean, value?: number, error?: string, code?: string, maxDiscountPercent: number }}
 */
function checkDiscountWithinMax(discount, max) {
  const maxDiscountPercent = resolveMax(max);
  const value = parseDiscount(discount);
  if (Number.isNaN(value)) {
    return { ok: false, code: 'INVALID_DISCOUNT', error: 'Discount must be a number', maxDiscountPercent };
  }
  if (value < 0) {
    return { ok: false, code: 'INVALID_DISCOUNT', error: 'Discount cannot be negative', maxDiscountPercent };
  }
  if (value > maxDiscountPercent + DECIMAL_TOLERANCE) {
    return {
      ok: false,
      code: 'DISCOUNT_EXCEEDS_MAX',
      error: `Discount exceeds the maximum allowed (${maxDiscountPercent}%)`,
      maxDiscountPercent,
    };
  }
  return { ok: true, value, maxDiscountPercent };
}

/** 400 body for a failed checkDiscountWithinMax result. */
function discountRejectionBody(check) {
  return {
    success: false,
    error: check.error,
    code: check.code,
    maxDiscountPercent: check.maxDiscountPercent,
  };
}

/** Shapes the stored settings doc for the API, falling back to the default when absent or corrupt. */
function toDiscountPolicyResponse(doc) {
  const stored = doc ? validateMaxDiscountPercent(doc.maxDiscountPercent) : { ok: false };
  return {
    maxDiscountPercent: stored.ok ? stored.value : DEFAULT_MAX_DISCOUNT_PERCENT,
    updatedAt: (doc && doc.updatedAt) || null,
    updatedBy: (doc && doc.updatedBy) || null,
  };
}

/**
 * In-process cache around the settings lookup so every quote save does not hit Mongo.
 * A DB error is not cached, so the real cap comes back as soon as the database does.
 * @param {{ loadDoc: () => Promise<object|null>, ttlMs?: number, now?: () => number }} options
 */
function createMaxDiscountReader({ loadDoc, ttlMs = MAX_DISCOUNT_CACHE_TTL_MS, now = Date.now }) {
  let cached = null;

  async function get() {
    if (cached && now() - cached.at < ttlMs) return cached.value;
    try {
      const doc = await loadDoc();
      const value = toDiscountPolicyResponse(doc).maxDiscountPercent;
      cached = { value, at: now() };
      return value;
    } catch (e) {
      return DEFAULT_MAX_DISCOUNT_PERCENT;
    }
  }

  function invalidate() {
    cached = null;
  }

  return { get, invalidate };
}

module.exports = {
  DEFAULT_MAX_DISCOUNT_PERCENT,
  ABSOLUTE_MAX_DISCOUNT_PERCENT,
  DISCOUNT_POLICY_SETTINGS_ID,
  MAX_DISCOUNT_CACHE_TTL_MS,
  INVALID_MAX_DISCOUNT_ERROR,
  validateMaxDiscountPercent,
  checkDiscountWithinMax,
  discountRejectionBody,
  toDiscountPolicyResponse,
  createMaxDiscountReader,
};
