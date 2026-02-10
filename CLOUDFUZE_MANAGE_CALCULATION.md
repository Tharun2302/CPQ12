# CloudFuze Manage Pricing Calculation

## Overview

CloudFuze Manage represents the **total cost of all server/instance infrastructure** required for the migration. It is calculated as the sum of all server instance costs shown in the agreement.

## Calculation Logic

### For Multi-Combination Agreements

1. **Collect all server instances** from:
   - Messaging configurations (`messagingConfigs`)
   - Content configurations (`contentConfigs`)
   - Email configurations (`emailConfigs`)

2. **For each server instance**, calculate the cost:
   ```javascript
   // Try to get cost from breakdown first
   costFromBreakdown = getInstanceCostFor(kind, combinationName)
   
   // If not found, calculate directly
   if (costFromBreakdown > 0) {
     cost = costFromBreakdown
   } else {
     cost = computeInstanceCost(instanceType, months, instances)
   }
   
   // Where computeInstanceCost = getInstanceTypeCost(instanceType) * months * instances
   ```

3. **Sum all server costs**:
   ```javascript
   total = 0
   for each server in serversArray {
     total += server.serverPrice (extracted numeric value)
   }
   ```

4. **Set CloudFuze Manage total**:
   ```javascript
   cloudfuze_manage_total = total
   cloudfuze_manage_total_bundled = total * 0.1  // 10% discount
   ```

### For Single Migration Agreements

CloudFuze Manage = Instance Cost directly from calculation:
```javascript
cloudfuze_manage_total = instanceCost
cloudfuze_manage_total_bundled = instanceCost * 0.1
```

## Example Calculation

**Scenario:** Multi-combination with 2 servers:
- Server 1: "1 X Small server for messaging migration" = $500.00
- Server 2: "1 X Small server for data migration" = $500.00

**CloudFuze Manage Calculation:**
```
Total = $500.00 + $500.00 = $1,000.00
Bundled (10%) = $1,000.00 * 0.1 = $100.00
```

## Server Cost Calculation Details

### Instance Type Base Costs (per month):
- **Small**: $500/month
- **Standard**: $1,000/month
- **Large**: $2,000/month
- **Extra Large**: $5,000/month

### Formula:
```
Server Cost = Base Cost × Duration (months) × Number of Instances
```

**Example:**
- 1 X Small server for 1 month = $500 × 1 × 1 = **$500.00**
- 2 X Standard servers for 3 months = $1,000 × 3 × 2 = **$6,000.00**

## Code Location

The calculation happens in `QuoteGenerator.tsx`:
- **Lines 5618-5648**: Build servers array with individual server costs
- **Lines 5657-5665**: Sum all server prices to get total
- **Lines 5672-5682**: Set CloudFuze Manage total and bundled pricing

## Debugging

The code includes console logging to help debug:
```javascript
console.log('🔍 CloudFuze Manage Total Calculation:', {
  serversCount: serversArray.length,
  serverPrices: serversArray.map(s => s.serverPrice),
  total: formatCurrency(total),
  totalBundled: formatCurrency(total * 0.1)
});
```

## Common Issues

1. **Wrong value displayed**: Check if template is using `{{cloudfuze_manage_total_bundled}}` instead of `{{cloudfuze_manage_total}}`
2. **Missing servers**: Verify all server configurations are included in the calculation
3. **Incorrect breakdown costs**: Check if `getInstanceCostFor` is returning correct values from combination breakdowns

## Template Placeholders

- `{{cloudfuze_manage_total}}` - Total of all server costs (use this for the main price)
- `{{cloudfuze_manage_total_bundled}}` - 10% of total (use this for bundled pricing column)
- `{{cloudfuzeManageTotal}}` - Alternative camelCase version
- `{{cloudfuzeManageTotalBundled}}` - Alternative camelCase bundled version

