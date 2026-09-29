// Which slug an exhibit is matched against for the current configuration.
//
// Migrate and Manage disagree about where the agreement's identity lives. Migrate keeps it in
// `combination`. Manage pins `combination` to the literal 'manage-standalone' for every Manage
// agreement and puts the real slug (e.g. 'data-sprawl') in `migrationType`, so reading
// `combination` there would match no exhibit at all.

type ExhibitCombinationConfig = {
  servicePlan?: string;
  combination?: string;
  migrationType?: string;
};

/** Billing-only agreement: it prices overage against an existing deal and has no scope. */
export const OVERAGE_MIGRATION_TYPE = 'Overage Agreement';
export const OVERAGE_COMBINATION = 'overage-agreement';

/** True for the Overage Agreement, whichever field the current flow identifies it by. */
export function isOverageAgreement(config?: ExhibitCombinationConfig | null): boolean {
  if (!config) return false;
  if (config.migrationType === OVERAGE_MIGRATION_TYPE) return true;
  return String(config.combination || '').toLowerCase() === OVERAGE_COMBINATION;
}

/**
 * Whether the configure screen offers the exhibit step at all.
 *
 * Overage Agreement is excluded even though it runs as Migrate: it has no scope to attach, so
 * the picker is a step with nothing to do in it and puts a wrong exhibit one click away on a
 * document that should carry none. Everything else with a chosen combination keeps it.
 */
export function showExhibitSelector(config?: ExhibitCombinationConfig | null): boolean {
  if (!config || !config.combination) return false;
  if (config.servicePlan !== 'Migrate' && config.servicePlan !== 'Manage') return false;
  return !isOverageAgreement(config);
}

export const DEFAULT_EXHIBIT_COMBINATION = 'multi-combination';

export function exhibitCombinationKey(config?: ExhibitCombinationConfig | null): string {
  if (!config) return '';
  if (config.servicePlan === 'Manage') return String(config.migrationType || '');
  return String(config.combination || DEFAULT_EXHIBIT_COMBINATION);
}

/**
 * True when the exhibit list should be narrowed to this configuration's own exhibits.
 *
 * Manage agreements (data-sprawl, mange+sprawl) are authored with their own exhibits and have
 * nothing to do with the migration-pair catalogue, so offering all of it is noise at best and
 * a wrong exhibit on a signed agreement at worst. Migrate keeps the full list: Multi
 * combination is designed to draw from any pair.
 */
export function restrictExhibitsToCombination(config?: ExhibitCombinationConfig | null): boolean {
  return config?.servicePlan === 'Manage';
}

type CombinationTagged = { combinations?: string[] };

const lower = (v: unknown) => String(v ?? '').toLowerCase();

/**
 * Narrow the exhibit catalogue for the flow that is being quoted.
 *
 * Separation has to hold in both directions, and they are not symmetrical:
 *  - An agreement template shows ONLY its own exhibits. It has nothing to do with the
 *    migration-pair catalogue.
 *  - A migration flow shows everything EXCEPT exhibits owned by a Manage-only agreement.
 *    Those can never apply to a migration, so they are clutter in the picker and a wrong
 *    exhibit on a signed agreement if one is ticked by accident. It is not enough to scope
 *    only the Manage side: without this, the first data-sprawl exhibit uploaded would show
 *    up in every Multi combination quote.
 */
export function scopeExhibitsForCombination<T extends CombinationTagged>(
  all: T[],
  options: { combination?: string; restrict?: boolean; excludeSlugs?: Iterable<string> },
): T[] {
  const list = Array.isArray(all) ? all : [];
  const { combination, restrict } = options || {};

  if (restrict && combination) {
    const key = lower(combination);
    return list.filter((ex) => (ex.combinations || []).some((c) => lower(c) === key));
  }

  const exclude = new Set(Array.from(options?.excludeSlugs || [], lower));
  if (exclude.size === 0) return list;
  return list.filter((ex) => !(ex.combinations || []).some((c) => exclude.has(lower(c))));
}

/**
 * Agreement filter for the Exhibit Manager list.
 *
 * Mirrors what each agreement actually offers when it is quoted, so the list answers
 * "what will this agreement show?" rather than "what is literally tagged with this slug":
 *
 *  - A Manage agreement (data-sprawl, mange+sprawl) owns its exhibits, so it shows only those.
 *  - Multi-Combination and Overage Agreement own none. They run as Migrate and draw from the
 *    whole migration catalogue, so filtering by them shows that catalogue. Matching them on
 *    their own slug would show an empty list, which is the opposite of the truth.
 *
 * Blank shows everything, agreement-owned exhibits included.
 */
export function matchesAgreementFilter(
  exhibit: CombinationTagged,
  filter: string,
  manageOnlySlugs: Iterable<string>,
): boolean {
  if (!filter) return true;
  const tags = (exhibit?.combinations || []).map(lower);
  const managed = new Set(Array.from(manageOnlySlugs, lower));
  if (managed.has(lower(filter))) return tags.includes(lower(filter));
  return !tags.some((t) => managed.has(t));
}

/**
 * Agreements that can actually use exhibits, for the Exhibit Manager's pickers.
 *
 * Overage Agreement is dropped: its quotes never render the exhibit step, so offering it would
 * invite authoring exhibits that can never appear anywhere and filtering by an agreement that
 * shows nothing.
 */
