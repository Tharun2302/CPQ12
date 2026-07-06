# /scaffold — Generate Boilerplate Code

## Purpose
Quickly generate code templates for components, API routes, and utilities.

## Usage
```
/scaffold [type] [name] [description]

Examples:
/scaffold react component PricingTable "Display pricing for all combinations"
/scaffold api route /quotes/search "Search quotes by customer name"
/scaffold hook usePricing "Custom hook for pricing calculations"
/scaffold test calculatePrice "Unit tests for pricing logic"
```

## Scaffold Types

### React Component
```
/scaffold react component [ComponentName] [description]

Example:
/scaffold react component DiscountSelector "Allow user to choose discount type"

Generates:
✅ src/components/[Feature]/DiscountSelector.jsx
   - Component skeleton
   - Props destructuring
   - useState hooks
   - Basic styling (TailwindCSS)
   - Error handling
   - Comments for implementation

You then:
- Add your specific logic
- Connect to parent component
- Add tests

Ready in 2 minutes instead of 15
```

### API Route
```
/scaffold api route [path] [description]

Example:
/scaffold api route /api/quotes/calculate "Calculate quote total with discounts"

Generates:
✅ server.cjs additions:
   - Route handler (POST)
   - Input validation
   - Error handling
   - Database query skeleton
   - Response format
   - Logging

You then:
- Add business logic
- Connect to database
- Add security checks

Ready in 5 minutes instead of 20
```

### Custom Hook
```
/scaffold hook [hookName] [description]

Example:
/scaffold hook usePricingCalculator "Handle pricing state and calculations"

Generates:
✅ src/hooks/usePricingCalculator.js
   - Hook skeleton
   - useState setup
   - useEffect for side effects
   - Return values documented
   - Example usage

You then:
- Add your specific logic
- Add error handling
- Write tests

Ready in 3 minutes instead of 10
```

### Unit Test
```
/scaffold test [filePath] [description]

Example:
/scaffold test src/utils/calculatePrice.js "Test pricing calculations"

Generates:
✅ src/utils/calculatePrice.test.js
   - Test suite skeleton
   - Happy path test
   - Error case test
   - Edge case test
   - Coverage comments

You then:
- Fill in actual test cases
- Add more edge cases
- Verify coverage

Ready in 5 minutes instead of 20
```

### Database Schema (Mongoose)
```
/scaffold schema [collectionName] [fields]

Example:
/scaffold schema UserQuote "customerName:string, total:number, combinationId:objectId"

Generates:
✅ Schema file:
   - Field definitions
   - Validators
   - Default values
   - Indexes
   - Timestamps

You then:
- Customize validation rules
- Add custom methods
- Test with real data

Ready in 3 minutes instead of 15
```

## Output Example

```
You: /scaffold react component PricingTable "Show all prices for combinations"

Claude generates:

📁 Created: src/components/Pricing/PricingTable.jsx

```jsx
import React, { useState } from 'react';

/**
 * PricingTable Component
 * 
 * Purpose: Show all prices for combinations
 * 
 * Props:
 * - combinations: Array<{id, name, price}>
 * - onSelect: Function to handle selection
 */
function PricingTable({ combinations, onSelect }) {
  const [selectedId, setSelectedId] = useState(null);
  
  const handleSelectCombination = (id) => {
    setSelectedId(id);
    onSelect?.(id);
  };
  
  if (!combinations || combinations.length === 0) {
    return <div className="p-4 text-gray-500">No combinations available</div>;
  }
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-gray-300">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 text-left">Combination</th>
            <th className="p-3 text-right">Price</th>
            <th className="p-3 text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {combinations.map((combo) => (
            <tr key={combo.id} className="border-t border-gray-300">
              <td className="p-3">{combo.name}</td>
              <td className="p-3 text-right">${combo.price}</td>
              <td className="p-3 text-center">
                <button
                  onClick={() => handleSelectCombination(combo.id)}
                  className={`px-4 py-2 rounded ${
                    selectedId === combo.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  Select
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PricingTable;
```

Next steps:
1. Import into parent component
2. Pass combinations data
3. Add error boundary if needed
4. Write unit tests
5. Verify responsive on mobile
```

## Benefits of /scaffold

| Benefit | Saves Time |
|---|---|
| Correct file placement | 2 min |
| Proper imports | 2 min |
| Code style consistency | 3 min |
| Boilerplate code | 5-10 min |
| Error handling | 3 min |
| Documentation | 2 min |
| **Total per component** | **15-20 min** |

## When to Use

| Scenario | Use /scaffold |
|---|---|
| Creating new React component | ✅ YES |
| Adding API endpoint | ✅ YES |
| Creating custom hook | ✅ YES |
| Writing tests | ✅ YES |
| Modifying existing code | ❌ NO |
| Debugging | ❌ NO |
| Code review | ❌ NO |

## After Scaffolding

1. **Review generated code** — make sure it matches your needs
2. **Customize** — add your specific logic
3. **Test** — run `/qa` to verify it works
4. **Review** — run `/review` before committing
5. **Commit** — push to git

## Tips

- **Be descriptive:** "Discount selector for 3-tier logic" is better than just "component"
- **One at a time:** Generate one component at a time, not whole features
- **Review before editing:** Make sure the scaffold is what you want
- **Customize fearlessly:** Don't be afraid to modify generated code
- **Document changes:** If you deviate from scaffold significantly, add comments

## Pro Tip

Use `/scaffold` when:
- Starting new work (components, routes, tests)
- You want consistency across the codebase
- You need to follow CPQ12 patterns
- You're in a time crunch

Skip `/scaffold` when:
- You're modifying existing code
- You want full control over structure
- The generated code doesn't fit your use case

Maximum productivity: `/scaffold` → customize → `/review` → `/qa` → `/deploy`
