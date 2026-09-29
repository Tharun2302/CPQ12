import { ConfigurationData, ManageSprawlConfig, SprawlType } from '../types/pricing';
import {
  SPRAWL_TYPE_ORDER,
  hasSprawlConfigs,
  manageAgreementCard,
  nonNegative,
  normalizeSprawlConfigs,
  normalizeSprawlTypes,
  resolveSprawlUsers,
  sprawlGroupLabel,
  withSprawlConfigs
} from './pricing';
import { parseSprawlName, sprawlFolderKey, sprawlFolderLabel, sprawlTypeFromWord } from './sprawlName';

export interface SprawlExhibit {
  _id: string;
  name?: string;
  category?: string;
}

export interface SprawlGroup {
  exhibitId: string;
  exhibitIds: string[];
  exhibitName: string;
  type: SprawlType;
}

export interface SprawlExhibitType {
  type: SprawlType;
  source: 'name' | 'category';
}

export interface SprawlExhibitFolder {
  key: string;
  label: string;
  type: SprawlType;
}

const isDev = (): boolean => typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

// The name wins: category defaults to 'content' on upload, so it cannot be trusted for Message/Email.
export function resolveSprawlExhibitType(exhibit: Pick<SprawlExhibit, 'name' | 'category'>): SprawlExhibitType {
  const declared = String(exhibit?.category || '').toLowerCase();
  const fromCategory = sprawlTypeFromWord(declared);
  const { type } = parseSprawlName(exhibit?.name || '');
  if (type) {
    if (isDev() && fromCategory && declared !== 'content' && fromCategory !== type) {
      console.warn('Sprawl exhibit name and category disagree; using the name', { name: exhibit?.name, category: declared });
    }
    return { type, source: 'name' };
  }
  return { type: fromCategory ?? 'Content', source: 'category' };
}

// Shared by ExhibitSelector and the priced groups so a folder and its card cannot disagree.
export function sprawlExhibitFolder(exhibit: Pick<SprawlExhibit, 'name' | 'category'>): SprawlExhibitFolder {
  const { type } = resolveSprawlExhibitType(exhibit);
  const { source } = parseSprawlName(exhibit?.name || '');
  return { key: sprawlFolderKey(type, source), label: sprawlFolderLabel(type, source), type };
}

const capitals = (s: string): number => (s.match(/[A-Z]/g) || []).length;

// combinations[] holds only the agreement slug for sprawl exhibits, so the name is the only grouping signal.
export function buildSprawlGroups(exhibits: SprawlExhibit[], selectedIds: string[]): SprawlGroup[] {
  const list = Array.isArray(exhibits) ? exhibits : [];
  const ids = Array.from(new Set((selectedIds || []).map(id => String(id ?? '')).filter(Boolean)));
  const byKey = new Map<string, SprawlGroup>();

  ids.forEach(id => {
    const exhibit = list.find(ex => ex?._id === id);
    if (!exhibit) return;
    const folder = sprawlExhibitFolder(exhibit);
    const group = byKey.get(folder.key);
    if (!group) {
      byKey.set(folder.key, { exhibitId: id, exhibitIds: [id], exhibitName: folder.label, type: folder.type });
      return;
    }
    group.exhibitIds.push(id);
    // "content sprawl google" and "Content Sprawl Google" are one folder; show the capitalised one.
    if (capitals(folder.label) > capitals(group.exhibitName)) group.exhibitName = folder.label;
  });

  return Array.from(byKey.values())
    .sort((a, b) => SPRAWL_TYPE_ORDER.indexOf(a.type) - SPRAWL_TYPE_ORDER.indexOf(b.type));
}

function legacyQuantity(config: ConfigurationData, type: SprawlType): number {
  return nonNegative(
    type === 'Content' ? config?.manageDataGB
    : type === 'Message' ? config?.manageMessageCount
    : config?.manageEmailCount
  );
}

