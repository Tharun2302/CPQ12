import { ConfigurationData } from '../types/pricing';

// ConfigurationForm owns this key; reading the same one means the two cannot diverge.
export const CONFIG_SESSION_KEY = 'cpq_configuration_session';

type StorageLike = Pick<Storage, 'getItem'>;

// The Quote page never mounts ConfigurationForm, and Dashboard's restoreSessionState
// deliberately skips the configuration, so without this a refresh on /quote left it
// undefined — which silently disabled agreement generation, because template selection
// keys off configuration.servicePlan / migrationType.
export function readStoredConfiguration(storage?: StorageLike): ConfigurationData | undefined {
  try {
    const store = storage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
    const raw = store?.getItem(CONFIG_SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    // Guard against arrays and primitives left behind by an older format.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as ConfigurationData;
  } catch {
    return undefined;
  }
}
