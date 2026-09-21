/**
 * Display value for a controlled number input.
 *
 * A stored 0 must render as an EMPTY field, not "0". A zero sitting in the box is what the
 * next keystroke appends to, so typing 78 produces "078". `??` is the wrong operator here for
 * exactly that reason: it treats 0 as a value worth showing.
 *
 * `fallback` still applies only when `primary` is absent (null/undefined), never when it is 0 —
 * a field the user deliberately cleared must not resurrect an older value from somewhere else.
 */
export function numberInputValue(
  primary: number | null | undefined,
  fallback?: number | null | undefined,
): number | '' {
  const chosen = primary ?? fallback;
  const n = Number(chosen);
  return Number.isFinite(n) && n !== 0 ? n : '';
}
