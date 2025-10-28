# BoldSign Error Diagnosis ✅

## Test Results

✅ **BoldSign API Key:** VALID and working!  
✅ **API Connection:** Successfully connected to BoldSign  
✅ **API Key Length:** 48 characters (correct format)  
✅ **HTTP Status:** 200 (success)

**Conclusion:** Your BoldSign configuration is correct! ✨

---

## So Why the Error?

Since the API key is working, the error must be coming from **something else** in the workflow. Possible causes:

### 1. Document Not Found in MongoDB ❌
- The workflow might reference a document that doesn't exist
- Document ID might be incorrect

### 2. Document Data Format Issue ❌
- Document might not have valid base64 data
- PDF conversion might have failed

### 3. Invalid Email Addresses ❌
- Legal team email might be invalid
- Client email might be invalid or missing

### 4. Form Field Configuration Issue ❌
- BoldSign might reject the form field configuration
- Page number might be wrong (if PDF has fewer than 3 pages)

---

## How to Find the Real Issue

I've enhanced the server error logging. Now follow these steps:

### Step 1: Restart Your Server
The enhanced logging is now in the code, so restart to apply it:

```bash
# Stop server (Ctrl+C)
npm run dev
```

### Step 2: Try Approving a Workflow Again
1. Go to your Manager or CEO approval dashboard
2. Try approving a workflow
3. When you get the error...

### Step 3: Check Server Console
Look at your server console (the terminal where server is running). You should now see detailed error information like:

```
❌ Error triggering BoldSign integration: [error]
❌ Error message: [specific message]
❌ BoldSign API Error Response:
   Status: [status code]
   Data: {
     "error": "...",
     "message": "..."
   }
```

### Step 4: Share the Error Details
Once you see the error in the server console:
1. Copy the full error message
2. Look for the specific error in the "Data" section
3. That will tell us exactly what's wrong

---

## Most Likely Issues & Fixes

### Issue 1: "Document not found"
**Cause:** DocumentId doesn't exist in MongoDB

**Fix:**
- The workflow might be old
- Try creating a fresh quote and workflow
- Make sure document is saved before approval

### Issue 2: "Invalid email address"
**Cause:** Email format is wrong

**Fix:** Check that emails are valid:
- Legal Team: Should be a real email (not 'legal@company.com')
- Client: Should be the actual client email

### Issue 3: "Invalid base64 data"
**Cause:** PDF data is corrupted

**Fix:**
- Regenerate the quote
- Make sure PDF generation succeeds

### Issue 4: "Page number out of range"
**Cause:** Form fields reference page 3, but PDF only has 1-2 pages

**Fix:**
- Check if the template generates 3 pages
- Verify PDF has signature section on page 3

---

## Browser Console Error Details

The browser will now also show detailed errors. Open browser DevTools (F12) and check Console tab. You'll see:

```javascript
❌ BoldSign API Error: [detailed message]
❌ BoldSign Error Details: {
  // Full error object from BoldSign
}
```

---

## Quick Action Plan

**Right Now:**
1. ✅ Restart your server (to apply enhanced logging)
2. ✅ Open browser DevTools → Console tab
3. ✅ Keep server terminal visible
4. ✅ Try approving a workflow
5. ✅ Copy the error from BOTH browser console AND server console
6. ✅ Look for the specific error message

**Common Error Messages You Might See:**

| Error Message | Meaning | Fix |
|---------------|---------|-----|
| "Document not found" | DocumentId invalid | Create new quote |
| "Invalid email address" | Email format wrong | Use valid email addresses |
| "Invalid base64" | PDF data corrupted | Regenerate quote/PDF |
| "Page number out of range" | PDF too short | Check template generates 3 pages |
| "Missing required field" | Data missing | Check all workflow data exists |
| "Field validation failed" | Form field config wrong | Check form field coordinates |

---

## Test Workflow Checklist

When creating a test workflow to debug:

- [ ] Use real email addresses (not placeholders)
- [ ] Complete all approval steps properly
- [ ] Make sure document generates successfully
- [ ] Verify PDF has 3 pages (or adjust page number in code)
- [ ] Check that Legal Team email and Client email are set
- [ ] Look at MongoDB to verify document exists
- [ ] Check document has valid fileData

---

## Next Steps

1. **Restart server** with enhanced logging
2. **Try approval again**
3. **Copy the full error** from server console
4. **Send me the error details** so I can help fix the specific issue

The error message will now be much more helpful and tell us exactly what BoldSign is complaining about! 🎯

---

## Summary

✅ **Good News:** BoldSign API is working perfectly!  
🔍 **Next Step:** Find the real error using enhanced logging  
📋 **Action:** Restart server → Try again → Share error details

Your BoldSign setup is correct - we just need to see the actual error to fix the workflow issue! 🚀


