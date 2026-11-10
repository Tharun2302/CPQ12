import { getAuthHeaders } from './authUtils';

/**
 * Credentials for the e-sign API.
 *
 * The backend accepts three kinds of caller on the e-sign read routes (document, file,
 * fields, recipients) and checks them in this order:
 *   1. signed-in staff        → Authorization: Bearer <cpq_token>
 *   2. a recipient's link     → ?signing_token=<token>   (signer / reviewer pages)
 *   3. an approval-portal link → ?approval_token=<token> (Team Lead / Technical / Legal portals)
 * Staff-only routes accept only (1).
 *
 * Tokens go in the query string, not a header, because PDFs are loaded through <iframe src>,
 * <a href> and window.open, none of which can send headers — and because the signer and portal
 * pages already carry the same token in their own address bar.
 */
export interface EsignAccess {
  /** The recipient's signing token, when the page was opened from a signing link. */
  signingToken?: string | null;
}

/** The approval-portal token, when this page is an approval portal opened from an email link. */
export function getApprovalPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (!window.location.pathname.startsWith('/approval/')) return null;
  return new URLSearchParams(window.location.search).get('token') || null;
}

/** `url` with whichever link token this page holds appended as a query parameter. */
export function withEsignAccess(url: string, access: EsignAccess = {}): string {
  const params: string[] = [];
  if (access.signingToken) params.push(`signing_token=${encodeURIComponent(access.signingToken)}`);
  const portalToken = getApprovalPortalToken();
  if (portalToken) params.push(`approval_token=${encodeURIComponent(portalToken)}`);
  if (!params.length) return url;
  const hashAt = url.indexOf('#');
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const hash = hashAt >= 0 ? url.slice(hashAt) : '';
  return `${base}${base.includes('?') ? '&' : '?'}${params.join('&')}${hash}`;
}

/** fetch() for the e-sign API: adds the staff Bearer token and any link token this page holds. */
export function esignFetch(url: string, init: RequestInit = {}, access: EsignAccess = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(getAuthHeaders())) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return fetch(withEsignAccess(url, access), { ...init, headers });
}

/**
 * Object URL for an e-sign PDF fetched with staff credentials, for <iframe>/viewer src and
 * downloads on staff pages (an <a href> cannot send the Bearer token). Caller revokes it.
 */
export async function fetchEsignFileObjectUrl(url: string, access: EsignAccess = {}): Promise<string> {
  const res = await esignFetch(url, {}, access);
  if (!res.ok) {
    let message = `Could not load the document (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  return URL.createObjectURL(await res.blob());
}

/** Download an e-sign PDF on a staff page, where a plain link would not carry the login. */
export async function downloadEsignFile(url: string, fileName: string, access: EsignAccess = {}): Promise<void> {
  const objectUrl = await fetchEsignFileObjectUrl(url, access);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
