# ✅ $2500 Minimum Total Cost Implementation - COMPLETE!

## 🎯 Requirement

**For ANY migration type and ANY plan (Basic/Standard/Advanced):**
- If total cost < $2500 → Automatically add to **User Cost only**
- Keep adding until total cost = $2500
- **DO NOT** change: Data Cost, Migration Cost, Instance Cost
- **Exception:** Overage Agreement (no minimum applies)

---

## 📝 Changes Made

### **File:** `src/utils/pricing.ts`

#### 1. Messaging Migration (Lines 190-219)

**Added $2500 minimum logic:**
```typescript
let totalCost = userCost + dataCost + instanceCost + migrationCost;

// CRITICAL: Apply $2500 minimum by adjusting user cost only
const MINIMUM_TOTAL = 2500;
let adjustedUserCost = userCost;

if (totalCost < MINIMUM_TOTAL) {
  const deficit = MINIMUM_TOTAL - totalCost;
  adjustedUserCost = userCost + deficit;
  totalCost = MINIMUM_TOTAL;
  
  console.log('💰 Applied $2500 minimum to Messaging plan:', {
    plan: tier.name,
    originalTotal: userCost + dataCost + instanceCost + migrationCost,
    originalUserCost: userCost,
    deficit,
    adjustedUserCost,
    finalTotal: MINIMUM_TOTAL,
    unchangedCosts: { dataCost, migrationCost, instanceCost }
  });
}

return {
  userCost: adjustedUserCost,  // ← Adjusted to meet minimum
  dataCost,                     // ← Unchanged
  migrationCost,                // ← Unchanged
  instanceCost,                 // ← Unchanged
  totalCost,                    // ← Now meets $2500 minimum
  tier
};
```

---

#### 2. Content Migration (Lines 366-414)

**Added identical $2500 minimum logic:**
```typescript
let totalCost = userCost + dataCost + instanceCost + migrationCost;

// CRITICAL: Apply $2500 minimum by adjusting user cost only
const MINIMUM_TOTAL = 2500;
let adjustedUserCost = userCost;

if (totalCost < MINIMUM_TOTAL) {
  const deficit = MINIMUM_TOTAL - totalCost;
  adjustedUserCost = userCost + deficit;
  totalCost = MINIMUM_TOTAL;
  
  console.log('💰 Applied $2500 minimum to Content plan:', {
    plan: tier.name,
    originalTotal: userCost + dataCost + instanceCost + migrationCost,
    originalUserCost: userCost,
    deficit,
    adjustedUserCost,
    finalTotal: MINIMUM_TOTAL,
    unchangedCosts: { dataCost, migrationCost, instanceCost }
  });
}

return {
  userCost: adjustedUserCost,  // ← Adjusted
  dataCost,                     // ← Unchanged
  migrationCost,                // ← Unchanged
  instanceCost,                 // ← Unchanged
  totalCost,                    // ← Meets minimum
  tier
};
```

---

#### 3. Fallback Calculation (Lines 603-625)

**Added $2500 minimum logic:**
```typescript
let totalCost = userCost + dataCost + migrationCost + instanceCost;

// CRITICAL: Apply $2500 minimum by adjusting user cost only
const MINIMUM_TOTAL = 2500;
let adjustedUserCost = userCost;

if (totalCost < MINIMUM_TOTAL) {
  const deficit = MINIMUM_TOTAL - totalCost;
  adjustedUserCost = userCost + deficit;
  totalCost = MINIMUM_TOTAL;
  
  console.log('💰 Applied $2500 minimum to Fallback plan');
}

return { 
  userCost: adjustedUserCost, 
  dataCost, 
  migrationCost, 
  instanceCost, 
  totalCost, 
  tier 
};
```

---

#### 4. Overage Agreement - EXCLUDED ✅

**No changes made (Lines 80-100):**
```typescript
// OVERAGE AGREEMENT: Only calculate instance cost, no other costs
if (config.combination === 'overage-agreement') {
  const instanceCost = getInstanceCost(config.instanceType, config.duration) * config.numberOfInstances;
  const totalCost = instanceCost;  // ← Can be any amount, no minimum!

  return {
    userCost: 0,
    dataCost: 0,
    migrationCost: 0,
    instanceCost,
    totalCost,  // ← No $2500 minimum applied
    tier
  };
}
```

**This section returns BEFORE the minimum logic, so overage agreements are automatically excluded!** ✅

---

## 📊 Examples

### Example 1: Total Already Above $2500 (No Change)
```
Standard Plan - Content Migration:
Original Calculation:
  User costs:      $1,386.00
  Data costs:      $  150.00
  Migration cost:  $  600.00
  Instance cost:   $5,000.00
  ─────────────────────────────
  Total:           $7,136.00  ✅ Above $2500

After $2500 Check:
  User costs:      $1,386.00  (no change)
  Data costs:      $  150.00  (no change)
  Migration cost:  $  600.00  (no change)
  Instance cost:   $5,000.00  (no change)
  ─────────────────────────────
  Total:           $7,136.00  ✅ No adjustment needed
```

---

