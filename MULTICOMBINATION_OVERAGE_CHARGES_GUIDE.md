# Multicombination Agreement - Overage Charges Per Exhibit

## Overview

For multicombination agreements, each exhibit now includes overage charge information that shows:
- **Per User cost** - The cost per user for this specific combination
- **Per Server per Month cost** - The monthly server cost for this combination
- **Per GB cost** - The cost per GB (only for Content migrations)
- **Combination Name** - The name of the combination this exhibit represents

## Available Fields in Templates

When using the `{{#exhibits}}...{{/exhibits}}` loop in your DOCX templates, you now have access to these additional fields:

### Standard Fields (existing)
- `{{exhibitType}}` - Type of exhibit (e.g., "CloudFuze X-Change Data Migration")
- `{{exhibitDesc}}` - Description of the exhibit
- `{{exhibitPlan}}` - Plan tier (Basic/Standard/Advanced)
- `{{exhibitPrice}}` - Total price for the exhibit

### New Overage Charge Fields (for multicombination only)
- `{{exhibitOveragePerUser}}` - Formatted per-user cost (e.g., "$35.00")
- `{{exhibitOveragePerServer}}` - Formatted per-server per-month cost (e.g., "$500.00")
- `{{exhibitOveragePerGB}}` - Formatted per-GB cost (e.g., "$1.50") - **Only available for Content migrations**
- `{{exhibitCombinationName}}` - The combination name (e.g., "Slack to Teams", "Dropbox to MyDrive")
- `{{exhibitOverageCharges}}` - Pre-formatted string: "Overage Charges: $35.00 per User | $500.00 per server per month | $1.50 per GB"

## Template Usage Examples

### Example 1: Display Separate Overage Charges for Each Exhibit (Recommended)

This is the **recommended approach** for multicombination agreements where you want to show separate overage charges for each selected exhibit (e.g., "Slack To Teams", "Dropbox To Azureblob", "Dropbox To Box").

```xml
{{#exhibits}}
<w:p>
  <w:r>
    <w:t>Overage Charges for {{exhibitCombinationName}}: {{exhibitOveragePerUser}} per User | {{exhibitOveragePerServer}} per server per month</w:t>
  </w:r>
  {{#exhibitOveragePerGB}}
  <w:r>
    <w:t> | {{exhibitOveragePerGB}} per GB</w:t>
  </w:r>
  {{/exhibitOveragePerGB}}
</w:p>
{{/exhibits}}
```

**Output for 3 selected exhibits:**
- "Overage Charges for Slack To Teams: $35.00 per User | $1,000.00 per server per month"
- "Overage Charges for Dropbox To Azureblob: $35.00 per User | $1,000.00 per server per month | $1.50 per GB"
- "Overage Charges for Dropbox To Box: $35.00 per User | $1,000.00 per server per month | $1.50 per GB"

### Example 2: Display Overage Charges in a Table (One Row Per Exhibit)

Perfect for creating a structured table showing all exhibits and their overage charges:

```xml
<w:tbl>
  <w:tblPr>
    <w:tblStyle w:val="TableGrid"/>
  </w:tblPr>
  <w:tr>
    <w:tc><w:p><w:r><w:t><w:b>Combination</w:b></w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t><w:b>Per User</w:b></w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t><w:b>Per Server/Month</w:b></w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t><w:b>Per GB</w:b></w:t></w:r></w:p></w:tc>
  </w:tr>
  {{#exhibits}}
  <w:tr>
    <w:tc>
      <w:p>
        <w:r><w:t>{{exhibitCombinationName}}</w:t></w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:p>
        <w:r><w:t>{{exhibitOveragePerUser}}</w:t></w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:p>
        <w:r><w:t>{{exhibitOveragePerServer}}</w:t></w:r>
      </w:p>
    </w:tc>
    <w:tc>
      <w:p>
        <w:r><w:t>{{#exhibitOveragePerGB}}{{exhibitOveragePerGB}}{{/exhibitOveragePerGB}}{{^exhibitOveragePerGB}}N/A{{/exhibitOveragePerGB}}</w:t></w:r>
      </w:p>
    </w:tc>
  </w:tr>
  {{/exhibits}}
</w:tbl>
```

### Example 3: Display Pre-formatted Overage Charges String (Simple Format)

If you prefer the pre-formatted string that includes everything:

```xml
{{#exhibits}}
<w:p>
  <w:r><w:t><w:b>{{exhibitCombinationName}}:</w:b> {{exhibitOverageCharges}}</w:t></w:r>
</w:p>
{{/exhibits}}
```

