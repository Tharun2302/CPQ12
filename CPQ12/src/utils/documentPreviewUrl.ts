import { BACKEND_URL } from '../config/api';

/** Binary PDF stream for iframe / download — avoids huge data: URLs that break mobile PDF viewers. */
export function getDocumentFileInlineUrl(documentId: string): string {
  const id = String(documentId || '').trim();
  return `${BACKEND_URL}/api/documents/${encodeURIComponent(id)}/file?inline=1`;
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
