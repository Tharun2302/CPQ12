# 🔗 BoldSign Webhook Integration Guide

## Overview

This guide explains the enhanced BoldSign webhook integration that provides **real-time status tracking** for document signing events. The system automatically logs all events to MongoDB and provides multiple endpoints to query signing status and history.

## Features

✅ **Real-Time Event Tracking** - Instantly logs all BoldSign events  
✅ **MongoDB Persistence** - All events stored for audit trail  
✅ **Comprehensive API Endpoints** - Query signing status, history, and analytics  
✅ **Automatic Notifications** - Email alerts on important events  
✅ **Event Verification** - Validates webhook data before processing  
✅ **Error Resilience** - Graceful error handling with detailed logging  
✅ **Scalable Architecture** - Handles high-volume webhook events  

---

## Setup Instructions

### 1. Get BoldSign API Key

1. Go to [BoldSign Dashboard](https://app.boldsign.com)
2. Navigate to **Settings** → **API**
3. Generate a new API key
4. Copy and store securely

### 2. Configure Webhook URL in BoldSign

1. In BoldSign Dashboard, go to **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Enter webhook URL: `https://your-domain.com/api/boldsign/webhook`
4. Select events to track:
   - ✅ Document Signed
   - ✅ Document Completed
   - ✅ Document Declined
   - ✅ Document Viewed
   - ✅ Document Expired
   - ✅ Document Revoked
5. Click **Save**

### 3. Environment Configuration

Add to your `.env` file:

```env
# BoldSign Configuration
BOLDSIGN_API_KEY=your-actual-boldsign-api-key-here
BOLDSIGN_API_URL=https://api.boldsign.com

# Notification Email (receives webhook alerts)
NOTIFICATION_EMAIL=team@yourcompany.com

# SendGrid Email Configuration (for notifications)
SENDGRID_API_KEY=your-sendgrid-api-key
```

---

## Webhook Event Types

### 1. DocumentSigned
**Triggered:** When a signer completes their signature

```json
{
  "eventType": "DocumentSigned",
  "documentId": "doc-123456",
  "status": "InProgress",
  "signerEmail": "signer@example.com",
  "signerName": "John Doe",
  "workflowId": "workflow-789"
}
```

**Actions:**
- ✅ Records signature in `signature_status` collection
- ✅ Updates document's `signingHistory`
- ✅ Sends notification email
- ✅ Updates last signer info

---

### 2. DocumentCompleted
**Triggered:** When all signers have completed signing

```json
{
  "eventType": "DocumentCompleted",
  "documentId": "doc-123456",
  "status": "Completed",
  "workflowId": "workflow-789"
}
```

**Actions:**
- ✅ Updates document status to `fully_signed`
- ✅ Updates linked workflow
- ✅ Sends completion notification
- ✅ Records completion timestamp

---

### 3. DocumentDeclined
**Triggered:** When a signer declines to sign

```json
{
  "eventType": "DocumentDeclined",
  "documentId": "doc-123456",
  "status": "Declined",
  "signerEmail": "signer@example.com",
  "signerName": "Jane Doe",
  "reason": "Unable to sign at this time",
  "workflowId": "workflow-789"
}
```

**Actions:**
- ✅ Creates decline record in `signature_declines` collection
- ✅ Updates document status to `declined`
- ✅ Sends decline notification to stakeholders
- ✅ Records decline reason and timestamp

---

### 4. DocumentViewed
**Triggered:** When a signer views the document

```json
{
  "eventType": "DocumentViewed",
  "documentId": "doc-123456",
  "signerEmail": "signer@example.com"
}
```

**Actions:**
- ✅ Records view in `document_views` collection
- ✅ Tracks engagement metrics

---

### 5. DocumentExpired
**Triggered:** When a document's signing link expires

```json
{
  "eventType": "DocumentExpired",
  "documentId": "doc-123456",
  "status": "Expired"
}
```

**Actions:**
- ✅ Updates document status to `expired`
- ✅ Records expiration timestamp

---

### 6. DocumentRevoked
**Triggered:** When a document is revoked

```json
{
  "eventType": "DocumentRevoked",
  "documentId": "doc-123456",
  "status": "Revoked"
}
```

**Actions:**
- ✅ Updates document status to `revoked`
- ✅ Records revocation timestamp

---

## API Endpoints

### 1. Get Document Signing Status

**Endpoint:** `GET /api/boldsign/document-status/:documentId`

**Description:** Returns real-time status of a document and all signers

**Response:**
```json
{
  "success": true,
  "data": {
    "document": {
      "id": "doc-123456",
      "fileName": "Agreement.pdf",
      "status": "fully_signed",
      "createdAt": "2024-10-29T10:00:00Z",
      "lastEvent": "DocumentCompleted",
      "lastEventAt": "2024-10-29T11:30:00Z"
    },
    "signing": {
      "totalSigners": 2,
      "completedSignatures": 2,
      "completionPercentage": 100,
      "status": "fully_signed"
    },
    "signers": [
      {
        "email": "legal@company.com",
        "name": "Legal Team",
        "status": "signed",
        "signedAt": "2024-10-29T10:15:00Z",
        "viewedAt": "2024-10-29T10:05:00Z"
      },
      {
        "email": "client@example.com",
        "name": "Client Name",
        "status": "signed",
        "signedAt": "2024-10-29T11:30:00Z",
        "viewedAt": "2024-10-29T11:20:00Z"
      }
    ],
    "declines": [],
    "timeline": {
      "created": "2024-10-29T10:00:00Z",
      "lastUpdated": "2024-10-29T11:30:00Z",
      "completed": "2024-10-29T11:30:00Z",
      "expired": null
    }
  }
}
```

---

### 2. Get Signing History

**Endpoint:** `GET /api/boldsign/signing-history/:documentId`

**Description:** Returns detailed timeline of all signing events

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "doc-123456",
    "totalEvents": 5,
    "timeline": [
      {
        "sequence": 1,
        "eventType": "DocumentViewed",
        "timestamp": "2024-10-29T10:05:00Z",
        "signer": {
          "email": "legal@company.com",
          "name": "Legal Team"
        },
        "status": "processed"
      },
      {
        "sequence": 2,
        "eventType": "DocumentSigned",
        "timestamp": "2024-10-29T10:15:00Z",
        "signer": {
          "email": "legal@company.com",
          "name": "Legal Team"
        },
        "details": {
          "status": "processed",
          "action": "signature_recorded",
          "signer": "legal@company.com"
        },
        "status": "processed"
      },
      {
        "sequence": 3,
        "eventType": "DocumentViewed",
        "timestamp": "2024-10-29T11:20:00Z",
        "signer": {
          "email": "client@example.com",
          "name": "Client Name"
        },
        "status": "processed"
      },
      {
        "sequence": 4,
        "eventType": "DocumentSigned",
        "timestamp": "2024-10-29T11:30:00Z",
        "signer": {
          "email": "client@example.com",
          "name": "Client Name"
        },
        "details": {
          "status": "processed",
          "action": "signature_recorded",
          "signer": "client@example.com"
        },
        "status": "processed"
      },
      {
        "sequence": 5,
        "eventType": "DocumentCompleted",
        "timestamp": "2024-10-29T11:30:00Z",
        "signer": null,
        "details": {
          "status": "processed",
          "action": "document_completed",
          "documentId": "doc-123456"
        },
        "status": "processed"
      }
    ]
  }
}
```

---

### 3. Get Webhook Logs for Document

**Endpoint:** `GET /api/boldsign/webhook-logs/:documentId?limit=50&skip=0`

**Description:** Returns all webhook events for a specific document (paginated)

**Query Parameters:**
- `limit` (default: 50) - Number of logs to return
- `skip` (default: 0) - Number of logs to skip

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "doc-123456",
    "total": 5,
    "logs": [
      {
        "id": "event-uuid",
        "eventType": "DocumentCompleted",
        "documentId": "doc-123456",
        "status": "Completed",
        "timestamp": "2024-10-29T11:30:00Z",
        "processed": true,
        "processedAt": "2024-10-29T11:30:01Z",
        "processingResult": {
          "status": "processed",
          "action": "document_completed"
        }
      }
    ],
    "pagination": {
      "skip": 0,
      "limit": 50,
      "hasMore": false
    }
  }
}
```

