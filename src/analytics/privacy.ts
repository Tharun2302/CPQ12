// Single shared mechanism for withholding third-party data from Hotjar recordings.
//
// `data-hj-suppress` is inherited by every descendant, so spread this onto the CONTAINER that
// wraps someone else's data (table body, card, preview host) rather than onto each field. A new
// column or line added inside an already-suppressed container is then covered automatically.
//
// Heatmaps, clicks and scroll depth still work inside a suppressed region; only the text and
// attribute content is replaced with placeholders in the recording.
//
// Usage:
//   <tbody {...SUPPRESS_PII}>...</tbody>
export const SUPPRESS_PII = { 'data-hj-suppress': '' } as const;
