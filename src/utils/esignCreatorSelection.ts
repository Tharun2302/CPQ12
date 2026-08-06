/** One creator across a set of agreements, with every agreement id they created. */
export interface CreatorEntry {
  email: string;
  name: string;
  ids: string[];
}

/** The slice of an agreement the creator index needs — keeps this util free of the page's types. */
export interface CreatorSourceAgreement {
  id: string;
  creator_email?: string | null;
  creator_name?: string | null;
  uploaded_by?: string | null;
}

/**
 * Index the creators of the given agreements, keyed by lowercased email so the same person
 * collapses to one entry. Recipients are deliberately excluded — bulk download is organized by
 * who raised the agreement. Sorted by agreement count so the busiest creators surface first.
 */
export function buildCreatorIndex(agreements: CreatorSourceAgreement[]): CreatorEntry[] {
  const byEmail = new Map<string, CreatorEntry>();

  agreements.forEach((ag) => {
    const key = (ag.creator_email || ag.uploaded_by || '').trim().toLowerCase();
    if (!key) return;
    let entry = byEmail.get(key);
    if (!entry) {
      entry = { email: key, name: '', ids: [] };
      byEmail.set(key, entry);
    }
    const name = ag.creator_name;
    if (!entry.name && name && name.trim()) entry.name = name.trim();
    if (!entry.ids.includes(ag.id)) entry.ids.push(ag.id);
  });

  return [...byEmail.values()].sort(
    (a, b) => b.ids.length - a.ids.length || (a.name || a.email).localeCompare(b.name || b.email)
  );
}

/** Case-insensitive match on name or email; an empty query matches everyone. */
export function filterCreators(creators: CreatorEntry[], query: string): CreatorEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return creators;
  return creators.filter((c) => c.email.includes(q) || c.name.toLowerCase().includes(q));
}

/**
 * How a creator's checkbox should render. 'some' drives the indeterminate state — it means their
 * agreements are only partly selected, so clicking should complete rather than clear them.
 */
export function creatorSelectionState(c: CreatorEntry, selectedIds: Set<string>): 'all' | 'some' | 'none' {
  if (c.ids.length === 0) return 'none';
  const hits = c.ids.filter((id) => selectedIds.has(id)).length;
  if (hits === 0) return 'none';
  return hits === c.ids.length ? 'all' : 'some';
}

/**
 * Selection after clicking a creator: fully-selected clears them, anything else (including a
 * partial selection) selects all of their agreements. Returns a new Set; the input is untouched.
 */
export function toggleCreatorSelection(c: CreatorEntry, selectedIds: Set<string>): Set<string> {
  const next = new Set(selectedIds);
  if (creatorSelectionState(c, selectedIds) === 'all') c.ids.forEach((id) => next.delete(id));
  else c.ids.forEach((id) => next.add(id));
  return next;
}
