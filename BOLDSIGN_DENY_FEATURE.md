# BoldSign Signature Denial Feature

## 📋 Overview

This feature allows Legal Team and Client signers to decline BoldSign signature requests with a reason when they have concerns or doubts about signing the document.

## 🎯 Features

✅ **Deny Link in Email**: BoldSign emails include instructions with a link to decline the signature request  
✅ **Reason Required**: Signers must provide a reason for declining  
✅ **Workflow Update**: Workflow status is automatically updated to "signature_denied"  
✅ **Notifications**: All workflow participants are notified of the denial  
✅ **BoldSign Cancellation**: The BoldSign document is automatically revoked  
✅ **Audit Trail**: Denial reason and timestamp are recorded in the workflow  

---

## 🔧 How It Works

### 1. Email Notification

When BoldSign sends signature request emails to Legal Team and Client, the message includes:

```
Please review and sign this agreement. Legal Team will sign first, followed by the Client.

If you have concerns or need to decline this signature request, please visit: 
http://localhost:3001/deny-signature to provide your reason.
```

### 2. Deny Signature Page

Signers can visit the deny page by:
- **Direct URL**: `http://localhost:3001/deny-signature`
- **With Parameters**: `http://localhost:3001/deny-signature?workflow=WORKFLOW_ID&email=SIGNER_EMAIL&name=SIGNER_NAME&document=BOLDSIGN_DOC_ID`

### 3. Denial Process

1. Signer visits the deny signature page
2. Signer enters their reason for declining
3. System processes the denial:
   - Updates workflow status to "signature_denied"
   - Records denial reason and timestamp
   - Revokes BoldSign document
   - Sends notification emails to all participants

### 4. Notifications

All workflow participants receive an email with:
- Who denied the signature
- Reason for denial
- Document details
- Timestamp

---

## 🔌 API Endpoints

### Deny Signature Request

```http
POST /api/boldsign/deny-signature
Content-Type: application/json

{
  "workflowId": "workflow-id",
  "signerEmail": "signer@example.com",
  "signerName": "John Doe",
  "documentId": "boldsign-document-id",
  "reason": "Reason for declining the signature"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Signature denied successfully",
  "deniedBy": "Legal Team",
  "reason": "Reason for declining the signature"
}
```

**Error Response**:
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error information"
}
```

---

## 📊 Workflow Status Changes

When a signature is denied:

### Before Denial:
```json
{
  "status": "approved",
  "currentStep": 4,
  "workflowSteps": [
    {
      "step": 2,
      "role": "Legal Team",
      "status": "approved"
    }
  ]
}
```

### After Denial:
```json
{
  "status": "signature_denied",
  "deniedBy": "Legal Team",
  "deniedAt": "2025-10-27T12:00:00.000Z",
  "denialReason": "Reason for declining",
  "currentStep": 4,
  "workflowSteps": [
    {
      "step": 2,
      "role": "Legal Team",
      "status": "signature_denied",
      "comments": "Signature denied: Reason for declining",
      "timestamp": "2025-10-27T12:00:00.000Z"
    }
  ]
}
```

---

## 🎨 User Interface

### Deny Signature Page Features:

1. **Header**: Red warning header with "Decline Signature Request" title
2. **Signer Information**: Displays signer name, email, and workflow ID
3. **Reason Field**: Large textarea for detailed explanation (required)
4. **Submit Button**: Red "Submit Decline Request" button
5. **Information Box**: Explains what happens after denial
6. **Success Page**: Confirmation page after successful submission

### UI Components:

- **Error Messages**: Red alert box for validation errors
- **Loading State**: Spinner while submitting
- **Disabled State**: Button disabled when reason is empty
- **Responsive Design**: Works on mobile and desktop

---

## 📧 Email Notifications

### Denial Notification Email Template:

```html
<h2>Signature Request Denied</h2>
<p><strong>Legal Team</strong> has declined to sign the document.</p>

