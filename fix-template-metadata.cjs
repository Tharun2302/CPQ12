const { MongoClient } = require('mongodb');

async function fixTemplateMetadata() {
  const client = new MongoClient(require('./scripts/lib/requireMongoUri.cjs')());
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('cpq_templates');
    const templates = db.collection('templates');
    
    // Find the Advanced template
    const advancedTemplate = await templates.findOne({ 
      id: 'template-1758626018279-fr357x' 
    });
    
    if (!advancedTemplate) {
      console.log('❌ Advanced template not found');
      return;
    }
    
    console.log('📄 Found Advanced template:', {
      id: advancedTemplate.id,
      name: advancedTemplate.name,
      hasFileType: !!advancedTemplate.fileType,
      hasFileName: !!advancedTemplate.fileName,
      hasFileData: !!advancedTemplate.fileData,
      fileDataSize: advancedTemplate.fileData ? advancedTemplate.fileData.length : 0
    });
    
    // Update the template with missing metadata
    const updateResult = await templates.updateOne(
      { id: 'template-1758626018279-fr357x' },
      { 
        $set: {
          fileType: 'docx',
          fileName: 'slack-to-teams-advanced.docx',
          updatedAt: new Date().toISOString()
        }
      }
    );
    
    if (updateResult.modifiedCount > 0) {
      console.log('✅ Successfully updated Advanced template metadata');
      
      // Verify the update
      const updatedTemplate = await templates.findOne({ 
        id: 'template-1758626018279-fr357x' 
      });
      
      console.log('📄 Updated template metadata:', {
        id: updatedTemplate.id,
        name: updatedTemplate.name,
        fileType: updatedTemplate.fileType,
        fileName: updatedTemplate.fileName,
        hasFileData: !!updatedTemplate.fileData,
        fileDataSize: updatedTemplate.fileData ? updatedTemplate.fileData.length : 0
      });
    } else {
      console.log('❌ Failed to update template metadata');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

fixTemplateMetadata();
