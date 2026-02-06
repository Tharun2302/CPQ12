# How to Edit DOCX Template in Microsoft Word (NOT Raw XML)

## ❌ The Problem

If you're editing the raw XML of the DOCX file, the template code will show up as literal text in the generated agreement. This is because docxtemplater processes the **text content** of the Word document, not the raw XML structure.

## ✅ The Solution

**Edit your template in Microsoft Word**, not in a text/XML editor.

## Step-by-Step Instructions

### 1. Open Template in Microsoft Word

- Open your DOCX template file in **Microsoft Word** (not Notepad, VS Code, or any XML editor)
- Navigate to the "Important Payment Notes" section

### 2. Type Template Variables Directly in Word

In the Word document, where you want overage charges to appear, type this text:

```
{{#exhibits}}
Overage Charges for {{exhibitCombinationName}}: {{exhibitOveragePerUser}} per User | {{exhibitOveragePerServer}} per server per month{{#exhibitOveragePerGB}} | {{exhibitOveragePerGB}} per GB{{/exhibitOveragePerGB}}

{{/exhibits}}
```

### 3. Format Text in Word (Not XML Tags)

- To make "Overage Charges for [Name]:" **bold**, select that text and press **Ctrl+B** (or use Word's Bold button)
- **DO NOT** type XML tags like `<w:p>`, `<w:r>`, `<w:t>`, `<w:b>`
- Word will automatically handle the XML structure when you save

### 4. Example in Word

Here's what you should see/type in Word:

```
{{#exhibits}}
**Overage Charges for {{exhibitCombinationName}}:** {{exhibitOveragePerUser}} per User | {{exhibitOveragePerServer}} per server per month{{#exhibitOveragePerGB}} | {{exhibitOveragePerGB}} per GB{{/exhibitOveragePerGB}}

{{/exhibits}}
```

(Where `**text**` means you've made that text bold in Word)

### 5. Save the Template

- Save the document normally (Ctrl+S)
- Word will handle all the XML structure automatically

## What NOT to Do

❌ **Don't edit the raw XML** (the `.docx` file as a ZIP or XML)
❌ **Don't type XML tags** like `<w:p>`, `<w:r>`, `<w:t>`, `<w:b>`
❌ **Don't use a text editor** to edit the DOCX file

## What TO Do

✅ **Edit in Microsoft Word**
✅ **Type template variables** like `{{#exhibits}}`, `{{exhibitCombinationName}}`, etc.
✅ **Use Word's formatting tools** (Bold, Italic, etc.) instead of XML tags
✅ **Let Word handle the XML** structure automatically

## Alternative: Simple Text Format

If you want a simpler format, just type this in Word:

```
{{#exhibits}}
Overage Charges for {{exhibitCombinationName}}: {{exhibitOveragePerUser}} per User | {{exhibitOveragePerServer}} per server per month{{#exhibitOveragePerGB}} | {{exhibitOveragePerGB}} per GB{{/exhibitOveragePerGB}}

{{/exhibits}}
```

Then select "Overage Charges for" and the combination name, and make it bold using Word's formatting.

## Testing

After editing in Word:
1. Save the template
2. Generate a new agreement
3. The template variables should be replaced with actual values
4. The XML tags should NOT appear in the generated document

