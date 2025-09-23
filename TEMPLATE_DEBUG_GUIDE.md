# Template Token Debug Guide

## 🐛 Debugging Token Replacement Issues

### Step 1: Check Console Logs

When you generate an agreement, open the browser console (F12) and look for these specific log messages:

#### ✅ Expected Logs to Find:
```
🎯 USER TEMPLATE SPECIFIC TOKENS:
  {{users_cost}}: $123.45
  {{instance_cost}}: $67.89
  {{Duration_of_months}}: 12
```

#### ❌ If you see empty/undefined values:
```
🎯 USER TEMPLATE SPECIFIC TOKENS:
  {{users_cost}}: undefined
  {{instance_cost}}: undefined
  {{Duration_of_months}}: undefined
```

### Step 2: Verify Your Template Tokens

Make sure your DOCX template uses **exactly** these token formats:

| ✅ Correct Format | ❌ Incorrect Format |
|------------------|-------------------|
| `{{users_cost}}` | `{{users.cost}}` |
| `{{instance_cost}}` | `{{instance.cost}}` |
| `{{Duration_of_months}}` | `{{Duration of months}}` |

### Step 3: Common Token Issues

#### Issue 1: Extra Spaces
```
❌ {{ users_cost }}   (spaces inside)
✅ {{users_cost}}     (no spaces)
```

#### Issue 2: Case Sensitivity
```
❌ {{Users_Cost}}
✅ {{users_cost}}
```

#### Issue 3: Special Characters
```
❌ {{users-cost}}     (hyphen)
❌ {{users.cost}}     (dot)
✅ {{users_cost}}     (underscore)
```

### Step 4: Test Token Replacement

1. Go to Configure session
2. Fill in project details:
   - Number of Users: 25
   - Instance Type: Standard
   - Duration: 6 months
3. Go to Quote session
4. Click "Generate Agreement"
5. Check console for debug logs

### Step 5: Verify Template File

Open your DOCX template and verify tokens are formatted as:
- `{{users_cost}}`
- `{{instance_cost}}`
- `{{Duration_of_months}}`
- `{{Company_Name}}`

### Step 6: Debug Commands

Run these in the browser console after generating an agreement:

```javascript
// Check if template data exists
console.log('Template data:', window.lastTemplateData);

// Check specific tokens
console.log('Users cost:', window.lastTemplateData?.['{{users_cost}}']);
console.log('Instance cost:', window.lastTemplateData?.['{{instance_cost}}']);
console.log('Duration:', window.lastTemplateData?.['{{Duration_of_months}}']);
```

### Step 7: Common Solutions

#### Solution 1: Update Template Tokens
Replace your template tokens with these exact formats:
- `{{users_cost}}` for user cost
- `{{instance_cost}}` for instance cost  
- `{{Duration_of_months}}` for duration
- `{{Company_Name}}` for company name

#### Solution 2: Check Token Mapping
All these tokens are already mapped in the code:
```javascript
'{{users_cost}}': formatCurrency(userCost || 0),
'{{instance_cost}}': formatCurrency(instanceCost),
'{{Duration_of_months}}': (duration || 1).toString(),
```

#### Solution 3: Verify Data Flow
1. Configuration → Quote Generator
2. Quote Generator → Template Data
3. Template Data → DOCX Processor
4. DOCX Processor → Final Document

### Step 8: Available Token List

Here are ALL available tokens you can use:

#### Company Information:
- `{{Company_Name}}`
- `{{Company Name}}`
- `{{company name}}`

#### User/Project Details:
- `{{users_count}}`
- `{{users_cost}}`
- `{{instance_cost}}`
- `{{Duration_of_months}}`
- `{{migration_type}}`
- `{{messages}}`

#### Pricing:
- `{{total_price}}`
- `{{price_migration}}`
- `{{discount}}`
- `{{discount_amount}}`
- `{{final_total}}`

#### Client Information:
- `{{clientName}}`
- `{{client_email}}`
- `{{effective_date}}`

### Step 9: Testing Your Tokens

To test if your tokens work:

1. Replace your template content with this test:
```
Company: {{Company_Name}}
Users: {{users_count}}
User Cost: {{users_cost}}
Instance Cost: {{instance_cost}}
Duration: {{Duration_of_months}} months
Total: {{total_price}}
```

2. Generate agreement and check if values appear

### Step 10: Get Help

If tokens still don't work, provide:
1. Console log output (F12 → Console)
2. Screenshot of your DOCX template
3. Configuration values you entered
4. Generated agreement content

## 🔧 Quick Fix Checklist

- [ ] Template uses exact token format: `{{token_name}}`
- [ ] No extra spaces in tokens
- [ ] Configuration data is filled
- [ ] Console shows token values (not undefined)
- [ ] Template is selected before generating
- [ ] Agreement generation completes without errors
