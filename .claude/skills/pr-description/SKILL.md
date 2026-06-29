# Skill: PR Description Template

## Description
Auto-triggers when writing PR descriptions or commit messages. Ensures clear, useful PR messages.

## When Auto-Triggers
- Writing PR description/title
- Creating commit message
- Request contains "PR description", "commit message"

## Template

```markdown
## Summary
[1-2 sentences: What changed and why]

Example:
- "Fix: 3-tier discount calculation was applying twice, causing undercharging"
- "Feature: Add multi-currency support with automatic conversion"
- "Refactor: Split PricingCalculator into smaller components"

## What Changed
- [ ] Feature added / Bug fixed / Refactoring / Docs updated
- [ ] Files changed: (list key files)
- [ ] Database schema changed: (if applicable)
- [ ] API endpoints changed: (if applicable)

## How to Test
1. [Step 1 to reproduce/test]
2. [Step 2]
3. [Expected result]

Examples:
- "Open pricing calculator, select quantity 10, verify 20% discount applies"
- "Upload document.docx, verify it converts to PDF correctly"
- "Login with Azure AD, verify quote saves to current user"

## Checklist
- [ ] Tests written (if new code)
- [ ] No console.log() statements
- [ ] Code reviewed with @code-reviewer
- [ ] QA tested with `/qa`
- [ ] Security checked if sensitive changes
- [ ] Updated docs if API changed

## Notes
[Any additional context: breaking changes, migration steps, known issues, etc.]

Example:
- "Breaking: /api/quotes response now includes 'discount' field"
- "Requires database migration: npm run migrate:discounts"
- "Known issue: Large file uploads may timeout (will fix in next PR)"
```

## Key Rules

**Summary Line:**
- Start with action: "Fix:", "Feature:", "Refactor:", "Docs:", "Chore:"
- Under 70 characters
- Example: "Fix: Pricing discount calculation applying twice"

**Why NOT This:**
- ❌ "Update files" (too vague)
- ❌ "Fix stuff" (not specific)
- ❌ "As per requirement" (link to issue instead)

**Why This:**
- ✅ "Fix: 3-tier discount applying twice, causing undercharging"
- ✅ "Feature: Add document version history"
- ✅ "Refactor: Extract pricing logic to separate module"

**Test Section:**
- Step-by-step instructions
- Another developer should be able to follow
- Include expected result
- Include edge cases if applicable

**Checklist:**
- Quick verification that work is complete
- Other reviewers use this to verify
- Don't leave unchecked boxes

---

**Good PR = Clear summary + How to test + Passing checks**
