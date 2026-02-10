# Bundled Pricing (10% Discount) - Template Guide

## Overview

The bundled pricing column shows the **final price after applying a 10% discount** on all prices in the multicombination template. The backend calculates and provides bundled pricing values for all price fields.

**Formula:** Final Price = Original Price × 0.9 (or Original Price - 10% discount)

**Example:** If original price is $1,122.00, bundled price = $1,009.80 (not $112.20)

## Available Bundled Pricing Placeholders

### 1. Exhibits Loop ({{#exhibits}}...{{/exhibits}})

For each exhibit row in the loop, use:
- **`{{exhibitBundledPrice}}`** - Final price after 10% discount (90% of original exhibit price)

**Example in template:**
```xml
{{#exhibits}}
<w:tr>
  <w:tc><w:p><w:r><w:t>{{exhibitType}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{exhibitDesc}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{exhibitPrice}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{exhibitBundledPrice}}</w:t></w:r></w:p></w:tc>
</w:tr>
{{/exhibits}}
```

### 2. Managed Migration Service Row

For the "Managed Migration Service" row, use any of these:
- **`{{price_migration_bundled}}`** - Final price after 10% discount (90% of migration cost) (recommended)
- **`{{migration_cost_bundled}}`** - Alternative name
- **`{{migration_price_bundled}}`** - Alternative name
- **`{{migrationCostBundled}}`** - CamelCase version

**Example in template:**
```xml
<w:tr>
  <w:tc><w:p><w:r><w:t>Managed Migration Service</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>Managed Migration | Assigned Project Manager...</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{price_migration}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{price_migration_bundled}}</w:t></w:r></w:p></w:tc>
</w:tr>
```

### 3. Server/Instance Loop ({{#servers}}...{{/servers}})

For each server/instance row in the loop, use:
- **`{{serverPriceBundled}}`** - Final price after 10% discount (90% of server price) (recommended)
- **`{{serverBundledPrice}}`** - Alternative name

**Example in template:**
```xml
{{#servers}}
<w:tr>
  <w:tc><w:p><w:r><w:t>Instance Type</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{serverDescription}} {{combinationName}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{serverPrice}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{serverPriceBundled}}</w:t></w:r></w:p></w:tc>
</w:tr>
{{/servers}}
```

### 4. CloudFuze Manage Row

For the "CloudFuze Manage" row, use any of these:
- **`{{cloudfuze_manage_total_bundled}}`** - Final price after 10% discount (90% of total server/instance costs) (recommended)
- **`{{cloudfuzeManageTotalBundled}}`** - CamelCase version
- **`{{cloudfuze_manage_price_bundled}}`** - Alternative name
- **`{{cloudfuzeManagePriceBundled}}`** - CamelCase alternative

**Example in template:**
```xml
<w:tr>
  <w:tc><w:p><w:r><w:t>CloudFuze Manage</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t></w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{cloudfuze_manage_total}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{cloudfuze_manage_total_bundled}}</w:t></w:r></w:p></w:tc>
</w:tr>
```

## Complete Table Structure Example

Here's how your table should look with all bundled pricing placeholders:

| Job Requirement | Description | Price(USD) | Bundled Pricing(10%) |
|----------------|-------------|------------|----------------------|
| {{#exhibits}} | | | |
| {{exhibitType}} | {{exhibitDesc}} | {{exhibitPrice}} | **{{exhibitBundledPrice}}** |
| {{/exhibits}} | | | |
| Managed Migration Service | Managed Migration \| ... | {{price_migration}} | **{{price_migration_bundled}}** |
| {{#servers}} Instance Type | {{serverDescription}} {{combinationName}} | {{serverPrice}} | **{{serverPriceBundled}}** |
| {{/servers}} | | | |
| CloudFuze Manage | | {{cloudfuze_manage_total}} | **{{cloudfuze_manage_total_bundled}}** |
| Discount | {{discount_percent}}% Applied | {{discount_amount}} | |
| Total Price | | {{total_price_discount}} | |

## Implementation Details

- **Calculation**: All bundled prices are calculated as **90% (0.9) of the original price** (final price after 10% discount)
- **Formula**: `Final Price = Original Price × 0.9` or `Final Price = Original Price - (Original Price × 0.1)`
- **Formatting**: All values are automatically formatted as currency (e.g., "$5,032.62")
- **Availability**: These fields are available for both multicombination and single migration agreements

## Testing

To test bundled pricing:
1. Generate a multicombination agreement
2. Verify that each price row has a corresponding bundled price showing the final price after 10% discount
3. Check that:
   - Exhibit prices show final price after 10% discount (e.g., $1,122.00 → $1,009.80)
   - Migration service shows final price after 10% discount (e.g., $900.00 → $810.00)
   - Server/instance prices show final price after 10% discount (e.g., $500.00 → $450.00)

## Notes

- The bundled pricing shows the **final price after 10% discount**, not the discount amount
- **Example**: If original price is $1,122.00, bundled price = $1,009.80 (not $112.20)
- All values are formatted as currency strings (e.g., "$1,009.80")

