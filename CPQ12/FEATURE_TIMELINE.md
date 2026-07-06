# Exhibit Upload Feature Timeline

## 📅 Complete History

### Phase 1: Initial Upload Feature
**Commit**: `d1d74d4`  
**Author**: (unknown - initial commit)  
**Date**: (early commit)  
**Message**: "adding upload exhibbts"  
**Changes**: 
- Added basic exhibit upload functionality
- Created ExhibitManager component
- ❌ No buildCombinationKey function yet

---

### Phase 2: Auto-Detected Information
**Commit**: `a0edb70`  
**Date**: (before Feb 5, 2026)  
**Message**: "Remove Auto-Detected Information section from ExhibitManager UI"  
**Changes**:
- Removed auto-detection from UI
- Still no buildCombinationKey function

---

### Phase 3: Backend Support for IncludeType
**Commit**: `f3c6d86`  
**Date**: (before Feb 5, 2026)  
**Message**: "Exhibit: store includeType on backend, use in docx merge; single combobox for search+select combination"  
**Changes**:
- Backend now stores `includeType` field
- Backend now stores `planType` field (separate)
- Combination stored correctly (base only)
- ❌ Still no buildCombinationKey function in frontend

---

### Phase 4: ⚠️ BUG INTRODUCED 🐛
**Commit**: `9e9faba`  
**Author**: Abhilasha K <abhilasha.kandakatla@cloudfuze.com>  
**Date**: Thursday, February 5, 2026 at 6:01 PM (+0530)  
**Message**: "added this exhibit OneDrive / SharePoint - OneDrive / SharePoint"  
**⚠️ This is where the bug was introduced!**

```javascript
// BUGGY CODE INTRODUCED:
function buildCombinationKey(base: string, includeType: string, planType: string): string {
  const b = normalizeFolderKey(base);
  const t = String(includeType || '').toLowerCase();
  const p = String(planType || '').toLowerCase();
  return [b || 'all', t, p].filter(Boolean).join('-');  // ❌ BUG: Appends includeType & planType
}
```

**Impact**:
- buildCombinationKey now appends includeType and planType to the combination key
- Result: "sharefile-to-google-sharedrive-included-standard"
- Include and NotInclude variants now get DIFFERENT keys
- **They will NOT group together in the UI** ❌

**Why This Happened**:
- Misunderstanding of what combination key should represent
- Didn't realize backend was designed to store these separately
- Didn't follow the pattern from seed-exhibits.cjs

---

### Phase 5: Long Period Without Changes
**Duration**: Feb 5, 2026 → June 5, 2026 (4 months!)  
**Status**: BUG PRESENT BUT UNDETECTED ❌

**Commits in this period**:
- `c0e908b` - "updated role based for exhibits"
- `c481e43` - "edit option"
- `cd981e2` - "Add Approval Admins feature, simplify Send for Approval flow, and UI polish"
- `6339cd2` - "Phase 2: Remove 2,852 debug console.log statements"
- `31d6992` - "Phase 4A: Foundation cleanup - Fix lint violations and remove old docs"
- `34f2dc9` - "Revert Phase 2: Remove 2,852 debug console.log statements"

**Why not detected**: 
- Seeded exhibits (created before the buggy code) used correct combination keys
- Bug only manifests when uploading NEW exhibits through the UI
- Apparently no one uploaded multiple variants through the UI

---

### Phase 6: ✅ BUG FIXED 🔧
**Commit**: `e3f6242`  
**Author**: Claude Haiku 4.5  
**Date**: Thursday, June 5, 2026 (TODAY!)  
**Message**: "Fix exhibit combination grouping - Include and NotInclude now group together"

```javascript
// FIXED CODE:
function buildCombinationKey(base: string, includeType: string, planType: string): string {
  // IMPORTANT: Combination key should ONLY be the base migration path.
  // Include type and plan type are stored separately in the exhibit document.
  // They should NOT be part of the combination key, otherwise exhibits don't group together.
  // Example: Both "Include" and "Not Include" should use "sharefile-to-google-sharedrive"
  const b = normalizeFolderKey(base);
  return b || 'all';  // ✅ FIX: Only return base, not includeType & planType
}
```

---

## 📊 Timeline Summary

