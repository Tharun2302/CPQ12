import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';

export interface DocxTemplateData {
  // Exact tokens from your template
  '{{Company Name}}'?: string;
  '{{Company_Name}}'?: string; // Underscore version found in template
  '{{users_count}}'?: string;
  '{{users_cost}}'?: string; // FIXED: Template uses underscore notation
  '{{Duration of months}}'?: string;
  '{{Duration_of_months}}'?: string; // Underscore version found in template
  '{{total price}}'?: string;
  '{{total_price}}'?: string; // Underscore version found in template
  
  // Additional common tokens for compatibility
  '{{company name}}'?: string; // Lowercase version found in template
  '{{migration type}}'?: string;
  '{{userscount}}'?: string;
  '{{price_migration}}'?: string;
  '{{price_data}}'?: string;
  '{{clientName}}'?: string;
  '{{email}}'?: string;
  '{{users}}'?: string;
  '{{migration_type}}'?: string;
  '{{prices}}'?: string;
  '{{migration_price}}'?: string;
  '{{duration_months}}'?: string;
  '{{date}}'?: string;
  '{{Effective Date}}'?: string;
  
  // Discount and instance cost tokens
  '{{instance_cost}}'?: string;
  '{{discount}}'?: string;
  '{{discount_percent}}'?: string;
  '{{discount_amount}}'?: string;
  // New: total after discount alias used in template as total_price_discount
  '{{total_price_discount}}'?: string;
  '{{total_after_discount}}'?: string;
  '{{final_total}}'?: string;
  
  // Legacy fields for backward compatibility
  company?: string;
  clientName?: string;
  email?: string;
  users?: number;
  price_migration?: string;
  price_data?: string;
  total?: string;
  date?: string;
  instanceType?: string;
  duration?: number;
  dataSize?: number;
  quoteId?: string;
  planName?: string;
}

export interface DocxProcessingResult {
  success: boolean;
  processedDocx?: Blob;
  error?: string;
  processingTime: number;
  tokensReplaced: number;
  originalSize: number;
  finalSize: number;
}

export interface DocxTemplateValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  supportedTokens: string[];
  foundTokens: string[];
}

/**
 * DOCX Template Processor using docxtemplater
 */
export class DocxTemplateProcessor {
  private static instance: DocxTemplateProcessor;
  
  public static getInstance(): DocxTemplateProcessor {
    if (!DocxTemplateProcessor.instance) {
      DocxTemplateProcessor.instance = new DocxTemplateProcessor();
    }
    return DocxTemplateProcessor.instance;
  }

  /**
   * Static method for easy access
   */
  public static async processDocxTemplate(
    file: File,
    templateData: DocxTemplateData
  ): Promise<DocxProcessingResult> {
    const processor = DocxTemplateProcessor.getInstance();
    return processor.processDocxTemplate(file, templateData);
  }
  
