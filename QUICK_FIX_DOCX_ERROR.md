# Quick Fix: DOCX Template Error

## Error Messages

### Error 1: Missing word/document.xml
```
DOCX template processing failed: Error: Invalid DOCX file: missing word/document.xml
```

### Error 2: Path Separator Issue (FIXED)
```
❌ DOCX validation failed. Available files in ZIP: word\document.xml, ...
Error: Invalid DOCX file: missing word/document.xml
```

If you see `word\document.xml` in the available files but still get the "missing" error, this is the **path separator bug** which has been fixed in the latest version.

## Quick Fix Steps

### Step 1: Run Template Validation (1 minute)
```bash
node validate-templates.cjs
```

This will identify which templates are corrupted.

### Step 2: Reseed Templates from Disk (1 minute)
If templates in `backend-templates/` are valid, reseed the database:

**Option A: Via API**
```bash
curl -X POST http://localhost:5000/api/templates/reseed
```

**Option B: Via Node Script**
```bash
node seed-templates.cjs
```

### Step 3: Clear Browser Cache
1. Open browser DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"
4. Or clear browser cache manually

### Step 4: Re-select Template
1. In the CPQ application
2. Go to template selection
3. Click on your template again to reload it
4. Try generating agreement again

## Alternative Solutions

### If Step 2 Doesn't Work: Check Disk Files

#### Validate a DOCX file manually:
```bash
# Check if file is a valid ZIP (DOCX is a ZIP archive)
unzip -t backend-templates/your-template.docx

# Or use 7-Zip on Windows
7z l backend-templates/your-template.docx
```

#### Re-save DOCX properly:
1. Open the DOCX file in Microsoft Word or LibreOffice
2. File → Save As → Word Document (.docx)
3. Save with a new name
4. Replace the old file
5. Run reseed again

### If Reseeding Doesn't Work: Check MongoDB Connection

```bash
# Check if MongoDB is running
mongosh --eval "db.runCommand({ ping: 1 })"

# Check if templates exist
mongosh cpq --eval "db.templates.countDocuments()"
```

### If All Else Fails: Manual Database Fix

1. **Backup your database:**
```bash
mongodump --db cpq --out ./backup-$(date +%Y%m%d)
```

2. **Remove corrupted template:**
```bash
mongosh cpq --eval "db.templates.deleteOne({ id: 'your-template-id' })"
```

3. **Reseed from disk:**
```bash
node seed-templates.cjs
```

## Root Cause Identification

Check browser console for these messages:

| Message | Meaning | Action |
|---------|---------|--------|
| `❌ Backend returned HTML instead of DOCX file` | Backend error | Check server logs |
| `❌ Backend returned JSON error` | API error | Check template exists in DB |
| `⚠️ Template file is empty` | Corrupted/missing file | Reseed from disk |
| `⚠️ Fetched file is not a valid DOCX file` | File corruption | Re-save DOCX properly |
| `❌ Invalid file signature` | Not a DOCX file | Check file format |

## Prevention Checklist

- [ ] All DOCX files in `backend-templates/` are valid
- [ ] Templates are seeded into MongoDB
- [ ] MongoDB is running and accessible
- [ ] Backend server is running
- [ ] Browser cache is cleared
- [ ] Templates are re-selected in UI after reseeding

## Most Common Causes

1. **Templates not seeded** (40%) - Run `node seed-templates.cjs`
2. **Corrupted DOCX file** (30%) - Re-save in Word/LibreOffice
3. **Browser cache** (20%) - Clear cache and reload
4. **MongoDB connection issue** (10%) - Check MongoDB status

## Need More Help?

Run the full diagnostic:
```bash
# Validate all templates
node validate-templates.cjs

# Check MongoDB
mongosh cpq --eval "db.templates.find({}, {id:1, fileName:1, 'fileData':1}).forEach(t => print(t.id, t.fileName, t.fileData ? 'has data' : 'MISSING DATA'))"

# Check backend templates folder
ls -lh backend-templates/*.docx

# Test a specific template
node check-document-in-mongodb.cjs
```

Then check `DOCX_TEMPLATE_ERROR_FIX.md` for detailed troubleshooting.

---

**Quick Reference Card**

```
┌─────────────────────────────────────────────┐
│  DOCX Template Error - Quick Actions       │
├─────────────────────────────────────────────┤
│                                             │
│  1. node validate-templates.cjs            │
│  2. node seed-templates.cjs                │
│  3. Clear browser cache                     │
│  4. Re-select template in UI                │
│  5. Try again                               │
│                                             │
│  Still failing?                             │
│  → Check DOCX_TEMPLATE_ERROR_FIX.md        │
│                                             │
└─────────────────────────────────────────────┘
```

