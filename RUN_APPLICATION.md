# 🚀 Commands to Run the Application

## Prerequisites Check

First, make sure you have:
- ✅ Node.js installed (v18+)
- ✅ MySQL running
- ✅ Ollama installed (for LLM)

---

## Step 1: Install Ollama (If Not Installed)

### Windows:
1. Download from: https://ollama.ai/download/windows
2. Run the installer
3. Or use winget:
```powershell
winget install Ollama.Ollama
```

### Verify Ollama Installation:
```powershell
ollama --version
```

---

## Step 2: Start Ollama Server

Open a **new terminal/PowerShell window** and run:

```powershell
ollama serve
```

Keep this window open! Ollama must be running.

---

## Step 3: Pull Llama Model

In the same terminal (or new one), run:

```powershell
ollama pull llama2
```

Or for better SQL generation:
```powershell
ollama pull codellama
```

Wait for download to complete (may take a few minutes).

**Verify model is installed:**
```powershell
ollama list
```

---

## Step 4: Configure Environment Variables

Create/update `.env` file in project root:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=lama
DB_PORT=3306

# LLM Configuration (Ollama)
LLM_API_URL=http://localhost:11434/api/generate
LLM_MODEL=llama2

# Backend URL
VITE_BACKEND_URL=http://localhost:3001
PORT=3001
```

---

## Step 5: Install Dependencies (If Not Done)

```powershell
npm install
```

---

## Step 6: Start Backend Server

In your project directory, run:

```powershell
npm start
```

Or:
```powershell
node server.cjs
```

**You should see:**
```
🚀 Server running on port 3001
✅ MongoDB connection successful
🤖 SQL Agent ready
```

---

## Step 7: Start Frontend (Development)

Open a **new terminal** and run:

```powershell
npm run dev
```

**You should see:**
```
VITE ready in XXX ms
➜  Local:   http://localhost:5173/
```

---

## Step 8: Test SQL Agent

### Option 1: Test LLM Connection
```powershell
curl http://localhost:3001/api/sql-agent/test-llm
```

### Option 2: Use the UI
1. Open browser: http://localhost:5173
2. Login/Sign up
3. Go to Dashboard
4. Click **"SQL Agent"** tab
5. Ask: "How many deals done?"

---

## Quick Start (All Commands)

```powershell
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Pull Model (one time)
ollama pull llama2

# Terminal 3: Start Backend
cd C:\Users\AnushDasari\Desktop\CPQ12
npm start

# Terminal 4: Start Frontend
cd C:\Users\AnushDasari\Desktop\CPQ12
npm run dev
```

---

## Verify Everything is Running

### Check Ollama:
```powershell
curl http://localhost:11434/api/tags
```

### Check Backend:
```powershell
curl http://localhost:3001/api/health
```

### Check SQL Agent:
```powershell
curl http://localhost:3001/api/sql-agent/test-llm
```

---

## Troubleshooting

### Ollama Not Starting:
```powershell
# Check if port 11434 is in use
netstat -ano | findstr :11434

# Restart Ollama
taskkill /F /IM ollama.exe
ollama serve
```

### Backend Port Already in Use:
```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process (replace PID)
taskkill /F /PID <process_id>
```

### MySQL Not Running:
```powershell
# Start MySQL service
net start mysql80
# or
net start MySQL
```

### Model Not Found:
```powershell
# List available models
ollama list

# Pull the model again
ollama pull llama2
```

---

## Production Build

To build for production:

```powershell
# Build frontend
npm run build

# Start production server
npm start
```

Frontend will be served from `dist` folder.

---

## Stop Application

1. **Stop Frontend**: `Ctrl+C` in frontend terminal
2. **Stop Backend**: `Ctrl+C` in backend terminal
3. **Stop Ollama**: `Ctrl+C` in Ollama terminal (or close window)

---

## Quick Reference

| Service | URL | Status Check |
|---------|-----|--------------|
| Ollama | http://localhost:11434 | `ollama list` |
| Backend | http://localhost:3001 | `curl http://localhost:3001/api/health` |
| Frontend | http://localhost:5173 | Open in browser |

---

**Ready to go!** 🎉


