# 🔧 Fix Microsoft Authentication in Production

## 🚨 **The Problem**
Your Microsoft sign-in is not working in production because:
1. The fallback client ID `e71e69a8-07fd-4110-8d77-9e4326027969` is not configured for your production domain
2. The redirect URI `https://your-app-name.onrender.com/auth/microsoft/callback` is not whitelisted

## 🛠️ **Solution: Create Your Own Azure App Registration**

### **Step 1: Create Azure App Registration (5 minutes)**

1. **Go to Azure Portal**: https://portal.azure.com
2. **Navigate to**: Azure Active Directory → App registrations
3. **Click**: "New registration"
4. **Fill in**:
   - **Name**: `CloudFuze CPQ Production`
   - **Supported account types**: `Accounts in any organizational directory and personal Microsoft accounts`
   - **Redirect URI**: 
     - Platform: `Single-page application (SPA)`
     - URI: `https://YOUR-APP-NAME.onrender.com/auth/microsoft/callback`
5. **Click**: "Register"
6. **Copy the Application (client) ID**

### **Step 2: Configure Redirect URIs (2 minutes)**

1. **In your App Registration**, go to "Authentication"
2. **Under "Single-page application"**, add these redirect URIs:
   - `https://YOUR-APP-NAME.onrender.com/auth/microsoft/callback`
   - `https://YOUR-APP-NAME.onrender.com` (for fallback)
3. **Under "Implicit grant and hybrid flows"**, enable:
   - ✅ Access tokens
   - ✅ ID tokens

### **Step 3: Set Environment Variable in Render (1 minute)**

1. **Go to your Render dashboard**
2. **Navigate to your web service**
3. **Go to Environment tab**
4. **Add/Update**:
   ```
   VITE_MSAL_CLIENT_ID=your-new-client-id-from-azure
   ```
5. **Save and redeploy**

### **Step 4: Test (1 minute)**

1. **Go to your production URL**
2. **Click "Sign in with Microsoft"**
3. **Should work now!**

## 🚀 **Alternative: Quick Fix (If you don't want to create Azure app)**

If you want to keep using the fallback client ID, you need to:

1. **Contact the owner** of client ID `e71e69a8-07fd-4110-8d77-9e4326027969`
2. **Ask them to add** your production domain to their redirect URIs
3. **This is not recommended** for production

## 🔍 **Troubleshooting**

### **Error: "Invalid redirect URI"**
- Check that your redirect URI in Azure exactly matches your production URL
- Ensure you're using HTTPS
- Format: `https://your-app-name.onrender.com/auth/microsoft/callback`

### **Error: "Client ID not found"**
- Verify `VITE_MSAL_CLIENT_ID` is set in Render environment variables
- Check that the client ID matches your Azure App Registration

### **Error: "Popup blocked"**
- Users need to allow popups for your domain
- Consider adding a fallback to redirect flow

## 📊 **Environment Variables for Render**

Make sure these are set in your Render dashboard:

```bash
HUBSPOT_API_KEY=pat-na1-635cc313-80cb-4701-810a-a0492691b28d
PORT=10000
VITE_MSAL_CLIENT_ID=your-new-client-id-from-azure
```

## ✅ **Success Checklist**

- [ ] Azure App Registration created
- [ ] Redirect URIs configured for production domain
- [ ] Environment variable set in Render
- [ ] Application redeployed
- [ ] Microsoft sign-in tested and working

## 🎯 **Next Steps**

1. **Create your own Azure App Registration** (recommended)
2. **Set the environment variable** in Render
3. **Redeploy your application**
4. **Test Microsoft authentication**

Your Microsoft authentication will work perfectly in production! 🚀
