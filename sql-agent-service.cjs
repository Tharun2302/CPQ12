const mysql = require('mysql2/promise');
require('dotenv').config();
const trainingCollector = require('./training-data-collector.cjs');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'lama',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// LLM Configuration (Ollama or other local LLM)
const LLM_API_URL = process.env.LLM_API_URL || 'http://localhost:11434/api/generate';
const LLM_MODEL = process.env.LLM_MODEL || 'llama2'; // or 'llama3', 'mistral', etc.

// Database schema information for the SQL agent
const DATABASE_SCHEMA = `
Database: lama

Tables:
1. quotes
   - id (VARCHAR(36), PRIMARY KEY)
   - client_name (VARCHAR(255))
   - client_email (VARCHAR(255))
   - company (VARCHAR(255))
   - configuration (JSON)
   - selected_tier (JSON)
   - calculation (JSON)
   - status (ENUM: 'draft', 'sent', 'viewed', 'accepted', 'rejected')
   - created_at (TIMESTAMP)
   - updated_at (TIMESTAMP)

2. signature_forms
   - id (INT, PRIMARY KEY, AUTO_INCREMENT)
   - form_id (VARCHAR(255), UNIQUE)
   - quote_id (VARCHAR(255))
   - client_email (VARCHAR(255))
   - client_name (VARCHAR(255))
   - quote_data (JSON)
   - status (ENUM: 'pending', 'completed', 'expired')
   - approval_status (ENUM: 'pending', 'approved', 'rejected')
   - signature_data (JSON)
   - client_comments (TEXT)
   - created_at (TIMESTAMP)
   - expires_at (TIMESTAMP)
   - completed_at (TIMESTAMP)
   - updated_at (TIMESTAMP)

3. templates
   - id (VARCHAR(36), PRIMARY KEY)
   - name (VARCHAR(255))
   - description (TEXT)
   - file_name (VARCHAR(255))
   - file_type (ENUM: 'pdf', 'docx')
   - file_data (LONGBLOB)
   - file_size (INT)
   - is_default (BOOLEAN)
   - created_at (TIMESTAMP)
   - updated_at (TIMESTAMP)

4. hubspot_integrations
   - id (VARCHAR(36), PRIMARY KEY)
   - quote_id (VARCHAR(36))
   - contact_id (VARCHAR(255))
   - deal_id (VARCHAR(255))
   - status (ENUM: 'pending', 'success', 'failed')
   - created_at (TIMESTAMP)

5. pricing_tiers
   - id (VARCHAR(36), PRIMARY KEY)
   - name (VARCHAR(100))
   - per_user_cost (DECIMAL(10,2))
   - per_gb_cost (DECIMAL(10,2))
   - managed_migration_cost (DECIMAL(10,2))
   - instance_cost (DECIMAL(10,2))
   - user_limits (JSON)
   - gb_limits (JSON)
   - features (JSON)
   - created_at (TIMESTAMP)
   - updated_at (TIMESTAMP)
`;

// Common query patterns (rule-based fallback)
const QUERY_PATTERNS = {
  'how many deals': {
    sql: `SELECT COUNT(*) as total_deals FROM hubspot_integrations WHERE status = 'success'`,
    description: 'Count of successful deals'
  },
  'how many deals done': {
    sql: `SELECT COUNT(*) as total_deals FROM hubspot_integrations WHERE status = 'success'`,
    description: 'Count of completed deals'
  },
  'client names': {
    sql: `SELECT DISTINCT client_name, client_email, company FROM quotes ORDER BY client_name`,
    description: 'List of all client names'
  },
  'clients': {
    sql: `SELECT DISTINCT client_name, client_email, company FROM quotes ORDER BY client_name`,
    description: 'List of all clients'
  },
  'show clients': {
    sql: `SELECT DISTINCT client_name, client_email, company FROM quotes ORDER BY client_name`,
    description: 'Show all clients'
  },
  'show client': {
    sql: `SELECT DISTINCT client_name, client_email, company FROM quotes ORDER BY client_name`,
    description: 'Show all clients'
  },
  'client name': {
    sql: `SELECT DISTINCT client_name, client_email, company FROM quotes ORDER BY client_name`,
    description: 'List of all client names'
  },
  'client serials': {
    sql: `SELECT id as serial, client_name, client_email, company, created_at FROM quotes ORDER BY created_at DESC`,
    description: 'Client serials (quote IDs)'
  },
  'templates': {
    sql: `SELECT id, name, description, file_type, is_default, created_at FROM templates ORDER BY created_at DESC`,
    description: 'List of all templates'
  },
  'approval status': {
    sql: `SELECT form_id, client_name, client_email, approval_status, status, created_at FROM signature_forms ORDER BY created_at DESC`,
    description: 'Agreement approval status'
  },
  'pending approvals': {
    sql: `SELECT COUNT(*) as pending_count FROM signature_forms WHERE approval_status = 'pending'`,
    description: 'Count of pending approvals'
  },
  'approved agreements': {
    sql: `SELECT COUNT(*) as approved_count FROM signature_forms WHERE approval_status = 'approved'`,
    description: 'Count of approved agreements'
  },
  'rejected agreements': {
    sql: `SELECT COUNT(*) as rejected_count FROM signature_forms WHERE approval_status = 'rejected'`,
    description: 'Count of rejected agreements'
  },
  // Deals grouped by status (predefined to avoid LLM timeout for this common query)
  'deals grouped by status': {
    sql: `SELECT status, COUNT(*) as count_of_deals FROM hubspot_integrations GROUP BY status`,
    description: 'Deals grouped by status with counts'
  },
  'grouped by status': {
    sql: `SELECT status, COUNT(*) as count_of_deals FROM hubspot_integrations GROUP BY status`,
    description: 'Deals grouped by status with counts'
  }
};