---

### 4. Get All Webhook Logs (Monitoring)

**Endpoint:** `GET /api/boldsign/webhook-logs?limit=100&skip=0&eventType=DocumentSigned&status=processed`

**Description:** Returns recent webhook events across all documents

**Query Parameters:**
- `limit` (default: 100) - Number of logs to return
- `skip` (default: 0) - Number of logs to skip
- `eventType` (optional) - Filter by event type (DocumentSigned, DocumentCompleted, etc.)
- `status` (optional) - Filter by processing status (processed, pending)

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "logs": [...],
    "statistics": {
      "eventCounts": {
        "DocumentSigned": 45,
        "DocumentCompleted": 30,
        "DocumentDeclined": 5,
        "DocumentViewed": 70
      },
      "processed": 148,
      "failed": 2
    },
    "pagination": {
      "skip": 0,
      "limit": 100,
      "hasMore": true
    }
  }
}
```

---

### 5. Get Document View Analytics

**Endpoint:** `GET /api/boldsign/document-views/:documentId`

**Description:** Returns when and who viewed the document

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "doc-123456",
    "totalViews": 2,
    "views": [
      {
        "viewedBy": "client@example.com",
        "viewedAt": "2024-10-29T11:20:00Z"
      },
      {
        "viewedBy": "legal@company.com",
        "viewedAt": "2024-10-29T10:05:00Z"
      }
    ]
  }
}
```

