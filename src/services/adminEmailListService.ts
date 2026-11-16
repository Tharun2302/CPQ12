import { BACKEND_URL } from '../config/api';
import { authAwareError, getAuthHeaders } from '../utils/authUtils';

export type AdminEmailListKind = 'redline-admins' | 'document-admins';

export interface AdminEmailList {
  emails: string[];
  envEmails: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminEmailListResult {
  success: boolean;
  data?: AdminEmailList;
  message?: string;
  error?: string;
  code?: string;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toList(data: unknown): AdminEmailList {
  const raw = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    emails: toStringArray(raw.emails),
    envEmails: toStringArray(raw.envEmails),
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

async function request(url: string, init: RequestInit, fallbackError: string): Promise<AdminEmailListResult> {
  try {
    const response = await fetch(url, {
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
    return {
      success: true,
      data: toList(body.data),
      message: typeof body.message === 'string' ? body.message : undefined,
    };
  } catch {
    return { success: false, error: fallbackError };
  }
}

function listUrl(kind: AdminEmailListKind): string {
  return `${BACKEND_URL}/api/settings/${kind}`;
}

export function listAdminEmails(kind: AdminEmailListKind): Promise<AdminEmailListResult> {
  return request(listUrl(kind), { method: 'GET' }, 'Failed to load the list');
}

export function addAdminEmail(kind: AdminEmailListKind, email: string): Promise<AdminEmailListResult> {
  return request(listUrl(kind), { method: 'POST', body: JSON.stringify({ email }) }, 'Failed to add the email');
}

export function removeAdminEmail(kind: AdminEmailListKind, email: string): Promise<AdminEmailListResult> {
  return request(
    `${listUrl(kind)}/${encodeURIComponent(email)}`,
    { method: 'DELETE' },
    'Failed to remove the email',
  );
}
