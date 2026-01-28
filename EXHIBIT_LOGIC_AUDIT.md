# Exhibit Logic Audit

This document summarizes how exhibits work across the app and where behavior can be correct vs different or buggy.

---

## 1. Flow Overview

| Step | Where | What happens |
|------|--------|--------------|
| **1. List** | Exhibit Manager (`/api/exhibits`) | Exhibits loaded from MongoDB; optional query `combination`, `category`. Sorted by `displayOrder`, `name`. |
| **2. Upload** | Exhibit Manager → `POST /api/exhibits` | DOCX + metadata (name, category, combinations, planType). Stored in MongoDB + optional `backend-exhibits` folder. `planType` required (basic/standard/advanced). |
| **3. Select** | Configure → ExhibitSelector | All exhibits fetched (no filter). Filtered by **tier** (planType or name: basic/standard/advanced). Selected IDs stored in `selectedExhibits` (App state + localStorage). |
| **4. Build configs** | Configure → ConfigurationForm | When Multi combination + selectedExhibits change: fetch exhibits, **extract combination name** per exhibit, group by that name, build **one config per combination** → `messagingConfigs` / `contentConfigs` / `emailConfigs` (each entry has `exhibitId`, `exhibitName`). |
| **5. Pricing** | PricingComparison / pricing.ts | For each config, `calculateCombinationPricing(cfg.exhibitName, type, config, tier)` → breakdowns keyed by `combinationName = cfg.exhibitName`. |
| **6. Quote rows** | QuoteGenerator | Exhibit rows built from selected exhibit IDs + configs. Grouped by `category|displayName` (displayName = first line of `formatExhibitDescription` = cleaned exhibit name). Config lookup by `exhibitId` or `exhibitName === combinationName`. Price from breakdown `combinationName === exhibitConfig.exhibitName`. |
| **7. Merge** | QuoteGenerator (doc gen) | Selected exhibit DOCX files merged into main document. Order: **Included first, then Not Included**; within each by category (messaging → content → email) and `displayOrder`. |

---

## 2. What Works Correctly

- **Backend**: GET/POST/PUT/DELETE exhibits; optional `combination`/`category` filter; file stored in DB (and optionally folder).
- **ExhibitSelector**: Loads all exhibits; filters by tier (planType or name); grouping by base combination; hidden groups (ShareFile/Dropbox legacy) still show exhibits in ungrouped list.
- **ConfigurationForm**: When you select exhibits, it builds one config per **combination name** and keeps existing config values when the same combination is already present.
- **Pricing**: Breakdowns use `exhibitName` from config; Quote looks up by `exhibitConfig.exhibitName` so price matches the right row.
- **Quote rows**: Uses both `selectedExhibits` and configs’ `exhibitId`; prefers Included over Not Included when grouping by `category|displayName`; config found by exhibitId or displayName.
- **Merge order**: Included first, then Not Included; then by category and displayOrder.

---

## 3. Differences / Possible Bugs

### 3.1 One config for multiple exhibits (Inscope vs Outscope)

- **Logic**: `extractCombinationName(exhibit)` in ConfigurationForm:
  - **First**: use `exhibit.combinations[0]`, strip suffix `-(included|include|notincluded|notinclude|not-include|basic|standard|advanced)` (only at **end** of string), then format with `split('-').map(capitalize)`.
  - **Fallback**: use `exhibit.name` and strip "Plan - ...", "Included/Not Included Features", etc. (does **not** strip "Inscope" or "Outscope").
