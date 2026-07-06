/**
 * Tier-scenario mapping (display layer only).
 *
 * The pricing engine internally still uses the three tier IDs
 * 'basic' / 'standard' / 'advanced'. This module maps each migration
 * combination to one of three label-restructure scenarios that affect
 * what the *user sees* in the UI and inside rendered .docx templates:
 *
 *   Scenario 1: combination has all three tier templates
 *     → Hide internal "Standard"; relabel "Advanced" → "Standard".
 *
 *   Scenario 2: combination has only Standard + Advanced (no Basic file)
 *     → Relabel internal "Standard" → "Basic"; "Advanced" → "Standard".
 *
 *   Scenario 3: combination has only Basic + Advanced (no Standard file)
 *     → Relabel "Advanced" → "Standard"; nothing else changes.
 *
 *   null: combination has no tier scenario applied (e.g. overage-agreement,
 *   gmail-to-gmail, etc.) — caller should fall back to legacy behavior.
 *
 * No price values, formulas, calculation routes, or PRICING_TIERS data are
 * affected. This module is purely cosmetic / filter logic.
 */

export type TierScenario = 1 | 2 | 3 | null;

export type InternalTierName = 'Basic' | 'Standard' | 'Advanced';

const SCENARIO_1: ReadonlySet<string> = new Set([
  'dropbox-to-google-mydrive',
  'dropbox-to-google-sharedrive',
  'slack-to-google-chat',
]);

const SCENARIO_2: ReadonlySet<string> = new Set([
  'box-to-box',
  'box-to-dropbox',
  'box-to-google',
  'box-to-google-mydrive',
  'box-to-google-sharedrive',
  'box-to-microsoft',
  'box-to-onedrive',
  'box-to-sharefile',
  'box-to-sharepoint',
  'dropbox-to-box',
  'dropbox-to-egnyte',
  'dropbox-to-google',
  'dropbox-to-microsoft',
  'dropbox-to-onedrive',
  'dropbox-to-sharepoint',
  'egnyte-to-google',
  'egnyte-to-microsoft',
  'google-mydrive-to-dropbox',
  'google-mydrive-to-egnyte',
  'google-mydrive-to-google-mydrive',
  'google-mydrive-to-google-sharedrive',
  'google-mydrive-to-onedrive',
  'google-mydrive-to-sharepoint',
  'google-sharedrive-to-egnyte',
  'google-sharedrive-to-google-sharedrive',
  'google-sharedrive-to-onedrive',
  'google-sharedrive-to-sharepoint',
  'nfs-to-google',
  'nfs-to-microsoft',
  'onedrive-to-google-mydrive',
  'onedrive-to-onedrive',
  'sharefile-to-google-mydrive',
  'sharefile-to-google-sharedrive',
  'sharefile-to-onedrive',
  'sharefile-to-sharefile',
  'sharefile-to-sharepoint',
  'sharepoint-online-to-egnyte',
  'sharepoint-online-to-google-mydrive',
  'sharepoint-online-to-google-sharedrive',
  'sharepoint-online-to-sharepoint-online',
]);

const SCENARIO_3: ReadonlySet<string> = new Set([
  'slack-to-teams',
]);

function normalize(combination: string | null | undefined): string {
  if (!combination) return '';
  return combination.toLowerCase().trim().replace(/\s+/g, '-');
}

/** Returns the scenario for a combination slug or display name (case-insensitive). */
export function getTierScenario(combination: string | null | undefined): TierScenario {
  const slug = normalize(combination);
  if (!slug) return null;
  if (SCENARIO_1.has(slug)) return 1;
  if (SCENARIO_2.has(slug)) return 2;
  if (SCENARIO_3.has(slug)) return 3;
  return null;
}

/**
 * Given a tier's internal name and the combination's scenario, return the
 * label that should be shown to the user. Pricing data is unaffected.
 */
export function displayTierLabel(tierName: string, scenario: TierScenario): string {
  if (tierName === 'Advanced') return 'Standard';
  if (scenario === 2 && tierName === 'Standard') return 'Basic';
  return tierName;
}

