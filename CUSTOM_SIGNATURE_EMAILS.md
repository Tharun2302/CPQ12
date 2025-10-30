# Custom Signature Request Emails with Deny Button

## 📋 Overview

Since BoldSign doesn't allow customizing their email templates to add a "Deny" button, we send **custom emails** to both Legal Team and Client **in addition to** the BoldSign emails. These custom emails include both "Review and Sign" and "Decline with Reason" buttons.

## 🎯 Email Flow

### What Signers Receive:

**Legal Team receives 2 emails:**
1. **Custom Email from CloudFuze** (sent immediately)
   - ✅ **"Review and Sign"** button (links to BoldSign)
   - ✅ **"Decline with Reason"** button (links to deny page)
   - Document details
   - Warning about concerns

2. **BoldSign Email** (sent by BoldSign automatically)
   - Standard BoldSign signature request
   - Signing link

**Client receives 2 emails:**
1. **Custom Email from CloudFuze** (sent immediately)
   - ✅ **"Decline with Reason"** button (links to deny page)
   - Document details
   - Note about signing after Legal Team
   - Warning about concerns

2. **BoldSign Email** (sent by BoldSign after Legal Team signs)
   - Standard BoldSign signature request
   - Signing link

---

## 📧 Email Templates

### Legal Team Email (Custom)

**Subject:** Action Required: Sign Agreement - [Client Name]

**Content:**
```html
Signature Request
━━━━━━━━━━━━━━━

Hi Legal Team,

CloudFuze has requested you to review and sign the document:

Document Details:
• Document: Agreement - John Smith
• Client: John Smith  
• Your Role: Legal Team (First Signer)

You will also receive a separate email from BoldSign with the signing link.

[📝 Review and Sign]  [❌ Decline with Reason]

⚠️ Have concerns? Click the "Decline with Reason" button to explain 
your doubts. All participants will be notified.
```

### Client Email (Custom)

**Subject:** Action Required: Sign Agreement - [Client Name]

**Content:**
```html
Signature Request
━━━━━━━━━━━━━━━

Hi John Smith,

CloudFuze has requested you to review and sign the document:

Document Details:
• Document: Agreement - John Smith
• Client: John Smith
• Your Role: Client (Second Signer)
• Note: You'll receive signing link after Legal Team signs

You will receive a separate email from BoldSign with the signing link 
once the Legal Team has signed.

[❌ Decline with Reason]

⚠️ Have concerns? Click the "Decline with Reason" button to explain 
your doubts. All participants will be notified and the signing process 
will be stopped.
```

---

## 🔄 Complete Flow

### Scenario 1: Normal Signing Flow

1. **Client approves** final approval step
2. **System sends document to BoldSign**
3. **Custom emails sent** to Legal Team and Client (with Deny button)
4. **BoldSign sends email** to Legal Team
5. **Legal Team clicks** "Review and Sign" in custom email
6. **Legal Team signs** in BoldSign
7. **BoldSign sends email** to Client
8. **Client clicks** "Review and Sign" from BoldSign email
9. **Client signs** in BoldSign
10. **Document completed**

### Scenario 2: Legal Team Has Doubts

1. **Client approves** final approval step
2. **System sends document to BoldSign**
3. **Custom emails sent** to Legal Team and Client
4. **Legal Team receives** custom email + BoldSign email
5. **Legal Team clicks** "Decline with Reason" button
6. **Legal Team provides** reason on deny page
7. **System processes denial**:
   - Workflow status → "signature_denied"
   - BoldSign document revoked
   - Notification emails sent to all
8. **All participants notified** with reason

### Scenario 3: Client Has Doubts

1. **Client approves** final approval step
2. **System sends document to BoldSign**
3. **Custom emails sent** to Legal Team and Client
4. **Client receives** custom email (BoldSign email pending)
5. **Client clicks** "Decline with Reason" button
6. **Client provides** reason on deny page
7. **System processes denial**:
   - Workflow status → "signature_denied"
   - BoldSign document revoked
   - Notification emails sent to all
8. **All participants notified** with reason
9. **Legal Team never receives** BoldSign signing link (document cancelled)

---

## 🎨 Email Design Features

### Custom Email Design:

