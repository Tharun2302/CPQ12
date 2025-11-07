# BoldSign Error: "Automatic signature request failed"

## ❌ Error You're Seeing:

```
Note: Document approved but automatic signature request failed.
Please send for signature manually.
```

---

## 🔍 Quick Diagnosis Checklist

### 1. Check Browser Console (F12)

Look for these error messages:

**Error A: Network/Fetch Error**
```
❌ Error triggering BoldSign: TypeError: Failed to fetch
```
**Cause:** Backend server not responding or CORS issue  
**Fix:** Ensure server is running on port 3001

**Error B: BoldSign API Key Missing**
```
⚠️ BoldSign failed: BoldSign API key not configured
```
**Cause:** Missing API key in `.env`  
**Fix:** Add `BOLDSIGN_API_KEY` to `.env` and restart server

**Error C: Document Not Found**
```
❌ Error triggering BoldSign: Failed to fetch document for BoldSign
```
**Cause:** Document not saved properly to MongoDB  
**Fix:** Check MongoDB connection and document saving

**Error D: BoldSign API Error**
```
⚠️ BoldSign failed: [BoldSign error message]
```
**Cause:** BoldSign API rejected the request  
**Fix:** Check API key validity, document format, or email addresses

---

## ✅ Solution by Error Type

### Solution 1: BoldSign API Key Not Configured

**Check your `.env` file:**
```env
BOLDSIGN_API_KEY=your-boldsign-api-key-here
```

**Steps:**
1. Get API key from https://app.boldsign.com/settings/api
2. Add to `.env` file
3. Restart server: `node server.cjs`
4. Try approval workflow again

**Verify server startup shows:**
```
Server running on port 3001
✅ MongoDB connected
```

---

### Solution 2: Invalid BoldSign API Key

**Test your API key:**

1. Go to https://app.boldsign.com
2. Login to your account
3. Navigate to **Settings → API**
4. Verify your API key is active
5. Try generating a new API key if needed

**Common Issues:**
- API key expired
- API key doesn't have "Send Document" permissions
- Trial account limitations
- Using wrong API key (test vs production)

---

### Solution 3: Document Fetch Error

**Check server logs for:**
```
📄 Document fetched for BoldSign: {...}
```

**If missing:**
1. Document might not be in MongoDB
2. DocumentId might be incorrect
3. MongoDB connection issue

**Fix:**
- Verify MongoDB is running
- Check workflow has valid `documentId`
- Ensure document was saved when workflow created

---

### Solution 4: BoldSign API Rejection

**Common BoldSign API Errors:**

#### Error: 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```
**Fix:** Check API key is correct and active

#### Error: 400 Bad Request - Invalid Email
```json
{
  "error": "Bad Request",
  "message": "Invalid signer email address"
}
```
**Fix:** Verify Legal Team and Client email addresses are valid

#### Error: 400 Bad Request - Invalid PDF
```json
{
  "error": "Bad Request",
  "message": "Invalid document format"
}
```
**Fix:** 
- Ensure document is a valid PDF
- Check PDF is not corrupted
- Verify base64 encoding is correct

#### Error: 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "API key does not have required permissions"
}
```
**Fix:** Regenerate API key with "Full Access" or "Send Document" permission

#### Error: 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded"
}
```
**Fix:** Wait a few minutes, or upgrade BoldSign plan

---

## 🔧 Step-by-Step Debugging

### Step 1: Check Server Logs

**In your server terminal, look for:**

```bash
# When BoldSign is triggered
📤 BoldSign: Sending document for signature...
  Document: Agreement.pdf
  Legal Team Email: legal@company.com
  Client Email: client@company.com

# If API key missing
❌ BoldSign API key not configured

# If successful
📋 BoldSign request prepared: {...}
✅ BoldSign: Document sent successfully
  Document ID: xxxxx
```

**What do you see?**

### Step 2: Test BoldSign API Key Manually

**Create a test file:** `test-boldsign.js`

