export const DISCOUNT_POLICY_STORAGE_KEY = 'cpq_discount_policy';
export const DISCOUNT_UPDATED_EVENT = 'discountUpdated';

interface StoredDiscount {
  storage: () => Storage;
  key: string;
}

// In-progress (not yet saved) discounts only; saved quotes and workflows are never rewritten
const IN_PROGRESS_DISCOUNTS: StoredDiscount[] = [
  { storage: () => sessionStorage, key: 'cpq_discount_session' },
  { storage: () => localStorage, key: 'cpq_discount' },
  { storage: () => localStorage, key: 'cpq_quote_custom_line_items_discount' },
];

function clampOne({ storage, key }: StoredDiscount, max: number): boolean {
  try {
    const store = storage();
    const raw = store.getItem(key);
    if (raw === null || raw.trim() === '') return false;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= max) return false;
    store.setItem(key, String(max));
    return true;
  } catch {
    return false;
  }
}

// Returns true when any stored discount was lowered, so callers can tell the user
export function clampInProgressDiscounts(max: number): boolean {
  const changed = IN_PROGRESS_DISCOUNTS.map((entry) => clampOne(entry, max)).some(Boolean);
  if (changed) window.dispatchEvent(new CustomEvent(DISCOUNT_UPDATED_EVENT));
  return changed;
}

export function readCachedMaxDiscount(): number | null {
  try {
    const raw = localStorage.getItem(DISCOUNT_POLICY_STORAGE_KEY);
    if (raw === null || raw.trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  } catch {
    return null;
  }
}

export function writeCachedMaxDiscount(max: number): void {
  try {
    localStorage.setItem(DISCOUNT_POLICY_STORAGE_KEY, String(max));
  } catch {
    // Blocked storage (private mode) only loses the offline fallback; the live value still applies
  }
}
