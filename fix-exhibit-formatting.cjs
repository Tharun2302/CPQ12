const fs = require('fs');
const path = require('path');

// Try to load adm-zip, fallback to manual ZIP handling if not available
let AdmZip;
try {
  AdmZip = require('adm-zip');
} catch (e) {
  console.error('❌ adm-zip package not found. Installing...');
  console.error('   Please run: npm install adm-zip');
  process.exit(1);
}

/**
 * Script to fix formatting issues and typos in exhibit Word documents
 */

const exhibitsDir = path.resolve(__dirname, 'backend-exhibits');

// Define fixes: [pattern to find, replacement, description]
const fixes = [
  // Typos
  ['Reacions', 'Reactions', 'Fix typo: Reacions → Reactions'],
  ['messgaes', 'messages', 'Fix typo: messgaes → messages'],
  ['assosiated', 'associated', 'Fix typo: assosiated → associated'],
  ['migrates', 'migrated', 'Fix typo: migrates → migrated'],
  ['permissios', 'permissions', 'Fix typo: permissios → permissions'],
  ['permissioins', 'permissions', 'Fix typo: permissioins → permissions'],
  
  // Content fixes for Slack to Teams "Not Included" document
  // These items are incorrectly described as included when they should be NOT included
  // We'll fix the descriptions to match the "NOT INCLUDED" context
  [
    'Migrating one-on-one conversations or direct messages from Slack to Teams, ensuring that private communication is transferred securely.',
    'Direct messages from Slack cannot be fully migrated to Teams. Some private conversations may not be transferred due to technical limitations.',
    'Fix: Direct Messages Migration description to reflect NOT INCLUDED status'
  ],
  [
    'Transferring user groups or teams from Slack to Teams, preserving the group structure and membership for seamless collaboration.',
    'User groups from Slack cannot be fully transferred to Teams. Group structure and membership may not be preserved during migration.',
    'Fix: User Groups description to reflect NOT INCLUDED status'
  ],
  [
    'Transferring regular messages from Slack to Teams, including text-based communication which user sent to himself.',
    'Self messages (messages sent by users to themselves) cannot be migrated from Slack to Teams.',
    'Fix: Self Messages description to reflect NOT INCLUDED status'
  ],
  
  // Formatting fixes for headers
  ['Exhibit 2 - NOT INCLUDED IN MIGRATION', 'Exhibit 2 - NOT INCLUDED IN MIGRATION FEATURES', 'Fix: Complete header text'],
];

/**
 * Fix a single Word document
 */
function fixWordDocument(filePath) {
  try {
    console.log(`\n📄 Processing: ${path.basename(filePath)}`);
    
    // Read the Word document (it's a ZIP file)
    const zip = new AdmZip(filePath);
    const documentXml = zip.readAsText('word/document.xml');
    
    if (!documentXml) {
      console.log('   ⚠️  Could not read document.xml');
      return false;
    }
    
    let modified = false;
    let updatedXml = documentXml;
    
    // Apply all fixes
    for (const [pattern, replacement, description] of fixes) {
      // Use case-insensitive regex to find the pattern
      // Word documents may have text split across XML tags, so we need to be careful
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      
      // Check if pattern exists (accounting for potential XML tag splits)
      // Word XML might have: <w:t>Reac</w:t><w:t>ions</w:t>
      // So we search in the raw XML text
      const beforeReplace = updatedXml;
      updatedXml = updatedXml.replace(regex, replacement);
      
      if (beforeReplace !== updatedXml) {
        console.log(`   ✅ ${description}`);
        modified = true;
      }
    }
    
    // If document was modified, save it
    if (modified) {
      zip.updateFile('word/document.xml', Buffer.from(updatedXml, 'utf8'));
      
      // Create backup
      const backupPath = filePath + '.backup';
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(filePath, backupPath);
        console.log(`   💾 Backup created: ${path.basename(backupPath)}`);
      }
      
      // Write the fixed document
      zip.writeZip(filePath);
      console.log(`   ✅ Fixed and saved: ${path.basename(filePath)}`);
      return true;
    } else {
      console.log(`   ℹ️  No issues found in this document`);
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error processing ${path.basename(filePath)}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Starting exhibit formatting fix...\n');
  console.log('📁 Exhibits directory:', exhibitsDir);
  
  if (!fs.existsSync(exhibitsDir)) {
    console.error('❌ Exhibits directory not found:', exhibitsDir);
    process.exit(1);
  }
  
  // Get all .docx files
  const files = fs.readdirSync(exhibitsDir)
    .filter(file => file.endsWith('.docx') && !file.endsWith('.backup.docx'))
    .map(file => path.join(exhibitsDir, file));
  
  if (files.length === 0) {
    console.log('ℹ️  No exhibit files found in directory');
    return;
  }
  
  console.log(`\n📋 Found ${files.length} exhibit file(s) to check:\n`);
  
  let fixedCount = 0;
  
  for (const filePath of files) {
    if (fixWordDocument(filePath)) {
      fixedCount++;
    }
  }
  
  console.log(`\n✅ Formatting fix complete!`);
  console.log(`   📊 Fixed ${fixedCount} out of ${files.length} file(s)`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Review the fixed documents`);
  console.log(`   2. If satisfied, delete the .backup files`);
  console.log(`   3. Re-seed exhibits: node seed-exhibits-now.cjs`);
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
