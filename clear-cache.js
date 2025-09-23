// Frontend Cache Clearing Script
console.log('🧹 Clearing CPQ frontend cache...');

// Clear all template-related localStorage
const keysToRemove = [
  'cpq_templates',
  'cpq_selectedTemplate',
  'cpq_configuration',
  'cpq_templates_timestamp'
];

keysToRemove.forEach(key => {
  const removed = localStorage.removeItem(key);
  console.log('✅ Cleared:', key);
});

// Clear sessionStorage too
sessionStorage.clear();
console.log('✅ Cleared sessionStorage');

// Force reload to fetch fresh templates
console.log('🔄 Reloading page to fetch fresh templates...');
location.reload(true);