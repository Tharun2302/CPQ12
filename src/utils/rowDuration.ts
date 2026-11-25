import type { ConfigurationData } from '../types/pricing';
import { SERVICE_TERM_MAX_MONTHS } from './serviceTerm';

export type MultiRowKey = 'messagingConfigs' | 'contentConfigs' | 'emailConfigs';

const MULTI_ROW_KEYS: MultiRowKey[] = ['messagingConfigs', 'contentConfigs', 'emailConfigs'];

// The longest row feeds the Overage price and the end date, so it is held to the service-term range.
export function parseRowDurationMonths(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, SERVICE_TERM_MAX_MONTHS);
}

export function longestRowDuration(config: ConfigurationData): number {
  return MULTI_ROW_KEYS.reduce((longest, key) => {
    const rows = (config[key] || []) as Array<{ duration?: number }>;
    return rows.reduce((acc, row) => Math.max(acc, Number(row?.duration) || 0), longest);
  }, 0);
}

// Top-level duration follows the rows, so clearing every row also clears what Sprawl and Overage use.
export function withRowDuration(config: ConfigurationData, key: MultiRowKey, index: number, months: number): ConfigurationData {
  const rows = (config[key] || []) as Array<{ duration: number }>;
  const next = {
    ...config,
    [key]: rows.map((row, i) => (i === index ? { ...row, duration: months } : row)),
  } as ConfigurationData;
  return { ...next, duration: longestRowDuration(next) };
}