// A new group starts at 0, never 1: a seeded 1 would be a silent charge.
export function reconcileSprawlConfigs(
  prev: ManageSprawlConfig[] | undefined,
  groups: SprawlGroup[],
  legacyConfig: ConfigurationData
): ManageSprawlConfig[] {
  const previous = normalizeSprawlConfigs({ manageSprawlConfigs: prev } as ConfigurationData);
  const used = new Set<ManageSprawlConfig>();
  const legacyTypes = previous.length === 0 ? normalizeSprawlTypes(legacyConfig) : [];
  const legacyUsers = legacyTypes.length > 0 ? resolveSprawlUsers(legacyConfig) : null;
  const seeded = new Set<SprawlType>();

  return groups.map(group => {
    const name = group.exhibitName.toLowerCase();
    const existing = previous.find(c =>
      !used.has(c) && (group.exhibitIds.includes(c.exhibitId) || c.exhibitName.toLowerCase() === name)
    );
    const base = {
      exhibitId: group.exhibitId,
      exhibitIds: [...group.exhibitIds],
      exhibitName: group.exhibitName,
      type: group.type
    };
    if (existing) {
      used.add(existing);
      // A GB figure means nothing as a message count.
      return { ...base, users: existing.users, quantity: existing.type === group.type ? existing.quantity : 0 };
    }
    if (legacyUsers && legacyTypes.includes(group.type) && !seeded.has(group.type)) {
      seeded.add(group.type);
      return { ...base, users: legacyUsers[group.type], quantity: legacyQuantity(legacyConfig, group.type) };
    }
    return { ...base, users: 0, quantity: 0 };
  });
}

// Switching a legacy per-type config to groups must not drop a type it was priced on.
export function keepLegacySprawl(config: ConfigurationData, groups: SprawlGroup[]): boolean {
  if (Array.isArray(config?.manageSprawlConfigs)) return false;
  const legacyTypes = normalizeSprawlTypes(config);
  return legacyTypes.some(t => !groups.some(g => g.type === t));
}

// Returns `prev` itself when unchanged so React skips the re-render; `memory` survives an empty selection.
export function applySprawlGroups(
  prev: ConfigurationData,
  groups: SprawlGroup[],
  memory: Map<string, ManageSprawlConfig>
): ConfigurationData {
  if (keepLegacySprawl(prev, groups)) return prev;
  const current = normalizeSprawlConfigs(prev);
  current.forEach(c => memory.set(c.exhibitId, c));
  const currentIds = new Set(current.map(c => c.exhibitId));
  const known = [...current, ...Array.from(memory.values()).filter(c => !currentIds.has(c.exhibitId))];
  const next = withSprawlConfigs(prev, reconcileSprawlConfigs(known, groups, prev));
  const unchanged = Array.isArray(prev.manageSprawlConfigs)
    && JSON.stringify(current) === JSON.stringify(next.manageSprawlConfigs);
  return unchanged ? prev : next;
}

// Shared by the form's submit and App's recalculation gate so the two cannot diverge.
export function sprawlConfigIssue(config: ConfigurationData | undefined | null): string | null {
  if (!config || config.servicePlan !== 'Manage') return null;
  if (hasSprawlConfigs(config)) {
    for (const group of normalizeSprawlConfigs(config)) {
      const label = sprawlGroupLabel(group.type, group.exhibitName);
      if (group.users <= 0) return `Please enter the number of users for ${label}`;
      if (group.type === 'Content' && group.quantity <= 0) return `Please enter the data size in GB for ${label}`;
    }
    return null;
  }
  // A legacy per-type config keeps its existing checks.
  if (normalizeSprawlTypes(config).length > 0) return null;
  if (manageAgreementCard(config) !== 'both') return 'Please select at least one Data Sprawl exhibit';
  return null;
}

function legacyManageReady(config: ConfigurationData): boolean {
  const types = normalizeSprawlTypes(config);
  if (types.length > 0) {
    return (config.manageUsers ?? 0) > 0 && (!types.includes('Content') || (config.manageDataGB ?? 0) > 0);
  }
  return config.manageRequiresUsers === false
    ? (config.manageDataGB ?? 0) > 0
    : (config.manageUsers ?? 0) > 0;
}

// A sprawl agreement with no valid groups must not keep the last priced figure on screen.
export function manageCoreConfigReady(config: ConfigurationData): boolean {
  if (hasSprawlConfigs(config)) return sprawlConfigIssue(config) === null;
  if (manageAgreementCard(config) !== 'both' && sprawlConfigIssue(config) !== null) return false;
  return legacyManageReady(config);
}
