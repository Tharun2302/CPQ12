# MongoDB Document Lookup Fix

## 🔍 Problem Identified

**Issue**: Documents were not showing in the approval dashboard even though they exist in MongoDB.

**Root Cause**: Document ID mismatch between workflow and actual document:
- **Workflow expects**: `RenovusAssociatesLLC_JasonWoods_09272`
- **Actual document ID**: `RenovusAssociatesLLC_JasonWoods_95382`

The timestamp portion differs (09272 vs 95382), likely due to:
- Timing differences when workflow was created vs document was saved
- Multiple document saves with different timestamps
- Workflow created before document was fully saved

## ✅ Solution Implemented

### 1. Smart Document Search

Added intelligent fallback search to document endpoints that:
- First tries exact ID match
- If not found, searches by ID pattern (Company_Client_*)
- If still not found, searches by company and clientName fields
- Returns the most recent matching document

### 2. Endpoints Updated

#### `/api/documents/:id/preview` (Line 3634)
- Added smart search fallback
- Searches by ID pattern first
- Falls back to company/clientName search

#### `/api/documents/:id` (Line 2059)
- Added smart search fallback
- Same intelligent matching logic

#### `/api/documents/:id` (Line 4248 - Raw PDF endpoint)
- Added smart search fallback
- Ensures all document fetch methods work

### 3. New Search Endpoint

#### `/api/documents/search` (Line 4284)
- New endpoint for searching documents by clientName and company
- Useful for finding documents when ID is unknown
- Returns up to 5 matching documents

## 🎯 How It Works

### Smart Search Logic

1. **Exact Match**: First tries `findOne({ id: exactId })`
2. **Pattern Match**: If not found, searches for IDs matching pattern:
   - `RenovusAssociatesLLC_JasonWoods_*` (any timestamp)
   - Returns most recent match
3. **Field Match**: If pattern doesn't match, searches by:
   - `company` field contains company name
   - `clientName` field contains client name
   - Returns most recent match

### Example

**Searching for**: `RenovusAssociatesLLC_JasonWoods_09272`

**Step 1**: Exact match → ❌ Not found
**Step 2**: Pattern match `RenovusAssociatesLLC_JasonWoods_*` → ✅ Found `RenovusAssociatesLLC_JasonWoods_95382`
**Result**: Document returned successfully!

## 📊 Verification

Run the diagnostic script to verify:
```bash
node check-document-in-mongodb.cjs RenovusAssociatesLLC_JasonWoods_09272
```

**Expected Output**:
- ✅ Found matching document with similar ID pattern
- Shows the actual document ID that exists
- Confirms document can be found via smart search

## 🚀 Benefits

1. **Automatic Recovery**: Documents are found even with timestamp mismatches
2. **Better UX**: Users see documents instead of 404 errors
3. **Backward Compatible**: Still works with exact matches
4. **Flexible**: Handles various ID format issues

## 🔧 Testing

To test the fix:

1. **Restart the server** to load the new endpoint code
2. **Open a workflow** with a document that has a timestamp mismatch
3. **Click "View"** - the document should now load successfully
4. **Check console logs** - should see "Found matching document" message

## 📝 Notes

- The smart search prioritizes exact matches for performance
- Only falls back to pattern/field search when exact match fails
- Returns the most recent document when multiple matches exist
- All document endpoints now have this smart search capability

---

*Fix Date: [Current Date]*
*Status: ✅ Implemented and Ready for Testing*
