# 🚀 Real HubSpot Data Setup Guide

## 🎯 **Goal: Get Real HubSpot Data Instead of Demo Data**

Your HubSpot API key is working perfectly and you have real data available. The issue is that the backend server needs to be running to connect to HubSpot.

## 📋 **Step-by-Step Instructions**

### **Step 1: Start the Backend Server**

**Option A: Using the Easy Setup Script**
1. Double-click `start-hubspot-integration.bat`
2. Keep the window open (don't close it!)
3. You should see: "🚀 CPQ Pro server running on port 4000"

**Option B: Manual Setup**
1. Open Command Prompt or PowerShell
2. Navigate to the project folder: `cd path\to\project`
3. Run: `node server.cjs`
4. Keep the terminal window open

### **Step 2: Start the Frontend**

**Option A: Using the Easy Setup Script**
1. Open a NEW Command Prompt or PowerShell window
2. Double-click `start-frontend.bat`
3. Keep this window open too

**Option B: Manual Setup**
1. Open a NEW Command Prompt or PowerShell window
2. Navigate to the project folder: `cd path\to\project`
3. Run: `npm run dev`
4. Keep the terminal window open

### **Step 3: Access the Application**

1. Open your web browser
2. Go to: `http://localhost:5173`
3. Navigate to the HubSpot Integration section
4. Click "Connect to HubSpot"

## ✅ **Expected Results**

When everything is working correctly, you should see:

- ✅ **"Connected to HubSpot"** status (not "Demo Mode")
- ✅ **Real contact data** (like "Damarys Blanco" with ID 5451)
- ✅ **Real deal data** from your HubSpot account
- ✅ **No more demo data** (no more "contact_1", "deal_1" IDs)

## 🔧 **Troubleshooting**

### **Issue: "Backend server is not available"**
**Solution:**
- Make sure you ran `node server.cjs` and kept the terminal open
- Check that you see "🚀 CPQ Pro server running on port 4000"
- Try refreshing the page after starting the server

### **Issue: Still seeing demo data**
**Solution:**
- Ensure both backend and frontend servers are running
- Click "Connect to HubSpot" again
- Check the browser console for any error messages

### **Issue: "HubSpot API error"**
**Solution:**
- Your API key is working (we confirmed this)
- The issue is likely the backend server not running
- Start the backend server first, then try again

## 🧪 **Testing Your Setup**

Run this command to test everything:
```bash
node test-hubspot.cjs
```

You should see:
- ✅ HubSpot API Connection Successful
- ✅ Found real contacts in HubSpot account
- ✅ Backend server is running
- ✅ Backend HubSpot test successful

## 📊 **What Real Data Looks Like**

**Real HubSpot Data:**
- Contact ID: `5451` (real number)
- Email: `blancod@ohsu.edu` (real email)
- Name: `Damarys Blanco` (real person)

**Demo Data (what you're seeing now):**
- Contact ID: `contact_1` (fake ID)
- Email: `john.doe@example.com` (fake email)
- Name: `John Doe` (fake name)

## 🎉 **Success Indicators**

When you have real data working:
1. ✅ Backend server shows "Server is ready to handle requests"
2. ✅ Frontend shows "Connected to HubSpot" (not "Demo Mode")
3. ✅ You see real contact names and email addresses
4. ✅ Contact IDs are real numbers (not "contact_1", "contact_2")
5. ✅ You can create real contacts and deals in HubSpot

## 🚨 **Important Notes**

1. **Keep both terminal windows open** - Don't close them!
2. **Backend server must run first** - Start it before the frontend
3. **Your HubSpot API key is working** - We confirmed real data is available
4. **The issue is just the server not running** - Once started, you'll get real data

## 📞 **Need Help?**

If you're still having issues:
1. Check that both servers are running
2. Look for error messages in the terminal windows
3. Check the browser console for any errors
4. Try the test script: `node test-hubspot.cjs`

---

**Remember:** Your HubSpot integration is working perfectly - you just need to keep the backend server running to access the real data!
