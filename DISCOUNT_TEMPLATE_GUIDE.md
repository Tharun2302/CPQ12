# Discount Display Template Guide

## Problem
When discount is 0, the template still shows "Discount $0.00" which should be hidden.

## Solution
The system now provides several tokens to conditionally show/hide discount information:

### Available Discount Tokens

#### Basic Discount Tokens (Empty when discount = 0)
- `{{discount}}` - Percentage value (e.g., "5" or "")
- `{{discount_percent}}` - Percentage value (e.g., "5" or "")
- `{{discount_amount}}` - Formatted amount (e.g., "$125.00" or "")
- `{{discount_text}}` - Text label (e.g., "Discount (5%)" or "")
- `{{discount_line}}` - Complete line (e.g., "Discount (5%) - $125.00" or "")

#### Conditional Display Tokens
- `{{show_discount}}` - "true" when discount > 0, "" when discount = 0
- `{{hide_discount}}` - "" when discount > 0, "true" when discount = 0
- `{{if_discount}}` - "show" when discount > 0, "hide" when discount = 0
- `{{discount_row}}` - Complete HTML table row or "" when discount = 0

### Template Usage Examples

#### Option 1: Use Empty Tokens (Recommended)
```
Subtotal: {{subtotal}}
{{discount_line}}
Total: {{final_total}}
```

#### Option 2: Use Conditional Tokens
```
Subtotal: {{subtotal}}
{{#if_discount}}Discount ({{discount}}%): {{discount_amount}}{{/if_discount}}
Total: {{final_total}}
```

#### Option 3: Use Show/Hide Logic
```
Subtotal: {{subtotal}}
{{show_discount}}Discount: {{discount_amount}}{{show_discount}}
Total: {{final_total}}
```

### Result
- **When discount = 0**: Only shows Subtotal and Total
- **When discount > 0**: Shows Subtotal, Discount line, and Total

## Template Modification Required
To completely hide discount when it's 0, the DOCX template should use the `{{discount_line}}` token instead of hardcoded "Discount" text.

### Current Template (Shows $0.00)
```
Subtotal: {{subtotal}}
Discount: {{discount_amount}}  ← Always shows, even $0.00
Total: {{final_total}}
```

### Updated Template (Hides when 0)
```
Subtotal: {{subtotal}}
{{discount_line}}  ← Only shows when discount > 0
Total: {{final_total}}
```
