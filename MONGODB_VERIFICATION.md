# MongoDB Documents Verification Guide

This guide helps you verify that PDFs are being saved to MongoDB correctly.

## 📋 Prerequisites

1. MongoDB must be running (local or Atlas)
2. `.env` file must be configured with MongoDB connection details
3. Node.js must be installed

## 🔧 Setup

If you don't have a `.env` file, create one:

```bash
# Copy the template
cp env-template.txt .env

# Edit .env and set your MongoDB connection
MONGODB_URI=mongodb://localhost:27017
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/

DB_NAME=cpq_database
```

## 🧪 Verification Steps

### Step 1: Test MongoDB Connection & Save

Run this script to test if you can save documents to MongoDB:

```bash
node test-mongodb-save.cjs
```

**What it does:**
- Connects to MongoDB
- Creates a test PDF document
- Saves it to the `documents` collection
- Verifies it was saved correctly
- Shows total document count

**Expected output:**
```
✅ Connected to MongoDB successfully!
✅ Test document saved successfully!
✅ Verification: Document retrieved successfully!
📊 Total documents in collection: 1
✅ MongoDB save test PASSED!
```

### Step 2: Check All Documents

Run this script to see all PDFs in MongoDB:

```bash
node check-mongodb-documents.cjs
```

**What it does:**
- Connects to MongoDB
- Lists all collections
- Shows all documents in `documents` collection
- Displays detailed information for each PDF

**Expected output:**
```
✅ Connected to MongoDB successfully!
✅ "documents" collection exists!
📊 Total documents in collection: 3

📄 Document 1:
   ID: doc_1704636000000_abc123
   File Name: Contact_Company_Inc_2025-01-07.pdf
   Company: Contact Company Inc.
   Client Name: John Smith
   ...
```

### Step 3: Test from Application

1. **Start your server:**
   ```bash
   node server.cjs
   ```

2. **Open your application in browser:**
   ```
   http://localhost:3001
   ```

3. **Generate a PDF:**
   - Go to Configure session
   - Fill in all details
   - Select a plan
   - Go to Quote session
   - Click "Preview Agreement"
   - Click the green "PDF" button

4. **Verify save:**
   - Look for green notification: "PDF saved to MongoDB!"
   - Check browser console for: "✅ PDF saved to MongoDB successfully"
   - Go to Documents tab to see the saved PDF

5. **Run verification script:**
   ```bash
   node check-mongodb-documents.cjs
   ```

## 🔍 Troubleshooting

### Issue: "Error connecting to MongoDB"

**Solution:**
1. Check if MongoDB is running:
   ```bash
   # For local MongoDB
   mongosh
   
   # For MongoDB Atlas
   # Check your connection string in .env
   ```

2. Verify `.env` file has correct `MONGODB_URI`

3. If using MongoDB Atlas:
   - Check network access (whitelist your IP)
   - Verify username/password
   - Check connection string format

### Issue: "documents collection does NOT exist"

**Solution:**
This is normal if no PDFs have been saved yet.

1. Run the test script first:
   ```bash
   node test-mongodb-save.cjs
   ```

2. Or generate a PDF from the application

### Issue: "No documents found in the collection"

**Solution:**
The collection exists but is empty.

1. Make sure your server is running: `node server.cjs`
2. Generate a PDF from the application
3. Check browser console for errors
4. Check server console for "✅ PDF document saved to MongoDB"

### Issue: PDF not saving from application

**Solution:**

1. **Check browser console:**
   - Look for errors
   - Should see: "💾 Saving PDF to MongoDB..."
   - Should see: "✅ PDF saved to MongoDB successfully"

2. **Check server console:**
   - Should see: "✅ PDF document saved to MongoDB: doc_..."
   - Look for any error messages

3. **Check network tab:**
   - Look for POST request to `/api/documents`
   - Should return `{ success: true, documentId: "..." }`

4. **Verify API endpoint:**
   ```bash
   # Test the API directly
   curl http://localhost:3001/api/documents
   ```

## 📊 MongoDB Commands

If you want to check MongoDB directly:

```bash
# Connect to MongoDB
mongosh "your-connection-string"

# Switch to database
use cpq_database

# View all documents
db.documents.find().pretty()

# Count documents
db.documents.countDocuments()

# View latest document
db.documents.find().sort({generatedDate: -1}).limit(1).pretty()

# Delete test documents
db.documents.deleteMany({ clientName: "Test Client" })

# Delete all documents (careful!)
db.documents.deleteMany({})
```

## 🎯 Expected Workflow

1. ✅ MongoDB is running
2. ✅ Server is running (`node server.cjs`)
3. ✅ User generates PDF in application
4. ✅ PDF button clicked
5. ✅ Green notification appears
6. ✅ PDF saved to MongoDB
7. ✅ Documents tab shows the PDF
8. ✅ Verification script confirms it's in MongoDB

## 📝 Notes

- PDFs are stored as base64 strings in MongoDB
- Each document includes metadata (client info, pricing, etc.)
- Documents are sorted by generation date (newest first)
- File sizes are typically 50KB - 500KB per PDF
- MongoDB has no practical limit on document count

## 🆘 Still Having Issues?

1. Check server logs for errors
2. Check browser console for errors
3. Verify MongoDB connection string
4. Test with the provided test scripts
5. Check MongoDB Atlas network access (if using Atlas)

## ✅ Success Indicators

You'll know it's working when:
- ✅ Test script shows "MongoDB save test PASSED!"
- ✅ Check script shows documents with details
- ✅ Application shows green "PDF saved to MongoDB!" notification
- ✅ Documents tab displays saved PDFs
- ✅ You can view/download PDFs from Documents tab
