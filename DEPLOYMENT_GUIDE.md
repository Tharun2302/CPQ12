# 🚀 Deployment Guide for CPQ Pro

## 📋 Overview
Your CPQ Pro application has two parts:
- **Frontend**: React/Vite app (deploy to Netlify)
- **Backend**: Node.js server (deploy to Render)

## 🎯 Step 1: Deploy Backend to Render

### 1.1 Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with your GitHub account
3. Click "New +" → "Web Service"

### 1.2 Connect Repository
1. Connect your GitHub repository: `Tharun2302/CPQ`
2. Give it a name: `cpq-backend`
3. Select branch: `main`

### 1.3 Configure Build Settings
```
Build Command: npm install
Start Command: node server.cjs
```

### 1.4 Set Environment Variables
Click "Environment" tab and add:
```
HUBSPOT_API_KEY=pat-na1-635cc313-80cb-4701-810a-a0492691b28d
PORT=10000
DB_HOST=your-database-host
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=cpq_database
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 1.5 Deploy
1. Click "Create Web Service"
2. Wait for deployment (2-3 minutes)
3. Copy the URL: `https://your-app-name.onrender.com`

## 🎯 Step 2: Deploy Frontend to Netlify

### 2.1 Create Netlify Account
1. Go to [netlify.com](https://netlify.com)
2. Sign up with your GitHub account
3. Click "New site from Git"

### 2.2 Connect Repository
1. Connect your GitHub repository: `Tharun2302/CPQ`
2. Select branch: `main`

### 2.3 Configure Build Settings
```
Build command: npm run build
Publish directory: dist
Base directory: . (leave empty)
```

### 2.4 Set Environment Variables
Go to Site settings → Environment variables and add:
```
VITE_BACKEND_URL=https://your-app-name.onrender.com
```

### 2.5 Deploy
1. Click "Deploy site"
2. Wait for deployment (1-2 minutes)
3. Your site will be available at: `https://your-site-name.netlify.app`

## 🔧 Step 3: Update Database (Optional)

If you need a cloud database:

### Option A: Use Render's PostgreSQL
1. In Render dashboard, create "PostgreSQL" service
2. Copy connection details to environment variables
3. Update backend environment variables

### Option B: Use PlanetScale (MySQL)
1. Go to [planetscale.com](https://planetscale.com)
2. Create new database
3. Copy connection string to environment variables

## 🧪 Step 4: Test Deployment

### 4.1 Test Backend
```bash
curl https://your-app-name.onrender.com/api/health
```
Should return: `{"status":"ok","message":"Server is running"}`

### 4.2 Test Frontend
1. Open your Netlify URL
2. Go to HubSpot Integration
3. Click "Connect to HubSpot"
4. Should show real data instead of demo

## 🐛 Troubleshooting

### Backend Issues:
- **Build fails**: Check if `server.cjs` exists in root
- **Start fails**: Check environment variables
- **API errors**: Check HubSpot API key

### Frontend Issues:
- **Can't connect to backend**: Check `VITE_BACKEND_URL`
- **CORS errors**: Backend CORS is already configured
- **Build fails**: Check `package.json` scripts

### HubSpot Issues:
- **401 errors**: Check API key in Render environment variables
- **No data**: Check if HubSpot account has contacts/deals
- **Demo mode**: Backend not deployed or API key wrong

## 📞 Support

If you encounter issues:
1. Check Render logs for backend errors
2. Check Netlify logs for frontend errors
3. Verify environment variables are set correctly
4. Test backend URL directly in browser

## 🎉 Success Indicators

✅ **Backend**: Health check returns success  
✅ **Frontend**: Loads without errors  
✅ **HubSpot**: Shows real data instead of demo  
✅ **Email**: Can send emails (if configured)  
✅ **Database**: Can store/retrieve data (if configured)  

Your CPQ Pro application should now be fully functional in production! 🚀
