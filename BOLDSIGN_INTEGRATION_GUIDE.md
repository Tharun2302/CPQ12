# BoldSign Integration Guide

This guide explains the complete BoldSign integration for automatic document signing after approval workflow completion.

## 🎯 Overview

The BoldSign integration automatically sends finalized documents for signature after all approval stages are completed in the application.

### Workflow Flow
```
Technical Team Approval → Legal Team Approval → Client Approval
                                                      ↓
                                              [All Approved]
                                                      ↓
                                      Automatically Trigger BoldSign
                                                      ↓
                              Legal Team Signs (Step 1) → Client Signs (Step 2)
```

## 📋 Features

✅ **Automatic Triggering**: BoldSign is triggered automatically when all approval stages complete  
✅ **Sequential Signing**: Legal Team signs first, then Client  
✅ **Form Fields on Page 3**: Signature, Name, Title, and Date fields  
✅ **No Pre-filled Values**: Clean text boxes without "sd" or other default values  
✅ **Email Notifications**: BoldSign automatically sends emails to signers  
✅ **Reminders**: Automatic reminders every 3 days  
✅ **Status Tracking**: Check document signing status via API  

## 🔧 Setup Instructions

### 1. Get BoldSign API Key

1. Go to [BoldSign](https://app.boldsign.com)
2. Sign up or log in to your account
3. Navigate to **Settings** → **API**
4. Generate a new API key
5. Copy the API key (keep it secure)

### 2. Configure Environment Variables

Create a `.env` file in your project root (if it doesn't exist) or update the existing one:

```env
# BoldSign Integration
BOLDSIGN_API_KEY=your-actual-boldsign-api-key-here
BOLDSIGN_API_URL=https://api.boldsign.com
```

**Important**: Replace `your-actual-boldsign-api-key-here` with your real BoldSign API key.

### 3. Update env-template.txt

The `env-template.txt` has been updated with BoldSign configuration. Copy it to create your `.env` file if needed:

```bash
# Copy template to .env
cp env-template.txt .env

# Then edit .env and add your BoldSign API key
```

## 📄 Document Fields Configuration

### Page 3 Form Fields

The integration adds the following fields on **page 3** of the PDF:

#### For Legal Team (Left Side - x: 120)
```json
{
  "By": {
    "fieldType": "Signature",
    "position": { "x": 120, "y": 250, "width": 180, "height": 30 }
  },
  "Name": {
    "fieldType": "TextBox",
    "position": { "x": 120, "y": 300, "width": 180, "height": 25 },
    "value": ""  // No pre-filled text
  },
  "Title": {
    "fieldType": "TextBox",
    "position": { "x": 120, "y": 350, "width": 180, "height": 25 },
    "value": ""  // No pre-filled text
  },
  "Date": {
    "fieldType": "DateSigned",
    "position": { "x": 120, "y": 400, "width": 180, "height": 25 }
  }
}
```

#### For Client (Right Side - x: 320)
```json
{
  "By": {
    "fieldType": "Signature",
    "position": { "x": 320, "y": 250, "width": 180, "height": 30 }
  },
  "Name": {
    "fieldType": "TextBox",
    "position": { "x": 320, "y": 300, "width": 180, "height": 25 },
    "value": ""  // No pre-filled text
  },
  "Title": {
    "fieldType": "TextBox",
    "position": { "x": 320, "y": 350, "width": 180, "height": 25 },
    "value": ""  // No pre-filled text
  },
  "Date": {
    "fieldType": "DateSigned",
    "position": { "x": 320, "y": 400, "width": 180, "height": 25 }
  }
}
```

**Note**: The `value: ""` ensures no pre-filled text like "sd" appears in the text boxes.

## 🚀 How It Works

### 1. Approval Workflow Completion

When the Client approves the final stage (Step 3):
- Workflow status changes to `'approved'`
- System fetches the document from MongoDB
- BoldSign integration is automatically triggered

### 2. BoldSign Document Sending

The system:
1. Retrieves document as base64 from MongoDB
2. Extracts Legal Team and Client emails from workflow
3. Creates form fields for page 3
4. Sends document to BoldSign API with signing order enabled

### 3. Email Notifications

BoldSign automatically sends:
- **Legal Team**: Email with signing link (Order: 1)
- **Client**: Email with signing link (Order: 2) - sent after Legal Team signs

### 4. Signing Process

1. **Legal Team** receives email from BoldSign
2. Legal Team clicks link and signs
3. Legal Team fills in Name, Title, Date
4. After Legal Team completes, **Client** receives email
5. Client clicks link and signs
6. Client fills in Name, Title, Date
7. Document is fully signed

## 🔌 API Endpoints

### 1. Send Document to BoldSign

```http
POST /api/boldsign/send-document
Content-Type: application/json

{
  "documentBase64": "base64-encoded-pdf-data",
  "fileName": "Agreement.pdf",
  "legalTeamEmail": "legal@company.com",
  "clientEmail": "client@company.com",
  "documentTitle": "Migration Agreement - Company Name",
  "clientName": "Company Name"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Document sent to BoldSign successfully",
  "data": {
    "documentId": "boldsign-document-id",
    "signers": [
      {
        "signerEmail": "legal@company.com",
        "signUrl": "https://app.boldsign.com/sign/...",
        "signerId": "signer-id-1"
      },
      {
        "signerEmail": "client@company.com",
        "signUrl": "https://app.boldsign.com/sign/...",
        "signerId": "signer-id-2"
      }
    ]
  }
}
```

### 2. Check Document Status

```http
GET /api/boldsign/document-status/:documentId
```

**Response**:
```json
{
  "success": true,
  "data": {
    "documentId": "...",
    "status": "InProgress | Completed | Declined",
    "signers": [...]
  }
}
```

### 3. Webhook Endpoint (Optional)

```http
POST /api/boldsign/webhook
```

Receives events from BoldSign when:
- Document is signed
- Document is completed
- Document is declined

## 🧪 Testing the Integration

### Test Flow

1. **Start Approval Workflow**
   - Generate a quote and document
   - Start approval workflow
   - Assign emails for Technical Team, Legal Team, and Client

2. **Complete All Approvals**
   - Technical Team approves (Step 1)
   - Legal Team approves (Step 2)
   - Client approves (Step 3)

3. **Verify BoldSign Trigger**
   - Check browser console for BoldSign logs
   - Look for: `"📝 All approvals complete! Triggering BoldSign..."`
   - Verify success: `"✅ Document sent to BoldSign successfully!"`

4. **Check Email**
   - Legal Team should receive BoldSign email first
   - After Legal Team signs, Client receives email

5. **Sign Documents**
   - Legal Team: Click link, sign, fill fields (Name, Title, Date)
   - Client: Click link, sign, fill fields (Name, Title, Date)

### Troubleshooting

#### Error: "BoldSign API key not configured"
**Solution**: Add your BoldSign API key to `.env` file

```env
BOLDSIGN_API_KEY=your-actual-api-key-here
```

Then restart the server:
```bash
node server.cjs
```

#### Error: "Failed to fetch document for BoldSign"
**Solution**: Ensure the document exists in MongoDB. Check:
- Document was saved when workflow started
- DocumentId in workflow is valid

#### BoldSign API Errors
**Common Issues**:
- **401 Unauthorized**: Invalid API key
- **400 Bad Request**: Check document format (must be PDF)
- **403 Forbidden**: API key doesn't have required permissions

**Check Logs**:
```bash
# Server logs show BoldSign API responses
# Look for lines starting with:
# ❌ BoldSign Error:
```

## 📊 Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Approval Workflow                        │
│                                                             │
│  Technical Team → Legal Team → Client                       │
│       ✓               ✓            ✓                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │  All Approvals Complete │
        │   (Client Approves)     │
        └────────────┬────────────┘
                     │
                     ▼
        ┌─────────────────────────┐
        │  Fetch Document from    │
        │      MongoDB            │
        └────────────┬────────────┘
                     │
                     ▼
        ┌─────────────────────────┐
        │   Send to BoldSign API  │
        │   - Legal Team (Order 1)│
        │   - Client (Order 2)    │
        │   - Form Fields Page 3  │
        └────────────┬────────────┘
                     │
           ┌─────────┴─────────┐
           │                   │
           ▼                   ▼
    ┌──────────┐        ┌──────────┐
    │ Legal    │        │ Client   │
    │ Team     │        │ (Waits)  │
    │ Signs    │        │          │
    └────┬─────┘        └────┬─────┘
         │                   │
         └────────┬──────────┘
                  │
                  ▼
         ┌────────────────┐
         │ Legal Completes│
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ Client Receives│
         │ Email to Sign  │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ Client Signs   │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ ✅ Document    │
         │   Completed    │
         └────────────────┘
```

## 🔐 Security Notes

1. **API Key Security**
   - Never commit `.env` file to Git
   - Keep API key confidential
   - Rotate API key periodically

2. **Production Deployment**
   - Use environment variables (not `.env` file)
   - Configure via hosting platform (Render, Heroku, etc.)
   - Example for Render:
     ```
     Dashboard → Environment → Environment Variables
     Add: BOLDSIGN_API_KEY = your-key-here
     ```

3. **Email Validation**
   - BoldSign validates email addresses
   - Ensure valid emails in approval workflow
   - Invalid emails will cause BoldSign API errors

## 📝 Code Files Modified

1. **env-template.txt** - Added BoldSign configuration
2. **src/services/boldSignService.ts** - BoldSign service module (NEW)
3. **server.cjs** - Added BoldSign API endpoints
4. **src/components/ClientNotification.tsx** - Triggers BoldSign on approval

## 🎉 Success Indicators

When everything works correctly, you'll see:

1. **Browser Console**:
   ```
   📝 All approvals complete! Triggering BoldSign...
   📄 Document fetched for BoldSign: {...}
   📧 BoldSign signers: {...}
   ✅ Document sent to BoldSign successfully!
     Document ID: xxxxx
     Signing URLs sent to Legal Team and Client
   ```

2. **User Alert**:
   ```
   ✅ Request approved successfully!
   
   Your approval has been recorded and the document has been sent to BoldSign for signatures.
   
   The Legal Team will sign first, followed by the Client.
   
   Deal Desk has also been notified.
   ```

3. **Emails Sent**:
   - Legal Team receives BoldSign email immediately
   - Client receives BoldSign email after Legal Team signs

## 🆘 Support

If you encounter issues:

1. Check server logs for errors
2. Verify BoldSign API key is correct
3. Ensure document is a valid PDF
4. Check BoldSign dashboard for document status
5. Review this guide's Troubleshooting section

## 📚 Additional Resources

- [BoldSign API Documentation](https://developers.boldsign.com)
- [BoldSign Dashboard](https://app.boldsign.com)
- [BoldSign Support](https://support.boldsign.com)

---

**Last Updated**: October 2025  
**Version**: 1.0.0

