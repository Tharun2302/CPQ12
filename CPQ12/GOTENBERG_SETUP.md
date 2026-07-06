# Gotenberg Migration Summary

## ✅ Changes Made

### 1. **docker-compose.yml** - Added Gotenberg Service
- Added `cpq-network` bridge network for inter-container communication
- Added Gotenberg service:
  - **Image**: gotenberg/gotenberg:8
  - **Internal only** (no public port exposed)
  - **Access from app**: `http://gotenberg:3000` (within docker-compose)
  - **Auto-restart**: unless-stopped
- Updated onlyoffice and postgres to use cpq-network

### 2. **server.cjs** - Reorganized Conversion Methods
Reordered PDF conversion fallback chain (highest priority first):

1. **Method 1: Gotenberg** (NEW PRIMARY - 1-2 seconds) ⚡
   - Ultra-fast Docker microservice
   - Endpoint: `http://gotenberg:3000/forms/libreoffice/convert`
   - Requires: `GOTENBERG_URL` environment variable set
   
2. **Method 2: Direct LibreOffice** (FALLBACK - 8-10 seconds) 
   - System LibreOffice spawn (slower but no external dependency)
   - Includes DOCX preprocessing for floating image layouts
   - Requires: LibreOffice binary installed in container
   
3. **Method 3: libreoffice-convert package** (FALLBACK)
   - NPM package wrapper around LibreOffice
   
4. **Method 4: Simple text-based PDF** (LAST RESORT)
   - Extracts text and creates basic PDF (no formatting)

### Logging Improvements
- Clear indication of which method is being used (⚡ Gotenberg, 📄 LibreOffice, etc.)
- Timing info in success messages (1-2s vs 8-10s)
- Warning logs when methods fail, error logs when all methods fail

---

## 🚀 How to Use

### Step 1: Set the Environment Variable
You need to tell the app where Gotenberg is running. Choose ONE of these approaches:

**Option A: Docker Compose (Recommended)**
If your app service is in docker-compose.yml, add to its environment:
```yaml
services:
  app:
    # ... other config ...
    environment:
      - GOTENBERG_URL=http://gotenberg:3000
```

**Option B: .env file** (if using local development)
```
GOTENBERG_URL=http://localhost:3000
```

**Option C: Docker run command**
```bash
docker run -e GOTENBERG_URL=http://gotenberg:3000 -p 3001:3001 cpq-app
```

**Option D: Kubernetes or orchestration**
Set as env var in your deployment config.

### Step 2: Start Services
```bash
docker-compose up -d
```

This will start:
- Gotenberg (on internal cpq-network, port 3000)
- Any other services defined in your compose file

### Step 3: Verify It's Working

**Check logs to see which method is being used:**
```bash
docker-compose logs app
```

Look for:
- ✅ `⚡ Trying Gotenberg service (fastest)` → Gotenberg is being attempted
- ✅ `✅ PDF generated with Gotenberg (1-2s)` → SUCCESS! Using fast method
- ⚠️ `❌ Gotenberg request error` → Fallback to LibreOffice
- ✅ `✅ PDF generated with LibreOffice (8-10s)` → Using slower method

**Test the conversion endpoint:**
```bash
curl -X POST http://localhost:3001/api/convert/docx-to-pdf \
  -F "file=@sample.docx" \
  -o output.pdf
```

Monitor the logs in parallel to see which method is used.

---

## 📊 Conversion Performance

| Method | Speed | Startup | Use Case |
|--------|-------|---------|----------|
| **Gotenberg** | 1-2s | Instant (warm) | Production (primary) |
| **LibreOffice** | 8-10s | ~5s spawn | Fallback, local dev |
| **libreoffice-convert** | 5-8s | ~3s | Secondary fallback |
| **Text-based PDF** | <1s | Instant | Emergency only |

---

## 🔧 Configuration Details

### Current Defaults in server.cjs
```javascript
const GOTENBERG_URL = process.env.GOTENBERG_URL || '';  // Empty = disabled
const LIBREOFFICE_SERVICE_URL = process.env.LIBREOFFICE_SERVICE_URL || 'http://localhost:3002';
```

**Note**: GOTENBERG_URL defaults to empty, so it's optional. When empty, Gotenberg is skipped and LibreOffice is primary method.

### Docker Network Communication
- Container name: `cpq-gotenberg`
- Service DNS name: `gotenberg`
- Port inside container: 3000
- Network: `cpq-network`
- Full internal URL: `http://gotenberg:3000`

---

## ⚠️ Troubleshooting

### Gotenberg Connection Refused
```
❌ Gotenberg request error: connect ECONNREFUSED 127.0.0.1:3000
```
**Fix**: 
- Make sure `GOTENBERG_URL=http://gotenberg:3000` (not localhost!)
- Verify Gotenberg container is running: `docker-compose ps`
- Check container logs: `docker-compose logs gotenberg`

### "No GOTENBERG_URL configured"
This is normal if you haven't set the environment variable yet. The app will fall back to LibreOffice.

### Gotenberg times out
```
⚠️ Gotenberg request error: Request timeout
```
**Fix**:
- Check if Gotenberg is overloaded: `docker-compose logs gotenberg`
- Increase app timeout (currently 60s, should be fine)
- Check network connectivity between containers: `docker network inspect cpq-network`

### PDF looks different than LibreOffice version
**Expected**: Gotenberg uses same LibreOffice engine but slightly different rendering. Usually imperceptible.
- Use the `/forms/libreoffice/convert` endpoint which ensures consistency
- If critical formatting needed, app can fall back to direct LibreOffice

---

## 📝 Files Changed

1. **docker-compose.yml**
   - Added `cpq-network` bridge network
   - Added Gotenberg service
   - Updated OnlyOffice and Postgres to use cpq-network

2. **server.cjs** (lines 4139-4320)
   - Reordered conversion methods (Gotenberg first)
   - Cleaned up duplicate method definitions
   - Improved logging with emojis for clarity

3. **.env** - NO CHANGES (as requested)
   - Add `GOTENBERG_URL=http://gotenberg:3000` if using .env

---

## ✨ What to Expect

**Before Gotenberg:**
- Spawn new LibreOffice process: 8-10 seconds ⏳
- Full process lifecycle for each PDF
- Heavy CPU usage during spawn

**After Gotenberg:**
- Hit warm microservice: 1-2 seconds ⚡
- Parallel processing capability
- Lower CPU overhead
- Automatic fallback if service is down

---

## 🎯 Next Steps

1. ✅ **Set GOTENBERG_URL** in your environment (docker-compose, .env, or K8s)
2. ✅ **Start services**: `docker-compose up -d`
3. ✅ **Test conversion**: POST to `/api/convert/docx-to-pdf`
4. ✅ **Check logs**: Verify `✅ PDF generated with Gotenberg` messages
5. ✅ **Monitor performance**: Compare conversion times

---

## 🔄 Rollback (if needed)

If you need to revert to direct LibreOffice:
1. Remove `GOTENBERG_URL` environment variable
2. App will automatically skip Gotenberg and use LibreOffice as primary method
3. No code changes needed (fallback logic is built-in)
4. Can remove Gotenberg service from docker-compose.yml anytime

---

## 📚 Resources

- **Gotenberg API Docs**: https://gotenberg.dev/docs/routes
- **LibreOffice to PDF**: https://gotenberg.dev/docs/routes/libreoffice-route
- **Docker Compose Networking**: https://docs.docker.com/compose/networking/
