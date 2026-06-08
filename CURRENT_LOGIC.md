# Current Logic - Exhibit Upload & Grouping (FIXED)

## 🎯 Overall Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    EXHIBIT SYSTEM                          │
└────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    ┌────────┐         ┌────────┐        ┌────────┐
    │ Upload │         │ Exhibit│        │ Exhibit│
    │ Logic  │         │Selector│        │Manager │
    │        │         │  (UI)  │        │ (List) │
    └────────┘         └────────┘        └────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼──────┐
                    │  MongoDB    │
                    │ (Database)  │
                    └─────────────┘
```

---

## 1️⃣ **Upload Logic** (Frontend)

### Location
`src/components/ExhibitManager.tsx` - handleSubmit() function

### Current Process

```
User selects file and fills form
        │
        ▼
┌──────────────────────┐
│ FORM DATA            │
├──────────────────────┤
│ file: <.docx file>   │
│ category: "content"  │
│ combination: "slack  │
│   -to-teams"         │
│ plan: "standard"     │
│ includeType:         │
│   "included"         │
│ displayOrder: 1      │
│ keywords: [...]      │
│ isRequired: false    │
└──────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ COMBINATION KEY BUILDING     │
├──────────────────────────────┤
│ buildCombinationKey(         │
│   "slack-to-teams",          │
│   "included",                │
│   "standard"                 │
│ )                            │
│                              │
│ Returns: "slack-to-teams"    │
│ (ONLY BASE, no plan/include) │
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────┐
│ NAME GENERATION          │
├──────────────────────────┤
│ Base: "Slack to Teams"   │
│ Plan: "Standard"         │
│ Type: "Include"          │
│                          │
│ Result: "Slack to Teams  │
│ Standard Plan -          │
│ Standard Include"        │
└──────────────────────────┘
        │
        ▼
┌──────────────────────────────────┐
│ FORM DATA TO SEND TO BACKEND     │
├──────────────────────────────────┤
│ {                                │
│   file: <binary>,                │
│   name: "Slack to Teams...",     │
│   category: "messaging",         │
│   combinations: [                │
│     "slack-to-teams",            │
│     "all"                        │
│   ],                             │
│   planType: "standard",          │
│   includeType: "included",       │
│   displayOrder: 1,               │
│   keywords: [...],               │
│   isRequired: false              │
│ }                                │
└──────────────────────────────────┘
        │
        ▼
POST /api/exhibits
```

### Key Function: buildCombinationKey()

```javascript
function buildCombinationKey(base, includeType, planType) {
  // FIXED VERSION (CORRECT)
  const b = normalizeFolderKey(base);
  return b || 'all';  // ✅ ONLY RETURNS BASE
}

// Examples:
buildCombinationKey('slack-to-teams', 'included', 'standard')
  → 'slack-to-teams'  ✅

buildCombinationKey('sharefile-to-google-sharedrive', 'notincluded', 'basic')
  → 'sharefile-to-google-sharedrive'  ✅

buildCombinationKey('all', anything, anything)
  → 'all'  ✅
```

**IMPORTANT**: includeType and planType are **NOT** part of the key!

---

## 2️⃣ **Backend Storage** (server.cjs)

### Location
`server.cjs` - POST `/api/exhibits` endpoint (lines 2884-3112)

### Validation Logic

```
POST /api/exhibits
        │
        ▼
