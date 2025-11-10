# 🚀 Document Status Tracking - Quick Reference

## 📍 Access Points

### Dashboard
```
http://159.89.175.168:3001/document-status
```

### API Endpoints
```bash
# Get document status
GET /api/boldsign/document-status/:documentId

# Get all recent events
GET /api/boldsign/webhook-logs

# Get document history
GET /api/boldsign/signing-history/:documentId
```

---

## 📊 Status States

| Status | Color | Icon | Meaning |
|--------|-------|------|---------|
| Sent | Blue 🔵 | 📄 | Document sent to signers |
| Viewed | Purple 🟣 | 👁️ | Signer viewed document |
| Signed | Yellow 🟡 | ✅ | Partially signed |
| Fully Signed | Green 🟢 | ✅ | All signers completed |
| Declined | Red 🔴 | ❌ | Signer declined |
| Expired | Gray ⚫ | ⏰ | Signing link expired |

---

## 🔄 Quick Commands

### Check Status
```bash
curl http://159.89.175.168:3001/api/boldsign/document-status/<DOC_ID>
```

### View All Events
```bash
curl http://159.89.175.168:3001/api/boldsign/webhook-logs
```

### Test Webhook
```bash
curl -X POST https://<ngrok-url>/api/boldsign/webhook \
  -H "Content-Type: application/json" \
  -d '{"eventType":"DocumentSigned","documentId":"test-123"}'
```

---

## 🎯 Dashboard Features

- ✅ Search by Document ID
- ✅ Auto-refresh (10s intervals)
- ✅ Progress bar
- ✅ Signer status
- ✅ Event timeline
- ✅ Recent events table

---

## 🔧 Configuration

### Required in BoldSign
- Webhook URL: `https://<ngrok-url>/api/boldsign/webhook`
- Events: Signed, Completed, Declined, Viewed, Expired, Revoked

### Required Environment Variables
```env
BOLDSIGN_API_KEY=your-api-key
MONGODB_URI=mongodb://localhost:27017
DB_NAME=cpq_database
```

---

## 📱 Usage Flow

1. Send document via BoldSign
2. Get `documentId` from response
3. Open dashboard: `/document-status`
4. Enter `documentId`
5. Click "Check Status"
6. Enable auto-refresh

---

## 🐛 Troubleshooting

### No events?
- Check ngrok is running
- Verify webhook URL in BoldSign
- Test with manual curl

### Dashboard not loading?
- Check server is running
- Verify route in App.tsx
- Check browser console

### Status not updating?
- Enable auto-refresh
- Verify document ID
- Check webhook logs

---

## 📚 Full Documentation

- `DOCUMENT_STATUS_TRACKING_GUIDE.md` - Complete guide
- `IMPLEMENTATION_COMPLETE_STATUS_TRACKING.md` - Implementation details
- `WEBHOOK_README.md` - Webhook integration

---

**Quick Help:** http://159.89.175.168:3001/document-status

