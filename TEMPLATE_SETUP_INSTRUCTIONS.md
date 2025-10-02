# Template Setup Instructions

## Quick Setup (First Time Only)

### Step 1: Add Your Template Files
1. Copy your DOCX template files to: `CPQ/backend-templates/`
2. Name them exactly as:
   - `slack-to-teams-basic.docx` (for Basic plan)
   - `slack-to-teams-advanced.docx` (for Advanced plan)

### Step 2: Start the Server
```bash
cd CPQ
node server.cjs
```

The server will automatically:
- ✅ Connect to MongoDB
- ✅ Upload your templates to the database
- ✅ Make them available to all users
- ✅ Set up automatic template selection

### Step 3: Verify Templates
1. Open the app in browser
2. Go to Templates tab
3. You should see:
   - "SLACK TO TEAMS Basic" (marked as Default)
   - "SLACK TO TEAMS Advanced"

## How Automatic Selection Works

### User Flow:
1. **Configure Session**: 
   - Migration Type: Messaging
   - Combination: SLACK TO TEAMS
   - Calculate Pricing
2. **Choose Plan**:
   - Select **Basic** → Automatically selects "SLACK TO TEAMS Basic" template
   - Select **Advanced** → Automatically selects "SLACK TO TEAMS Advanced" template
3. **Quote Session**: 
   - Generate Agreement uses the correct template automatically

### Template Structure:
```
CPQ/backend-templates/
├── slack-to-teams-basic.docx      (Basic plan template)
└── slack-to-teams-advanced.docx   (Advanced plan template)
```

## Benefits:
- ✅ **No Manual Upload**: Templates are pre-loaded
- ✅ **Automatic Selection**: Right template for right plan
- ✅ **Fast Workflow**: Users don't waste time uploading
- ✅ **Consistent Results**: Everyone uses standardized templates

## Troubleshooting:
- If templates don't appear: Check that DOCX files are in `backend-templates/` folder
- If auto-selection doesn't work: Check browser console for template matching logs
- If upload fails: Check MongoDB connection and file permissions
