/**
 * Which control a placed e-sign field renders as. A field that already carries a value — typed by
 * the creator in Place Fields, or entered by a reviewer ahead of this recipient — is static copy for
 * everyone downstream: the backend sends that value as `prefill` (see esignEffectivePrefillForField
 * in server.cjs), and re-opening it as an input would let a signer overwrite the reviewer's entry.
 */
export type EsignFieldRenderMode = 'signature' | 'static' | 'textarea' | 'input';

export type EsignRenderableField = {
  type?: string | null;
  prefill?: string | null;
};

/** Non-empty prefill = the value is already decided upstream, so the field is read-only here. */
export function isEsignFieldValuePrefilled(f: EsignRenderableField | null | undefined): boolean {
  const p = f?.prefill;
  return typeof p === 'string' && p.trim().length > 0;
}

export function esignFieldRenderMode(f: EsignRenderableField | null | undefined): EsignFieldRenderMode {
  const type = String(f?.type ?? 'signature').toLowerCase();
  if (type === 'signature') return 'signature';
  // Checked before the type split so name/title/date lock too, not just text.
  if (isEsignFieldValuePrefilled(f)) return 'static';
  return type === 'text' ? 'textarea' : 'input';
}
