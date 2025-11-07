# 🔗 BoldSign Webhook Configuration Details

## 📋 Webhook Information for BoldSign Dashboard

Use these details to configure your webhook in the BoldSign Dashboard.

---

## 🌐 Webhook URL

### Production Environment
```
https://zenop.ai/api/boldsign/webhook
```

### Local Development (Testing with ngrok)
```
https://your-ngrok-url.ngrok.io/api/boldsign/webhook
```

---

## 📡 Webhook Endpoint Details

| Property | Value |
|----------|-------|
| **Endpoint URL** | `https://zenop.ai/api/boldsign/webhook` |
| **HTTP Method** | `POST` |
| **Content-Type** | `application/json` |
| **Authentication** | None (public endpoint) |

---

## 🎯 Events to Configure in BoldSign

Select these events in the BoldSign webhook settings:

### ✅ Required Events

1. **Document Signed** (`DocumentSigned`)
   - Triggered when a signer completes their signature
   
2. **Document Completed** (`DocumentCompleted`)
   - Triggered when all signers have completed signing
   
3. **Document Declined** (`DocumentDeclined`)
   - Triggered when a signer declines to sign
   
4. **Document Viewed** (`DocumentViewed`)
   - Triggered when a signer views the document
   
5. **Document Expired** (`DocumentExpired`)
   - Triggered when a document's signing link expires
   
6. **Document Revoked** (`DocumentRevoked`)
   - Triggered when a document is revoked/cancelled

---

## 📝 Step-by-Step Configuration in BoldSign

### Step 1: Access BoldSign Dashboard
1. Go to [https://app.boldsign.com](https://app.boldsign.com)
2. Log in to your BoldSign account
3. Navigate to **Settings** → **Webhooks**

### Step 2: Add Webhook
1. Click **"Add Webhook"** or **"New Webhook"** button
2. Enter the webhook URL:
   ```
   https://zenop.ai/api/boldsign/webhook
   ```
3. **Select all 6 events** listed above:
   - ✅ Document Signed
   - ✅ Document Completed
   - ✅ Document Declined
   - ✅ Document Viewed
   - ✅ Document Expired
   - ✅ Document Revoked

### Step 3: Save Configuration
1. Click **"Save"** or **"Create Webhook"**
2. BoldSign will test the webhook URL (optional)
3. Note: BoldSign may require HTTPS for production webhooks

---

## 🔍 Webhook Payload Format

BoldSign will send POST requests to your webhook endpoint with this format:

### DocumentSigned Event
```json
{
  "eventType": "DocumentSigned",
  "documentId": "doc-123456",
  "status": "InProgress",
  "signerEmail": "signer@example.com",
  "signerName": "John Doe",
  "workflowId": "workflow-789",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### DocumentCompleted Event
```json
{
  "eventType": "DocumentCompleted",
  "documentId": "doc-123456",
  "status": "Completed",
  "workflowId": "workflow-789",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### DocumentDeclined Event
```json
{
  "eventType": "DocumentDeclined",
  "documentId": "doc-123456",
  "status": "Declined",
  "signerEmail": "signer@example.com",
  "signerName": "Jane Doe",
  "reason": "Unable to sign at this time",
  "workflowId": "workflow-789",
  "timestamp": "2024-01-15T10:40:00Z"
}
```

---

## ✅ Verification & Testing

### 1. Test Webhook Endpoint
```bash
# Test if webhook endpoint is accessible
curl -X POST https://zenop.ai/api/boldsign/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "DocumentSigned",
    "documentId": "test-doc-123",
    "signerEmail": "test@example.com",
    "signerName": "Test Signer",
    "status": "InProgress"
  }'
```

### 2. Check Webhook Logs
```bash
# View all webhook events
curl https://zenop.ai/api/boldsign/webhook-logs

# View events for specific document
curl https://zenop.ai/api/boldsign/webhook-logs/test-doc-123
```

### 3. Verify in MongoDB
```bash
# Connect to MongoDB
mongosh

# Check webhook logs
use cpq_database
db.boldsign_webhook_logs.find().sort({timestamp: -1}).limit(5).pretty()
```

---

## 🚨 Important Notes

### Security
- ✅ Webhook endpoint is public (no authentication required)
- ✅ Webhook data is validated before processing
- ✅ All events are logged to MongoDB for audit trail
- ✅ Use HTTPS in production (required by BoldSign)

### Production Requirements
- ✅ Must use HTTPS (not HTTP)
- ✅ Domain must be publicly accessible
- ✅ Server must be running and accessible
- ✅ CORS must allow BoldSign webhook requests

### Local Development
- Use **ngrok** for local testing:
  ```bash
  ngrok http 3001
  # Use: https://abc123.ngrok.io/api/boldsign/webhook
  ```

---

## 📊 Monitoring & Status Endpoints

After configuring the webhook, you can monitor it using these endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/boldsign/webhook-logs` | View all webhook events |
| `GET /api/boldsign/webhook-logs/:documentId` | View events for a document |
| `GET /api/boldsign/document-status/:documentId` | Get signing status |
| `GET /api/boldsign/signing-history/:documentId` | Get event timeline |

---

## 🔧 Troubleshooting

### Webhook Not Receiving Events?

1. **Check BoldSign Settings**
   - Verify webhook URL is correct: `https://zenop.ai/api/boldsign/webhook`
   - Ensure all events are selected
   - Check if webhook is enabled/active

2. **Check Server Logs**
   ```bash
   # Look for webhook events in server logs
   tail -f server.log | grep "BoldSign Webhook"
   ```

3. **Verify Server is Running**
   ```bash
   curl https://zenop.ai/api/boldsign/webhook
   ```

4. **Check MongoDB Connection**
   - Ensure MongoDB is running
   - Verify database connection in server logs

5. **Test with Manual Request**
   ```bash
   curl -X POST https://zenop.ai/api/boldsign/webhook \
     -H "Content-Type: application/json" \
     -d '{"eventType":"DocumentSigned","documentId":"test-123"}'
   ```

### Common Issues

- **404 Error**: Webhook URL incorrect or server not running
- **SSL Certificate Error**: HTTPS certificate not properly configured
- **Timeout**: Server not responding (check if server is accessible)
- **No Events Logged**: MongoDB connection issue or database not accessible

---

## 📞 Support

If you encounter issues:

1. Check server logs: `GET /api/boldsign/webhook-logs`
2. Verify MongoDB: `db.boldsign_webhook_logs.find().count()`
3. Test endpoint manually with curl
4. Check BoldSign dashboard for webhook status
5. Review server console for error messages

---

## ✅ Configuration Checklist

Before going live, verify:

- [ ] Webhook URL configured in BoldSign: `https://zenop.ai/api/boldsign/webhook`
- [ ] All 6 events selected in BoldSign settings
- [ ] Server is running and accessible at `https://zenop.ai`
- [ ] HTTPS certificate is valid
- [ ] MongoDB is connected and accessible
- [ ] Test webhook event received successfully
- [ ] Webhook logs appearing in MongoDB
- [ ] Server logs showing webhook events

---

## 🎯 Quick Reference

**Webhook URL for BoldSign:**
```
https://zenop.ai/api/boldsign/webhook
```

**Events to Select:**
- Document Signed
- Document Completed
- Document Declined
- Document Viewed
- Document Expired
- Document Revoked

**Test Endpoint:**
```bash
curl https://zenop.ai/api/boldsign/webhook-logs
```

---

**Last Updated:** January 2024  
**Status:** ✅ Production Ready

