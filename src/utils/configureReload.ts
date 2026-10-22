// Refreshing the Configure page starts the quote over, while moving between pages (and refreshing
// the Quote page, which needs the saved configuration to generate the agreement) keeps everything.

// Everything the Configure page restores: the configuration, ticked exhibits, per-combination
// plans and the discount. Contact details and the deal (cpq_configure_contact_info) are kept.
export const CONFIGURE_SESSION_KEYS = [
  'cpq_configuration_session',
  'cpq_selected_exhibits',
  'cpq_selected_tiers_per_combination',
  'cpq_pricing_plan_per_combination',
  'cpq_combination_tiers',
  'cpq_discount_session',
] as const;

// Parts of the navigation snapshot that would restore the cleared selection; contact info stays.
const NAV_SELECTION_FIELDS = ['configuration', 'selectedExhibits', 'calculations', 'selectedTier', 'showPricing'] as const;

type ReloadWindow = Pick<Window, 'location' | 'sessionStorage' | 'localStorage'> & {
  performance?: Pick<Performance, 'getEntriesByType'>;
};

export function isPageReload(win: ReloadWindow): boolean {
  try {
    const entry = win.performance?.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    return entry?.type === 'reload';
  } catch {
    return false;
  }
}

const isConfigurePath = (pathname: string) => /\/configure\/?$/i.test(pathname || '');

// Runs once at startup, before anything reads the session. Returns true when it cleared.
export function clearConfigureSessionOnReload(win: ReloadWindow = window): boolean {
  if (!isConfigurePath(win.location?.pathname) || !isPageReload(win)) return false;
  try {
    CONFIGURE_SESSION_KEYS.forEach((key) => win.sessionStorage.removeItem(key));
    win.localStorage.removeItem('cpq_discount');
    const raw = win.sessionStorage.getItem('cpq_navigation_state');
    if (raw) {
      const nav = JSON.parse(raw);
      if (nav && typeof nav === 'object') {
        delete nav.migrationType;
        delete nav.combination;
        if (nav.sessionState && typeof nav.sessionState === 'object') {
          NAV_SELECTION_FIELDS.forEach((field) => delete nav.sessionState[field]);
        }
        win.sessionStorage.setItem('cpq_navigation_state', JSON.stringify(nav));
      }
    }
  } catch {
    // Storage blocked or a malformed snapshot: drop the snapshot rather than restore a stale quote.
    try { win.sessionStorage.removeItem('cpq_navigation_state'); } catch { /* storage unavailable */ }
  }
  return true;
}
