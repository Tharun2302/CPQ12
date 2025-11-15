# SQL Agent Integration Guide

## 📋 Overview

The SQL Agent allows you to query your database using natural language. It can answer questions about:
- **Deals**: How many deals done, deal status, etc.
- **Clients**: Client names, client serials, client information
- **Templates**: List of templates, template details
- **Agreement Approval Status**: Pending, approved, rejected agreements

## 🚀 Features

1. **Natural Language Queries**: Ask questions in plain English
2. **Rule-Based Matching**: Works without OpenAI API key for common queries
3. **OpenAI Integration**: Optional OpenAI API for more complex queries
4. **Safe SQL Execution**: Only SELECT queries are allowed
5. **Beautiful UI**: Chat-like interface with formatted results

## 📦 Installation

The required packages have been installed:
- `mysql2` - MySQL database connection
- `openai` - Optional OpenAI API integration
- `@llamaindex/core` & `@llamaindex/community` - LlamaIndex libraries

## ⚙️ Configuration

### Database Configuration

Ensure your `.env` file has MySQL database settings:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=cpq_database1
DB_PORT=3306
```

### Optional: OpenAI Configuration

For more advanced natural language understanding, add your OpenAI API key:

```env
OPENAI_API_KEY=your-openai-api-key-here
```

**Note**: The SQL Agent works without OpenAI using rule-based pattern matching for common queries.

## 🎯 Usage

### Accessing SQL Agent

1. Navigate to your dashboard
2. Click on the **"SQL Agent"** tab in the navigation menu
3. Start asking questions!

### Example Queries

Try these example queries:

- **"How many deals done?"** - Counts successful deals
- **"Show me all client names"** - Lists all client names with emails
- **"List all templates"** - Shows all available templates
- **"What is the approval status?"** - Shows agreement approval status
- **"How many pending approvals?"** - Counts pending approvals
- **"Show client serials"** - Displays client serial numbers (quote IDs)

### Query Results

The SQL Agent will:
1. Convert your natural language query to SQL
2. Execute the query safely (SELECT only)
3. Display results in a formatted table
4. Show the generated SQL query for transparency

## 🔧 API Endpoints

### POST `/api/sql-agent/query`

Query the database using natural language.

**Request:**
```json
{
  "query": "How many deals done?"
}
```

**Response:**
```json
{
  "success": true,
  "query": "How many deals done?",
  "sql": "SELECT COUNT(*) as total_deals FROM hubspot_integrations WHERE status = 'success'",
  "description": "Count of completed deals",
  "method": "rule-based",
  "results": [
    { "total_deals": 15 }
  ],
  "rowCount": 1
}
```

### GET `/api/sql-agent/schema`

Get database schema information and available query patterns.

**Response:**
```json
{
  "success": true,
  "schema": "...",
  "availableQueries": [
    {
      "pattern": "how many deals",
      "description": "Count of successful deals"
    },
    ...
  ]
}
```

## 🗄️ Database Tables

The SQL Agent can query these tables:

1. **quotes** - Quote information with client details
2. **signature_forms** - Agreement forms and approval status
3. **templates** - Document templates
4. **hubspot_integrations** - HubSpot deals and contacts
5. **pricing_tiers** - Pricing tier configurations

## 🔒 Security

- **Read-Only**: Only SELECT queries are allowed
- **SQL Injection Protection**: Queries are validated before execution
- **No Data Modification**: INSERT, UPDATE, DELETE are blocked
- **Connection Pooling**: Safe database connection management

## 🛠️ Troubleshooting

### "Database connection failed"

1. Check MySQL is running:
   ```bash
   # Windows
   net start mysql
   
   # macOS/Linux
   sudo systemctl start mysql
   ```

2. Verify database credentials in `.env` file

3. Ensure database `cpq_database1` exists

### "Could not understand the query"

- Try rephrasing your question
- Use the example queries as a guide
- Check the "Schema Info" button for available patterns
- If OpenAI is configured, it will help with more complex queries

### "OpenAI error"

- The SQL Agent works without OpenAI
- If you see OpenAI errors, it will fall back to rule-based matching
- To use OpenAI, add `OPENAI_API_KEY` to your `.env` file

## 📝 Adding Custom Query Patterns

To add new query patterns, edit `sql-agent-service.cjs` and add to `QUERY_PATTERNS`:

```javascript
const QUERY_PATTERNS = {
  'your pattern': {
    sql: `SELECT ... FROM ...`,
    description: 'Description of what this query does'
  },
  // ... existing patterns
};
```

## 🎨 Frontend Component

The SQL Agent component (`src/components/SQLAgent.tsx`) provides:
- Chat-like interface
- Example queries
- Formatted result tables
- SQL query display
- Schema information panel

## 📊 Supported Query Types

### Deals
- Count of deals
- Deal status
- Deal details

### Clients
- Client names
- Client emails
- Client serials (quote IDs)
- Company information

### Templates
- List all templates
- Template details
- Template types

### Approval Status
- Pending approvals
- Approved agreements
- Rejected agreements
- Approval history

## 🚀 Next Steps

1. **Test the Integration**: Try the example queries
2. **Add OpenAI** (Optional): For better natural language understanding
3. **Customize Patterns**: Add your own query patterns
4. **Monitor Usage**: Check server logs for query patterns

## 📞 Support

If you encounter issues:
1. Check server logs for error messages
2. Verify database connection
3. Test with example queries first
4. Check `.env` configuration

---

**Happy Querying!** 🎉

