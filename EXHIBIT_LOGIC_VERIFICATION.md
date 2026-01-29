# Exhibit Include/Not Include Logic Verification

## Current Logic Flow

### Step 1: Get Selected Plan
```typescript
const selectedPlanName = (calculation || safeCalculation)?.tier?.name ?? '';
const selectedPlanLower = selectedPlanName.toLowerCase();
```
✅ **Correct**: Gets plan from calculation.tier.name (set when user clicks "Select Basic/Standard/Advanced")

### Step 2: Build Selected Combination Keys
```typescript
const selectedCombinationKeys = new Set<string>();
for (const exhibitId of exhibitIds) {
  const ex = allExhibits.find(...);
  const category = (ex.category || 'content').toLowerCase();
  const baseCombo = getBaseCombination(ex); // Extracts "slack-to-teams"
  if (baseCombo) selectedCombinationKeys.add(`${category}|${baseCombo}`);
}
```
✅ **Correct**: Builds set of (category, combination) pairs from initially selected exhibits

### Step 3: Expand by Plan
```typescript
if (selectedPlanName && selectedCombinationKeys.size > 0) {
  const expandedIds = new Set<string>(exhibitIds); // Starts with original selections
  for (const ex of allExhibits) {
    const category = (ex.category || 'content').toLowerCase();
    const baseCombo = getBaseCombination(ex);
    if (!baseCombo) continue;
    const key = `${category}|${baseCombo}`;
    if (!selectedCombinationKeys.has(key)) continue; // Skip if not selected combination
    const exhibitPlan = getPlanFromExhibit(ex);
    if (exhibitPlan.toLowerCase() !== selectedPlanLower) continue; // Skip if plan doesn't match
    expandedIds.add(ex._id?.toString?.() ?? ''); // Add matching exhibit
  }
  exhibitIds = Array.from(expandedIds);
}
```

## Potential Issues Found

### ✅ Issue 1: Empty Plan Detection - HANDLED CORRECTLY
**Scenario**: Exhibit has no planType and name doesn't contain "basic"/"standard"/"advanced"
- `getPlanFromExhibit` returns `''`
- Comparison: `''.toLowerCase() !== 'basic'` → `'' !== 'basic'` → `true` → `continue` (skip)
- **Result**: Correctly skips exhibits without plan

### ✅ Issue 2: Original Selections Preserved - CORRECT
**Scenario**: User selected "Basic Include", then selects "Basic" plan
- `expandedIds` starts as copy of `exhibitIds` (line 4128)
- Expansion adds "Basic Not Include"
- **Result**: Both "Basic Include" and "Basic Not Include" are included ✅

### ⚠️ Issue 3: Plan Mismatch - POTENTIAL BUG
**Scenario**: User selected "Standard Include", then selects "Basic" plan
- Original selection: "Standard Include" (in `exhibitIds`)
- Expansion looks for "Basic Include" and "Basic Not Include"
- `expandedIds` starts with "Standard Include" (from original selection)
- Expansion adds "Basic Include" and "Basic Not Include"
- **Result**: Agreement would include BOTH Standard and Basic exhibits ❌

**Expected Behavior**: When a plan is selected, should ONLY include exhibits for that plan, not keep exhibits from other plans.

### ✅ Issue 4: Case Sensitivity - HANDLED CORRECTLY
- `selectedPlanLower` converts to lowercase
- `exhibitPlan.toLowerCase()` converts to lowercase
- Comparison is case-insensitive ✅

### ✅ Issue 5: Empty Selected Plan - HANDLED CORRECTLY
- Line 4127 checks `if (selectedPlanName && ...)`
- If no plan selected, expansion doesn't run
- Falls back to original `exhibitIds` ✅

## Recommended Fix

When expanding by plan, we should FILTER OUT exhibits that don't match the selected plan, not just add matching ones:

```typescript
if (selectedPlanName && selectedCombinationKeys.size > 0) {
  const expandedIds = new Set<string>();
  for (const ex of allExhibits) {
    const category = (ex.category || 'content').toLowerCase();
    const baseCombo = getBaseCombination(ex);
    if (!baseCombo) continue;
    const key = `${category}|${baseCombo}`;
    if (!selectedCombinationKeys.has(key)) continue;
    const exhibitPlan = getPlanFromExhibit(ex);
    if (exhibitPlan.toLowerCase() !== selectedPlanLower) continue;
    expandedIds.add(ex._id?.toString?.() ?? '');
  }
  exhibitIds = Array.from(expandedIds);
}
```

**Change**: Don't start with `exhibitIds` - build fresh set with only matching plan exhibits.
