const trainingCollector = require('./training-data-collector.cjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database schema for prompt generation
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

/**
 * Convert training examples to fine-tuning format
 * Format: prompt-completion pairs for LLM training
 */
function convertToTrainingFormat(examples) {
  const trainingPairs = examples.map(example => {
    // Create prompt (same as what we send to LLM)
    const prompt = `You are a SQL expert. Given the following database schema, generate a MySQL SELECT query for: "${example.user_query}"

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

User Question: ${example.user_query}

SQL Query:`;

    // Completion is the SQL query
    const completion = example.sql_query.trim();

    return {
      prompt: prompt,
      completion: completion,
      user_query: example.user_query,
      sql_query: example.sql_query,
      method: example.method
    };
  });

  return trainingPairs;
}

/**
 * Convert to Ollama fine-tuning format (Modelfile format)
 */
function convertToOllamaFormat(trainingPairs) {
  const outputDir = trainingCollector.TRAINING_DATA_DIR;
  const outputFile = path.join(outputDir, 'ollama-training.jsonl');
  
  // Ollama uses JSONL format with specific structure
  const ollamaFormat = trainingPairs.map(pair => {
    return {
      prompt: pair.prompt,
      completion: pair.completion
    };
  });

  // Write JSONL file
  const lines = ollamaFormat.map(item => JSON.stringify(item)).join('\n');
  fs.writeFileSync(outputFile, lines, 'utf8');
  
  return outputFile;
}


/**
 * Main conversion function
 */
function convertTrainingData() {
  console.log('🔄 Converting training data to fine-tuning format...\n');

  // Get all training examples
  const examples = trainingCollector.getTrainingExamples();
  
  if (examples.length === 0) {
    console.log('❌ No training data found!');
    console.log('💡 Run: node create-initial-training-data.cjs');
    return;
  }

  console.log(`📊 Found ${examples.length} training examples\n`);

  // Convert to training format
  const trainingPairs = convertToTrainingFormat(examples);
  console.log(`✅ Converted ${trainingPairs.length} examples to training format\n`);

  // Convert to Ollama format (the only format we need)
  console.log('📝 Generating training file...\n');

  const ollamaFile = convertToOllamaFormat(trainingPairs);
  console.log(`✅ Ollama format: ${ollamaFile}`);

  console.log(`\n📊 Summary:`);
  console.log(`   - Total examples: ${examples.length}`);
  console.log(`   - Rule-based: ${examples.filter(e => e.method === 'rule-based').length}`);
  console.log(`   - LLM examples: ${examples.filter(e => e.method === 'llm').length}`);
  console.log(`   - With numbers: ${examples.filter(e => e.user_query.match(/\d+/)).length}`);

  console.log(`\n✅ Training data ready for fine-tuning!`);
  console.log(`\n📁 Files created in: ${trainingCollector.TRAINING_DATA_DIR}`);
  console.log(`\n🎯 Next Step: Use these files to fine-tune your model`);

  return {
    ollama: ollamaFile,
    count: examples.length
  };
}

// Run if called directly
if (require.main === module) {
  convertTrainingData();
}

module.exports = {
  convertTrainingData,
  convertToTrainingFormat,
  convertToOllamaFormat
};

