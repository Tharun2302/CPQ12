# How to Display Separate Overage Charges for Each Selected Exhibit

## Your Scenario
You have selected **3 exhibits**:
1. Slack To Teams (Messaging)
2. Dropbox To Azureblob (Content)
3. Dropbox To Box (Content)

You want to show **separate overage charges** for each exhibit in the generated agreement.

## Solution: Use the {{#exhibits}} Loop

The system automatically creates a loop that iterates through all your selected exhibits. You just need to use the loop in your DOCX template.

## Simple Template Code (Copy & Paste Ready)

### Option 1: Simple List Format (Recommended)

Add this to your DOCX template where you want to show overage charges:

```xml
{{#exhibits}}
<w:p>
  <w:r>
    <w:t><w:b>Overage Charges for {{exhibitCombinationName}}:</w:b> {{exhibitOveragePerUser}} per User | {{exhibitOveragePerServer}} per server per month</w:t>
  </w:r>
  {{#exhibitOveragePerGB}}
  <w:r>
    <w:t> | {{exhibitOveragePerGB}} per GB</w:t>
  </w:r>
  {{/exhibitOveragePerGB}}
</w:p>
{{/exhibits}}
```

**What this does:**
- Loops through each of your 3 selected exhibits
- For each exhibit, displays:
  - The combination name (e.g., "Slack To Teams")
  - Per User cost
  - Per Server per month cost
  - Per GB cost (only for Content migrations)

**Output for your 3 exhibits:**
```
Overage Charges for Slack To Teams: $35.00 per User | $1,000.00 per server per month
Overage Charges for Dropbox To Azureblob: $35.00 per User | $1,000.00 per server per month | $1.50 per GB
Overage Charges for Dropbox To Box: $35.00 per User | $1,000.00 per server per month | $1.50 per GB
```

### Option 2: Bullet Point Format (Like "Important Payment Notes")

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
```
Overage Charges by Exhibit:
• Slack To Teams: $35.00 per User | $1,000.00 per server per month
• Dropbox To Azureblob: $35.00 per User | $1,000.00 per server per month | $1.50 per GB
• Dropbox To Box: $35.00 per User | $1,000.00 per server per month | $1.50 per GB
```

### Option 3: Table Format (Structured Display)

```xml
<w:tbl>
  <w:tblPr>
    <w:tblStyle w:val="TableGrid"/>
  </w:tblPr>
  <w:tr>
    <w:tc><w:p><w:r><w:t><w:b>Exhibit</w:b></w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t><w:b>Per User</w:b></w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t><w:b>Per Server/Month</w:b></w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t><w:b>Per GB</w:b></w:t></w:r></w:p></w:tc>
  </w:tr>
  {{#exhibits}}
  <w:tr>
    <w:tc><w:p><w:r><w:t>{{exhibitCombinationName}}</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t>{{exhibitOveragePerUser}}</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t>{{exhibitOveragePerServer}}</w:t></w:r></w:p></w:tc>
    <w:tc><w:p><w:r><w:t>{{#exhibitOveragePerGB}}{{exhibitOveragePerGB}}{{/exhibitOveragePerGB}}{{^exhibitOveragePerGB}}N/A{{/exhibitOveragePerGB}}</w:t></w:r></w:p></w:tc>
  </w:tr>
  {{/exhibits}}
</w:tbl>
```

## How the Loop Works

1. **{{#exhibits}}** - Starts the loop (iterates through all selected exhibits)
2. **{{exhibitCombinationName}}** - Shows the combination name (e.g., "Slack To Teams")
3. **{{exhibitOveragePerUser}}** - Shows per-user cost for this exhibit
4. **{{exhibitOveragePerServer}}** - Shows per-server per-month cost for this exhibit
5. **{{#exhibitOveragePerGB}}...{{/exhibitOveragePerGB}}** - Conditionally shows per-GB cost (only for Content)
6. **{{/exhibits}}** - Ends the loop

## Key Points

✅ **Automatic**: The loop automatically runs for each of your 3 selected exhibits  
✅ **Separate Charges**: Each exhibit gets its own overage charges based on its configuration  
✅ **Smart Display**: Per-GB only shows for Content migrations (not for Messaging/Email)  
✅ **No Manual Work**: You don't need to specify which exhibits - the system handles it

## Where to Add This Code

1. Open your DOCX template file
2. Find the section where you want to display overage charges (e.g., in "Important Payment Notes")
3. Replace any existing overage charges text with one of the loop examples above
4. Save the template
5. Generate a new agreement - each exhibit will show its own overage charges!

## Testing

After adding the loop to your template:
1. Select your 3 exhibits (Slack To Teams, Dropbox To Azureblob, Dropbox To Box)
2. Generate the agreement
3. Check that you see 3 separate overage charge entries, one for each exhibit
4. Verify that Content exhibits (Dropbox To Azureblob, Dropbox To Box) show per-GB costs
5. Verify that Messaging exhibit (Slack To Teams) does NOT show per-GB cost