This will output:
- "**Slack To Teams:** Overage Charges: $35.00 per User | $1,000.00 per server per month"
- "**Dropbox To Azureblob:** Overage Charges: $35.00 per User | $1,000.00 per server per month | $1.50 per GB"
- "**Dropbox To Box:** Overage Charges: $35.00 per User | $1,000.00 per server per month | $1.50 per GB"

### Example 4: Bullet List Format (Similar to "Important Payment Notes" Section)

Perfect for displaying in a bullet list format similar to the "Important Payment Notes" section:

```xml
<w:p>
  <w:r><w:t><w:b>Overage Charges by Exhibit:</w:b></w:t></w:r>
</w:p>
{{#exhibits}}
<w:p>
  <w:pPr>
    <w:numPr>
      <w:ilvl w:val="0"/>
      <w:numId w:val="1"/>
    </w:numPr>
  </w:pPr>
  <w:r>
    <w:t><w:b>{{exhibitCombinationName}}:</w:b> {{exhibitOveragePerUser}} per User | {{exhibitOveragePerServer}} per server per month</w:t>
  </w:r>
  {{#exhibitOveragePerGB}}
  <w:r>
    <w:t> | {{exhibitOveragePerGB}} per GB</w:t>
  </w:r>
  {{/exhibitOveragePerGB}}
</w:p>
{{/exhibits}}
```

**Output:**
- **Slack To Teams:** $35.00 per User | $1,000.00 per server per month
- **Dropbox To Azureblob:** $35.00 per User | $1,000.00 per server per month | $1.50 per GB
- **Dropbox To Box:** $35.00 per User | $1,000.00 per server per month | $1.50 per GB

## Important Notes

1. **Multicombination Only**: These overage charge fields are only populated when `migrationType === 'Multi combination'`. For single migration types, these fields will be `undefined`.

2. **Per-GB Field**: The `exhibitOveragePerGB` field is only populated for Content migrations. For Messaging and Email migrations, this field will be `undefined` or "$0.00".

3. **Calculation Logic**:
   - **Per User Cost**: Calculated from the combination breakdown's `userCost` divided by `numberOfUsers`, or falls back to the tier's `perUserCost`.
   - **Per Server per Month**: Uses `getInstanceTypeCost(instanceType)` based on the exhibit's instance type (Small/Standard/Large/Extra Large).
   - **Per GB Cost**: Calculated from the combination breakdown's `dataCost` divided by `dataSizeGB` (for Content only), or falls back to the tier's `perGBCost`.

4. **Combination Name**: The `exhibitCombinationName` is extracted from the exhibit configuration's `exhibitName` or `combinationName` field, which represents the migration combination (e.g., "Slack to Teams", "Dropbox to MyDrive").

## Implementation Details

The overage charges are calculated in `QuoteGenerator.tsx` in the `handleGenerateAgreement` function, specifically in the loop that builds the `exhibitsData` array (around line 5029-5070).

Each exhibit in multicombination agreements will have these fields automatically populated based on:
- The exhibit's configuration (numberOfUsers, instanceType, dataSizeGB)
- The pricing calculation breakdown for that specific combination
- The selected pricing tier (Basic/Standard/Advanced)

## How the Loop Works

The `{{#exhibits}}...{{/exhibits}}` loop automatically iterates through **all selected exhibits** in your multicombination agreement. For each exhibit:

1. **The system automatically:**
   - Extracts the combination name (e.g., "Slack To Teams", "Dropbox To Azureblob")
   - Calculates per-user cost based on that exhibit's configuration
   - Calculates per-server cost based on that exhibit's instance type
   - Calculates per-GB cost (only for Content migrations)
   - Populates all the overage charge fields

2. **In your template:**
   - Use `{{#exhibits}}` to start the loop
   - Access `{{exhibitCombinationName}}`, `{{exhibitOveragePerUser}}`, etc. for each exhibit
   - Use `{{/exhibits}}` to end the loop

3. **Result:**
   - If you selected 3 exhibits, the loop will run 3 times
   - Each iteration will show the overage charges for that specific exhibit
   - Each exhibit gets its own separate overage charges display

## Example: 3 Selected Exhibits

If you have selected:
- Slack To Teams (Messaging)
- Dropbox To Azureblob (Content)
- Dropbox To Box (Content)

The loop will generate 3 separate overage charge entries, one for each exhibit, with their specific costs.

## Testing

To test this feature:
1. Create a multicombination agreement with multiple exhibits (e.g., "Slack To Teams", "Dropbox To Azureblob", "Dropbox To Box")
2. Generate the agreement
3. Check that each exhibit in the generated document includes **separate** overage charges
4. Verify that Content exhibits show per-GB costs, while Messaging/Email exhibits do not
5. Confirm that each exhibit's overage charges are calculated independently based on that exhibit's configuration

