# MultiCombinations.docx Template Modification Guide

## 🎯 Objective
Add dynamic table row generation to the MultiCombinations.docx template so that each selected exhibit creates a new row in the purchase agreement table.

## 📋 Prerequisites
- Microsoft Word, LibreOffice Writer, or Google Docs
- The MultiCombinations.docx file located at: `CPQ12/backend-templates/MultiCombinations.docx`

## 🔧 Step-by-Step Instructions

### Step 1: Open the Template
1. Navigate to `CPQ12/backend-templates/`
2. Open `MultiCombinations.docx` with your word processor

### Step 2: Locate the Pricing Table
Find the main pricing table in the document. It should have headers like:
- **Job Requirement**
- **Description**
- **Price(USD)**

Based on your template screenshot, the table currently has rows for:
- CloudFuze X-Change Data Migration (Content)
- CloudFuze X-Change Data Migration (Messaging)
- Managed Migration Service
- Shared Server/Instance
- Discount
- Total Price

### Step 3: Add the Dynamic Exhibit Rows

**Find the row where you want exhibits to appear.** This should be AFTER the "CloudFuze X-Change Data Migration" rows and BEFORE the "Managed Migration Service" row.

#### Option A: Insert New Rows (Recommended)

1. **Insert a new row** in the table where exhibits should appear
2. **In the first cell (Job Requirement)**, type:
   ```
   {#exhibits}
   {{exhibitType}}
   ```

3. **In the second cell (Description)**, type:
   ```
   {{exhibitDesc}}
   ```

4. **In the third cell (Price)**, type:
   ```
   {{exhibitPrice}}
   ```

5. **Insert another new row** directly below this one
6. **Merge all cells** in this new row
7. **In the merged cell**, type:
   ```
   {/exhibits}
   ```

#### Option B: Replace Existing Content Row

If you want to replace the existing content migration row:

1. **Find the row** with `{{content_migration_name}}` or content migration details
2. **Replace the content** of the three cells with:
   - Cell 1: `{#exhibits}{{exhibitType}}`
   - Cell 2: `{{exhibitDesc}}`
   - Cell 3: `{{exhibitPrice}}`

3. **Add a row below** with `{/exhibits}` in a merged cell

### Step 4: Visual Example

Your table should look like this:

```
┌─────────────────────────────┬───────────────────────────┬──────────────┐
│ Job Requirement             │ Description               │ Price(USD)   │
├─────────────────────────────┼───────────────────────────┼──────────────┤
│ {#exhibits}                                                            │  ← Loop start marker (merged cells)
│ {{exhibitType}}             │ {{exhibitDesc}}           │ {{exhibitPrice}} │  ← Template row
│ {/exhibits}                                                            │  ← Loop end marker (merged cells)
├─────────────────────────────┼───────────────────────────┼──────────────┤
│ Managed Migration Service   │ Fully Managed Migration...│ {{price_...}}│
│                             │ Valid for {{Duration...}} │              │
└─────────────────────────────┴───────────────────────────┴──────────────┘
```

**Important Notes:**
- The `{#exhibits}` and `{/exhibits}` markers should be in their own rows with merged cells
- The loop markers tell docxtemplater where to start and end the repetition
- The `{{exhibitType}}`, `{{exhibitDesc}}`, and `{{exhibitPrice}}` tokens will be replaced with actual data

### Step 5: Alternative Simplified Approach

If merging cells is complex, you can use this simpler approach:

**Simply add the loop markers in the first cell of separate rows:**

Row 1:
- Cell 1: `{#exhibits}{{exhibitType}}`
- Cell 2: `{{exhibitDesc}}`
- Cell 3: `{{exhibitPrice}}`

Row 2:
- Cell 1: `{/exhibits}`
- Cells 2-3: Empty (or leave existing content)

### Step 6: Save the Template
1. Save the file as `MultiCombinations.docx`
2. Keep it in the `CPQ12/backend-templates/` folder
3. Close the document

### Step 7: Update the Database (Optional)

If your templates are stored in MongoDB, you may need to run an update script. Create a script similar to `update-advanced-template.cjs`:

```bash
node update-multicombinations-template.cjs
```

Or manually upload the template through the Template Manager in the application.

## 🧪 Testing

After modifying the template:

1. **Restart your server** to ensure the updated template is loaded
2. **Navigate to Configuration** and select "Multi combination" migration type
3. **Select one or more exhibits** from the three categories
4. **Calculate pricing** and generate the agreement
5. **Verify** that the exhibits appear as separate rows in the generated document

### Expected Results:

**With Exhibits Selected:**
- One row per selected exhibit
- Each row shows exhibit type, description, and calculated price
- Multiple exhibits create multiple rows

**No Exhibits Selected:**
- One default row showing "No Exhibits Selected" with "N/A" values

## 📝 Token Reference

The code automatically provides these tokens to the template:

- `{{exhibitType}}` - Display name like "CloudFuze X-Change Messaging Migration"
- `{{exhibitDesc}}` - Formatted description with user count, data size, etc.
- `{{exhibitPlan}}` - Plan tier (Basic/Standard/Advanced)
- `{{exhibitPrice}}` - Calculated price formatted as currency

## ⚠️ Troubleshooting

### Loop markers not working?
- Ensure `{#exhibits}` and `{/exhibits}` are spelled exactly as shown
- Check there are no extra spaces or characters
- Make sure the loop markers are in separate rows

### Exhibits not appearing?
- Check the console logs in QuoteGenerator.tsx for "Preparing exhibits array"
- Verify exhibits are being fetched from the database
- Ensure selectedExhibits array is being passed correctly

### Rows duplicated or missing?
- Verify only ONE template row is between `{#exhibits}` and `{/exhibits}`
- Check that the markers are properly placed in the table structure

## 📚 Additional Resources

- [Docxtemplater Documentation](https://docxtemplater.com/docs/tag-types/)
- [Table Row Loops in Docxtemplater](https://docxtemplater.com/docs/tag-types/#loop-table-rows)
- Project file: `CPQ12/src/components/QuoteGenerator.tsx` (lines 3700-3780)

## ✅ Completion Checklist

- [ ] Template file opened and located pricing table
- [ ] Loop markers `{#exhibits}` and `{/exhibits}` added
- [ ] Template row with tokens added between markers
- [ ] File saved in correct location
- [ ] Database updated (if applicable)
- [ ] Server restarted
- [ ] Tested with exhibits selected
- [ ] Tested with no exhibits selected
- [ ] Generated document shows correct exhibit rows








