# 🔍 Diagnose Why Custom Emails Are Not Being Sent

## Problem
- ✅ Legal Team receives **BoldSign emails** 
- ❌ Legal Team does **NOT** receive **custom emails** with "Review and Sign" + "Decline with Reason" buttons

---

## Solution: Enhanced Logging Added

I've added detailed logging to help diagnose the issue. Follow these steps:

---

## 🚀 Step 1: Restart Server

**Stop current server:**
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```

**Start server:**
```powershell
npm run dev
```

**Wait for:**
```
🚀 Server is running on port 3001
✅ Connected to MongoDB
```

---

## 🧪 Step 2: Create New Workflow

1. **Open dashboard:**
   ```
   http://localhost:5173/dashboard/quote
   ```

2. **Generate a new quote** with these details:
   - Client: John Smith
   - Technical Team: kandakatlaabhilasha30@gmail.com
   - Legal Team: kandakatlaabhilasha30@gmail.com
   - Client Email: kandakatlaabhi@gmail.com

3. **Start workflow**

---

## ✅ Step 3: Complete Approvals

Approve through all stages:
1. Technical Team → Approve
2. Manager → Approve
3. CEO → Approve

---

## 📋 Step 4: Check Server Logs

**After CEO approves**, you should see detailed logs in the server console:

### ✅ GOOD LOGS (Emails Sent):

```
🎯 Triggering BoldSign integration...
  Document ID: [ID]
  Workflow ID: WF-[NUMBER]
  Legal Team Email: kandakatlaabhilasha30@gmail.com
  Client Email: kandakatlaabhi@gmail.com

✅ BoldSign: Document sent successfully
✅ Legal Team signing URL: https://app.boldsign.com/...
✅ Client signing URL: https://app.boldsign.com/...

📧 Custom Email Check:
  SendGrid Configured: true
  Workflow ID: WF-1761570266850
  Legal Team Email: kandakatlaabhilasha30@gmail.com
  Client Email: kandakatlaabhi@gmail.com

✅ Proceeding to send custom emails...
✅ Custom signature request emails sent with Deny button to Legal Team and Client
```

### ❌ BAD LOGS (Problem Detected):

**Scenario 1: SendGrid Not Configured**
```
📧 Custom Email Check:
  SendGrid Configured: false  ❌
  Workflow ID: WF-1761570266850
  Legal Team Email: kandakatlaabhilasha30@gmail.com
  Client Email: kandakatlaabhi@gmail.com

⚠️ SendGrid not configured - custom emails will not be sent
⚠️ Custom emails NOT sent because:
  - SendGrid not configured
```

**Fix:** Check `.env` file has valid SendGrid API key

---

**Scenario 2: Workflow ID Missing**
```
📧 Custom Email Check:
  SendGrid Configured: true
  Workflow ID: MISSING!  ❌
  Legal Team Email: kandakatlaabhilasha30@gmail.com
  Client Email: kandakatlaabhi@gmail.com

⚠️ No workflow ID provided - custom emails will not be sent
⚠️ Custom emails NOT sent because:
  - Workflow ID missing
```

**Fix:** Frontend not passing workflowId correctly

---

**Scenario 3: SendGrid Error**
```
📧 Custom Email Check:
  SendGrid Configured: true
  Workflow ID: WF-1761570266850
  Legal Team Email: kandakatlaabhilasha30@gmail.com
  Client Email: kandakatlaabhi@gmail.com

✅ Proceeding to send custom emails...

❌ FAILED to send custom signature emails!
  Error message: [Error details]
  Error code: [Code]
  SendGrid response: [Response]
```

**Fix:** Check SendGrid error details for specific issue

---

## 🎯 Step 5: Share Logs

After you complete a workflow and CEO approves:

1. **Look at the server console logs**
2. **Find the section** with "📧 Custom Email Check:"
3. **Copy the logs** starting from "🎯 Triggering BoldSign..." until after the custom email attempt
4. **Share the logs** with me so I can see exactly what's happening

---

## 🔧 Quick Verification Commands

**Check if SendGrid is configured:**
```powershell
Select-String -Path .env -Pattern "SENDGRID"
```

**Should show:**
```
SENDGRID_API_KEY=SG.O7jGUiW... (valid key)
SENDGRID_FROM_EMAIL=saitharunreddy2302@gmail.com
```

---

## 📊 Expected Email Flow

After CEO approves:

```
1. BoldSign API Call → Document sent ✅
2. Get signing URLs ✅
3. Store in MongoDB ✅
4. Check SendGrid config → Should be true ✅
5. Check workflowId → Should be present ✅
6. Send custom email to Legal Team → Should succeed ✅
7. Send custom email to Client → Should succeed ✅
8. BoldSign sends their own emails → Works ✅
```

**Result:** Legal Team gets **2 emails**:
- ✉️ From BoldSign (notification@mail.boldsign.com)
- ✉️ From Custom System (saitharunreddy2302@gmail.com) ← This one should have the buttons

---

## 🆘 Still Not Working?

If after following all steps the custom emails still don't send:

1. **Copy the server logs** from "🎯 Triggering BoldSign..." section
2. **Check** if you see "📧 Custom Email Check:" in the logs
3. **Check** what the values show (true/false, present/missing)
4. **Share the logs** and I'll help diagnose the exact issue

---

## ✅ Test Email Verification

You can verify SendGrid is working by running:
```bash
node test-sendgrid-quick.cjs
```

This should send a test email immediately. If this works, SendGrid is fine and the issue is in the workflow trigger.


















