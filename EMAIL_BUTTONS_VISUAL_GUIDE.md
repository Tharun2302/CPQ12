# Visual Guide: Email Buttons & What Happens When Clicked 🎯

## 📧 The TWO Emails Legal Team Receives

```
╔═══════════════════════════════════════════════════════════════════════╗
║                         LEGAL TEAM INBOX                              ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  📧 EMAIL 1: From saitharunreddy2302@gmail.com ✅ HAS DENY BUTTON    ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║  Subject: Action Required: Sign Agreement - John Smith               ║
║                                                                       ║
║  Hi Legal Team,                                                       ║
║  CloudFuze has requested you to review and sign the document...      ║
║                                                                       ║
║  📄 Document Details:                                                 ║
║  • Document: Agreement - John Smith                                   ║
║  • Client: John Smith                                                 ║
║  • Your Role: Legal Team (First Signer)                               ║
║                                                                       ║
║  ┌─────────────────────┐   ┌──────────────────────┐                 ║
║  │ 📝 Review and Sign  │   │ ❌ Decline with      │                 ║
║  │                     │   │    Reason            │                 ║
║  │   (BLUE BUTTON)     │   │   (RED BUTTON)       │ ← LOOK FOR THIS ║
║  └─────────────────────┘   └──────────────────────┘                 ║
║                                                                       ║
║  ⚠️ Have concerns? Click "Decline with Reason" to explain.           ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  📧 EMAIL 2: From notification@mail.boldsign.com ❌ NO DENY BUTTON   ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║
║  Subject: CloudFuze via BoldSign                                     ║
║                                                                       ║
║  Hi Adi Nandyala,                                                    ║
║  CloudFuze has requested you to review and sign...                   ║
║                                                                       ║
║  ┌─────────────────────┐                                             ║
║  │ Review and Sign     │                                             ║
║  │   (BLUE BUTTON)     │   (Only one button here)                   ║
║  └─────────────────────┘                                             ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 🔘 What Happens When You Click Each Button

### From Email 1 (Your Custom Email):

#### Button 1: "📝 Review and Sign" (Blue)
```
Click
  ↓
Opens BoldSign directly
  ↓
Shows document with signature fields
  ↓
Legal Team signs
  ↓
Document moves to next signer (Client)
  ↓
Client receives signing email
```

#### Button 2: "❌ Decline with Reason" (Red)
```
Click
  ↓
Opens deny form page (localhost:5173/deny-signature)
  ↓
Shows form:
  - Signer Name: [pre-filled]
  - Signer Email: [pre-filled]
  - Reason: [empty - must type]
  ↓
Legal Team types: "Contract terms need revision"
  ↓
Clicks Submit
  ↓
System processes:
  ✅ Saves to MongoDB workflow
  ✅ Revokes BoldSign document
  ✅ Sends emails to EVERYONE
  ↓
Everyone receives notification:
  📧 Technical Team
  📧 Legal Team (confirmation)
  📧 Client
  📧 Deal Desk
  ↓
All emails contain:
  - Who denied (Legal Team)
  - When denied (timestamp)
  - Why denied (the reason typed)
  - Document details
```

---

### From Email 2 (BoldSign's Email):

#### Button: "Review and Sign" (Blue)
```
Same as Email 1 blue button
  ↓
Opens BoldSign signing page
```

#### More Actions → Decline
```
Click on Decline
  ↓
BoldSign asks for confirmation
  ↓
Document declined in BoldSign
  ↓
BoldSign sends basic email to:
  - admin.saas@cloudfuze.com only
  ↓
Your system doesn't know about it
  ↓
No team notifications
  ↓
