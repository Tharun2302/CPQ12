# 🚀 Render Deployment Guide for CPQ Pro

## 📋 Overview
This guide will help you deploy your CPQ Pro backend to Render with or without a database.

## 🎯 Option 1: Deploy Without Database (Quick Start)

### Step 1: Create Web Service
1. Go to [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository: `Tharun2302/CPQ`

### Step 2: Configure Settings
```
Name: cpq-backend
Build Command: npm install && npm run build
Start Command: node server.cjs
```

### Step 3: Set Environment Variables
```
HUBSPOT_API_KEY=pat-na1-635cc313-80cb-4701-810a-a0492691b28d
PORT=10000
VITE_MSAL_CLIENT_ID=your-microsoft-client-id-here
```

### Step 4: Deploy
- Click "Create Web Service"
- Wait for deployment (2-3 minutes)
- Copy the URL: `https://your-app-name.onrender.com`

**✅ Features Available:**
- HubSpot Integration
- Email Sending
- PDF Generation
- Health Check API

**⚠️ Features Limited:**
- Digital Signature Forms
- Signature Tracking
- Form Analytics

## 🎯 Option 2: Deploy With Database (Full Features)

### Step 1: Create PostgreSQL Database
1. In Render dashboard, click "New +" → "PostgreSQL"
2. Give it a name: `cpq-database`
3. Click "Create Database"
4. Copy the connection details

### Step 2: Create Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository: `Tharun2302/CPQ`

### Step 3: Configure Settings
```
Name: cpq-backend
Build Command: npm install && npm run build
Start Command: node server.cjs
```

### Step 4: Set Environment Variables
```
HUBSPOT_API_KEY=pat-na1-635cc313-80cb-4701-810a-a0492691b28d
PORT=10000
VITE_MSAL_CLIENT_ID=your-microsoft-client-id-here
DB_HOST=your-postgres-host.onrender.com
DB_USER=your-postgres-user
DB_PASSWORD=your-postgres-password
DB_NAME=your-postgres-database
DB_PORT=5432
```

### Step 5: Deploy
- Click "Create Web Service"
- Wait for deployment
- Copy the URL

**✅ All Features Available:**
- HubSpot Integration
- Email Sending
- PDF Generation
- Digital Signature Forms
- Signature Tracking
- Form Analytics
- Database Storage

## 🧪 Testing Your Deployment

### Test Health Check
```bash
curl https://your-app-name.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "Server is running",
  "databaseAvailable": true/false,
  "features": {
    "hubspot": true,
    "email": true,
    "pdf": true,
    "database": true/false
  }
}
```

### Test HubSpot Integration
```bash
curl https://your-app-name.onrender.com/api/hubspot/test
```

### Test Database (if configured)
```bash
curl https://your-app-name.onrender.com/api/signature/debug
```

## 🔧 Troubleshooting

### Database Connection Issues
**Error:** "Error initializing database"
**Solution:** 
1. Check environment variables are set correctly
2. Ensure PostgreSQL service is running
3. Verify connection details

### HubSpot API Issues
**Error:** "401 Unauthorized"
**Solution:**
1. Check `HUBSPOT_API_KEY` is set correctly
2. Verify API key is valid and not expired
3. Ensure HubSpot account has proper permissions

### Build Failures
**Error:** "Build failed"
**Solution:**
1. Check `package.json` exists in root
2. Verify all dependencies are listed
3. Check build logs for specific errors

### Port Issues
**Error:** "Port already in use"
**Solution:**
1. Set `PORT=10000` in environment variables
2. Render will automatically assign a port

## 📊 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `HUBSPOT_API_KEY` | Yes | HubSpot API key | `pat-na1-...` |
| `VITE_MSAL_CLIENT_ID` | Yes | Microsoft authentication client ID | `e71e69a8-07fd-4110-8d77-9e4326027969` |
| `PORT` | No | Server port | `10000` |
| `DB_HOST` | No* | Database host | `host.onrender.com` |
| `DB_USER` | No* | Database user | `user` |
| `DB_PASSWORD` | No* | Database password | `password` |
| `DB_NAME` | No* | Database name | `database` |
| `DB_PORT` | No* | Database port | `5432` |

*Required only if using database features

## 🎉 Success Indicators

✅ **Health Check:** Returns `{"status": "ok"}`  
✅ **HubSpot Test:** Returns `{"success": true}`  
✅ **Database Debug:** Returns database info (if configured)  
✅ **No Build Errors:** Deployment completes successfully  

## 📞 Support

If you encounter issues:
1. Check Render logs for specific error messages
2. Verify environment variables are set correctly
3. Test endpoints individually
4. Check database connection (if using database)

Your CPQ Pro backend should now be fully functional on Render! 🚀
