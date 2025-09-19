import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { QuoteData, PlaceholderMap, createPlaceholderMap } from './pdfProcessor';

/**
 * Process Word document template with quote data
 */
export async function processWordTemplate(
  templateFile: File,
  quoteData: QuoteData
): Promise<{ processedDoc: Blob; placeholderMap: PlaceholderMap }> {
  try {
    console.log('🔄 Processing Word template with quote data...');
    
    // Read the template file
    const arrayBuffer = await templateFile.arrayBuffer();
    const zip = new PizZip(arrayBuffer);
    
    // Create docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    // Create placeholder mapping
    const placeholderMap = createPlaceholderMap(quoteData);
    console.log('📋 Created placeholder mapping:', placeholderMap);
    
    // Set the template variables
    doc.setData(placeholderMap);
    
    try {
      // Render the document
      doc.render();
    } catch (error) {
      console.error('❌ Error rendering document:', error);
      throw new Error(`Document rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Generate the processed document
    const buf = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    
    const processedDoc = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    
    console.log('✅ Word template processed successfully');
    
    return {
      processedDoc,
      placeholderMap
    };
    
  } catch (error) {
    console.error('❌ Error processing Word template:', error);
    throw new Error(`Failed to process Word template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract text content from Word document
 */
export async function extractTextFromWord(templateFile: File): Promise<string> {
  try {
    const arrayBuffer = await templateFile.arrayBuffer();
    const zip = new PizZip(arrayBuffer);
    
    // Get the main document content
    const docXml = zip.file('word/document.xml');
    if (!docXml) {
      throw new Error('Document XML not found');
    }
    
    const docContent = docXml.asText();
    
    // Simple text extraction (remove XML tags)
    const textContent = docContent
      .replace(/<[^>]*>/g, ' ') // Remove XML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return textContent;
    
  } catch (error) {
    console.error('❌ Error extracting text from Word document:', error);
    throw new Error('Failed to extract text from Word document');
  }
}

/**
 * Find placeholders in Word document
 */
export async function findWordPlaceholders(templateFile: File): Promise<string[]> {
  try {
    const textContent = await extractTextFromWord(templateFile);
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    const placeholders: string[] = [];
    let match;
    
    while ((match = placeholderRegex.exec(textContent)) !== null) {
      placeholders.push(match[1].trim());
    }
    
    return [...new Set(placeholders)]; // Remove duplicates
    
  } catch (error) {
    console.error('❌ Error finding placeholders in Word document:', error);
    return [];
  }
}

/**
 * Validate Word document file
 */
export function validateWordFile(file: File): boolean {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
  ];
  
  if (!validTypes.includes(file.type)) {
    return false;
  }
  
  if (file.size === 0) {
    return false;
  }
  
  return true;
}

/**
 * Get Word document info
 */
export async function getWordInfo(file: File): Promise<{
  fileSize: string;
  isValid: boolean;
  placeholders: string[];
}> {
  try {
    if (!validateWordFile(file)) {
      return {
        fileSize: '0 KB',
        isValid: false,
        placeholders: []
      };
    }
    
    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    const placeholders = await findWordPlaceholders(file);
    
    return {
      fileSize: formatFileSize(file.size),
      isValid: true,
      placeholders
    };
    
  } catch (error) {
    console.error('❌ Error getting Word document info:', error);
    return {
      fileSize: '0 KB',
      isValid: false,
      placeholders: []
    };
  }
}

/**
 * Download a Word document
 */
export function downloadWord(docBlob: Blob, filename: string): void {
  try {
    saveAs(docBlob, filename);
    console.log(`✅ Word document downloaded: ${filename}`);
  } catch (error) {
    console.error('❌ Error downloading Word document:', error);
    throw new Error('Failed to download Word document');
  }
}

/**
 * Convert Word document to PDF (using browser's print functionality)
 */
export function convertWordToPDF(docBlob: Blob, filename: string): void {
  try {
    // Create a temporary URL for the document
    const url = URL.createObjectURL(docBlob);
    
    // Open in new window for printing
    const printWindow = window.open(url, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
        // Clean up the URL after printing
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      };
    } else {
      throw new Error('Failed to open print window');
    }
    
  } catch (error) {
    console.error('❌ Error converting Word to PDF:', error);
    throw new Error('Failed to convert Word document to PDF');
  }
}

/**
 * Create a sample Word template with placeholders
 */
export function createSampleWordTemplate(): Blob {
  try {
    // This is a simplified example - in practice, you'd create a proper DOCX file
    const sampleContent = `
      Professional Quote
      
      Quote ID: {{quoteNumber}}
      Date: {{quoteDate}}
      
      Client Information:
      Name: {{clientName}}
      Email: {{clientEmail}}
      Company: {{company}}
      
      Project Configuration:
      Migration Type: {{migrationType}}
      Number of Users: {{numberOfUsers}}
      Instance Type: {{instanceType}}
      Number of Instances: {{numberOfInstances}}
      Duration: {{duration}} months
      Data Size: {{dataSizeGB}} GB
      
      Pricing Breakdown:
      User Costs: {{userCost}}
      Data Costs: {{dataCost}}
      Migration: {{migrationCost}}
      Instances: {{instanceCost}}
      
      Total Cost: {{totalCost}}
      
      Selected Plan: {{planName}}
      Features: {{planFeatures}}
    `;
    
    // Create a simple text file (in practice, you'd create a proper DOCX)
    const blob = new Blob([sampleContent], { type: 'text/plain' });
    return blob;
    
  } catch (error) {
    console.error('❌ Error creating sample Word template:', error);
    throw new Error('Failed to create sample Word template');
  }
}

/**
 * Process multiple Word templates
 */
export async function processMultipleWordTemplates(
  templates: File[],
  quoteData: QuoteData
): Promise<Array<{ filename: string; processedDoc: Blob; placeholderMap: PlaceholderMap }>> {
  try {
    console.log(`🔄 Processing ${templates.length} Word templates...`);
    
    const results = await Promise.all(
      templates.map(async (template) => {
        const { processedDoc, placeholderMap } = await processWordTemplate(template, quoteData);
        return {
          filename: template.name.replace(/\.[^/.]+$/, '_processed.docx'),
          processedDoc,
          placeholderMap
        };
      })
    );
    
    console.log('✅ All Word templates processed successfully');
    return results;
    
  } catch (error) {
    console.error('❌ Error processing multiple Word templates:', error);
    throw new Error(`Failed to process Word templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
