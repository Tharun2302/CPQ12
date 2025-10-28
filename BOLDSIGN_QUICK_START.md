# BoldSign Integration - Quick Start

## 🚀 5-Minute Setup

### Step 1: Get Your BoldSign API Key (2 minutes)

1. Go to https://app.boldsign.com
2. Sign up for free trial (if you don't have an account)
3. Navigate to: **Settings** → **API** → **Generate API Key**
4. Copy the API key

### Step 2: Configure Your Application (1 minute)

1. Open your `.env` file (or create one by copying `env-template.txt`)
2. Add this line:
   ```env
   BOLDSIGN_API_KEY=paste-your-api-key-here
   ```
3. Save the file

### Step 3: Restart Your Server (1 minute)

```bash
# Stop the server (Ctrl+C)
# Then restart:
node server.cjs
```

### Step 4: Test It! (1 minute)

1. Generate a quote in your application
2. Start an approval workflow
3. Complete all approval stages (Technical Team → Legal Team → Client)
4. When Client approves, watch the magic happen! ✨

---

## ✅ What Happens Automatically

When all approvals are complete:

1. ✅ System fetches the finalized document
2. ✅ Sends document to BoldSign API
3. ✅ Adds signature fields on page 3
4. ✅ BoldSign emails Legal Team with signing link
5. ✅ After Legal Team signs, BoldSign emails Client
6. ✅ Both parties can sign electronically

---

## 📋 Signature Fields (Page 3)

### For Both Legal Team & Client:
- **By**: Signature field (draw or upload)
- **Name**: Text input (no default value)
- **Title**: Text input (no default value)
- **Date**: Date field (auto-filled on signing)

---

## 🎯 Signing Flow

```
Legal Team receives email → Signs document → Fills Name, Title, Date
                                                    ↓
                            Client receives email → Signs document → Fills Name, Title, Date
                                                    ↓
                                            Document Complete! 🎉
```

---

## ⚠️ Troubleshooting

### "BoldSign API key not configured"
- **Fix**: Add `BOLDSIGN_API_KEY` to your `.env` file
- **Then**: Restart the server

### Not receiving emails?
- **Check**: Spam/junk folder
- **Verify**: Email addresses in approval workflow are correct
- **BoldSign**: Check your BoldSign dashboard for sent documents

### Document not sending?
- **Check**: Browser console for error messages
- **Verify**: Document exists in MongoDB
- **Logs**: Check server logs for BoldSign API errors

---

## 📧 Example Test Emails

Use these for testing (replace with real emails):

- **Technical Team**: tech@yourcompany.com
- **Legal Team**: legal@yourcompany.com
- **Client**: client@example.com

**Tip**: You can use your own email for all three to test the entire flow yourself!

---

## 🔍 Verify It's Working

### In Browser Console (F12):
```
✅ Look for these logs:
📝 All approvals complete! Triggering BoldSign...
📄 Document fetched for BoldSign: {...}
✅ Document sent to BoldSign successfully!
```

### In BoldSign Dashboard:
1. Login to https://app.boldsign.com
2. Go to **Documents** section
3. You should see your document listed
4. Status: "Waiting for Legal Team"

---

## 🎉 Success!

If you see:
- ✅ Success message in browser
- ✅ Document in BoldSign dashboard
- ✅ Email received by Legal Team

**Congratulations!** Your BoldSign integration is working perfectly! 🎊

---

## 📖 Need More Help?

See the complete guide: [BOLDSIGN_INTEGRATION_GUIDE.md](./BOLDSIGN_INTEGRATION_GUIDE.md)

---

**Questions?** Check the Troubleshooting section or review server logs for detailed error messages.

