# 🚀 QUICK START: Gmail Workaround (5 Minutes)

## ✅ SIMPLE CHECKLIST

### ☐ Step 1: Verify Gmail in SendGrid (if not already done)
1. Go to: https://app.sendgrid.com/settings/sender_auth/senders
2. Check if `saitharunreddy2302@gmail.com` has a green checkmark ✓
3. If NOT verified:
   - Click "Create New Sender"
   - Email: `saitharunreddy2302@gmail.com`
   - Fill in other fields (any values)
   - Check Gmail inbox for verification email
   - Click verification link
   - Wait for "Verified" status

---

### ☐ Step 2: Update .env File
1. Open file: `.env` in project root
2. Find these lines:
   ```
   SENDGRID_VERIFIED_FROM=...
   SENDGRID_VERIFIED_DOMAINS=...
   ```
3. Change them to:
   ```
   SENDGRID_VERIFIED_FROM=saitharunreddy2302@gmail.com
   SENDGRID_VERIFIED_DOMAINS=gmail.com
   ```
4. Make sure this line stays:
   ```
   EMAIL_FROM=tharun.pothi@cloudfuze.com
   ```
5. Save the file

**See `ENV_CONFIG_GMAIL_WORKAROUND.txt` for complete example!**

---

### ☐ Step 3: Restart Server
```bash
# In terminal, stop server:
Ctrl+C

# Start server again:
node server.cjs
```

**Look for this in logs:**
```
✅ Email configured (SendGrid)
📧 SendGrid verified from: saitharunreddy2302@gmail.com
```

---

### ☐ Step 4: Test Approval Workflow
1. Go back to your CPQ app: http://localhost:5173
2. Generate a quote
3. Click "Start Approval Workflow"
4. Enter email addresses:
   - Technical Team: `abhilasha.kandakatla@cloudfuze.com`
   - Legal Team: `abhilasha.kandakatla@cloudfuze.com`
   - Client: `anush.dasari@cloudfuze.com`
5. Click "Start Approval Workflow"
6. Should see: ✅ Success message (no error!)
7. Check inbox: Email should arrive in 2-5 minutes

---

## 📧 WHAT RECIPIENTS WILL SEE

**Email FROM field:**
```
From: saitharunreddy2302@gmail.com
(or "CloudFuze CPQ System" <saitharunreddy2302@gmail.com>)
```

**When they click REPLY:**
```
Reply goes to: tharun.pothi@cloudfuze.com
```

**This is fine for now!** It works, and that's what matters.

---

## ⚠️ TROUBLESHOOTING

### Error: "Email send failed: Invalid email addresses"
- Make sure Gmail is verified in SendGrid (green checkmark)
- Check .env file has exact email: `saitharunreddy2302@gmail.com`

### Error still appears
- Restart server completely (Ctrl+C, then node server.cjs)
- Check .env file is saved
- Verify changes were made to .env (not env-template.txt)

### Email still goes to quarantine
- Check .env: `SENDGRID_VERIFIED_FROM=saitharunreddy2302@gmail.com` (NOT cloudfuze.com)
- Restart server
- Clear browser cache and try again

---

## 🎯 SUCCESS CRITERIA

**You'll know it's working when:**
- ✅ No error popup when starting workflow
- ✅ Success message appears
- ✅ Email arrives in recipient's inbox (not quarantine)
- ✅ Email shows FROM Gmail address
- ✅ Reply-To shows CloudFuze address

---

## 📝 NOTES

**This is a workaround, not permanent solution.**

**For permanent fix:**
- Send DNS email to IT (see email template in previous conversation)
- After IT adds DNS records (2-3 days)
- Switch .env back to CloudFuze sender
- More professional long-term

**But for now, this gets you unblocked and working!** 🎉

---

## 🚀 AFTER IT WORKS

Once you confirm emails are reaching inbox:
1. ✅ Your workflow is unblocked
2. ✅ You can work normally
3. ✅ Send DNS email to IT when you have time
4. ✅ Switch to proper fix later

**No rush! The Gmail workaround is perfectly fine for now.**

---

**Questions? Issues? Just let me know!** 💪



