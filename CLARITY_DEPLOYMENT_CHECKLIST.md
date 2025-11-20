# Microsoft Clarity Deployment Checklist

## ✅ Current Local Setup (Working)
- `VITE_CLARITY_ID=u0upe5d3nl` ✅
- `VITE_CLARITY_ENABLE_DEV=1` ✅ (enables Clarity in development)

## 🚀 Production Deployment Steps

### Step 1: Set Environment Variables in Your Hosting Platform

#### For Netlify/Vercel/Render:
1. Go to your project settings → Environment Variables
2. Add these variables:

```env
VITE_CLARITY_ID=u0upe5d3nl
```

**Note:** You do NOT need `VITE_CLARITY_ENABLE_DEV` in production - Clarity works automatically!

#### For Docker/Server Deployment:
Add to your `.env` file or docker-compose.yml:

```env
VITE_CLARITY_ID=u0upe5d3nl
```

### Step 2: Verify Build Mode
Make sure your build command uses production mode:
```bash
npm run build  # This automatically sets MODE=production
```

### Step 3: Test After Deployment
1. Visit your production site
2. Open browser console (F12)
3. Check for Clarity script loading:
   - Look for network request to `clarity.ms`
   - Check if `window.clarity` exists: `console.log(window.clarity)`

### Step 4: Verify in Clarity Dashboard
1. Go to https://clarity.microsoft.com/
2. Select your project (ID: `u0upe5d3nl`)
3. Check if sessions are being recorded
4. Wait 5-10 minutes for data to appear

## 📊 How It Works

### Local Development
```typescript
// Mode: 'development'
// VITE_CLARITY_ENABLE_DEV=1 → Clarity WORKS ✅
// VITE_CLARITY_ENABLE_DEV=0 → Clarity DISABLED ❌
```

### Production
```typescript
// Mode: 'production'
// Clarity WORKS automatically ✅ (no flag needed)
// Just need VITE_CLARITY_ID set
```

## 🔍 Troubleshooting

### Clarity Not Working in Production?
1. ✅ Check `VITE_CLARITY_ID` is set in environment variables
2. ✅ Verify build is using production mode (`npm run build`)
3. ✅ Check browser console for errors
4. ✅ Verify Clarity script is loading: `https://www.clarity.ms/tag/u0upe5d3nl`
5. ✅ Check Clarity dashboard for your project

### Clarity Not Working Locally?
1. ✅ Set `VITE_CLARITY_ENABLE_DEV=1` in `.env`
2. ✅ Restart dev server (`npm run dev`)
3. ✅ Check browser console for Clarity script

## 📝 Environment Variables Summary

| Variable | Local Dev | Production | Required |
|----------|-----------|------------|----------|
| `VITE_CLARITY_ID` | ✅ Yes | ✅ Yes | ✅ Required |
| `VITE_CLARITY_ENABLE_DEV` | ✅ Yes (set to `1`) | ❌ No | Optional |

## 🎯 Quick Reference

**Local Development:**
```env
VITE_CLARITY_ID=u0upe5d3nl
VITE_CLARITY_ENABLE_DEV=1
```

**Production:**
```env
VITE_CLARITY_ID=u0upe5d3nl
# VITE_CLARITY_ENABLE_DEV not needed
```

