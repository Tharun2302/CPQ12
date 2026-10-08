import { BACKEND_URL } from '../config/api';
import { authAwareError, getAuthHeaders } from '../utils/authUtils';
import { clampMaxDiscount } from '../utils/discount';

export interface DiscountPolicy {
  maxDiscountPercent: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DiscountPolicyResult {
  success: boolean;
  data?: DiscountPolicy;
  error?: string;
  code?: string;
}

export const DISCOUNT_POLICY_ERROR_CODES = ['DISCOUNT_EXCEEDS_MAX', 'INVALID_DISCOUNT'];

const POLICY_URL = `${BACKEND_URL}/api/settings/discount-policy`;

function toPolicy(data: unknown): DiscountPolicy {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    maxDiscountPercent: clampMaxDiscount(raw.maxDiscountPercent),
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : null,
  };
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

async function request(init: RequestInit, fallbackError: string): Promise<DiscountPolicyResult> {
  try {
    const response = await fetch(POLICY_URL, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init.headers || {}) },
    });
    const body = await readBody(response);
    if (!response.ok || body.success === false) {
      const serverError = typeof body.error === 'string' ? body.error : undefined;
      return {
        success: false,
        error: authAwareError(response.status, serverError, fallbackError),
        code: typeof body.code === 'string' ? body.code : undefined,
      };
    }
    return { success: true, data: toPolicy(body.data) };
  } catch {
    return { success: false, error: fallbackError };
  }
}

export function getDiscountPolicy(): Promise<DiscountPolicyResult> {
  return request({ method: 'GET' }, 'Failed to load discount policy');
}

export function updateDiscountPolicy(maxDiscountPercent: number): Promise<DiscountPolicyResult> {
  return request(
    { method: 'PUT', body: JSON.stringify({ maxDiscountPercent }) },
    'Failed to update discount policy',
  );
}

// The server's message already names the current cap, which is more useful than a generic failure
export function discountPolicyErrorMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const code = (err as Error & { code?: unknown }).code;
  return typeof code === 'string' && DISCOUNT_POLICY_ERROR_CODES.includes(code) ? err.message : null;
}
