# Dynamic Exhibit Table Rows - Testing Guide

## 🎯 Overview
This guide provides comprehensive test scenarios to validate the dynamic exhibit table row generation feature in the MultiCombinations template.

## ⚙️ Setup Prerequisites

### 1. Code Changes Applied
- ✅ Updated `DocxTemplateData` interface with `exhibits` array type
- ✅ Added helper functions: `getCategoryDisplayName()`, `formatExhibitDescription()`, `calculateExhibitPrice()`
- ✅ Added exhibits array logic in `handleGenerateAgreement()` function

### 2. Template Modified
- ✅ MultiCombinations.docx updated with `{#exhibits}` and `{/exhibits}` loop markers
- ✅ Template uploaded to database using `update-multicombinations-template.cjs`

### 3. Server Running
- ✅ Backend server restarted to load updated code and template
- ✅ Frontend development server running

## 🧪 Test Scenarios

### Test Case 1: No Exhibits Selected
**Purpose:** Verify default placeholder row appears when no exhibits are selected

**Steps:**
1. Navigate to Configuration
2. Select Migration Type: "Multi combination"
3. Do NOT select any exhibits from the three categories
4. Click "Calculate Pricing"
5. Go to Quote session
6. Fill in client information
7. Click "Generate Agreement"

**Expected Result:**
```
┌─────────────────────────────┬──────────────┬──────────────┐
│ Job Requirement             │ Description  │ Price(USD)   │
├─────────────────────────────┼──────────────┼──────────────┤
│ No Exhibits Selected        │ N/A          │ $0.00        │
└─────────────────────────────┴──────────────┴──────────────┘
```

**Console Verification:**
- Look for: `"✅ Exhibits array prepared: [{ exhibitType: 'No Exhibits Selected', ... }]"`

---

### Test Case 2: Single Messaging Exhibit
**Purpose:** Verify single exhibit creates one table row

**Steps:**
1. Navigate to Configuration
2. Select Migration Type: "Multi combination"
3. Select ONE exhibit from MESSAGE column (e.g., "Slack to Teams")
4. Configure messaging project settings:
   - Number of Users: 50
   - Instance Type: Small
   - Messages: 1000
5. Click "Calculate Pricing"
6. Go to Quote session
7. Generate Agreement

**Expected Result:**
- One exhibit row appears in table
- Row shows:
  - **Exhibit Type:** "CloudFuze X-Change Messaging Migration"
  - **Description:** "Slack to Teams\n\nUp to 50 Users | 1000 Channels and DMs through JSON Messages"
  - **Price:** Calculated messaging migration price (formatted as currency)

**Console Verification:**
- Look for: `"✅ Added exhibit to array: { name: 'Slack to Teams', category: 'messaging', price: '$X,XXX.XX' }"`
- Verify: `exhibits.length === 1`

---

### Test Case 3: Single Content Exhibit
**Purpose:** Verify content exhibit creates correct row format

**Steps:**
1. Navigate to Configuration
2. Select Migration Type: "Multi combination"
3. Select ONE exhibit from CONTENT column (e.g., "ShareFile to Google Shared Drive")
4. Configure content project settings:
   - Number of Users: 100
   - Data Size (GB): 500
5. Click "Calculate Pricing"
6. Generate Agreement

**Expected Result:**
- One exhibit row appears
- Row shows:
  - **Exhibit Type:** "CloudFuze X-Change Content Migration"
  - **Description:** "ShareFile to Google Shared Drive\n\nUp to 100 Users | 500 GBs"
  - **Price:** Calculated content migration price

**Console Verification:**
- Look for: `"✅ Added exhibit to array: { name: 'ShareFile to...', category: 'content', price: '$X,XXX.XX' }"`

---

### Test Case 4: Multiple Exhibits (Same Category)
**Purpose:** Verify multiple exhibits of same category create multiple rows

**Steps:**
1. Select Migration Type: "Multi combination"
2. Select MULTIPLE exhibits from CONTENT column:
   - ShareFile to Google Shared Drive
   - Dropbox to Box
   - Dropbox to Google Shared Drive
