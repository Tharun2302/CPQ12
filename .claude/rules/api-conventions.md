# API Conventions

## Endpoint Naming

### URL Structure
```
/api/[resource]/[action]

Examples:
GET    /api/quotes                    (list all)
GET    /api/quotes/:id                (get one)
POST   /api/quotes                    (create)
PUT    /api/quotes/:id                (update)
DELETE /api/quotes/:id                (delete)

POST   /api/quotes/generate           (custom action)
POST   /api/exhibits/upload           (custom action)
GET    /api/pricing/calculate         (custom action)
```

### Naming Rules
- **Lowercase** with hyphens for multi-word: `/api/pricing-rules`
- **Plural resource names:** `/api/quotes` not `/api/quote`
- **No verbs in URLs** (HTTP method indicates action)
- **Bad:** `/api/getQuote`, `/api/createUser`
- **Good:** `/api/quotes`, `/api/users`

---

## Request/Response Format

### Success Response (200, 201)
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "quoteName": "Acme Corp Quote",
    "total": 15000,
    "createdAt": "2024-06-29T10:30:00Z"
  },
  "message": "Quote created successfully"
}
```

### Error Response (400, 404, 500)
```json
{
  "success": false,
  "error": "User-friendly error message",
  "details": "Technical details (only in dev)",
  "code": "VALIDATION_ERROR"
}
```

### List Response (200)
```json
{
  "success": true,
  "data": [
    { "id": "1", "name": "Quote 1" },
    { "id": "2", "name": "Quote 2" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

## HTTP Status Codes

| Code | When to Use | Example |
|---|---|---|
| **200** | GET, PUT, DELETE succeeded | Quote retrieved successfully |
| **201** | POST created resource | Quote created |
| **400** | Bad request (validation failed) | Missing required field |
| **401** | Unauthorized (not logged in) | No JWT token |
| **403** | Forbidden (no permission) | User can't delete others' quotes |
| **404** | Not found | Quote ID doesn't exist |
| **409** | Conflict (duplicate) | Duplicate combination |
| **500** | Server error | Unexpected database error |

---

## Request Validation

### All POST/PUT endpoints MUST validate input

```javascript
// ✅ Good
app.post('/api/quotes', (req, res) => {
  const { customerName, total, combinationId } = req.body;
  
  // Validate required fields
  if (!customerName || !total || !combinationId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: customerName, total, combinationId'
    });
  }
  
  // Validate data types
  if (typeof total !== 'number' || total <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Total must be a positive number'
    });
  }
  
  // Validate against database schema
  if (combinationId.length !== 24) {
    return res.status(400).json({
      success: false,
      error: 'Invalid combination ID format'
    });
  }
  
  // If all valid, proceed
  // ...
});

// ❌ Bad
app.post('/api/quotes', (req, res) => {
  const quote = new Quote(req.body); // No validation
  quote.save().catch(err => res.status(500).json(err)); // Vague error
});
```

---

## Error Handling

### Consistent Error Responses
```javascript
// ✅ Good — Always return structured response
try {
  const quote = await Quote.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({
      success: false,
      error: 'Quote not found',
      code: 'NOT_FOUND'
    });
  }
  res.json({ success: true, data: quote });
} catch (error) {
  console.error('Error fetching quote:', error);
  res.status(500).json({
    success: false,
    error: 'Failed to fetch quote',
    code: 'INTERNAL_ERROR'
  });
}

// ❌ Bad — Inconsistent responses
app.get('/api/quotes/:id', (req, res) => {
  Quote.findById(req.params.id, (err, quote) => {
    if (err) res.send(err); // Leaks internal error
    res.json(quote); // May be null, no error handling
  });
});
```

### Never Expose Sensitive Data in Errors
```javascript
// ✅ Good
return res.status(500).json({
  success: false,
  error: 'Failed to process quote',
  code: 'DB_ERROR'
});

// ❌ Bad — Exposes internal info
return res.status(500).json({
  success: false,
  error: 'MongoDB connection failed: ECONNREFUSED 27017'
});
```

---

## Authentication

### JWT Token Handling
```javascript
// ✅ Good — Check JWT on protected endpoints
app.get('/api/quotes/:id', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Missing authorization token'
    });
  }
  
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    // User is authenticated, proceed
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
});

// ❌ Bad — No auth check
app.get('/api/quotes/:id', (req, res) => {
  // Anyone can access
});
```

### Authorization Checks
```javascript
// ✅ Good — Verify ownership
app.delete('/api/quotes/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // From JWT
  
  Quote.findById(id, (err, quote) => {
    if (quote.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own quotes'
      });
    }
    // Proceed with deletion
  });
});
```

---

## Pagination (for list endpoints)

```javascript
// ✅ Good
app.get('/api/quotes', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const skip = (page - 1) * pageSize;
  
  Quote.find()
    .skip(skip)
    .limit(pageSize)
    .then(quotes => {
      const total = Quote.countDocuments();
      res.json({
        success: true,
        data: quotes,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    });
});
```

---

## Rate Limiting

- **No authenticated endpoint should allow unlimited requests**
- **Limit:** 100 requests per minute per user
- **Response on limit exceeded:** 429 (Too Many Requests)

---

## API Documentation Template

```
## GET /api/quotes/:id

### Description
Fetch a single quote by ID.

### Authentication
Required (JWT token in Authorization header)

### Request Parameters
| Param | Type | Required | Description |
|---|---|---|---|
| id | string | Yes | Quote ID (24-char MongoDB ObjectId) |

### Response (200)
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "customerName": "Acme Corp",
    "total": 15000,
    "combinationId": "...",
    "createdAt": "2024-06-29T10:30:00Z"
  }
}
```

### Errors
- 400: Invalid quote ID format
- 401: Missing or invalid token
- 404: Quote not found
- 500: Server error
```

---

## Testing APIs

- **Always test with curl or Postman before trusting**
- **Test error cases:** missing fields, invalid IDs, no auth
- **Test happy path:** valid request, expected response
- **Log API calls:** track usage and errors