---

## MongoDB Collections

### boldsign_webhook_logs
Stores all webhook events

```javascript
{
  id: "uuid",
  eventType: "DocumentSigned",
  documentId: "doc-123456",
  status: "InProgress",
  signerEmail: "signer@example.com",
  signerName: "John Doe",
  workflowId: "workflow-789",
  timestamp: ISODate("2024-10-29T10:15:00Z"),
  eventData: {...},
  processed: true,
  processedAt: ISODate("2024-10-29T10:15:01Z"),
  processingResult: {...}
}
```

### signature_status
Tracks individual signer statuses

```javascript
{
  documentId: "doc-123456",
  signerEmail: "signer@example.com",
  signerName: "John Doe",
  signedAt: ISODate("2024-10-29T10:15:00Z"),
  status: "signed",
  eventData: {...}
}
```

### signature_declines
Records declined signatures

```javascript
{
  documentId: "doc-123456",
  signerEmail: "signer@example.com",
  signerName: "Jane Doe",
  reason: "Unable to sign",
  declinedAt: ISODate("2024-10-29T10:15:00Z"),
  eventData: {...}
}
```

### document_views
Tracks document views

```javascript
{
  documentId: "doc-123456",
  signerEmail: "signer@example.com",
  viewedAt: ISODate("2024-10-29T10:05:00Z"),
  eventData: {...}
}
```

---

## Integration Example

### Frontend: Monitor Document Status