- **Risk**: If two exhibits (e.g. "Adv Inscope" and "Adv Outscope") share the **same** `combinations[0]` (e.g. `"google-mydrive-to-google-mydrive"`) and that string does not end with `-inscope`/`-outscope`, then **both get the same combination name** and are merged into **one** config (one row, one price).
- **When it’s correct**: If each exhibit has a **unique** combination string that includes scope/plan (e.g. `...-adv-inscope`, `...-adv-outscope`), you get one config per exhibit and correct rows/prices.
- **Recommendation**: For "Google My Drive & Share Drive" type exhibits (Adv Inscope, Adv Outscope, Std Inscope, Std Outscope), either:
  - Store **unique** `combinations[0]` per scope (e.g. `...-adv-inscope`, `...-adv-outscope`, `...-std-inscope`, `...-std-outscope`), or
  - In `extractCombinationName`, when the exhibit **name** contains "Inscope" or "Outscope", prefer the **name-based** result (fallback) so the combination name stays unique even when `combinations[0]` is the same.

### 3.2 Naming: combination vs display name

- **Config** `exhibitName` can come from **combination** formatting (e.g. "Google Mydrive Sharedrive To ...") — no "&", no space in "Mydrive".
- **Quote** description uses **exhibit name** from DB (e.g. "Google My Drive & Share Drive ...").
- **Effect**: Section headers in Configure and pricing breakdown keys use the combination-style name; the printed quote uses the exhibit name. Lookup still works because config is found by **exhibitId** first, then `exhibitName` is used for breakdown key, so the same config’s `exhibitName` is used consistently for price. No functional bug, only cosmetic difference between UI labels and document text.

### 3.3 Merge order: Inscope vs Outscope

- **Current**: Merge order is **Included** first, then **Not Included** (by name/description containing "not include(d)").
- **Gap**: There is **no** explicit rule for "Inscope" before "Outscope". Exhibits like "Adv Inscope" and "Adv Outscope" are both treated as "Included" and ordered only by category and `displayOrder`.
- **Recommendation**: If you want a fixed order (e.g. Inscope then Outscope) in the merged document, add a sort step that orders by "Inscope" before "Outscope" (e.g. in the same place where Included/Not Included is applied).

### 3.4 ExhibitSelector tier auto-filter

- When the **tier** (Basic/Standard/Advanced) changes, an effect **auto-updates** `selectedExhibits` to only keep exhibits that match the new tier. So if you switch from Advanced to Standard, previously selected Advanced-only exhibits are **removed** from the selection.
- **Intent**: Avoid invalid combinations (e.g. Standard tier with Advanced-only exhibits).
- **Side effect**: User’s prior selection can change without an explicit "deselect" action. If that’s unexpected, consider making this a one-time suggestion or confirmation instead of automatic.

---

## 4. Quick Checklist

| Check | Status |
|-------|--------|
| Exhibits load from API and show in Exhibit Manager | OK |
| Upload requires category + planType; stored in DB | OK |
| ExhibitSelector filters by tier (planType/name) | OK |
| Multi combination builds one config per combination name | OK (if combination names are unique) |
| Pricing breakdowns keyed by config exhibitName | OK |
| Quote finds config by exhibitId then exhibitName | OK |
| Quote price from breakdown by exhibitConfig.exhibitName | OK |
| Merge order: Included → Not Included, then category, displayOrder | OK |
| Inscope/Outscope get separate configs | Only if combination string or name is unique per scope |
| Merge order Inscope vs Outscope | Not defined (both treated as Included) |
| Tier change auto-deselects non-matching exhibits | By design; confirm if desired |

---

## 5. Recommendations

1. **Ensure unique combination names for Inscope/Outscope**: When uploading "Google My Drive & Share Drive" exhibits (Adv Inscope, Adv Outscope, Std Inscope, Std Outscope), set `combinations[0]` to include scope and plan (e.g. `...-adv-inscope`, `...-adv-outscope`) so each gets its own config and price row. Alternatively, change `extractCombinationName` to prefer the name-based result when the exhibit name contains "Inscope" or "Outscope".
2. **Optional**: Add explicit merge order for Inscope before Outscope in QuoteGenerator’s `sortExhibits` (alongside Included/Not Included).
3. **Optional**: Normalize combination formatting so config labels use the same wording as exhibit names (e.g. "My Drive", "Share Drive") for a consistent look in Configure and documents.

---

*Audit date: 2025-01-28*
