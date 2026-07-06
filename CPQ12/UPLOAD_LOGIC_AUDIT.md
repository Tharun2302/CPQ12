# Upload Exhibit Logic - Complete Audit

## ✅ WORKING COMPONENTS

### Frontend Validation
- ✅ **File Selection**: User can select .docx file from system
- ✅ **Category Dropdown**: messaging, content, email options
- ✅ **Combination/Folder Selection**: Predefined combinations dropdown
- ✅ **Custom Combination**: Option to create new combination
- ✅ **Plan Type** (Required): basic, standard, advanced - ENFORCED at line 373-376
- ✅ **Include Type** (Required): included/notincluded - ENFORCED at line 362-365
- ✅ **Display Order**: Numeric field with default 999
- ✅ **Keywords**: Array of tags
- ✅ **Is Required**: Checkbox flag

### Frontend Error Handling
- ✅ File existence check (line 356-359)
- ✅ Include type validation (line 362-365)
- ✅ Category validation (line 367-370)
- ✅ Plan type validation (line 373-376)
- ✅ Folder selection validation (line 379-387)
- ✅ Form data creation (line 485-495)
- ✅ Upload error/success state management
- ✅ Clear error messages to user

### Backend Validation
- ✅ **Auth Check**: Only exhibit admins can upload (line 2893-2894)
- ✅ **File Exists**: Check if file uploaded (line 2896-2901)
- ✅ **File Type Validation**: DOCX only (line 2903-2914)
- ✅ **Category Required**: Must be provided (line 2930-2935)
- ✅ **Plan Type Required**: Must be basic/standard/advanced (line 2937-2952)
- ✅ **Include Type Validation**: included or notincluded (line 2954-2958)
- ✅ **Combinations Parsing**: Convert string/array properly (line 2960-2972)
- ✅ **Keywords Parsing**: Handle string or array (line 2993-3005)
- ✅ **Duplicate Check**: Prevent duplicate filenames (line 3041-3052)
- ✅ **File Size Check**: Stored with metadata (line 3028)
- ✅ **Base64 Encoding**: Convert file for storage (line 3007-3008)

### Backend Storage
- ✅ **MongoDB Insert**: Creates exhibit document (line 3066)
- ✅ **Filesystem Backup**: Saves to /backend-exhibits/ (line 3068-3112)
- ✅ **Error Handling**: Non-critical FS errors don't fail upload (line 3097-3112)
- ✅ **Metadata Preservation**: All fields stored properly
- ✅ **Timestamps**: createdAt, updatedAt set automatically
- ✅ **Version Tracking**: version: 1 set

### Response Handling
- ✅ **Success Response**: Returns exhibitId and exhibit data
- ✅ **Error Response**: Includes helpful error messages
- ✅ **Status Codes**: Proper HTTP codes (200, 400, 409, 503)

### Auto-Fix Logic
- ✅ **Name Generation Fallback**: Auto-generates from combination if not provided (line 2974-2991)
- ✅ **Display Name Auto-Fix**: Converts "slack-to-teams" to "Slack to Teams"
- ✅ **Include Type Auto-Derive**: Detects from combination if not set (line 3010-3019)

### UI Features
- ✅ **Upload Button**: "Upload Exhibit" button visible to admins
- ✅ **Modal Form**: Modal dialog with form fields
- ✅ **Upload Guide**: Instructions and help text
- ✅ **Success Message**: Toast notification on success
- ✅ **Error Display**: Toast notification on error
- ✅ **Loading State**: isUploading flag prevents double submission

---

## ⚠️ POTENTIAL ISSUES & GAPS

### 1. **Combination Key Building Logic** 🔴 INCONSISTENT
**Location**: Frontend ExhibitManager.tsx line 74-79
```javascript
function buildCombinationKey(base: string, includeType: string, planType: string): string {
  const b = normalizeFolderKey(base);
  const t = String(includeType || '').toLowerCase();
  const p = String(planType || '').toLowerCase();
  return [b || 'all', t, p].filter(Boolean).join('-');
}
```