No reason captured
```

---

## 📬 What Notification Emails Look Like

### When Legal Team Uses "Decline with Reason" Button:

**Everyone gets this email:**

```
┌────────────────────────────────────────────────────────┐
│  From: saitharunreddy2302@gmail.com                    │
│  Subject: Signature Denied: PDF Agreement - John Smith │
├────────────────────────────────────────────────────────┤
│                                                        │
│  📛 Signature Request Denied                           │
│                                                        │
│  Legal Team has declined to sign the document.         │
│                                                        │
│  📄 Document Details:                                  │
│  • Document: PDF Agreement                             │
│  • Client: John Smith                                  │
│  • Denied By: Legal Team (legal@company.com)           │
│  • Date: October 27, 2025 5:04:23 PM                   │
│                                                        │
│  📝 Reason for Denial:                                 │
│  ┌──────────────────────────────────────────┐         │
│  │ Contract pricing needs revision.         │         │
│  │ Please adjust the migration cost and     │         │
│  │ resubmit for approval.                   │         │
│  └──────────────────────────────────────────┘         │
│                                                        │
│  The workflow has been stopped and marked as           │
│  Signature Denied.                                     │
│                                                        │
│  Please review the reason and take appropriate action. │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Recipients:**
- ✅ Technical Team (anushreddydasari@gmail.com or configured email)
- ✅ Legal Team (themselves - confirmation)
- ✅ Client (their email)
- ✅ Deal Desk (if in workflow)

---

## 🎯 Recommended User Guide for Legal Team

Send this to your Legal Team:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 You will receive TWO emails when a document needs your signature:

Email 1 (from saitharunreddy2302@gmail.com):
  → Look for this one!
  → Has 2 buttons: Blue (Sign) and Red (Decline)
  
Email 2 (from notification@mail.boldsign.com):
  → BoldSign's standard notification
  → Has 1 button: Sign only

🎯 TO SIGN:
  → Click the BLUE "Review and Sign" button (from either email)
  → Opens BoldSign → Sign the document
  
🎯 TO DECLINE:
  → Click the RED "Decline with Reason" button (Email 1 only)
  → Type your reason
  → Submit
  → Everyone gets notified with your reason
  
❌ DON'T USE BoldSign's "More Actions → Decline":
  → This doesn't notify the team properly
  → Use our red "Decline with Reason" button instead
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔍 Troubleshooting: "I Don't See the Custom Email"

### Check 1: Verify SendGrid Sent It

Look at server console when workflow is approved. You should see:
```
✅ Custom signature request emails sent with Deny button
```

**If you see:**
```
⚠️ Could not send custom signature emails: ...
```
→ SendGrid failed (check configuration)

### Check 2: Check SendGrid Activity Dashboard

1. Go to: https://app.sendgrid.com/email_activity
2. Look for recent emails
3. Check delivery status
4. See if email was delivered or bounced

### Check 3: Search Email

In your Gmail:
- Search for: `from:saitharunreddy2302@gmail.com`
- Or search: "Action Required Sign Agreement"
- Check ALL folders (Inbox, Spam, Promotions)

---

## 📊 Complete Flow Diagram

```
Technical Team Approves
         ↓
    BoldSign Triggered
         ↓
    ┌────┴────┐
    │         │
Email 1    Email 2
(Custom)   (BoldSign)
    │         │
    ↓         ↓
[eSign]   [eSign]
[Deny]    [only]
    │
    ↓
If Deny clicked:
    ↓
Opens deny form
    ↓
Legal Team types reason
    ↓
Submit
    ↓
System saves & revokes BoldSign
    ↓
Sends notifications to:
  • Technical Team ✅
  • Legal Team ✅
  • Client ✅
  • Deal Desk ✅
    ↓
Everyone knows:
  • Who denied
  • When denied
  • Why denied
```

---

## ✅ Summary

**You're looking for:** Email from **saitharunreddy2302@gmail.com**, NOT BoldSign  
**It has:** Two buttons (Blue eSign + Red Deny)  
**When Deny clicked:** Everyone gets detailed notification email  
**The system is working!** You just need to find the right email! 📧

Check your Gmail now for the test email or do a real workflow test to see both emails! 🚀


