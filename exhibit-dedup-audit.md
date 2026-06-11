# Exhibit Deduplication Logic Audit

## 1. ExhibitSelector.tsx - Auto-Selection Layer
**Location:** Lines 236-383

### Tier-based Auto-Selection (Line 313)
```typescript
const finalSelection = Array.from(new Set([
  ...matchingExhibitIds,      // Exhibits matching the selected plan
  ...requiredExhibitIds,       // Required exhibits
  ...exhibitsWithoutPlanType   // Manually selected generic exhibits
]));
```
✅ **Status:** Using `new Set()` for deduplication - CORRECT

### Combination-based Auto-Selection (Line 377)
```typescript
const newSelection = Array.from(new Set([...current, ...matchingIds]));
```
✅ **Status:** Using `new Set()` for deduplication - CORRECT

### Group-level Deduplication (Line 857)
```typescript
const dedupeKey = `${label}|${exhibit.includeType || 'generic'}`;
```
✅ **Status:** Key includes label + includeType to keep Include/NotInclude separate - CORRECT

---

## 2. QuoteGenerator.tsx - Initial Collection Layer
**Location:** Line 5936

```typescript
let exhibitIds = Array.from(new Set([...idsFromSelection, ...idsFromConfigs]));
```
✅ **Status:** Using `new Set()` for deduplication - CORRECT

---

## 3. QuoteGenerator.tsx - Config-based Deduplication Layer
**Location:** Lines 6506-6554

**Deduplication Key Format:**
```typescript
const uniqueKey = `${category}|${baseCombo}|${plan}|${includeType}`;
```

**Process:**
- First pass (Line 6499-6522): Dedup existing expanded IDs by unique key
- Second pass (Line 6525-6554): Add new config IDs, skipping if key already exists

✅ **Status:** Two-pass deduplication with composite key - CORRECT

---

## 4. QuoteGenerator.tsx - Final Merge-time Deduplication
**Location:** Lines 8886-8917

**Deduplication Key Format:**
```typescript
const uniqueKey = `${category}|${baseCombo}|${planLower}|${includeType}`;
```

**Process:**
- Iterates through `expandedUniqueSelectedExhibitsForMerge`
- Builds dedup key with all four factors
- Skips if key already seen

✅ **Status:** Composite key deduplication - CORRECT

---

## 5. QuoteGenerator.tsx - Fetch Protection (NEW)
**Location:** Lines 2410-2440 (email) and 9061-9090 (document)

```typescript
const fetchedExhibitIds = new Set<string>();
for (const exhibitId of sortedExhibits) {
  if (fetchedExhibitIds.has(exhibitId)) {
    console.error('❌ CRITICAL: Exhibit fetched twice!');
    continue;
  }
  fetchedExhibitIds.add(exhibitId);
  // Fetch exhibit...
}
```

✅ **Status:** NEW protection to catch duplicate fetches - ADDED

---

## 6. Sorting and Grouping
**Location:** Lines 9039-9059

```typescript
const included: Array<{ id: string; exhibit: any }> = [];
const notIncluded: Array<{ id: string; exhibit: any }> = [];

for (const id of dedupedIds) {
  const ex = lookup.get(id);
  if (!ex) continue;
  (isNotIncludedExhibit(ex) ? notIncluded : included).push({ id, exhibit: ex });
}

const sortedExhibits = [...included.map(x => x.id), ...notIncluded.map(x => x.id)];
```

✅ **Status:** Each ID appears in either `included` OR `notIncluded`, not both - CORRECT

---

## Potential Issues to Check

### Issue 1: Exhibit File Contains Duplicate Content
If the DOCX file itself has the same table/field twice:
- Generate a document
- Right-click → Download
- Open in Word
- Check if the field appears twice WITHIN the exhibit table

### Issue 2: Same Exhibit ID in Final List
Check browser console for any:
- ❌ **CRITICAL: Duplicate exhibit IDs in sorted exhibits**
- ❌ **CRITICAL: Exhibit ... is being fetched twice**

### Issue 3: Incorrect includeType Inference
The fallback logic at multiple points:
```typescript
const includeType = (ex?.includeType || (ex?.name?.toLowerCase().includes('not') ? 'notincluded' : 'included'))
```

If exhibit name doesn't contain "not", it's assumed "included" even if it should be "notincluded".

---

## Next Steps

1. **Generate a document and check console logs**
   - Look for "Skipping duplicate" warnings
   - Look for "CRITICAL" error messages
   - Note the exhibit IDs and names being selected

2. **Check the exhibit order log:**
   ```
   📋 Exhibit order: 1. [Name], 2. [Name], ...
   ```
   - Do you see duplicates here?

3. **Download generated document and inspect in Word**
   - Are duplicates WITHIN one exhibit?
   - Or are duplicates BETWEEN exhibits?

4. **Share your browser console logs** (F12 → Console) focusing on:
   - `📋 Auto-selecting exhibits for tier`
   - `📋 Sorted exhibits for merge`
   - `📋 Exhibit order`
   - Any `⚠️ Skipping duplicate` messages