export function agreementsSupportingExhibits<T extends { value: string; migrationType?: string }>(
  combinations: T[],
): T[] {
  return (combinations || []).filter(
    (c) => c.migrationType !== OVERAGE_MIGRATION_TYPE
      && String(c.value || '').toLowerCase() !== OVERAGE_COMBINATION,
  );
}

/**
 * Agreements an exhibit can be ATTACHED to in the upload / edit pickers.
 *
 * Multi-Combination is dropped as well: it owns no exhibits and draws from the migration-pair
 * catalogue. Attaching to it stores the literal 'multi-combination' slug, which detaches the
 * exhibit from its real pair, so the SOW can no longer tell which plans that pair has and pulls
 * the other plan's exhibits in alongside it.
 */
export function agreementsOwningExhibits<T extends { value: string; migrationType?: string }>(
  combinations: T[],
): T[] {
  return agreementsSupportingExhibits(combinations).filter(
    (c) => String(c.value || '').toLowerCase() !== DEFAULT_EXHIBIT_COMBINATION
      && c.migrationType !== 'Multi combination',
  );
}

// Normalize folder/combo text into a stable slug key for grouping
export function normalizeFolderKey(input: string): string {
  if (!input) return '';
  let s = String(input).toLowerCase();
  s = s
    .replace(/&/g, 'and')
    .replace(/\//g, '-') // treat "/" as separator
    .replace(/[^a-z0-9]+/g, '-') // any non-alphanum -> "-"
    .replace(/-+/g, '-') // collapse dashes
    .replace(/^-+|-+$/g, ''); // trim

  // Strip any trailing include/plan suffixes if user typed them into the folder name
  s = s.replace(/-(included|include|notincluded|not-include|notinclude|excluded)$/, '');
  s = s.replace(/-(basic|standard|advanced|premium|enterprise)$/, '');

  // Collapse duplicated halves: "onedrive-sharepoint-onedrive-sharepoint" -> "onedrive-sharepoint"
  const parts = s.split('-').filter(Boolean);
  if (parts.length > 0 && parts.length % 2 === 0) {
    const half = parts.length / 2;
    const first = parts.slice(0, half).join('-');
    const second = parts.slice(half).join('-');
    if (first === second) s = first;
  }

  return s;
}

/** "Onedrive to Onedrive Basic Plan - Basic Include" -> "Onedrive to Onedrive". */
export function exhibitNameBase(name: string): string {
  return String(name || '')
    .replace(/\s+(Basic|Standard|Advanced|Premium|Enterprise)\s+Plan\s*-\s*(Basic|Standard|Advanced|Premium|Enterprise)?\s*(Include|Not\s*Include|Included|Not\s*Included)(\s+Features?)?\s*$/i, '')
    .replace(/\s+-\s*(Include|Not\s*Include|Included|Not\s*Included)(\s+Features?)?\s*$/i, '')
    .replace(/\s+(Basic|Standard|Advanced|Premium|Enterprise)\s+Plan\s*$/i, '')
    .trim();
}

/** Folder label ExhibitSelector shows for a name-grouped exhibit, e.g. "Content Sprawl Egnyte". */
export function exhibitFolderLabel(name: string): string {
  return exhibitNameBase(name)
    .replace(/\s+(std|adv|basic|standard|advanced|premium|enterprise)\s+(inscope|outscope|in scope|out scope|include|not include|included|not included)\s*$/i, '')
    .trim();
}

// Same normalisation as ExhibitSelector's canonicalFolder, so case/spacing variants share a folder.
export function exhibitFolderKey(name: string): string {
  return exhibitFolderLabel(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The migration pair an exhibit belongs to, recovered from its name, for exhibits wrongly
 * tagged with the Multi-Combination agreement slug. Returns '' when the name does not
 * describe a "<source> to <destination>" pair, so a genuinely generic exhibit is left alone.
 */
export function pairCombinationFromName(name: string): string {
  const slug = normalizeFolderKey(exhibitNameBase(name));
  return /^[a-z0-9]+(-[a-z0-9]+)*-to-[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : '';
}

/**
 * Exhibit with its combinations as the selection logic should see them.
 *
 * Attaching an exhibit to the Multi-Combination agreement used to REPLACE its pair slug with
 * 'multi-combination'. Every per-pair rule (plan fallback, include/not-include pairing, folder
 * grouping) then saw that pair as missing its Basic exhibits and pulled in the Standard ones.
 * Swapping the tag for the name's pair restores the pair without touching stored data.
 */
export function withPairCombinations<T extends { name?: string; combinations?: string[] }>(exhibit: T): T {
  const tags = exhibit?.combinations;
  if (!Array.isArray(tags) || !tags.some((c) => lower(c) === DEFAULT_EXHIBIT_COMBINATION)) return exhibit;
  const pair = pairCombinationFromName(exhibit.name || '');
  if (!pair) return exhibit;
  const combinations = Array.from(new Set(tags.map((c) => (lower(c) === DEFAULT_EXHIBIT_COMBINATION ? pair : c))));
  return { ...exhibit, combinations };
}
