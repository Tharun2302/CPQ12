# 🔗 BoldSign Webhook Integration

**Real-Time Document Signing Status Tracking for Your CPQ Application**

---

## 📚 Documentation

| Guide | Purpose | Time |
|-------|---------|------|
| [**Quick Start**](./BOLDSIGN_WEBHOOK_QUICK_START.md) | Get running in 5 minutes | ⚡ 5 min |
| [**Full Integration Guide**](./BOLDSIGN_WEBHOOK_INTEGRATION.md) | Complete technical reference | 📖 30 min |
| [**Implementation Summary**](./BOLDSIGN_WEBHOOK_IMPLEMENTATION_SUMMARY.md) | Technical architecture & details | 📊 15 min |

---

## ✨ What's Included

### Backend Integration
✅ Enhanced webhook handler  
✅ 6 event handler functions  
✅ 6 status query endpoints  
✅ MongoDB persistence  
✅ Automatic email notifications  
✅ Real-time event tracking  

### API Endpoints
```
POST   /api/boldsign/webhook                      - Receive webhook events
GET    /api/boldsign/document-status/:documentId  - Get signing status
GET    /api/boldsign/signing-history/:documentId  - Get event timeline
GET    /api/boldsign/webhook-logs/:documentId     - Get document logs
GET    /api/boldsign/webhook-logs                 - Get all logs
GET    /api/boldsign/document-views/:documentId   - Get view analytics
```

### MongoDB Collections
- `boldsign_webhook_logs` - All webhook events
- `signature_status` - Individual signer statuses
- `signature_declines` - Declined signature records
- `document_views` - Document view tracking

---

## 🚀 Quick Start

### 1. Configure Environment

Add to `.env`:
```env
BOLDSIGN_API_KEY=your-api-key-here
NOTIFICATION_EMAIL=team@company.com
SENDGRID_API_KEY=your-sendgrid-key
```

### 2. Configure Webhook in BoldSign

1. Go to BoldSign Dashboard → Settings → Webhooks
2. Add webhook: `https://your-domain.com/api/boldsign/webhook`
3. Select events: Signed, Completed, Declined, Viewed, Expired, Revoked
4. Save

### 3. Test Locally

```bash
# Start ngrok tunnel
ngrok http 3001

# Use ngrok URL in BoldSign webhook settings
# Create a test document and sign it
```

### 4. Check Status

```bash
# Get signing status
curl http://localhost:3001/api/boldsign/document-status/doc-id

# Get event history
curl http://localhost:3001/api/boldsign/signing-history/doc-id

# Get all webhook logs
curl http://localhost:3001/api/boldsign/webhook-logs
```

---

## 📊 Webhook Events

| Event | When | Actions |
|-------|------|---------|
| **DocumentSigned** | Signer completes signature | Record signature, send email |
| **DocumentCompleted** | All signers done | Mark fully signed, update workflow |
| **DocumentDeclined** | Signer declines | Record decline, notify team |
| **DocumentViewed** | Signer views document | Track engagement |
| **DocumentExpired** | Signing link expires | Mark document expired |
| **DocumentRevoked** | Document is revoked | Mark document revoked |

---

## 🔍 Key Features

### Real-Time Status Tracking
Monitor document signing progress in real-time with completion percentages and signer status:

```json
{
  "signing": {
    "totalSigners": 2,
    "completedSignatures": 1,
    "completionPercentage": 50,
    "status": "InProgress"
  }
}
```

### Event Timeline
View complete chronological timeline of all signing events:

```json
{
  "timeline": [
    {
      "sequence": 1,
      "eventType": "DocumentViewed",
      "timestamp": "2024-10-29T10:05:00Z",
      "signer": {
        "email": "legal@company.com",
        "name": "Legal Team"
      }
    },
    {
      "sequence": 2,
      "eventType": "DocumentSigned",
      "timestamp": "2024-10-29T10:15:00Z",
      "signer": {
        "email": "legal@company.com",
        "name": "Legal Team"
      }
    }
  ]
}
```

### Persistent Audit Trail
All webhook events stored in MongoDB for compliance:
- Event type and timestamp
- Signer information
- Processing status
- Full event payload
- Processing results

### Automatic Notifications
Email alerts sent for:
- ✅ Signature received
- ✅ Document fully signed
- ✅ Signature declined
- ✅ Document expired

---

## 🧪 Testing

### Local Testing with ngrok

```bash
# 1. Install ngrok
npm install -g ngrok

# 2. Start tunnel
ngrok http 3001

# 3. Configure in BoldSign
https://abc123.ngrok.io/api/boldsign/webhook

# 4. View requests in ngrok dashboard
# 5. Test webhook in BoldSign
```

### Send Test Webhook

```bash
curl -X POST http://localhost:3001/api/boldsign/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "DocumentSigned",
    "documentId": "test-123",
    "signerEmail": "test@example.com",
    "signerName": "Test User"
  }'
```

### Check MongoDB

