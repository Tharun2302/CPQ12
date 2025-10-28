# Basic Plan Hiding Fix - BOX TO GOOGLE MYDRIVE

## 🐛 Issue Found

After implementing BOX TO GOOGLE MYDRIVE combination, the **Basic plan was showing in the UI** when it shouldn't be displayed (only Standard and Advanced should show).

---

## ✅ Root Cause

In `src/components/PricingComparison.tsx`, the logic that hides the Basic plan for specific combinations was missing `box-to-google-mydrive`.

### Before (Line 70-77):
```typescript
const hideBasicPlan = combination === 'dropbox-to-sharepoint' || 
                      combination === 'dropbox-to-onedrive' ||
                      combination === 'box-to-box' ||
                      combination === 'google-sharedrive-to-egnyte' ||
                      combination === 'google-sharedrive-to-google-sharedrive' ||
                      combination === 'google-sharedrive-to-onedrive' ||
                      combination === 'google-sharedrive-to-sharepoint';
```

### After (Fixed):
```typescript
const hideBasicPlan = combination === 'dropbox-to-sharepoint' || 
                      combination === 'dropbox-to-onedrive' ||
                      combination === 'box-to-box' ||
                      combination === 'box-to-google-mydrive' ||  // ← ADDED!
                      combination === 'google-sharedrive-to-egnyte' ||
                      combination === 'google-sharedrive-to-google-sharedrive' ||
                      combination === 'google-sharedrive-to-onedrive' ||
                      combination === 'google-sharedrive-to-sharepoint';
```

---

## 🔧 Fix Applied

### File: `src/components/PricingComparison.tsx`

**Line 73**: Added `combination === 'box-to-google-mydrive'` to the hideBasicPlan condition

**Line 79**: Updated comment to include "Box to Google MyDrive"

---

## ✅ Expected Behavior

### BOX TO GOOGLE MYDRIVE Combination:
- ❌ Basic plan: **HIDDEN** (not displayed)
- ✅ Standard plan: **VISIBLE**
- ✅ Advanced plan: **VISIBLE**

### Combinations That Show All 3 Plans:
- DROPBOX TO MYDRIVE (Basic, Standard, Advanced)
- DROPBOX TO SHAREDRIVE (Basic, Standard, Advanced)

### Combinations That Hide Basic Plan:
- DROPBOX TO SHAREPOINT (Standard, Advanced only)
- DROPBOX TO ONEDRIVE (Standard, Advanced only)
- BOX TO BOX (Standard, Advanced only)
- **BOX TO GOOGLE MYDRIVE** (Standard, Advanced only) ⭐ **FIXED!**
- GOOGLE SHARED DRIVE TO EGNYTE (Standard, Advanced only)
- GOOGLE SHARED DRIVE TO GOOGLE SHARED DRIVE (Standard, Advanced only)
- GOOGLE SHARED DRIVE TO ONEDRIVE (Standard, Advanced only)
- GOOGLE SHARED DRIVE TO SHAREPOINT (Standard, Advanced only)

---

## 📋 Future Reference

**For any new Content combinations you add:**

1. **If adding Basic, Standard, and Advanced templates:**
   - No change needed in PricingComparison.tsx
   - All 3 plans will display automatically

2. **If adding ONLY Standard and Advanced templates:**
   - Add the combination to the `hideBasicPlan` condition in PricingComparison.tsx
   - Example: `combination === 'your-new-combination' ||`

---

## 🧪 Testing

1. Open application: http://localhost:5173
2. Select Migration Type: **Content**
3. Select Combination: **BOX TO GOOGLE MYDRIVE**
4. Enter users and click Calculate Pricing
5. **Verify**: Only 2 plans show (Standard and Advanced)
6. **Verify**: Basic plan is not visible

---

## ✅ Status

**Fixed**: October 24, 2025
**Verified**: No linting errors
**Ready**: For production use

---

## 📝 Important Note for Future

**When user asks to add a new combination with specific plans:**

- If user says: "add Standard and Advanced only" → Add to `hideBasicPlan` logic
- If user says: "add all 3 plans" or "add Basic, Standard, Advanced" → Don't add to `hideBasicPlan`
- If user says: "add Basic plan only" → Add Basic template to seed-templates.cjs (not Standard/Advanced)

**Always remember to update `PricingComparison.tsx` if Basic plan should be hidden!**