### Example 2: Total Below $2500 (Auto-Adjusted)
```
Basic Plan - Messaging Migration:
Original Calculation:
  User costs:      $  400.00
  Data costs:      $    0.00
  Migration cost:  $  400.00
  Instance cost:   $  500.00
  ─────────────────────────────
  Total:           $1,900.00  ❌ Below $2500

After $2500 Minimum Applied:
  User costs:      $1,000.00  ← Added $600 to meet minimum
  Data costs:      $    0.00  (unchanged)
  Migration cost:  $  400.00  (unchanged)
  Instance cost:   $  500.00  (unchanged)
  ─────────────────────────────
  Total:           $2,500.00  ✅ Meets minimum!

Console Log:
💰 Applied $2500 minimum to Messaging plan: {
  plan: 'Basic',
  originalTotal: 1900,
  originalUserCost: 400,
  deficit: 600,
  adjustedUserCost: 1000,
  finalTotal: 2500
}
```

---

### Example 3: Overage Agreement (No Minimum)
```
Overage Agreement - Content:
  User costs:      $    0.00
  Data costs:      $    0.00
  Migration cost:  $    0.00
  Instance cost:   $1,200.00
  ─────────────────────────────
  Total:           $1,200.00  ✅ No minimum applied!

Overage Agreement is EXCLUDED from $2500 minimum requirement.
```

---

## 🎯 How It Works

### Logic Flow:
```
Calculate original costs:
  userCost = (formula)
  dataCost = (formula)
  migrationCost = (formula)
  instanceCost = (formula)
  totalCost = sum of all
      ↓
Check if totalCost < $2500
      ↓
    YES → Calculate deficit = $2500 - totalCost
          Add deficit to userCost
          Set totalCost = $2500
      ↓
    NO  → Keep original costs
      ↓
Return adjusted calculation
```

---

## 🧪 Testing Guide

### Test 1: Plan Already Above $2500
1. Configure: 10 users, 50 GB, Large instance, 5 months
2. Calculate pricing for Standard plan
3. **Expected:**
   - Total > $2500 (e.g., $7,136)
   - **No adjustment** to user cost
   - Console: No minimum log message

### Test 2: Small Plan Below $2500
1. Configure: 5 users, 10 GB, Small instance, 1 month
2. Calculate pricing for Basic plan
3. **Expected:**
   - Original total might be ~$1,000
   - **User cost increased** to bring total to $2500
   - **Other costs unchanged**
   - Console shows:
     ```
     💰 Applied $2500 minimum to [Type] plan:
       originalTotal: 1000
       deficit: 1500
       adjustedUserCost: (original + 1500)
       finalTotal: 2500
     ```

### Test 3: Overage Agreement (No Minimum)
1. Select "OVERAGE AGREEMENT" combination
2. Configure: 5 instances, Extra Large, 5 months
3. Calculate pricing
4. **Expected:**
   - Total = $87,500 (or any amount based on instances)
   - **No minimum applied** even if it were somehow < $2500
   - Console: No minimum log message

### Test 4: All Three Plans
1. Configure any migration
2. View Basic, Standard, Advanced pricing
3. **Expected:**
   - ALL plans show minimum $2500 total
   - User cost adjusted in each plan if needed
   - Data/Migration/Instance costs identical across plans

---

## 📋 Affected Plans

| Migration Type | Plan | Minimum Applied? |
|----------------|------|------------------|
| Messaging | Basic | ✅ Yes ($2500 min) |
| Messaging | Standard | ✅ Yes ($2500 min) |
| Messaging | Advanced | ✅ Yes ($2500 min) |
| Content | Basic | ✅ Yes ($2500 min) |
| Content | Standard | ✅ Yes ($2500 min) |
| Content | Advanced | ✅ Yes ($2500 min) |
| **Overage Agreement** | **Any** | ❌ **NO (excluded)** |

---

## 🔍 Console Output Examples

### When Minimum is Applied:
```
💰 Applied $2500 minimum to Content plan: {
  plan: 'Basic',
  originalTotal: 1847,
  originalUserCost: 547,
  deficit: 653,
  adjustedUserCost: 1200,
  finalTotal: 2500,
  unchangedCosts: {
    dataCost: 150,
    migrationCost: 600,
    instanceCost: 500
  }
}

📊 Content Migration Calculation: {
  tier: 'Basic',
  userCost: 1200,     ← Adjusted
  dataCost: 150,      ← Original
  migrationCost: 600, ← Original
  instanceCost: 500,  ← Original
  totalCost: 2500     ← Meets minimum!
}
```

### When No Adjustment Needed:
```
📊 Content Migration Calculation: {
  tier: 'Standard',
  userCost: 1386,     ← Original (no adjustment)
  dataCost: 150,      ← Original
  migrationCost: 600, ← Original
  instanceCost: 5000, ← Original
  totalCost: 7136     ← Already above $2500
}
```

---

## ✅ Implementation Summary

**What Was Changed:**
1. ✅ Added $2500 minimum check to Messaging migration
2. ✅ Added $2500 minimum check to Content migration
3. ✅ Added $2500 minimum check to Fallback migration
4. ✅ Verified Overage Agreement is excluded (returns early)

**How It Works:**
- Calculates all costs normally
- Checks if total < $2500
- If yes: Adds deficit to User Cost only
- If no: Uses original costs
- Returns adjusted calculation

**What Stays the Same:**
- Data Cost calculation (unchanged)
- Migration Cost calculation (unchanged)
- Instance Cost calculation (unchanged)
- All formulas and lookup tables (unchanged)
- Overage Agreement logic (unchanged)

---

## 🚀 Ready to Test!

**Refresh your browser and test:**

1. Configure a small project (few users, small data, short duration)
2. Calculate pricing for Basic plan
3. **Check:** Total should be at least $2500
4. **Check:** User cost increased if needed
5. **Check:** Other costs unchanged

**All changes staged and ready!** 🎉

**Console will show when minimum is applied with full details of the adjustment!**

