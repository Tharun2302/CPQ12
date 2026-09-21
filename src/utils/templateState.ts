// State rules for the template list. Kept out of TemplateManager.tsx so they can be unit
// tested without pulling in that component's pdfjs/docx import chain, which does not load
// under jsdom.

/**
 * True when pushing `next` into template state would change nothing but the array's identity.
 *
 * TemplateManager writes into App.tsx's `templates` state, and that same array is the
 * dependency of the effect that loads templates. Handing it a brand new [] therefore re-runs
 * the effect, which refetches, gets nothing, and sets [] again — an unbounded request loop.
 * It stays invisible while any template exists, because the effect short-circuits on a
 * non-empty list, and only appears once every template is archived or deleted.
 */
export function templatesUpdateIsNoop<T>(current: T[], next: T[]): boolean {
  return (current?.length ?? 0) === 0 && (next?.length ?? 0) === 0;
}