/**
 * Whether a tier should be visible (selectable, rendered) for a given
 * combination's scenario.
 *
 * Default behavior (scenario === null): preserves the legacy hide-Advanced
 * rule so combinations that aren't in any list stay unchanged.
 */
export function isTierVisible(tierName: string, scenario: TierScenario): boolean {
  if (scenario === null) return tierName !== 'Advanced';
  if (scenario === 1) return tierName === 'Basic' || tierName === 'Advanced';
  if (scenario === 2) return tierName === 'Standard' || tierName === 'Advanced';
  if (scenario === 3) return tierName === 'Basic' || tierName === 'Advanced';
  return true;
}

/**
 * For tier-selection dropdowns: returns the option list (value, label) pairs
 * appropriate for the given scenario. The `value` is the internal tier name
 * (kept as-is so the pricing engine routes correctly); the `label` is what
 * the user sees.
 */
export function getTierOptionsForScenario(
  scenario: TierScenario
): Array<{ value: InternalTierName; label: string }> {
  if (scenario === 1) {
    return [
      { value: 'Basic', label: 'Basic Plan' },
      { value: 'Advanced', label: 'Standard Plan' },
    ];
  }
  if (scenario === 2) {
    return [
      { value: 'Standard', label: 'Basic Plan' },
      { value: 'Advanced', label: 'Standard Plan' },
    ];
  }
  if (scenario === 3) {
    return [
      { value: 'Basic', label: 'Basic Plan' },
      { value: 'Advanced', label: 'Standard Plan' },
    ];
  }
  // Fallback: legacy three-option dropdown (Advanced still relabeled).
  return [
    { value: 'Basic', label: 'Basic Plan' },
    { value: 'Standard', label: 'Standard Plan' },
    { value: 'Advanced', label: 'Standard Plan' },
  ];
}

/**
 * Template-side rules used by docxTemplateProcessor. Given a template
 * filename (e.g. "dropbox-to-egnyte-advanced.docx"), return the list of
 * regex/replacement pairs to apply to the rendered XML.
 *
 * Rule 1 (always): "Advanced Plan" → "Standard Plan"
 *   — uses word-boundary + required " Plan" suffix to avoid false positives
 *     like "Standard Channels" or "Advanced search".
 * Rule 2 (Scenario-2 *-standard.docx only): "Standard Plan" → "Basic Plan".
 *
 * Scenario-1 *-standard.docx files are intentionally not rewritten — they
 * are filtered out by the UI selection layer, so their rendered content
 * never reaches the user.
 */
export function getTemplateTierRewrites(
  filename: string
): Array<{ pattern: RegExp; replacement: string; reason: string }> {
  const rules: Array<{ pattern: RegExp; replacement: string; reason: string }> = [];
  const lower = (filename || '').toLowerCase();

  // RULE ORDER MATTERS. We must rewrite "Standard Plan" → "Basic Plan" BEFORE
  // rewriting "Advanced Plan" → "Standard Plan", otherwise the second rule
  // would sweep up the just-converted text and an "Advanced Plan" stray would
  // cascade Advanced → Standard → Basic, producing the wrong final label
  // ("Basic" instead of "Standard").

  // Step 1 (Scenario-2 *-standard.docx only): "Standard Plan" → "Basic Plan".
  // Derive the combination by stripping the tier suffix and check the map.
  if (lower.endsWith('-standard.docx') || lower.endsWith('-std.docx')) {
    const combo = lower
      .replace(/\.docx$/i, '')
      .replace(/-standard$/i, '')
      .replace(/-std$/i, '');
    if (getTierScenario(combo) === 2) {
      rules.push({
        pattern: /\bStandard Plan\b/g,
        replacement: 'Basic Plan',
        reason: 'scenario-2 standard→basic relabel',
      });
    }
  }

  // Step 2 (always): "Advanced Plan" → "Standard Plan". Covers every advanced
  // .docx and any stray "Advanced Plan" text in other files.
  rules.push({
    pattern: /\bAdvanced Plan\b/g,
    replacement: 'Standard Plan',
    reason: 'global advanced→standard relabel',
  });

  return rules;
}
