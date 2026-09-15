import { BACKEND_URL } from '../config/api';

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `${fallback} (HTTP ${response.status})`;
    const data = JSON.parse(text);
    return data.error || data.message || fallback;
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

/**
 * Permanently delete an e-sign document and everything hanging off it.
 *
 * The backend authorizes this against the token's identity (creator only), so the Bearer
 * token is required — without it the request is rejected as unauthenticated. Shared by the
 * e-sign documents page and the agreement tracking dashboard so the auth header can never
 * drift between the two.
 *
 * `treat404AsSuccess` is for callers removing a document they believe already exists: if it
 * is already gone, the local state should still be cleared rather than showing an error.
 */
export async function deleteEsignDocument(
  documentId: string,
  options: { treat404AsSuccess?: boolean } = {}
): Promise<void> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cpq_token') : null;

  const response = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.ok) return;
  if (options.treat404AsSuccess && response.status === 404) return;
  throw new Error(await extractErrorMessage(response, 'Failed to delete document'));
}

/** The two ways a prepared CPQ document can be sent out for signature. */
export type EsignProvider = 'cpq' | 'zoho';

export interface ZohoSignStatus {
  enabled: boolean;
  configured: boolean;
}

/**
 * The CPQ house response shape. Both send routes answer with it, so the callers branch on
 * `success` and read the provider-specific extras only on the branch that produces them.
 */
export interface EsignApiResponse {
  success: boolean;
  error?: string;
  message?: string;
  emails_sent?: number;
  emails_sent_to?: string[];
  document?: { id?: string; provider?: string; status?: string; zoho_request_id?: string };
  recipients?: { id?: string; email?: string; zoho_action_id?: string }[];
  [key: string]: unknown;
}

export interface ZohoSendOptions {
  expiration_days?: number;
  is_sequential?: boolean;
  email_reminders?: boolean;
}

const ZOHO_SIGN_DISABLED: ZohoSignStatus = { enabled: false, configured: false };

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cpq_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Is the Zoho Sign provider switched on for this install?
 *
 * Fails closed on purpose: a network error, a 401, a 503 or a body we cannot parse all resolve
 * to "disabled", so the prepare pages fall back to the in-house flow and render exactly as they
 * did before Zoho existed. Never throws, because callers run it from a mount effect.
 */
export async function getZohoSignStatus(): Promise<ZohoSignStatus> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/zoho-sign/status`, {
      headers: authHeaders(),
    });
    if (!response.ok) return ZOHO_SIGN_DISABLED;
    const data = await response.json();
    return {
      enabled: data?.success === true && data?.enabled === true,
      configured: data?.configured === true,
    };
  } catch {
    return ZOHO_SIGN_DISABLED;
  }
}

/**
 * Hand a prepared document to Zoho Sign.
 *
 * Unlike most /api/esign/* routes this one verifies a JWT and checks the caller is the document
 * creator, so the Bearer token is mandatory. Recipients and fields are read server-side, which
 * is why nothing about them appears in the body.
 */
export async function sendWithZohoSign(
  documentId: string,
  options: ZohoSendOptions = {}
): Promise<EsignApiResponse> {
  const response = await fetch(`${BACKEND_URL}/api/zoho-sign/documents/${documentId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(options),
  });
  return response.json();
}

/** Pull-through status refresh for a document already at Zoho. */
export async function refreshZohoDocument(documentId: string, options: { force?: boolean } = {}): Promise<EsignApiResponse> {
  const query = options.force ? '?force=1' : '';
  const response = await fetch(`${BACKEND_URL}/api/zoho-sign/documents/${documentId}${query}`, {
    headers: authHeaders(),
  });
  return response.json();
}

/**
 * The one place the provider choice turns into a request.
 *
 * The CPQ branch is deliberately byte-identical to the call the prepare pages made before the
 * picker existed — same URL, same empty body, no Authorization header — so an install with Zoho
 * off behaves exactly as it always has.
 */
export async function sendDocumentForSignature(
  documentId: string,
  provider: EsignProvider,
  zohoOptions: ZohoSendOptions = {}
): Promise<EsignApiResponse> {
  if (provider === 'zoho') return sendWithZohoSign(documentId, zohoOptions);

  const response = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/send-for-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return response.json();
}
