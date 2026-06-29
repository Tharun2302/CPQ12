# Skill: Code Review Focus

## Description
Auto-triggers when reviewing code or PRs. Ensures systematic review covering all critical areas.

## When Auto-Triggers
- Request contains "review code", "code review", "PR review"
- Looking at pull request changes
- Before merging branch

## What This Skill Does

Reminds you to check:

**1. Correctness**
- [ ] Logic correct? (no off-by-one, wrong operator, etc.)
- [ ] Edge cases handled? (null, empty, zero, negative)
- [ ] Error handling present? (try-catch, validation)

**2. Style & Readability**
- [ ] Follow CLAUDE.md conventions? (naming, structure)
- [ ] Clear variable names? (no `x`, `temp`, `var`)
- [ ] Comments explain WHY? (not WHAT)
- [ ] No console.log() statements?

**3. Safety (Security & Data)**
- [ ] Input validated? (no injection risks)
- [ ] No secrets in code? (check .env only)
- [ ] Error messages safe? (no sensitive data leaks)
- [ ] Database queries safe? (parameterized, validated)

**4. Performance**
- [ ] Unnecessary loops? (N+1 queries?)
- [ ] Unused variables? (code smell)
- [ ] Could use cache? (expensive operation?)
- [ ] Component re-renders excessive? (memoize?)

**5. Testing**
- [ ] Tests written? (especially pricing logic)
- [ ] Tests cover happy path? (valid input works)
- [ ] Tests cover errors? (invalid input handled)
- [ ] Tests cover edge cases? (boundaries)

## Review Checklist

```
CODE REVIEW CHECKLIST:

Correctness
  ☐ Logic correct
  ☐ Edge cases handled
  ☐ Error handling present

Style
  ☐ Follows conventions
  ☐ Clear naming
  ☐ Good comments
  ☐ No console.log()

Safety
  ☐ Input validated
  ☐ No secrets exposed
  ☐ Safe error messages
  ☐ Queries parameterized

Performance
  ☐ No N+1 queries
  ☐ No unused code
  ☐ Caching considered
  ☐ Renders optimized

Testing
  ☐ Tests written
  ☐ Happy path tested
  ☐ Errors tested
  ☐ Edge cases tested
```

## After Review

If all checks pass → Ready to merge  
If issues found → Request changes, re-review

---

**Use @code-reviewer for deep dives, this skill for quick checklist**
