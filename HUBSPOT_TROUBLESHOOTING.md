# HubSpot Integration Troubleshooting Guide

## 🚨 Current Issue: Demo Data Instead of Real Data

If you're seeing demo data instead of real HubSpot data, follow these steps:

### Step 1: Check Server Status

1. **Start the backend server:**
   ```bash
   cd project
   node server.cjs
   ```

2. **Verify server is running:**
   - You should see: "🚀 CPQ Pro server running on port 4000"
   - Test with: `curl http://localhost:4000/api/health`

### Step 2: Check HubSpot API Key

1. **Verify your API key in `.env` file:**
   ```
   HUBSPOT_API_KEY=your-actual-hubspot-api-key
   ```

2. **Get a new API key if needed:**
   - Go to HubSpot Developer Portal
   - Create a new Private App
   - Copy the API key
   - Update your `.env` file

### Step 3: Test HubSpot Connection

1. **Test the connection:**
   ```bash
   curl http://localhost:4000/api/hubspot/test
   ```

2. **Expected response:**
   ```json
   {"success": true, "message": "HubSpot connection successful"}
   ```

### Step 4: Check for Real Data

1. **Test contacts endpoint:**
   ```bash
   curl http://localhost:4000/api/hubspot/contacts
   ```

2. **Test deals endpoint:**
   ```bash
   curl http://localhost:4000/api/hubspot/deals
   ```

### Step 5: Common Issues & Solutions

#### Issue: "Backend server is not available"
**Solution:**
- Start the server: `node server.cjs`
- Check if port 4000 is available
- Ensure no firewall blocking the port

#### Issue: "HubSpot API error: 401/403"
**Solution:**
- Check your API key is valid
- Ensure the API key has proper permissions
- Verify the key is not expired

#### Issue: "Connection timeout"
**Solution:**
- Check your internet connection
- Verify HubSpot API is accessible
- Try increasing timeout in the code

#### Issue: "CORS error"
**Solution:**
- The backend server handles CORS
- Ensure you're using the backend server, not direct API calls
- Check server is running on port 4000

### Step 6: Debug Mode

Enable debug logging by checking the browser console for:
- Connection attempts
- API responses
- Error messages
- Data validation

### Step 7: Verify Real Data

Real HubSpot data will have:
- Real contact IDs (not starting with 'contact_')
- Real deal IDs (not starting with 'deal_')
- Actual email addresses
- Real company names

Demo data will have:
- IDs like 'contact_1', 'deal_1'
- Example email addresses
- Sample company names

### Step 8: Production Setup

For production use:
1. Deploy backend server to your hosting provider
2. Update frontend URLs to point to production backend
3. Set up environment variables on server
4. Configure CORS for your domain
5. Set up monitoring

## 🔧 Quick Fix Commands

```bash
# Start server
cd project
node server.cjs

# Test connection
curl http://localhost:4000/api/hubspot/test

# Test contacts
curl http://localhost:4000/api/hubspot/contacts

# Test deals
curl http://localhost:4000/api/hubspot/deals
```

## 📞 Support

If issues persist:
1. Check browser console for detailed error messages
2. Verify HubSpot API key permissions
3. Ensure backend server is running
4. Test with a fresh API key
