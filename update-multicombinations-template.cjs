const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Load .env (so MONGODB_URI / DB_NAME are available when running this script directly)
try {
  // eslint-disable-next-line global-require
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
  // dotenv is optional; if it's missing, user can still provide env vars via shell
}

async function updateMultiCombinationsTemplate() {
  // Use the same connection string + DB name as the server (supports local MongoDB or Atlas)
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const DB_NAME = process.env.DB_NAME || 'cpq_database';
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    const templates = db.collection('templates');
    
    // Read the updated MultiCombinations template file.
    // Users sometimes upload/rename as "MultiCombinations (1).docx" etc.
    const templatesDir = path.join(__dirname, 'backend-templates');
    const candidates = fs
      .readdirSync(templatesDir)
      .filter((f) => /^multicombinations.*\.docx$/i.test(f))
      .map((f) => path.join(templatesDir, f));

    if (candidates.length === 0) {
      const expected = path.join(templatesDir, 'MultiCombinations.docx');
      console.log('❌ MultiCombinations template file not found.');
      console.log('📝 Expected something like:', expected);
      console.log('📝 Or any file matching: MultiCombinations*.docx (case-insensitive)');
      return;
    }

    // Pick the most recently modified file (the one you "just updated")
    const filePath = candidates
      .map((p) => ({ p, mtimeMs: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
    
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    
    console.log('📄 Template file info:');
    console.log(`   File: ${filePath}`);
    console.log(`   Size: ${Math.round(fileBuffer.length / 1024)}KB`);
    console.log(`   Base64 length: ${base64Data.length} characters`);
    
    // Check if MultiCombinations template exists
    const existing = await templates.findOne({ 
      $or: [
        { name: 'MultiCombinations' },
        { name: 'Multi Combinations' },
        { name: 'MULTI COMBINATIONS' },
        { fileName: { $regex: '^MultiCombinations.*\\.docx$', $options: 'i' } },
        { combination: 'multi-combination' }
      ]
    });
    
    if (existing) {
      console.log('📄 Found existing MultiCombinations template, updating with new file...');
      console.log(`   Current ID: ${existing.id}`);
      console.log(`   Current Name: ${existing.name}`);
      console.log(`   Current file size: ${existing.fileSize}`);
      console.log(`   New file size: ${fileBuffer.length}`);
      
      // Update the existing template with the new file data
      const updateResult = await templates.updateOne(
        { _id: existing._id },
        { 
          $set: {
            name: existing.name || 'Multi Combinations',
            fileData: base64Data,
            fileSize: fileBuffer.length,
            fileName: 'MultiCombinations.docx',
            updatedAt: new Date().toISOString(),
            planType: 'advanced',
            isDefault: false,
            category: 'multi',
            combination: 'multi-combination',
            keywords: ['multi', 'combination', 'messaging', 'content', 'email', 'exhibits'],
            description: 'Universal template for Multi Combination migrations with dynamic exhibit table rows - supports messaging, content, and email migrations with exhibit loops'
          }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        console.log('✅ Successfully updated MultiCombinations template with exhibit loop markers!');
        console.log('🎯 Template now supports dynamic exhibit rows using docxtemplater loops');
      } else {
        console.log('⚠️ No changes were made to the template (may already be up to date)');
      }
    } else {
      console.log('❌ MultiCombinations template not found in database, creating new one...');
      
      // Create new MultiCombinations template
      const templateDoc = {
        id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        name: 'Multi Combinations',
        description: 'Universal template for Multi Combination migrations with dynamic exhibit table rows - supports messaging, content, and email migrations with exhibit loops',
        fileName: 'MultiCombinations.docx',
        fileSize: fileBuffer.length,
        fileData: base64Data,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        isDefault: false,
        category: 'multi',
        combination: 'multi-combination',
        planType: 'advanced',
        keywords: ['multi', 'combination', 'messaging', 'content', 'email', 'exhibits'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        uploadedBy: 'system-update',
        status: 'active'
      };
      
      const result = await templates.insertOne(templateDoc);
      
      if (result.insertedId) {
        console.log('✅ Created new MultiCombinations template:', templateDoc.name);
        console.log(`   File: ${templateDoc.fileName} (${Math.round(fileBuffer.length / 1024)}KB)`);
        console.log(`   Plan: ${templateDoc.planType} | Combination: ${templateDoc.combination}`);
      }
    }
    
    // Verify the update
    const updatedTemplate = await templates.findOne({ 
      $or: [
        { name: 'MultiCombinations' },
        { name: 'Multi Combinations' },
        { name: 'MULTI COMBINATIONS' },
        { fileName: 'MultiCombinations.docx' }
      ]
    });
    
    if (updatedTemplate) {
      console.log('\n📋 Updated template verification:');
      console.log(`   ID: ${updatedTemplate.id}`);
      console.log(`   Name: ${updatedTemplate.name}`);
      console.log(`   Plan Type: ${updatedTemplate.planType}`);
      console.log(`   Combination: ${updatedTemplate.combination}`);
      console.log(`   File Size: ${Math.round(updatedTemplate.fileSize / 1024)}KB`);
      console.log(`   Updated At: ${updatedTemplate.updatedAt}`);
      console.log(`   Has File Data: ${updatedTemplate.fileData ? 'Yes' : 'No'}`);
      console.log(`   File Data Length: ${updatedTemplate.fileData ? updatedTemplate.fileData.length : 0} characters`);
    }
    
    // List all multi-combination templates
    const multiTemplates = await templates.find({ 
      $or: [
        { combination: 'multi-combination' },
        { category: 'multi' }
      ]
    }).toArray();
    
    console.log('\n📋 Multi Combination templates in database:');
    if (multiTemplates.length > 0) {
      multiTemplates.forEach(t => {
        console.log(`   - ${t.name} (${t.planType || 'N/A'}) - ${Math.round(t.fileSize / 1024)}KB`);
      });
    } else {
      console.log('   No multi-combination templates found');
    }
    
    console.log('\n🎉 Template update completed successfully!');
    console.log('📝 Next steps:');
    console.log('   1. Restart your server to load the updated template');
    console.log('   2. Go to Configuration and select "Multi combination" migration type');
    console.log('   3. Select one or more exhibits from the exhibit selector');
    console.log('   4. Calculate pricing and generate agreement');
    console.log('   5. Verify that exhibits appear as separate rows in the table');
    console.log('\n💡 Expected behavior:');
    console.log('   - Each selected exhibit creates a new row in the pricing table');
    console.log('   - Rows show: Exhibit Type | Description | Price');
    console.log('   - No exhibits selected = default "No Exhibits Selected" row');
    console.log('\n🔧 Connection details used:');
    console.log(`   MONGODB_URI=${MONGODB_URI}`);
    console.log(`   DB_NAME=${DB_NAME}`);
    
  } catch (error) {
    console.error('❌ Error updating template:', error);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the update
if (require.main === module) {
  updateMultiCombinationsTemplate()
    .then(() => {
      console.log('✅ Update script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Update script failed:', error);
      process.exit(1);
    });
}

module.exports = updateMultiCombinationsTemplate;

