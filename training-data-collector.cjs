const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Training data storage
const TRAINING_DATA_DIR = path.join(__dirname, 'training-data');
const TRAINING_DATA_FILE = path.join(TRAINING_DATA_DIR, 'query-examples.jsonl');

// Ensure directory exists
if (!fs.existsSync(TRAINING_DATA_DIR)) {
  fs.mkdirSync(TRAINING_DATA_DIR, { recursive: true });
}

/**
 * Log a successful query for training data collection
 * Format: {user_query, sql, method, timestamp}
 */
function logQuery(userQuery, sql, method, results = null) {
  try {
    const trainingExample = {
      user_query: userQuery,
      sql_query: sql,
      method: method, // 'rule-based' or 'llm'
      timestamp: new Date().toISOString(),
      results_count: results ? results.length : null
    };

    // Append to JSONL file (one JSON object per line)
    const line = JSON.stringify(trainingExample) + '\n';
    fs.appendFileSync(TRAINING_DATA_FILE, line, 'utf8');
    
    console.log('📝 Training data logged:', userQuery.substring(0, 50) + '...');
    return true;
  } catch (error) {
    console.error('❌ Error logging training data:', error.message);
    return false;
  }
}

/**
 * Get all collected training examples
 */
function getTrainingExamples() {
  try {
    if (!fs.existsSync(TRAINING_DATA_FILE)) {
      return [];
    }

    const content = fs.readFileSync(TRAINING_DATA_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error('❌ Error reading training data:', error.message);
    return [];
  }
}

/**
 * Get training examples count
 */
function getTrainingDataCount() {
  try {
    if (!fs.existsSync(TRAINING_DATA_FILE)) {
      return 0;
    }
    const content = fs.readFileSync(TRAINING_DATA_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.length;
  } catch (error) {
    return 0;
  }
}

/**
 * Clear training data (for fresh start)
 */
function clearTrainingData() {
  try {
    if (fs.existsSync(TRAINING_DATA_FILE)) {
      fs.unlinkSync(TRAINING_DATA_FILE);
      console.log('✅ Training data cleared');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error clearing training data:', error.message);
    return false;
  }
}

/**
 * Export training data in different formats
 */
function exportTrainingData(format = 'jsonl') {
  const examples = getTrainingExamples();
  
  if (format === 'jsonl') {
    return TRAINING_DATA_FILE; // Already in JSONL format
  } else if (format === 'json') {
    const jsonFile = path.join(TRAINING_DATA_DIR, 'query-examples.json');
    fs.writeFileSync(jsonFile, JSON.stringify(examples, null, 2), 'utf8');
    return jsonFile;
  } else if (format === 'csv') {
    const csvFile = path.join(TRAINING_DATA_DIR, 'query-examples.csv');
    const headers = 'user_query,sql_query,method,timestamp,results_count\n';
    const rows = examples.map(ex => 
      `"${ex.user_query.replace(/"/g, '""')}","${ex.sql_query.replace(/"/g, '""')}",${ex.method},${ex.timestamp},${ex.results_count || ''}`
    ).join('\n');
    fs.writeFileSync(csvFile, headers + rows, 'utf8');
    return csvFile;
  }
  
  return null;
}

module.exports = {
  logQuery,
  getTrainingExamples,
  getTrainingDataCount,
  clearTrainingData,
  exportTrainingData,
  TRAINING_DATA_DIR,
  TRAINING_DATA_FILE
};

