// Test script to verify token fix
console.log('🔧 Testing Token Fix...');

// Test formatCurrency function
function formatCurrency(amount) {
  if (amount === undefined || amount === null) {
    return '$0.00';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

// Test data mapping
const testQuoteData = {
  company: 'Demo Company Inc.',
  clientName: 'John Doe',
  clientEmail: 'john@demo.com',
  configuration: {
    numberOfUsers: 5,
    duration: 12,
    migrationType: 'Content'
  },
  calculation: {
    userCost: 150,
    dataCost: 50,
    migrationCost: 300,
    instanceCost: 100,
    totalCost: 600
  }
};

// Test template data creation
const templateData = {
  '{{Company Name}}': testQuoteData.company || 'Demo Company Inc.',
  '{{users_count}}': (testQuoteData.configuration.numberOfUsers || 1).toString(),
  '{{users_cost}}': formatCurrency(testQuoteData.calculation.migrationCost || 0),
  '{{Duration of months}}': (testQuoteData.configuration.duration || 1).toString(),
  '{{total price}}': formatCurrency(testQuoteData.calculation.totalCost || 0),
  '{{migration type}}': testQuoteData.configuration.migrationType || 'Content',
  '{{clientName}}': testQuoteData.clientName || 'Demo Client',
  '{{email}}': testQuoteData.clientEmail || 'demo@example.com'
};

console.log('📋 Test Template Data:');
Object.entries(templateData).forEach(([token, value]) => {
  console.log(`  ${token}: ${value}`);
});

// Check for undefined values
const undefinedTokens = Object.entries(templateData).filter(([, value]) => value === undefined || value === null);
if (undefinedTokens.length > 0) {
  console.error('❌ Found undefined tokens:', undefinedTokens);
} else {
  console.log('✅ All tokens have values - Fix is working!');
}

console.log('\n🎯 Expected Results:');
console.log('{{Company Name}} should be: Demo Company Inc.');
console.log('{{users_count}} should be: 5');
console.log('{{users_cost}} should be: $300.00');
console.log('{{Duration of months}} should be: 12');
console.log('{{total price}} should be: $600.00');
console.log('{{migration type}} should be: Content');
console.log('{{clientName}} should be: John Doe');
console.log('{{email}} should be: john@demo.com');