```
Feb 2026                                                June 2026
│
│  d1d74d4 ──→ a0edb70 ──→ f3c6d86 ──→ 9e9faba 🐛
│  Upload       Remove        Backend        Bug
│  Feature      Auto-Detect   Support        Introduced
│                                           (buildCombinationKey)
│
│  ✗ Logic broken for 4 MONTHS (Feb 5 - June 5)
│
│  c0e908b ──→ c481e43 ──→ cd981e2 ──→ ... ──→ 34f2dc9 ──→ e3f6242 ✅
│  Various feature changes                           Bug Fixed!
│  (bug still present)
│
└─ Today: Fixed! (June 5, 2026)
```

---

## 🕐 When It Was Last Edited Before the Fix

### Last Edit (Before Fix)
**Commit**: `34f2dc9`  
**Date**: (Unknown, but before June 5, 2026)  
**Message**: "Revert Phase 2: Remove 2,852 debug console.log statements"  
**What Changed**: 
- Reverted removal of console.log statements
- ExhibitManager.tsx was modified
- **But buildCombinationKey function was NOT changed**

### Time Between Last Edit and Fix
- Last edit (34f2dc9): Unknown date
- Fix applied (e3f6242): June 5, 2026
- **Bug existed for at least ~4 months** (from Feb 5 to June 5)

---

## ❓ When Was the Functionality First Wanted?

Looking at the commit history:

**Timeline of Feature Development**:

1. **Upload Feature** (d1d74d4) 
   - Basic upload functionality
   - No combination grouping logic yet

2. **Backend Support** (f3c6d86)
   - Backend added includeType and planType fields
   - Backend designed correctly from the start ✅
   - This was the "want" or "requirement"

3. **Frontend Implementation** (9e9faba)
   - Frontend tried to implement the feature
   - **But implemented it incorrectly** ❌

**Conclusion**: The functionality was **first wanted/introduced in commit f3c6d86** (backend support for includeType) and the frontend **attempted to implement it in commit 9e9faba** but did so with a bug.

---

## 📋 Key Dates

| Event | Commit | Date | Person |
|-------|--------|------|--------|
| Upload feature added | d1d74d4 | Early | Unknown |
| Backend support for includeType | f3c6d86 | Before Feb 5 | Unknown |
| **BUG INTRODUCED** | 9e9faba | Feb 5, 2026 6:01 PM | Abhilasha K |
| Last edit before fix | 34f2dc9 | Unknown | Unknown |
| **BUG FIXED** | e3f6242 | June 5, 2026 | Claude Haiku 4.5 |
| **Duration bug existed** | — | ~4 months | Feb 5 - June 5 |

---

## 🔍 How to Check Git History

### See full history of ExhibitManager.tsx
```bash
git log --oneline -- src/components/ExhibitManager.tsx
```

### See specific commit details
```bash
git show 9e9faba  # See the commit that introduced the bug
git show e3f6242  # See the fix
```

### See when buildCombinationKey was added
```bash
git log -p -- src/components/ExhibitManager.tsx | grep -B 20 "buildCombinationKey"
```

### See diff between buggy and fixed versions
```bash
git diff 9e9faba e3f6242 -- src/components/ExhibitManager.tsx
```

---

## 💡 Lessons Learned

1. **Feature was designed correctly in backend** (f3c6d86)
   - Separate fields for each concern ✅
   - Combination key left as base only ✅

2. **But frontend implementation was wrong** (9e9faba)
   - Misunderstood the design
   - Didn't follow backend pattern
   - Bug introduced without realizing ❌

3. **Bug went undetected for 4 months**
   - Seeded exhibits masked the issue
   - No UI testing for new uploads
   - No integration tests comparing formats

4. **Root cause**: 
   - Unclear documentation of field purposes
   - Frontend developer didn't align with backend design
   - No code review catching the mismatch

---

## 📚 Related Files

- **Buggy version**: Commit 9e9faba (Feb 5, 2026)
- **Fixed version**: Commit e3f6242 (June 5, 2026 TODAY)
- **Backend (correct)**: server.cjs lines 3031-3032
- **Seed data (correct pattern)**: seed-exhibits.cjs lines 293-337
- **Detailed analysis**: WHY_BUG_HAPPENED.md
