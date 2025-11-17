const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const trainingCollector = require('./training-data-collector.cjs');
const TRAINING_FILE = path.join(trainingCollector.TRAINING_DATA_DIR, 'ollama-training.jsonl');

/**
 * Step 3: Fine-tune Llama Model with Training Data
 * 
 * This script will:
 * 1. Verify training data exists
 * 2. Create a Modelfile for Ollama
 * 3. Fine-tune the model using Ollama
 */

console.log('🎯 Step 3: Fine-Tuning Llama Model\n');

// Check if training data exists
if (!fs.existsSync(TRAINING_FILE)) {
  console.log('❌ Training data not found!');
  console.log('💡 Run: node convert-training-format.cjs first');
  process.exit(1);
}

const trainingData = fs.readFileSync(TRAINING_FILE, 'utf8');
const lines = trainingData.trim().split('\n').filter(line => line.trim());
const exampleCount = lines.length;

console.log(`📊 Training Data:`);
console.log(`   - File: ${TRAINING_FILE}`);
console.log(`   - Examples: ${exampleCount}`);
console.log('');

if (exampleCount < 10) {
  console.log('⚠️  Warning: Less than 10 examples. More data recommended for better results.');
  console.log('');
}

// Model configuration
const BASE_MODEL = process.env.LLM_MODEL || 'llama2';
const FINE_TUNED_MODEL_NAME = `sql-agent-${BASE_MODEL}`;
const MODELFILE_PATH = path.join(trainingCollector.TRAINING_DATA_DIR, 'Modelfile');

console.log(`🤖 Model Configuration:`);
console.log(`   - Base Model: ${BASE_MODEL}`);
console.log(`   - Fine-tuned Model: ${FINE_TUNED_MODEL_NAME}`);
console.log('');

/**
 * Create Modelfile for Ollama
 * Note: Ollama doesn't support traditional fine-tuning, but we can:
 * 1. Use system prompts to guide behavior (this Modelfile)
 * 2. Include example patterns in the system prompt
 */
function createModelfile() {
  console.log('📝 Creating Modelfile with enhanced system prompt...');
  
  // Read a few examples to include in the system prompt
  const trainingData = fs.readFileSync(TRAINING_FILE, 'utf8');
  const lines = trainingData.trim().split('\n').filter(line => line.trim());
  const examples = lines.slice(0, 5).map(line => {
    try {
      const data = JSON.parse(line);
      return {
        prompt: data.prompt.split('User Question:')[1]?.split('\n\nSQL Query:')[0]?.trim() || '',
        completion: data.completion
      };
    } catch (e) {
      return null;
    }
  }).filter(e => e && e.prompt);

  // Build system prompt with examples
  let systemPrompt = `You are a SQL expert. Given a database schema, generate MySQL SELECT queries from natural language questions.

Rules:
- Generate ONLY SELECT queries (no INSERT, UPDATE, DELETE, DROP, ALTER)
- Use proper MySQL syntax
- Return ONLY the SQL query, no explanations, no markdown, no code blocks
- If user asks for a specific number (like "1 approval", "5 clients"), add LIMIT clause
- Use exact table and column names from the schema
- For counting, use COUNT(*) as alias

Examples:`;

  examples.forEach((ex, i) => {
    if (ex.prompt && ex.completion) {
      systemPrompt += `\n\nExample ${i + 1}:\nQuestion: ${ex.prompt}\nSQL: ${ex.completion}`;
    }
  });

  systemPrompt += `\n\nAlways follow these patterns and return ONLY the SQL query.`;

  const modelfileContent = `FROM ${BASE_MODEL}

# Enhanced SQL Agent Model
# Training examples: ${exampleCount}
# Database: lama

PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 4096

SYSTEM """${systemPrompt}"""
`;

  fs.writeFileSync(MODELFILE_PATH, modelfileContent, 'utf8');
  console.log(`✅ Modelfile created: ${MODELFILE_PATH}\n`);
  
  return MODELFILE_PATH;
}

/**
 * Create custom model using Ollama Modelfile
 * Note: Ollama doesn't support traditional weight-based fine-tuning
 * Instead, it uses system prompts and parameters to guide behavior
 */
async function createCustomModel() {
  console.log('🚀 Creating custom model with enhanced prompts...\n');
  
  // Create Modelfile first
  const modelfilePath = createModelfile();
  
  console.log('📋 Important Note:');
  console.log('─────────────────────────────────────────────────');
  console.log('Ollama uses Modelfiles for system prompts, not weight-based fine-tuning.');
  console.log('This approach improves behavior through better prompts and examples.');
  console.log('');
  console.log('For true fine-tuning (weight updates), you would need:');
  console.log('  - Unsloth or QLoRA to fine-tune the model');
  console.log('  - Then convert to Ollama format');
  console.log('');
  console.log('📋 Steps to Create Custom Model:');
  console.log('─────────────────────────────────────────────────');
  console.log(`1. Make sure Ollama is running: ollama serve`);
  console.log(`2. Create custom model:`);
  console.log(`   ollama create ${FINE_TUNED_MODEL_NAME} -f "${modelfilePath}"`);
  console.log(`3. Test the model:`);
  console.log(`   ollama run ${FINE_TUNED_MODEL_NAME} "How many deals done?"`);
  console.log('');
  
  // Check if Ollama is available
  return new Promise((resolve, reject) => {
    const checkOllama = spawn('ollama', ['list'], { shell: true });
    
    checkOllama.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Ollama is available');
        console.log('');
        console.log('🎯 Ready to create custom model!');
        console.log('');
        console.log('Run this command:');
        console.log(`   ollama create ${FINE_TUNED_MODEL_NAME} -f "${modelfilePath}"`);
        console.log('');
        resolve(true);
      } else {
        console.log('⚠️  Ollama not found in PATH');
        console.log('');
        console.log('📝 Manual Steps:');
        console.log(`1. Install Ollama: https://ollama.ai/download`);
        console.log(`2. Start Ollama: ollama serve`);
        console.log(`3. Run: ollama create ${FINE_TUNED_MODEL_NAME} -f "${modelfilePath}"`);
        console.log('');
        resolve(false);
      }
    });
    
    checkOllama.on('error', () => {
      console.log('⚠️  Ollama not found in PATH');
      console.log('');
      console.log('📝 Manual Steps:');
      console.log(`1. Install Ollama: https://ollama.ai/download`);
      console.log(`2. Start Ollama: ollama serve`);
      console.log(`3. Run: ollama create ${FINE_TUNED_MODEL_NAME} -f "${modelfilePath}"`);
      console.log('');
      resolve(false);
    });
  });
}


// Main execution
async function main() {
  try {
    await createCustomModel();
    
    console.log('✅ Custom model setup complete!');
    console.log('');
    console.log('📁 Files ready:');
    console.log(`   - Modelfile: ${MODELFILE_PATH}`);
    console.log(`   - Training data: ${TRAINING_FILE}`);
    console.log('');
    console.log('🎯 Next Steps:');
    console.log(`   1. Create model: ollama create ${FINE_TUNED_MODEL_NAME} -f "${MODELFILE_PATH}"`);
    console.log(`   2. Update .env: LLM_MODEL=${FINE_TUNED_MODEL_NAME}`);
    console.log(`   3. Restart your backend server`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  createCustomModel,
  createModelfile,
  FINE_TUNED_MODEL_NAME,
  MODELFILE_PATH
};

