/**
 * Timeline Projection – logic for content, messaging, and email migration timelines.
 * Separate file for timeline projection calculations based on server type and size.
 *
 * Business logic (from spec):
 * - Server type daily capacity (GB/day per server): Small = 200, Standard = 300, Large = 500, Extra Large = 700
 * - Small formula: days = Total size to be migrated in GB / 200
 * - No of servers: multipliers for parallel work (1 server = 1, 2 servers = 1.6, 3+ = 1.91)
 * - We count number of days for the migration timeline
 */

export type ServerType = 'Small' | 'Standard' | 'Large' | 'Extra Large';

/** GB per day capacity per server (one server of this type). */
export const SERVER_TYPE_GB_PER_DAY: Record<ServerType, number> = {
  Small: 200,
  Standard: 300,
  Large: 500,
  'Extra Large': 700
};

/** Server count factor: 1 server = 1, 2 servers = 1.6, >= 3 servers = 1.91 (applied to timeline). */
export function getServerCountFactor(numberOfServers: number): number {
  if (numberOfServers <= 0) return 1;
  if (numberOfServers === 1) return 1;
  if (numberOfServers === 2) return 1.6;
  if (numberOfServers >= 3) return 1.91;
  return 1;
}

export interface ContentTimelineInput {
  /** Total size to be migrated in GB */
  totalSizeGB: number;
  serverType: ServerType;
  numberOfServers: number;
}

export interface TimelineResult {
  /** Calculated number of days for the migration */
  days: number;
  /** GB per day capacity used (per server) */
  capacityPerDayPerServer: number;
  /** Effective total capacity per day (capacity * number of servers) */
  effectiveCapacityPerDay: number;
  /** Server count factor applied (1, 1.6, or 1.91) */
  serverCountFactor: number;
}

/**
 * Content migration timeline: compute number of days.
 * Formula: baseDays = totalSizeGB / (capacityPerDayPerServer * numberOfServers)
 *          days = round(baseDays * serverCountFactor)  [round to match reference UI: 1000 GB, 1 server → Small 5, Standard 3, Large 2, Extra Large 1]
 */
export function computeContentTimeline(input: ContentTimelineInput): TimelineResult {
  const { totalSizeGB, serverType, numberOfServers } = input;
  const capacityPerDayPerServer = SERVER_TYPE_GB_PER_DAY[serverType] ?? 200;
  const effectiveCapacityPerDay =
    numberOfServers > 0
      ? capacityPerDayPerServer * numberOfServers
      : capacityPerDayPerServer;
  const factor = getServerCountFactor(numberOfServers);
  const baseDays = effectiveCapacityPerDay > 0 ? totalSizeGB / effectiveCapacityPerDay : 0;
  const days = Math.max(0, Math.round(baseDays * factor));
  return {
    days,
    capacityPerDayPerServer,
    effectiveCapacityPerDay,
    serverCountFactor: factor
  };
}

/** Input for messaging timeline (e.g. total messages or channels). Can reuse server type logic. */
export interface MessagingTimelineInput {
  totalMessages?: number;
  serverType: ServerType;
  numberOfServers: number;
}

/** Input for email timeline (e.g. total mailboxes). Can reuse server type logic. */
export interface EmailTimelineInput {
  totalMailboxes?: number;
  serverType: ServerType;
  numberOfServers: number;
}

/**
 * Messaging migration timeline – placeholder; can map messages to equivalent "size" or use separate rates.
 */
export function computeMessagingTimeline(input: MessagingTimelineInput): TimelineResult {
  const { serverType, numberOfServers } = input;
  const capacityPerDayPerServer = SERVER_TYPE_GB_PER_DAY[serverType] ?? 200;
  const effectiveCapacityPerDay =
    numberOfServers > 0 ? capacityPerDayPerServer * numberOfServers : capacityPerDayPerServer;
  const factor = getServerCountFactor(numberOfServers);
  const baseDays = input.totalMessages && effectiveCapacityPerDay > 0
    ? input.totalMessages / (effectiveCapacityPerDay * 10) // placeholder: scale messages to days
    : 0;
  const days = Math.max(0, Math.ceil(baseDays * factor));
  return {
    days,
    capacityPerDayPerServer,
    effectiveCapacityPerDay,
    serverCountFactor: factor
  };
}

/**
 * Email migration timeline – placeholder; can map mailboxes to equivalent "size" or use separate rates.
 */
export function computeEmailTimeline(input: EmailTimelineInput): TimelineResult {
  const { serverType, numberOfServers } = input;
  const capacityPerDayPerServer = SERVER_TYPE_GB_PER_DAY[serverType] ?? 200;
  const effectiveCapacityPerDay =
    numberOfServers > 0 ? capacityPerDayPerServer * numberOfServers : capacityPerDayPerServer;
  const factor = getServerCountFactor(numberOfServers);
  const baseDays = input.totalMailboxes && effectiveCapacityPerDay > 0
    ? input.totalMailboxes / (effectiveCapacityPerDay * 5) // placeholder: scale mailboxes to days
    : 0;
  const days = Math.max(0, Math.ceil(baseDays * factor));
  return {
    days,
    capacityPerDayPerServer,
    effectiveCapacityPerDay,
    serverCountFactor: factor
  };
}

/**
 * Get timeline (days) for each server type for content migration.
 * Useful for displaying the "Server Type | Days" table.
 */
export function getContentTimelineByServerType(
  totalSizeGB: number,
  numberOfServers: number = 1
): { serverType: ServerType; days: number }[] {
  const types: ServerType[] = ['Small', 'Standard', 'Large', 'Extra Large'];
  return types.map((serverType) => {
    const result = computeContentTimeline({
      totalSizeGB,
      serverType,
      numberOfServers
    });
    return { serverType, days: result.days };
  });
}

/**
 * Format server type for display (e.g. "Extra Large (Bare Metal)").
 */
export function formatServerTypeLabel(serverType: ServerType): string {
  if (serverType === 'Extra Large') return 'Extra Large (Bare Metal)';
  return serverType;
}
