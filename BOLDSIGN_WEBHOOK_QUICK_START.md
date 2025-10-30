# 🚀 BoldSign Webhook - Quick Start Guide (5 Minutes)

## ⚡ Quick Setup

### Step 1: Add Environment Variables (2 min)

Edit your `.env` file:

```env
BOLDSIGN_API_KEY=your-boldsign-api-key-here
NOTIFICATION_EMAIL=your-email@company.com
```

### Step 2: Configure Webhook in BoldSign (2 min)

1. Go to https://app.boldsign.com → **Settings** → **Webhooks**
2. Click **Add Webhook**
3. URL: `https://your-domain.com/api/boldsign/webhook`
4. Select all events:
   - ✅ Document Signed
   - ✅ Document Completed
   - ✅ Document Declined
   - ✅ Document Viewed
   - ✅ Document Expired
   - ✅ Document Revoked
5. Click **Save**

### Step 3: Restart Server (1 min)

```bash
npm start
```

**Done!** Your webhook is now active. 🎉

---

## 📡 Testing the Webhook

### Test Locally with ngrok

```bash
# 1. Install ngrok (if not installed)
npm install -g ngrok

# 2. Start ngrok on port 3001
ngrok http 3001

# 3. Copy the forwarding URL (e.g., https://abc123.ngrok.io)

# 4. Update webhook URL in BoldSign:
#    https://abc123.ngrok.io/api/boldsign/webhook

# 5. Create a test document in BoldSign - webhook should trigger!
```

### Send Test Webhook

```bash
curl -X POST http://localhost:3001/api/boldsign/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "DocumentSigned",
    "documentId": "test-doc-123",
    "signerEmail": "test@example.com",
    "signerName": "Test Signer",
    "status": "InProgress"
  }'
```

---

## 🔍 Check Webhook Status

### Get Document Signing Status

```bash
curl http://localhost:3001/api/boldsign/document-status/test-doc-123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "signing": {
      "totalSigners": 1,
      "completedSignatures": 1,
      "completionPercentage": 100,
      "status": "fully_signed"
    }
  }
}
```

### Get Signing History

```bash
curl http://localhost:3001/api/boldsign/signing-history/test-doc-123
```

### Get All Webhook Logs

```bash
curl http://localhost:3001/api/boldsign/webhook-logs?limit=10
```

---

## 📊 Monitor Webhook Events

### Check Logs in Real-Time

```bash
# On Linux/macOS
tail -f server.log | grep "BoldSign Webhook"

# On Windows (PowerShell)
Get-Content server.log -Wait | Select-String "BoldSign Webhook"
```

### View in MongoDB

```bash
# Connect to MongoDB
mongosh

# Switch to database
use cpq_database

# View webhook logs
db.boldsign_webhook_logs.find().pretty()

# View signature status
db.signature_status.find().pretty()

# Count events by type
db.boldsign_webhook_logs.aggregate([
  { $group: { _id: '$eventType', count: { $sum: 1 } } }
])
```

---

## 🐛 Troubleshooting

### Webhook Not Receiving Events?

1. ✅ Check webhook URL in BoldSign settings
2. ✅ Ensure HTTPS is used (not HTTP)
3. ✅ Use ngrok for local testing
4. ✅ Check server logs for errors
5. ✅ Verify MongoDB is running

### No Data in Collections?

1. ✅ Check if webhook logs are being created:
   ```bash
   curl http://localhost:3001/api/boldsign/webhook-logs
   ```

2. ✅ Verify database connection:
   ```bash
   curl http://localhost:3001/api/database/health
   ```

3. ✅ Check email configuration for notifications

---

## 📝 API Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/boldsign/webhook` | POST | Receive webhook events |
| `/api/boldsign/document-status/:id` | GET | Get signing status |
| `/api/boldsign/signing-history/:id` | GET | Get event timeline |
| `/api/boldsign/webhook-logs/:id` | GET | Get document logs |
| `/api/boldsign/webhook-logs` | GET | Get all logs |
| `/api/boldsign/document-views/:id` | GET | Get view analytics |

---

## ✅ Production Checklist

Before going live:

- [ ] HTTPS enabled on production URL
- [ ] Environment variables set in production
- [ ] MongoDB backup configured
- [ ] Error notifications working
- [ ] Webhook logs being created
- [ ] Performance tested with real documents

---

## 🎯 Next Steps

1. **Integrate with Frontend** → Show signing progress to users
2. **Add Monitoring** → Alert on failed signatures
3. **Archive Old Logs** → Keep database clean
4. **Custom Notifications** → Send to your Slack/Teams

See `BOLDSIGN_WEBHOOK_INTEGRATION.md` for detailed documentation.

---

## 📞 Need Help?

- Check logs: `GET /api/boldsign/webhook-logs`
- View status: `GET /api/boldsign/document-status/:documentId`
- Database health: `GET /api/database/health`

**Everything working?** 🎉 You're all set!