1. **Professional Header**
   - Blue background (#2563eb)
   - "Signature Request" title
   - Clean, modern design

2. **Clear Content**
   - Greeting with recipient name
   - Document details in white box
   - Clear explanation of next steps

3. **Action Buttons**
   - **Blue "Review and Sign"** button (Legal Team only)
   - **Red "Decline with Reason"** button (Both)
   - Large, clickable buttons
   - Clear labels with emojis

4. **Warning Box**
   - Yellow background (#fef3c7)
   - Clear warning about concerns
   - Explains what happens when denying

5. **Footer**
   - "Do not reply" notice
   - Professional formatting

---

## 🔧 Technical Implementation

### Email Sending Logic:

```javascript
// After BoldSign document is sent successfully
if (isEmailConfigured && workflowId) {
  // Get workflow details
  const workflow = await db.collection('approval_workflows')
    .findOne({ id: workflowId });
  
  // Create deny URL with parameters
  const denyUrl = `${APP_BASE_URL}/deny-signature?workflow=${workflowId}&document=${documentId}`;
  
  // Send to Legal Team
  await sgMail.send({
    to: legalTeamEmail,
    from: 'noreply@cloudfuze.com',
    subject: 'Action Required: Sign Agreement',
    html: legalTeamEmailTemplate
  });
  
  // Send to Client
  await sgMail.send({
    to: clientEmail,
    from: 'noreply@cloudfuze.com',
    subject: 'Action Required: Sign Agreement',
    html: clientEmailTemplate
  });
}
```

### Button Links:

**Review and Sign Button (Legal Team):**
```
href="https://app.boldsign.com/sign/[unique-signing-link]"
```

**Decline with Reason Button (Legal Team):**
```
href="http://localhost:3001/deny-signature?workflow=WORKFLOW_ID&document=DOC_ID&email=legal@company.com&name=Legal%20Team"
```

**Decline with Reason Button (Client):**
```
href="http://localhost:3001/deny-signature?workflow=WORKFLOW_ID&document=DOC_ID&email=client@company.com&name=John%20Smith"
```

---

## 📊 Benefits of This Approach

### ✅ Advantages:

1. **Clear Options**: Signers see both sign and deny options in one email
2. **Professional**: Custom branded emails from CloudFuze
3. **User-Friendly**: Big, clear buttons that are easy to click
4. **No BoldSign Limitation**: We control the email content
5. **Immediate Access**: Both options available from the start
6. **Consistent**: Same design for all notification emails

### ⚠️ Considerations:

1. **Two Emails**: Signers receive custom email + BoldSign email
2. **Email Config Required**: Needs SendGrid API key configured
3. **URL Updates**: Need to update `APP_BASE_URL` for production

---

## 🧪 Testing

### Test Checklist:

- [ ] Verify custom emails are sent to Legal Team
- [ ] Verify custom emails are sent to Client
- [ ] Test "Review and Sign" button (Legal Team)
- [ ] Test "Decline with Reason" button (Legal Team)
- [ ] Test "Decline with Reason" button (Client)
- [ ] Verify BoldSign emails still sent
- [ ] Check email formatting on desktop
- [ ] Check email formatting on mobile
- [ ] Test denial flow from custom email
- [ ] Verify all participants notified

---

## 🚀 Production Configuration

### Environment Variables:

```env
# Required for custom emails
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
APP_BASE_URL=https://yourdomain.com  # Production URL

# BoldSign (still needed)
BOLDSIGN_API_KEY=your-boldsign-key
```

### Email Deliverability:

1. **Verify Sender Domain** in SendGrid
2. **Set up SPF/DKIM** records
3. **Test spam score** before production
4. **Whitelist sender** in company email systems

---

## 📧 Example Email Preview

### Legal Team Email:

```
From: CloudFuze <noreply@cloudfuze.com>
To: legal@company.com
Subject: Action Required: Sign Agreement - John Smith

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Signature Request
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hi Legal Team,

CloudFuze has requested you to review and sign the document:

┌─────────────────────────────┐
│  Document Details:          │
│  • Document: Agreement -    │
│    John Smith               │
│  • Client: John Smith       │
│  • Your Role: Legal Team    │
│    (First Signer)           │
└─────────────────────────────┘

You will also receive a separate email from 
BoldSign with the signing link.

  ┌─────────────────┐ ┌────────────────────┐
  │ 📝 Review and   │ │ ❌ Decline with    │
  │    Sign         │ │    Reason          │
  └─────────────────┘ └────────────────────┘

┌─────────────────────────────────────────┐
│ ⚠️ Have concerns? Click the "Decline   │
│ with Reason" button to explain your    │
│ doubts. All participants will be       │
│ notified.                              │
└─────────────────────────────────────────┘

This is an automated message. 
Please do not reply to this email.
```

---

## ✅ Implementation Status

- ✅ Custom email template created for Legal Team
- ✅ Custom email template created for Client
- ✅ Emails sent automatically when BoldSign document created
- ✅ "Review and Sign" button includes BoldSign signing link
- ✅ "Decline with Reason" button includes deny page link
- ✅ Error handling for email sending failures
- ✅ Workflow ID and document ID passed in URLs
- ✅ Professional HTML email design
- ✅ Mobile-responsive email layout

**Status**: ✅ Complete and Ready for Testing  
**Date**: October 27, 2025

