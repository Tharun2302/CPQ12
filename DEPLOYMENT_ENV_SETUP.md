# Deployment Environment Variables Setup

## Overview
All hardcoded URLs have been replaced with environment variables. Now you can change the backend/frontend URLs by simply updating the `.env` file when deploying.

## Environment Variables

### Local Development
Keep your `env` file like this:

```env
# Backend URL - LOCAL
VITE_BACKEND_URL=http://localhost:3001

# Frontend URL - LOCAL
VITE_FRONTEND_URL=http://localhost:5173

# All other variables...
```

### Production Deployment
When deploying to production, update your `.env` file:

```env
# Backend URL - PRODUCTION
VITE_BACKEND_URL=https://your-backend-domain.com

# Frontend URL - PRODUCTION
VITE_FRONTEND_URL=https://your-frontend-domain.com

# Update these URLs for production
BASE_URL=https://your-frontend-domain.com
APP_BASE_URL=https://your-backend-domain.com
VITE_MSAL_REDIRECT_URI=https://your-frontend-domain.com/auth/microsoft/callback

# All other variables...
```

## Files Updated

All hardcoded URLs have been replaced with environment variables in:

- ✅ `src/components/ManagerApprovalDashboard.tsx`
- ✅ `src/components/CEOApprovalDashboard.tsx`
- ✅ `src/components/ClientNotification.tsx`
- ✅ `src/components/QuoteGenerator.tsx`
- ✅ `src/components/ApprovalWorkflow.tsx`
- ✅ `src/components/ApprovalDashboard.tsx`
- ✅ `src/utils/pdfProcessor.ts`

## How It Works

### Before (Hardcoded - BAD ❌)
```typescript
const response = await fetch('http://localhost:3001/api/quotes', {
  // ...
});
```

### After (Environment Variable - GOOD ✅)
```typescript
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const response = await fetch(`${BACKEND_URL}/api/quotes`, {
  // ...
});
```

## Deployment Steps

### Step 1: Update Environment Variables
1. Copy your `env` file to production
2. Update the URLs to your production domains:
   ```env
   VITE_BACKEND_URL=https://api.yoursite.com
   VITE_FRONTEND_URL=https://www.yoursite.com
   ```
3. Update all redirect URLs for Microsoft auth
4. Update BASE_URL and APP_BASE_URL

### Step 2: Build the Application
```bash
npm run build
```

The build process will replace all `VITE_*` environment variables with their actual values.

### Step 3: Deploy
Deploy your built application to your hosting provider:
- Frontend: Deploy the `dist` folder
- Backend: Deploy the `server.cjs` file with updated environment variables

## Example for Different Hosting Providers

### Vercel
Add environment variables in Vercel dashboard:
- `VITE_BACKEND_URL` = Your backend URL
- `VITE_FRONTEND_URL` = Your frontend URL

### Netlify
Add environment variables in Netlify dashboard:
- `VITE_BACKEND_URL` = Your backend URL
- `VITE_FRONTEND_URL` = Your frontend URL

### Render
Add environment variables in Render dashboard:
- `VITE_BACKEND_URL` = Your backend URL
- `VITE_FRONTEND_URL` = Your frontend URL

## Important Notes

1. **Never commit `.env` file** - Keep it in your `.gitignore`
2. **Use `.env.example`** - Create an example file for other developers
3. **Environment Variables Prefix** - All Vite environment variables must start with `VITE_`
4. **Backend URLs** - The backend also uses environment variables (PORT, MONGODB_URI, etc.)
5. **CORS** - Make sure your backend CORS configuration allows your production frontend URL

## Troubleshooting

### Issue: CORS errors in production
**Solution**: Update CORS settings in `server.cjs` to include your production frontend URL:
```javascript
origin: [
  'https://your-frontend-domain.com',
  'https://www.your-frontend-domain.com',
]
```

### Issue: Environment variables not working
**Solution**: 
1. Restart your dev server after changing `.env`
2. Ensure variable names start with `VITE_`
3. Check that the build process includes the updated `.env` file

### Issue: Mixed content errors
**Solution**: Ensure your backend URL uses HTTPS in production if your frontend uses HTTPS

## Testing

### Test Local Development
```bash
# Start backend
npm start

# Start frontend in another terminal
npm run dev
```

The frontend should connect to `http://localhost:3001` automatically.

### Test Production Build
```bash
# Build
npm run build

# Preview
npm run preview
```

The preview should connect to your configured backend URL.

## Summary

✅ All hardcoded URLs removed  
✅ Environment variables implemented  
✅ Easy to change URLs by editing `.env`  
✅ Works for local development and production  
✅ No code changes needed when deploying

Just update your `.env` file and rebuild!

