const { MongoClient } = require('mongodb');
const fs = require('fs');

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
    console.log(`  IncludeType: ${exhibit.includeType}`);
    console.log(`  File Size: ${exhibit.fileSize} bytes`);
    console.log(`  Combinations: ${exhibit.combinations?.join(', ')}`);

    // Extract the file content
    if (exhibit.fileData) {
      const buffer = Buffer.from(exhibit.fileData, 'base64');
      const tempPath = '/tmp/exhibit_content.docx';
      fs.writeFileSync(tempPath, buffer);
      
      // Try to extract text from DOCX
      const PizZip = require('pizzip');
      const zip = new PizZip(buffer);
      const xml = zip.file('word/document.xml')?.asText();
      
      if (xml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        
        // Get all paragraph text
        const paragraphs = doc.getElementsByTagName('w:p');
        const tables = doc.getElementsByTagName('w:tbl');
        
        console.log(`\n📊 Document Structure:`);
        console.log(`  Paragraphs: ${paragraphs.length}`);
        console.log(`  Tables: ${tables.length}`);
        
        if (tables.length > 0) {
          console.log(`\n📋 First Table Content:`);
          const firstTable = tables[0];
          const rows = firstTable.getElementsByTagName('w:tr');
          console.log(`  Rows: ${rows.length}`);
          
          // Extract first few rows to see content
          for (let i = 0; i < Math.min(5, rows.length); i++) {
            const cells = rows[i].getElementsByTagName('w:tc');
            const cellTexts = [];
            for (let j = 0; j < cells.length; j++) {
              const textElements = cells[j].getElementsByTagName('w:t');
              let cellText = '';
              for (let k = 0; k < textElements.length; k++) {
                cellText += (textElements[k].textContent || '');
              }
              cellTexts.push(cellText || '[empty]');
            }
            console.log(`  Row ${i + 1}: ${cellTexts.join(' | ')}`);
          }
        }
      }
    }

  } finally {
    await client.close();
  }
}

// Note: DOMParser may not be available in Node.js, so this might fail
main().catch(console.error);
