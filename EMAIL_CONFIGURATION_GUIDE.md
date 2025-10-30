# Email Configuration Guide - Fix 500 Error

## ❌ The Error You're Seeing

```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
Workflow created but Technical Team email failed.
```

This error occurs because **SendGrid email is not configured** in your `.env` file.

---

## ✅ Quick Fix (5 Minutes)

### Step 1: Get a SendGrid API Key (FREE)

1. Go to https://sendgrid.com
2. Click **"Start for Free"** (100 emails/day free forever)
3. Sign up with your email
4. Verify your email address
5. Complete the setup wizard

### Step 2: Create an API Key

1. Once logged in, go to **Settings** → **API Keys**
2. Click **"Create API Key"**
3. Name it: `CPQ-Application`
4. Permissions: Select **"Full Access"** (or at minimum "Mail Send")
5. Click **"Create & View"**
6. **COPY THE API KEY** (you won't see it again!)

### Step 3: Add to Your `.env` File

Open your `.env` file and add this line:

```env
SENDGRID_API_KEY=SG.paste-your-actual-api-key-here
```

**Example:**
```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 4: Restart Your Server

**Stop the server** (Ctrl+C in the terminal running `node server.cjs`)

**Start it again:**
```bash
node server.cjs
```

### Step 5: Verify Email Configuration

You should see this in the server logs:
```
✅ Email configured (SendGrid)
```

---

## 🧪 Test the Fix

1. Generate a new quote
2. Start approval workflow
3. Enter email addresses
4. Click "Start Approval Workflow"
5. You should see:
   - ✅ **Success message** (no error)
   - ✅ **Email sent to Technical Team**
   - ✅ Check your email inbox

---

## 🔍 Verify SendGrid Setup

### In SendGrid Dashboard:

1. Go to https://app.sendgrid.com
2. Navigate to **Activity** → **Email Activity**
3. You should see your sent emails listed
4. Check delivery status

### Common SendGrid Issues:

#### Issue 1: "Sender Identity Not Verified"
**Solution:**
1. Go to **Settings** → **Sender Authentication**
2. Click **"Verify a Single Sender"**
3. Enter your email address
4. Verify the email SendGrid sends you
5. Use this verified email in the "from" field

#### Issue 2: Emails Going to Spam
**Solution:**
1. Ask recipients to check spam/junk folder
2. Add sender to safe senders list
3. For production: Set up domain authentication in SendGrid

#### Issue 3: API Key Not Working
**Solution:**
1. Make sure you copied the entire key (starts with `SG.`)
2. Check for extra spaces before/after the key
3. API key must have "Mail Send" permissions
4. Try creating a new API key

---

## 📧 Your Complete `.env` File Should Look Like:

```env
# ===========================================
# EMAIL CONFIGURATION
# ===========================================
SENDGRID_API_KEY=SG.your-actual-sendgrid-api-key-here

# ===========================================
# BOLDSIGN INTEGRATION
# ===========================================
BOLDSIGN_API_KEY=your-boldsign-api-key-here
BOLDSIGN_API_URL=https://api.boldsign.com

# ===========================================
# DATABASE CONFIGURATION
# ===========================================
MONGODB_URI=mongodb://localhost:27017
DB_NAME=cpq_database

# ===========================================
# SERVER CONFIGURATION
# ===========================================
PORT=3001
NODE_ENV=development
```

---

## 🎯 What Emails Will Be Sent?

Once configured, the system will automatically send emails:

1. **Technical Team** - When workflow is created
2. **Legal Team** - When Technical Team approves
3. **Client** - When Legal Team approves
4. **Deal Desk** - When Client approves
5. **BoldSign Emails** - For document signing (via BoldSign, not SendGrid)

---

## 🚨 Troubleshooting

### Server Still Shows 500 Error After Adding Key

**Check:**
1. Did you restart the server?
2. Is the API key in the `.env` file (not `env-template.txt`)?
3. No quotes around the API key in `.env`
4. No spaces before `SENDGRID_API_KEY`

**Test the API Key:**
```bash
# In terminal, check if key is loaded:
node -e "require('dotenv').config(); console.log('Key:', process.env.SENDGRID_API_KEY)"
```

Should show: `Key: SG.xxxxx...`

### "Workflow created but email failed"

This means:
- ✅ Workflow is working correctly
- ❌ Email is not configured
- **Action:** Follow steps above to add SendGrid

### Emails Not Arriving

**Check:**
1. Spam/junk folder
2. SendGrid Activity dashboard
3. Email address is correct
4. Sender email is verified in SendGrid

---

## 💡 Alternative: Skip Email Configuration (Development Only)

If you want to test without emails temporarily, you can modify the workflow to continue without sending emails. However, this is **NOT recommended** because:

- Users won't be notified of approvals
- Manual notification required for each step
- Not suitable for production

**For testing only**, you can continue clicking "OK" on the error and manually notify approvers.

---

## ✅ Success Indicators

### In Server Console:
```
✅ Email configured (SendGrid)
📧 Sending email to Manager...
✅ Email sent successfully via SendGrid
```

### In Application:
- No error alerts
- "Workflow created successfully" message
- Check email inbox for notification

### In SendGrid Dashboard:
- Email appears in Activity log
- Status: "Delivered" or "Processed"

---

## 📞 Need Help?

### SendGrid Resources:
- **Docs:** https://docs.sendgrid.com
- **Support:** https://support.sendgrid.com
- **API Reference:** https://docs.sendgrid.com/api-reference

### Common Questions:

**Q: Do I need to pay for SendGrid?**  
A: No! Free tier includes 100 emails/day forever.

**Q: Can I use Gmail instead?**  
A: Not currently. The application is configured for SendGrid. Gmail SMTP can be added if needed.

**Q: How do I change the "from" email address?**  
A: Edit the email configuration in `server.cjs` (search for `from:` fields)

**Q: What if I hit the 100 email/day limit?**  
A: Upgrade to a paid plan or use a different email service

---

## 🎉 Once Configured

Your complete workflow will work end-to-end:

```
Create Workflow
    ↓
📧 Email → Technical Team
    ↓
Technical Approves
    ↓
📧 Email → Legal Team
    ↓
Legal Approves
    ↓
📧 Email → Client
    ↓
Client Approves
    ↓
📧 Email → Deal Desk
    ↓
🎯 BoldSign → Legal Team & Client for Signatures
```

**Everything automated!** 🚀

---

**Last Updated:** October 23, 2025  
**Status:** Ready to Configure


