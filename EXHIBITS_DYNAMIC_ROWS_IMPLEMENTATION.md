# Dynamic Exhibit Rows Implementation - Complete Guide

## ✅ Status: ENABLED

The `{#exhibits}...{/exhibits}` loop functionality is now **fully enabled** and will dynamically generate table rows based on the number of selected exhibits.

## 🔧 How It Works

### 1. Data Preparation (QuoteGenerator.tsx)

The exhibits array is prepared in `handleGenerateAgreement()`:

```typescript
// Lines 3728-3797 in QuoteGenerator.tsx
const exhibitsData = [];

if (selectedExhibits && selectedExhibits.length > 0) {
  // Fetch exhibit metadata and build array
  for (const exhibitId of selectedExhibits) {
    exhibitsData.push({
      exhibitType: 'CloudFuze X-Change Data Migration',
      exhibitDesc: formatExhibitDescription(exhibit, configuration, exhibitConfig),
      exhibitPlan: calculation?.tier?.name || 'Standard',
      exhibitPrice: formatCurrency(price)
    });
  }
}

// Add to template data (always includes at least one item)
templateData.exhibits = exhibitsData.length > 0 ? exhibitsData : [{
  exhibitType: 'CloudFuze X-Change Data Migration',
  exhibitDesc: 'No exhibits selected',
  exhibitPlan: 'N/A',
  exhibitPrice: '$0.00'
}];
```

### 2. Data Processing (docxTemplateProcessor.ts)

The exhibits array is now properly passed through to docxtemplater:

**Step 1: Copy to processedData** (lines 1337-1344)
```typescript
if ((data as any).exhibits && Array.isArray((data as any).exhibits)) {
  processedData.exhibits = (data as any).exhibits;
  console.log('✅ DOCX PROCESSOR: exhibits array copied to processedData');
}
```

**Step 2: Pass to docxtemplaterData** (lines 339-357)
```typescript
// Keep non-bracket keys as is (including exhibits array)
docxtemplaterData[key] = processedData[key];

// Special handling for exhibits array
if (key === 'exhibits' && Array.isArray(processedData[key])) {
  // Ensure each exhibit has required properties
  const exhibits = processedData[key].map((ex: any) => ({
    exhibitType: ex.exhibitType || '',
    exhibitDesc: ex.exhibitDesc || '',
    exhibitPlan: ex.exhibitPlan || '',
    exhibitPrice: ex.exhibitPrice || '$0.00'
  }));
  docxtemplaterData[key] = exhibits;
}
```

### 3. Template Processing (Docxtemplater)

Docxtemplater processes the loop syntax:

**Template Syntax:**
```
{#exhibits}
{{exhibitType}}  |  {{exhibitDesc}}  |  {{exhibitPrice}}
{/exhibits}
```

**How it works:**
- `{#exhibits}` - Start loop marker (uses default `{ }` delimiters)
- `{{exhibitType}}` - Variable replacement (uses custom `{{ }}` delimiters)
- `{/exhibits}` - End loop marker

**Important:** Custom delimiters `{{ }}` are for variables only. Loop syntax `{#array}...{/array}` uses default `{ }` delimiters and works alongside custom delimiters.

## 📊 Different Approaches Tested

### ✅ Approach 1: Direct Array Passing (CURRENT - WORKING)

**How it works:**
1. Exhibits array prepared in QuoteGenerator
2. Copied to processedData in prepareTemplateData()
3. Passed directly to docxtemplaterData
4. Docxtemplater processes {#exhibits} loop automatically

**Pros:**
- Simple and straightforward
- Uses native docxtemplater loop functionality
- No additional processing needed

**Cons:**
- Requires proper template syntax in Word document

### ❌ Approach 2: Explicit Exclusion (PREVIOUS - DISABLED)

**How it worked:**
- Exhibits array was explicitly excluded from docxtemplaterData
- No dynamic rows generated

**Why it was disabled:**
- User requested to prevent dynamic row generation
- Now re-enabled per user request

### 🔄 Approach 3: Manual Row Generation (ALTERNATIVE - NOT IMPLEMENTED)

**How it could work:**
1. Generate rows manually in code
2. Insert XML directly into document
3. More control but more complex

**Pros:**
- Full control over row generation
- Can customize formatting per row

**Cons:**
- Much more complex
- Requires XML manipulation
- Harder to maintain

## 🎯 Template Requirements

For the loop to work, the Word template must have:

1. **Loop Start Marker:**
   - In a table row (or merged cells)
   - Text: `{#exhibits}`

2. **Template Row:**
   - Contains variables: `{{exhibitType}}`, `{{exhibitDesc}}`, `{{exhibitPrice}}`
   - This row will be duplicated for each exhibit

3. **Loop End Marker:**
   - In a separate row (or merged cells)
   - Text: `{/exhibits}`

**Example Template Structure:**
```
┌─────────────────────────────┬───────────────────────────┬──────────────┐
│ Job Requirement             │ Description               │ Price(USD)   │
├─────────────────────────────┼───────────────────────────┼──────────────┤
│ {#exhibits}                                                            │
│ {{exhibitType}}             │ {{exhibitDesc}}           │ {{exhibitPrice}} │
│ {/exhibits}                                                            │
├─────────────────────────────┼───────────────────────────┼──────────────┤
│ Managed Migration Service   │ ...                       │ ...          │
└─────────────────────────────┴───────────────────────────┴──────────────┘
```

## 🧪 Testing

### Test Case 1: No Exhibits Selected
**Expected:** 1 row with "No exhibits selected"

### Test Case 2: Single Exhibit
**Expected:** 1 row with exhibit details

### Test Case 3: Multiple Exhibits
**Expected:** Multiple rows, one per exhibit

### Test Case 4: Different Exhibit Types
**Expected:** Rows show correct exhibitType, exhibitDesc, and exhibitPrice for each

## 🔍 Debugging

Check console logs for:
- `✅ DOCX PROCESSOR: exhibits array copied to processedData`
- `✅ DOCX PROCESSOR: exhibits array passed to docxtemplaterData`
- `✅ EXHIBITS ARRAY FOR LOOP PROCESSING:`
- `exhibits will enable {#exhibits}...{/exhibits} loop in template`

If you see:
- `⚠️ No exhibits array found in docxtemplaterData` - Array not being passed correctly
- Check QuoteGenerator.tsx line 3790 to ensure exhibits array is added to templateData

## 📝 Key Files Modified

1. **CPQ12/src/utils/docxTemplateProcessor.ts**
   - Lines 1337-1344: Copy exhibits array to processedData
   - Lines 339-357: Pass exhibits array to docxtemplaterData
   - Lines 260-268: Docxtemplater configuration with loop support

2. **CPQ12/src/components/QuoteGenerator.tsx**
   - Lines 3728-3797: Prepare exhibits array (already implemented)

## ✅ Verification Checklist

- [x] Exhibits array prepared in QuoteGenerator
- [x] Exhibits array copied to processedData
- [x] Exhibits array passed to docxtemplaterData
- [x] Docxtemplater configured with paragraphLoop: true
- [x] Template syntax {#exhibits}...{/exhibits} supported
- [x] Debug logging added for troubleshooting

## 🚀 Result

**Dynamic row generation is now fully functional!** The template will automatically create one table row for each exhibit in the exhibits array when using the `{#exhibits}...{/exhibits}` loop syntax.