3. Configure content settings
4. Calculate and Generate Agreement

**Expected Result:**
- Three separate rows in the table
- Each row shows different exhibit name and details
- All rows show "CloudFuze X-Change Content Migration" as type
- Prices calculated per exhibit

**Console Verification:**
- Verify: `exhibits.length === 3`
- Each exhibit logged separately

---

### Test Case 5: Mixed Categories (Messaging + Content)
**Purpose:** Verify exhibits from different categories both appear

**Steps:**
1. Select Migration Type: "Multi combination"
2. Select ONE exhibit from MESSAGE column
3. Select ONE exhibit from CONTENT column
4. Configure BOTH messaging and content project settings
5. Calculate and Generate Agreement

**Expected Result:**
- Two rows in the table:
  1. CloudFuze X-Change Messaging Migration (with messaging details)
  2. CloudFuze X-Change Content Migration (with content details)
- Prices reflect each category's configuration

**Console Verification:**
- Verify: `exhibits.length === 2`
- One messaging, one content logged

---

### Test Case 6: All Categories (Messaging + Content + Email)
**Purpose:** Verify all three exhibit types can coexist

**Steps:**
1. Select Migration Type: "Multi combination"
2. Select exhibits from ALL three columns:
   - MESSAGE: Slack to Teams
   - CONTENT: ShareFile to Google Shared Drive
   - EMAIL: Outlook to Gmail
3. Configure all three project settings
4. Calculate and Generate Agreement

**Expected Result:**
- Three rows in the table:
  1. CloudFuze X-Change Messaging Migration
  2. CloudFuze X-Change Content Migration
  3. CloudFuze X-Change Email Migration
- Each with appropriate descriptions and prices

**Console Verification:**
- Verify: `exhibits.length === 3`
- All three categories present

---

### Test Case 7: Pricing Accuracy
**Purpose:** Verify calculated prices match exhibit configurations

**Steps:**
1. Select Migration Type: "Multi combination"
2. Select one messaging exhibit
3. Configure with specific values:
   - Users: 100
   - Messages: 5000
   - Duration: 3 months
4. Note the messaging total cost from pricing display
5. Generate Agreement
6. Compare exhibit price in table to pricing display

**Expected Result:**
- Exhibit price in table matches messaging calculation
- Price includes all components (users, messages, instances, duration)
- Currency formatting is consistent

**Manual Verification:**
- Cross-reference with pricing breakdown on screen
- Verify `formatCurrency()` applied correctly

---

### Test Case 8: Template Loop Functionality
**Purpose:** Verify docxtemplater loops work correctly

**Steps:**
1. Generate agreement with 4 different exhibits selected
2. Open the generated DOCX file in Microsoft Word
3. Check table structure

**Expected Result:**
- Table has exactly 4 exhibit rows (plus other fixed rows)
- No loop markers `{#exhibits}` or `{/exhibits}` visible
- All tokens replaced with actual values
- Table formatting preserved

**Error Indicators to Watch For:**
- Visible loop markers = template syntax error
- Missing rows = loop not processing
- Duplicate rows = loop marker placement issue

---

### Test Case 9: Exhibit Name Display
**Purpose:** Verify correct exhibit names appear in descriptions

**Steps:**
1. Select exhibits with long, complex names
2. Generate agreement
3. Verify names are readable and properly formatted

**Expected Result:**
- Full exhibit names appear in description
- Line breaks preserved (if any)
- No truncation or encoding issues

---

### Test Case 10: Error Handling
**Purpose:** Verify graceful handling of edge cases

**Test Variations:**
a) **Invalid Exhibit ID:**
   - Manually select exhibit, then delete it from database
   - Generate agreement
   - **Expected:** Skips invalid exhibit, continues with others

b) **Missing Configuration:**
   - Select exhibit but leave config fields empty
   - **Expected:** Uses fallback values (1 user, 0 GB, etc.)

c) **API Failure:**
   - Disconnect from backend
   - **Expected:** Console error logged, exhibits array = default placeholder

**Console Verification:**
- Look for: `"❌ Error preparing exhibits array: ..."`
- Verify fallback behavior activates

