import { BACKEND_URL } from '../config/api';

/** Binary PDF stream for iframe / download — avoids huge data: URLs that break mobile PDF viewers. */
export function getDocumentFileInlineUrl(documentId: string): string {
  const id = String(documentId || '').trim();
  return `${BACKEND_URL}/api/documents/${encodeURIComponent(id)}/file?inline=1`;
}

type PreviewJson = { success?: boolean; documentId?: string; dataUrl?: string };

/**
 * Map /api/documents/:id/preview JSON to an iframe-safe URL.
 * Prefer /file?inline=1 using resolved documentId from the server.
 */
export function iframeSrcFromDocumentPreview(result: PreviewJson | null | undefined, workflowDocumentId: string): string | null {
  if (!result?.success) return null;
  const resolved = String(result.documentId || workflowDocumentId || '').trim();
  if (resolved) return getDocumentFileInlineUrl(resolved);
  if (result.dataUrl) return result.dataUrl;
  return null;
}