/**
 * Call local LLM (Ollama) to generate SQL from natural language
 */
async function callLLMForSQL(userQuery) {
  try {
    // Use built-in fetch (Node 18+) or node-fetch as fallback
    let fetch;
    try {
      fetch = globalThis.fetch;
    } catch {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    
    // Use a shorter prompt for fine-tuned models to improve latency and avoid timeouts
    const isFineTunedModel = LLM_MODEL && LLM_MODEL.toLowerCase().startsWith('sql-agent');
    const prompt = isFineTunedModel
      ? `You are the fine-tuned SQL agent model for the CPQ "lama" database.

IMPORTANT RULES:
- Generate ONLY a MySQL SELECT query (no INSERT, UPDATE, DELETE, DROP, ALTER)
- Use proper MySQL syntax
- Return ONLY the SQL query, no explanations, no markdown, no code blocks
- If the user asks for a specific number (like "1 approval", "5 clients", "show 10 deals"), you MUST add a LIMIT clause with that number
- For counting, use COUNT(*) as alias
- Use the known tables and columns from your training (quotes, signature_forms, templates, hubspot_integrations, pricing_tiers)
- If the question is unclear, return a simple safe SELECT query.

User Question: ${userQuery}

SQL Query:`
      : `You are a SQL expert. Given the following database schema, generate a MySQL SELECT query for: "${userQuery}"

${DATABASE_SCHEMA}

IMPORTANT RULES:
- Generate ONLY a SELECT query (no INSERT, UPDATE, DELETE, DROP, ALTER)
- Use proper MySQL syntax
- Return ONLY the SQL query, no explanations, no markdown, no code blocks
- For counting, use COUNT(*) as alias
- Use exact table and column names from the schema
- CRITICAL: If user asks for a specific number (like "1 approval", "5 clients", "show 10 deals"), you MUST add LIMIT clause with that number
- Examples: "give 1 approval" → add LIMIT 1, "show 5 clients" → add LIMIT 5
- If the query is unclear, return a simple SELECT query

User Question: ${userQuery}

SQL Query:`;

    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          top_p: 0.9,
          // Limit output tokens to keep responses fast and within timeout
          num_predict: 128
        }
      }),
      // Increased timeout to 120 seconds to avoid premature LLM timeouts
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let sql = data.response || data.text || '';
    
    // Clean up the SQL response
    sql = sql.trim();
    
    // Remove markdown code blocks if present
    sql = sql.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
    
    // Remove any explanatory text before SELECT
    const selectIndex = sql.toUpperCase().indexOf('SELECT');
    if (selectIndex > 0) {
      sql = sql.substring(selectIndex);
    }
    
    // Extract only the SQL query (stop at semicolon or newline)
    sql = sql.split(';')[0].split('\n')[0].trim();
    
    // Security check: Only allow SELECT statements
    if (!sql.toUpperCase().startsWith('SELECT')) {
      throw new Error('LLM generated non-SELECT query. Only SELECT queries are allowed.');
    }

    return sql;
  } catch (error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      throw new Error('LLM request timed out. Make sure Ollama is running on http://localhost:11434');
    }
    console.error('LLM API error:', error.message);
    throw error;
  }
}

