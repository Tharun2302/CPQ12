import { BACKEND_URL } from '../config/api';
import { getAuthHeaders } from './authUtils';
import { withApprovalPortalQuery } from './approvalPortalParams';

function documentFileUrl(documentId: string, inline: boolean): string {
  const id = String(documentId || '').trim();
  const url = `${BACKEND_URL}/api/documents/${encodeURIComponent(id)}/file${inline ? '?inline=1' : ''}`;
  // On a page opened from an emailed approval link the link parameters are the proof of access.
  return withApprovalPortalQuery(url);
}

/** Binary PDF stream for iframe / download — avoids huge data: URLs that break mobile PDF viewers. */
export function getDocumentFileInlineUrl(documentId: string): string {
  return documentFileUrl(documentId, true);
}

/**
 * Object URL for a stored document fetched with the login (or the page's approval link), for
 * <iframe src> and downloads, which cannot send the Bearer token. Caller revokes it.
 */
export async function fetchDocumentFileObjectUrl(documentId: string, inline = true): Promise<string> {
  const res = await fetch(documentFileUrl(documentId, inline), { headers: getAuthHeaders() });
  if (!res.ok) {
    let message = `Could not load the document (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.message || data?.error) message = data.message || data.error;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  return URL.createObjectURL(await res.blob());
}

/** Download a stored document where a plain link would not carry the login. */
export async function downloadDocumentFile(documentId: string, fileName: string, inline = true): Promise<void> {
  const objectUrl = await fetchDocumentFileObjectUrl(documentId, inline);
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

type PreviewJson = { success?: boolean; documentId?: string; dataUrl?: string };

/**
 * Map /api/documents/:id/preview JSON to a URL usable by PDF viewers.
 * Prefers the base64 dataUrl returned by the preview endpoint so that documents
 * under an active approval workflow (which 403 on /file) can still be previewed
 * in the approval portal. Falls back to /file?inline=1 when dataUrl is absent.
 */
export function iframeSrcFromDocumentPreview(result: PreviewJson | null | undefined, workflowDocumentId: string): string | null {
  if (!result?.success) return null;
  if (result.dataUrl) return result.dataUrl;
  const resolved = String(result.documentId || workflowDocumentId || '').trim();
  if (resolved) return getDocumentFileInlineUrl(resolved);
  return null;
}
