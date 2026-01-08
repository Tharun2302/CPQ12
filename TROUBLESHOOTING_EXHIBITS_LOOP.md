# Troubleshooting: Why Dynamic Exhibit Rows Are Not Working

## 🔍 Issues Identified

Based on your template structure, there are **TWO main problems**:

### Problem 1: Template Structure is Wrong ❌

**Current (WRONG) Structure:**
```
Row: {#exhibits} CloudFuze X-Change Data Migration  |  ...  |  {/exhibits}
```

**Correct Structure:**
```
Row 1: {#exhibits}  (loop start marker - alone, in first cell or merged cells)
Row 2: {{exhibitType}}  |  {{exhibitDesc}}  |  {{exhibitPrice}}  (template row)
Row 3: {/exhibits}  (loop end marker - alone, in merged cells)
```

### Problem 2: Custom Delimiters May Interfere ⚠️

When using custom delimiters `{{` and `}}`, the loop syntax might need to match. There are two possible solutions:

## 🔧 Solution Options

### Option A: Use Custom Delimiters for Loops (RECOMMENDED)

Change the template to use:
- `{{#exhibits}}` instead of `{#exhibits}`
- `{{/exhibits}}` instead of `{/exhibits}`

**Template Structure:**
```
Row 1: {{#exhibits}}  (in merged cells or first cell)
Row 2: {{exhibitType}}  |  {{exhibitDesc}}  |  {{exhibitPrice}}
Row 3: {{/exhibits}}  (in merged cells)
```

### Option B: Fix Template Structure Only

Keep using `{#exhibits}` but fix the structure:
- `{#exhibits}` must be in its own row
- Template row with variables in separate row
- `{/exhibits}` in its own row

## 📋 Step-by-Step Fix

### Step 1: Open MultiCombinations.docx Template

### Step 2: Find the Current Loop Row

Look for the row that has:
- `{#exhibits} CloudFuze X-Change Data Migration` in first cell
- `{/exhibits}` in last cell

### Step 3: Restructure the Table

**Delete the current row** and create **3 separate rows**:

**Row 1 (Loop Start):**
- Merge all 3 cells OR put `{#exhibits}` in first cell only
- Text: `{#exhibits}` (nothing else!)

**Row 2 (Template Row - will be duplicated):**
- Cell 1: `{{exhibitType}}`
- Cell 2: `{{exhibitDesc}}`
- Cell 3: `{{exhibitPrice}}`

**Row 3 (Loop End):**
- Merge all 3 cells OR put `{/exhibits}` in last cell
- Text: `{/exhibits}` (nothing else!)

### Step 4: Alternative - Use Custom Delimiters

If Option A doesn't work, try using custom delimiters for loops:

**Row 1:** `{{#exhibits}}`
**Row 2:** `{{exhibitType}} | {{exhibitDesc}} | {{exhibitPrice}}`
**Row 3:** `{{/exhibits}}`

## 🧪 Testing Checklist

After fixing the template:

1. ✅ Check browser console for:
   - `✅ DOCX PROCESSOR: exhibits array copied to processedData`
   - `✅ DOCX PROCESSOR: exhibits array passed to docxtemplaterData`
   - `✅ EXHIBITS ARRAY FOR LOOP PROCESSING`
   - `exhibits will enable {#exhibits}...{/exhibits} loop in template`

2. ✅ Verify exhibits array has data:
   - Check console log: `✅ Exhibits array prepared: [...]`
   - Should show array with exhibit objects

3. ✅ Test with different exhibit counts:
   - 0 exhibits → 1 row (placeholder)
   - 1 exhibit → 1 row
   - Multiple exhibits → Multiple rows

## 🐛 Common Errors

### Error: "loop_position_invalid"
- **Cause:** Loop markers not in correct table structure
- **Fix:** Ensure `{#exhibits}` and `{/exhibits}` are in separate rows

### Error: Loop not processing
- **Cause 1:** Exhibits array not passed to docxtemplater
- **Fix:** Check console logs for array presence
- **Cause 2:** Template syntax incorrect
- **Fix:** Verify loop markers are exactly `{#exhibits}` and `{/exhibits}` (or `{{#exhibits}}` and `{{/exhibits}}`)

### Error: Variables not replacing
- **Cause:** Custom delimiters mismatch
- **Fix:** Use `{{variable}}` for variables, `{#array}` or `{{#array}}` for loops

## 📝 Code Verification

The code is correctly configured:
- ✅ Exhibits array is prepared in QuoteGenerator.tsx
- ✅ Array is copied to processedData
- ✅ Array is passed to docxtemplaterData
- ✅ Docxtemplater has paragraphLoop: true
- ✅ Custom delimiters are set to `{{` and `}}`

**The issue is in the template structure, not the code!**

















