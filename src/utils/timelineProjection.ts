/**
 * Timeline Projection – logic for content, messaging, and email migration timelines.
 * Separate file for timeline projection calculations based on server type and size.
 *
 * Business logic (from spec):
 * - Source Environment: Citrix/Egnyte/Fileshare/Box/DropBox → "Data & Root Permissions Only"
 *   Others → "Data, Root & Sub-Folder permissions, Hyperlinks"
 * - Factor matrix: Server config × (Source + Migration type) – see CONTENT_MIGRATION_FACTOR_MATRIX
 * - Formula: days = (B12 / factor) * B15 / B14 = totalSizeGB * serverCountFactor / (factor * numberOfServers)
 * - B15 (server count factor): 1 server = 1, 2 servers = 1.6, 3+ servers = 1.9
 */

export type ServerType = 'Small' | 'Standard' | 'Large' | 'Extra Large';

/** Source environment for content migration */
export type SourceEnvironment = 'Citrix/Egnyte/Fileshare/Box/DropBox' | 'Others';

/** Migration type for content migration */
export type ContentMigrationType =
  | 'Data & Root Permissions Only'
  | 'Data, Root & Sub-Folder permissions, Hyperlinks';

/** GB per day capacity per server (one server of this type) – used when no source/migration type specified. */
export const SERVER_TYPE_GB_PER_DAY: Record<ServerType, number> = {
  Small: 200,
  Standard: 300,
  Large: 500,
  'Extra Large': 700
};

/**
 * Content migration factor matrix.
 * Rows: Server Configuration (Small, Standard, Large, Extra Large)
 * Columns: [Citrix Data&Root, Others Data&Root, Citrix Hyperlinks, Others Hyperlinks]
 */
const CONTENT_MIGRATION_FACTOR_MATRIX: Record<
  ServerType,
  { citrixDataRoot: number; othersDataRoot: number; citrixHyperlinks: number; othersHyperlinks: number }
> = {
  Small: { citrixDataRoot: 100, othersDataRoot: 250, citrixHyperlinks: 80, othersHyperlinks: 200 },
  Standard: { citrixDataRoot: 300, othersDataRoot: 400, citrixHyperlinks: 200, othersHyperlinks: 300 },
  Large: { citrixDataRoot: 500, othersDataRoot: 600, citrixHyperlinks: 400, othersHyperlinks: 500 },
  'Extra Large': { citrixDataRoot: 700, othersDataRoot: 800, citrixHyperlinks: 600, othersHyperlinks: 700 }
};

/**
 * Get the migration factor for content timeline based on server type, source environment, and migration type.
 */
export function getContentMigrationFactor(
  serverType: ServerType,
  sourceEnvironment: SourceEnvironment,
  migrationType: ContentMigrationType
): number {
  const row = CONTENT_MIGRATION_FACTOR_MATRIX[serverType];
  const isCitrix = sourceEnvironment === 'Citrix/Egnyte/Fileshare/Box/DropBox';
  const isDataRootOnly = migrationType === 'Data & Root Permissions Only';

  if (isCitrix && isDataRootOnly) return row.citrixDataRoot;
  if (!isCitrix && isDataRootOnly) return row.othersDataRoot;
  if (isCitrix && !isDataRootOnly) return row.citrixHyperlinks;
  return row.othersHyperlinks;
}

/** Server count factor (B15): 1 server = 1, 2 servers = 1.6, 3+ servers = 1.9 */
export function getServerCountFactor(numberOfServers: number): number {
  if (numberOfServers <= 0) return 1;
  if (numberOfServers === 1) return 1;
  if (numberOfServers === 2) return 1.6;
  if (numberOfServers >= 3) return 1.9;
  return 1;
}

export interface ContentTimelineInput {
  /** Total size to be migrated in GB */
  totalSizeGB: number;
  serverType: ServerType;
  numberOfServers: number;
  /** Source environment (default: Others) */
  sourceEnvironment?: SourceEnvironment;
  /** Migration type (default: Data, Root & Sub-Folder permissions, Hyperlinks) */
  migrationType?: ContentMigrationType;
}

export interface TimelineResult {
  /** Calculated number of days for the migration */
  days: number;
  /** GB per day capacity/factor used (per server) */
  capacityPerDayPerServer: number;
  /** Effective total capacity per day (capacity * number of servers) */
  effectiveCapacityPerDay: number;
  /** Server count factor applied (1, 1.6, or 1.9) */
  serverCountFactor: number;
}

/**
 * Content migration timeline: compute number of days.
 * Formula: days = (B12 / factor) * B15 / B14 = totalSizeGB * serverCountFactor / (factor * numberOfServers)
 * Where factor is from the matrix based on server type, source environment, and migration type.
 */
export function computeContentTimeline(input: ContentTimelineInput): TimelineResult {
  const {
    totalSizeGB,
    serverType,
    numberOfServers,
    sourceEnvironment = 'Others',
    migrationType = 'Data, Root & Sub-Folder permissions, Hyperlinks'
  } = input;

  const factor = getContentMigrationFactor(serverType, sourceEnvironment, migrationType);
  const serverCountFactor = getServerCountFactor(numberOfServers);
  const effectiveCapacityPerDay = numberOfServers > 0 ? factor * numberOfServers : factor;

  const divisor = factor * Math.max(1, numberOfServers);
  const days = divisor > 0
    ? Math.max(0, Math.round((totalSizeGB * serverCountFactor) / divisor))
    : 0;

  return {
    days,
    capacityPerDayPerServer: factor,
    effectiveCapacityPerDay,
    serverCountFactor
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
  numberOfServers: number = 1,
  sourceEnvironment: SourceEnvironment = 'Others',
  migrationType: ContentMigrationType = 'Data, Root & Sub-Folder permissions, Hyperlinks'
): { serverType: ServerType; days: number }[] {
  const types: ServerType[] = ['Small', 'Standard', 'Large', 'Extra Large'];
  return types.map((serverType) => {
    const result = computeContentTimeline({
      totalSizeGB,
      serverType,
      numberOfServers,
      sourceEnvironment,
      migrationType
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
