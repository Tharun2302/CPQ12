# BoldSign Integration - Testing Checklist

## ✅ Pre-Testing Setup

- [ ] BoldSign account created at https://app.boldsign.com
- [ ] BoldSign API key generated
- [ ] `.env` file updated with `BOLDSIGN_API_KEY`
- [ ] Server restarted after adding API key
- [ ] MongoDB is running
- [ ] Frontend is running (npm run dev)
- [ ] Backend is running (node server.cjs)

---

## 🧪 Test Scenario 1: Complete Approval Workflow

### Setup
- [ ] Open application in browser
- [ ] Navigate to Quote Generator
- [ ] Fill in client information
- [ ] Generate a quote
- [ ] Generate agreement/document

### Approval Workflow
- [ ] Start approval workflow
- [ ] Enter test email addresses:
  - Technical Team: `tech@test.com` (or your email)
  - Legal Team: `legal@test.com` (or your email)
  - Client: `client@test.com` (or your email)

### Step 1: Technical Team Approval
- [ ] Open Manager Approval Dashboard
- [ ] Find pending workflow
- [ ] View document preview
- [ ] Approve the workflow
- [ ] Verify Legal Team receives email

### Step 2: Legal Team Approval
- [ ] Open CEO Approval Dashboard (or Legal Dashboard)
- [ ] Find workflow (should be at step 2)
- [ ] View document preview
- [ ] Approve the workflow
- [ ] Verify Client receives email

### Step 3: Client Approval (Triggers BoldSign)
- [ ] Open Client Notification page
- [ ] Use workflow link from email (or URL with ?workflow=ID)
- [ ] View document preview
- [ ] Add optional comment
- [ ] Click "Approve"

### Verify BoldSign Trigger
- [ ] Check browser console (F12)
- [ ] Look for logs:
  ```
  📝 All approvals complete! Triggering BoldSign...
  📄 Document fetched for BoldSign: {...}
  📧 BoldSign signers: {...}
  ✅ Document sent to BoldSign successfully!
  ```
- [ ] Verify success alert message mentions BoldSign
- [ ] No errors in console

---

## 📧 Test Scenario 2: BoldSign Email Delivery

### Legal Team Email (First Signer)
- [ ] Legal Team email received (check inbox/spam)
- [ ] Email is from BoldSign
- [ ] Email contains signing link
- [ ] Email mentions document title
- [ ] Subject line is clear

### Verify in BoldSign Dashboard
- [ ] Login to https://app.boldsign.com
- [ ] Navigate to "Documents" section
- [ ] Find your test document
- [ ] Status shows "Waiting for Legal Team"
- [ ] Document title is correct
- [ ] Two signers listed (Legal Team & Client)
- [ ] Signing order is correct (Legal Team = 1, Client = 2)

---

## 🖊️ Test Scenario 3: Legal Team Signing

### Click Legal Team Signing Link
- [ ] Click link in Legal Team email
- [ ] BoldSign signing page opens
- [ ] Document displays correctly
- [ ] Page 3 shows form fields on left side

### Verify Form Fields (Legal Team - Left Side)
- [ ] "By" signature field at x:120, y:250
- [ ] "Name" text box at x:120, y:300 (empty, no "sd")
- [ ] "Title" text box at x:120, y:350 (empty, no "sd")
- [ ] "Date" date field at x:120, y:400

### Complete Legal Team Signature
- [ ] Click "By" signature field
- [ ] Draw/type/upload signature
- [ ] Fill in "Name" text box (manual input)
- [ ] Fill in "Title" text box (manual input)
- [ ] "Date" auto-fills or allows selection
- [ ] All fields marked as filled
- [ ] Click "Finish" or "Submit"
- [ ] Success confirmation displayed

---

## 📨 Test Scenario 4: Client Email & Signing

### Client Email (Second Signer)
- [ ] Client email received AFTER Legal Team signed
- [ ] Email is from BoldSign
- [ ] Email contains signing link
- [ ] Email mentions previous signer completed

### Click Client Signing Link
- [ ] Click link in Client email
- [ ] BoldSign signing page opens
- [ ] Document displays with Legal Team signature visible
- [ ] Page 3 shows form fields on right side

### Verify Form Fields (Client - Right Side)
- [ ] "By" signature field at x:320, y:250
- [ ] "Name" text box at x:320, y:300 (empty, no "sd")
- [ ] "Title" text box at x:320, y:350 (empty, no "sd")
- [ ] "Date" date field at x:320, y:400
- [ ] Legal Team fields on left are filled/signed

### Complete Client Signature
- [ ] Click "By" signature field
- [ ] Draw/type/upload signature
- [ ] Fill in "Name" text box (manual input)
- [ ] Fill in "Title" text box (manual input)
- [ ] "Date" auto-fills or allows selection
- [ ] All fields marked as filled
- [ ] Click "Finish" or "Submit"
- [ ] Success confirmation displayed

---

## 🎉 Test Scenario 5: Document Completion

### Verify in BoldSign Dashboard
- [ ] Login to https://app.boldsign.com
- [ ] Navigate to completed documents
- [ ] Find your test document
- [ ] Status shows "Completed"
- [ ] Both signatures visible
- [ ] All form fields filled
- [ ] Download completed PDF