**Issue**: This creates keys like:
- `sharefile-to-google-sharedrive-included-standard`

But backend expects:
- `['sharefile-to-google-sharedrive', 'all']` (array in combinations)

**Result**: Combination sent to backend is WRONG format!

**Evidence**: Line 490 shows:
```javascript
formDataToSend.append('combinations', JSON.stringify([finalCombination || 'all']));
```

But `finalCombination` is like `"sharefile-to-google-sharedrive-included-standard"` not `"sharefile-to-google-sharedrive"`

---

### 2. **Combination Key Not Used Consistently** 🔴 MAJOR BUG
**Locations**:
- Line 420-424: Builds `finalCombination` with includeType & planType appended
- Line 490: Sends this malformed key to backend

**Backend Expectation** (line 2960-2972):
- Expects combinations to be like: `['sharefile-to-google-sharedrive']`
- Allows 'all' as catch-all

**What Frontend Actually Sends**:
- `['sharefile-to-google-sharedrive-included-standard']`

**Impact**: 
- Exhibits grouped incorrectly
- Difficult to filter by combination
- Breaking the combination-based grouping in ExhibitSelector

**Fix Needed**:
```javascript
// WRONG:
const finalCombination = buildCombinationKey(
  combinationSource || cleanFolderName || formData.combination || '',
  formData.includeType,
  formData.plan
);

// CORRECT:
const finalCombination = combinationSource || cleanFolderName || formData.combination || '';
// planType and includeType should be stored separately, NOT appended to combination key
```

---

### 3. **Name Generation Logic is Over-Complicated** 🟡 CODE SMELL
**Locations**:
- Frontend: Line 428-481 (54 lines of complex logic)
- Backend: Line 2974-2991 (fallback generation)

**Issue**: Two different name generation algorithms (frontend + backend)

**Concern**: If frontend fails to generate name, backend tries again differently

**Example Mismatch**:
```javascript
// Frontend generates:
"ShareFile to Google Shared Drive Standard Plan - Standard Include"

// Backend might generate:
"Sharefile Google Shared Drive"

// They're inconsistent!
```

---

### 4. **Missing Field: Description** 🟡 OPTIONAL BUT EMPTY
**Location**: Line 488 in backend
```javascript
formDataToSend.append('description', ''); // Empty description
```

**Issue**: 
- Description always empty
- No user input for description
- Field exists in schema but always null/empty

**Should Either**:
- ✓ Add description input to form, OR
- ✓ Remove from schema entirely

---

### 5. **Include Type Logic is Scattered** 🟡 CONFUSING
**Locations**:
- Frontend line 362-365: Validation
- Frontend line 470: Label generation
- Backend line 2954-3019: Parsing & auto-derive
- Database: Stored as `includeType` field

**Issues**:
- Include type affects name generation (not stored separately in name)
- Include type used to build combination key (wrong!)
- Include type auto-derived if not set (good!) but can conflict

**Question**: Should includeType be:
- Part of the combination key? NO, it's a separate semantic
- Part of the exhibit name? YES, already done
- Separately stored? YES, already done at line 3032

---

### 6. **Display Order Default is Hard-Coded** 🟡 NOT IDEAL
**Location**: Line 139 & 493
```javascript
displayOrder: 999,  // Default hard-coded
formDataToSend.append('displayOrder', formData.displayOrder.toString());
```

**Issue**:
- New exhibits always get 999 (last place)
- Not sorted relative to existing exhibits
- User can't set order via UI slider

**Good Practice**: Should be:
- Get max displayOrder from existing exhibits
- Default to max + 1
- Or provide UI slider for ordering

---

### 7. **File Size Not Validated** 🟡 MISSING
**Location**: Backend line 2896-2914 (file type validation)

