# Workflow: Bug Fix

## Purpose
Structured approach to finding, fixing, and verifying bug fixes.

## When to Use
- Fixing reported bugs
- Fixing discovered bugs during development
- Fixing test failures
- Hotfixes for production issues

## Workflow Steps

### Step 1: Understand the Bug (15 min)
```
Document:
- What should happen? (expected behavior)
- What actually happens? (actual behavior)
- When does it occur? (steps to reproduce)
- How often? (always/sometimes)
- User impact? (critical/high/medium/low)

Example:
- Expected: 3-tier discount at 10% for 5+ items
- Actual: Discount at 20% for 5+ items
- Steps: Open calculator, select qty 5, see discount
- Impact: CRITICAL (customer charged less than should)
```

### Step 2: Reproduce the Bug (15 min)
```
/qa test to reproduce [bug description]

Verify:
✓ Bug consistently reproduces
✓ Steps documented
✓ Screenshot/video of issue
✓ Frequency confirmed (always/intermittent)

If can't reproduce:
→ Might be environment-specific
→ Ask for more details
→ Test on different browser/device
```

### Step 3: Find Root Cause (30 min)
```
@code-reviewer review [relevant files] for [bug description]

Find:
✓ Where is the bug in the code?
✓ What's the root cause?
✓ Is it widespread (other similar bugs)?
✓ When was it introduced?

OR

@research how to debug [issue]?

If complex bug:
- Understand problem space
- Check similar bugs in codebase
- Recommend debug approach
```

### Step 4: Fix the Bug (30-60 min)
```
Code the fix:
1. Make minimal change (don't refactor)
2. Only fix this bug (don't add features)
3. Add comment explaining fix (if non-obvious)
4. Test the fix locally

Example:
```javascript
// Before (buggy)
discount = baseTier * quantity; // Missing check for max 50%

// After (fixed)
let discount = baseTier * quantity;
discount = Math.min(discount, 0.5); // Cap at 50% per compliance
```
```

### Step 5: Verify Fix (30 min)
```
/qa test [bug is fixed]

Verify:
✓ Original bug is gone
✓ No new bugs introduced (regression test)
✓ Related functionality still works
✓ Edge cases handled

For pricing bugs MUST test:
✓ All 12 combinations
✓ All discount tiers
✓ Edge cases (0, negative, very large)
```

### Step 6: Code Review (15-30 min)
```
@code-reviewer review fix for [bug name]

Review:
✓ Fix correct (solves the problem)?
✓ Minimal (no unnecessary changes)?
✓ Safe (doesn't break anything)?
✓ Well-commented (if needed)?
✓ Follows conventions?
```

### Step 7: Test Coverage (15 min)
```
Did the fix add test coverage?

If pricing/logic bug:
- Must have unit test for the fix
- Test the exact bug scenario
- Test edge cases

If UI bug:
- Should have regression test
- Verify it doesn't reappear

Example:
```javascript
test('3-tier discount capped at 50%', () => {
  const result = calculatePrice({
    baseTier: 0.8,
    quantity: 100 // Would be 80%, should be 50%
  });
  expect(result).toBeLessThanOrEqual(0.5);
});
```
```

### Step 8: Deploy Fix (15 min)
```
If critical bug:
/deploy hotfix to production

If normal bug:
/deploy to staging
[Verify]
/deploy to production
```

## Workflow Timeline

| Step | Time | Owner |
|---|---|---|
| Understand | 15 min | Dev |
| Reproduce | 15 min | @qa-engineer |
| Root cause | 30 min | @code-reviewer or @research |
| Fix | 30-60 min | Dev |
| Verify | 30 min | @qa-engineer |
| Review | 30 min | Other dev |
| Test coverage | 15 min | Dev |
| Deploy | 15 min | Dev |
| **Total** | **3-4 hours** | Both |

## Example: Pricing Discount Bug

### Step 1: Understand
```
Bug Report:
- Expected: Customer with qty 5 pays $450 (10% discount)
- Actual: Customer with qty 5 pays $400 (20% discount)
- Steps: Open calculator, enter qty 5, see discount applied
- Impact: CRITICAL (significant revenue loss)
```

### Step 2: Reproduce
```
/qa test pricing bug with quantity 5

Results:
✓ Confirmed: qty 5 shows 20% discount (should be 10%)
✓ All 12 combos affected? (yes, all 3-tier)
✓ Intermittent or always? (always)
✓ Screenshot: [shows 20% instead of 10%]

Root cause location: pricing logic
```

### Step 3: Find Root Cause
```
@code-reviewer review pricing-logic.js for discount error

Finding:
- Line 87: Discount applied twice
- Code: discount = baseTier * multiplier * quantity
- Should be: discount = baseTier * multiplier

Root cause: Discount multiplied by quantity accidentally
Impact: All 3-tier discounts doubled
```

### Step 4: Fix
```
File: pricing-logic.js
Line 87: change from:
  discount = baseTier * multiplier * quantity;
to:
  discount = baseTier * multiplier;
  // Quantity already factored in baseTier calculation
```

### Step 5: Verify
```
/qa test all 12 combinations after fix

Results:
✓ qty 5: 10% discount (correct!)
✓ qty 10: 20% discount (correct!)
✓ qty 20: 25% discount (correct!)
✓ All 12 combos: correct pricing
✓ No regressions
```

### Step 6: Review
```
@code-reviewer review pricing fix

Feedback:
✓ Fix correct
✓ Minimal change (good)
✓ Comment explains why
✓ No side effects
✓ Approved
```

### Step 7: Test Coverage
```
Add test:
test('3-tier discount for qty 5 should be 10%', () => {
  const result = calculatePrice({ qty: 5, tier: '3tier' });
  expect(result).toBe(450); // $100 * 5 * 0.9
});
```

### Step 8: Deploy
```
/deploy hotfix to production
(Critical bug = direct to production)

Monitor:
✓ No errors
✓ Customers can quote again
✓ Pricing correct
✓ Revenue restored
```

## Checklist Before Starting Fix

- [ ] Bug reproduced and documented
- [ ] Root cause identified
- [ ] Not a misunderstanding/feature request
- [ ] Impact assessed (critical/high/medium/low)

## Checklist Before Deployment

- [ ] Bug fix verified working
- [ ] No regressions found
- [ ] Code reviewed and approved
- [ ] Test added (if logic change)
- [ ] All related bugs fixed too
- [ ] No console.log() left

## Special Cases

### Intermittent Bug
- [ ] Reproduce multiple times (not one-off)
- [ ] Check for race conditions
- [ ] Check for timing issues
- [ ] Might need longer testing

### Production Bug
- [ ] Hotfix directly if critical
- [ ] Document impact/fix before deploying
- [ ] Plan permanent fix for next sprint
- [ ] Monitor closely after fix

### Cascading Bugs
- [ ] If this bug causes others
- [ ] Fix root cause, not symptoms
- [ ] Check if other similar bugs exist
- [ ] Fix all related bugs together

---

**Typical Duration:** 2-4 hours
**Risk:** Medium (depends on bug complexity)
**Goal:** Get to "verified fix" as fast as possible
