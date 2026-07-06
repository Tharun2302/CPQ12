const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

async function main() {
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cpq12';
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    
    // Get the Egnyte to SharePoint Include exhibit
    const exhibit = await db.collection('exhibits').findOne({
      name: { $regex: /Egnyte to SharePoint.*Include/i },
      includeType: 'included'
    });

    if (!exhibit) {
      console.log('❌ No Egnyte to SharePoint Include exhibit found');
      return;
    }

    console.log('\n📄 Exhibit Details:');
    console.log(`  ID: ${exhibit._id}`);
    console.log(`  Name: ${exhibit.name}`);
    console.log(`  File Size: ${exhibit.fileSize} bytes`);

    if (exhibit.fileData) {
      const buffer = Buffer.from(exhibit.fileData, 'base64');
      
      try {
        const zip = new PizZip(buffer);
        const xml = zip.file('word/document.xml')?.asText();
        
        if (!xml) {
          console.log('❌ Could not read document.xml');
          return;
        }

        // Count table rows and extract header row
        const tableMatches = xml.match(/<w:tbl>/g);
        const rowMatches = xml.match(/<w:tr>/g);
        
        console.log(`\n📊 Document Structure:`);
        console.log(`  Tables: ${tableMatches ? tableMatches.length : 0}`);
        console.log(`  Total Rows: ${rowMatches ? rowMatches.length : 0}`);
        
        // Extract all text content to see what's in the file
        const textMatches = xml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
        if (textMatches) {
          console.log(`\n📝 First 20 text elements in file:`);
          textMatches.slice(0, 20).forEach((match, idx) => {
            const text = match.replace(/<w:t[^>]*>|<\/w:t>/g, '');
            if (text.trim()) {
              console.log(`  ${idx + 1}. ${text.substring(0, 60)}`);
            }
          });
        }

        // Check if "Preserving" appears multiple times
        const preservingMatches = xml.match(/Preserving/g);
        console.log(`\n🔍 "Preserving" appears ${preservingMatches ? preservingMatches.length : 0} times`);
        
        // Check if table headers repeat
        const tableHeaderMatches = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g);
        if (tableHeaderMatches && tableHeaderMatches.length > 0) {
          console.log(`\n📋 Table Analysis:`);
          console.log(`  Number of tables: ${tableHeaderMatches.length}`);
          
          for (let i = 0; i < tableHeaderMatches.length; i++) {
            const tableXml = tableHeaderMatches[i];
            const headerMatches = tableXml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
            if (headerMatches && headerMatches.length > 0) {
              const firstHeader = headerMatches[0].replace(/<w:t[^>]*>|<\/w:t>/g, '').trim();
              console.log(`  Table ${i + 1} first text: "${firstHeader}"`);
            }
          }
        }

      } catch (e) {
        console.error('Error parsing DOCX:', e.message);
      }
    }

  } finally {
    await client.close();
  }
}

main().catch(console.error);