**Missing**:
```javascript
// Should add:
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
if (req.file.size > MAX_FILE_SIZE) {
  return res.status(400).json({
    success: false,
    error: `File too large. Maximum size is 50MB. Your file is ${(req.file.size / 1024 / 1024).toFixed(2)}MB.`
  });
}
```

---

### 8. **No Validation for Exhibit Name Length** 🟡 MISSING
**Issue**: No max length check for exhibit name

**Should Add**:
```javascript
if (finalName.length > 255) {
  return res.status(400).json({
    success: false,
    error: 'Exhibit name too long. Maximum 255 characters.'
  });
}
```

---

### 9. **Keywords Not Validated** 🟡 MISSING
**Issue**: Keywords array can be huge or contain invalid values

**Should Add**:
```javascript
if (keywordsArray.length > 50) {
  return res.status(400).json({
    success: false,
    error: 'Too many keywords. Maximum 50 allowed.'
  });
}

if (keywordsArray.some(k => k.length > 100)) {
  return res.status(400).json({
    success: false,
    error: 'Keyword too long. Maximum 100 characters per keyword.'
  });
}
```

---

### 10. **No Validation for Combination Value** 🔴 MAJOR ISSUE
**Location**: Backend line 2960-2972 (combinations parsing)

**Missing**: No check that combination is a valid/known migration path

**Should Add**:
```javascript
const VALID_COMBINATIONS = [
  'sharefile-to-google-sharedrive',
  'dropbox-to-onedrive',
  'slack-to-teams',
  // ... all valid combinations
];

if (combinationsArray.length > 0 && combinationsArray[0] !== 'all') {
  if (!VALID_COMBINATIONS.includes(combinationsArray[0])) {
    return res.status(400).json({
      success: false,
      error: `Invalid combination: ${combinationsArray[0]}`
    });
  }
}
```

---

### 11. **No Rate Limiting on Upload** 🟡 MISSING
**Issue**: User can upload unlimited files rapidly

**Should Add**: Rate limiting middleware
```javascript
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 uploads per user per 15 min
  keyGenerator: (req) => req.user?.email || req.ip
});

app.post('/api/exhibits', uploadLimiter, upload.single('file'), async (req, res) => {
  // ... rest of code
});
```

---

### 12. **No Logging for Audit Trail** 🟡 MISSING
**Issue**: No record of who uploaded what and when

**Should Add**:
```javascript
const auditLog = {
  action: 'exhibit_uploaded',
  uploadedBy: authUser.email,
  exhibitId: result.insertedId,
  exhibitName: finalName,
  fileName: req.file.originalname,
  category: category,
  timestamp: new Date(),
  ipAddress: req.ip
};

await db.collection('audit_logs').insertOne(auditLog);
```

---

### 13. **File Encoding Issues** 🟡 POTENTIAL ISSUE
**Location**: Backend line 3007-3008
```javascript
const fileData = req.file.buffer.toString('base64');
```

**Concern**: 
- Large files (50MB) → Large base64 strings (~66MB)
- Stored in MongoDB → Could exceed document size limit (16MB max!)
- Not practical for large DOCX files

**Better Approach**: Store file in GridFS or S3, store only ID in MongoDB

---

### 14. **Missing Field: Creator/Author** 🟡 GOOD TO HAVE
**Issue**: No way to know which admin created the exhibit

**Should Add**:
```javascript
const exhibitDoc = {
  // ... existing fields
  createdBy: authUser.email,
  createdById: authUser._id,
  // ... rest
};
```

---

### 15. **No Validation of Plan Type Case** 🟡 MINOR
**Location**: Backend line 2947
```javascript
if (!validPlanTypes.includes(planType.toLowerCase())) {
  // This is good - converts to lowercase
}
```

**But Frontend** (line 458, 469):
```javascript
const planType = formData.plan || '';
const planLabel = planType ? planType.charAt(0).toUpperCase() + planType.slice(1) : '';
```

