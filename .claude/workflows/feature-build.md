# Workflow: Feature Build

## Purpose
End-to-end workflow for building a new feature from planning to deployment.

## When to Use
- Building a new feature (pricing change, new component, new API)
- Major refactoring that changes behavior
- Complex feature that touches multiple parts

## Workflow Steps

### Step 1: Plan & Design (30 min)
```
@research How to implement [feature]?

Questions to answer:
- What's the user workflow?
- What data changes?
- What APIs are needed?
- What's the UI?
- Testing strategy?

Output: Clear plan with:
✓ Architecture
✓ Database changes
✓ API endpoints
✓ Components
✓ Testing approach
```

### Step 2: Code Implementation (2-4 hours)
```
/scaffold [type] [component] "[description]"

For each component/API/utility:
1. Generate scaffold (5 min)
2. Fill in implementation (30-60 min)
3. Run /review (5 min)
4. Fix issues (10-20 min)
```

### Step 3: Test Locally (30 min)
```
/qa test [feature] with [scenarios]

Tests:
✓ Happy path (feature works normally)
✓ Error cases (invalid input)
✓ Edge cases (boundaries)
✓ Integration (works with existing features)

Output: Passing or failing tests
```

### Step 4: Code Review (15-30 min)
```
@code-reviewer review [files] for [focus]

Review checklist:
✓ Correctness (logic right?)
✓ Style (follows conventions?)
✓ Safety (secure?)
✓ Performance (efficient?)
✓ Tests (coverage adequate?)
```

### Step 5: Security Check (15 min)
```
@security-reviewer audit [feature] for vulnerabilities

Check:
✓ Input validation
✓ Authentication/authorization
✓ Data exposure
✓ Common attacks (injection, XSS)
```

### Step 6: Final QA (30 min)
```
/qa full test of [feature]

Full scenario:
✓ All 12 combinations (if pricing)
✓ All workflows (start to finish)
✓ Mobile/responsive
✓ Error scenarios
✓ Performance
```

### Step 7: Deploy (15-30 min)
```
/deploy to staging

Wait 5 minutes:
✓ Monitor for errors
✓ Check health checks
✓ Verify functionality

Then:
/deploy to production

Monitor 5 min:
✓ No errors
✓ Performance normal
✓ User flows working
```

## Workflow Timeline

| Step | Time | Owner |
|---|---|---|
| Plan | 30 min | @research |
| Code | 2-4 hours | Dev (A or B) |
| Test | 30 min | @qa-engineer |
| Review | 30 min | Other dev |
| Security | 15 min | @security-reviewer |
| Final QA | 30 min | Dev (A or B) |
| Deploy | 30 min | Dev (A or B) |
| **Total** | **5-7 hours** | Both |

## Example: Add Multi-Currency Support

### Step 1: Plan
```
@research How to add multi-currency pricing?

Result:
✓ User selects currency (USD, EUR, GBP)
✓ Prices auto-convert using exchange rates
✓ API endpoint: GET /api/pricing/currencies
✓ Components: CurrencySelector, ConvertedPrice
✓ Tests: All 12 combos in all 3 currencies
```

### Step 2: Code
```
/scaffold react component CurrencySelector "Allow user to choose currency"
/scaffold api route /api/pricing/currencies "List available currencies and rates"
/scaffold hook useCurrencyConversion "Handle currency conversion logic"
/scaffold test calculatePrice.test.js "Test pricing in multiple currencies"

Implement each:
- CurrencySelector component
- Currency API endpoint
- Conversion hook
- Tests for all 12 combos × 3 currencies
```

### Step 3: Test
```
/qa test multi-currency pricing with USD, EUR, GBP

✓ USD: All 12 combos correct
✓ EUR: All 12 combos correct
✓ GBP: All 12 combos correct
✓ Currency switch updates prices
✓ Mobile view works
✓ Error if currency unavailable
```

### Step 4: Review
```
@code-reviewer review src/hooks/useCurrencyConversion.js for correctness

Finds:
✓ Rounding correct
✓ Edge cases handled (0 price)
✓ No hardcoded rates
✓ Good error handling
```

### Step 5: Security
```
@security-reviewer audit multi-currency feature for vulnerabilities

Checks:
✓ Exchange rates from trusted source
✓ No rate tampering possible
✓ No price manipulation
✓ Safe error messages
```

### Step 6: Final QA
```
/qa full multi-currency test

✓ All 36 combinations (12 × 3 currencies)
✓ All workflows (plan to quote download)
✓ Mobile responsive
✓ Performance < 1 sec
✓ All error cases handled
```

### Step 7: Deploy
```
/deploy to staging
[Wait 5 min, verify]

/deploy to production
[Monitor 5 min]
```

## Checklist Before Starting

- [ ] Feature clearly defined (requirements understood)
- [ ] Design approved (UI/UX clear)
- [ ] Database changes designed (schema clear)
- [ ] Team aligned (no conflicts)
- [ ] Time available (5-7 hours blocked)

## Checklist Before Deployment

- [ ] Code review approved
- [ ] Security audit passed
- [ ] All tests passing
- [ ] QA fully tested
- [ ] No console.log() statements
- [ ] No TODO comments left
- [ ] Documentation updated

---

**Typical Duration:** 1 day for medium features
**Total Cost:** ~5-7 developer hours
**Risk:** Low (comprehensive testing)