/**
 * Extract number from query (for LIMIT clauses)
 * Handles both numeric (1, 2, 3) and word forms (one, two, three)
 */
function extractNumber(query) {
  // First try numeric match
  const numericMatch = query.match(/\b(\d+)\b/);
  if (numericMatch) {
    return parseInt(numericMatch[1]);
  }
  
  // Then try word forms
  const wordNumbers = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };
  
  for (const [word, num] of Object.entries(wordNumbers)) {
    if (query.includes(` ${word} `) || query.startsWith(`${word} `) || query.endsWith(` ${word}`)) {
      return num;
    }
  }
  
  return null;
}

/**
 * Generate SQL query from natural language using LLM (primary) or rule-based (fallback)
 */
async function generateSQLQuery(userQuery) {
  // Allow forcing LLM by prefixing query with "llm:" or "llama:"
  let rawQuery = userQuery || '';
  const forceLLMPrefix = /^(llm|llama)[:\-]\s*/i;
  const forceLLM = forceLLMPrefix.test(rawQuery.trim());
  if (forceLLM) {
    rawQuery = rawQuery.trim().replace(forceLLMPrefix, '');
  }

  const queryLower = rawQuery.toLowerCase().trim();
  
  // Fix common typos
  const fixedQuery = queryLower
    .replace(/clinet/gi, 'client')
    .replace(/aprov/gi, 'approv')
    .replace(/templete/gi, 'template')
    .replace(/deal/gi, 'deal');
  
  // Extract number from query for LIMIT (before pattern matching)
  const requestedNumber = extractNumber(fixedQuery);
  
  // Check if we have a simple pattern match first (fast path)
  // This helps avoid LLM timeout for common queries
  // Skip this if user explicitly forced LLM with "llm:" / "llama:" prefix
  if (!forceLLM) {
    for (const [pattern, config] of Object.entries(QUERY_PATTERNS)) {
      if (fixedQuery.includes(pattern)) {
        let sql = config.sql;
        
        // If query has a number, add LIMIT to rule-based query
        if (requestedNumber && requestedNumber > 0) {
          if (!sql.toUpperCase().includes('LIMIT')) {
            sql = sql + ` LIMIT ${requestedNumber}`;
          } else {
            sql = sql.replace(/LIMIT\s+\d+/i, `LIMIT ${requestedNumber}`);
          }
        }
        
        console.log('✅ Using rule-based pattern for:', userQuery);
        return {
          sql: sql,
          description: requestedNumber 
            ? `${config.description} (showing ${requestedNumber} result${requestedNumber > 1 ? 's' : ''})`
            : config.description,
          method: 'rule-based'
        };
      }
    }
  }
  
  // PRIMARY: Try LLM for complex queries (this is the SQL Agent with Llama)
  try {
    console.log('🤖 Using LLM (Llama) to generate SQL for query:', rawQuery);
    
    // Add timeout wrapper for LLM call (increased for better reliability)
    let sql = await Promise.race([
      callLLMForSQL(fixedQuery),
      new Promise((_, reject) => 
        // Match the 120 second timeout used in callLLMForSQL
        setTimeout(() => reject(new Error('LLM request timeout after 120 seconds')), 120000)
      )
    ]);
    
    // ENFORCEMENT: If user asked for a specific number, ensure LIMIT is added
    if (requestedNumber && requestedNumber > 0) {
      const sqlUpper = sql.toUpperCase();
      
      // Check if LIMIT already exists
      const limitMatch = sqlUpper.match(/LIMIT\s+(\d+)/i);
      
      if (limitMatch) {
        // LIMIT exists - replace with requested number
        sql = sql.replace(/LIMIT\s+\d+/i, `LIMIT ${requestedNumber}`);
        console.log(`✅ Updated LIMIT to ${requestedNumber}`);
      } else {
        // No LIMIT found - add it
        sql = sql.trim();
        // Remove trailing semicolon if present
        sql = sql.replace(/;?\s*$/, '');
        sql = sql + ` LIMIT ${requestedNumber}`;
        console.log(`✅ Added LIMIT ${requestedNumber} to SQL`);
      }
    }
    
    return {
      sql: sql,
      description: requestedNumber 
        ? `Generated SQL query for: ${userQuery} (showing ${requestedNumber} result${requestedNumber > 1 ? 's' : ''})`
        : `Generated SQL query for: ${userQuery}`,
      method: 'llm'
    };
  } catch (error) {
    console.error('LLM error, falling back to rule-based:', error.message);
    
    // FALLBACK: If LLM fails, try rule-based patterns
    for (const [pattern, config] of Object.entries(QUERY_PATTERNS)) {
      if (fixedQuery.includes(pattern)) {
        let sql = config.sql;
        
        // If query has a number, add LIMIT to rule-based query
        if (requestedNumber && requestedNumber > 0) {
          if (!sql.toUpperCase().includes('LIMIT')) {
            sql = sql + ` LIMIT ${requestedNumber}`;
          } else {
            sql = sql.replace(/LIMIT\s+\d+/i, `LIMIT ${requestedNumber}`);
          }
        }
        
        console.log('✅ Using rule-based fallback for:', userQuery);
        return {
          sql: sql,
          description: requestedNumber 
            ? `${config.description} (showing ${requestedNumber} result${requestedNumber > 1 ? 's' : ''})`
            : config.description,
          method: 'rule-based (fallback)'
        };
      }
    }
    
    // If both LLM and rule-based fail
    if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
      return {
        sql: null,
        description: `LLM server not responding. Make sure Ollama is running: "ollama serve". Error: ${error.message}`,
        method: 'error'
      };
    }
    
    return {
      sql: null,
      description: `Could not understand the query. Try asking about: deals, client names, templates, or approval status. Error: ${error.message}`,
      method: 'error'
    };
  }
}

