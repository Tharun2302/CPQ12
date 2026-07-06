# Testing Standards

## When Tests Are Required

### Pricing Logic (REQUIRED)
- **All pricing calculations MUST have unit tests**
- **All 12 product combinations MUST be tested**
- **All discount types MUST be tested** (3-tier, multi-pack, promotional)
- **Edge cases MUST be tested** (0 discount, max discount, rounding)

**Why:** Pricing errors directly impact revenue. Tests prevent costly bugs.

### API Endpoints (REQUIRED)
- **Happy path:** Valid request → correct response
- **Error cases:** Missing fields, invalid ID, no auth
- **Status codes:** Verify correct HTTP codes (200, 400, 404, etc.)

### React Components (RECOMMENDED)
- **Form validation:** Fields are validated correctly
- **User interactions:** Button clicks, form submission
- **Error display:** Error messages show correctly

### Database Migrations (REQUIRED)
- **Test before deploying to production**
- **Verify data integrity after migration**
- **Test rollback scenario**

---

## Pricing Logic Test Example

```javascript
// ✅ Good
describe('Pricing Calculations', () => {
  
  test('3-tier discount: 10% off for 5+ items', () => {
    const price = calculatePrice({
      baseCost: 100,
      quantity: 5,
      discountTier: '3tier'
    });
    expect(price).toBe(450); // 100 * 5 * 0.9
  });
  
  test('3-tier discount: 20% off for 10+ items', () => {
    const price = calculatePrice({
      baseCost: 100,
      quantity: 10,
      discountTier: '3tier'
    });
    expect(price).toBe(800); // 100 * 10 * 0.8
  });
  
  test('Multi-pack discount applies correctly', () => {
    const price = calculatePrice({
      baseCost: 100,
      quantity: 1,
      discountType: 'multipack',
      packSize: 5
    });
    expect(price).toBe(500); // 100 * 5
  });
  
  test('Discount capped at 50% (compliance rule)', () => {
    const price = calculatePrice({
      baseCost: 100,
      quantity: 100,
      discountTier: '3tier'
    });
    expect(price).toBeGreaterThanOrEqual(5000); // Min 50% discount
  });
  
  test('Handles edge case: 0 quantity', () => {
    const price = calculatePrice({
      baseCost: 100,
      quantity: 0
    });
    expect(price).toBe(0);
  });
  
  // Test all 12 combinations
  combinations.forEach(combo => {
    test(`Combination ${combo.name} calculates correctly`, () => {
      const price = calculatePrice(combo);
      expect(price).toBeGreaterThan(0);
    });
  });
});
```

---

## API Endpoint Test Example

```javascript
// ✅ Good
describe('POST /api/quotes', () => {
  
  test('Valid request creates quote', async () => {
    const response = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Acme Corp',
        total: 15000,
        combinationId: '507f1f77bcf86cd799439011'
      });
    
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBeDefined();
  });
  
  test('Missing required field returns 400', async () => {
    const response = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Acme Corp'
        // Missing total and combinationId
      });
    
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('required');
  });
  
  test('Invalid total (negative) returns 400', async () => {
    const response = await request(app)
      .post('/api/quotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Acme Corp',
        total: -1000,
        combinationId: '507f1f77bcf86cd799439011'
      });
    
    expect(response.status).toBe(400);
  });
  
  test('No auth token returns 401', async () => {
    const response = await request(app)
      .post('/api/quotes')
      .send({
        customerName: 'Acme Corp',
        total: 15000,
        combinationId: '507f1f77bcf86cd799439011'
      });
    
    expect(response.status).toBe(401);
  });
});
```

---

## React Component Test Example

```javascript
// ✅ Good
import { render, screen, fireEvent } from '@testing-library/react';
import PricingCalculator from './PricingCalculator';

describe('PricingCalculator Component', () => {
  
  test('Renders calculator with inputs', () => {
    render(<PricingCalculator />);
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('Discount Type')).toBeInTheDocument();
  });
  
  test('Calculates price on input change', () => {
    render(<PricingCalculator />);
    const quantityInput = screen.getByLabelText('Quantity');
    
    fireEvent.change(quantityInput, { target: { value: '10' } });
    
    expect(screen.getByText(/Total: \$800/)).toBeInTheDocument();
  });
  
  test('Shows error for invalid quantity', () => {
    render(<PricingCalculator />);
    const quantityInput = screen.getByLabelText('Quantity');
    
    fireEvent.change(quantityInput, { target: { value: '-5' } });
    fireEvent.blur(quantityInput);
    
    expect(screen.getByText('Quantity must be positive')).toBeInTheDocument();
  });
  
  test('Disables calculate button when inputs invalid', () => {
    render(<PricingCalculator />);
    const button = screen.getByRole('button', { name: /Calculate/ });
    
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '' } });
    
    expect(button).toBeDisabled();
  });
});
```

---

## Test Coverage Goals

| Area | Minimum Coverage |
|---|---|
| Pricing Logic | 95% (critical) |
| API Routes | 80% |
| React Components | 70% |
| Utilities | 85% |

**Check coverage:**
```bash
npm test -- --coverage
```

---

## Test File Naming

- **Unit test:** `functionName.test.js`
- **Component test:** `ComponentName.test.jsx`
- **Integration test:** `featureName.integration.test.js`

**Location:** Same folder as source file
```
src/
├── utils/
│   ├── calculatePrice.js
│   └── calculatePrice.test.js
├── components/
│   ├── PricingCalculator.jsx
│   └── PricingCalculator.test.jsx
```

---

## Before Committing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run only pricing tests (critical)
npm test -- calculatePrice

# Update snapshots (if needed)
npm test -- -u
```

### Checklist
- [ ] All new code has tests
- [ ] All pricing logic has tests
- [ ] Tests pass locally
- [ ] Coverage meets minimum (pricing: 95%)
- [ ] No .only() or .skip() left in tests
- [ ] No console.log() in test files

---

## Continuous Integration

Tests run automatically on:
- Every commit (pre-commit hook)
- Every PR (CI/CD pipeline)
- Before deployment

**If tests fail:** PR cannot be merged.

---

## Debugging Failed Tests

```bash
# Run single test in watch mode
npm test -- calculatePrice.test.js --watch

# Run with verbose output
npm test -- --verbose

# Run with debug info
DEBUG=* npm test

# Check test coverage for specific file
npm test -- --coverage --collectCoverageFrom='src/utils/calculatePrice.js'
```

---

## Mocking Guidelines

### Mock External APIs (but NOT database for pricing)
```javascript
// ✅ Good — Mock SendGrid email API
jest.mock('@sendgrid/mail');

// ❌ Bad — DO NOT mock MongoDB for pricing tests
// Pricing must test against REAL data
```

### Mock Azure AD Auth
```javascript
jest.mock('@azure/msal-react', () => ({
  useAccount: () => ({ account: { username: 'test@example.com' } }),
  useMsal: () => ({ accounts: [{ username: 'test@example.com' }] })
}));
```

---

## Test Database Setup

For integration tests, use:
- **Test MongoDB:** Separate database (`cpq12-test`)
- **Test PostgreSQL:** Separate database (`cpq12_test`)
- **Seed data:** Load known test data before each test
- **Cleanup:** Clear data after each test

```javascript
beforeAll(async () => {
  await connectToTestDB();
  await seedTestData();
});

afterEach(async () => {
  await clearTestData();
});

afterAll(async () => {
  await disconnectTestDB();
});
```
