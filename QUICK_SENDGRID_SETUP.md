# ⚡ Quick SendGrid Setup (5 Minutes)

## 🎯 Why You Need This

**Problem**: You're only seeing BoldSign emails without a deny button.  
**Solution**: SendGrid sends custom CloudFuze emails with both "Review and Sign" and "Deny" buttons.

---

## 🚀 Quick Setup (Follow These Steps)

### Step 1: Get SendGrid API Key (2 minutes)

1. **Go to**: https://sendgrid.com/signup
2. **Sign up** with your email (free account)
3. **Verify** your email address
4. **Skip** the onboarding wizard (or complete it)
5. Go to **Settings** → **API Keys** (left sidebar)
6. Click **"Create API Key"**
7. **Name**: `CPQ_Signatures`
8. **Permissions**: Select **"Full Access"**
9. Click **"Create & View"**
10. **COPY THE KEY** (starts with `SG.`)
    - You'll only see it once!
    - Paste it somewhere safe

---

### Step 2: Verify Sender Email (2 minutes)

1. In SendGrid, go to **Settings** → **Sender Authentication**
2. Click **"Verify a Single Sender"**
3. Fill in:
   - **From Name**: CloudFuze
   - **From Email**: Your email (e.g., `youremail@gmail.com`)
   - **Reply To**: Same email
   - **Company**: CloudFuze
   - **Address**: Any address
   - **City/State/Zip**: Any location
4. Click **"Create"**
5. **Check your email** inbox
6. **Click verification link** in SendGrid email
7. **Done** - email is verified ✅

---

### Step 3: Update .env File (1 minute)

1. **Open** your `.env` file (in project root: `C:\Users\AbhilashaK\Desktop\gain\CPQ12\.env`)
2. **Add these lines**:

```env
# SendGrid Configuration
SENDGRID_API_KEY=SG.paste-your-api-key-here
SENDGRID_FROM_EMAIL=youremail@gmail.com

# App URL
APP_BASE_URL=http://localhost:3001
```

3. **Replace**:
   - `SG.paste-your-api-key-here` with your actual SendGrid API key
   - `youremail@gmail.com` with the email you verified in Step 2

4. **Save** the file

---

### Step 4: Restart Server (30 seconds)

```bash
# Stop current server (Ctrl+C in terminal)

# Restart server
node server.cjs
```

**Look for this output:**
```
✅ MongoDB connection successful
🚀 Server running on port 3001
📧 Email configured: Yes  ← IMPORTANT: Should say "Yes"!
```

If it says `Email configured: No`, check your `.env` file for typos.

---

### Step 5: Test It! (1 minute)

1. **Complete a workflow** that triggers BoldSign
2. **Check your email inbox**
3. You should receive **2 emails**:

   **Email 1: Custom CloudFuze Email** ⭐
   ```
   From: CloudFuze <youremail@gmail.com>
   Subject: Action Required: Sign Agreement - Client Name
   
   [Blue Button] 📝 Review and Sign
   [Red Button]  ❌ Decline with Reason  ← THIS IS NEW!
   ```

   **Email 2: BoldSign Email** (Original)
   ```
   From: CloudFuze via BoldSign
   Subject: Signature Request: CloudFuze has requested you to sign...
   
   [Blue Button] Review and Sign
   ```

4. **Click the red "Decline with Reason" button** in Email 1
5. **Enter a reason** and submit
6. **Verify** workflow is marked as denied

---

## ✅ Success Checklist

- [ ] SendGrid account created
- [ ] API key copied (starts with `SG.`)
- [ ] Sender email verified (check mark in SendGrid)
- [ ] `.env` file updated with API key
- [ ] `.env` file updated with sender email
- [ ] Server restarted
- [ ] Console shows `Email configured: Yes`
- [ ] Received custom email with deny button
- [ ] Received BoldSign email
- [ ] Deny button works

---

## 🎉 Expected Result

### Before Setup:
- ❌ Only BoldSign email (no deny option)
- ❌ Users can't decline with reason
- ❌ No custom CloudFuze emails

### After Setup:
- ✅ Custom CloudFuze email with deny button
- ✅ BoldSign email with signing link
- ✅ Users can decline with reason
- ✅ Professional custom emails
- ✅ All participants notified of denials

---

## 🔧 Troubleshooting

### Issue: Not receiving custom emails

**Solution 1**: Check `.env` file
```bash
# Verify these lines exist in .env:
SENDGRID_API_KEY=SG.your-key
SENDGRID_FROM_EMAIL=youremail@gmail.com
```

**Solution 2**: Check server console
```bash
# Look for these logs:
✅ Custom signature request emails sent with Deny button
📧 Email configured: Yes

# If you see errors:
⚠️ Could not send custom signature emails: [error]
```

**Solution 3**: Check spam folder
- Custom emails might be in spam
- Add sender to contacts

**Solution 4**: Verify sender email in SendGrid
- Go to SendGrid → Sender Authentication
- Make sure email has green checkmark

---

### Issue: Server shows "Email configured: No"

**Cause**: SendGrid API key not detected

**Fix**:
1. Check `.env` file has `SENDGRID_API_KEY`
2. Make sure key starts with `SG.`
3. No extra spaces or quotes around key
4. Restart server after editing `.env`

---

### Issue: SendGrid API error

**Possible Causes**:
- API key is invalid
- Sender email not verified
- SendGrid account suspended
- API key doesn't have full access

**Fix**:
1. Regenerate API key in SendGrid
2. Verify sender email
3. Check SendGrid account status

---

## 💡 Pro Tips

1. **Use Gmail for Testing**: Easiest way to get started
2. **Check Both Inboxes**: Custom + BoldSign emails might arrive at different times
3. **Whitelist Sender**: Add sender email to contacts to avoid spam
4. **Monitor SendGrid**: Check SendGrid dashboard for email delivery status
5. **Keep API Key Safe**: Never commit `.env` file to git

---

## 📞 Need Help?

### Quick Test Command:

```bash
# Test if SendGrid is configured
node -e "require('dotenv').config(); console.log('SendGrid:', process.env.SENDGRID_API_KEY ? '✅ Configured' : '❌ Not configured')"
```

**Expected Output**: `SendGrid: ✅ Configured`

---

## 🎯 Next Steps

1. **Complete SendGrid setup** (Steps 1-3 above)
2. **Update .env file** (Step 4)
3. **Restart server** (Step 5)
4. **Test workflow** (Step 6)
5. **Verify custom emails** with deny button arrive

---

**This is the BEST solution because**:
- ✅ Professional custom emails
- ✅ Clear deny option for users
- ✅ No BoldSign limitations
- ✅ Full control over email content
- ✅ Easy to implement
- ✅ Free to use (SendGrid free plan)

**Total Setup Time**: 5-10 minutes  
**Status**: Ready to Configure  
**Difficulty**: Easy

