/**
 * Normalize and de-duplicate an array of IDs (or mixed values) into a unique string array.
 * Useful to prevent duplicated exhibit IDs from UI interactions (folder select, repeated toggles, etc).
 */
export function dedupeStringIds(ids: unknown[]): string[] {
  return Array.from(new Set((ids || []).map((id) => (id ?? '').toString()).filter(Boolean)));
}


