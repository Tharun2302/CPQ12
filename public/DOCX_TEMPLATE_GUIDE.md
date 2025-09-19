# DOCX Template Creation Guide

## Overview
This guide will help you create DOCX templates for the CPQ system that will reliably replace placeholders with actual quote data.

## Why Use DOCX Templates?
- ✅ **Reliable token replacement** - No positioning issues like PDFs
- ✅ **Professional formatting** - Maintains fonts, colors, and layout
- ✅ **Easy to create** - Use Microsoft Word, Google Docs, or LibreOffice
- ✅ **Fast processing** - More efficient than PDF manipulation

## Supported Tokens

### Primary Tokens (Recommended)
Use these exact token names in your template:

- `{{Company Name}}` - Company name from quote
- `{{users_count}}` - Number of users
- `{{users_cost}}` - User cost (formatted as currency)
- `{{Duration of months}}` - Duration in months
- `{{total price}}` - Total cost (formatted as currency)

### Additional Tokens (Compatibility)
These tokens are also supported for backward compatibility:

- `{{migration type}}` - Migration type (Content/Email/Messaging)
- `{{userscount}}` - Alternative user count token
- `{{price_migration}}` - Migration cost
- `{{price_data}}` - Data cost
- `{{clientName}}` - Client name
- `{{email}}` - Client email
- `{{users}}` - User count (alternative)
- `{{migration_type}}` - Migration type (alternative)
- `{{prices}}` - Total price (alternative)
- `{{migration_price}}` - Migration price (alternative)
- `{{total_price}}` - Total price (alternative)
- `{{duration_months}}` - Duration (alternative)
- `{{date}}` - Current date

## How to Create a DOCX Template

### Step 1: Open Your Word Processor
- **Microsoft Word** (recommended)
- **Google Docs** (save as .docx)
- **LibreOffice Writer** (save as .docx)

### Step 2: Create Your Template Content
1. **Add your company branding** (logo, header, etc.)
2. **Write your agreement text**
3. **Add placeholders** using the exact token names above
4. **Format as needed** (fonts, colors, tables, etc.)

### Step 3: Add Placeholders
Replace any dynamic content with tokens:

**Example:**
```
CloudFuze Purchase Agreement for {{Company Name}}

This agreement provides {{Company Name}} with pricing for use of the CloudFuze's X-Change Enterprise Data.

Job Requirements:
- Up to {{users_count}} Users
- Price: {{users_cost}}
- Valid for {{Duration of months}} Month

Total Price: {{total price}}
```

### Step 4: Save as DOCX
- **File → Save As**
- **Choose "Word Document (.docx)" format**
- **Name your file** (e.g., "agreement-template.docx")

### Step 5: Test Your Template
1. **Upload to CPQ system**
2. **Generate a test quote**
3. **Check that all tokens are replaced**
4. **Verify formatting is preserved**

## Template Examples

### Basic Agreement Template
```
[Your Company Logo]

AGREEMENT FOR {{Company Name}}

Client: {{clientName}}
Email: {{email}}

Services:
- Migration for {{users_count}} users
- Cost: {{users_cost}}
- Duration: {{Duration of months}} months

Total: {{total price}}

Date: {{date}}
```

### Detailed Agreement Template
```
[Company Header]

PURCHASE AGREEMENT

Company: {{Company Name}}
Contact: {{clientName}} ({{email}})

MIGRATION DETAILS:
- Type: {{migration type}}
- Users: {{users_count}}
- Duration: {{Duration of months}} months

PRICING:
- User Cost: {{users_cost}}
- Migration Cost: {{price_migration}}
- Data Cost: {{price_data}}
- Total: {{total price}}

Valid until: {{date}}
```

## Best Practices

### ✅ Do:
- Use exact token names: `{{Company Name}}`
- Test with sample data
- Keep formatting simple
- Save as .docx format
- Use tables for structured data

### ❌ Don't:
- Use spaces in token names: `{{Company Name}}` not `{{CompanyName}}`
- Use complex formatting that might break
- Save as .doc format
- Use PDF files (use DOCX instead)

## Troubleshooting

### Tokens Not Replacing?
1. **Check token names** - Must be exact: `{{Company Name}}`
2. **Check file format** - Must be .docx, not .doc
3. **Check console** - Look for error messages
4. **Test with simple template** - Start with basic template

### Formatting Issues?
1. **Use simple formatting** - Avoid complex layouts
2. **Test in different viewers** - Check Word, Google Docs
3. **Save and reopen** - Sometimes fixes formatting issues

### File Upload Issues?
1. **Check file size** - Should be under 10MB
2. **Check file type** - Must be .docx
3. **Try different browser** - Some browsers have issues

## Support

If you need help:
1. **Check the console** (F12) for error messages
2. **Try the example template** provided
3. **Start with a simple template** and add complexity
4. **Contact support** with specific error messages

## Example Template Download

Download the example template from: `/public/example-template.html`
Convert it to DOCX format and customize as needed.

---

**Remember:** DOCX templates provide the most reliable token replacement. PDF templates are supported but may have positioning issues.
