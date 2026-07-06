# Upload Exhibit Logic Flow

## Frontend Flow (ExhibitManager.tsx)

### Step 1: User Input Form
User fills in:
- **File**: .docx document
- **Category**: messaging, content, email (dropdown)
- **Combination**: sharefile-to-google-sharedrive, dropbox-to-onedrive, etc.
- **Plan Type**: basic, standard, advanced (required)
- **Include Type**: included OR notincluded (required - dropdown)
- **Display Order**: numeric position in list
- **Keywords**: tags for searching
- **Required**: checkbox (if should always be selected)

### Step 2: Name Generation
```
If user provides name → use it
Else if combination exists → auto-generate from combination
Else → use "New Exhibit"

Final format:
  "{Combination} {PlanType} Plan - {PlanType} {IncludeType}"
  
Example: "ShareFile to Google Shared Drive Standard Plan - Standard Include"
```

### Step 3: Form Data Preparation
Creates FormData object with:
```javascript
{
  file: <binary DOCX data>,
  name: "ShareFile to Google Shared Drive Standard Plan - Standard Include",
  description: "",
  category: "content",
  combinations: ["sharefile-to-google-sharedrive", "all"],
  planType: "standard",
  includeType: "included",
  displayOrder: 1,
  keywords: ["sharefile", "google", "standard", "included"],
  isRequired: false
}
```

### Step 4: POST to Backend
```
POST /api/exhibits
Headers: Auth headers (JWT token)
Body: FormData (multipart/form-data with file)
```

---

## Backend Flow (server.cjs)

### Step 1: Authentication Check
```
✓ Verify auth user can upload exhibits
✓ Only exhibit admins can upload
```

### Step 2: File Validation
```
✓ Check file exists
✓ Validate MIME type (must be .docx)
  - Allowed: 
    - application/vnd.openxmlformats-officedocument.wordprocessingml.document
    - application/msword
✓ Validate by extension (.docx)
```

### Step 3: Metadata Extraction & Validation
```
✓ Parse category (required)
✓ Parse combinations (required) - convert string to array
✓ Parse planType (required) - must be: basic, standard, advanced
✓ Parse includeType - must be: included or notincluded
✓ Parse keywords - convert string to array
✓ Parse displayOrder - convert to integer
✓ Parse isRequired - convert to boolean
```

### Step 4: Name Generation (Backend Fallback)
```
If name not provided by frontend:
  Split combination by '-'
  Capitalize each word
  Join with space
  
Example: "slack-to-teams" → "Slack Teams"
```

### Step 5: File Encoding
```
Convert file buffer to Base64 (for MongoDB storage)
```

### Step 6: Duplicate Check
```
Check if file already exists in MongoDB:
  SELECT * FROM exhibits WHERE fileName = "{filename}"
  
If exists:
  Return 409 Conflict error
  
If file exists in /backend-exhibits/ but not in DB:
  Log warning but allow (will overwrite)
```

### Step 7: Create Exhibit Document
```javascript
exhibitDoc = {
  name: "ShareFile to Google Shared Drive Standard Plan - Standard Include",
  description: "",
  fileName: "exhibit-sharefile-google.docx",
  fileData: <base64 encoded binary>,
  fileType: "application/vnd.openxmlformats...",
  fileSize: 15360,
  combinations: ["sharefile-to-google-sharedrive", "all"],
  category: "content",
  planType: "standard",
  includeType: "included",
  displayOrder: 1,
  keywords: ["sharefile", "google", "standard", "included"],
  isRequired: false,
  createdAt: 2026-06-05T10:30:00Z,
  updatedAt: 2026-06-05T10:30:00Z,
  version: 1
}
```

### Step 8: Save to MongoDB
```
INSERT INTO exhibits (exhibitDoc)
```

### Step 9: Save to Filesystem (Optional)
```
Create /backend-exhibits/ directory if doesn't exist
Write file to: /backend-exhibits/{original_filename}

⚠️ Non-critical: If save fails, document is still in MongoDB
```

### Step 10: Return Response
```json
{
  success: true,
  exhibitId: "507f1f77bcf86cd799439011",
  message: "Exhibit uploaded successfully"
}
```

---

