const trainingCollector = require('./training-data-collector.cjs');
const fs = require('fs');
const path = require('path');

// Initial training data examples
const initialTrainingData = [
  {
    user_query: "How many deals done?",
    sql_query: "SELECT COUNT(*) as total_deals FROM hubspot_integrations WHERE status = 'success'",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 1
  },
  {
    user_query: "Show me all client names",
    sql_query: "SELECT DISTINCT client_name, client_email, company FROM quotes ORDER BY client_name",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 10
  },
  {
    user_query: "List all templates",
    sql_query: "SELECT id, name, description, file_type, is_default, created_at FROM templates ORDER BY created_at DESC",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 10
  },
  {
    user_query: "What is the approval status?",
    sql_query: "SELECT form_id, client_name, client_email, approval_status, status, created_at FROM signature_forms ORDER BY created_at DESC",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 10
  },
  {
    user_query: "Show me 2 clients",
    sql_query: "SELECT DISTINCT client_name, client_email, company FROM quotes ORDER BY client_name LIMIT 2",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 2
  },
  {
    user_query: "Give me 1 approval",
    sql_query: "SELECT form_id, client_name, client_email, approval_status, status, created_at FROM signature_forms ORDER BY created_at DESC LIMIT 1",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 1
  },
  {
    user_query: "List 5 templates",
    sql_query: "SELECT id, name, description, file_type, is_default, created_at FROM templates ORDER BY created_at DESC LIMIT 5",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 5
  },
  {
    user_query: "Show 3 deals",
    sql_query: "SELECT id, quote_id, deal_id, status, created_at FROM hubspot_integrations ORDER BY created_at DESC LIMIT 3",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 3
  },
  {
    user_query: "How many pending approvals?",
    sql_query: "SELECT COUNT(*) as pending_count FROM signature_forms WHERE approval_status = 'pending'",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 1
  },
  {
    user_query: "Show client serials",
    sql_query: "SELECT id as serial, client_name, client_email, company, created_at FROM quotes ORDER BY created_at DESC",
    method: "rule-based",
    timestamp: new Date().toISOString(),
    results_count: 10
  },
  {
    user_query: "Show me clients with pending approvals",
    sql_query: "SELECT DISTINCT q.client_name, q.client_email, q.company, sf.approval_status FROM quotes q JOIN signature_forms sf ON q.id = sf.quote_id WHERE sf.approval_status = 'pending'",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 4
  },
  {
    user_query: "List all approved agreements",
    sql_query: "SELECT form_id, client_name, client_email, approval_status, status, created_at FROM signature_forms WHERE approval_status = 'approved' ORDER BY created_at DESC",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 4
  },
  {
    user_query: "Show deals grouped by status",
    sql_query: "SELECT status, COUNT(*) as count FROM hubspot_integrations GROUP BY status",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 3
  },
  {
    user_query: "What clients have rejected quotes?",
    sql_query: "SELECT client_name, client_email, company, status FROM quotes WHERE status = 'rejected'",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 1
  },
  {
    user_query: "Show me templates that are default",
    sql_query: "SELECT id, name, description, file_type, is_default, created_at FROM templates WHERE is_default = true",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 1
  },
  {
    user_query: "Show me 2 clients with pending approvals",
    sql_query: "SELECT DISTINCT q.client_name, q.client_email, q.company, sf.approval_status FROM quotes q JOIN signature_forms sf ON q.id = sf.quote_id WHERE sf.approval_status = 'pending' LIMIT 2",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 2
  },
  {
    user_query: "Count how many quotes each client has",
    sql_query: "SELECT client_name, COUNT(*) as quote_count FROM quotes GROUP BY client_name ORDER BY quote_count DESC",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 10
  },
  {
    user_query: "Show me all accepted quotes",
    sql_query: "SELECT id, client_name, client_email, company, status, created_at FROM quotes WHERE status = 'accepted' ORDER BY created_at DESC",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 3
  },
  {
    user_query: "List rejected agreements",
    sql_query: "SELECT form_id, client_name, client_email, approval_status, status, created_at FROM signature_forms WHERE approval_status = 'rejected' ORDER BY created_at DESC",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 1
  },
  {
    user_query: "Show successful deals only",
    sql_query: "SELECT id, quote_id, deal_id, status, created_at FROM hubspot_integrations WHERE status = 'success' ORDER BY created_at DESC",
    method: "llm",
    timestamp: new Date().toISOString(),
    results_count: 6
  }
];

console.log('📝 Creating initial training data...\n');

// Clear existing data first
trainingCollector.clearTrainingData();

// Add all examples
let count = 0;
initialTrainingData.forEach(example => {
  if (trainingCollector.logQuery(
    example.user_query,
    example.sql_query,
    example.method,
    { length: example.results_count }
  )) {
    count++;
  }
});

console.log(`\n✅ Created ${count} training data examples!`);
console.log(`📁 File: ${trainingCollector.TRAINING_DATA_FILE}`);
console.log(`\n📊 Training data includes:`);
console.log(`   - ${initialTrainingData.filter(e => e.method === 'rule-based').length} rule-based examples`);
console.log(`   - ${initialTrainingData.filter(e => e.method === 'llm').length} LLM examples`);
console.log(`   - ${initialTrainingData.filter(e => e.user_query.match(/\d+/)).length} queries with numbers`);

// Show sample
const examples = trainingCollector.getTrainingExamples();
console.log(`\n📋 Sample examples:`);
examples.slice(0, 3).forEach((ex, idx) => {
  console.log(`\n${idx + 1}. Query: "${ex.user_query}"`);
  console.log(`   SQL: ${ex.sql_query.substring(0, 60)}...`);
});

console.log(`\n✅ Ready for Step 2: Generate training format!`);

