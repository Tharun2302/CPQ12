const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

/**
 * Extract placeholders from DOCX template file
 */
function extractPlaceholdersFromDocx(filePath) {
  try {
    console.log(`\n📄 Reading template file: ${filePath}\n`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return [];
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    const zip = new PizZip(fileBuffer);
    
    // Check if it's a valid DOCX
    if (!zip.files['word/document.xml']) {
      throw new Error('Not a valid DOCX file');
    }
    
    // Extract document content
    const documentXml = zip.files['word/document.xml'].asText();
    
    // Extract text from XML
    const textNodes = documentXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    let cleanText = '';
    
    if (textNodes) {
      textNodes.forEach(node => {
        const textMatch = node.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
        if (textMatch && textMatch[1]) {
          cleanText += textMatch[1];
        }
      });
    } else {
      // Fallback: Remove XML tags but preserve text content
      cleanText = documentXml
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Find all tokens in the format {{token}} - also check raw XML for split tokens
    const tokenRegex = /\{\{([^}]+)\}\}/g;
    const tokens = new Set();
    let match;
    
    // First, extract from clean text
    while ((match = tokenRegex.exec(cleanText)) !== null) {
      const token = match[1].trim();
      // Filter out tokens that contain XML markup or are malformed
      if (token && !token.includes('<') && !token.includes('>')) {
        tokens.add(token);
      }
    }
    
    // Also check raw XML for tokens that might be split across elements
    // Look for patterns like {{#token}} or {{/token}}
    const xmlTokenRegex = /\{\{([#/]?[^}]+)\}\}/g;
    let xmlMatch;
    while ((xmlMatch = xmlTokenRegex.exec(documentXml)) !== null) {
      const token = xmlMatch[1].trim();
      if (token && !token.includes('<') && !token.includes('>')) {
        tokens.add(token);
      }
    }
    
    return Array.from(tokens).sort();
  } catch (error) {
    console.error('❌ Error extracting placeholders:', error);
    return [];
  }
}

/**
 * Expected placeholders based on the image description
 */
const expectedPlaceholders = [
  'Company_Name',
  'Company Name',  // Also check for space version
  'users_count',
  'users_cost',
  'exhibitBundledPrice',
  'price_migration',
  'migrationBundled',
  'Duration_of_months',
  'instance_users',
  'instance_type',
  'instance_cost',
  'serverPriceBundled',
  'cfm_user_total',
  'cfm_user_total_b',
  'discount_percent_with_parentheses',
  'discount_amount',
  'total_price_discount',
  'cfm_total_b',
  // Also check for loop tokens
  '#exhibits',
  '/exhibits',
  '#servers',
  '/servers'
];

/**
 * Main function
 */
async function checkPlaceholders() {
  // Try different possible filenames
  const possiblePaths = [
    path.join(__dirname, 'backend-templates', 'slack-to-google-chat-std.docx'),
    path.join(__dirname, 'backend-templates', 'slack-to-google-chat-standard.docx'),
    path.join(__dirname, 'backend-templates', 'slack-to-google-chat-std.docx')
  ];
  
  let templatePath = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      templatePath = possiblePath;
      break;
    }
  }
  
  if (!templatePath) {
    console.error('❌ Template file not found. Tried:');
    possiblePaths.forEach(p => console.error(`   - ${p}`));
    return;
  }
  
  console.log('🔍 Checking placeholders in Slack to Google Chat Standard template...\n');
  console.log('=' .repeat(80));
  
  // Read file for loop token check
  const fileBuffer = fs.readFileSync(templatePath);
  const zip = new PizZip(fileBuffer);
  
  const foundPlaceholders = extractPlaceholdersFromDocx(templatePath);
  
  console.log(`\n✅ Found ${foundPlaceholders.length} unique placeholders in template:\n`);
  foundPlaceholders.forEach((token, index) => {
    console.log(`  ${index + 1}. {{${token}}}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 Expected Placeholders (from image description):\n');
  expectedPlaceholders.forEach((token, index) => {
    const found = foundPlaceholders.includes(token);
    const status = found ? '✅' : '❌';
    console.log(`  ${status} ${index + 1}. {{${token}}}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\n🔍 Comparison Results:\n');
  
  const missing = expectedPlaceholders.filter(token => !foundPlaceholders.includes(token));
  const extra = foundPlaceholders.filter(token => !expectedPlaceholders.includes(token));
  
  if (missing.length > 0) {
    console.log(`❌ Missing placeholders (${missing.length}):`);
    missing.forEach(token => {
      console.log(`   - {{${token}}}`);
    });
  } else {
    console.log('✅ All expected placeholders found!');
  }
  
  if (extra.length > 0) {
    console.log(`\n➕ Additional placeholders found (${extra.length}):`);
    extra.forEach(token => {
      console.log(`   - {{${token}}}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`   Total placeholders in template: ${foundPlaceholders.length}`);
  console.log(`   Expected placeholders: ${expectedPlaceholders.length}`);
  console.log(`   Missing: ${missing.length}`);
  console.log(`   Extra: ${extra.length}`);
  const matchCount = expectedPlaceholders.length - missing.length;
  console.log(`   Match rate: ${((matchCount / expectedPlaceholders.length) * 100).toFixed(1)}%`);
  
  // Check for common variations
  console.log('\n🔍 Checking for common placeholder variations:\n');
  const variations = {
    'Company_Name': ['Company Name', 'company name', 'CompanyName'],
    'users_count': ['userscount', 'users', 'number_of_users'],
    'Duration_of_months': ['Duration of months', 'duration_months', 'duration'],
    'instance_type': ['instanceType', 'instance type'],
    'instance_cost': ['instanceCost', 'instance cost', 'instance_type_cost'],
    'price_migration': ['migration_price', 'migrationPrice', 'migration cost'],
    'total_price_discount': ['total_after_discount', 'final_total', 'finalTotal'],
    'discount_amount': ['discount amount', 'discountAmount'],
    'cfm_user_total': ['cloudfuze_manage_user_total', 'cloudfuzeManageUserTotal'],
    'cfm_user_total_b': ['cloudfuze_manage_user_total_bundled', 'cfm_user_bundled'],
    'cfm_total_b': ['cloudfuze_manage_total_bundled', 'cfm_total_bundled'],
    'migrationBundled': ['price_migration_bundled', 'migration_cost_bundled'],
    'serverPriceBundled': ['serverBundledPrice', 'server_price_bundled']
  };
  
  Object.entries(variations).forEach(([expected, alts]) => {
    const found = foundPlaceholders.includes(expected);
    if (!found) {
      const foundAlt = alts.find(alt => foundPlaceholders.includes(alt));
      if (foundAlt) {
        console.log(`   ⚠️  {{${expected}}} not found, but found variation: {{${foundAlt}}}`);
      }
    }
  });
  
  // Additional check: Look for loop tokens in raw XML
  console.log('\n🔍 Checking for loop tokens in raw XML...\n');
  const documentXml = zip.files['word/document.xml'].asText();
  
  const loopPatterns = [
    { name: 'exhibits loop start', pattern: /#exhibits/i },
    { name: 'exhibits loop end', pattern: /\/exhibits/i },
    { name: 'servers loop start', pattern: /#servers/i },
    { name: 'servers loop end', pattern: /\/servers/i }
  ];
  
  loopPatterns.forEach(({ name, pattern }) => {
    const matches = documentXml.match(pattern);
    if (matches) {
      console.log(`   ✅ Found ${name}: ${matches.length} occurrence(s)`);
      // Show context around the match
      const matchIndex = documentXml.search(pattern);
      if (matchIndex !== -1) {
        const context = documentXml.substring(Math.max(0, matchIndex - 50), Math.min(documentXml.length, matchIndex + 100));
        console.log(`      Context: ...${context.replace(/\s+/g, ' ').substring(0, 150)}...`);
      }
    } else {
      console.log(`   ❌ ${name} not found`);
    }
  });
  
  console.log('\n✅ Placeholder check complete!\n');
}

// Run the check
checkPlaceholders().catch(console.error);


