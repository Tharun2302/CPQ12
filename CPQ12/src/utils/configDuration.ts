import type { ConfigurationData } from '../types/pricing';

/**
 * Returns the effective duration (in months) to use for quoting/templating.
 *
 * For Multi combination, duration can live in nested configs (either the legacy single
 * `messagingConfig/contentConfig` OR the newer `messagingConfigs/contentConfigs` arrays),
 * and sometimes in top-level `duration`.
 *
 * For Multi combination, we use the OVERALL duration for the agreement (MAX duration across
 * all selected exhibit configs: Messaging + Content + Email). This matches how the agreement
 * should read (one "validity" value for the whole contract), and avoids inflated "sum of months"
 * when multiple migrations run in parallel.
 *
 * Falls back to top-level duration if nested durations are missing.
 */
export function getEffectiveDurationMonths(configuration?: ConfigurationData | null): number {
  if (!configuration) return 0;

  const top = Number(configuration.duration || 0);
  if (configuration.migrationType !== 'Multi combination') return top;

  const max = (nums: number[]) =>
    nums.reduce((acc, n) => {
      const v = Number(n);
      return Number.isFinite(v) && v > acc ? v : acc;
    }, 0);

  // Newer shape (arrays): overall = max across every per-combination config
  const msgArrayMax = max((configuration.messagingConfigs || []).map((c) => Number(c?.duration || 0)));
  const contentArrayMax = max((configuration.contentConfigs || []).map((c) => Number(c?.duration || 0)));
  const emailArrayMax = max((configuration.emailConfigs || []).map((c) => Number(c?.duration || 0)));

  const arrayOverall = Math.max(msgArrayMax, contentArrayMax, emailArrayMax);

  // Legacy single-config fallback
  const legacyOverall = Math.max(
    Number(configuration.messagingConfig?.duration || 0),
    Number(configuration.contentConfig?.duration || 0),
    Number((configuration as any).emailConfig?.duration || 0)
  );

  // For Multi combination:
  // If nested configs exist, use their overall max; otherwise use top-level duration.
  if (arrayOverall > 0) return arrayOverall;
  if (legacyOverall > 0) return legacyOverall;
  return top;
}

export function formatMonths(durationMonths: number): string {
  const d = Number(durationMonths || 0);
  return `${d} Month${d === 1 ? '' : 's'}`;
}


