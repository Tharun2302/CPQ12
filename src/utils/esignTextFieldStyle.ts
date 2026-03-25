export type EsignTextFontId = 'helvetica' | 'times' | 'courier';

export const ESIGN_DEFAULT_TEXT_COLOR = '#dc2626';

export const ESIGN_TEXT_FONT_OPTIONS: { id: EsignTextFontId; label: string; cssStack: string }[] = [
  { id: 'helvetica', label: 'Sans (Helvetica)', cssStack: 'Helvetica, Arial, ui-sans-serif, sans-serif' },
  { id: 'times', label: 'Serif (Times)', cssStack: '"Times New Roman", Times, ui-serif, serif' },
  { id: 'courier', label: 'Monospace (Courier)', cssStack: '"Courier New", Courier, ui-monospace, monospace' },
];

export function normalizeEsignTextColor(input: string | undefined | null): string {
  const s = String(input ?? '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s : ESIGN_DEFAULT_TEXT_COLOR;
}

export function normalizeEsignTextFont(input: string | undefined | null): EsignTextFontId {
  const s = String(input ?? 'helvetica').toLowerCase();
  if (s === 'times' || s === 'courier') return s;
  return 'helvetica';
}

export function cssStackForEsignTextFont(id: string | undefined | null): string {
  const key = normalizeEsignTextFont(id);
  return ESIGN_TEXT_FONT_OPTIONS.find((o) => o.id === key)?.cssStack ?? ESIGN_TEXT_FONT_OPTIONS[0].cssStack;
}