### Download & Review Completed PDF
- [ ] Download signed document from BoldSign
- [ ] Open in PDF reader
- [ ] Navigate to page 3
- [ ] Legal Team signature visible (left side)
- [ ] Legal Team Name, Title, Date filled
- [ ] Client signature visible (right side)
- [ ] Client Name, Title, Date filled
- [ ] No "sd" or pre-filled junk text
- [ ] All signatures look professional

### Verify Email Notifications
- [ ] Legal Team receives completion email
- [ ] Client receives completion email
- [ ] Deal Desk receives notification email
- [ ] All emails have correct information

---

## 🐛 Test Scenario 6: Error Handling

### Test 1: Missing API Key
- [ ] Remove `BOLDSIGN_API_KEY` from `.env`
- [ ] Restart server
- [ ] Complete approval workflow
- [ ] Verify error message shows
- [ ] Workflow still completes (doesn't crash)
- [ ] User-friendly error displayed

### Test 2: Invalid API Key
- [ ] Set `BOLDSIGN_API_KEY` to invalid value
- [ ] Restart server
- [ ] Complete approval workflow
- [ ] Verify BoldSign API error logged
- [ ] User-friendly error displayed
- [ ] Workflow still completes

### Test 3: Network Error
- [ ] Disconnect internet
- [ ] Complete approval workflow
- [ ] Verify network error handled gracefully
- [ ] User sees appropriate message
- [ ] Workflow status updates correctly

---

## 📊 Test Scenario 7: API Endpoint Testing

### Test Send Document Endpoint
```bash
# Use Postman, cURL, or similar to test:
POST http://localhost:3001/api/boldsign/send-document
Content-Type: application/json

{
  "documentBase64": "JVBERi0xLjQK...",  # Sample PDF base64
  "fileName": "Test-Agreement.pdf",
  "legalTeamEmail": "legal@test.com",
  "clientEmail": "client@test.com",
  "documentTitle": "Test Agreement",
  "clientName": "Test Client"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Document sent to BoldSign successfully",
  "data": {
    "documentId": "...",
    "signers": [...]
  }
}
```

- [ ] Endpoint responds with 200 OK
- [ ] Response includes documentId
- [ ] Response includes signers array
- [ ] Document appears in BoldSign dashboard

### Test Document Status Endpoint
```bash
GET http://localhost:3001/api/boldsign/document-status/{documentId}
```

- [ ] Endpoint responds with 200 OK
- [ ] Response includes document status
- [ ] Response includes signer information

---

## 🔍 Browser Console Checks

### Console Logs to Verify
- [ ] No red errors in console
- [ ] BoldSign trigger logs present
- [ ] Document fetch successful
- [ ] Signer emails logged correctly
- [ ] Success message logged

### Network Tab Checks
- [ ] `/api/boldsign/send-document` request succeeds (200)
- [ ] Request payload contains documentBase64
- [ ] Request payload contains correct emails
- [ ] Response contains documentId
- [ ] No 401 (unauthorized) errors
- [ ] No 400 (bad request) errors

---

## 📱 Cross-Browser Testing

### Chrome/Edge
- [ ] Approval workflow completes
- [ ] BoldSign triggers successfully
- [ ] Signing page works
- [ ] Form fields editable

### Firefox
- [ ] Approval workflow completes
- [ ] BoldSign triggers successfully
- [ ] Signing page works
- [ ] Form fields editable

### Safari
- [ ] Approval workflow completes
- [ ] BoldSign triggers successfully
- [ ] Signing page works
- [ ] Form fields editable

---

## 🔐 Security Checks

- [ ] API key not visible in browser console
- [ ] API key not in source code (only in .env)
- [ ] `.env` file in `.gitignore`
- [ ] No sensitive data in error messages
- [ ] HTTPS used in production (if deployed)

---

## 📈 Performance Checks

- [ ] BoldSign trigger doesn't slow down approval
- [ ] Document loads quickly
- [ ] No timeout errors
- [ ] Response time < 5 seconds
- [ ] No memory leaks after multiple workflows

---

## ✅ Final Verification

- [ ] All test scenarios passed
- [ ] No critical errors
- [ ] User experience is smooth
- [ ] Emails delivered reliably
- [ ] Signatures appear correctly on page 3
- [ ] No pre-filled "sd" text in text boxes
- [ ] Sequential signing works (Legal → Client)
- [ ] Document completion email sent
- [ ] Integration ready for production

---

## 📝 Test Results Summary

**Date Tested**: _____________  
**Tested By**: _____________  
**Environment**: Development / Staging / Production  

### Results
- Total Tests: ______
- Passed: ______
- Failed: ______
- Blocked: ______

### Critical Issues Found
1. ___________________________________
2. ___________________________________
3. ___________________________________

### Notes
_____________________________________
_____________________________________
_____________________________________

---

## 🎯 Production Readiness

Before deploying to production:

- [ ] All tests above passed
- [ ] Real BoldSign account (not trial)
- [ ] Production API key configured
- [ ] Environment variables set on hosting platform
- [ ] Error handling tested thoroughly
- [ ] Email deliverability confirmed
- [ ] Legal team has reviewed signature placement
- [ ] Client has approved signature workflow
- [ ] Documentation provided to users
- [ ] Support team trained on BoldSign integration

---

**Status**: [ ] Ready for Production  /  [ ] Needs More Testing  /  [ ] Issues Found

**Approved By**: ________________  **Date**: ____________

