# Single Migration Bundled Pricing - Template Placeholders

## Overview

For **single migration** agreements (not multi-combination), the template structure is different. The Instance Type row is **static** (not in a loop), so it uses different placeholders than multi-combination templates.

## Correct Placeholders for Single Migrations

### 1. CloudFuze X-Change Data Migration Row (Exhibits Loop)

**Use:** `{{exhibitBundledPrice}}` inside the `{{#exhibits}}...{{/exhibits}}` loop

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

### 2. Managed Migration Service Row (Static)

**Use:** `{{price_migration_bundled}}` or any of these alternatives:
- `{{migrationBundled}}`
- `{{migration_cost_bundled}}`
- `{{migration_price_bundled}}`
- `{{migrationCostBundled}}`

```xml
<w:tr>
  <w:tc><w:p><w:r><w:t>Managed Migration Service</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>Managed Migration | Assigned Project Manager...</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{price_migration}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{price_migration_bundled}}</w:t></w:r></w:p></w:tc>
</w:tr>
```

### 3. Instance Type Row (Static - NOT in servers loop)

**⚠️ IMPORTANT:** For single migrations, the Instance Type row is **static** (not in `{{#servers}}` loop).

**Use:** `{{instance_cost_bundled}}` or `{{instanceCostBundled}}`

```xml
<w:tr>
  <w:tc><w:p><w:r><w:t>Instance Type</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{instance_users}} {{instance_type}} Instance in a High-End Enterprise Server</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{instance_cost}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{instance_cost_bundled}}</w:t></w:r></w:p></w:tc>
</w:tr>
```

**❌ DO NOT USE:** `{{serverPriceBundled}}` or `{{serverBundledPrice}}` for single migrations - these only work in the `{{#servers}}` loop for multi-combination agreements.

### 4. CloudFuze Manage Row (Static)

**Use:** `{{cfm_user_total_b}}` or any of these alternatives:
- `{{cloudfuze_manage_total_bundled}}`
- `{{cloudfuzeManageTotalBundled}}`
- `{{cloudfuze_manage_price_bundled}}`
- `{{cloudfuzeManagePriceBundled}}`
- `{{cfm_total_b}}`

```xml
<w:tr>
  <w:tc><w:p><w:r><w:t>CloudFuze Manage</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>Per User $399</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{cfm_user_total}}</w:t></w:r></w:p></w:tc>
  <w:tc><w:p><w:r><w:t>{{cfm_user_total_b}}</w:t></w:r></w:p></w:tc>
</w:tr>
```

## Complete Table Structure for Single Migrations

| Job Requirement | Description | Price(USD) | Bundled Pricing(10%) |
|----------------|-------------|------------|----------------------|
| {{#exhibits}} | | | |
| {{exhibitType}} | {{exhibitDesc}} | {{exhibitPrice}} | **{{exhibitBundledPrice}}** |
| {{/exhibits}} | | | |
| Managed Migration Service | Managed Migration \| ... | {{price_migration}} | **{{price_migration_bundled}}** |
| Instance Type | {{instance_users}} {{instance_type}} Instance... | {{instance_cost}} | **{{instance_cost_bundled}}** |
| CloudFuze Manage | Per User $399 | {{cfm_user_total}} | **{{cfm_user_total_b}}** |
| Discount | {{discount_percent}}% Applied | {{discount_amount}} | |
| Total Price | | {{total_price_discount}} | |

## Key Differences: Single vs Multi-Combination

| Row | Single Migration | Multi-Combination |
|-----|-----------------|-------------------|
| **CloudFuze X-Change** | `{{exhibitBundledPrice}}` (in loop) | `{{exhibitBundledPrice}}` (in loop) |
| **Managed Migration** | `{{price_migration_bundled}}` (static) | `{{price_migration_bundled}}` (static) |
| **Instance Type** | `{{instance_cost_bundled}}` (static) | `{{serverPriceBundled}}` (in `{{#servers}}` loop) |
| **CloudFuze Manage** | `{{cfm_user_total_b}}` (static) | `{{cfm_user_total_b}}` (static) |

## Common Issues

### Issue 1: Empty Bundled Pricing for Instance Type Row

**Problem:** Using `{{serverPriceBundled}}` in a static row for single migrations.

**Solution:** Use `{{instance_cost_bundled}}` instead.

### Issue 2: Empty Bundled Pricing for CloudFuze X-Change Row

**Problem:** Template not using `{{exhibitBundledPrice}}` in the bundled column.

**Solution:** Ensure the bundled column in the `{{#exhibits}}` loop uses `{{exhibitBundledPrice}}`.

## Verification

After updating your template:

1. Generate a single migration agreement
2. Check that all bundled pricing cells are populated:
   - CloudFuze X-Change: Should show 90% of exhibit price
   - Managed Migration: Should show 90% of migration cost
   - Instance Type: Should show 90% of instance cost
   - CloudFuze Manage: Should show 90% of cfm_user_total

## Code Reference

The bundled pricing is calculated in `QuoteGenerator.tsx`:
- **Exhibits:** Line 5531 - `exhibitData.exhibitBundledPrice = formatCurrency(bundledPrice);`
- **Instance:** Line 6375-6377 - `templateData['{{instance_cost_bundled}}'] = formatCurrency(instanceBundled);`
- **Migration:** Line 6383-6387 - `templateData['{{price_migration_bundled}}'] = formatCurrency(migrationBundled);`
- **CloudFuze Manage:** Line 6363 - `templateData['{{cfm_user_total_b}}'] = formatCurrency(cfmUserTotalBundled);`

