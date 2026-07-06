/**
 * Browser script to update the Advanced template in localStorage
 * This should be run in the browser console while the application is loaded
 */

async function updateAdvancedTemplateInLocalStorage() {
  console.log('🔄 Starting Advanced template update in localStorage...');
  
  try {
    // Get current templates from localStorage
    const savedTemplates = localStorage.getItem('cpq_templates');
    if (!savedTemplates) {
      console.log('❌ No templates found in localStorage');
      return false;
    }
    
    let templates = JSON.parse(savedTemplates);
    console.log(`📋 Found ${templates.length} templates in localStorage`);
    
    // Find the Advanced template
    const advancedIndex = templates.findIndex(t => 
      t.name === 'SLACK TO TEAMS Advanced' || 
      t.name.toLowerCase().includes('advanced')
    );
    
    if (advancedIndex === -1) {
      console.log('❌ Advanced template not found in localStorage');
      console.log('Available templates:', templates.map(t => t.name));
      return false;
    }
    
    const advancedTemplate = templates[advancedIndex];
    console.log('📄 Found Advanced template:', advancedTemplate.name);
    
    // You need to manually update the file data here
    // Since we can't read files from the browser, we'll provide instructions
    console.log('📝 To complete the update:');
    console.log('1. Export your updated DOCX template as base64');
    console.log('2. Replace the fileData property with the new base64 data');
    console.log('3. Update the uploadDate to current time');
    
    // Update metadata
    templates[advancedIndex] = {
      ...advancedTemplate,
      uploadDate: new Date().toISOString(),
      description: 'Advanced template for Slack to Teams migration with updated tokens',
      lastModified: Date.now()
    };
    
    // Save back to localStorage
    localStorage.setItem('cpq_templates', JSON.stringify(templates));
    
    console.log('✅ Template metadata updated in localStorage');
    console.log('🔄 Please refresh the page to load the updated template');
    
    // Trigger template update event
    window.dispatchEvent(new CustomEvent('templatesUpdated'));
    
    return true;
  } catch (error) {
    console.error('❌ Error updating template:', error);
    return false;
  }
}

// Instructions for manual update
console.log('📋 Advanced Template Update Instructions:');
console.log('1. Run this function: updateAdvancedTemplateInLocalStorage()');
console.log('2. The function will update metadata');
console.log('3. For file content, you need to manually upload the new template');
console.log('   through the Template Manager in the app');

// Export function to global scope
window.updateAdvancedTemplateInLocalStorage = updateAdvancedTemplateInLocalStorage;