┌─────────────────────────────────┐
│ 1. AUTH CHECK                   │
├─────────────────────────────────┤
│ Must be exhibit_admin           │
│ Return 401 if not authorized    │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 2. FILE VALIDATION              │
├─────────────────────────────────┤
│ ✓ File exists                   │
│ ✓ File is .docx only            │
│ ✓ MIME type correct             │
│ Return 400 if invalid           │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 3. METADATA VALIDATION          │
├─────────────────────────────────┤
│ ✓ Category required             │
│ ✓ Plan Type required            │
│   (basic/standard/advanced)     │
│ ✓ Include Type valid            │
│   (included/notincluded)        │
│ ✓ Combinations parsed           │
│ Return 400 if invalid           │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 4. DUPLICATE CHECK              │
├─────────────────────────────────┤
│ Check if fileName already       │
│ exists in MongoDB               │
│ Return 409 if duplicate         │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 5. CREATE EXHIBIT DOCUMENT      │
├─────────────────────────────────┤
│ {                               │
│   name: string,                 │
│   fileName: string,             │
│   fileData: base64,             │
│   category: string,             │
│   combinations: string[],       │
│   planType: string,   ← Stored! │
│   includeType: string,← Stored! │
│   displayOrder: number,         │
│   keywords: string[],           │
│   isRequired: boolean,          │
│   createdAt: Date,              │
│   updatedAt: Date               │
│ }                               │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 6. SAVE TO MONGODB              │
├─────────────────────────────────┤
│ INSERT into exhibits collection │
│ Return 200 with exhibitId       │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ 7. SAVE TO FILESYSTEM (Optional)│
├─────────────────────────────────┤
│ Save to /backend-exhibits/      │
│ (Non-critical - logging only)   │
└─────────────────────────────────┘
```

### MongoDB Document Structure

```javascript
{
  _id: ObjectId("..."),
  
  // Display
  name: "Slack to Teams Standard Plan - Standard Include",
  description: "",
  
  // Grouping (KEY FIELD)
  combinations: [
    "slack-to-teams",  // ← Base combination ONLY
    "all"              // ← Available everywhere
  ],
  
  // Variants (SEPARATE FIELDS)
  planType: "standard",      // ← NOT in combinations
  includeType: "included",   // ← NOT in combinations
  
  // File
  fileName: "slack-to-teams-standard-plan-include.docx",
  fileData: "base64encodeddata...",
  fileType: "application/vnd.openxmlformats...",
  fileSize: 15360,
  
  // Organization
  category: "messaging",
  displayOrder: 1,
  keywords: ["slack", "teams", "standard", "included"],
  isRequired: false,
  
  // Metadata
  createdAt: ISODate("2026-06-05T10:30:00Z"),
  updatedAt: ISODate("2026-06-05T10:30:00Z"),
  version: 1
}
```

**CRITICAL DESIGN**:
- `combinations` contains ONLY the base migration path
- `planType` and `includeType` are SEPARATE fields
- This allows exhibits with same combination but different variants to group together

---

## 3️⃣ **Exhibit Selector Logic** (Frontend)

### Location
`src/components/ExhibitSelector.tsx`

### How It Works

```
API Call: GET /api/exhibits
        │
        ▼
┌──────────────────────────────┐
│ FETCH ALL EXHIBITS           │
├──────────────────────────────┤
│ [                            │
│   {                          │
│     name: "Slack to Teams...",
│     combinations: [          │
│       "slack-to-teams",      │
│       "all"                  │
│     ],                       │
│     planType: "standard",    │
│     includeType: "included", │
│     ...                      │
│   },                         │
│   {                          │
│     name: "Slack to Teams...",
│     combinations: [          │
│       "slack-to-teams",      │
│       "all"                  │
│     ],                       │
│     planType: "standard",    │
│     includeType: "notincluded"│
│     ...                      │
│   },                         │
│   ...                        │
│ ]                            │
└──────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ GROUP BY COMBINATION            │
├─────────────────────────────────┤
│ Map: combination → [exhibits]   │
│                                 │
│ "slack-to-teams" → [           │
│   {name: "...Include", ...},    │
│   {name: "...NotInclude", ...}, │
│ ]                               │
│                                 │
│ RESULT: Same group!             │
└─────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────┐
│ DISPLAY IN UI                    │
├──────────────────────────────────┤
│ 📁 Slack to Teams (2 files)      │
│    ☑ Standard Include            │
│    ☐ Standard Not Include        │
│                                  │
│ 📁 Slack to Google Chat (4 files)│
│    ☐ Basic Include               │
│    ☐ Basic Not Include           │
│    ☐ Standard Include            │
│    ☐ Standard Not Include        │
└──────────────────────────────────┘
```

### Key Logic: Grouping

```javascript
// Group exhibits by combination (base only)
const groups = new Map();
exhibits.forEach(exhibit => {
  const combo = exhibit.combinations[0];  // "slack-to-teams"
  if (!groups.has(combo)) {
    groups.set(combo, []);
  }
  groups.get(combo).push(exhibit);
});

// Result: All variants with same base combination group together
// ✅ Include and NotInclude are in the SAME group
// ✅ Different plans are in the SAME group
```

---

## 4️⃣ **Data Flow Summary**

```
┌─────────────┐
│ USER UPLOADS│
│   EXHIBIT   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ FRONTEND (ExhibitManager.tsx)    │
├─────────────────────────────────┤
│ 1. User fills form              │
│ 2. buildCombinationKey():       │
│    Input: base + plan + include │
│    Output: base ONLY            │
│ 3. Generate name from all 3     │
│ 4. Send to backend              │
└──────┬──────────────────────────┘
       │
       ▼
    POST /api/exhibits
       │
       ▼