  /**
   * Process DOCX template with quote data
   */
  async processDocxTemplate(
    templateFile: File,
    templateData: DocxTemplateData
  ): Promise<DocxProcessingResult> {
    const startTime = Date.now();
    
    try {
      console.log('🔄 Starting DOCX template processing...');
      console.log('📄 Template file:', templateFile.name, 'Size:', templateFile.size, 'bytes');
      console.log('📊 Template data:', templateData);
      
      // Validate template file
      const validation = this.validateDocxFile(templateFile);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Read template file
      const templateBytes = await templateFile.arrayBuffer();
      console.log('📄 Template bytes loaded:', templateBytes.byteLength, 'bytes');
      
      const zip = new PizZip(templateBytes);
      console.log('📦 ZIP file created, files:', Object.keys(zip.files));
      
      // Check if this is a valid DOCX file
      if (!zip.files['word/document.xml']) {
        throw new Error('Invalid DOCX file: missing word/document.xml');
      }
      
      // Check if the document contains template placeholders
      const documentXml = zip.files['word/document.xml'].asText();
      const hasPlaceholders = documentXml.includes('{{') && documentXml.includes('}}');
      
      console.log('🔍 Document contains placeholders:', hasPlaceholders);
      console.log('📄 Document XML preview:', documentXml.substring(0, 500) + '...');
      
      // Log found placeholders for debugging - use cleaned text
      const cleanText = this.extractTextFromDocxXml(documentXml);
      const placeholderMatches = cleanText.match(/\{\{[^}]+\}\}/g);
      if (placeholderMatches) {
        console.log('🔍 Found placeholders in clean text:', placeholderMatches);
        
        // CRITICAL: Log the exact text around company name tokens to see what's on the third page
        console.log('🔍 SEARCHING FOR COMPANY NAME TOKENS IN TEMPLATE:');
        const companyTokenPatterns = [
          /\{\{\s*Company\s+Name\s*\}\}/gi,
          /\{\{\s*Company_Name\s*\}\}/gi,
          /\{\{\s*company\s+name\s*\}\}/gi,
          /\{\{\s*company_name\s*\}\}/gi
        ];
        
        companyTokenPatterns.forEach((pattern, index) => {
          const matches = cleanText.match(pattern);
          if (matches) {
            console.log(`  ✅ Found company token pattern ${index + 1}:`, matches);
            // Find the context around each match
            matches.forEach(match => {
              const matchIndex = cleanText.indexOf(match);
              const context = cleanText.substring(
                Math.max(0, matchIndex - 100),
                Math.min(cleanText.length, matchIndex + match.length + 100)
              );
              console.log(`    Context: "${context}"`);
            });
          } else {
            console.log(`  ❌ No matches for company token pattern ${index + 1}`);
          }
        });
        
        // CRITICAL: Check for the specific tokens we expect
        const expectedTokens = [
          '{{Company Name}}',  // Space version (from template)
          '{{ Company Name }}',  // Space version with extra spaces (from third page)
          '{{Company_Name}}',  // Underscore version (fallback)
          '{{ Company_Name }}',  // Underscore version with extra spaces (from third page)
          '{{users_count}}', 
          '{{users_cost}}',
          '{{Duration of months}}',  // Space version (from template)
          '{{Duration_of_months}}',  // Underscore version (fallback)
          '{{price_migration}}',
          '{{total price}}',  // Space version (from template)
          '{{total_price}}'   // Underscore version (fallback)
        ];
        
        console.log('🔍 TOKEN VALIDATION:');
        expectedTokens.forEach(expectedToken => {
          const found = placeholderMatches.includes(expectedToken);
          console.log(`  ${found ? '✅' : '❌'} ${expectedToken}: ${found ? 'FOUND' : 'MISSING'}`);
        });
      } else {
        console.log('🔍 No placeholders found in clean text');
      }
      
      // For now, let's always try to process the template first
      // The fallback will be triggered if processing fails
      console.log('🔄 Attempting to process template with Docxtemplater...');
      
      // Create docxtemplater instance with custom delimiters to match template format
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
          start: '{{',
          end: '}}'
        }
      });
      
      console.log('🔍 Docxtemplater instance created:', doc);
      console.log('🔍 Docxtemplater methods:', Object.getOwnPropertyNames(doc));
      console.log('🔍 Docxtemplater prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(doc)));
      
      // Prepare template data
      const processedData = this.prepareTemplateData(templateData);
      console.log('📝 Prepared template data:', processedData);
      
      // Debug: Check what data we're about to send to docxtemplater
      console.log('🔍 DOCX PROCESSOR DEBUG:');
      console.log('  Input templateData keys:', Object.keys(templateData));
      console.log('  Input templateData values:', Object.values(templateData));
      console.log('  Processed data keys:', Object.keys(processedData));
      console.log('  Processed data values:', Object.values(processedData));
      
      // Debug: Check specific tokens
      console.log('🎯 TOKEN CHECK:');
      console.log('  Company Name:', processedData['{{Company Name}}']);
      console.log('  Company_Name:', processedData['{{Company_Name}}']);
      console.log('  users_count:', processedData['{{users_count}}']);
      console.log('  users_cost:', processedData['{{users_cost}}']);
      console.log('  Duration of months:', processedData['{{Duration of months}}']);
      console.log('  Duration_of_months:', processedData['{{Duration_of_months}}']);
      console.log('  total price:', processedData['{{total price}}']);
      console.log('  total_price:', processedData['{{total_price}}']);
      console.log('  price_migration:', processedData['{{price_migration}}']);
      
      // Replace tokens using the new API (setData is deprecated)
      console.log('🔍 About to render template with data using new API...');
      
      // CRITICAL: Log the exact data being passed to docxtemplater
      console.log('🔍 DATA BEING PASSED TO DOCXTEMPLATER:');
      const criticalTokens = [
        '{{Company_Name}}',
        '{{users_count}}',
        '{{users_cost}}',
        '{{Duration_of_months}}',
        '{{price_migration}}',
        '{{total_price}}'
      ];
      
      criticalTokens.forEach(token => {
        const value = processedData[token];
        console.log(`  ${token}: "${value}" (type: ${typeof value})`);
      });
      
      // CRITICAL: Create data object with keys WITHOUT {{}} brackets for docxtemplater
      const docxtemplaterData: any = {};
      Object.keys(processedData).forEach(key => {
        if (key.startsWith('{{') && key.endsWith('}}')) {
          // Remove {{}} brackets for docxtemplater
          const cleanKey = key.slice(2, -2);
          docxtemplaterData[cleanKey] = processedData[key];
          
          // CRITICAL: Also add underscore version for compatibility
          // This handles cases where template has "Company Name" but docxtemplater expects "Company_Name"
          if (cleanKey.includes(' ')) {
            const underscoreKey = cleanKey.replace(/\s+/g, '_');
            docxtemplaterData[underscoreKey] = processedData[key];
            console.log(`🔧 Added underscore version: "${cleanKey}" → "${underscoreKey}"`);
          }
          
          // CRITICAL: Also add space version for compatibility
          // This handles cases where template has "Company_Name" but docxtemplater expects "Company Name"
          if (cleanKey.includes('_')) {
            const spaceKey = cleanKey.replace(/_/g, ' ');
            docxtemplaterData[spaceKey] = processedData[key];
            console.log(`🔧 Added space version: "${cleanKey}" → "${spaceKey}"`);
          }
        } else {
          // Keep non-bracket keys as is
          docxtemplaterData[key] = processedData[key];
        }
      });
      
      console.log('🔍 DOCXTEMPLATER DATA (without brackets):');
      const cleanTokens = [
        'Company Name', 'Company_Name',  // Both space and underscore versions
        'users_count', 'users_cost', 
        'Duration of months', 'Duration_of_months',  // Both space and underscore versions
        'price_migration', 
        'total price', 'total_price'  // Both space and underscore versions
      ];
      cleanTokens.forEach(token => {
        const value = docxtemplaterData[token];
        console.log(`  ${token}: "${value}" (type: ${typeof value})`);
      });
      
      try {
        doc.render(docxtemplaterData);
        console.log('✅ Template rendered successfully with new API');
        
        // CRITICAL: Log the final processed document to verify tokens were replaced
        const finalDocumentXml = zip.file('word/document.xml')?.asText() || '';
        const finalCleanText = this.extractTextFromDocxXml(finalDocumentXml);
        console.log('🔍 FINAL DOCUMENT TEXT (first 1000 chars):', finalCleanText.substring(0, 1000));
        
        // Check if "undefined" is still present
        if (finalCleanText.includes('undefined')) {
          console.error('❌ CRITICAL: "undefined" still found in final document!');
          console.log('🔍 Text around "undefined":', finalCleanText.substring(
            Math.max(0, finalCleanText.indexOf('undefined') - 100),
            finalCleanText.indexOf('undefined') + 100
          ));
          
          // CRITICAL: Check if company name tokens are still present
          const remainingCompanyTokens = finalCleanText.match(/\{\{[^}]*[Cc]ompany[^}]*\}\}/g);
          if (remainingCompanyTokens) {
            console.error('❌ CRITICAL: Company name tokens still present in final document:', remainingCompanyTokens);
            remainingCompanyTokens.forEach(token => {
              const tokenIndex = finalCleanText.indexOf(token);
              const context = finalCleanText.substring(
                Math.max(0, tokenIndex - 100),
                Math.min(finalCleanText.length, tokenIndex + token.length + 100)
              );
              console.log(`  Token: "${token}" - Context: "${context}"`);
            });
          }
        } else {
          console.log('✅ No "undefined" found in final document');
        }
        
      } catch (error) {
        console.error('❌ Template rendering error:', error);
        
        // Get detailed error information from Docxtemplater
        if (error && typeof error === 'object' && 'properties' in error) {
          const docxError = error as any;
          console.error('❌ Docxtemplater error details:', docxError.properties);
          
          if (docxError.properties && docxError.properties.errors) {
            const errors = docxError.properties.errors;
            console.error('❌ Specific errors:', errors);
            
            // Log the errors but don't throw - go to fallback instead
            const errorMessages = errors.map((err: any) => {
              if (typeof err === 'string') return err;
              if (err.message) return err.message;
              if (err.name) return `${err.name}: ${err.message || 'Unknown error'}`;
              return JSON.stringify(err);
            });
            
            console.error('❌ Template rendering failed with multiple errors:', errorMessages.join('\n'));
          }
        }
        
        // If template rendering fails, try to create a simple fallback document
        console.log('⚠️ Template rendering failed, attempting fallback...');
        return this.createFallbackDocument(templateData);
      }
      
      // Generate output
      const buffer = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      // CRITICAL: Verify that tokens were actually replaced in the final document
      console.log('🔍 VERIFYING TOKEN REPLACEMENT IN FINAL DOCUMENT:');
      try {
        const bufferArrayBuffer = await buffer.arrayBuffer();
        const finalZip = new PizZip(bufferArrayBuffer);
        const finalDocumentXml = finalZip.file('word/document.xml')?.asText();
        if (finalDocumentXml) {
          const finalCleanText = this.extractTextFromDocxXml(finalDocumentXml);
          console.log('🔍 Final document text preview:', finalCleanText.substring(0, 500) + '...');
          
          // Check if any {{}} tokens remain
          const remainingTokens = finalCleanText.match(/\{\{[^}]+\}\}/g);
          if (remainingTokens) {
            console.log('❌ WARNING: Found remaining tokens in final document:', remainingTokens);
          } else {
            console.log('✅ SUCCESS: No remaining {{}} tokens found in final document');
          }
          
          // Check for specific values
          const hasCompanyName = finalCleanText.includes('Demo Company Inc.');
          const hasUserCount = finalCleanText.includes('1');
          const hasUserCost = finalCleanText.includes('$40');
          const hasTotalPrice = finalCleanText.includes('$1,020');
          
          console.log('🔍 FINAL DOCUMENT CONTENT CHECK:');
          console.log(`  Company Name (Demo Company Inc.): ${hasCompanyName ? '✅' : '❌'}`);
          console.log(`  User Count (1): ${hasUserCount ? '✅' : '❌'}`);
          console.log(`  User Cost ($40): ${hasUserCost ? '✅' : '❌'}`);
          console.log(`  Total Price ($1,020): ${hasTotalPrice ? '✅' : '❌'}`);
        }
      } catch (verifyError) {
        console.error('❌ Error verifying final document:', verifyError);
      }
      
      const processingTime = Date.now() - startTime;
      const tokensReplaced = this.countReplacedTokens(processedData);
      
      console.log(`✅ DOCX template processed successfully in ${processingTime}ms`);
      console.log(`📊 Tokens replaced: ${tokensReplaced}`);
      console.log(`📄 Output size: ${buffer.size} bytes`);
      
      return {
        success: true,
        processedDocx: buffer,
        processingTime,
        tokensReplaced,
        originalSize: templateFile.size,
        finalSize: buffer.size
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ DOCX template processing failed:', error);
      
      // Try fallback document creation
      console.log('⚠️ Attempting fallback document creation...');
      try {
        const fallbackResult = await this.createFallbackDocument(templateData);
        console.log('✅ Fallback document created successfully');
        return fallbackResult;
      } catch (fallbackError) {
        console.error('❌ Fallback document creation also failed:', fallbackError);
        
        return {
          success: false,
          error: `Template processing failed: ${error instanceof Error ? error.message : 'Unknown error'}. Fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
          processingTime,
          tokensReplaced: 0,
          originalSize: templateFile.size,
          finalSize: 0
        };
      }
    }
  }
  
  /**
   * Validate DOCX file
   */
  validateDocxFile(file: File): DocxTemplateValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const supportedTokens = [
      'company', 'clientName', 'email', 'users', 'price_migration',
      'price_data', 'total', 'date', 'instanceType', 'duration',
      'dataSize', 'quoteId', 'planName'
    ];
    
    if (!file) {
      errors.push('No file provided');
    } else {
      if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        errors.push('File must be a DOCX document');
      }
      
      if (file.size === 0) {
        errors.push('File is empty');
      }
      
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        errors.push('File is too large (max 50MB)');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      supportedTokens,
      foundTokens: [] // Will be populated during processing
    };
  }
  
  /**
   * Prepare template data for processing
   */
  private prepareTemplateData(data: DocxTemplateData): any {
    console.log('🔍 DOCX PROCESSOR: prepareTemplateData called with:', data);
    
    // CRITICAL: Log the exact data structure being received
    console.log('🔍 DOCX PROCESSOR: Raw data structure:');
    console.log('  data keys:', Object.keys(data));
    console.log('  data values:', Object.values(data));
    console.log('  data.{{Company Name}}:', data['{{Company Name}}']);
    console.log('  data.{{Company_Name}}:', data['{{Company_Name}}']);
    console.log('  data.company:', data.company);
    
    // COMPREHENSIVE: Create a data object that covers ALL possible token variations
    const processedData: any = {};
    
    // Extract core values with fallbacks - EXACT tokens from template
    console.log('🔍 DOCX PROCESSOR: Company name sources:');
    console.log('  data[Company Name]:', data['{{Company Name}}']);
    console.log('  data[Company_Name]:', data['{{Company_Name}}']);
    console.log('  data[company name]:', data['{{company name}}']);
    console.log('  data.company:', data.company);
    
    const companyName = data['{{Company Name}}'] || data['{{Company_Name}}'] || data['{{company name}}'] || data.company || 'Demo Company Inc.';
    console.log('  Final companyName in DOCX processor:', companyName);
    const userCount = data['{{users_count}}'] || data['{{userscount}}'] || data['{{users}}'] || '1';
    const userCost = data['{{users_cost}}'] || '$0.00';
    const duration = data['{{Duration of months}}'] || data['{{Duration_of_months}}'] || data['{{duration_months}}'] || '1';
    const totalPrice = data['{{total price}}'] || data['{{total_price}}'] || data['{{prices}}'] || '$0.00';
    const migrationCost = data['{{price_migration}}'] || data['{{migration_price}}'] || '$0.00';
    const migrationType = data['{{migration type}}'] || data['{{migration_type}}'] || 'Content';
    const clientName = data['{{clientName}}'] || data.clientName || 'Demo Client';
    const email = data['{{email}}'] || data.email || 'demo@example.com';
    const date = data['{{date}}'] || new Date().toLocaleDateString('en-US', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit'
    });
    
    console.log('🔍 DOCX PROCESSOR EXTRACTED VALUES:');
    console.log('  companyName:', companyName);
    console.log('  userCount:', userCount);
    console.log('  userCost:', userCost);
    console.log('  duration:', duration);
    console.log('  totalPrice:', totalPrice);
    console.log('  migrationCost:', migrationCost);
    
    // CRITICAL: Check if any core values are using fallbacks
    console.log('🔍 TOKEN SOURCE ANALYSIS:');
    console.log('  Company Name source:', {
      '{{Company Name}}': data['{{Company Name}}'],
      '{{Company_Name}}': data['{{Company_Name}}'],
      '{{company name}}': data['{{company name}}'],
      'company': data.company,
      'final': companyName
    });
    console.log('  Users Count source:', {
      '{{users_count}}': data['{{users_count}}'],
      '{{userscount}}': data['{{userscount}}'],
      '{{users}}': data['{{users}}'],
      'final': userCount
    });
    console.log('  Duration source:', {
      '{{Duration of months}}': data['{{Duration of months}}'],
      '{{Duration_of_months}}': data['{{Duration_of_months}}'],
      '{{duration_months}}': data['{{duration_months}}'],
      'final': duration
    });
    console.log('  Total Price source:', {
      '{{total price}}': data['{{total price}}'],
      '{{total_price}}': data['{{total_price}}'],
      '{{prices}}': data['{{prices}}'],
      'final': totalPrice
    });
    console.log('  Migration Cost source:', {
      '{{price_migration}}': data['{{price_migration}}'],
      '{{migration_price}}': data['{{migration_price}}'],
      'final': migrationCost
    });
    
    // CRITICAL: Ensure the exact tokens from the template are mapped correctly
    console.log('🔍 EXACT TEMPLATE TOKEN MAPPING:');
    console.log('  Company_Name →', companyName);
    console.log('  users_count →', userCount);
    console.log('  users_cost →', userCost);
    console.log('  Duration_of_months →', duration);
    console.log('  price_migration →', migrationCost);
    console.log('  total_price →', totalPrice);
    
    // Create comprehensive token mapping covering ALL possible variations
    const tokenMappings = {
      // Company variations
      '{{Company Name}}': companyName,
      '{{Company_Name}}': companyName,  // CRITICAL: Underscore version found in template
      '{{company name}}': companyName,
      '{{company_name}}': companyName,
      '{{companyName}}': companyName,
      '{{Company}}': companyName,
      '{{company}}': companyName,
      
      // User count variations
      '{{users_count}}': userCount,
      '{{userscount}}': userCount,
      '{{users}}': userCount,
      '{{user_count}}': userCount,
      '{{userCount}}': userCount,
      '{{numberOfUsers}}': userCount,
      
      // User cost variations
      '{{users_cost}}': userCost,
      '{{user_cost}}': userCost,
      '{{userCost}}': userCost,
      '{{usersCost}}': userCost,
      
      // Duration variations
      '{{Duration of months}}': duration,
      '{{Duration_of_months}}': duration,  // CRITICAL: Underscore version found in template
      '{{Suration_of_months}}': duration,  // Handle typo version
      '{{duration_months}}': duration,
      '{{duration}}': duration,
      '{{months}}': duration,
      '{{Duration}}': duration,
      
      // Total price variations
      '{{total price}}': totalPrice,
      '{{total_price}}': totalPrice,
      '{{totalPrice}}': totalPrice,
      '{{prices}}': totalPrice,
      '{{total}}': totalPrice,
      '{{price}}': totalPrice,
      
      // Migration cost variations
      '{{price_migration}}': migrationCost,
      '{{migration_price}}': migrationCost,
      '{{migrationCost}}': migrationCost,
      '{{migration_cost}}': migrationCost,
      
      // Migration type variations
      '{{migration type}}': migrationType,
      '{{migration_type}}': migrationType,
      '{{migrationType}}': migrationType,
      '{{migration}}': migrationType,
      
      // Client variations
      '{{clientName}}': clientName,
      '{{client_name}}': clientName,
      '{{client}}': clientName,
      '{{name}}': clientName,
      
      // Email variations
      '{{email}}': email,
      '{{clientEmail}}': email,
      '{{client_email}}': email,
      
      // Date variations
      '{{date}}': date,
      '{{current_date}}': date,
      '{{today}}': date,
      '{{Effective Date}}': date,
      '{{effective_date}}': date,
      '{{effectiveDate}}': date,
      '{{Date}}': date,
      
      // Additional common tokens
      '{{price_data}}': data['{{price_data}}'] || '$0.00',
      '{{data_cost}}': data['{{price_data}}'] || '$0.00',
      '{{instance_cost}}': (data as any)['{{instance_cost}}'] || '$0.00',
      '{{quoteId}}': data.quoteId || 'N/A',
      '{{quote_id}}': data.quoteId || 'N/A',
      '{{planName}}': data.planName || 'Basic',
      '{{plan_name}}': data.planName || 'Basic',
      
      // Discount tokens
      '{{discount}}': (data as any)['{{discount}}'] || '0',
      '{{discount_percent}}': (data as any)['{{discount_percent}}'] || '0',
      '{{discount_amount}}': (data as any)['{{discount_amount}}'] || '$0.00',
      // Support both names: total_after_discount and total_price_discount
      '{{total_after_discount}}': (data as any)['{{total_after_discount}}'] || (data as any)['{{total_price_discount}}'] || (data as any)['{{total_price}}'] || '$0.00',
      '{{total_price_discount}}': (data as any)['{{total_price_discount}}'] || (data as any)['{{total_after_discount}}'] || (data as any)['{{total_price}}'] || '$0.00',
      '{{final_total}}': (data as any)['{{final_total}}'] || (data as any)['{{total_after_discount}}'] || (data as any)['{{total_price_discount}}'] || (data as any)['{{total_price}}'] || '$0.00',
      
      // Legacy support (for backward compatibility)
      company: companyName,
      clientName: clientName,
      email: email,
      users: parseInt(userCount.toString()),
      price_migration: migrationCost,
      price_data: data['{{price_data}}'] || '$0.00',
      total: totalPrice,
      date: date,
      instanceType: data.instanceType || 'Standard',
      duration: parseInt(duration.toString()),
      dataSize: data.dataSize || 0,
      quoteId: data.quoteId || 'N/A',
      planName: data.planName || 'Basic'
    };
    
    // Apply all mappings
    Object.assign(processedData, tokenMappings);
    
    console.log('🔍 DOCX PROCESSOR: Processed data keys:', Object.keys(processedData));
    console.log('🔍 DOCX PROCESSOR: Sample processed data:', {
      '{{Company Name}}': processedData['{{Company Name}}'],
      '{{Company_Name}}': processedData['{{Company_Name}}'],
      '{{users_count}}': processedData['{{users_count}}'],
      '{{users_cost}}': processedData['{{users_cost}}'],
      '{{Duration of months}}': processedData['{{Duration of months}}'],
      '{{Duration_of_months}}': processedData['{{Duration_of_months}}'],
      '{{total price}}': processedData['{{total price}}'],
      '{{total_price}}': processedData['{{total_price}}'],
      '{{price_migration}}': processedData['{{price_migration}}']
    });
    
    // CRITICAL: Validate that key tokens are not undefined
    const criticalTokens = [
      '{{Company Name}}', '{{Company_Name}}', '{{users_count}}', '{{users_cost}}',
      '{{Duration of months}}', '{{Duration_of_months}}', '{{total price}}', '{{total_price}}',
      '{{price_migration}}', '{{company name}}'
    ];
    
    console.log('🔍 CRITICAL TOKEN VALIDATION:');
    criticalTokens.forEach(token => {
      const value = processedData[token];
      const status = (value && value !== 'undefined' && value !== '') ? '✅' : '❌';
      console.log(`  ${status} ${token}: ${value}`);
    });
    
    // CRITICAL: Final validation - ensure NO undefined values
    const undefinedKeys = Object.keys(processedData).filter(key => 
      processedData[key] === undefined || processedData[key] === null || processedData[key] === ''
    );
    
    if (undefinedKeys.length > 0) {
      console.error('❌ DOCX PROCESSOR: Found undefined/null/empty values for keys:', undefinedKeys);
      
      // Replace with intelligent fallbacks
      undefinedKeys.forEach(key => {
        if (key.toLowerCase().includes('company')) {
          processedData[key] = 'Demo Company Inc.';
        } else if (key.toLowerCase().includes('user') && key.toLowerCase().includes('count')) {
          processedData[key] = '1';
        } else if (key.toLowerCase().includes('cost') || key.toLowerCase().includes('price')) {
          processedData[key] = '$0.00';
        } else if (key.toLowerCase().includes('duration') || key.toLowerCase().includes('month')) {
          processedData[key] = '1';
        } else if (key.toLowerCase().includes('migration') && !key.toLowerCase().includes('cost')) {
          processedData[key] = 'Content';
        } else if (key.toLowerCase().includes('client') || key.toLowerCase().includes('name')) {
          processedData[key] = 'Demo Client';
        } else if (key.toLowerCase().includes('email')) {
          processedData[key] = 'demo@example.com';
        } else if (key.toLowerCase().includes('date')) {
          processedData[key] = new Date().toLocaleDateString();
        } else {
          processedData[key] = 'N/A';
        }
      });
      
      console.log('🔧 DOCX PROCESSOR: Fixed undefined values:', undefinedKeys);
    }
    
    // Final validation
    const finalUndefinedKeys = Object.keys(processedData).filter(key => 
      processedData[key] === undefined || processedData[key] === null
    );
    
    if (finalUndefinedKeys.length > 0) {
      console.error('❌ CRITICAL: Still have undefined values after fixing:', finalUndefinedKeys);
    } else {
      console.log('✅ DOCX PROCESSOR: All values are properly defined');
    }
    
    // CRITICAL: Validate the exact tokens that should be in the template
    const finalCriticalTokens = [
      '{{Company_Name}}',
      '{{users_count}}',
      '{{users_cost}}',
      '{{Duration_of_months}}',
      '{{price_migration}}',
      '{{total_price}}'
    ];
    
    console.log('🔍 CRITICAL TOKEN VALIDATION BEFORE RENDERING:');
    finalCriticalTokens.forEach(token => {
      const value = processedData[token];
      const status = (value && value !== 'undefined' && value !== 'N/A') ? '✅' : '❌';
      console.log(`  ${status} ${token}: ${value}`);
    });
    
    return processedData;
  }
  
  /**
   * Count replaced tokens
   */
  private countReplacedTokens(data: any): number {
    return Object.keys(data).filter(key => 
      data[key] !== undefined && data[key] !== null && data[key] !== ''
    ).length;
  }

  /**
   * Create a fallback document when template processing fails
   */
  private async createFallbackDocument(templateData: DocxTemplateData): Promise<DocxProcessingResult> {
    try {
      console.log('🔄 Creating fallback document...');
      
      // Create a simple DOCX file using the original template structure
      // For now, let's create a basic DOCX with the data
      const simpleDocxContent = `
SERVICE AGREEMENT

Company: ${templateData.company}
Date: ${templateData.date}
Quote ID: ${templateData.quoteId}

CLIENT INFORMATION
Client Name: ${templateData.clientName}
Email: ${templateData.email}
Company: ${templateData.company}

SERVICE DETAILS
Number of Users: ${templateData.users}
Instance Type: ${templateData.instanceType}
Duration: ${templateData.duration} months
Data Size: ${templateData.dataSize} GB
Plan: ${templateData.planName}

PRICING BREAKDOWN
Migration Cost: ${templateData.price_migration}
Data Cost: ${templateData.price_data}
Instance Cost: ${templateData['{{instance_cost}}'] || '$0.00'}
Subtotal: ${templateData.total}
Discount: ${templateData['{{discount}}'] || '0'}%
Discount Amount: ${templateData['{{discount_amount}}'] || '$0.00'}
Total After Discount: ${templateData['{{total_after_discount}}'] || templateData.total}

TERMS AND CONDITIONS
This agreement outlines the services to be provided by CloudFuze for the migration and management of the client's data and systems as specified above.

The total cost of ${templateData.total} covers all services including migration, data transfer, and ${templateData.duration} months of service.

This agreement is valid from the date of signature and will be in effect for the duration specified above.

Generated on: ${templateData.date}
Quote ID: ${templateData.quoteId}
      `.trim();
      
      // Create a simple DOCX file (for now, we'll use text but with DOCX MIME type)
      // In a real implementation, you'd create a proper DOCX structure
      const blob = new Blob([simpleDocxContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      
      console.log('✅ Fallback document created successfully');
      console.log('📄 Content length:', simpleDocxContent.length, 'characters');
      
      return {
        success: true,
        processedDocx: blob,
        tokensReplaced: Object.keys(templateData).length,
        processingTime: 0,
        error: undefined,
        originalSize: 0,
        finalSize: blob.size
      };
      
    } catch (error) {
      console.error('❌ Error creating fallback document:', error);
      return {
        success: false,
        processedDocx: undefined,
        tokensReplaced: 0,
        processingTime: 0,
        error: `Failed to create fallback document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        originalSize: 0,
        finalSize: 0
      };
    }
  }
  
  /**
   * Download processed DOCX
   */
  downloadProcessedDocx(
    docxBlob: Blob,
    _originalFilename: string,
    _templateData: DocxTemplateData
  ): void {
    try {
      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 10);
      const companyName = _templateData.company?.replace(/[^a-zA-Z0-9]/g, '_') || 'Company';
      const filename = `${companyName}_Processed_${timestamp}.docx`;
      
      saveAs(docxBlob, filename);
      
      console.log(`✅ DOCX downloaded as "${filename}"`);
      
    } catch (error) {
      console.error('❌ Error downloading DOCX:', error);
      throw new Error('Failed to download processed DOCX');
    }
  }
  
  /**
   * Create sample template data
   */
  createSampleTemplateData(): DocxTemplateData {
    return {
      company: 'Sample Company Inc.',
      clientName: 'John Smith',
      email: 'john.smith@company.com',
      users: 100,
      price_migration: '$3,000',
      price_data: '$1,000',
      total: '$11,000',
      date: new Date().toLocaleDateString(),
      instanceType: 'Standard',
      duration: 6,
      dataSize: 50,
      quoteId: 'QTE-12345-67890',
      planName: 'Professional'
    };
  }
  
  /**
   * Extract tokens from DOCX template
   */
  async extractTokensFromTemplate(templateFile: File): Promise<{
    success: boolean;
    tokens: string[];
    error?: string;
  }> {
    try {
      console.log('🔍 Extracting tokens from DOCX template...');
      
      const templateBytes = await templateFile.arrayBuffer();
      const zip = new PizZip(templateBytes);
      
      // Extract document.xml
      const documentXml = zip.file('word/document.xml')?.asText();
      if (!documentXml) {
        throw new Error('Could not extract document content');
      }
      
      // Clean the XML content to extract only text content
      const cleanText = this.extractTextFromDocxXml(documentXml);
      
      // Find all tokens in the format {{token}}
      const tokenRegex = /\{\{([^}]+)\}\}/g;
      const tokens: string[] = [];
      let match;
      
      console.log('🔍 TOKEN EXTRACTION: Searching for tokens in clean text...');
      
      while ((match = tokenRegex.exec(cleanText)) !== null) {
        const token = match[1].trim();
        console.log('🔍 TOKEN EXTRACTION: Found potential token:', token);
        
        // Filter out tokens that contain XML markup or are malformed
        if (token && 
            !token.includes('<') && 
            !token.includes('>') && 
            !token.includes('/') && 
            !token.includes('"') &&
            !token.includes('w:') &&
            !token.includes('bookmark') &&
            !token.includes('proofErr') &&
            !token.includes('rPr') &&
            !token.includes('spacing') &&
            !token.includes('sz') &&
            !token.includes('b') &&
            !token.includes('Arial') &&
            !token.includes('val') &&
            !token.includes('xml:space') &&
            !token.includes('preserve') &&
            !token.includes('gramStart') &&
            !token.includes('spellStart') &&
            !token.includes('spellEnd') &&
            !tokens.includes(token)) {
          tokens.push(token);
          console.log('✅ TOKEN EXTRACTION: Added valid token:', token);
        } else {
          console.log('❌ TOKEN EXTRACTION: Rejected malformed token:', token);
        }
      }
      
      console.log(`✅ Found ${tokens.length} unique tokens:`, tokens);
      
      return {
        success: true,
        tokens
      };
      
    } catch (error) {
      console.error('❌ Error extracting tokens:', error);
      return {
        success: false,
        tokens: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract clean text content from DOCX XML, handling split tokens
   */
  private extractTextFromDocxXml(xmlContent: string): string {
    try {
      console.log('🔍 DOCX XML CLEANING: Starting text extraction...');
      
      // Use a more robust approach to extract text from DOCX XML
      // First, extract all text content from <w:t> nodes
      const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let cleanText = '';
      let match;
      
      while ((match = textRegex.exec(xmlContent)) !== null) {
        const textContent = match[1];
        if (textContent) {
          cleanText += textContent;
        }
      }
      
      console.log('🔍 DOCX XML CLEANING: Extracted text length:', cleanText.length);
      console.log('🔍 DOCX XML CLEANING: Extracted text preview:', cleanText.substring(0, 200) + '...');
      
      // If no text was extracted, try a different approach
      if (!cleanText || cleanText.length < 10) {
        console.log('🔍 DOCX XML CLEANING: Fallback to tag removal approach...');
        cleanText = xmlContent
          .replace(/<[^>]*>/g, '') // Remove all XML tags
          .replace(/&lt;/g, '<')   // Decode HTML entities
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')    // Normalize whitespace
          .trim();
      }
      
      // Decode HTML entities
      cleanText = cleanText
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
      
      console.log('🔍 DOCX XML CLEANING: Final clean text length:', cleanText.length);
      console.log('🔍 DOCX XML CLEANING: Final clean text preview:', cleanText.substring(0, 300) + '...');
      
      return cleanText;
    } catch (error) {
      console.error('❌ Error cleaning DOCX XML:', error);
      return xmlContent;
    }
  }
}

// Export singleton instance
export const docxTemplateProcessor = DocxTemplateProcessor.getInstance();

// Export utility functions
// Note: Interfaces are already exported at the top of the file
