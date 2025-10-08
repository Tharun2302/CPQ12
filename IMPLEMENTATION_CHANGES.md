# Implementation Changes for Content Migration Type & Hide Discount

## Overview
This document contains all the changes needed to:
1. Add "Content" migration type option
2. Hide discount field from UI (keep functionality)
3. Implement Content pricing calculation with Excel formulas
4. Ensure Data Size field shows/hides correctly

---

## CHANGE 1: Add Content Migration Type to Dropdown

**File:** `src/components/ConfigurationForm.tsx`
**Line:** 564

**Current Code:**
```tsx
onChange={(e) => handleChange('migrationType', e.target.value as 'Messaging')}
```

**Change To:**
```tsx
onChange={(e) => handleChange('migrationType', e.target.value as 'Messaging' | 'Content')}
```

---

**Line:** 568

**Current Code:**
```tsx
                <option value="">Select Migration Type</option>
                <option value="Messaging">Messaging</option>
              </select>
```

**Change To:**
```tsx
                <option value="">Select Migration Type</option>
                <option value="Messaging">Messaging</option>
                <option value="Content">Content</option>
              </select>
```

---

## CHANGE 2: Hide Discount Field from UI

**File:** `src/components/ConfigurationForm.tsx`
**Line:** 782-840

**Current Code:**
```tsx
                {/* Discount and Messages Fields side by side */}
                <div className="group">
```

**Change To:**
```tsx
                {/* Discount - HIDDEN from UI but functionality retained for future use */}
                {false && (
                <div className="group">
```

**Line:** After line 840 (after the closing `</div>` of discount field)

**Add:**
```tsx
                )}
```

So the complete section becomes:
```tsx
                {/* Discount - HIDDEN from UI but functionality retained for future use */}
                {false && (
                <div className="group">
                  ... all existing discount code ...
                </div>
                )}

                {/* Messages Field */}
                <div className="group">
                  ... existing messages code ...
                </div>
```

---

## CHANGE 3: Add Content Migration Calculation

**File:** `src/utils/pricing.ts`
**Line:** After line 178 (after the closing brace of Messaging calculation)

**Replace the fallback section (lines 180-194) with this comprehensive Content calculation:**

```tsx
  // CONTENT MIGRATION CALCULATIONS (using Excel formulas)
  if (config.migrationType === 'Content') {
    // V/W lookup table (for K2 calculation)
    const vwLookup = [
      { threshold: 25, value: 25 },
      { threshold: 50, value: 20 },
      { threshold: 100, value: 18 },
      { threshold: 250, value: 16 },
      { threshold: 500, value: 14 },
      { threshold: 1000, value: 12.5 },
      { threshold: 1500, value: 11 },
      { threshold: 2000, value: 9 },
      { threshold: 5000, value: 8 },
      { threshold: 10000, value: 7.5 },
      { threshold: 50000, value: 7 },
      { threshold: Infinity, value: 0 }
    ];

    // V/X lookup table (K4 - user-based tier)
    const vxLookup = [
      { threshold: 25, value: 1 },
      { threshold: 50, value: 1 },
      { threshold: 100, value: 2 },
      { threshold: 250, value: 2 },
      { threshold: 500, value: 3 },
      { threshold: 1000, value: 4 },
      { threshold: 1500, value: 5 },
      { threshold: 2000, value: 6 },
      { threshold: 5000, value: 7 },
      { threshold: 10000, value: 8 },
      { threshold: 30000, value: 10 },
      { threshold: Infinity, value: 10 }
    ];

    // Q/R lookup table (K3 - data size based cost per GB)
    const qrLookup = [
      { threshold: 500, value: 1 },
      { threshold: 2500, value: 0.8 },
      { threshold: 5000, value: 0.7 },
      { threshold: 10000, value: 0.6 },
      { threshold: 20000, value: 0.5 },
      { threshold: 50000, value: 0.45 },
      { threshold: 100000, value: 0.4 },
      { threshold: 500000, value: 0.35 },
      { threshold: 1000000, value: 0.32 },
      { threshold: 2000000, value: 0.28 },
      { threshold: 3000001, value: 0.25 },
      { threshold: Infinity, value: 0.25 }
    ];

    // Q/S lookup table (K5 - data size based tier)
    const qsLookup = [
      { threshold: 500, value: 1 },
      { threshold: 2500, value: 2 },
      { threshold: 5000, value: 3 },
      { threshold: 10000, value: 4 },
      { threshold: 20000, value: 5 },
      { threshold: 50000, value: 6 },
      { threshold: 100000, value: 7 },
      { threshold: 500000, value: 9 },
      { threshold: 1000000, value: 10 },
      { threshold: 2000000, value: 11 },
      { threshold: 3000001, value: 11 },
      { threshold: Infinity, value: 11 }
    ];

    // Z/AC lookup table (managed migration cost by tier)
    const tierCostLookup = [
      { tier: 1, cost: 300 },
      { tier: 2, cost: 600 },
      { tier: 3, cost: 1500 },
      { tier: 4, cost: 2250 },
      { tier: 5, cost: 4500 },
      { tier: 6, cost: 9000 },
      { tier: 7, cost: 12000 },
      { tier: 8, cost: 15000 },
      { tier: 9, cost: 18750 },
      { tier: 10, cost: 22500 },
      { tier: 11, cost: 30000 }
    ];

    // Lookup function
    const lookupValue = (value: number, lookupArray: { threshold: number; value: number }[]): number => {
      for (let i = 0; i < lookupArray.length; i++) {
        if (value <= lookupArray[i].threshold) {
          return lookupArray[i].value;
        }
      }
      return lookupArray[lookupArray.length - 1].value;
    };

    // K2 = V/W lookup based on users
    const k2Value = lookupValue(config.numberOfUsers, vwLookup);
    // M2 = K2 * L2 (users)
    const m2 = k2Value * config.numberOfUsers;

    // Per User Cost formulas based on tier:
    // Basic: M2*1.2/users = K2*1.2
    // Standard: M2*1.4/users = K2*1.4  
    // Advanced: M2*1.6/users = K2*1.6
    const planKey = tier.name.toLowerCase() as 'basic' | 'standard' | 'advanced';
    let userCostPerUser: number;
    if (planKey === 'basic') {
      userCostPerUser = k2Value * 1.2;
    } else if (planKey === 'standard') {
      userCostPerUser = k2Value * 1.4;
    } else {
      userCostPerUser = k2Value * 1.6;
    }
    const userCost = userCostPerUser * config.numberOfUsers;

    // K3 = Q/R lookup based on data size (cost per GB)
    const k3Value = lookupValue(config.dataSizeGB, qrLookup);
    // M3 = K3 * L3 (data size)
    const m3 = k3Value * config.dataSizeGB;

    // Per GB Cost formulas:
    // Basic: K3 (no multiplier)
    // Standard: K3*1.5
    // Advanced: K3*1.8
    let perGBCost: number;
    if (planKey === 'basic') {
      perGBCost = k3Value;
    } else if (planKey === 'standard') {
      perGBCost = k3Value * 1.5;
    } else {
      perGBCost = k3Value * 1.8;
    }
    const dataCost = perGBCost * config.dataSizeGB;

    // Managed Migration Cost calculation:
    // K4 = V/X lookup based on users
    const k4Value = lookupValue(config.numberOfUsers, vxLookup);
    // K5 = Q/S lookup based on data size
    const k5Value = lookupValue(config.dataSizeGB, qsLookup);
    // K6 = MAX(K4, K5)
    const k6Value = Math.max(k4Value, k5Value);
    // M6 = Z/AC lookup based on K6 (tier)
    const tierCostEntry = tierCostLookup.find(t => t.tier === k6Value);
    const migrationCost = tierCostEntry ? tierCostEntry.cost : 300;

    // Instance cost (same for both migration types)
    const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;

    const totalCost = userCost + dataCost + instanceCost + migrationCost;

    console.log('📊 Content Migration Calculation:', {
      tier: tier.name,
      k2Value,
      m2,
      userCostPerUser,
      userCost,
      k3Value,
      m3,
      perGBCost,
      dataCost,
      k4Value,
      k5Value,
      k6Value,
      migrationCost,
      instanceCost,
      totalCost
    });

    return {
      userCost,
      dataCost,
      migrationCost,
      instanceCost,
      totalCost,
      tier
    };
  }
```

