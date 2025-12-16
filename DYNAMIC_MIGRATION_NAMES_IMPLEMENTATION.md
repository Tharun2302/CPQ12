# Dynamic Migration Names Implementation ✅

## Summary
Successfully added **dynamic migration name tokens** that populate automatically based on selected exhibits in Multi Combination templates.

## New Placeholders Added

### 1. `{{messaging_migration_name}}`
- **Purpose:** Displays the messaging migration name dynamically
- **Populated from:** Selected exhibits in the MESSAGE category
- **Example output:** "Slack to Teams", "Gmail to Gmail"

### 2. `{{content_migration_name}}`
- **Purpose:** Displays the content migration name dynamically
- **Populated from:** Selected exhibits in the CONTENT category
- **Example output:** "Sharefile to Google Sharedrive", "Google Mydrive to Google Mydrive"

---

## How It Works

### User Flow
1. User selects **Migration Type** = "Multi combination"
2. User selects exhibits from the exhibit selector:
   - MESSAGE category: "Slack to Teams Basic Plan"
   - CONTENT category: "ShareFile to Google Shared Drive - Not Included Features"
3. System fetches exhibit metadata and extracts the `combinations` field
4. System converts combination IDs to readable names:
   - `slack-to-teams` → "Slack to Teams"
   - `sharefile-to-google-sharedrive` → "Sharefile to Google Sharedrive"
5. Tokens are populated in the template

---

## Implementation Details

### Code Location
**File:** `src/components/QuoteGenerator.tsx`

### Changes Made

#### 1. Email Generation Section (Line ~881)
Added exhibit fetching logic before templateData creation:

```typescript
// Fetch selected exhibits to generate migration names
let messagingMigrationName = '';
let contentMigrationName = '';

if (selectedExhibits && selectedExhibits.length > 0 && configuration.migrationType === 'Multi combination') {
  try {
    const exhibitsResponse = await fetch(`${BACKEND_URL}/api/exhibits`);
    
    if (exhibitsResponse.ok) {
      const exhibitsData = await exhibitsResponse.json();
      const selectedExhibitObjects = allExhibits.filter((ex: any) => selectedExhibits.includes(ex._id));
      
      // Separate by category
      const messagingExhibits = selectedExhibitObjects.filter(...);
      const contentExhibits = selectedExhibitObjects.filter(...);
      
      // Generate names from combinations
      if (messagingExhibits.length > 0) {
        messagingMigrationName = combo.split('-').map(...).join(' to ');
      }
      
      if (contentExhibits.length > 0) {
        contentMigrationName = combo.split('-').map(...).join(' to ');
      }
    }
  } catch (error) {
    // Fallback to defaults
    messagingMigrationName = 'Messaging Migration';
    contentMigrationName = 'Content Migration';
  }
}
```

Then added to templateData:

```typescript
'{{messaging_migration_name}}': messagingMigrationName || '',
'{{content_migration_name}}': contentMigrationName || ''
```

#### 2. Download Generation Section (Line ~2771)
Same logic duplicated for the download document generation flow.

---

## Conversion Logic

### From Combination ID to Display Name

The system automatically converts kebab-case combination IDs to Title Case with "to":

| Combination ID | Display Name |
|----------------|--------------|
| `slack-to-teams` | Slack to Teams |
| `slack-to-google-chat` | Slack to Google Chat |
| `sharefile-to-google-sharedrive` | Sharefile to Google Sharedrive |
| `google-mydrive-to-google-mydrive` | Google Mydrive to Google Mydrive |
| `dropbox-to-mydrive` | Dropbox to Mydrive |
| `nfs-to-google` | Nfs to Google |

**Algorithm:**
1. Split by `-` (hyphen)
2. Capitalize first letter of each word
3. Replace `-to-` with ` to `
4. Join the parts

---

## Example Usage in DOCX Template

### Row 1: Content Migration
```
CloudFuze X-Change Data Migration | {{content_migration_name}} | {{users_cost}}
```

**Populates as:**
```
CloudFuze X-Change Data Migration | Sharefile to Google Sharedrive | $ 4,781.00
```

### Row 2: Messaging Migration
```
CloudFuze X-Change Data Migration | {{messaging_migration_name}} | {{users_cost}}
```

**Populates as:**
```
CloudFuze X-Change Data Migration | Slack to Teams | $ 990.00
```

---

## Fallback Behavior

### If No Exhibits Selected
- `{{messaging_migration_name}}` = `` (empty string)
- `{{content_migration_name}}` = `` (empty string)

### If API Fetch Fails
- `{{messaging_migration_name}}` = `Messaging Migration`
- `{{content_migration_name}}` = `Content Migration`

### If Exhibit Has No Combinations
- Uses exhibit name directly (e.g., "Slack to Teams Basic Plan")

### If Exhibit Has `combinations: ['all']`
- Uses exhibit name directly instead of parsing combination

---

## Testing Checklist

- [x] Code added to email generation section
- [x] Code added to download generation section
- [x] Tokens added to templateData in both sections
- [x] Fallback logic implemented for error cases
- [ ] Test with MESSAGE exhibit selected
- [ ] Test with CONTENT exhibit selected
- [ ] Test with both MESSAGE + CONTENT exhibits selected
- [ ] Test with no exhibits selected (should show empty)
- [ ] Test with exhibit that has `combinations: ['all']`
- [ ] Verify populated text in generated DOCX

---

## Related Files

### Modified
- ✅ `src/components/QuoteGenerator.tsx` - Added exhibit fetching + token generation logic (2 locations)

### Multi Combination Template
- ⚠️ User must add these tokens to their DOCX template:
  - `{{content_migration_name}}` in Row 1 Description cell
  - `{{messaging_migration_name}}` in Row 2 Description cell

---

## Console Logs Added

The implementation includes debug logging:

```
📎 Fetching exhibit metadata to generate migration names...
✅ Generated migration names: { messaging: 'Slack to Teams', content: 'Sharefile to Google Sharedrive' }
```

Or on error:
```
❌ Error fetching exhibits for migration names: [error details]
```

---

## Edge Cases Handled

1. **No exhibits selected** → Empty strings
2. **Only messaging exhibits selected** → Only messaging name populated
3. **Only content exhibits selected** → Only content name populated
4. **Multiple exhibits in same category** → Uses first exhibit's combination
5. **Exhibit with no combinations field** → Uses exhibit name
6. **API fetch failure** → Falls back to generic names
7. **Migration type is not Multi combination** → Tokens not populated (empty)

---

## Status

✅ **Implementation Complete**  
⚠️ **User Action Required:** Add `{{messaging_migration_name}}` and `{{content_migration_name}}` to Multi Combination DOCX template

---

## Next Steps (Optional Enhancements)

1. **Multiple Exhibit Support:** If user selects multiple exhibits in same category, concatenate names
2. **Custom Name Mapping:** Create a mapping file for more readable names (e.g., "Google MyDrive" instead of "Google Mydrive")
3. **Template Validation:** Warn user if template has these tokens but no exhibits selected
4. **Exhibit Name Override:** Allow exhibits to have a custom `displayName` field that overrides combination-based generation

---

**Implementation Date:** December 15, 2024  
**Status:** ✅ Ready for Testing
