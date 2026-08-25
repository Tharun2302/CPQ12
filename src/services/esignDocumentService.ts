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