---

## Verification Checklist

After making these changes:

### ✅ Messaging Migration Type:
- [ ] Can select "Messaging" from dropdown
- [ ] Data Size field is HIDDEN
- [ ] Shows: Users, Instances, Duration, Messages
- [ ] Discount is HIDDEN from UI
- [ ] Calculation uses Messaging formula
- [ ] Pricing displays correctly

### ✅ Content Migration Type:
- [ ] Can select "Content" from dropdown
- [ ] Data Size field is VISIBLE
- [ ] Shows: Users, Instances, Duration, Data Size, Messages
- [ ] Discount is HIDDEN from UI
- [ ] Calculation uses Content formula (V/W, V/X, Q/R, Q/S, Z/AC lookups)
- [ ] Pricing displays correctly

### ✅ Discount Functionality:
- [ ] Discount UI is hidden in Configure session
- [ ] Discount still saves to sessionStorage/localStorage
- [ ] Discount still applies in pricing calculations
- [ ] Discount still shows in Quote session
- [ ] Can re-enable by changing `{false &&` to `{true &&`

---

## File Summary

### Files Modified:
1. **src/components/ConfigurationForm.tsx**
   - Added "Content" to migration type dropdown
   - Hidden discount field from UI (kept functionality)

2. **src/utils/pricing.ts**
   - Added full Content migration calculation
   - Implemented all Excel lookup tables
   - Preserved Messaging calculation (unchanged)

### Files to Review:
- Check that discount still works in `src/components/PricingComparison.tsx` ✅
- Check that discount still works in `src/components/QuoteGenerator.tsx` ✅
- Both already read from sessionStorage, no changes needed ✅

---

## Implementation Notes

1. **Data Size Visibility**: Already implemented correctly (line 757)
   - `{config.migrationType !== 'Messaging' &&` means:
   - Messaging = Hidden ✅
   - Content = Shown ✅

2. **Discount Field**: Wrapped in `{false &&` 
   - UI is hidden ✅
   - All logic remains functional ✅
   - Easy to re-enable in future ✅

3. **Calculations**:
   - Messaging: Uses existing proven formulas ✅
   - Content: Uses new Excel-based formulas ✅
   - Both support all tiers (Basic, Standard, Advanced) ✅

---

## Testing Steps

1. Start your dev server
2. Go to Configure session
3. Select "Messaging" → Data Size should be HIDDEN
4. Select "Content" → Data Size should be VISIBLE
5. Fill in details for both types
6. Calculate pricing
7. Verify calculations match Excel for Content
8. Verify Messaging calculations unchanged
9. Check that discount is hidden but still works in background

---
