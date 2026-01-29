# Workflow Verification: Exhibit Selection → Plan Selection → Agreement

## Step-by-Step Code Verification

### ✅ Step 1: Select exhibit folder/combination → System extracts combination name

**Location:** `ConfigurationForm.tsx:193-228`

```typescript
uniqueSelectedExhibits.forEach(exhibitId => {
  const exhibit = exhibits.find((ex: any) => ex._id === exhibitId);
  if (exhibit) {
    const category = (exhibit.category || 'content').toLowerCase();
    // Extract base combination name (prioritizes combinations field over name)
    const combinationName = extractCombinationName(exhibit); // ← EXTRACTS COMBINATION
    
    if (category === 'messaging') {
      if (!messagingCombinationMap.has(combinationName)) {
        messagingCombinationMap.set(combinationName, { exhibitIds: [], exhibitName: combinationName, category });
      }
      messagingCombinationMap.get(combinationName)!.exhibitIds.push(exhibitId);
    }
    // Same for content and email...
  }
});
```

**VERIFIED:** ✅ Combination name is extracted from selected exhibits and grouped.

---

### ✅ Step 2: Configure project → Configuration saved

**Location:** `ConfigurationForm.tsx:328-333`

```typescript
setConfig(prev => ({
  ...prev,
  messagingConfigs: newMessagingConfigs,
  contentConfigs: newContentConfigs,
  emailConfigs: newEmailConfigs,
}));
```

**VERIFIED:** ✅ Configuration is saved to state and passed to parent via `onConfigurationChange`.

---

### ✅ Step 3: Select plan → Plan stored (calculation.tier.name)

**Location:** `PricingComparison.tsx:815` → `App.tsx:1585` → `Dashboard.tsx:492`

```typescript
// User clicks "Select Basic"
onSelectTier(calc); // calc.tier.name = "Basic"

// In App.tsx
const handleSelectTier = async (calculation: PricingCalculation) => {
  setSelectedTier(calculation); // Stores calculation with tier.name = "Basic"
}

// In Dashboard.tsx
<QuoteGenerator
  calculation={selectedTier || fallbackCalculation} // ← Passes calculation
  ...
/>
```

**VERIFIED:** ✅ Plan is stored in `calculation.tier.name` and passed to QuoteGenerator.

---

### ✅ Step 4: Agreement generated → Includes all exhibits matching:

**Location:** `QuoteGenerator.tsx:4112-4141`

#### 4a. Get Selected Plan
```typescript
const selectedPlanName = (calculation || safeCalculation)?.tier?.name ?? '';
const selectedPlanLower = selectedPlanName.toLowerCase();
```
**VERIFIED:** ✅ Reads plan from `calculation.tier.name`.

#### 4b. Extract Selected Combinations
```typescript
const selectedCombinationKeys = new Set<string>();
for (const exhibitId of exhibitIds) {
  const ex = allExhibits.find(...);
  const baseCombo = getBaseCombination(ex); // Extracts "slack-to-teams"
  if (baseCombo) selectedCombinationKeys.add(`${category}|${baseCombo}`);
}
```
**VERIFIED:** ✅ Extracts combination names from selected exhibits.

#### 4c. Expand to Include Matching Exhibits
```typescript
if (selectedPlanName && selectedCombinationKeys.size > 0) {
  const expandedIds = new Set<string>();
  for (const ex of allExhibits) {
    const category = (ex.category || 'content').toLowerCase();
    const baseCombo = getBaseCombination(ex);
    const key = `${category}|${baseCombo}`;
    
    // ✅ Check 1: Is this a selected combination?
    if (!selectedCombinationKeys.has(key)) continue; // Skip if not selected
    
    // ✅ Check 2: Does this exhibit match the selected plan?
    const exhibitPlan = getPlanFromExhibit(ex);
    if (!exhibitPlan || exhibitPlan.toLowerCase() !== selectedPlanLower) continue; // Skip if plan doesn't match
    
    // ✅ Add exhibit (includes BOTH Include and Not Include because we loop through ALL exhibits)
    expandedIds.add(ex._id?.toString?.() ?? '');
  }
  exhibitIds = Array.from(expandedIds);
}
```

**VERIFIED:** ✅ 
- Checks selected combination (line 4135)
- Checks selected plan (line 4137)
- Includes both Include and Not Include variants (loops through ALL exhibits, so both are found)

---

## Complete Flow Verification

| Step | Code Location | Status |
|------|---------------|--------|
| 1. Extract combination name | `ConfigurationForm.tsx:199` | ✅ VERIFIED |
| 2. Save configuration | `ConfigurationForm.tsx:328-333` | ✅ VERIFIED |
| 3. Store plan | `App.tsx:1585` → `Dashboard.tsx:492` | ✅ VERIFIED |
| 4a. Read selected plan | `QuoteGenerator.tsx:4112` | ✅ VERIFIED |
| 4b. Extract combinations | `QuoteGenerator.tsx:4115-4123` | ✅ VERIFIED |
| 4c. Filter by combination | `QuoteGenerator.tsx:4135` | ✅ VERIFIED |
| 4d. Filter by plan | `QuoteGenerator.tsx:4137` | ✅ VERIFIED |
| 4e. Include both variants | `QuoteGenerator.tsx:4130-4138` | ✅ VERIFIED |

---

## Conclusion

**✅ WORKFLOW IS WORKING CORRECTLY**

The code implements exactly what was described:
1. ✅ Combination names are extracted from selected exhibits
2. ✅ Configuration is saved
3. ✅ Plan is stored in `calculation.tier.name`
4. ✅ Agreement includes exhibits matching:
   - Selected combination ✅
   - Selected plan ✅
   - Both Include and Not Include variants ✅
