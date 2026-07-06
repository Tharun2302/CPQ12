# /qa — Browser-Based Testing

## Purpose
Run the application in a real browser and test functionality end-to-end.

## Usage
```
/qa [scenario]

Examples:
/qa test pricing calculator with 3-tier discount
/qa full quote generation flow
/qa upload and process documents
/qa test all 12 product combinations
/qa check responsive design on mobile
```

## What This Does

1. **Starts the app** (npm run dev:all)
2. **Opens browser** (automated)
3. **Runs test scenario** (step by step)
4. **Takes screenshots** (evidence of issues)
5. **Reports findings** (bugs, UX issues, regressions)

## Test Scenarios

### Pricing Calculator
```
/qa test pricing calculator with 3-tier discount

Tests:
✓ Load calculator page
✓ Select quantity 5 (triggers 10% discount)
✓ Verify total shows discounted price
✓ Change quantity to 15 (triggers 20% discount)
✓ Verify price updates correctly
✓ Test edge case: quantity 0
✓ Test edge case: very large quantity
```

### Quote Generation Flow
```
/qa full quote generation flow

Tests:
✓ Login with Azure AD
✓ Create new quote
✓ Fill in customer details
✓ Select product combination
✓ Apply discount
✓ Generate DOCX
✓ Download file
✓ Verify file content
```

### Document Upload
```
/qa upload and process documents

Tests:
✓ Click upload button
✓ Select file (test.docx)
✓ Verify upload progress
✓ Check success message
✓ Verify file appears in exhibit list
✓ Download converted PDF
✓ Verify PDF content
```

## Output Format

```
🧪 QA Test: [scenario]
Status: PASS / FAIL

✅ Passed Tests: (X)
- Pricing calculator loads
- 3-tier discount applies correctly
- Document downloads successfully

❌ Failed Tests: (X)
- Responsive design broken on mobile (screenshot: [link])
  Issue: Button text cut off on screens < 375px
  
⚠️ UI Issues:
- Error message too small (hard to read)
- Loading spinner doesn't appear on slow network

📱 Browser Coverage:
- Chrome: ✅
- Firefox: ✅
- Safari: ❓ (not tested)
- Mobile: ❓ (not tested)
```

## When to Use

| Scenario | Use /qa |
|---|---|
| Before pushing code | ✅ YES |
| After pricing changes | ✅ YES (test all 12 combos) |
| After UI changes | ✅ YES |
| Finding bugs before users do | ✅ YES |
| Regression testing | ✅ YES |
| Code review | ⚠️ MAYBE (quick check) |
| Full security audit | ❌ NO (use @security-reviewer) |

## What /qa DOES
- ✅ Tests real app functionality
- ✅ Finds UI/UX bugs
- ✅ Verifies workflows end-to-end
- ✅ Takes screenshots of issues
- ✅ Tests edge cases
- ✅ Checks responsive design

## What /qa DOESN'T
- ❌ Can't test on real devices (only browser simulation)
- ❌ Can't test with production data
- ❌ Can't test with real payment systems
- ❌ Can't test performance under load
- ❌ Can't audit security (use @security-reviewer)

## Test Checklist

### Before Every Commit
- [ ] `/qa test pricing calculator` — verify pricing works
- [ ] `/qa check responsive design` — mobile/tablet view
- [ ] `/qa test quote generation flow` — end-to-end works

### After Pricing Changes
- [ ] `/qa test all 12 product combinations` — each combo works
- [ ] `/qa test discount logic` — 3-tier, multi-pack, promotional
- [ ] `/qa verify price calculations` — no rounding errors

### After UI Changes
- [ ] `/qa check responsive design` — all screen sizes
- [ ] `/qa test form validation` — errors show correctly
- [ ] `/qa verify accessibility` — keyboard navigation works

## Tips

- **Be specific:** `/qa test pricing with 3-tier discount` beats `/qa test the app`
- **Test edge cases:** Empty fields, large numbers, special characters
- **Take notes:** If you find a bug, document steps to reproduce
- **Test on multiple browsers:** `/qa cross-browser check`
- **Test mobile:** `/qa responsive design check` (mobile view)

## Example

```
You: /qa test pricing calculator with 3-tier discount

Claude opens app, runs tests:

✅ Tests Passed: 8
- Calculator loads
- Quantity 5 shows 10% discount
- Quantity 10 shows 20% discount
- Edge case: quantity 0 returns $0
- Price recalculates on input change
- Error shows for negative quantity
- Discount capped at 50%

❌ Tests Failed: 1
- Responsive design broken on mobile (< 375px)
  Screenshot shows: Button text "Calculate" is cut off

⚠️ Findings:
- Loading spinner doesn't appear (UX issue)
- Error message font too small (readability)

Time taken: 5 minutes
Next step: Fix mobile responsive issue, then rerun /qa
```

After QA passes, you're ready to commit.
