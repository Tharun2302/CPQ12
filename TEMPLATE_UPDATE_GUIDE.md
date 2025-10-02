# 🔧 Template Update Guide

Since you've successfully updated your `slack-to-teams-advanced.docx` template with tokens and they're working, here's how to ensure all changes are properly reflected:

## ✅ Current Status
- ✅ Tokens are working in your template (`{{users_cost}}`, `{{instance_cost}}`, `{{Duration_of_months}}`)
- ✅ Template shows real data (e.g., "$32per User | $1000 per Additional Month")
- ✅ Changes visible in generated documents

## 🎯 Solutions to Complete the Update

### Option 1: Upload Updated Template via UI (Recommended)

1. **Go to Template Session** in your application
2. **Upload New Template**:
   - Click "Upload Template" or "Add Template"
   - Select your updated `slack-to-teams-advanced.docx` file
   - Name it "SLACK TO TEAMS Advanced" (exact name)
   - Set Plan Type to "Advanced"
   - Mark as default if needed
3. **Delete Old Template** (if exists)
4. **Test**: Go to Quote session, select Advanced plan, generate agreement

### Option 2: Replace File in Backend Templates

1. **Backup Current File**:
   ```bash
   copy CPQ\backend-templates\slack-to-teams-advanced.docx CPQ\backend-templates\slack-to-teams-advanced-backup.docx
   ```

2. **Replace with Updated File**:
   - Copy your updated DOCX file to `CPQ\backend-templates\slack-to-teams-advanced.docx`
   - Ensure it overwrites the existing file

3. **Restart Server**:
   ```bash
   # Stop current server (Ctrl+C)
   node server.cjs
   ```

### Option 3: Manual Database Update (If MongoDB Available)

If MongoDB is running:

1. **Start MongoDB** (if not running)
2. **Run Update Script**:
   ```bash
   node update-advanced-template.cjs
   ```
3. **Restart Server**

### Option 4: Browser Console Update (Quick Fix)

1. **Open Browser Console** (F12 → Console)
2. **Load the update script**:
   ```javascript
   // Copy the content from update-template-localStorage.js and paste in console
   ```
3. **Run the update function**
4. **Refresh the page**

## 🔍 Verification Steps

After updating, verify the changes:

### 1. Check Template List
- Go to Template session
- Verify "SLACK TO TEAMS Advanced" appears
- Check the file size/date matches your updated file

### 2. Test Token Replacement
- Go to Configure session
- Fill in test data:
  - Users: 25
  - Instance Type: Standard  
  - Duration: 6 months
- Go to Quote session
- Select "Advanced" plan
- Generate Agreement
- Verify tokens show actual values:
  - `{{users_cost}}` → actual cost (e.g., "$32")
  - `{{instance_cost}}` → actual cost (e.g., "$1000") 
  - `{{Duration_of_months}}` → actual duration (e.g., "6")

### 3. Check Console Logs
Look for these debug messages:
```
🎯 USER TEMPLATE SPECIFIC TOKENS:
  {{users_cost}}: $150.00
  {{instance_cost}}: $200.00
  {{Duration_of_months}}: 6
```

## 🐛 Troubleshooting

### Issue: Tokens Still Not Working
**Solution**: Clear browser cache and localStorage:
```javascript
// In browser console:
localStorage.removeItem('cpq_templates');
location.reload();
```

### Issue: Old Template Still Loading
**Solution**: 
1. Check if multiple templates with same name exist
2. Delete duplicates via Template Manager
3. Clear localStorage and re-upload

### Issue: Template Not Auto-Selected
**Solution**:
1. Verify template has `planType: 'advanced'`
2. Check template name is exactly "SLACK TO TEAMS Advanced"
3. Restart server to reload templates

## 📋 Template Token Reference

Your template should use these exact tokens for best compatibility:

### Working Tokens (Confirmed):
- `{{users_cost}}` - User cost amount
- `{{instance_cost}}` - Instance cost amount  
- `{{Duration_of_months}}` - Duration in months
- `{{Company_Name}}` - Company name

### Additional Available Tokens:
- `{{users_count}}` - Number of users
- `{{total_price}}` - Total cost
- `{{discount}}` - Discount percentage
- `{{effective_date}}` - Effective date
- `{{clientName}}` - Client name
- `{{client_email}}` - Client email

## 🎉 Success Indicators

You'll know the update is successful when:
- ✅ Advanced plan auto-selects your template
- ✅ Tokens show real data (not placeholder text)
- ✅ Generated document has proper formatting
- ✅ All pages of the document show updated content

## 🚀 Next Steps

1. **Choose your preferred update method** (Option 1 recommended)
2. **Follow the verification steps**
3. **Test with different configurations**
4. **Deploy to production** when satisfied

## 📞 If You Need Help

If issues persist:
1. Share console log output (F12 → Console)
2. Confirm which update method you used
3. Check if template appears in Template Manager
4. Verify file size and modification date

The tokens are working correctly based on your screenshots, so this is just about ensuring the updated template file is properly loaded by the application!
