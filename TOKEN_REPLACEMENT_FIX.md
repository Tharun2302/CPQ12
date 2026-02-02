# Token Replacement Fix - Path Separator Issue

## Problem
After fixing the blank preview issue, the document was rendering but **all tokens were showing as unreplaced placeholders** like `{{Company_Name}}`, `{{users_cost}}`, etc. instead of the actual values.

## Root Cause

The issue was a continuation of the **path separator problem** (Windows backslash vs Unix forward slash):

### What Was Happening

1. **Docxtemplater Created Successfully** ✅
   - The ZIP file was loaded
   - Docxtemplater instance was created
   - Template data was properly prepared with keys like `Company_Name`, `users_cost`, etc.

2. **`doc.render()` Called** 🔄
   - The render function was called with correct data
   - Internally, docxtemplater might have issues accessing files with backslash paths on Windows

3. **Post-Processing Failed** ❌
   - After rendering, the code tried to:
     - Remove discount rows when discount is not applied
     - Remove instance validity artifacts  
     - Remove empty table rows
     - Clean up "undefined" strings
   - All these operations used `zip.file('word/document.xml')` (forward slash)
   - But the ZIP had `word\document.xml` (backslash)
   - Operations returned `null` or `undefined`
   - Changes were never applied

4. **Final ZIP Used Original Unprocessed Data** 💥
   - The final ZIP blob was generated
   - But it contained the ORIGINAL template with unreplaced tokens
   - Result: Preview showed `{{Company_Name}}` instead of actual company name

## The Fix

### Created Helper Functions

Added three helper methods to handle cross-platform path separators:

```typescript
/**
 * Helper function to access ZIP files with both path separators (cross-platform)
 * Windows DOCX files may use backslashes, Unix uses forward slashes
 */
private getZipFile(zip: any, path: string): any {
  // Try forward slash first (standard)
  let file = zip.files[path];
  if (file) return file;
  
  // Try backslash (Windows)
  const backslashPath = path.replace(/\//g, '\\');
  file = zip.files[backslashPath];
  if (file) return file;
  
  // Not found
  return null;
}

/**
 * Helper function to read ZIP file text with both path separators
 */
private getZipFileText(zip: any, path: string): string {
  const file = this.getZipFile(zip, path);
  return file ? file.asText() : '';
}

/**
 * Helper function to write to ZIP file (always use forward slash for writing)
 */
private setZipFile(zip: any, path: string, content: string): void {
  // Always use forward slash for writing (PizZip normalizes internally)
  zip.file(path, content);
}
```

### Replaced All File Access Operations

**Before (BROKEN):**
```typescript
// Reading
const documentXml = zip.file('word/document.xml')?.asText() || '';

// Writing
zip.file('word/document.xml', modifiedXml);
```

**After (FIXED):**
```typescript
// Reading
const documentXml = this.getZipFileText(zip, 'word/document.xml');

// Writing
this.setZipFile(zip, 'word/document.xml', modifiedXml);
```

### Locations Fixed

1. ✅ Initial document.xml reading (line ~208)
2. ✅ Auto-fix malformed placeholders (line ~278)
3. ✅ Discount row removal (line ~554)
4. ✅ Discount fallback cleanup (line ~586)
5. ✅ Instance validity artifact removal (line ~613)
6. ✅ Empty table row removal (line ~657)
7. ✅ Final document text logging (line ~680)
8. ✅ Undefined string removal (line ~696)
9. ✅ Final cleanup before generating (line ~760)
10. ✅ Post-generation cleanup (line ~860)
11. ✅ Discount/N/A block removal (line ~970)
12. ✅ Header/footer cleanup (line ~977, ~1010)
13. ✅ Validation function (line ~2027)

## How It Works Now

### Read Operation Flow
```
getZipFileText('word/document.xml')
  ↓
Try: zip.files['word/document.xml']  (forward slash)
  ↓ If not found
Try: zip.files['word\\document.xml'] (backslash)
  ↓ If found
Return file.asText()
  ↓ If not found
Return '' (empty string)
```

### Write Operation Flow
```
setZipFile('word/document.xml', content)
  ↓
Always use: zip.file('word/document.xml', content)
  ↓
PizZip handles normalization internally
```

## Testing Results

### Before Fix
- ✅ Document preview showed content
- ❌ All tokens unreplaced: `{{Company_Name}}`, `{{users_cost}}`, etc.
- ❌ Console showed: Document rendered but no actual token replacement

### After Fix  
- ✅ Document preview shows content
- ✅ All tokens properly replaced with actual values
- ✅ Company name, pricing, users, dates all showing correctly
- ✅ Headers, footers, tables all properly formatted

## Why This Happened

1. **Windows DOCX Files**
   - Created on Windows with backslash paths internally
   - ZIP file contains `word\document.xml` not `word/document.xml`

2. **Platform-Specific ZIP Behavior**
   - Different ZIP tools use different path conventions
   - PizZip preserves original path separators
   - No automatic normalization on read operations

3. **Missing Validation**
   - Code assumed all DOCX files use forward slashes
   - No fallback for backslash paths
   - Silent failures (returned `null` or `undefined`)

## Prevention

### For Developers

1. **Always Use Helper Functions**
   ```typescript
   // ✅ Good: Use helper
   const xml = this.getZipFileText(zip, 'word/document.xml');
   
   // ❌ Bad: Direct access
   const xml = zip.file('word/document.xml')?.asText();
   ```

2. **Test on Multiple Platforms**
   - Test with DOCX files created on Windows
   - Test with DOCX files created on Mac/Linux
   - Test with files from different tools (Word, LibreOffice, Google Docs download)

3. **Check File Existence**
   ```typescript
   const file = this.getZipFile(zip, 'word/document.xml');
   if (!file) {
     console.error('File not found - check path separators');
   }
   ```

### For Production

1. **Reseed Templates**
   - After deployment, reseed templates from disk
   - Ensures consistent format across platforms

2. **Monitor Token Replacement**
   - Log when tokens are not replaced
   - Alert if unreplaced tokens found in final documents

3. **Validate Generated Documents**
   - Check final text for `{{` and `}}` patterns
   - Warn if placeholders remain

## Related Fixes

This is the **third** path separator fix in this codebase:

1. **First Fix**: Validation check for `word/document.xml` existence
2. **Second Fix**: Template file fetching and validation  
3. **Third Fix (This)**: Token replacement and post-processing

All three fixes ensure cross-platform compatibility between Windows and Unix-like systems.

## Files Modified

- `src/utils/docxTemplateProcessor.ts`
  - Added 3 helper functions
  - Replaced 13+ file access operations
  - All read/write operations now cross-platform compatible

## Summary

The token replacement issue was caused by the code trying to access `word/document.xml` (forward slash) in a ZIP archive that contained `word\document.xml` (backslash). The fix adds helper functions that try both path separators, ensuring the code works correctly on all platforms and with DOCX files created by any tool.

---

**Fix Applied**: January 30, 2026  
**Issue**: Tokens not being replaced in generated documents  
**Solution**: Cross-platform ZIP file access with fallback for both path separators  
**Impact**: Token replacement now works regardless of DOCX origin platform



