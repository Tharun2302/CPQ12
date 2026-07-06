# Code Style Rules

## JavaScript/Node.js

### Naming Conventions
- **Variables:** camelCase (`userName`, `discountPercentage`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_DISCOUNT = 0.5`, `DEFAULT_TIMEOUT = 5000`)
- **Functions:** camelCase (`calculatePrice`, `validateInput`)
- **Classes:** PascalCase (`UserQuote`, `PricingEngine`)
- **Files:** camelCase for utilities (`pricingLogic.js`), PascalCase for classes (`UserQuote.js`)

### Code Quality
- **Line Length:** Max 100 characters
- **Indentation:** 2 spaces (enforced by prettier)
- **Semicolons:** Always use them
- **Quotes:** Single quotes for strings (unless JSON)
- **Arrow Functions:** Use for anonymous functions
- **var:** Never use. Use `const` by default, `let` if reassignment needed

### Comments
- **Only explain WHY, not WHAT.** Code should be self-documenting.
- **Bad:** `// Increment counter` (obvious from code)
- **Good:** `// Discount capped at 50% per compliance rule`
- **Max 1 line comments.** Multi-line comments = code smell (refactor instead)

### Error Handling
- **Always use try-catch for async operations**
- **Return errors as objects:** `{ success: false, error: "message" }`
- **Log errors with context:** `console.error('Error in calculatePrice:', error.message, { userId, combinationId })`
- **User-facing errors:** Be friendly, not technical

### Async/Await
```javascript
// ✅ Good
async function fetchQuote(quoteId) {
  try {
    const quote = await Quote.findById(quoteId);
    return { success: true, data: quote };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ❌ Bad
function fetchQuote(quoteId) {
  return Quote.findById(quoteId); // No error handling
}
```

---

## React / Frontend

### Component Structure
- **Naming:** PascalCase files (`PricingCalculator.jsx`)
- **Max Size:** 300 lines (split if larger)
- **File Placement:** `src/components/[Feature]/[Component].jsx`

### Props & State
```javascript
// ✅ Good
function PricingCalculator({ productId, onCalculate }) {
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);
  // ...
}

// ❌ Bad
function PricingCalculator(props) {
  // No prop destructuring, unclear what props are
}
```

### Hooks Rules
- **useState for local state only**
- **useEffect for side effects only**
- **Custom hooks for reusable logic** (`useQuoteData`, `usePricingCalculator`)
- **No hooks inside conditionals or loops**

### Styling
- **Use TailwindCSS classes directly**
- **Inline styles only for dynamic values**
- **Avoid CSS modules** (TailwindCSS is sufficient)

```jsx
// ✅ Good
<div className="flex gap-4 bg-blue-50 p-4 rounded-lg">
  <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
    Calculate
  </button>
</div>

// ❌ Bad
<div style={{ display: 'flex', gap: '16px' }}>
  {/* Inline styles */}
</div>
```

---

## General Rules

### No Console Logs
- **Remove before committing.** Use proper logging instead.
- **Bad:** `console.log('price:', price)`
- **Good:** `logger.info('Price calculated', { price, userId })`

### Imports
- **Absolute imports** (no `../../` paths)
- **Group imports:** External first, then local
```javascript
// ✅ Good
import React, { useState } from 'react';
import axios from 'axios';
import { calculatePrice } from '@utils/pricing';
import PricingTable from '@components/PricingTable';

// ❌ Bad
import React from 'react';
import PricingTable from '../../components/PricingTable';
import { calculatePrice } from '../../../utils/pricing';
```

### Null Checks
```javascript
// ✅ Good
if (!user) return <LoadingSpinner />;
if (discount === undefined) discount = 0;

// ❌ Bad
if (user == null) // Never use == for null checks
discount = discount || 0; // Fails if discount is 0
```

### Database Queries
- **Always validate input before querying**
- **Use Mongoose schema validation**
- **Index frequently queried fields**
- **Never expose raw MongoDB errors to users**

```javascript
// ✅ Good
const quote = await Quote.findById(quoteId).lean();
if (!quote) return { success: false, error: 'Quote not found' };

// ❌ Bad
const quote = Quote.find({ _id: quoteId }); // Uses find() instead of findById()
// User sees MongoDB error if quote not found
```

### Performance
- **Memoize expensive calculations** (`useMemo`, `React.memo`)
- **Lazy load components** (`React.lazy`, `Suspense`)
- **Batch database queries** (avoid N+1 queries)
- **Cache API responses** (at least 60 seconds)

---

## Linting & Formatting

### Automated
- **Prettier** enforces formatting (run: `npm run format`)
- **ESLint** catches errors (run: `npm lint`)
- **Both run before commit** (pre-commit hook)

### Before You Commit
- [ ] `npm lint` passes
- [ ] No console.log() statements
- [ ] No TODO comments left
- [ ] Code is readable (variable names are clear)
