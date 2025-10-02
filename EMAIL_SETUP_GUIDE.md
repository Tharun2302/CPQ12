# Email Setup Guide - Fix Email Sending Issues

## 🚨 Current Issue
You're getting a "Invalid login: 535-5.7.8 Username and Password not accepted" error when trying to send emails. This means your Gmail credentials are not properly configured.

## ✅ Solution Steps

### Step 1: Create Environment File
Create a file named `.env` in your project root directory (same folder as `server.cjs`) with the following content:

```env
# Gmail Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-actual-email@gmail.com
SMTP_PASS=your-gmail-app-password

# Server Configuration
PORT=3001

# Database Configuration (if needed)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=cpq_database1
DB_PORT=3306
```

### Step 2: Set Up Gmail App Password

1. **Enable 2-Factor Authentication:**
   - Go to your Google Account settings: https://myaccount.google.com/
   - Click on "Security" in the left sidebar
   - Enable "2-Step Verification" if not already enabled

2. **Generate App Password:**
   - In Security settings, find "2-Step Verification"
   - Click on "App passwords" (you'll need to enter your password)
   - Select "Mail" as the app and "Other" as the device
   - Click "Generate"
   - Copy the 16-character password (it will look like: `abcd efgh ijkl mnop`)

3. **Update .env File:**
   - Replace `your-actual-email@gmail.com` with your real Gmail address
   - Replace `your-gmail-app-password` with the 16-character App Password you just generated

### Step 3: Restart the Server
After creating/updating the `.env` file, restart your server:

```bash
# Stop the current server (Ctrl+C)
# Then restart it:
node server.cjs
```

### Step 4: Test Email Configuration
Visit this URL to test if your email is configured correctly:
```
http://localhost:3001/api/email/test
```

## 🔧 Alternative Email Providers

### Outlook/Hotmail:
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

### Yahoo:
```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.com
SMTP_PASS=your-app-password
```

## 🚨 Common Issues & Solutions

### Issue: "Invalid login" error
**Solution:** Make sure you're using an App Password, not your regular Gmail password

### Issue: "Less secure app access" error
**Solution:** Enable 2-Factor Authentication and use App Passwords

### Issue: "Username and Password not accepted"
**Solution:** Generate a new App Password from Google Account settings

### Issue: Email not sending after setup
**Solution:** 
1. Check that the `.env` file is in the correct location
2. Restart the server after making changes
3. Verify the App Password is correct (16 characters, no spaces)

## ✅ Verification
After setup, you should be able to:
1. Send emails from the Template Manager
2. Receive signature form links in your email
3. See successful email delivery in the console

## 📞 Need Help?
If you're still having issues:
1. Check the server console for detailed error messages
2. Verify your Gmail App Password is correct
3. Make sure 2-Factor Authentication is enabled
4. Try generating a new App Password
