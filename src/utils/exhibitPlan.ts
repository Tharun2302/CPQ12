// Plan rules for the exhibits merged into a Multi-Combination / DIY agreement.
//
// An agreement carries only the exhibits of the plan chosen for each combination. A plan with
// no exhibit (or only one of its Include / Not Include pair) is left without it, never filled
// from the other plan: the Basic and Standard exhibits describe different scopes, so borrowing
// one puts the wrong scope on a signed agreement.

import { exhibitFolderKey, exhibitFolderLabel } from './exhibitCombination';

type PlanTagged = { _id?: unknown; name?: string; planType?: string };

const idOf = (ex: PlanTagged): string => String(ex?._id ?? '');

/** 'basic' | 'standard' | 'advanced', from planType or the name; '' for an exhibit with no plan. */
export function exhibitPlan(ex: PlanTagged | undefined | null): string {
  const pt = String(ex?.planType || '').toLowerCase();
  if (pt) return pt;
  const name = String(ex?.name || '').toLowerCase();
  const hasStandard = name.includes('standard') || name.includes('-std') || name.includes('_std') || name.endsWith('std');
  if (name.includes('basic') && !hasStandard && !name.includes('advanced')) return 'basic';
  if (hasStandard && !name.includes('advanced')) return 'standard';
  if (name.includes('advanced')) return 'advanced';
  return '';
}

/**
 * Plan for each exhibit: the custom plan's exhibit plan for its combination, else `globalPlan`.
 * `perCombo` is the custom plan's { combinationName: plan } map; configs link each name to its
 * ticked exhibit. Matching is by picker folder, so the Include and Not Include of a combination
 * always get the same plan even when their combination tags differ.
 */
export function exhibitPlanResolver<T extends PlanTagged>(
  configs: Array<{ exhibitId?: unknown; exhibitName?: string }>,
  perCombo: Record<string, string> | undefined | null,
  exhibits: T[],
  globalPlan: string,
): (ex: T) => string {
  const byId = new Map((exhibits || []).map((e) => [idOf(e), e]));
  const plans = new Map<string, string>();
  for (const cfg of configs || []) {
    const chosen = cfg?.exhibitName ? perCombo?.[cfg.exhibitName] : undefined;
    if (!chosen) continue;
    const folder = exhibitFolderKey(byId.get(String(cfg?.exhibitId ?? ''))?.name || cfg.exhibitName || '');
    if (folder) plans.set(folder, String(chosen).toLowerCase());
  }
  const fallback = String(globalPlan || '').toLowerCase();
  return (ex: T) => plans.get(exhibitFolderKey(ex?.name || '')) || fallback;
}

/** Drop ids whose exhibit belongs to a plan other than the one chosen for it. Unknown and plan-less ids stay. */
export function dropOtherPlanExhibits<T extends PlanTagged>(
  ids: string[],
  lookup: Map<string, T>,
  planFor: (ex: T) => string,
): string[] {
  return (ids || []).filter((id) => {
    const ex = lookup.get(String(id));
    if (!ex) return true;
    const plan = exhibitPlan(ex);
    const wanted = planFor(ex);
    return !plan || !wanted || plan === wanted;
  });
}

export type MissingPlanExhibits = { combination: string; plan: string };

/**
 * Combinations among `candidates` (the exhibits of the selected combinations) that have plan
 * exhibits, but none for the plan chosen for them. Combinations with only plan-less exhibits
 * are not reported: they never had plan exhibits to miss.
 */
export function combinationsMissingPlan<T extends PlanTagged>(
  candidates: T[],
  planFor: (ex: T) => string,
  keyOf: (ex: T) => string,
): MissingPlanExhibits[] {
  const groups = new Map<string, { label: string; plan: string; found: boolean }>();
  for (const ex of candidates || []) {
    const plan = exhibitPlan(ex);
    const wanted = planFor(ex);
    const key = keyOf(ex);
    if (!plan || !wanted || !key) continue;
    const group = groups.get(key) || { label: exhibitFolderLabel(ex.name || '') || key, plan: wanted, found: false };
    if (plan === wanted) group.found = true;
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .filter((g) => !g.found)
    .map((g) => ({ combination: g.label, plan: g.plan }));
}

/**
 * Same check for the plan page, where only the configured combinations are known. Each config
 * is matched to its picker folder by the ticked exhibit's name (the folder name when the
 * exhibit is not in the catalogue), so exhibits tagged 'multi-combination' still count.
 */
export function configsMissingPlan<T extends PlanTagged>(
  configs: Array<{ exhibitId?: unknown; exhibitName?: string }>,
  exhibits: T[],
  planFor: (combinationName: string) => string,
): MissingPlanExhibits[] {
  const byId = new Map((exhibits || []).map((ex) => [idOf(ex), ex]));
  const candidates: T[] = [];
  const planByFolder = new Map<string, string>();
  for (const cfg of configs || []) {
    const ticked = byId.get(String(cfg?.exhibitId ?? ''));
    const folder = exhibitFolderKey(ticked?.name || cfg?.exhibitName || '');
    if (!folder || planByFolder.has(folder)) continue;
    planByFolder.set(folder, String(planFor(cfg?.exhibitName || '') || '').toLowerCase());
    candidates.push(...(exhibits || []).filter((ex) => exhibitFolderKey(ex.name || '') === folder));
  }
  const folderOf = (ex: T) => exhibitFolderKey(ex.name || '');
  return combinationsMissingPlan(candidates, (ex) => planByFolder.get(folderOf(ex)) || '', folderOf);
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function missingPlanList(missing: MissingPlanExhibits[]): string {
  const plans = Array.from(new Set(missing.map((m) => m.plan)));
  const lines = missing.map((m) => (plans.length > 1 ? `- ${m.combination} (${title(m.plan)} plan)` : `- ${m.combination}`));
  const heading = plans.length > 1
    ? 'There are no exhibits for the selected plan for:'
    : `There are no ${title(plans[0])} plan exhibits for:`;
  return `${heading}\n${lines.join('\n')}`;
}

const these = (missing: MissingPlanExhibits[]) => (missing.length > 1 ? 'these combinations' : 'this combination');

/** Popup text, e.g. "There are no Basic plan exhibits for: - Box to Microsoft(...)". '' when nothing is missing. */
export function missingPlanExhibitsMessage(missing: MissingPlanExhibits[]): string {
  if (!missing || missing.length === 0) return '';
  return `${missingPlanList(missing)}\n\nThe agreement will be generated without exhibits for ${these(missing)}.`;
}

/** Popup text for the plan page, which stops the plan from being chosen. '' when nothing is missing. */
export function planSelectionBlockedMessage(missing: MissingPlanExhibits[]): string {
  if (!missing || missing.length === 0) return '';
  return `${missingPlanList(missing)}\n\nPlease choose another plan, or upload the missing exhibits for ${these(missing)} in Exhibits.`;
}
