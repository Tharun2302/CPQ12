# /review — Code Quality Review

## Purpose
Quickly review code for bugs, style violations, complexity, and best practices.

## Usage
```
/review [scope]

Examples:
/review src/components/PricingCalculator.jsx
/review server.cjs
/review entire src/ folder
/review pricing logic changes
```

## What This Does

1. **Scans code** for the specified files/folders
2. **Checks against rules** in `.claude/rules/code-style.md`
3. **Finds bugs** (null pointer risks, logic errors, edge cases)
4. **Checks performance** (unused variables, inefficient loops)
5. **Suggests fixes** (with code examples)

## Output Format

```
🔍 Code Review: [file/scope]

🐛 Bugs Found: (X issues)
- Line 142: Null pointer risk (price could be undefined)
  Fix: Add `if (!price) price = 0;` before calculation

🎨 Style Issues: (X violations)
- Line 87: Variable naming (use camelCase)
  Current: `discount_percentage`
  Change to: `discountPercentage`

✅ Good Patterns:
- Nice error handling in calculatePrice()
- Good use of async/await
- Proper validation on API endpoints

⚠️ Performance:
- Consider memoizing calculatePrice (called 50+ times)
```

## When to Use

| Scenario | Use /review |
|---|---|
| Before committing code | ✅ YES |
| Before pushing to git | ✅ YES |
| Reviewing teammate's code | ✅ YES (then ask @code-reviewer for deep dive) |
| Debugging a bug | ✅ YES |
| Quick sanity check | ✅ YES |
| Deep architecture review | ❌ NO (use @code-reviewer agent instead) |

## What /review DOES
- ✅ Finds obvious bugs
- ✅ Checks code style
- ✅ Suggests refactoring
- ✅ Works on any file/folder

## What /review DOESN'T
- ❌ Can't run the code
- ❌ Can't test with real data
- ❌ Can't verify database interactions
- ❌ Can't deep audit (use @code-reviewer for that)

## Tips

- **Be specific:** `/review this function` works better than `/review entire project`
- **Add context:** `/review pricing-logic.js with focus on the 3-tier discount logic`
- **Check before merge:** Always `/review` before pushing to git
- **Fix one at a time:** If many issues, fix highest priority first

## Example

```
You: /review src/components/PricingCalculator.jsx

Claude reviews and returns:

🐛 Bugs Found: 2 issues
- Line 45: Missing null check on discount.percentage
- Line 78: Discount could exceed 100% (should cap at 50%)

🎨 Style: 1 issue
- Line 120: Use const instead of let

✅ Good:
- Nice component structure
- Good error handling in onCalculate

⚠️ Suggestions:
- Consider memoizing this component (it re-renders often)
```

After review, you'd fix those issues and commit.
