# HubSpot Integration Setup Guide

## 🚀 Quick Start Options

### Option 1: Demo Mode (Recommended for Testing)
- **No setup required**
- Click "Enable Demo Mode" in the HubSpot integration
- Test all functionality immediately
- Perfect for development and testing

### Option 2: Backend Server (For Production)
- **Full HubSpot integration**
- Real API calls to HubSpot CRM
- Create actual contacts and deals

---

## 🔧 Backend Server Setup

### Step 1: Install Dependencies
```bash
# Navigate to your project directory
cd project

# Install backend dependencies
npm install express cors node-fetch dotenv
npm install --save-dev nodemon
```

### Step 2: Start the Backend Server
```bash
# Start the server
node server.js

# Or for development with auto-restart
npx nodemon server.js
```

### Step 3: Verify Server is Running
- Server will start on `http://localhost:3001`
- You should see: "🚀 HubSpot proxy server running on port 3001"

---

## 📡 API Endpoints

The backend server provides these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/hubspot/test` | GET | Test HubSpot connection |
| `/api/hubspot/contacts` | POST | Create HubSpot contact |
| `/api/hubspot/deals` | POST | Create HubSpot deal |

---

## 🔑 Environment Variables

Your `.env` file should contain:
```env
HUBSPOT_API_KEY=pat-na1-635cc313-80cb-4701-810a-a0492691b28d
PORT=3001
```

---

## 🎯 How It Works

### Connection Flow:
1. **Frontend** tries to connect via backend server first
2. **Backend** proxies the request to HubSpot API
3. **HubSpot** responds through the backend
4. **Frontend** receives the response without CORS issues

### Fallback Behavior:
- If backend server is not running → Demo mode is offered
- If backend fails → Falls back to demo mode
- Demo mode simulates all API responses

---

## 🛠️ Troubleshooting

### Common Issues:

#### 1. "CORS Error" Message
- **Cause**: Backend server not running
- **Solution**: Start the backend server with `node server.js`

#### 2. "Connection Failed" Error
- **Cause**: Invalid HubSpot API key
- **Solution**: Check your API key in the `.env` file

#### 3. "Backend server not available"
- **Cause**: Server not running on port 3001
- **Solution**: Ensure server is started and port 3001 is available

### Debug Steps:
1. Check if server is running: `http://localhost:3001/api/health`
2. Verify API key is correct
3. Check browser console for detailed error messages
4. Ensure no firewall blocking port 3001

---

## 🎉 Success Indicators

### When Backend is Working:
- ✅ "Connected to HubSpot" status
- ✅ No CORS errors
- ✅ Real contact/deal creation
- ✅ Actual data in HubSpot CRM

### When Using Demo Mode:
- ✅ "Demo Mode Available" message
- ✅ Simulated contact/deal creation
- ✅ Success messages with fake IDs
- ✅ Full functionality testing

---

## 📋 Production Deployment

For production deployment:

1. **Deploy backend server** to your hosting provider
2. **Update frontend URLs** to point to your production backend
3. **Set up environment variables** on your server
4. **Configure CORS** for your production domain
5. **Set up monitoring** for the backend server

---

## 🔒 Security Notes

- API keys are stored securely on the backend
- CORS is properly configured
- All requests are validated
- Error messages don't expose sensitive information

---

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify your HubSpot API key is valid
3. Ensure the backend server is running
4. Check browser console for detailed error messages
