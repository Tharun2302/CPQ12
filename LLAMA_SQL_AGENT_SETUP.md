# Llama SQL Agent Setup Guide

## 🎯 Overview

This SQL Agent uses **Llama (local LLM)** with **LlamaIndex** to convert natural language prompts to SQL queries.

**Flow:**
1. User asks question in natural language
2. **Llama LLM** converts prompt to SQL
3. Backend executes SQL on MySQL database
4. Returns formatted results

## 🚀 Step 1: Install Ollama (Local LLM Server)

### Windows:
1. Download Ollama from: https://ollama.ai/download
2. Install and run Ollama
3. Pull a model:
   ```bash
   ollama pull llama2
   # or
   ollama pull llama3
   # or
   ollama pull mistral
   ```

### macOS:
```bash
brew install ollama
ollama serve
# In another terminal:
ollama pull llama2
```

### Linux:
```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama2
```

## ⚙️ Step 2: Configure Environment

Add to your `.env` file:

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
# Options: llama2, llama3, mistral, codellama, etc.
```

## 🔧 Step 3: Start Ollama Server

Make sure Ollama is running:

```bash
# Check if Ollama is running
ollama list

# If not running, start it:
ollama serve
```

Default URL: `http://localhost:11434`

## 📦 Step 4: Test the Setup

### Test LLM Connection:
```bash
curl http://localhost:3001/api/sql-agent/test-llm
```

### Test SQL Agent:
1. Go to Dashboard → SQL Agent tab
2. Ask: "How many deals done?"
3. The system will:
   - Use Llama to convert to SQL
   - Execute on MySQL
   - Return results

## 🎯 How It Works

### Flow Diagram:
```
User Query
    ↓
[Rule-Based Check] → Match? → Execute SQL → Return Results
    ↓ No Match
[Llama LLM] → Convert to SQL
    ↓
[Security Check] → SELECT only?
    ↓
[MySQL Execute] → Get Results
    ↓
Return to User
```

### Two-Tier System:

1. **Rule-Based (Fast)**
   - Common queries matched instantly
   - No LLM call needed
   - Examples: "how many deals", "client names"

2. **LLM-Based (Flexible)**
   - Complex queries use Llama
   - Natural language understanding
   - Examples: "show me all clients from last month"

## 🔒 Security Features

- ✅ **Only SELECT queries** allowed
- ✅ **SQL injection protection**
- ✅ **Query validation** before execution
- ✅ **No data modification** (INSERT/UPDATE/DELETE blocked)

## 📊 Supported Models

You can use any Ollama-compatible model:

- `llama2` - General purpose
- `llama3` - Latest Llama model
- `mistral` - Fast and efficient
- `codellama` - Better for SQL generation
- `phi` - Lightweight option

To change model, update `LLM_MODEL` in `.env`

## 🛠️ Troubleshooting

### "LLM server not accessible"
- Make sure Ollama is running: `ollama serve`
- Check URL in `.env`: `http://localhost:11434`
- Test: `curl http://localhost:11434/api/tags`

### "Model not found"
- Pull the model: `ollama pull llama2`
- Check available: `ollama list`
- Update `LLM_MODEL` in `.env`

### "Query timeout"
- LLM might be slow on first call
- Try a smaller model (phi, mistral)
- Increase timeout in code if needed

### "SQL generation failed"
- System falls back to rule-based matching
- Try rephrasing your question
- Check server logs for details

## 🎨 Example Queries

### Simple (Rule-Based):
- "How many deals done?"
- "Show client names"
- "List templates"

### Complex (LLM):
- "Show me all clients who have pending approvals"
- "What's the total number of deals created last month?"
- "List all templates that are default"

## 📝 Next Steps (Future)

After this works, you can:
1. **Fine-tune the model** on your specific queries
2. **Add more query patterns** to rule-based system
3. **Optimize prompts** for better SQL generation
4. **Add caching** for common queries

## ✅ Checklist

- [ ] Ollama installed and running
- [ ] Model pulled (llama2/llama3)
- [ ] `.env` configured with LLM settings
- [ ] MySQL database accessible
- [ ] Test LLM connection works
- [ ] SQL Agent tab accessible in dashboard

---

**Ready to use!** 🚀

The SQL Agent will now use Llama (local LLM) to convert your natural language queries to SQL.

