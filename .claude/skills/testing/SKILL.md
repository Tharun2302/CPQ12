# Skill: Testing Guide

## Description
Auto-triggers when writing test files or asked to write tests. Ensures consistent, comprehensive test coverage.

## When Auto-Triggers
- Creating `.test.js` or `.test.jsx` files
- Request contains "write test", "test", "unit test"
- Focus on pricing logic, API endpoints, components

## What This Skill Does

Reminds you to:
1. **Test happy path** — Valid input → expected output
2. **Test error cases** — Invalid input → error handling
3. **Test edge cases** — Boundaries (0, negative, very large)
4. **For pricing:** Test all 12 combinations
5. **For API:** Test all status codes (200, 400, 401, 404, 500)
6. **For components:** Test user interactions and errors

## Quick Template

```javascript
describe('[Feature Name]', () => {
  // Happy path (valid input)
  test('should [expected behavior] when [condition]', () => {
    const result = functionUnderTest(validInput);
    expect(result).toBe(expected);
  });
  
  // Error case (invalid input)
  test('should error when [condition]', () => {
    expect(() => functionUnderTest(invalidInput)).toThrow();
  });
  
  // Edge case (boundary)
  test('should handle [edge case]', () => {
    const result = functionUnderTest(edgeCase);
    expect(result).toBeGreaterThan(0);
  });
});
```

## Pricing Tests MUST Include

```javascript
// All 12 combinations
combinations.forEach(combo => {
  test(`Pricing for ${combo.name}`, () => {
    const price = calculatePrice(combo);
    expect(price).toBeGreaterThan(0);
  });
});

// Edge cases
test('Handles 0 quantity', () => expect(calculatePrice({ qty: 0 })).toBe(0));
test('Handles very large quantity', () => expect(calculatePrice({ qty: 1000000 })).toBeGreaterThan(0));
test('Discount capped at 50%', () => expect(calculatePrice({ discount: 100 })).toBeGreaterThanOrEqual(50));
```

## Coverage Goal
- **Pricing:** 95%+
- **APIs:** 80%+
- **Components:** 70%+

---

**Before committing:** Run `npm test -- --coverage`
