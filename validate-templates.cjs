/**
 * Validate Templates in MongoDB
 * 
 * This script checks all templates in the database to ensure they are valid DOCX files.
 * It will report any templates that are missing, corrupted, or invalid.
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'cpq';

async function validateTemplates() {
  console.log('🔍 Starting template validation...\n');
  
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const templates = await db.collection('templates').find({}).toArray();
    
    console.log(`📊 Found ${templates.length} templates in database\n`);
    
    const issues = [];
    const valid = [];
    
    for (const template of templates) {
      const templateInfo = {
        id: template.id,
        fileName: template.fileName,
        fileType: template.fileType
      };
      
      console.log(`\n🔍 Validating: ${template.fileName} (${template.id})`);
      
      // Check if fileData exists
      if (!template.fileData) {
        console.log('   ❌ Missing fileData');
        issues.push({
          ...templateInfo,
          issue: 'Missing fileData',
          severity: 'CRITICAL'
        });
        continue;
      }
      
      // Convert fileData to Buffer
      let fileBuffer;
      try {
        if (Buffer.isBuffer(template.fileData)) {
          fileBuffer = template.fileData;
        } else if (template.fileData && template.fileData.buffer) {
          fileBuffer = Buffer.from(template.fileData.buffer);
        } else if (typeof template.fileData === 'string') {
          fileBuffer = Buffer.from(template.fileData, 'base64');
        } else {
          console.log(`   ❌ Unsupported fileData format: ${typeof template.fileData}`);
          issues.push({
            ...templateInfo,
            issue: `Unsupported fileData format: ${typeof template.fileData}`,
            severity: 'CRITICAL'
          });
          continue;
        }
      } catch (error) {
        console.log(`   ❌ Failed to convert fileData: ${error.message}`);
        issues.push({
          ...templateInfo,
          issue: `Failed to convert fileData: ${error.message}`,
          severity: 'CRITICAL'
        });
        continue;
      }
      
      // Check if buffer is empty
      if (fileBuffer.length === 0) {
        console.log('   ❌ File buffer is empty');
        issues.push({
          ...templateInfo,
          issue: 'File buffer is empty',
          severity: 'CRITICAL'
        });
        continue;
      }
      
      console.log(`   📊 File size: ${fileBuffer.length} bytes`);
      
      // For DOCX files, validate ZIP signature
      const isDocx = (template.fileType || '').toLowerCase().includes('docx') || 
                     (template.fileType || '').toLowerCase().includes('wordprocessingml');
      
      if (isDocx) {
        // Check for ZIP signature (0x50 0x4B = "PK")
        if (fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4B) {
          const firstBytes = fileBuffer.slice(0, Math.min(20, fileBuffer.length)).toString('hex');
          console.log(`   ❌ Invalid DOCX file (missing ZIP signature)`);
          console.log(`   📊 First bytes: ${firstBytes}`);
          
          // Check if it's HTML
          const preview = fileBuffer.slice(0, 100).toString('utf-8');
          if (preview.toLowerCase().includes('<html') || preview.toLowerCase().includes('<!doctype')) {
            console.log('   ⚠️  Looks like HTML content');
          }
          
          issues.push({
            ...templateInfo,
            issue: 'Invalid DOCX file (missing ZIP signature)',
            severity: 'CRITICAL',
            firstBytes
          });
          continue;
        }
        
        // Try to validate DOCX structure
        try {
          const PizZip = require('pizzip');
          const zip = new PizZip(fileBuffer);
          
          // Check for essential DOCX files (handle both path separators for cross-platform compatibility)
          const hasDocumentXml = !!(zip.files['word/document.xml'] || zip.files['word\\document.xml']);
          const hasContentTypes = !!(zip.files['[Content_Types].xml'] || zip.files['[Content_Types].xml']);
          
          if (!hasDocumentXml) {
            console.log('   ❌ Missing word/document.xml');
            issues.push({
              ...templateInfo,
              issue: 'Missing word/document.xml',
              severity: 'CRITICAL'
            });
            continue;
          }
          
          if (!hasContentTypes) {
            console.log('   ⚠️  Missing [Content_Types].xml (unusual but may work)');
            issues.push({
              ...templateInfo,
              issue: 'Missing [Content_Types].xml',
              severity: 'WARNING'
            });
          }
          
          console.log('   ✅ Valid DOCX structure');
          console.log(`   📂 ZIP contains ${Object.keys(zip.files).length} files`);
          
        } catch (zipError) {
          console.log(`   ❌ Failed to parse as ZIP: ${zipError.message}`);
          issues.push({
            ...templateInfo,
            issue: `Failed to parse as ZIP: ${zipError.message}`,
            severity: 'CRITICAL'
          });
          continue;
        }
      }
      
      console.log('   ✅ Template is valid');
      valid.push(templateInfo);
    }
    
    // Print summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Valid templates: ${valid.length}`);
    console.log(`❌ Templates with issues: ${issues.length}\n`);
    
    if (issues.length > 0) {
      console.log('\n❌ ISSUES FOUND:\n');
      
      const critical = issues.filter(i => i.severity === 'CRITICAL');
      const warnings = issues.filter(i => i.severity === 'WARNING');
      
      if (critical.length > 0) {
        console.log(`🔴 CRITICAL ISSUES (${critical.length}):`);
        critical.forEach(issue => {
          console.log(`\n   Template: ${issue.fileName} (${issue.id})`);
          console.log(`   Issue: ${issue.issue}`);
          if (issue.firstBytes) {
            console.log(`   First bytes: ${issue.firstBytes}`);
          }
        });
      }
      
      if (warnings.length > 0) {
        console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
        warnings.forEach(issue => {
          console.log(`\n   Template: ${issue.fileName} (${issue.id})`);
          console.log(`   Issue: ${issue.issue}`);
        });
      }
      
      console.log('\n\n💡 RECOMMENDATIONS:');
      console.log('   1. For templates with missing or invalid fileData, re-upload them from disk');
      console.log('   2. Run the reseed script to restore templates from backend-templates/ folder');
      console.log('   3. Check that DOCX files in backend-templates/ are valid Word documents\n');
    } else {
      console.log('✅ All templates are valid!\n');
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run validation
validateTemplates()
  .then(() => {
    console.log('\n✅ Validation complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Validation failed:', error);
    process.exit(1);
  });