```javascript
require('dotenv').config();
const axios = require('axios');

const BOLDSIGN_API_KEY = process.env.BOLDSIGN_API_KEY;

console.log('Testing BoldSign API Key...');
console.log('API Key:', BOLDSIGN_API_KEY ? `${BOLDSIGN_API_KEY.substring(0, 10)}...` : 'NOT FOUND');

async function testBoldSign() {
  try {
    // Test API key by fetching account info
    const response = await axios.get(
      'https://api.boldsign.com/v1/account',
      {
        headers: {
          'X-API-KEY': BOLDSIGN_API_KEY
        }
      }
    );
    
    console.log('✅ BoldSign API Key is VALID');
    console.log('Account Info:', response.data);
  } catch (error) {
    console.error('❌ BoldSign API Key is INVALID');
    console.error('Error:', error.response?.data || error.message);
  }
}

testBoldSign();
```

**Run it:**
```bash
node test-boldsign.js
```

**Expected Output:**
```
✅ BoldSign API Key is VALID
Account Info: { ... }
```

### Step 3: Check MongoDB Document

**In browser console:**
```javascript
// Get the workflow ID from URL
const workflowId = 'WF-1761209527558'; // Your actual ID

// Fetch workflow
fetch(`http://localhost:3001/api/approval-workflows/${workflowId}`)
  .then(r => r.json())
  .then(data => {
    console.log('Workflow:', data);
    console.log('Document ID:', data.workflow.documentId);
    
    // Fetch document
    return fetch(`http://localhost:3001/api/documents/${data.workflow.documentId}`);
  })
  .then(r => r.json())
  .then(doc => {
    console.log('Document found:', doc.fileName);
    console.log('File size:', doc.fileSize);
    console.log('Has fileData:', !!doc.fileData);
  })
  .catch(err => console.error('Error:', err));
```

**Expected:**
```
Document found: Agreement.pdf
File size: 123456
Has fileData: true
```

### Step 4: Verify Email Addresses

**Check that workflow has valid emails:**

1. Go to workflow creation
2. Verify email addresses are correct:
   - Legal Team: valid@email.com (not test@test.com)
   - Client: valid@email.com (not test@test.com)

**BoldSign requires:**
- Valid email format
- Real email addresses (not disposable/temporary)
- Emails must be able to receive messages

---

## 🚨 Emergency Workaround

**If you need to continue testing without BoldSign:**

The approval workflow completes successfully even if BoldSign fails. You can:

1. Click "OK" on the error
2. Manually send document for signature:
   - Download the approved PDF
   - Upload to BoldSign manually
   - Send to Legal Team and Client

**This is temporary** - you should fix the BoldSign integration for production.

---

## 📋 Checklist Before Reporting Issue

Before asking for help, verify:

- [ ] `.env` file has `BOLDSIGN_API_KEY`
- [ ] Server was restarted after adding API key
- [ ] BoldSign API key is valid (test with script above)
- [ ] MongoDB is connected and running
- [ ] Document exists in MongoDB
- [ ] Email addresses in workflow are valid
- [ ] Server logs show BoldSign request details
- [ ] Browser console shows specific error

---

## 🔍 What to Share for Help

If still stuck, share:

1. **Browser Console Error** (full error message)
2. **Server Terminal Logs** (BoldSign related lines)
3. **`.env` Configuration** (just confirm API key exists, don't share actual key)
4. **BoldSign Account Status** (trial, paid, active)

---

## ✅ Success Indicators

When working correctly, you'll see:

**Browser Console:**
```
📝 All approvals complete! Triggering BoldSign...
📄 Document fetched for BoldSign: { fileName: 'Agreement.pdf', size: 123456 }
📧 BoldSign signers: { legalTeam: 'legal@company.com', client: 'client@company.com' }
✅ Document sent to BoldSign successfully!
  Document ID: xxxxx
  Signing URLs sent to Legal Team and Client
```

**Success Alert:**
```
✅ Request approved successfully!

Your approval has been recorded and the document has been sent to BoldSign for signatures.

The Legal Team will sign first, followed by the Client.

Deal Desk has also been notified.
```

**No error popup** - signature flow proceeds automatically!

---

## 📞 BoldSign Support

If the issue is with BoldSign API itself:

- **Dashboard:** https://app.boldsign.com
- **API Docs:** https://developers.boldsign.com
- **Support:** https://support.boldsign.com
- **Status:** https://status.boldsign.com

---

**Last Updated:** October 23, 2025
