┌──────────────────────────────────┐
│ BACKEND (server.cjs)             │
├──────────────────────────────────┤
│ 1. Validate auth, file, metadata │
│ 2. Check for duplicates          │
│ 3. Store in MongoDB:             │
│    - combinations: ["base"]      │
│    - planType: "standard"        │
│    - includeType: "included"     │
│ 4. Return exhibitId              │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ DATABASE (MongoDB)           │
├──────────────────────────────┤
│ exhibits collection:         │
│ {                            │
│   _id: ObjectId(...),        │
│   combinations: ["base"],    │
│   planType: "standard",      │
│   includeType: "included",   │
│   name: "...",               │
│   ...                        │
│ }                            │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ EXHIBIT SELECTOR (ExhibitUI) │
├──────────────────────────────┤
│ 1. Fetch all exhibits        │
│ 2. Group by combination      │
│ 3. Display grouped           │
│                              │
│ Result:                      │
│ 📁 Group 1 (same base)       │
│    - Include variant         │
│    - NotInclude variant      │
│    - All plans               │
│                              │
│ ✅ All grouped together!     │
└──────────────────────────────┘
```

---

## 5️⃣ **Three-Field Design**

### The Correct Pattern

```
┌─────────────────────────────────────────────────────┐
│              EXHIBIT DOCUMENT                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────┐                   │
│  │ combinations (GROUPING)     │                   │
│  ├─────────────────────────────┤                   │
│  │ Purpose: Group related      │                   │
│  │ Value: ["slack-to-teams"]   │                   │
│  │ Used by: Exhibit Selector   │                   │
│  └─────────────────────────────┘                   │
│                                                     │
│  ┌─────────────────────────────┐                   │
│  │ planType (VARIANT 1)        │                   │
│  ├─────────────────────────────┤                   │
│  │ Purpose: Which plan tier    │                   │
│  │ Value: "standard"           │                   │
│  │ Used by: Filtering, Name    │                   │
│  └─────────────────────────────┘                   │
│                                                     │
│  ┌─────────────────────────────┐                   │
│  │ includeType (VARIANT 2)     │                   │
│  ├─────────────────────────────┤                   │
│  │ Purpose: What's included    │                   │
│  │ Value: "included"           │                   │
│  │ Used by: Filtering, Name    │                   │
│  └─────────────────────────────┘                   │
│                                                     │
│  ┌─────────────────────────────┐                   │
│  │ name (DISPLAY)              │                   │
│  ├─────────────────────────────┤                   │
│  │ Purpose: What user sees     │                   │
│  │ Value: "Slack to Teams...   │                   │
│  │         Standard Plan -     │                   │
│  │         Standard Include"   │                   │
│  │ Contains: All three concerns│                   │
│  └─────────────────────────────┘                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Each Field's Purpose

| Field | Purpose | Scope | Value |
|-------|---------|-------|-------|
| `combinations` | **Grouping** - Which folder exhibits appear in | Global (all users) | `["slack-to-teams"]` |
| `planType` | **Variant** - Which tier (Basic/Standard/Advanced) | Per-tier | `"standard"` |
| `includeType` | **Variant** - What's included (Included/NotIncluded) | Per-variant | `"included"` |
| `name` | **Display** - What user sees in UI | User-facing | `"Slack to Teams Standard Plan - Standard Include"` |

---

## 6️⃣ **Example: Two Exhibits Same Combination**

### Upload 1: Include Variant
```javascript
Input Form:
  combination: "slack-to-teams"
  planType: "standard"
  includeType: "included"

buildCombinationKey() Result:
  "slack-to-teams"  ← SAME KEY

Stored in MongoDB:
  {
    name: "Slack to Teams Standard Plan - Standard Include",
    combinations: ["slack-to-teams"],
    planType: "standard",
    includeType: "included",
    ...
  }
```

### Upload 2: Not Include Variant
```javascript
Input Form:
  combination: "slack-to-teams"
  planType: "standard"
  includeType: "notincluded"

buildCombinationKey() Result:
  "slack-to-teams"  ← SAME KEY! ✅

Stored in MongoDB:
  {
    name: "Slack to Teams Standard Plan - Standard Not Include",
    combinations: ["slack-to-teams"],
    planType: "standard",
    includeType: "notincluded",
    ...
  }
```

### Result in Exhibit Selector
```
✅ GROUPED TOGETHER!

📁 Slack to Teams (2 files)
   ☑ Standard Include
   ☐ Standard Not Include
```

---

## 7️⃣ **What Changed (Before vs After)**

### BEFORE (BUGGY) ❌
```javascript
buildCombinationKey("slack-to-teams", "included", "standard")
  → "slack-to-teams-included-standard"  ❌

buildCombinationKey("slack-to-teams", "notincluded", "standard")
  → "slack-to-teams-notincluded-standard"  ❌

Result: DIFFERENT KEYS - WON'T GROUP
```

### AFTER (FIXED) ✅
```javascript
buildCombinationKey("slack-to-teams", "included", "standard")
  → "slack-to-teams"  ✅

buildCombinationKey("slack-to-teams", "notincluded", "standard")
  → "slack-to-teams"  ✅

Result: SAME KEY - WILL GROUP
```

---

## Summary

**Our Current Logic**:

1. **Upload**: Combination key = BASE ONLY (no plan/include type)
2. **Storage**: planType and includeType stored as separate fields
3. **Display**: Name includes all three (for user clarity)
4. **Grouping**: Group by combination (base only) in UI
5. **Result**: All variants of same migration grouped together ✅

**Why This Works**:
- Matches backend design (separate fields)
- Matches seed data pattern (same keys for variants)
- Allows proper grouping and filtering
- Scalable and maintainable
