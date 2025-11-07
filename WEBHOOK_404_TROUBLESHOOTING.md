# 🔧 BoldSign Webhook 404 Error - Troubleshooting Guide

## Problem
BoldSign webhook verification is showing **404 error** when trying to verify the endpoint `https://zenop.ai/api/boldsign/webhook`.

---

## ✅ Quick Fixes

### 1. **Restart Your Server** (Most Common Fix)
After making changes to `server.cjs`, you must restart the server:

```bash
# If running directly
pm2 restart all
# or
systemctl restart your-service
# or
# Stop and restart your Node.js server
```

### 2. **Verify Server is Running**
```bash
# Check if server is listening on port 3001
curl https://zenop.ai/api/boldsign/webhook

# Should return:
# {"success":true,"message":"BoldSign webhook endpoint is active","method":"POST",...}
```

### 3. **Test the Webhook Endpoint Manually**

#### Using PowerShell:
```powershell
Invoke-WebRequest -Uri "https://zenop.ai/api/boldsign/webhook" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{}'
```

#### Using curl (if available):
```bash
curl -X POST https://zenop.ai/api/boldsign/webhook \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Expected Response (200 OK):
```json
{
  "success": true,
  "message": "Webhook endpoint is active and ready to receive events",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 🔍 Detailed Troubleshooting Steps

### Step 1: Check Server Logs

Look for webhook-related logs:
```bash
# Check if webhook requests are reaching the server
tail -f /path/to/server.log | grep "BoldSign Webhook"

# Or check Docker logs
docker logs <container-name> | grep "BoldSign"
```

### Step 2: Verify Route is Accessible

The webhook endpoint should be accessible at:
- **URL:** `https://zenop.ai/api/boldsign/webhook`
- **Method:** `POST`
- **Content-Type:** `application/json`

Test with a GET request first:
```bash
curl https://zenop.ai/api/boldsign/webhook
```

This should return a JSON response indicating the endpoint is active.

### Step 3: Check Nginx Configuration

If you're using nginx (which appears to be the case based on Dockerfile), verify:

1. **Nginx is proxying `/api/` correctly:**
   ```nginx
   location /api/ {
       proxy_pass http://app;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

2. **Nginx allows POST requests:**
   Make sure there's no `limit_except` blocking POST:
   ```nginx
   # If you have this, remove it or allow POST
   # limit_except GET { deny all; }
   ```

3. **Reload Nginx:**
   ```bash
   nginx -t  # Test configuration
   nginx -s reload  # Reload if test passes
   ```

### Step 4: Check Docker Container Status

```bash
# Check if container is running
docker ps | grep cpq

# Check container logs
docker logs cpq-application

# Restart container if needed
docker-compose restart app
```

### Step 5: Verify Express Server Route

The route should be defined in `server.cjs` around line 4493:
```javascript
app.post('/api/boldsign/webhook', async (req, res) => {
  // ... webhook handler
});
```

**Important:** Make sure this route is defined **BEFORE** any catch-all routes.

---

## 🚨 Common Issues & Solutions

### Issue 1: Route Not Found (404)
**Cause:** Server not running or route not registered

**Solution:**
1. Restart the server
2. Check server logs for startup errors
3. Verify route is defined in `server.cjs`

### Issue 2: Nginx Blocking Request
**Cause:** Nginx configuration not allowing POST to `/api/`

**Solution:**
1. Check nginx config allows POST requests
2. Ensure `/api/` location block exists
3. Reload nginx: `nginx -s reload`

### Issue 3: Docker Container Not Running
**Cause:** Container stopped or crashed

**Solution:**
```bash
docker-compose up -d
docker-compose logs -f app
```

### Issue 4: CORS Issues
**Cause:** CORS blocking webhook requests

**Solution:** Already handled in `server.cjs` - verify CORS config allows all origins for webhooks.

### Issue 5: SSL Certificate Issues
**Cause:** HTTPS certificate problems

**Solution:**
```bash
# Check SSL certificate
openssl s_client -connect zenop.ai:443

# Renew if needed
certbot renew
```

---

## 🧪 Testing Checklist

Run through these tests to diagnose the issue:

- [ ] **Test 1:** GET request to webhook endpoint
  ```bash
  curl https://zenop.ai/api/boldsign/webhook
  ```
  Expected: 200 OK with JSON response

- [ ] **Test 2:** POST empty body (verification request)
  ```bash
  curl -X POST https://zenop.ai/api/boldsign/webhook \
    -H "Content-Type: application/json" \
    -d '{}'
  ```
  Expected: 200 OK with success message

- [ ] **Test 3:** POST with event data
  ```bash
  curl -X POST https://zenop.ai/api/boldsign/webhook \
    -H "Content-Type: application/json" \
    -d '{"eventType":"DocumentSigned","documentId":"test-123"}'
  ```
  Expected: 200 OK (or 400 if validation fails, but should still return 200 now)

- [ ] **Test 4:** Check server logs
  - Webhook requests should appear in logs
  - No 404 errors in server logs

- [ ] **Test 5:** Check nginx logs
  ```bash
  tail -f /var/log/nginx/access.log | grep webhook
  tail -f /var/log/nginx/error.log
  ```

---

## 📝 Verification Steps After Fix

Once you've fixed the issue:

1. **Test in BoldSign Dashboard:**
   - Go to Settings → Webhooks
   - Click "Verify" button next to your webhook
   - Should show green checkmark ✅

2. **Send a Test Event:**
   - Create a test document in BoldSign
   - Send it for signature
   - Check server logs for webhook event
   - Verify event appears in MongoDB

3. **Check Webhook Logs:**
   ```bash
   curl https://zenop.ai/api/boldsign/webhook-logs
   ```

---

## 🆘 If Still Not Working

### Enable Detailed Logging

Add this at the top of your webhook handler to see all requests:
```javascript
app.post('/api/boldsign/webhook', async (req, res) => {
  console.log('=== WEBHOOK REQUEST ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  // ... rest of handler
});
```

### Check Firewall Rules

Ensure port 443 (HTTPS) is open:
```bash
# Check if port is accessible
telnet zenop.ai 443

# Check firewall rules
iptables -L -n | grep 443
```

### Verify DNS

```bash
# Check DNS resolution
nslookup zenop.ai

# Check if domain points to correct IP
dig zenop.ai
```

---

## ✅ Success Indicators

You'll know it's working when:
- ✅ BoldSign verification shows green checkmark
- ✅ GET request to `/api/boldsign/webhook` returns 200 OK
- ✅ POST request with empty body returns 200 OK
- ✅ Server logs show webhook requests
- ✅ Webhook events appear in MongoDB

---

## 📞 Need More Help?

1. Check server logs: `docker logs cpq-application`
2. Check nginx logs: `/var/log/nginx/error.log`
3. Test endpoint manually with curl
4. Verify Docker containers are running
5. Check environment variables are set correctly

---

**Last Updated:** January 2024  
**Status:** Active troubleshooting guide