**Issue**: 
- Frontend sends "standard" (lowercase)
- Frontend displays "Standard" (capitalized)
- Good, but could be more consistent

---

## 🔴 CRITICAL BUGS TO FIX

### Bug #1: Combination Key Format Mismatch
**Severity**: CRITICAL
**File**: src/components/ExhibitManager.tsx line 420-424
**Problem**: Frontend builds combination key with includeType & planType appended
**Solution**: Remove the includeType and planType from combination building
```javascript
// CURRENT (WRONG):
const finalCombination = buildCombinationKey(combinationSource, includeType, planType);
// Result: "sharefile-to-google-sharedrive-included-standard"

// SHOULD BE:
const finalCombination = combinationSource || '';
// Result: "sharefile-to-google-sharedrive"
// Include/Plan types handled separately
```

### Bug #2: Missing Combination Validation
**Severity**: CRITICAL  
**File**: server.cjs line 2960-2972
**Problem**: No validation that combination is valid
**Solution**: Add whitelist check for valid combinations

### Bug #3: No File Size Limit
**Severity**: HIGH
**File**: server.cjs line 2896-2914
**Problem**: Can upload arbitrarily large files
**Solution**: Add MAX_FILE_SIZE validation (suggest 50MB)

### Bug #4: Base64 Encoding for Large Files
**Severity**: HIGH
**File**: server.cjs line 3007-3008
**Problem**: MongoDB 16MB document size limit
**Solution**: Use GridFS or external storage for files > 1MB

---

## 📋 COMPREHENSIVE FIX CHECKLIST

- [ ] Fix combination key building (remove includeType/planType from key)
- [ ] Add combination validation (whitelist check)
- [ ] Add file size limit (50MB)
- [ ] Use GridFS for files > 1MB
- [ ] Add exhibit name length validation (max 255)
- [ ] Add keywords validation (max 50, max 100 chars each)
- [ ] Add rate limiting (50 uploads / 15min per user)
- [ ] Add audit logging (who, what, when)
- [ ] Add createdBy field to exhibit doc
- [ ] Add description field to upload form (or remove from schema)
- [ ] Improve display order default (auto-increment)
- [ ] Add comprehensive error messages
- [ ] Add input sanitization (XSS protection)
- [ ] Add request validation middleware

---

## 🧪 TESTING RECOMMENDATIONS

### Unit Tests
- [ ] Test combination key generation (without includeType/planType)
- [ ] Test name generation with all combinations
- [ ] Test plan type validation (basic/standard/advanced only)
- [ ] Test include type validation (included/notincluded only)
- [ ] Test file size validation

### Integration Tests
- [ ] Upload valid DOCX file
- [ ] Upload duplicate filename (should fail)
- [ ] Upload without auth (should fail 401)
- [ ] Upload without plan type (should fail)
- [ ] Upload without include type (should fail)
- [ ] Upload with invalid combination (should fail)
- [ ] Upload and verify exhibit appears in selector
- [ ] Upload with custom combination

### Edge Cases
- [ ] Very large DOCX file (50MB)
- [ ] DOCX file with special characters in filename
- [ ] Exhibit name with special characters
- [ ] Keywords with special characters
- [ ] Rapid sequential uploads (rate limiting)
- [ ] Upload after seeding (no duplicate filename)

---

## 📊 SUMMARY

| Category | Status | Count |
|----------|--------|-------|
| ✅ Working | Good | 20+ |
| ⚠️ Issues | Minor | 8 |
| 🔴 Bugs | Critical | 4 |
| **Total** | **Mixed** | **32+** |

**Overall Assessment**: The upload logic is 70% complete and functional, but has 4 critical bugs and 8 minor issues that should be fixed before production use.

**Priority Fixes**:
1. Fix combination key format (CRITICAL - blocks grouping)
2. Add combination validation (CRITICAL - accepts invalid combos)
3. Add file size limit (HIGH - prevents large file issues)
4. Use GridFS for large files (HIGH - prevents DB corruption)
