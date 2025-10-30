# 🚨 FIX: 500 Email Error - Quick Solution

## The Error You're Seeing:
```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
Workflow created but Technical Team email failed.
```

## ✅ Quick Fix (3 Minutes)

### 1. Get Free SendGrid API Key

Visit: **https://app.sendgrid.com/signup**

- Sign up (FREE - 100 emails/day)
- Verify your email
- Go to: **Settings → API Keys**
- Click: **Create API Key**
- Name: `CPQ-App`
- Copy the key (starts with `SG.`)

### 2. Add to `.env` File

Open your `.env` file and add:

```env
SENDGRID_API_KEY=SG.paste-your-key-here
```

### 3. Restart Server

```bash
# Stop server (Ctrl+C)
# Then restart:
node server.cjs
```

### 4. Test Again

- Create a new workflow
- Email should now send ✅
- No more 500 error!

---

## ⚠️ Important Notes:

1. **The workflow IS working** - it's just emails that are failing
2. **You can continue testing** by clicking OK on the error and manually notifying approvers
3. **For production**, you MUST configure SendGrid

---

## 📖 Detailed Guide

See: `EMAIL_CONFIGURATION_GUIDE.md` for complete instructions

---

## 🎯 Current Status:

✅ **Working:**
- Workflow creation
- Document saving
- MongoDB storage
- Approval tracking
- BoldSign integration

❌ **Not Working:**
- Email notifications (needs SendGrid API key)

**Fix:** Add `SENDGRID_API_KEY` to `.env` → Restart server → All fixed! 🎉


