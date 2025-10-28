# Complete Decline/Deny Flow Explained 📧

## 📬 TWO Different Emails You Receive

When Technical Team approves and triggers BoldSign, Legal Team receives **TWO EMAILS**:

### Email 1: From Your System ✅ (Custom Email with Deny Button)

**From:** `saitharunreddy2302@gmail.com` (your SendGrid sender)  
**Subject:** "Action Required: Sign Agreement - [Client Name]"

**Buttons:**
```
┌─────────────────────┐   ┌──────────────────────┐
│ 📝 Review and Sign  │   │ ❌ Decline with Reason│
│     (Blue Button)   │   │     (Red Button)      │
└─────────────────────┘   └──────────────────────┘
```

**⚠️ You need to LOOK FOR THIS EMAIL!** It has the Deny button you're looking for.

---

### Email 2: From BoldSign ❌ (Standard BoldSign Email - NO Deny Button)

**From:** `notification@mail.boldsign.com` (BoldSign's system)  
**Subject:** "CloudFuze via BoldSign"

**Buttons:**
```
┌─────────────────────┐
│ Review and Sign     │
│   (Blue Button)     │
└─────────────────────┘
```

**This is what you showed in Screenshot 1** - it doesn't have our custom Deny button because it's BoldSign's default template.

---

## 🔍 TWO Different Decline Options

### Option A: BoldSign's Built-in "Decline" ❌ (Screenshot 2 - Not Recommended)

**Where:** More Actions → Decline (in BoldSign interface)

**What Happens:**
```
1. Document is declined in BoldSign ✅
2. BoldSign sends email to: admin.saas@cloudfuze.com ✅
3. BoldSign workflow stops ✅
4. Your system workflow NOT updated ❌
5. Technical Team NOT notified ❌
6. No reason captured in your database ❌
7. No structured notifications ❌
```

**Who Gets Notified:**
- ✅ `admin.saas@cloudfuze.com` (initiator in BoldSign)
- ❌ Technical Team (NOT notified)
- ❌ Deal Desk (NOT notified)
- ❌ Other stakeholders (NOT notified)

**Email Template:** BoldSign's generic "Document Declined" email

---

### Option B: Our Custom "Decline with Reason" Button ✅ (RECOMMENDED)

**Where:** Red "Decline with Reason" button in Email 1 (from saitharunreddy2302@gmail.com)

**What Happens:**
```
1. Opens deny form (asks for reason) ✅
2. User types detailed reason ✅
3. Reason stored in MongoDB workflow ✅
4. BoldSign document is revoked ✅
5. Workflow status changed to 'signature_denied' ✅
6. EVERYONE gets notified via email ✅
```

**Who Gets Notified (Lines 4122-4127):**
- ✅ **Technical Team** - Gets denial notification
- ✅ **Legal Team** - Gets denial notification (even if they're the one who denied)
- ✅ **Client** - Gets denial notification
- ✅ **Deal Desk** - Gets denial notification (if in workflow)

**Email Template (Lines 4134-4153):**
```html
Subject: Signature Denied: PDF Agreement - John Smith

Content:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Signature Request Denied

Legal Team has declined to sign the document.

Document Details:
• Document: PDF Agreement
• Client: John Smith
• Denied By: Legal Team (legal@company.com)
• Date: 10/27/2025 5:04 PM

Reason for Denial:
┃ [The detailed reason they typed]
┃ e.g., "Contract terms need revision"

The workflow has been stopped and marked as Signature Denied.
Please review the reason and take appropriate action.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 📊 Comparison Table

| Feature | BoldSign's "Decline" | Our "Decline with Reason" |
|---------|---------------------|---------------------------|
| **Where to find** | More Actions menu | Red button in email |
| **Reason required** | Optional | ✅ Required |
| **Reason saved** | ❌ No (BoldSign only) | ✅ Yes (MongoDB) |
| **Technical Team notified** | ❌ No | ✅ Yes |
| **Legal Team notified** | Only initiator | ✅ Yes |
| **Client notified** | ❌ No | ✅ Yes |
| **Workflow updated** | ❌ No | ✅ Yes (status changed) |
| **BoldSign revoked** | ✅ Yes | ✅ Yes |
| **Detailed email** | Basic | ✅ Professional with reason |

---

## 🎯 Complete Email Flow - Step by Step

### Scenario: Legal Team Declines Using Custom Button

**Step 1: Legal Team Receives Emails**
```
Email 1 (from saitharunreddy2302@gmail.com):
  Subject: Action Required: Sign Agreement - John Smith
  Buttons: [Review and Sign] [Decline with Reason] ← USE THIS ONE

Email 2 (from notification@mail.boldsign.com):
  Subject: CloudFuze via BoldSign
  Buttons: [Review and Sign] only
```

**Step 2: Legal Team Clicks "Decline with Reason"**
```
→ Opens deny-signature form page
→ Shows fields:
   - Signer Name: Legal Team (pre-filled)
   - Signer Email: legal@company.com (pre-filled)
   - Reason: [text area - required]
→ Legal Team types: "Contract pricing needs revision"
→ Clicks Submit
```

**Step 3: System Processing**
```
✅ Saves denial to MongoDB:
   - status: 'signature_denied'
   - deniedBy: 'Legal Team'
   - denialReason: "Contract pricing needs revision"
   - deniedAt: [timestamp]

✅ Revokes BoldSign document (cancelled)

✅ Updates workflow step status
```

**Step 4: Notifications Sent to Everyone**
```
Technical Team receives email:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subject: Signature Denied: PDF Agreement - John Smith

Legal Team has declined to sign the document.

Reason for Denial:
Contract pricing needs revision

The workflow has been stopped and marked as Signature Denied.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Legal Team receives email:
(Same notification - confirms their action)

Client receives email:
(Same notification - informs them of denial)

Deal Desk receives email:
(Same notification - keeps them informed)
```

---

## 📧 Where to Find the Custom Email with Deny Button

### Check Your Email Inbox for:

**From:** `saitharunreddy2302@gmail.com`  
**OR:** Whatever email you set as `SENDGRID_FROM_EMAIL` in `.env`

**Subject Line Contains:**
- "Action Required: Sign Agreement"
- OR "Signature Request"

**NOT from:** `notification@mail.boldsign.com`

### If You Can't Find It:

1. **Check Spam/Promotions folder**
2. **Search inbox for:** "Action Required"
3. **Check server console** for:
   ```
   ✅ Custom signature request emails sent with Deny button
   ```
4. **If not there:** SendGrid might not be sending (check configuration)

---

## 🎨 Email Preview - What It Looks Like

The email from your system (saitharunreddy2302@gmail.com) looks like this:

```
┌──────────────────────────────────────────────┐
│        📝 Signature Request                  │
│           (Blue Header)                      │
├──────────────────────────────────────────────┤
│                                              │
│  Hi Legal Team,                              │
│                                              │
│  CloudFuze has requested you to review       │
│  and sign the document:                      │
│                                              │
│  📄 Document Details:                        │
│  • Document: Agreement - John Smith          │
│  • Client: John Smith                        │
│  • Your Role: Legal Team (First Signer)      │
│                                              │
│  You will also receive a separate email      │
│  from BoldSign with the signing link.        │
│                                              │
│  ┌──────────────┐  ┌───────────────────┐   │
│  │📝 Review and │  │❌ Decline with    │   │
│  │    Sign      │  │    Reason         │   │
│  │  (Blue)      │  │    (Red)          │   │
│  └──────────────┘  └───────────────────┘   │
│                                              │
│  ⚠️ Have concerns?                           │
│  Click the "Decline with Reason" button      │
│  to explain your doubts. All participants    │
│  will be notified.                           │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 🧪 How to Test Right Now

### Quick Test to See Both Buttons:

Run the SendGrid test to see a preview:
```bash
node test-sendgrid.cjs
```

Check your inbox: **saitharunreddy2302@gmail.com**

The test email shows:
- Preview of eSign button (Blue)
- Preview of Deny button (Red)

---

## 🎯 Recommended Approach

### When Legal Team Needs to Decline:

**USE:** Custom "Decline with Reason" button (Red button in email from your system)

**WHY:**
- ✅ Everyone gets notified
- ✅ Detailed reason is captured
- ✅ Professional email template
- ✅ Workflow properly updated
- ✅ Audit trail in database

**DON'T USE:** BoldSign's "More Actions → Decline"

**WHY:**
- ❌ Only initiator gets basic notification
- ❌ Team doesn't get notified
- ❌ No reason captured in your system
- ❌ Workflow not updated properly

---

## 📋 Summary - Your Questions Answered

### Q1: "First screenshot doesn't show Deny button?"

**Answer:** That's BoldSign's standard email (Email 2). You need to find **Email 1** from `saitharunreddy2302@gmail.com` - that one has the Deny button!

### Q2: "If we click Decline, will Technical Team receive mail?"

**Answer:** It depends which decline option:

| Decline Option | Technical Team Notified? |
|----------------|-------------------------|
| **BoldSign's "Decline"** (More Actions) | ❌ NO |
| **Our "Decline with Reason"** (Red button) | ✅ YES! |

**Our Custom Deny Button sends emails to:**
- ✅ Technical Team
- ✅ Legal Team  
- ✅ Client
- ✅ Deal Desk

**BoldSign's Decline only notifies:**
- ✅ admin.saas@cloudfuze.com (initiator)

---

## 🚀 Next Steps

1. **Check your Gmail inbox:** saitharunreddy2302@gmail.com
2. **Look for test email** from earlier with button previews
3. **Do a real workflow test:**
   - Create quote → Start workflow
   - Technical approves
   - Check Legal Team email for **2 emails**
   - Find the one from `saitharunreddy2302@gmail.com`
   - That one has the Deny button!

**The Deny button IS there - just in the custom email, not BoldSign's email!** 🎯


