# Fix Summary: Exhibit Combination Grouping

## Problem You Reported
When uploading exhibits:
1. Upload "ShareFile to Google Shared Drive" + "Include" → First exhibit created ✓
2. Upload "ShareFile to Google Shared Drive" + "Not Include" → **Second group created instead of grouping together** ❌

They don't appear in the same folder in the Exhibit Selector.

---

## Root Cause

The `buildCombinationKey()` function was **incorrectly appending** includeType and planType to the combination key:

### OLD CODE (BROKEN) ❌
```javascript
function buildCombinationKey(base, includeType, planType) {
  return [b, includeType, planType].filter(Boolean).join('-');
}

// Result:
// Upload 1: "sharefile-to-google-sharedrive-included-standard"
// Upload 2: "sharefile-to-google-sharedrive-notincluded-standard"
// DIFFERENT KEYS → DON'T GROUP
```

### NEW CODE (FIXED) ✅
```javascript
function buildCombinationKey(base, includeType, planType) {
  // Only return the BASE combination key
  // includeType and planType are stored separately
  return b || 'all';
}

// Result:
// Upload 1: "sharefile-to-google-sharedrive"
// Upload 2: "sharefile-to-google-sharedrive"
// SAME KEY → WILL GROUP
```

---

## What Changed

**File**: `src/components/ExhibitManager.tsx` (lines 74-79)

### Before:
```javascript
function buildCombinationKey(base: string, includeType: string, planType: string): string {
  const b = normalizeFolderKey(base);
  const t = String(includeType || '').toLowerCase();
  const p = String(planType || '').toLowerCase();
  return [b || 'all', t, p].filter(Boolean).join('-');  // ❌ Appends all three
}
```

### After:
```javascript
function buildCombinationKey(base: string, includeType: string, planType: string): string {
  // IMPORTANT: Combination key should ONLY be the base migration path.
  // Include type and plan type are stored separately in the exhibit document.
  // They should NOT be part of the combination key, otherwise exhibits don't group together.
  // Example: Both "Include" and "Not Include" should use "sharefile-to-google-sharedrive"
  const b = normalizeFolderKey(base);
  return b || 'all';  // ✅ Only returns base
}
```

---

## How It Works Now

### Database Storage
Both exhibits are stored with:
- Same **combination key**: `["sharefile-to-google-sharedrive"]`
- Different **planType**: `"standard"`
- Different **includeType**: `"included"` vs `"notincluded"`
- Different **name**: includes the plan and include/not-include in the name

### Example
```javascript
// Exhibit 1
{
  name: "ShareFile to Google Shared Drive Standard Plan - Standard Include",
  combinations: ["sharefile-to-google-sharedrive"],  // SAME KEY
  planType: "standard",                               // Different
  includeType: "included",                            // Different
  ...
}

// Exhibit 2
{
  name: "ShareFile to Google Shared Drive Standard Plan - Standard Not Include",
  combinations: ["sharefile-to-google-sharedrive"],  // SAME KEY
  planType: "standard",                               // Different
  includeType: "notincluded",                        // Different
  ...
}
```

### UI Result
Both exhibits will now show under the **same folder**:

```
📁 ShareFile to Google Shared Drive (4 files)
   ☐ Standard Include
   ☐ Standard Not Include
   ☐ Basic Include
   ☐ Basic Not Include
```

---

## Testing

### Test: Existing Seeded Exhibits
✅ All 4 "ShareFile to Google Shared Drive" exhibits use the **same combination key**:
- ShareFile to Google Shared Drive Standard Plan - Standard Included
- ShareFile to Google Shared Drive Standard Plan - Standard Not Included
- ShareFile to Google Shared Drive Basic Plan - Basic Included
- ShareFile to Google Shared Drive Basic Plan - Basic Not Included

They will group together correctly! ✅

### Test: Future Uploads
When you upload new exhibits using the UI, they will:
1. Use the correct combination key (base only)
2. Store planType and includeType separately
3. Group together automatically with matching combinations

---

## What Stayed the Same

✅ Backend still correctly stores planType and includeType as separate fields  
✅ Exhibit names still include the plan type and include/not-include label  
✅ No changes to database schema  
✅ No changes to backend validation  
✅ All other upload logic remains the same

---

## How to Verify the Fix

### In the UI:
1. Go to Exhibit Manager
2. Look at the "ShareFile to Google Shared Drive" group
3. You should see 4 files in ONE folder (not split across multiple groups)

### Via Database:
```javascript
// All should have the SAME combination:
db.collection('exhibits').find({
  name: {$regex: 'ShareFile.*Google.*Shared Drive'}
})

// All should have:
// combinations: ["sharefile-to-google-sharedrive"]
```

---

## Timeline

**Fixed**: 2026-06-05  
**File Modified**: `src/components/ExhibitManager.tsx` (buildCombinationKey function)  
**Impact**: Upload logic now groups Include/Not Include variants correctly

---

## Next Steps

1. ✅ **Commit fix** - Already committed
2. ✅ **Test with new uploads** - Upload a new exhibit and verify it groups correctly
3. ⚠️ **Optional: Migrate old data** - If old exhibits have malformed combination keys, you may want to fix them (contact dev)

---

## Summary Table

| Aspect | Before (Broken) | After (Fixed) |
|--------|-----------------|---------------|
| Combination Key | `sharefile-to-google-sharedrive-included-standard` | `sharefile-to-google-sharedrive` |
| Grouping | ❌ Include and Not Include split apart | ✅ Include and Not Include together |
| Database Fields | Only in combination key | Stored separately as planType/includeType |
| UI Display | Scattered across multiple groups | Single folder with all variants |
| New Uploads | Will have wrong keys | Will have correct keys |

