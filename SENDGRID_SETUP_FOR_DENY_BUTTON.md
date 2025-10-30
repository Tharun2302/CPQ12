# SendGrid Setup Guide - Enable Deny Button in Emails

## 🎯 Goal

Configure SendGrid to send custom emails with both "Review and Sign" and "Decline with Reason" buttons to Legal Team and Client.

---

## 📋 Step-by-Step Setup

### Step 1: Create SendGrid Account

1. Go to https://sendgrid.com
2. Click **"Sign Up"** or **"Start for Free"**
3. Fill in your details:
   - Email address
   - Password
   - Company name
4. Verify your email address
5. Complete the setup wizard

**💡 Tip**: SendGrid offers a free plan with 100 emails/day - perfect for testing!

---

### Step 2: Create API Key

1. **Login to SendGrid** dashboard
2. Click on **Settings** in left sidebar
3. Click on **API Keys**
4. Click **"Create API Key"** button
5. Configure your API key:
   - **Name**: `CPQ_BoldSign_Integration`
   - **Permissions**: Select **"Full Access"**
6. Click **"Create & View"**
7. **Copy the API key** (you'll only see it once!)
   - It will look like: `SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
8. Store it safely

---

### Step 3: Verify Sender Email

SendGrid requires you to verify the sender email address:

#### Option A: Single Sender Verification (Quick & Easy)

1. In SendGrid dashboard, go to **Settings** → **Sender Authentication**
2. Click **"Verify a Single Sender"**
3. Fill in sender details:
   - **From Name**: CloudFuze
   - **From Email Address**: `noreply@yourdomain.com` (or use your Gmail)
   - **Reply To**: Your email
   - **Company**: CloudFuze
   - **Address**: Your address
4. Click **"Create"**
5. **Check your email** for verification link
6. Click the verification link

#### Option B: Domain Authentication (Recommended for Production)

1. Go to **Settings** → **Sender Authentication**
2. Click **"Authenticate Your Domain"**
3. Follow the DNS setup instructions
4. Add DNS records to your domain

**For Testing**: Use Option A (Single Sender Verification) with your Gmail

---

### Step 4: Update .env File

Create or update your `.env` file with:

```env
# SendGrid Configuration (Required for custom emails with deny button)
SENDGRID_API_KEY=SG.your-actual-api-key-here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# App Base URL
APP_BASE_URL=http://localhost:3001

# BoldSign Configuration (Already configured)
BOLDSIGN_API_KEY=your-boldsign-key
BOLDSIGN_API_URL=https://api.boldsign.com
```

**Important**: Replace values with your actual API keys and email!

**Example for Testing with Gmail:**
```env
SENDGRID_API_KEY=SG.abc123xyz...
SENDGRID_FROM_EMAIL=youremail@gmail.com
APP_BASE_URL=http://localhost:3001
```

---

### Step 5: Restart Server

```bash
# Stop current server (Ctrl+C)
# Restart server
node server.cjs
```

**Expected Console Output:**
```
✅ MongoDB connection successful
🚀 Server running on port 3001
📊 Database available: true
📧 Email configured: Yes  ← Should show "Yes" now!
🔗 HubSpot API key: Configured
```

---

### Step 6: Test the Custom Emails

1. **Complete approval workflow** to trigger BoldSign
2. **Check your inbox** - you should now receive **2 emails**:

   **Email 1: Custom CloudFuze Email** ⭐ NEW!
   ```
   From: CloudFuze <noreply@yourdomain.com>
   Subject: Action Required: Sign Agreement - John Smith
   
   [Contains]:
   - 📝 Review and Sign button (blue)
   - ❌ Decline with Reason button (red)
   - Document details
   - Warning about concerns
   ```

   **Email 2: BoldSign Email** (Original)
   ```
   From: CloudFuze via BoldSign <notification@mail.boldsign.com>
   Subject: Signature Request: CloudFuze has requested you to sign...
   
   [Contains]:
   - Review and Sign button (blue)
   - Document details
   ```

3. **Click "Decline with Reason"** button in custom email
4. **Provide reason** and submit
5. **Verify** all participants receive denial notification

---

## ❓ Frequently Asked Questions

### Q: Can I customize the BoldSign email?
**A**: No, BoldSign's emails are controlled by BoldSign and cannot be customized. That's why we send a separate custom email with the deny button.

### Q: Why do signers receive 2 emails?
**A**: 
- **Custom Email**: From CloudFuze with deny button option
- **BoldSign Email**: From BoldSign with actual signing interface
- This gives users flexibility to either sign OR deny

### Q: Can I disable BoldSign emails and only send custom emails?
**A**: Not easily. BoldSign automatically sends emails when you create a signature request. The custom email complements it by adding the deny option.

### Q: What if I don't have a domain?
**A**: For testing, you can use your Gmail address as the sender email in SendGrid (after verifying it).

### Q: Is SendGrid free?
**A**: Yes! SendGrid has a free plan with 100 emails/day, which is perfect for testing and small-scale use.

---

## 🔧 Troubleshooting

### Issue: Not receiving custom emails

**Check:**
1. ✅ SendGrid API key added to `.env`
2. ✅ Sender email verified in SendGrid
3. ✅ Server restarted after adding API key
4. ✅ Check spam/junk folder
5. ✅ Check server console logs for email errors

**Server Console Should Show:**
```
✅ Custom signature request emails sent with Deny button
```

### Issue: SendGrid API error

**Check:**
1. API key is correct (starts with `SG.`)
2. API key has "Full Access" permissions
3. Sender email is verified in SendGrid
4. No typos in `.env` file

---

## 🎉 Expected Result

After setup, when BoldSign is triggered:

**Legal Team receives:**
1. ✅ Custom email with **both buttons** (Review and Sign + Deny)
2. ✅ BoldSign email with signing link

**Client receives:**
1. ✅ Custom email with **Deny button**
2. ✅ BoldSign email after Legal Team signs

**Both can:**
- Click "Review and Sign" → Go to BoldSign
- Click "Decline with Reason" → Explain concerns

---

## 📊 SendGrid Setup Checklist

- [ ] SendGrid account created
- [ ] API key generated with Full Access
- [ ] API key copied safely
- [ ] Sender email verified in SendGrid
- [ ] `.env` file updated with `SENDGRID_API_KEY`
- [ ] `.env` file updated with `SENDGRID_FROM_EMAIL`
- [ ] `.env` file updated with `APP_BASE_URL`
- [ ] Server restarted
- [ ] Test workflow completed
- [ ] Custom emails received
- [ ] Deny button visible in custom email
- [ ] Deny functionality tested

---

## 🚀 Quick Start Commands

```bash
# 1. Stop server (Ctrl+C if running)

# 2. Edit .env file and add:
#    SENDGRID_API_KEY=SG.your-api-key
#    SENDGRID_FROM_EMAIL=your-verified-email@domain.com

# 3. Restart server
node server.cjs

# 4. Look for this in console:
#    📧 Email configured: Yes  ← Should be "Yes"!

# 5. Test workflow
npm run dev
```

---

## ✅ Benefits of This Solution

1. **✅ Deny Button Visible**: Clear red button in email
2. **✅ Professional**: Custom CloudFuze branded emails
3. **✅ User Choice**: Both sign and deny options available
4. **✅ Flexibility**: Users can deny before opening BoldSign
5. **✅ Audit Trail**: All denials tracked with reasons
6. **✅ Notifications**: Everyone informed of denials

---

**Status**: Implementation Complete - Needs SendGrid Configuration  
**Time to Setup**: 10-15 minutes  
**Cost**: Free (SendGrid free plan)  
**Date**: October 27, 2025

