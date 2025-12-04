# 🔄 Server Restart Required - EGNYTE TO MICROSOFT Templates

## ⚠️ Issue
The **EGNYTE TO MICROSOFT** templates are in the backend folder but **NOT in the database yet**.
The combination shows in the UI, but no templates are available for selection.

## ✅ Solution: Restart the Backend Server

### **Step 1: Stop the Current Server**

1. Go to **Terminal 3** (the one running `node server.cjs`)
2. Press **`Ctrl + C`** to stop the server
3. Wait for the process to stop

### **Step 2: Restart the Server**

```bash
node server.cjs
```

### **Step 3: Watch for Success Messages**

Look for these lines in the console output:

```
✅ Uploaded template: EGNYTE TO MICROSOFT Standard
   File: egnyte-to-microsoft-standard.docx (171KB)
   Plan: standard | Combination: egnyte-to-microsoft

✅ Uploaded template: EGNYTE TO MICROSOFT Advanced
   File: egnyte-to-microsoft-advanced.docx (171KB)
   Plan: advanced | Combination: egnyte-to-microsoft

🎉 Template seeding completed! Uploaded 2 templates
```

### **Step 4: Test in the UI**

1. **Refresh the browser** (F5 or Ctrl+F5)
2. Go to **Configure** tab
3. Select **"Content"** migration type
4. Select **"EGNYTE TO MICROSOFT (ONEDRIVE/SHAREPOINT)"**
5. Fill in configuration and calculate pricing
6. Select **Standard** or **Advanced** plan
7. **Templates should now auto-select!** ✅

---

## 🔍 What Happens When Server Restarts

The server automatically runs the `seed-templates.cjs` script on startup:
- It reads all template files from `backend-templates/` folder
- It checks which templates are already in MongoDB
- It uploads **only NEW templates** (skip existing ones)
- Your new **EGNYTE TO MICROSOFT** templates will be uploaded

---

## ✅ Expected Output

After restart, you should see:

```
🌱 Starting template seeding process...
⚡ Performance mode: Metadata-only seeding for speed
⏭️ Template already exists: SLACK TO TEAMS Basic
⏭️ Template already exists: SLACK TO TEAMS Advanced
... (skipping existing templates) ...
✅ Uploaded template: EGNYTE TO MICROSOFT Standard    ← NEW!
   File: egnyte-to-microsoft-standard.docx (171KB)
   Plan: standard | Combination: egnyte-to-microsoft
✅ Uploaded template: EGNYTE TO MICROSOFT Advanced     ← NEW!
   File: egnyte-to-microsoft-advanced.docx (171KB)
   Plan: advanced | Combination: egnyte-to-microsoft
🎉 Template seeding completed! Uploaded 2 templates
```

---

## 📊 Verification

After server restart and browser refresh:

1. **Check "No Template Selected" message is gone**
2. **Select Standard plan** → Template should auto-select
3. **Select Advanced plan** → Template should auto-select
4. **Both templates** should now appear in the Templates tab

---

## 🚨 Important Notes

- The frontend (Vite dev server) does NOT need to restart
- Only the backend server needs restart
- Templates are stored in MongoDB, so they only need to be seeded ONCE
- After seeding, future server restarts will skip them (already exist)

---

## ✅ Summary

**Action Required:** Restart backend server in Terminal 3
**Command:** `node server.cjs` (after stopping with Ctrl+C)
**Result:** New EGNYTE TO MICROSOFT templates will be seeded to MongoDB
**Verify:** Templates will auto-select when choosing plans

🚀 **Ready to restart!**

