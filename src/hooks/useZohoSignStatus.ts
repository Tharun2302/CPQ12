import { useEffect, useState } from 'react';
import { getZohoSignStatus } from '../services/esignDocumentService';

// One confirmed "on" answer is remembered for the rest of the browser session. Only the enabled
// answer is cached: a disabled, failed or rate-limited call leaves the cache empty so a later
// mount asks again, and until it does the user sees exactly the in-house-only page they would
// have seen anyway. Behind a proxy that hides the client IP the status limiter is shared by
// everyone, so keeping the enabled case to one call per session matters.
let cachedEnabled = false;

/** Test-only: module state would otherwise leak an enabled answer into the next test. */
export function resetZohoSignStatusCache(): void {
  cachedEnabled = false;
}

/**
 * Whether the Zoho Sign provider may be offered on this install.
 *
 * Starts false and only ever turns true on an explicit `enabled: true` from the backend, so a
 * slow, failing or absent endpoint leaves the page rendering its in-house-only layout rather
 * than flashing a picker and taking it away again.
 */
export function useZohoSignStatus(): { zohoEnabled: boolean } {
  const [zohoEnabled, setZohoEnabled] = useState(cachedEnabled);

  useEffect(() => {
    if (cachedEnabled) return;
    let active = true;
    getZohoSignStatus().then((status) => {
      if (status.enabled) cachedEnabled = true;
      if (active) setZohoEnabled(status.enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  return { zohoEnabled };
}

export default useZohoSignStatus;
