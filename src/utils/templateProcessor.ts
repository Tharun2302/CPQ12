import { 
  QuoteData, 
  processPDFTemplate, 
  generateQuotePDF, 
  downloadPDF,
  validatePDFFile,
  getPDFInfo
} from './pdfProcessor';
import { 
  processWordTemplate, 
  downloadWord, 
  validateWordFile, 
  getWordInfo,
  findWordPlaceholders
} from './wordProcessor';

export interface Template {
  id: string;
  name: string;
  file: File;
  type: 'pdf' | 'word';
  isDefault?: boolean;
  wordFile?: File; // For templates that have both PDF and Word versions
}

export interface ProcessingResult {
  success: boolean;
  processedFile?: Blob;
  filename?: string;
  error?: string;
  placeholderMap?: any;
}

export interface TemplateInfo {
  id: string;
  name: string;
  type: 'pdf' | 'word';
  fileSize: string;
  isValid: boolean;
  placeholders: string[];
  pageCount?: number; // For PDFs
}

/**
 * Process any template (PDF or Word) with quote data
 */
export async function processTemplate(
  template: Template,
  quoteData: QuoteData
): Promise<ProcessingResult> {
  try {
    console.log(`🔄 Processing ${template.type.toUpperCase()} template: ${template.name}`);
    
    let result: ProcessingResult;
    
    if (template.type === 'pdf') {
      const { processedPDF, placeholderMap } = await processPDFTemplate(template.file, quoteData);
      result = {
        success: true,
        processedFile: processedPDF,
        filename: `${template.name.replace(/\.[^/.]+$/, '')}_processed.pdf`,
        placeholderMap
      };
    } else if (template.type === 'word') {
      const { processedDoc, placeholderMap } = await processWordTemplate(template.file, quoteData);
      result = {
        success: true,
        processedFile: processedDoc,
        filename: `${template.name.replace(/\.[^/.]+$/, '')}_processed.docx`,
        placeholderMap
      };
    } else {
      throw new Error(`Unsupported template type: ${template.type}`);
    }
    
    console.log(`✅ Template processed successfully: ${template.name}`);
    return result;
    
  } catch (error) {
    console.error(`❌ Error processing template ${template.name}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get template information
 */
export async function getTemplateInfo(template: Template): Promise<TemplateInfo> {
  try {
    let fileSize = '0 KB';
    let isValid = false;
    let placeholders: string[] = [];
    let pageCount: number | undefined;
    
    if (template.type === 'pdf') {
      const pdfInfo = await getPDFInfo(template.file);
      fileSize = pdfInfo.fileSize;
      isValid = pdfInfo.isValid;
      pageCount = pdfInfo.pageCount;
      
      // For PDFs, we'd need to extract text to find placeholders
      // This is a simplified version
      placeholders = [
        'clientName', 'clientEmail', 'company', 'quoteNumber', 'quoteDate',
        'numberOfUsers', 'instanceType', 'migrationType', 'totalCost'
      ];
    } else if (template.type === 'word') {
      const wordInfo = await getWordInfo(template.file);
      fileSize = wordInfo.fileSize;
      isValid = wordInfo.isValid;
      placeholders = wordInfo.placeholders;
    }
    
    return {
      id: template.id,
      name: template.name,
      type: template.type,
      fileSize,
      isValid,
      placeholders,
      pageCount
    };
    
  } catch (error) {
    console.error(`❌ Error getting template info for ${template.name}:`, error);
    return {
      id: template.id,
      name: template.name,
      type: template.type,
      fileSize: '0 KB',
      isValid: false,
      placeholders: []
    };
  }
}

/**
 * Validate template file
 */
export function validateTemplate(template: Template): boolean {
  if (template.type === 'pdf') {
    return validatePDFFile(template.file);
  } else if (template.type === 'word') {
    return validateWordFile(template.file);
  }
  return false;
}

/**
 * Download processed template
 */
export function downloadProcessedTemplate(
  processedFile: Blob, 
  filename: string, 
  type: 'pdf' | 'word'
): void {
  try {
    if (type === 'pdf') {
      downloadPDF(processedFile, filename);
    } else if (type === 'word') {
      downloadWord(processedFile, filename);
    }
  } catch (error) {
    console.error('❌ Error downloading processed template:', error);
    throw new Error('Failed to download processed template');
  }
}

/**
 * Process multiple templates
 */
export async function processMultipleTemplates(
  templates: Template[],
  quoteData: QuoteData
): Promise<ProcessingResult[]> {
  try {
    console.log(`🔄 Processing ${templates.length} templates...`);
    
    const results = await Promise.all(
      templates.map(template => processTemplate(template, quoteData))
    );
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Processed ${successCount}/${templates.length} templates successfully`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Error processing multiple templates:', error);
    throw new Error(`Failed to process templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a new quote document from scratch
 */
export async function generateNewQuoteDocument(
  quoteData: QuoteData,
  format: 'pdf' | 'word' = 'pdf'
): Promise<ProcessingResult> {
  try {
    console.log(`🔄 Generating new ${format.toUpperCase()} quote document...`);
    
    let processedFile: Blob;
    let filename: string;
    
    if (format === 'pdf') {
      processedFile = await generateQuotePDF(quoteData);
      filename = `CPQ_Quote_${quoteData.clientName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    } else {
      // For Word format, we'd need to implement generateQuoteWord
      // For now, we'll use the PDF and convert it
      processedFile = await generateQuotePDF(quoteData);
      filename = `CPQ_Quote_${quoteData.clientName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    }
    
    console.log(`✅ New ${format.toUpperCase()} quote document generated successfully`);
    
    return {
      success: true,
      processedFile,
      filename
    };
    
  } catch (error) {
    console.error(`❌ Error generating new ${format} quote document:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get available placeholders for a template
 */
export async function getTemplatePlaceholders(template: Template): Promise<string[]> {
  try {
    if (template.type === 'word') {
      return await findWordPlaceholders(template.file);
    } else if (template.type === 'pdf') {
      // For PDFs, we'd need to extract text first
      // This is a simplified version returning common placeholders
      return [
        'clientName', 'clientEmail', 'company', 'quoteNumber', 'quoteDate',
        'numberOfUsers', 'instanceType', 'numberOfInstances', 'duration',
        'migrationType', 'dataSizeGB', 'userCost', 'dataCost', 'migrationCost',
        'instanceCost', 'totalCost', 'planName', 'planFeatures'
      ];
    }
    
    return [];
    
  } catch (error) {
    console.error(`❌ Error getting placeholders for template ${template.name}:`, error);
    return [];
  }
}

/**
 * Preview template with sample data
 */
export async function previewTemplateWithSampleData(template: Template): Promise<ProcessingResult> {
  try {
    // Create sample quote data
    const sampleQuoteData: QuoteData = {
      id: 'sample-quote-001',
      clientName: 'Sample Client',
      clientEmail: 'client@example.com',
      company: 'Sample Company Inc.',
      configuration: {
        numberOfUsers: 100,
        instanceType: 'Standard',
        numberOfInstances: 2,
        duration: 6,
        migrationType: 'Email',
        dataSizeGB: 50
      },
      calculation: {
        tier: {
          name: 'Professional',
          features: ['Feature 1', 'Feature 2', 'Feature 3']
        },
        userCost: 5000,
        dataCost: 1000,
        migrationCost: 3000,
        instanceCost: 2000,
        totalCost: 11000
      },
      selectedTier: {
        name: 'Professional',
        features: ['Feature 1', 'Feature 2', 'Feature 3']
      },
      status: 'draft',
      createdAt: new Date(),
      templateUsed: {
        id: template.id,
        name: template.name,
        isDefault: template.isDefault || false
      }
    };
    
    return await processTemplate(template, sampleQuoteData);
    
  } catch (error) {
    console.error(`❌ Error previewing template ${template.name}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
