# BoldSign Integration Error - Troubleshooting Guide 🔧

## Error Message
```
✅ Workflow approved but BoldSign integration failed.
Please check BoldSign configuration.
```

## What This Error Means
This error occurs when the workflow is successfully approved in your system, but the integration with BoldSign (the e-signature service) failed. The document couldn't be sent for electronic signature.

---

## Common Causes & Solutions

### 1. ❌ BoldSign API Key Not Configured (MOST COMMON)

**Problem:** The `.env` file doesn't have a valid BoldSign API key.

**How to Fix:**

#### Step 1: Get Your BoldSign API Key
1. Go to [https://app.boldsign.com](https://app.boldsign.com)
2. Sign in to your BoldSign account (or create a free account)
3. Navigate to **Settings** → **API Key** (or go directly to https://app.boldsign.com/settings/api)
4. Click **Generate API Key** or copy your existing key
5. Save this key somewhere safe

#### Step 2: Add API Key to Your .env File
1. Open your project root directory
2. Look for a file named `.env` (if it doesn't exist, copy `env-template.txt` to `.env`)
3. Find the line that says:
   ```
   BOLDSIGN_API_KEY=your-boldsign-api-key-here
   ```
4. Replace `your-boldsign-api-key-here` with your actual API key:
   ```
   BOLDSIGN_API_KEY=actual-api-key-from-boldsign
   ```
5. Save the file

#### Step 3: Restart Your Server
**IMPORTANT:** You MUST restart the server for changes to take effect.

```bash
# Stop the server (press Ctrl+C in the terminal running the server)
# Then restart it:
npm run dev
# OR
node server.cjs
```

---

### 2. ❌ Invalid or Expired API Key

**Problem:** The API key in your `.env` file is invalid, expired, or from a trial account that has ended.

**How to Fix:**
1. Log in to BoldSign
2. Check if your account is active
3. Generate a new API key
4. Update the `.env` file with the new key
5. Restart the server

---

### 3. ❌ Server Not Restarted After Configuration

**Problem:** You added the API key but didn't restart the server.

**How to Fix:**
1. Stop the server (Ctrl+C)
2. Restart the server (`npm run dev` or `node server.cjs`)

---

### 4. ❌ BoldSign Account Issue

**Problem:** Your BoldSign account has reached its limit or has been suspended.

**How to Fix:**
1. Log in to BoldSign
2. Check your account status
3. Check your usage limits (free accounts have limits)
4. Upgrade your plan if needed

---

### 5. ❌ Network/API Connection Issue

**Problem:** Server can't reach BoldSign API.

**How to Check:**
1. Check your internet connection
2. Check if `https://api.boldsign.com` is accessible
3. Check firewall settings

---

## How to Diagnose the Exact Issue

Now that I've added better error logging, try approving a workflow again and check:

### Check Browser Console
1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Look for error messages starting with ❌
4. The error will now show specific details

### Check Server Console
1. Look at the terminal where your server is running
2. You should see detailed error logs like:
   ```
   ❌ BoldSign API key not configured
   OR
   ❌ Error triggering BoldSign integration: [specific error]
   OR
   ❌ BoldSign Error Details: [API response]
   ```

---

## Step-by-Step Setup Guide

### Complete BoldSign Setup

1. **Create BoldSign Account**
   - Go to https://www.boldsign.com/
   - Sign up for a free account
   - Verify your email

2. **Get API Key**
   - Log in to https://app.boldsign.com
   - Go to Settings → API Key
   - Generate new API key
   - Copy the key

3. **Configure .env File**
   ```env
   # BoldSign Configuration
  
   BOLDSIGN_API_URL=https://api.boldsign.com
   ```

4. **Restart Server**
   ```bash
   # Stop server
   Ctrl+C
   
   # Restart
   npm run dev
   ```

5. **Test the Integration**
   - Create a test quote
   - Complete the approval workflow
   - Try approving at Manager or CEO level
   - Check if BoldSign email is sent

---

## Verification Checklist

After setup, verify:

- [ ] `.env` file exists in project root
- [ ] `BOLDSIGN_API_KEY` is set in `.env`
- [ ] API key is valid (not "your-boldsign-api-key-here")
- [ ] Server has been restarted after adding the key
- [ ] BoldSign account is active
- [ ] Server console shows no BoldSign errors
- [ ] Workflow approval succeeds without errors

---

## Testing Your Configuration

### Test Script
Create a file called `test-boldsign-config.js` in your project root:

```javascript
require('dotenv').config();

console.log('🔍 Checking BoldSign Configuration...\n');

const apiKey = process.env.BOLDSIGN_API_KEY;

if (!apiKey) {
  console.error('❌ BOLDSIGN_API_KEY is not set in .env file');
  console.log('\n📝 Fix: Add BOLDSIGN_API_KEY=your-key-here to .env file');
  process.exit(1);
}

if (apiKey === 'your-boldsign-api-key-here') {
  console.error('❌ BOLDSIGN_API_KEY is still set to the default placeholder');
  console.log('\n📝 Fix: Replace with your actual BoldSign API key');
  process.exit(1);
}

if (apiKey.length < 20) {
  console.error('⚠️  BOLDSIGN_API_KEY seems too short to be valid');
  console.log('   Most BoldSign API keys are longer');
}

console.log('✅ BOLDSIGN_API_KEY is configured');
console.log('   Key length:', apiKey.length);
console.log('   Key preview:', apiKey.substring(0, 10) + '...');
console.log('\n✅ Configuration looks good!');
console.log('\n📝 Next steps:');
console.log('   1. Make sure server is running: npm run dev');
console.log('   2. Try approving a workflow');
console.log('   3. Check browser and server console for any errors');
```

Run it:
```bash
node test-boldsign-config.js
```

---

## Expected Behavior After Fix

When everything is configured correctly:

1. **After Manager Approval:**
   ```
   ✅ Workflow approved successfully!
   🎯 Document sent to BoldSign for Legal Team and Client signatures.
   ```

2. **After CEO Approval:**
   ```
   ✅ Workflow approved successfully!
   🎯 Document sent to BoldSign for signature.
   ```

3. **Emails Sent:**
   - Legal Team receives signing email
   - Client receives signing email
   - Both have "Sign Here" buttons

4. **Server Console Shows:**
   ```
   🎯 Triggering BoldSign integration...
   📄 Fetching document from MongoDB...
   ✅ Document found: [filename]
   🚀 Sending request to BoldSign API...
   ✅ BoldSign: Document sent successfully
     Document ID: [boldsign-doc-id]
   ```

---

## Still Having Issues?

### Enhanced Error Messages
The latest update now shows detailed error messages. When you approve a workflow and BoldSign fails, you'll see:

```
❌ Error: [Specific error message]

BoldSign API Response:
{
  "error": "...",
  "message": "..."
}

Please check:
• BoldSign API key in .env file
• Server console for detailed error logs
```

### Get More Help

1. **Check Server Logs**
   - Look for any red error messages
   - Copy the full error and check what it says

2. **Check BoldSign Status**
   - Go to https://status.boldsign.com
   - Make sure BoldSign service is operational

3. **Verify API Key**
   - Log in to BoldSign
   - Try generating a fresh API key
   - Make sure you're using the correct key

4. **Test with Postman/cURL**
   ```bash
   curl -X GET "https://api.boldsign.com/v1/brand/list" \
     -H "X-API-KEY: your-api-key-here"
   ```
   If this works, your API key is valid.

---

## Summary

**Most Common Issue:** BoldSign API key not configured in `.env` file

**Quick Fix:**
1. Get API key from https://app.boldsign.com/settings/api
2. Add to `.env`: `BOLDSIGN_API_KEY=your-actual-key`
3. Restart server: `Ctrl+C` then `npm run dev`
4. Try approval again

**The workflow approval still succeeds** - only the BoldSign e-signature sending fails. This is by design so approvals aren't blocked by external service issues.



