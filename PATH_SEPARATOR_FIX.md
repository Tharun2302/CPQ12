# Path Separator Fix for DOCX Files

## Issue
After implementing the initial fix, we discovered another issue:

```
❌ DOCX validation failed. Available files in ZIP: word\document.xml, ...
Error: Invalid DOCX file: missing word/document.xml
```

## Root Cause
The validation code was checking for `word/document.xml` (forward slash) but the ZIP archive contained `word\document.xml` (backslash).

This happens because:
1. **Windows ZIP archives** may use backslashes (`\`) in internal paths
2. **Unix/Mac ZIP archives** use forward slashes (`/`) in internal paths
3. **PizZip library** can read both formats but stores paths as-is
4. The validation code only checked for forward slashes

## The Fix

### Before
```typescript
if (!zip.files['word/document.xml']) {
  throw new Error('Invalid DOCX file: missing word/document.xml');
}

const documentXml = zip.files['word/document.xml'].asText();
```

### After
```typescript
// Check for both path separators
const hasDocumentXml = zip.files['word/document.xml'] || zip.files['word\\document.xml'];

if (!hasDocumentXml) {
  throw new Error('Invalid DOCX file: missing word/document.xml');
}

// Get the file with the correct separator
const documentXmlFile = zip.files['word/document.xml'] || zip.files['word\\document.xml'];
const documentXml = documentXmlFile.asText();
```

## Files Updated

1. **src/utils/docxTemplateProcessor.ts**
   - ✅ Updated validation to check both path separators
   - ✅ Updated all file access to handle both separators
   - ✅ Added helper variable to avoid repeated lookups

2. **validate-templates.cjs**
   - ✅ Updated validation script to check both path separators

## Technical Details

### Why This Happens

DOCX files are ZIP archives. The ZIP format specification doesn't mandate a specific path separator. Different ZIP tools use different conventions:

- **Windows tools** (e.g., System.IO.Compression in .NET) → Use backslashes
- **Unix/Mac tools** (e.g., zip command) → Use forward slashes
- **Microsoft Office** → Uses forward slashes
- **LibreOffice** → Can use either depending on platform

### ZIP Path Normalization

PizZip doesn't automatically normalize paths because:
1. It preserves the original ZIP structure
2. Both separators are valid in ZIP files
3. Some ZIP files may have both formats (rare but possible)

### Best Practice

Always check for both separators when accessing ZIP files:

```typescript
// ✅ Good: Cross-platform compatible
const file = zip.files['word/document.xml'] || zip.files['word\\document.xml'];

// ❌ Bad: Only works with forward slashes
const file = zip.files['word/document.xml'];

// ❌ Bad: Only works with backslashes
const file = zip.files['word\\document.xml'];
```

### Writing Files

When **writing** to ZIP files with PizZip, always use forward slashes:

```typescript
// ✅ Good: PizZip normalizes this internally
zip.file('word/document.xml', content);

// ❌ Avoid: May cause issues on some platforms
zip.file('word\\document.xml', content);
```

## Testing

### Test Case 1: Windows-Created DOCX
```
Files: word\document.xml, word\styles.xml
Result: ✅ Should work now
```

### Test Case 2: Mac/Linux-Created DOCX
```
Files: word/document.xml, word/styles.xml
Result: ✅ Should work now
```

### Test Case 3: Office-Created DOCX
```
Files: word/document.xml, word/styles.xml
Result: ✅ Should work now
```

### Test Case 4: LibreOffice-Created DOCX (Windows)
```
Files: word\document.xml, word\styles.xml
Result: ✅ Should work now
```

## Prevention

To avoid similar issues in the future:

1. **Always check both path separators** when accessing ZIP files
2. **Use forward slashes** when writing to ZIP files
3. **Test on multiple platforms** (Windows, Mac, Linux)
4. **Test with files from different tools** (Word, LibreOffice, etc.)

## Related Issues

This same issue could affect:
- ✅ Template validation (FIXED)
- ✅ Document processing (FIXED)
- ✅ Validation script (FIXED)
- ⚠️ Exhibit processing (check if needed)
- ⚠️ Any other ZIP file handling (check if needed)

## Verification

Run these commands to verify the fix:

```bash
# 1. Run validation script
node validate-templates.cjs

# 2. Check that templates pass validation
# Should see: ✅ Valid DOCX structure

# 3. Try generating agreement
# Should work without path separator errors
```

## Platform-Specific Notes

### Windows
- ZIP files created by Windows tools typically use backslashes
- ZIP files downloaded from the internet typically use forward slashes
- Both formats should now work correctly

### Mac/Linux
- ZIP files typically use forward slashes
- Should work without issues
- Can still read Windows-created DOCX files

### Docker/Linux Containers
- Uses forward slashes for paths
- Can read both ZIP formats
- May create ZIP files with forward slashes

## Summary

The fix ensures cross-platform compatibility by checking for both path separator formats when accessing files within DOCX (ZIP) archives. This resolves issues where templates created on Windows couldn't be processed due to backslash separators in the ZIP structure.

---

**Fix Applied**: January 30, 2026
**Issue**: Path separator mismatch in ZIP file validation
**Solution**: Check for both forward slash and backslash separators
**Impact**: Templates now work regardless of creation platform



