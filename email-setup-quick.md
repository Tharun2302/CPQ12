# Quick Email Setup Guide

## 🚨 Issue: "Failed to send agreement email"

Your CPQ system can't send emails because the server doesn't have email credentials configured.

## ✅ Quick Fix (5 minutes)

### Step 1: Create `.env` file
Create a file named `.env` in your CPQ folder (same location as `server.cjs`) with this content:

```env
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
```

### Step 2: Get Gmail App Password
1. Go to your Gmail account settings
2. Enable 2-Factor Authentication if not already enabled
3. Go to Security → 2-Step Verification → App passwords
4. Create new app password for "Mail"
5. Copy the 16-character password (like: `abcd efgh ijkl mnop`)

### Step 3: Update `.env` file
```env
EMAIL_USER=youremail@gmail.com
EMAIL_PASS=abcdefghijklmnop
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
```

### Step 4: Restart server
- Stop the server (Ctrl+C)
- Run: `node server.cjs`

## 🧪 Test Email
Visit: `http://localhost:3001/api/health`
Should show: `"email": "Configured"`

## 📱 Alternative: Manual Download
If you can't set up email immediately:
1. Click "Download Agreement" instead
2. Send the downloaded file manually via your email client

## 🆘 Need Help?
Check the server console for detailed error messages when attempting to send emails.
