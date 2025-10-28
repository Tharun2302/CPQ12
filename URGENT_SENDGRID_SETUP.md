# 🚨 URGENT: Enable Deny Button in Emails

## ❌ Current Problem

You're only receiving BoldSign emails without deny button because SendGrid is not configured.

## ✅ Quick Fix (10 Minutes)

### Step 1: Get SendGrid API Key (5 minutes)

1. **Go to**: https://app.sendgrid.com/signup
2. **Sign up** with your email: `abhilashak@youremail.com`
3. **Verify** your email (check inbox)
4. **Skip** the onboarding wizard
5. Go to **Settings** → **API Keys** (left sidebar)
6. Click **"Create API Key"**
7. **Name**: `CPQ_Signatures`
8. **Permissions**: Select **"Full Access"**
9. Click **"Create & View"**
10. **COPY THE KEY** - It looks like:
    ```
    SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ```

### Step 2: Verify Sender Email (3 minutes)

1. In SendGrid, go to **Settings** → **Sender Authentication**
2. Click **"Verify a Single Sender"**
3. Fill in:
   - **From Name**: `CloudFuze`
   - **From Email**: Your email (the one you used to sign up)
   - **Reply To**: Same email
   - **Company**: `CloudFuze`
   - **Address**: Any address (123 Main St)
   - **City**: Any city
   - **State**: Any state
   - **Zip**: Any zip
4. Click **"Create"**
5. **Check your email** for SendGrid verification
6. **Click the verification link**
7. **Done!** ✅

### Step 3: Update .env File (2 minutes)

1. **Open** `.env` file in your project root
2. **Add these lines**:

```env
SENDGRID_API_KEY=SG.paste-your-copied-key-here
SENDGRID_FROM_EMAIL=youremail@gmail.com
APP_BASE_URL=http://localhost:3001
```

3. **Save** the file

### Step 4: Restart Server

```bash
# Stop server (Ctrl+C)
node server.cjs

# Look for:
📧 Email configured: Yes  ← MUST say "Yes"!
```

### Step 5: Test Again

1. **Start new workflow**
2. **Complete all approvals**
3. **Check your inbox** - you should now receive **2 emails**:
   
   **Email 1: CloudFuze** (NEW!)
   ```
   From: CloudFuze
   Subject: Action Required: Sign Agreement
   
   [📝 Review and Sign] [❌ Decline with Reason]
   ```
   
   **Email 2: BoldSign** (Original)
   ```
   From: CloudFuze via BoldSign
   Subject: Signature Request
   
   [Review and Sign]
   ```

## 🎯 Why You Need This

Without SendGrid configuration:
- ❌ Only BoldSign email sent (no deny option)
- ❌ Users cannot decline signature requests
- ❌ No deny button visible

With SendGrid configured:
- ✅ Custom email sent with deny button
- ✅ BoldSign email still sent for signing
- ✅ Users have both options clearly visible
- ✅ Can decline with reason

## 📋 Alternative: Add Deny Link to BoldSign Message

If you don't want to use SendGrid, I can add a text link in the BoldSign message:

```
Message for everyone:
CloudFuze has requested you to review and sign this agreement.

If you have concerns, click here to decline: 
http://localhost:3001/deny-signature?workflow=xxx

Legal Team will sign first, followed by the Client.
```

**But this is NOT a button** - just a clickable text link in the message.

## 🎯 Recommended Solution

**Use SendGrid** - it's:
- ✅ Free (100 emails/day)
- ✅ Professional
- ✅ Easy to setup (10 minutes)
- ✅ Gives you full control
- ✅ Provides proper deny button

**Setup Time**: 10 minutes  
**Cost**: FREE  
**Result**: Professional emails with deny button

---

**Follow Steps 1-5 above and you'll have deny buttons in emails within 10 minutes!** 🚀


