# 🧪 Quick Testing Guide: DROPBOX TO SHAREPOINT

## ✅ Implementation Status
All code changes have been completed successfully!

---

## 🚀 Step 1: Start the Server

```bash
cd CPQ12
node server.cjs
```

**Expected Console Output:**
```
✅ MongoDB connection successful
✅ Uploaded template: DROPBOX TO SHAREPOINT Standard
✅ Uploaded template: DROPBOX TO SHAREPOINT Advanced
🎉 Template seeding completed! Uploaded 2 templates
📊 Total templates: 4 Messaging + 8 Content (12 templates total)
   - Messaging: SLACK TO TEAMS, SLACK TO GOOGLE CHAT (Basic, Advanced)
   - Content: DROPBOX TO MYDRIVE, DROPBOX TO SHAREDRIVE (Basic, Standard, Advanced)
   - Content: DROPBOX TO SHAREPOINT (Standard, Advanced only)
```

---

## 🧪 Step 2: Test in UI

### **A. Verify Dropdown Shows New Option**
1. Open http://localhost:5173 (or your frontend URL)
2. Navigate to Configuration
3. Select **Migration Type: Content**
4. Check **Combination dropdown** shows:
   - ✅ DROPBOX TO MYDRIVE
   - ✅ DROPBOX TO SHAREDRIVE
   - ✅ **DROPBOX TO SHAREPOINT** ⭐ (NEW!)

### **B. Configure Project with SharePoint**
1. Select **DROPBOX TO SHAREPOINT**
2. Fill in configuration:
   - Number of Users: `100`
   - Data Size (GB): `500`
   - Duration (months): `6`
   - Number of Instances: `2`
   - Instance Type: `Standard`
3. Click **"Calculate Pricing"**

### **C. Verify Pricing Displays 3 Plans**
After calculation, you should see:
- ✅ **Basic** - $X,XXX.XX
- ✅ **Standard** - $X,XXX.XX
- ✅ **Advanced** - $X,XXX.XX

### **D. Test Template Auto-Selection**

#### **Test Standard Plan:**
1. Click **"Select Standard"**
2. Navigate to **Quote** tab
3. Verify template section shows:
   - ✅ Template selected: **"DROPBOX TO SHAREPOINT Standard"**
   - ✅ Green checkmark with "Template Active"

#### **Test Advanced Plan:**
1. Go back to Pricing
2. Click **"Select Advanced"**
3. Navigate to **Quote** tab
4. Verify template section shows:
   - ✅ Template selected: **"DROPBOX TO SHAREPOINT Advanced"**
   - ✅ Green checkmark with "Template Active"

### **E. Generate Agreement**
1. In Quote tab, fill in contact information:
   - Contact Name: `John Doe`
   - Email: `john.doe@example.com`
   - Legal Entity Name: `Example Corp`
   - Project Start Date: Select a date
   - Effective Date: Select a date
2. Click **"Preview Agreement"**
3. Verify document generates successfully
4. Check document content uses SharePoint template

---

## 🔍 Verify Database (Optional)

If you want to verify templates are in MongoDB:

```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017

# Switch to your database
use cpq_database

# Check templates
db.templates.find({ combination: 'dropbox-to-sharepoint' }).pretty()
```

**Expected Output:**
```json
{
  "_id": ObjectId("..."),
  "name": "DROPBOX TO SHAREPOINT Standard",
  "combination": "dropbox-to-sharepoint",
  "planType": "standard",
  "category": "content",
  "fileName": "dropbox-to-sharepoint-standard.docx",
  "fileSize": 12345,
  "fileData": "base64string...",
  "status": "active"
}
{
  "_id": ObjectId("..."),
  "name": "DROPBOX TO SHAREPOINT Advanced",
  "combination": "dropbox-to-sharepoint",
  "planType": "advanced",
  "category": "content",
  "fileName": "dropbox-to-sharepoint-advanced.docx",
  "fileSize": 12345,
  "fileData": "base64string...",
  "status": "active"
}
```

---

## 🐛 Troubleshooting

### **Problem: Combination not showing in dropdown**
- ✅ Check that you selected "Content" migration type (not "Messaging")
- ✅ Clear browser cache and reload
- ✅ Check browser console for errors (F12)

### **Problem: Template not auto-selecting**
- ✅ Check MongoDB connection is successful
- ✅ Verify templates were seeded (check server console)
- ✅ Check browser console for template matching logs
- ✅ Look for console logs like "🔍 Auto-selecting template for:"

### **Problem: Templates not in database**
- ✅ Verify template files exist in `backend-templates/` folder:
  - `dropbox-to-sharepoint-standard.docx`
  - `dropbox-to-sharepoint-advanced.docx`
- ✅ Restart server to trigger seeding
- ✅ Check for file read errors in server console

### **Problem: Document generation fails**
- ✅ Verify template file is valid DOCX format
- ✅ Check template contains proper placeholders
- ✅ Review server console for document generation errors
- ✅ Verify LibreOffice is installed (for PDF conversion)

---

## ✅ Success Checklist

Use this checklist to verify everything works:

- [ ] Server starts without errors
- [ ] Console shows "Uploaded template: DROPBOX TO SHAREPOINT Standard"
- [ ] Console shows "Uploaded template: DROPBOX TO SHAREPOINT Advanced"
- [ ] Dropdown shows DROPBOX TO SHAREPOINT option
- [ ] Can configure project with SharePoint combination
- [ ] Pricing displays 3 plans (Basic, Standard, Advanced)
- [ ] Selecting Standard plan auto-selects Standard template
- [ ] Selecting Advanced plan auto-selects Advanced template
- [ ] Template shows as "Active" in Quote tab
- [ ] Preview Agreement generates document successfully
- [ ] Document contains correct combination information

---

## 📊 Complete Feature Matrix

| Migration Type | Combination | Basic | Standard | Advanced |
|---------------|-------------|-------|----------|----------|
| Messaging | SLACK TO TEAMS | ✅ | ❌ | ✅ |
| Messaging | SLACK TO GOOGLE CHAT | ✅ | ❌ | ✅ |
| Content | DROPBOX TO MYDRIVE | ✅ | ✅ | ✅ |
| Content | DROPBOX TO SHAREDRIVE | ✅ | ✅ | ✅ |
| Content | **DROPBOX TO SHAREPOINT** ⭐ | ⏳ | ✅ | ✅ |

**Legend:**
- ✅ Template available and auto-selects
- ⏳ Template not yet created (future)
- ❌ Plan not available for this combination

---

## 🎉 All Done!

If all tests pass, the DROPBOX TO SHAREPOINT combination is fully functional and ready for production use!

**Need Help?**
- Check `DROPBOX_TO_SHAREPOINT_IMPLEMENTATION.md` for detailed technical documentation
- Review browser console logs for debugging info
- Check server console for backend errors