```bash
mongosh
use cpq_database

# View webhook logs
db.boldsign_webhook_logs.find().pretty()

# Count by event type
db.boldsign_webhook_logs.aggregate([
  { $group: { _id: '$eventType', count: { $sum: 1 } } }
])
```

---

## 📋 Setup Checklist

### Development
- [ ] Add BOLDSIGN_API_KEY to .env
- [ ] Add NOTIFICATION_EMAIL to .env
- [ ] Start server: `npm start`
- [ ] Install ngrok: `npm install -g ngrok`
- [ ] Start ngrok: `ngrok http 3001`
- [ ] Test webhook locally

### Production
- [ ] Configure webhook URL in BoldSign (HTTPS)
- [ ] Set all environment variables
- [ ] Verify MongoDB connection
- [ ] Test end-to-end flow
- [ ] Monitor webhook logs
- [ ] Set up backups
- [ ] Configure monitoring/alerts

---

## 🐛 Troubleshooting

### Webhooks Not Received?
1. Check webhook URL in BoldSign settings
2. Verify HTTPS is enabled (production)
3. Check firewall/proxy allowing webhook traffic
4. Use ngrok for local testing
5. Review server logs for errors

### Events Not Processed?
1. Verify MongoDB is running
2. Check event data format
3. Review handler functions in server.cjs
4. Check email configuration
5. Review error logs

### No Data in Collections?
1. Send test webhook event
2. Verify MongoDB connection: `GET /api/database/health`
3. Check webhook logs: `GET /api/boldsign/webhook-logs`
4. View MongoDB collections directly

---

## 📈 Performance

### Expected Response Times
- Webhook processing: < 100ms
- Status query: < 50ms
- History query: < 100ms
- Logs query: < 200ms

### Scalability
- ✅ Handles high-volume webhook events
- ✅ Asynchronous processing
- ✅ MongoDB connection pooling
- ✅ Paginated API responses

---

## 🔐 Security

### Security Features
- ✅ Event validation before processing
- ✅ HTTPS required in production
- ✅ Database authentication
- ✅ Error messages don't leak sensitive data
- ✅ Secure MongoDB storage

### Best Practices
- ✅ Use HTTPS for all webhook URLs
- ✅ Implement webhook signature verification
- ✅ Restrict API access with authentication
- ✅ Never log sensitive PII
- ✅ Rotate API keys regularly

---

## 📡 Integration Examples

### React Component - Real-Time Status

```typescript
const DocumentStatus = ({ documentId }) => {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const response = await fetch(
        `/api/boldsign/document-status/${documentId}`
      );
      const data = await response.json();
      setStatus(data.data);
    }, 5000);

    return () => clearInterval(interval);
  }, [documentId]);

  if (!status) return <div>Loading...</div>;

  return (
    <div>
      <h3>Signing Progress</h3>
      <p>
        {status.signing.completedSignatures} of{" "}
        {status.signing.totalSigners} signed
      </p>
      <progress
        value={status.signing.completionPercentage}
        max="100"
      />
      <h4>Signers:</h4>
      {status.signers.map((signer) => (
        <p key={signer.email}>
          {signer.name}:{" "}
          {signer.status === "signed" ? "✅ Signed" : "⏳ Pending"}
        </p>
      ))}
    </div>
  );
};
```

---

## 🎯 Next Steps

1. **This Week**
   - [ ] Read Quick Start guide
   - [ ] Configure environment variables
   - [ ] Set up webhook in BoldSign
   - [ ] Test locally with ngrok

2. **This Month**
   - [ ] Deploy to production
   - [ ] Integrate frontend component
   - [ ] Set up monitoring
   - [ ] Train team

3. **Ongoing**
   - [ ] Monitor webhook logs
   - [ ] Archive old events
   - [ ] Optimize queries
   - [ ] Add custom notifications

---

## 📞 Support

### Resources
- **BoldSign Docs:** https://developers.boldsign.com
- **Webhook Testing:** Use ngrok locally
- **Logs:** `GET /api/boldsign/webhook-logs`
- **Status:** `GET /api/boldsign/document-status/:documentId`

### Common Questions

**Q: How often are webhooks sent?**  
A: Instantly when events occur in BoldSign

**Q: What if a webhook fails?**  
A: BoldSign retries with exponential backoff

**Q: How long are logs kept?**  
A: Indefinitely by default (archive as needed)

**Q: Can I get notifications in Slack?**  
A: Yes, modify `sendSignatureNotification()` function

---

## 📄 License

Part of CPQ Pro Application

---

## 🎉 You're All Set!

Your BoldSign webhook integration is ready for use. Start with the [**Quick Start Guide**](./BOLDSIGN_WEBHOOK_QUICK_START.md) and refer to the [**Full Integration Guide**](./BOLDSIGN_WEBHOOK_INTEGRATION.md) for advanced topics.

**Questions?** Check the [**Implementation Summary**](./BOLDSIGN_WEBHOOK_IMPLEMENTATION_SUMMARY.md) for technical details.

---

**Last Updated:** October 29, 2024  
**Version:** 2.0  
**Status:** ✅ Production Ready