## Key Validation Rules

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| File | Binary | Yes | Must be .docx, max ~50MB |
| Category | String | Yes | Values: messaging, content, email |
| Combination | String/Array | Yes | Must match predefined combinations |
| Plan Type | String | Yes | Values: basic, standard, advanced (case-insensitive) |
| Include Type | String | Yes | Values: included, notincluded |
| Display Order | Number | No | Default: 999 |
| Keywords | Array | No | For search |
| Is Required | Boolean | No | Default: false |

---

## Error Handling

| Scenario | HTTP Status | Error Message |
|----------|------------|---------------|
| No auth | 401 | Unauthorized |
| No file | 400 | No file uploaded |
| Wrong file type | 400 | Invalid file type. Only DOCX files are allowed. |
| Missing category | 400 | Missing required field: category |
| Invalid planType | 400 | Invalid plan type. Must be Basic, Standard, or Advanced. |
| File already exists | 409 | Exhibit with this filename already exists |
| DB unavailable | 503 | Database not available |
| FS write failed | 200 | Saved to MongoDB but logs warning (non-critical) |

---

## Data Flow Diagram

```
┌─────────────────────────┐
│   User Upload Form      │
│  (ExhibitManager.tsx)   │
└──────────────┬──────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Name Generation     │
    │  (if not provided)   │
    └──────────────┬───────┘
                   │
                   ▼
    ┌──────────────────────┐
    │  FormData Creation   │
    │  (file + metadata)   │
    └──────────────┬───────┘
                   │
         POST /api/exhibits
                   │
                   ▼
    ┌──────────────────────────┐
    │ Backend (server.cjs)     │
    │ - Auth check             │
    │ - File validation        │
    │ - Metadata parsing       │
    │ - Duplicate check        │
    │ - Base64 encoding        │
    │ - MongoDB insert         │
    │ - Filesystem save        │
    └──────────────┬───────────┘
                   │
         ┌─────────┴────────┐
         │                  │
         ▼                  ▼
    MongoDB           /backend-exhibits/
    Collection        (filesystem)
    'exhibits'
```

---

## Example Request/Response

### Request
```bash
POST /api/exhibits HTTP/1.1
Content-Type: multipart/form-data
Authorization: Bearer {jwt_token}

--boundary
Content-Disposition: form-data; name="file"; filename="exhibit.docx"
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document

<binary DOCX data>
--boundary
Content-Disposition: form-data; name="name"

ShareFile to Google Shared Drive Standard Plan - Standard Include
--boundary
Content-Disposition: form-data; name="category"

content
--boundary
Content-Disposition: form-data; name="combinations"

["sharefile-to-google-sharedrive","all"]
--boundary
Content-Disposition: form-data; name="planType"

standard
--boundary
Content-Disposition: form-data; name="includeType"

included
--boundary
Content-Disposition: form-data; name="displayOrder"

1
--boundary
Content-Disposition: form-data; name="keywords"

["sharefile","google","standard","included"]
--boundary
```

### Success Response (200)
```json
{
  "success": true,
  "exhibitId": "507f1f77bcf86cd799439011",
  "exhibit": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "ShareFile to Google Shared Drive Standard Plan - Standard Include",
    "fileName": "exhibit.docx",
    "fileSize": 15360,
    "category": "content",
    "combinations": ["sharefile-to-google-sharedrive", "all"],
    "planType": "standard",
    "includeType": "included",
    "displayOrder": 1,
    "createdAt": "2026-06-05T10:30:00.000Z"
  }
}
```

### Error Response (409 - Conflict)
```json
{
  "success": false,
  "error": "Exhibit with this filename already exists",
  "existingId": "507f1f77bcf86cd799439010"
}
```

---

## Flow in Exhibit Selector

After upload, the exhibit appears in the selector:

1. **Fetch**: `GET /api/exhibits?combination=sharefile-to-google-sharedrive`
2. **Filter**: Returns all exhibits matching that combination
3. **Group**: Exhibit grouped under "ShareFile to Google Shared Drive"
4. **Display**: Shows as selectable checkbox in UI
5. **Use**: When user generates agreement, selected exhibits are included

---

## Security Considerations

✓ **Auth Required**: Only exhibit admins can upload  
✓ **File Type Validation**: Only .docx files allowed  
✓ **Filename Check**: Prevents overwriting existing exhibits  
✓ **File Permissions**: Validates write access to /backend-exhibits/  
✓ **Data Sanitization**: Metadata parsed and validated  
✓ **Error Handling**: Non-critical FS errors don't fail upload