/**
 * Execute SQL query safely
 */
async function executeQuery(sql) {
  if (!sql) {
    throw new Error('No SQL query provided');
  }

  // Security: Only allow SELECT statements
  const sqlUpper = sql.trim().toUpperCase();
  if (!sqlUpper.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed for security');
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(sql);
    return rows;
  } catch (error) {
    console.error('SQL execution error:', error);
    throw new Error(`Database error: ${error.message}`);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Main function to process natural language query
 * Flow: User Prompt → LLM converts to SQL → Backend executes → Returns results
 */
async function processQuery(userQuery) {
  try {
    console.log('📝 Processing query:', userQuery);
    
    // Step 1: Generate SQL from natural language (using LLM or rule-based)
    const { sql, description, method } = await generateSQLQuery(userQuery);
    
    if (!sql) {
      return {
        success: false,
        error: description,
        query: userQuery
      };
    }

    console.log(`✅ Generated SQL (${method}):`, sql);

    // Step 2: Execute the SQL query
    const results = await executeQuery(sql);
    
    console.log(`✅ Query executed, returned ${results.length} rows`);
    
    // Step 3: Log for training data collection (only successful queries)
    if (sql && method) {
      trainingCollector.logQuery(userQuery, sql, method, results);
    }
    
    // Step 4: Return results
    return {
      success: true,
      query: userQuery,
      sql: sql,
      description: description,
      method: method,
      results: results,
      rowCount: results.length
    };
  } catch (error) {
    console.error('Query processing error:', error);
    return {
      success: false,
      error: error.message,
      query: userQuery
    };
  }
}

/**
 * Get database schema information
 */
function getSchemaInfo() {
  return {
    schema: DATABASE_SCHEMA,
    availableQueries: Object.keys(QUERY_PATTERNS).map(key => ({
      pattern: key,
      description: QUERY_PATTERNS[key].description
    })),
    llmConfig: {
      apiUrl: LLM_API_URL,
      model: LLM_MODEL,
      enabled: true
    },
    trainingData: {
      count: trainingCollector.getTrainingDataCount(),
      file: trainingCollector.TRAINING_DATA_FILE
    }
  };
}

/**
 * Test LLM connection
 */
async function testLLMConnection() {
  try {
    // Use built-in fetch (Node 18+) or node-fetch as fallback
    let fetch;
    try {
      fetch = globalThis.fetch;
    } catch {
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
    }
    const response = await fetch(`${LLM_API_URL.replace('/api/generate', '/api/tags')}`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        models: data.models || [],
        message: 'LLM server is accessible'
      };
    }
    return {
      success: false,
      message: 'LLM server responded but with error'
    };
  } catch (error) {
    return {
      success: false,
      message: `LLM server not accessible: ${error.message}`,
      suggestion: 'Make sure Ollama is running on ' + LLM_API_URL
    };
  }
}

module.exports = {
  processQuery,
  getSchemaInfo,
  executeQuery,
  generateSQLQuery,
  testLLMConnection,
  getTrainingData: () => trainingCollector.getTrainingExamples(),
  getTrainingDataCount: () => trainingCollector.getTrainingDataCount(),
  exportTrainingData: (format) => trainingCollector.exportTrainingData(format),
  clearTrainingData: () => trainingCollector.clearTrainingData()
};
