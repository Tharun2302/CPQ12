// Hotjar tag loader.
//
// The Site ID comes from VITE_HOTJAR_ID and is never hardcoded. Vite substitutes that value
// at BUILD time, so the committed blank default means local dev requests no script at all and
// never records into the same Hotjar site as real users. Turning recording off on an already
// deployed bundle therefore needs a rebuild (or the Hotjar dashboard), not just an env change.
//
// Usage:
//   initHotjar()                  // app entry, module scope
//   identifyHotjarUser(user)      // as soon as the app knows who the user is

const SCRIPT_ID = 'hotjar-tag';
const SNIPPET_VERSION = 6;
const NUMERIC_SITE_ID = /^\d+$/;

type HotjarQueue = {
  (...args: unknown[]): void;
  q?: unknown[][];
};

declare global {
  interface Window {
    hj?: HotjarQueue;
    _hjSettings?: { hjid: number; hjsv: number };
  }
}

export interface HotjarUser {
  email?: string | null;
  role?: string | null;
}

function configuredSiteId(): string | undefined {
  return import.meta.env?.VITE_HOTJAR_ID;
}

/**
 * Load the Hotjar tag. Safe to call repeatedly.
 * @returns true when the tag is present (loaded now or already loaded), false when it was not loaded.
 */
export function initHotjar(siteId: string | number | undefined = configuredSiteId()): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const raw = String(siteId ?? '').trim();
  if (!raw) return false; // Not configured: request nothing, define nothing.

  // A typo must not look identical to Hotjar being off, so warn instead of fetching hotjar-NaN.js
  if (!NUMERIC_SITE_ID.test(raw)) {
    console.warn(
      `⚠️ Hotjar: VITE_HOTJAR_ID must be digits only, got ${JSON.stringify(raw)}. Tag not loaded.`
    );
    return false;
  }

  // StrictMode and HMR both re-run app entry. Two snippets means two recordings per page view,
  // which inflates the very counts this exists to measure.
  if (document.getElementById(SCRIPT_ID)) return true;

  const hjid = Number(raw);

  if (typeof window.hj !== 'function') {
    // Queues calls made before the tag script finishes loading, as Hotjar's own snippet does.
    const hj: HotjarQueue = (...args: unknown[]) => {
      (hj.q = hj.q || []).push(args);
    };
    window.hj = hj;
  }
  window._hjSettings = { hjid, hjsv: SNIPPET_VERSION };

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://static.hotjar.com/c/hotjar-${hjid}.js?sv=${SNIPPET_VERSION}`;
  script.onerror = () => console.warn('⚠️ Hotjar: tag script failed to load.');
  (document.head || document.documentElement).appendChild(script);

  return true;
}

/**
 * Attach the signed-in identity to the current Hotjar session.
 * @returns true when the identity was sent, false when Hotjar is not loaded or there is no email.
 */
export function identifyHotjarUser(user?: HotjarUser | null): boolean {
  if (typeof window === 'undefined' || typeof window.hj !== 'function') return false;

  // Lowercased so one person is one Hotjar user, not two, when casing differs between sign-ins.
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;

  try {
    window.hj('identify', email, { email, role: user?.role || 'unknown' });
    return true;
  } catch (error) {
    console.warn('⚠️ Hotjar: identify failed.', error);
    return false;
  }
}