<h3>Document Details:</h3>
<ul>
  <li><strong>Document:</strong> Migration Agreement</li>
  <li><strong>Client:</strong> Acme Corp</li>
  <li><strong>Denied By:</strong> Legal Team (legal@company.com)</li>
  <li><strong>Date:</strong> 10/27/2025, 12:00:00 PM</li>
</ul>

<h3>Reason for Denial:</h3>
<p style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #dc3545;">
  [Signer's reason for declining]
</p>

<p>The workflow has been stopped and marked as <strong>Signature Denied</strong>.</p>
<p>Please review the reason and take appropriate action.</p>
```

---

## 🔐 Security Features

1. **Required Fields**: workflowId, signerEmail, and reason are mandatory
2. **Workflow Validation**: Verifies workflow exists before processing
3. **Signer Identification**: Matches signer email to workflow participants
4. **Audit Trail**: Records who denied, when, and why
5. **Error Handling**: Graceful handling of BoldSign API failures

---

## 🧪 Testing the Feature

### Test Scenario 1: Legal Team Denies

1. Start approval workflow
2. Complete all approvals (triggers BoldSign)
3. Legal Team receives BoldSign email
4. Legal Team visits deny link
5. Enters reason: "Contract terms need revision"
6. Submits denial
7. Verify:
   - Workflow status = "signature_denied"
   - All participants receive notification
   - BoldSign document is revoked

### Test Scenario 2: Client Denies

1. Legal Team signs the document
2. Client receives BoldSign email
3. Client visits deny link
4. Enters reason: "Need more time to review"
5. Submits denial
6. Verify:
   - Workflow status = "signature_denied"
   - All participants receive notification
   - BoldSign document is revoked

### Test Scenario 3: Error Handling

1. Visit deny page without parameters
2. Verify error message displays
3. Try to submit without reason
4. Verify validation error
5. Test with invalid workflow ID
6. Verify appropriate error handling

---

## 🚀 Deployment Checklist

- [ ] Update `APP_BASE_URL` in `.env` for production
- [ ] Test deny link in production environment
- [ ] Verify SendGrid email configuration
- [ ] Test BoldSign document revocation
- [ ] Verify workflow status updates
- [ ] Test notification emails
- [ ] Check mobile responsiveness
- [ ] Verify error handling

---

## 📝 Configuration

### Environment Variables:

```env
# Required for deny functionality
APP_BASE_URL=http://localhost:3001  # Update for production
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
BOLDSIGN_API_KEY=your-boldsign-key
```

### Routes:

- **Deny Page**: `/deny-signature`
- **API Endpoint**: `/api/boldsign/deny-signature`

---

## 🔍 Troubleshooting

### Issue: Deny link not working

**Solution**: Check that `APP_BASE_URL` is correctly set in `.env`

### Issue: Notifications not sent

**Solution**: Verify SendGrid API key is configured and valid

### Issue: BoldSign document not revoked

**Solution**: Check BoldSign API key permissions include document revocation

### Issue: Workflow not updating

**Solution**: Verify MongoDB connection and workflow ID is correct

---

## 📊 Database Schema Changes

### Workflow Document Updates:

```javascript
{
  // New fields added when signature is denied
  status: 'signature_denied',
  deniedBy: 'Legal Team' | 'Client',
  deniedAt: '2025-10-27T12:00:00.000Z',
  denialReason: 'Reason text',
  boldSignDocumentId: 'boldsign-doc-id',
  boldSignSentAt: '2025-10-27T11:00:00.000Z'
}
```

---

## ✅ Feature Complete

This feature is fully implemented and ready for testing. All components are in place:

- ✅ API endpoint for denial
- ✅ Deny signature page UI
- ✅ Email message updates
- ✅ Workflow status management
- ✅ BoldSign document revocation
- ✅ Notification system
- ✅ Error handling
- ✅ Documentation

**Status**: Ready for Production Testing  
**Date**: October 27, 2025

