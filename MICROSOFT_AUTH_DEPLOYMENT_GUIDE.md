# 🚀 Microsoft Authentication Setup for Production Deployment

## 📋 Overview
This guide will help you set up Microsoft authentication for your CPQ application when deploying to production (Render, Vercel, Netlify, etc.).

## 🎯 Step 1: Create Azure App Registration

### 1.1 Go to Azure Portal
1. Visit [Azure Portal](https://portal.azure.com)
2. Sign in with your Microsoft account
3. Navigate to "Azure Active Directory" → "App registrations"

### 1.2 Create New Registration
1. Click "New registration"
2. Fill in the details:
   - **Name**: `CloudFuze CPQ Production`
   - **Supported account types**: `Accounts in any organizational directory and personal Microsoft accounts`
   - **Redirect URI**: 
     - Platform: `Single-page application (SPA)`
     - URI: `https://your-app-name.onrender.com/auth/microsoft/callback`
3. Click "Register"

### 1.3 Get Your Client ID
1. Copy the **Application (client) ID** from the Overview page
2. Save this ID - you'll need it for environment variables

## 🎯 Step 2: Configure Redirect URIs

### 2.1 Add Production URIs
1. In your App Registration, go to "Authentication"
2. Under "Single-page application", add these redirect URIs:
   - `https://your-app-name.onrender.com/auth/microsoft/callback`
   - `https://your-app-name.onrender.com` (for fallback)
3. Under "Implicit grant and hybrid flows", enable:
   - ✅ Access tokens
   - ✅ ID tokens

### 2.2 Add Development URIs (Optional)
If you want to keep localhost working:
- `http://localhost:5173/auth/microsoft/callback`
- `http://localhost:3000/auth/microsoft/callback`

## 🎯 Step 3: Configure API Permissions

### 3.1 Add Microsoft Graph Permissions
1. Go to "API permissions"
2. Click "Add a permission"
3. Select "Microsoft Graph"
4. Choose "Delegated permissions"
5. Add these permissions:
   - `User.Read` (to read user profile)
   - `openid` (for OpenID Connect)
   - `profile` (for user profile)
   - `email` (for user email)

### 3.2 Grant Admin Consent (if needed)
- If you're in an organization, click "Grant admin consent"
- For personal accounts, this is usually automatic

## 🎯 Step 4: Set Environment Variables

### 4.1 For Render Deployment
In your Render dashboard, go to your web service and add these environment variables:

```bash
# Microsoft Authentication
VITE_MSAL_CLIENT_ID=your-actual-client-id-from-azure

# Other existing variables
HUBSPOT_API_KEY=pat-na1-635cc313-80cb-4701-810a-a0492691b28d
PORT=10000
```

### 4.2 For Local Development
Create a `.env.local` file in your project root:

```bash
# Microsoft Authentication
VITE_MSAL_CLIENT_ID=your-actual-client-id-from-azure

# Database (if using)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=cpq_database1
DB_PORT=3306
```

## 🎯 Step 5: Update Your Code (Already Done!)

Your code is already properly configured! Here's what's working:

### 5.1 AuthContext.tsx (Lines 151-253)
- Uses `VITE_MSAL_CLIENT_ID` environment variable
- Falls back to demo client ID if not set
- Handles popup authentication flow
- Creates proper user objects

### 5.2 MicrosoftCallback.tsx
- Handles OAuth callback from Microsoft
- Processes authorization codes
- Sends success/error messages back to parent window

### 5.3 msalConfig.ts
- Configured for both development and production
- Dynamic redirect URI based on current domain

## 🎯 Step 6: Test Your Deployment

### 6.1 Deploy to Render
1. Push your code to GitHub
2. Render will automatically deploy
3. Your app will be available at: `https://your-app-name.onrender.com`

### 6.2 Test Microsoft Authentication
1. Go to your deployed app
2. Click "Sign in with Microsoft"
3. You should see Microsoft login popup
4. After login, you should be redirected back to your app

## 🔧 Troubleshooting

### Common Issues:

#### 1. "Invalid redirect URI" Error
**Solution**: 
- Check that your redirect URI in Azure exactly matches your deployed URL
- Ensure you're using HTTPS for production
- Format: `https://your-app-name.onrender.com/auth/microsoft/callback`

#### 2. "Client ID not found" Error
**Solution**:
- Verify `VITE_MSAL_CLIENT_ID` is set in Render environment variables
- Check that the client ID matches your Azure App Registration

#### 3. Popup Blocked
**Solution**:
- Users need to allow popups for your domain
- Consider adding a fallback to redirect flow

#### 4. CORS Errors
**Solution**:
- Ensure redirect URI is properly configured in Azure
- Check that your domain is whitelisted

## 📊 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_MSAL_CLIENT_ID` | Yes | Azure App Registration Client ID | `e71e69a8-07fd-4110-8d77-9e4326027969` |
| `HUBSPOT_API_KEY` | Yes | HubSpot API key | `pat-na1-...` |
| `PORT` | No | Server port | `10000` |

## 🎉 Success Indicators

✅ **Azure App Registration**: Created with proper redirect URIs  
✅ **Environment Variables**: Set in Render dashboard  
✅ **Microsoft Login**: Opens popup and redirects correctly  
✅ **User Authentication**: Creates user account in your app  
✅ **Session Management**: User stays logged in across page refreshes  

## 🚀 Next Steps

1. **Create Azure App Registration** with your production domain
2. **Set environment variables** in Render
3. **Deploy your application**
4. **Test Microsoft authentication** on production
5. **Monitor logs** for any authentication issues

Your Microsoft authentication will work seamlessly in production! 🎯