---

## 📊 Test Results Template

Use this checklist to track your testing:

```
Test Case 1: No Exhibits Selected             [ ] Pass  [ ] Fail
Test Case 2: Single Messaging Exhibit         [ ] Pass  [ ] Fail
Test Case 3: Single Content Exhibit           [ ] Pass  [ ] Fail
Test Case 4: Multiple Exhibits (Same Cat)     [ ] Pass  [ ] Fail
Test Case 5: Mixed Categories (M+C)           [ ] Pass  [ ] Fail
Test Case 6: All Categories (M+C+E)           [ ] Pass  [ ] Fail
Test Case 7: Pricing Accuracy                 [ ] Pass  [ ] Fail
Test Case 8: Template Loop Functionality      [ ] Pass  [ ] Fail
Test Case 9: Exhibit Name Display             [ ] Pass  [ ] Fail
Test Case 10: Error Handling                  [ ] Pass  [ ] Fail
```

## 🐛 Common Issues and Solutions

### Issue: Loop markers visible in generated document
**Cause:** Template syntax error or docxtemplater not processing loops
**Solution:** 
- Verify `{#exhibits}` and `{/exhibits}` are exactly spelled
- Check `paragraphLoop: true` in docxtemplater config
- Ensure markers are in proper table structure

### Issue: No exhibits appearing despite selection
**Cause:** API not returning exhibit data or selectedExhibits empty
**Solution:**
- Check console for "📎 Preparing exhibits array for template..."
- Verify `selectedExhibits` prop is passed to QuoteGenerator
- Check API endpoint `/api/exhibits` returns data

### Issue: Prices showing as $0.00 or NaN
**Cause:** Calculation not available or pricing logic error
**Solution:**
- Verify `calculation` prop contains valid data
- Check Multi combination calculations (messagingCalculation, contentCalculation)
- Ensure `formatCurrency()` receives valid numbers

### Issue: Duplicate rows appearing
**Cause:** Multiple template rows between loop markers
**Solution:**
- Ensure only ONE row between `{#exhibits}` and `{/exhibits}`
- Check template structure in Word

### Issue: Table formatting broken
**Cause:** Merged cells or complex table structure
**Solution:**
- Simplify table structure
- Use standard cells (avoid spanning/merging within loop)
- Test with basic 3-column table first

## 📝 Console Logs to Monitor

During testing, watch for these key console messages:

1. **Exhibit Array Preparation:**
   ```
   📎 Preparing exhibits array for template...
   ✅ Added exhibit to array: { name: '...', category: '...', price: '...' }
   ✅ Exhibits array prepared: [...]
   ```

2. **Template Data:**
   ```
   🔍 TEMPLATE DATA CREATED:
   exhibits: [...array contents...]
   ```

3. **Docxtemplater Processing:**
   ```
   🔄 Attempting to process template with Docxtemplater...
   ✅ Template rendered successfully
   ```

4. **Errors to Watch:**
   ```
   ❌ Error preparing exhibits array: ...
   ❌ Error fetching exhibits: ...
   ❌ Template rendering failed: ...
   ```

## ✅ Final Validation

After completing all tests:

- [ ] All test cases passed
- [ ] No console errors during generation
- [ ] Generated documents open correctly
- [ ] Table formatting is preserved
- [ ] Prices are accurate
- [ ] Exhibit names are readable
- [ ] Default case works (no exhibits)
- [ ] Multiple exhibits work correctly
- [ ] Loop markers not visible in output

## 🎉 Success Criteria

The implementation is successful if:
1. ✅ Dynamic rows generated based on exhibit selection
2. ✅ Correct exhibit data appears in each row
3. ✅ Pricing calculated accurately per exhibit
4. ✅ Template loop syntax works without errors
5. ✅ Default placeholder shows when no exhibits selected
6. ✅ Works for all exhibit categories (messaging, content, email)
7. ✅ Multiple exhibits create multiple rows
8. ✅ Generated documents are properly formatted
9. ✅ No breaking changes to existing functionality
10. ✅ Error handling graceful for edge cases





