```typescript
// React component to track signing progress
const DocumentStatus = ({ documentId }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Poll document status every 5 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/boldsign/document-status/${documentId}`);
        const data = await response.json();
        setStatus(data.data);
      } catch (error) {
        console.error('Error fetching status:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [documentId]);

  if (!status) return <div>Loading...</div>;

  return (
    <div>
      <h3>Signing Progress</h3>
      <p>
        {status.signing.completedSignatures} of {status.signing.totalSigners} signed
      </p>
      <div className="progress-bar">
        <div style={{ width: `${status.signing.completionPercentage}%` }}>
          {status.signing.completionPercentage}%
        </div>
      </div>
      <h4>Signers:</h4>
      {status.signers.map(signer => (
        <p key={signer.email}>
          {signer.name}: {signer.status === 'signed' ? '✅ Signed' : '⏳ Pending'}
        </p>
      ))}
    </div>
  );
};
```

---

## Testing Webhooks Locally

### Using ngrok

```bash
# 1. Install ngrok
npm install -g ngrok

# 2. Start ngrok tunnel
ngrok http 3001

# 3. Copy ngrok URL (e.g., https://abc123.ngrok.io)

# 4. Update webhook URL in BoldSign:
#    https://abc123.ngrok.io/api/boldsign/webhook

# 5. View webhook logs in ngrok console
```

---

## Best Practices

### 1. Event Processing
- ✅ Always validate webhook data before processing
- ✅ Use idempotency (handle duplicate events gracefully)
- ✅ Log all events for audit trail
- ✅ Return 200 OK quickly to BoldSign

### 2. Database
- ✅ Create indexes on frequently queried fields
- ✅ Archive old webhook logs periodically
- ✅ Use transactions for critical updates

### 3. Monitoring
- ✅ Monitor webhook logs regularly
- ✅ Alert on failed events
- ✅ Track event processing latency
- ✅ Monitor database collection sizes

### 4. Security
- ✅ Verify webhook signatures (implement when enabled)
- ✅ Use HTTPS for webhook URLs
- ✅ Restrict API endpoints with authentication
- ✅ Never log sensitive data

---

## Troubleshooting

### Webhooks Not Being Received

1. **Check BoldSign Configuration**
   - Verify webhook URL is correct
   - Ensure HTTPS is used in production
   - Check BoldSign webhook logs

2. **Check Network**
   - Verify firewall allows incoming webhooks
   - Check proxy/firewall settings
   - Test with curl: `curl -X POST https://your-domain.com/api/boldsign/webhook`

3. **Check Logs**
   - Review server logs for webhook requests
   - Check MongoDB connection
   - Look for error messages

### Events Not Being Processed

1. **Check Event Data**
   - Verify event has required fields (eventType, documentId)
   - Check event timestamp is recent

2. **Check Database**
   - Ensure MongoDB collections exist
   - Check for connection errors
   - Verify write permissions

3. **Check Handlers**
   - Review handler functions for errors
   - Check notification email configuration
   - Verify SendGrid API key

### Missing Data in Collections

1. **Check Webhook Logs**
   - Use `GET /api/boldsign/webhook-logs` to verify events received
   - Check if events were processed

2. **Check Collection Structure**
   - Verify indexes are created
   - Check collection names match

---

## Production Checklist

- [ ] BoldSign webhook URL configured with HTTPS
- [ ] Environment variables configured (.env file)
- [ ] MongoDB indexes created
- [ ] SendGrid configured for notifications
- [ ] Webhook logs monitored
- [ ] Error handling tested
- [ ] Database backups configured
- [ ] Performance tested with high volume
- [ ] Security: HTTPS, authentication, validation
- [ ] Monitoring: Logs, alerts, metrics
- [ ] Documentation shared with team

---

## Support & Resources

### BoldSign
- Dashboard: https://app.boldsign.com
- API Docs: https://developers.boldsign.com
- Status Page: https://status.boldsign.com

### Your Application
- Webhook Endpoint: `POST /api/boldsign/webhook`
- Status Endpoint: `GET /api/boldsign/document-status/:documentId`
- Logs Endpoint: `GET /api/boldsign/webhook-logs`

---

## Changelog

### Version 2.0 (Current)
- ✨ Enhanced webhook with real-time status tracking
- ✨ MongoDB persistence for all events
- ✨ Multiple status query endpoints
- ✨ Automatic email notifications
- ✨ Comprehensive logging and audit trail
- ✨ Support for 6 event types
- ✨ Document view analytics
- ✨ Signing history timeline

### Version 1.0
- Initial BoldSign webhook implementation
