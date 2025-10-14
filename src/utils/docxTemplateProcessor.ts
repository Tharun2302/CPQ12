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
  '{{discount_row}}'?: string;
  '{{discount_label}}'?: string;
  // New: total after discount alias used in template as total_price_discount
  '{{total_price_discount}}'?: string;
  '{{total_after_discount}}'?: string;
  '{{final_total}}'?: string;
  
  // Instance tokens
  '{{instance_users}}'?: string;
  '{{instance_type}}'?: string;
  '{{instanceType}}'?: string;
  '{{instance_type_cost}}'?: string;
  '{{numberOfInstances}}'?: string;
  '{{number_of_instances}}'?: string;
  '{{instances}}'?: string;
  
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
      
      // Validate that we have actual data
      if (templateBytes.byteLength === 0) {
        throw new Error('Template file is empty or corrupted');
      }
      
      // Check if the file starts with ZIP signature (PK)
      const uint8Array = new Uint8Array(templateBytes);
      if (uint8Array.length < 4 || uint8Array[0] !== 0x50 || uint8Array[1] !== 0x4B) {
        throw new Error('Template file is not a valid ZIP/DOCX file (missing ZIP signature)');
      }
      
      let zip;
      try {
        zip = new PizZip(templateBytes);
        console.log('📦 ZIP file created, files:', Object.keys(zip.files));
      } catch (zipError) {
        console.error('❌ PizZip creation failed:', zipError);
        throw new Error(`Failed to parse DOCX file as ZIP: ${zipError instanceof Error ? zipError.message : 'Unknown error'}`);
      }
      
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
      
      // Before processing, auto-fix a class of malformed placeholders that sometimes
      // appear in uploaded DOCX files where the closing brace is missing right
      // before adjacent text, e.g. "{{Company_Name}By" instead of "{{Company_Name}} By".
      // This causes Docxtemplater to throw "Unclosed tag" errors. We fix such
      // cases by inserting the missing brace and a space.
      try {
        const originalXml = zip.files['word/document.xml'].asText();
        const fixedXml = originalXml.replace(/\{\{([^}]+)\}([A-Za-z])/g, '{{$1}} $2');
        if (fixedXml !== originalXml) {
          zip.file('word/document.xml', fixedXml);
          console.log('🩹 Auto-fixed malformed placeholders in document.xml (missing \"}\" before text).');
        }
      } catch (autoFixErr) {
        console.warn('⚠️ Unable to auto-fix malformed placeholders:', autoFixErr);
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
      
      // CRITICAL: Add direct mappings for common tokens that might be missing
      const commonTokens = {
        'Company Name': processedData['{{Company Name}}'] || processedData['{{Company_Name}}'] || processedData['{{company name}}'] || 'Demo Company Inc.',
        'Company_Name': processedData['{{Company_Name}}'] || processedData['{{Company Name}}'] || processedData['{{company name}}'] || 'Demo Company Inc.',
        'users_count': processedData['{{users_count}}'] || processedData['{{userscount}}'] || processedData['{{users}}'] || '1',
        'users_cost': processedData['{{users_cost}}'] || processedData['{{user_cost}}'] || '$0.00',
        'Duration of months': processedData['{{Duration of months}}'] || processedData['{{Duration_of_months}}'] || processedData['{{duration_months}}'] || '1',
        'Duration_of_months': processedData['{{Duration_of_months}}'] || processedData['{{Duration of months}}'] || processedData['{{duration_months}}'] || '1',
        'total price': processedData['{{total price}}'] || processedData['{{total_price}}'] || processedData['{{prices}}'] || '$0.00',
        'total_price': processedData['{{total_price}}'] || processedData['{{total price}}'] || processedData['{{prices}}'] || '$0.00',
        'price_migration': processedData['{{price_migration}}'] || processedData['{{migration_price}}'] || '$0.00',
        'instance_cost': processedData['{{instance_cost}}'] || processedData['{{instanceCost}}'] || '$0.00',
        'per_user_cost': processedData['{{per_user_cost}}'] || processedData['{{per_user_monthly_cost}}'] || '$0.00',
        'data_size': processedData['{{data_size}}'] || processedData['{{dataSizeGB}}'] || processedData['{{data_size_gb}}'] || '0',
        'dataSizeGB': processedData['{{dataSizeGB}}'] || processedData['{{data_size}}'] || processedData['{{data_size_gb}}'] || '0',
        'data_size_gb': processedData['{{data_size_gb}}'] || processedData['{{data_size}}'] || processedData['{{dataSizeGB}}'] || '0',
        'per_data_cost': processedData['{{per_data_cost}}'] || '$0.00'
      };
      
      // Add common tokens to docxtemplater data
      Object.entries(commonTokens).forEach(([key, value]) => {
        if (!docxtemplaterData[key]) {
          docxtemplaterData[key] = value;
          console.log(`🔧 Added common token: "${key}" = "${value}"`);
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
        // ⭐ FINAL DEBUG BEFORE RENDERING
        console.log('🚀 FINAL TOKEN VALUES BEING SENT TO DOCXTEMPLATER:');
        console.log('  users_cost:', docxtemplaterData['users_cost']);
        console.log('  instance_cost:', docxtemplaterData['instance_cost']);
        console.log('  Duration_of_months:', docxtemplaterData['Duration_of_months']);
        console.log('  Company_Name:', docxtemplaterData['Company_Name']);
        console.log('  users_count:', docxtemplaterData['users_count']);
        console.log('  per_user_cost:', docxtemplaterData['per_user_cost']);
        console.log('  data_size:', docxtemplaterData['data_size']);
        console.log('  per_data_cost:', docxtemplaterData['per_data_cost']);
        
        // CRITICAL: Final validation before rendering
        console.log('🔍 FINAL VALIDATION BEFORE RENDERING:');
        const criticalTokens = ['Company_Name', 'users_count', 'users_cost', 'Duration_of_months', 'total_price', 'price_migration'];
        criticalTokens.forEach(token => {
          const value = docxtemplaterData[token];
          console.log(`  ${token}: "${value}" (type: ${typeof value})`);
          if (!value || value === 'undefined' || value === 'null') {
            console.error(`❌ CRITICAL: Token ${token} has invalid value: ${value}`);
          }
        });
        
        doc.render(docxtemplaterData);
        console.log('✅ Template rendered successfully with new API');

        // After rendering: if discount is not applied, remove any table row/paragraph that contains a static "Discount" label
        try {
          const discountValue = String(processedData['{{discount}}'] || '').trim();
          const discountApplied = discountValue !== '' && discountValue !== '0';
          if (!discountApplied) {
            const zipAfter = doc.getZip();
            const xmlPath = 'word/document.xml';
            const originalXml = zipAfter.file(xmlPath)?.asText() || '';

            // Helper to strip any XML tags to check human text
            const stripTags = (xml: string) => xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

            // Remove any table row that contains the word "discount" even when split across multiple runs
            const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/gi;
            let newXml = originalXml.replace(rowRegex, (row) => {
              const text = stripTags(row);
              return text.includes('discount') ? '' : row;
            });

            // Also remove standalone paragraphs that contain the word "discount"
            const paraRegex = /<w:p[\s\S]*?<\/w:p>/gi;
            newXml = newXml.replace(paraRegex, (para) => {
              const text = stripTags(para);
              return text.includes('discount') ? '' : para;
            });

            // Additionally, remove any table row that is effectively empty (e.g., when cells are only tokens that resolved to empty
            const emptyRowRegex = /<w:tr[\s\S]*?<\/w:tr>/gi;
            let cleanedXml = newXml.replace(emptyRowRegex, (row) => {
              const text = stripTags(row);
              return text.length === 0 ? '' : row;
            });

            if (cleanedXml !== originalXml) {
              zipAfter.file(xmlPath, cleanedXml);
              console.log('🧹 Removed Discount/empty rows because discount is not applied');
            }

            // Fallback: if any isolated "Discount" text remains (not in a table), blank it
            let fallbackXml = zipAfter.file(xmlPath)?.asText() || cleanedXml;
            const discountTextRun = /<w:t[^>]*>\s*Discount\s*<\/w:t>/gi;
            if (discountTextRun.test(fallbackXml)) {
              fallbackXml = fallbackXml.replace(discountTextRun, '<w:t></w:t>');
              zipAfter.file(xmlPath, fallbackXml);
              console.log('🧹 Fallback applied: stripped remaining "Discount" text runs');
            }
          }
        } catch (cleanupErr) {
          console.warn('⚠️ Could not post-process DOCX to remove Discount rows:', cleanupErr);
        }
        
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
      
      // Generate output from Docxtemplater
      let buffer = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      // Validate generated buffer
      if (!buffer || buffer.size === 0) {
        throw new Error('Generated DOCX buffer is empty or invalid');
      }
      
      // Check if generated buffer has valid ZIP signature
      const bufferArrayBuffer = await buffer.arrayBuffer();
      const bufferUint8Array = new Uint8Array(bufferArrayBuffer);
      if (bufferUint8Array.length < 4 || bufferUint8Array[0] !== 0x50 || bufferUint8Array[1] !== 0x4B) {
        throw new Error('Generated DOCX buffer is not a valid ZIP file (missing ZIP signature)');
      }
      
      console.log('✅ Generated DOCX buffer is valid, size:', buffer.size, 'bytes');
      
      // CRITICAL: Verify that tokens were actually replaced in the final document
      console.log('🔍 VERIFYING TOKEN REPLACEMENT IN FINAL DOCUMENT:');
      try {
        let finalZip = new PizZip(bufferArrayBuffer);
        let finalDocumentXml = finalZip.file('word/document.xml')?.asText();
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

          // FINAL SAFETY CLEANUP: If discount is not applied, remove any remaining Discount paragraphs/rows
          const discountValue = String(processedData['{{discount}}'] || '').trim();
          const discountApplied = discountValue !== '' && discountValue !== '0' && discountValue !== 'N/A' && discountValue !== 'n/a';
          
          console.log('🔍 DISCOUNT CLEANUP DEBUG:');
          console.log('  discountValue:', discountValue);
          console.log('  discountApplied:', discountApplied);
          console.log('  processedData keys:', Object.keys(processedData).filter(k => k.includes('discount')));
          
          if (!discountApplied) {
            console.log('🧹 DISCOUNT CLEANUP: Starting cleanup because discount is not applied');
            
            // PRECISE CLEANUP: Only remove specific discount-related content, not headers
            let modifiedXml = finalDocumentXml;
            
            // 1. Remove table rows that contain ONLY discount-related content
            const discountRowRegex = /<w:tr[\s\S]*?<\/w:tr>/gi;
            modifiedXml = modifiedXml.replace(discountRowRegex, (row) => {
              const rowText = row.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
              
              // Only remove rows that are clearly discount-related
              if (rowText === 'discount n/a' || 
                  rowText === 'discount' || 
                  rowText === 'n/a' ||
                  (rowText.includes('discount') && rowText.includes('n/a') && rowText.length < 50)) {
                console.log('🧹 Removing discount row:', rowText);
                return '';
              }
              return row;
            });

            // 2. Remove paragraphs that contain ONLY discount-related content
            const discountParaRegex = /<w:p[\s\S]*?<\/w:p>/gi;
            modifiedXml = modifiedXml.replace(discountParaRegex, (para) => {
              const paraText = para.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
              
              // Only remove paragraphs that are clearly discount-related
              if (paraText === 'discount n/a' || 
                  paraText === 'discount' || 
                  paraText === 'n/a' ||
                  (paraText.includes('discount') && paraText.includes('n/a') && paraText.length < 50)) {
                console.log('🧹 Removing discount paragraph:', paraText);
                return '';
              }
              return para;
            });

            // 3. Remove specific discount table cells (but preserve headers)
            const discountCellRegex = /<w:tc[\s\S]*?<\/w:tc>/gi;
            modifiedXml = modifiedXml.replace(discountCellRegex, (cell) => {
              const cellText = cell.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
              
              // Only remove cells that are clearly discount-related
              if (cellText === 'discount' || cellText === 'n/a') {
                console.log('🧹 Removing discount cell:', cellText);
                return '';
              }
              return cell;
            });

            // 4. Remove empty table rows that might be left after discount removal
            const emptyRowRegex = /<w:tr[\s\S]*?<\/w:tr>/gi;
            modifiedXml = modifiedXml.replace(emptyRowRegex, (row) => {
              const rowText = row.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
              if (rowText.length === 0) {
                console.log('🧹 Removing empty row');
                return '';
              }
              return row;
            });

            if (modifiedXml !== finalDocumentXml) {
              console.log('🧹 Final cleanup: removed Discount/N/A blocks in post-pack stage');
              finalZip.file('word/document.xml', modifiedXml);
              // Also clean headers and footers if they contain specific discount content
              Object.keys(finalZip.files).forEach((fileName) => {
                if (/^word\/(header\d+\.xml|footer\d+\.xml)$/i.test(fileName)) {
                  try {
                    const xml = finalZip.file(fileName)?.asText() || '';
                    if (!xml) return;
                    
                    // Use the same precise cleanup for headers/footers
                    let cleaned = xml;
                    
                    // Remove discount rows in headers/footers
                    const headerDiscountRowRegex = /<w:tr[\s\S]*?<\/w:tr>/gi;
                    cleaned = cleaned.replace(headerDiscountRowRegex, (row) => {
                      const rowText = row.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
                      if (rowText === 'discount n/a' || 
                          rowText === 'discount' || 
                          rowText === 'n/a' ||
                          (rowText.includes('discount') && rowText.includes('n/a') && rowText.length < 50)) {
                        return '';
                      }
                      return row;
                    });
                    
                    // Remove discount paragraphs in headers/footers
                    const headerDiscountParaRegex = /<w:p[\s\S]*?<\/w:p>/gi;
                    cleaned = cleaned.replace(headerDiscountParaRegex, (para) => {
                      const paraText = para.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
                      if (paraText === 'discount n/a' || 
                          paraText === 'discount' || 
                          paraText === 'n/a' ||
                          (paraText.includes('discount') && paraText.includes('n/a') && paraText.length < 50)) {
                        return '';
                      }
                      return para;
                    });
                    
                    if (cleaned !== xml) {
                      finalZip.file(fileName, cleaned);
                      console.log(`🧹 Cleaned header/footer: ${fileName}`);
                    }
                  } catch {}
                }
              });
              // Re-generate cleaned buffer
              buffer = finalZip.generate({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              });

              // Verify that Discount/N/A no longer exists in main document
              const verifyZip = new PizZip(await buffer.arrayBuffer());
              const verifyXml = verifyZip.file('word/document.xml')?.asText() || '';
              const verifyText = this.extractTextFromDocxXml(verifyXml).toLowerCase();
              if (!verifyText.includes('discount') && !verifyText.includes('n/a')) {
                console.log('✅ Verification: Discount/N/A removed from main document');
              } else {
                console.warn('⚠️ Verification: Discount/N/A still present in main document after cleanup');
              }
            }
          }
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
      day: '2-digit',
      timeZone: 'America/New_York'
    });
    
    // Extract start and end dates from template data
    const startDate = (data as any)['{{Start_date}}'] || (data as any).configuration?.startDate || '';
    let endDate = (data as any)['{{End_date}}'] || (data as any).configuration?.endDate || '';
    
    // CRITICAL: Fallback calculation for end date if not provided (for hidden field scenario)
    if (!endDate && startDate && (data as any).configuration?.duration && (data as any).configuration.duration > 0) {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(startDateObj);
      endDateObj.setMonth(endDateObj.getMonth() + (data as any).configuration.duration);
      endDate = endDateObj.toISOString().split('T')[0];
      console.log(`🔧 DOCX PROCESSOR: Calculated end date fallback: ${endDate} (Start: ${startDate}, Duration: ${(data as any).configuration.duration} months)`);
    }
    
    console.log('🔍 DOCX PROCESSOR EXTRACTED VALUES:');
    console.log('  companyName:', companyName);
    console.log('  userCount:', userCount);
    console.log('  userCost:', userCost);
    console.log('  duration:', duration);
    console.log('  totalPrice:', totalPrice);
    console.log('  migrationCost:', migrationCost);
    console.log('  startDate:', startDate);
    console.log('  endDate:', endDate);
    
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
    
    // ⭐ SPECIFIC DEBUG FOR USER'S TEMPLATE TOKENS
    console.log('🎯 USER TEMPLATE SPECIFIC TOKENS IN DOCX PROCESSOR:');
    console.log('  Checking {{users_cost}} - input value:', data['{{users_cost}}']);
    console.log('  Checking {{instance_cost}} - input value:', data['{{instance_cost}}']);
    console.log('  Checking {{Duration_of_months}} - input value:', data['{{Duration_of_months}}']);
    console.log('  Checking {{per_user_cost}} - input value:', (data as any)['{{per_user_cost}}']);
    console.log('  Checking {{data_size}} - input value:', (data as any)['{{data_size}}']);
    console.log('  Checking {{per_data_cost}} - input value:', (data as any)['{{per_data_cost}}']);
    console.log('  Final values that will be used:');
    console.log('    users_cost final value:', userCost);
    console.log('    instance_cost input:', (data as any)['{{instance_cost}}']);
    console.log('    Duration_of_months final value:', duration);
    console.log('    per_user_cost calculated:', (data as any)['{{per_user_cost}}']);
    console.log('    data_size input:', (data as any)['{{data_size}}']);
    console.log('    per_data_cost input:', (data as any)['{{per_data_cost}}']);
    
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
      
      // Per-user cost variations - fixed to match pricing display
      '{{per_user_cost}}': (data as any)['{{per_user_cost}}'] || ((data as any)['{{users_cost}}'] ? 
        (parseFloat(((data as any)['{{users_cost}}'] as string).replace(/[$,]/g, '')) / parseInt(userCount)).toFixed(2) : '0.00'),
      '{{per_user_monthly_cost}}': (data as any)['{{per_user_monthly_cost}}'] || ((data as any)['{{users_cost}}'] ? 
        (parseFloat(((data as any)['{{users_cost}}'] as string).replace(/[$,]/g, '')) / (parseInt(userCount) * parseInt(duration))).toFixed(2) : '0.00'),
      '{{user_rate}}': (data as any)['{{user_rate}}'] || ((data as any)['{{users_cost}}'] ? 
        (parseFloat(((data as any)['{{users_cost}}'] as string).replace(/[$,]/g, '')) / parseInt(userCount)).toFixed(2) : '0.00'),
      '{{monthly_user_rate}}': (data as any)['{{monthly_user_rate}}'] || ((data as any)['{{users_cost}}'] ? 
        (parseFloat(((data as any)['{{users_cost}}'] as string).replace(/[$,]/g, '')) / (parseInt(userCount) * parseInt(duration))).toFixed(2) : '0.00'),
      
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
      
      // Project date variations - formatted as mm/dd/yyyy
      '{{Start_date}}': this.formatDateMMDDYYYY(startDate),
      '{{start_date}}': this.formatDateMMDDYYYY(startDate),
      '{{startdate}}': this.formatDateMMDDYYYY(startDate),
      '{{project_start_date}}': this.formatDateMMDDYYYY(startDate),
      '{{project_start}}': this.formatDateMMDDYYYY(startDate),
      '{{End_date}}': this.formatDateMMDDYYYY(endDate),
      '{{end_date}}': this.formatDateMMDDYYYY(endDate),
      '{{enddate}}': this.formatDateMMDDYYYY(endDate),
      '{{project_end_date}}': this.formatDateMMDDYYYY(endDate),
      '{{project_end}}': this.formatDateMMDDYYYY(endDate),
      
      // Additional common tokens
      '{{price_data}}': data['{{price_data}}'] || '$0.00',
      '{{data_cost}}': data['{{price_data}}'] || '$0.00',
      '{{instance_cost}}': (data as any)['{{instance_cost}}'] || '$0.00',
      '{{quoteId}}': data.quoteId || 'N/A',
      '{{quote_id}}': data.quoteId || 'N/A',
      '{{planName}}': data.planName || 'Basic',
      '{{plan_name}}': data.planName || 'Basic',
      
      // Messages from configuration
      '{{messages}}': (data as any)['{{messages}}'] || '0',
      '{{message}}': (data as any)['{{message}}'] || '0',
      '{{message_count}}': (data as any)['{{message_count}}'] || '0',
      '{{notes}}': (data as any)['{{notes}}'] || '0',
      '{{additional_notes}}': (data as any)['{{additional_notes}}'] || '0',
      '{{custom_message}}': (data as any)['{{custom_message}}'] || '0',
      '{{number_of_messages}}': (data as any)['{{number_of_messages}}'] || '0',
      '{{numberOfMessages}}': (data as any)['{{numberOfMessages}}'] || '0',
      '{{messages_count}}': (data as any)['{{messages_count}}'] || '0',
      
      // Discount tokens - hide when discount is 0
      '{{discount}}': (data as any)['{{discount}}'] || '',
      '{{discount_percent}}': (data as any)['{{discount_percent}}'] || '',
      '{{discount_amount}}': (data as any)['{{discount_amount}}'] || '',
      '{{discount_text}}': (data as any)['{{discount_text}}'] || '',
      '{{discount_line}}': (data as any)['{{discount_line}}'] || '',
      '{{discount_row}}': (data as any)['{{discount_row}}'] || '',
      // Useful when templates have a static label cell. Empty it when discount is not applied
      '{{discount_label}}': ((data as any)['{{discount}}'] && (data as any)['{{discount}}'] !== '' && (data as any)['{{discount}}'] !== '0') ? 'Discount' : '',
      // Special tokens for conditional display
      '{{show_discount}}': ((data as any)['{{discount}}'] && (data as any)['{{discount}}'] !== '' && (data as any)['{{discount}}'] !== '0') ? 'true' : '',
      '{{hide_discount}}': ((data as any)['{{discount}}'] && (data as any)['{{discount}}'] !== '' && (data as any)['{{discount}}'] !== '0') ? '' : 'true',
      
      // Enhanced discount tokens for better template control
      '{{discount_percent_only}}': (data as any)['{{discount_percent_only}}'] || '',
      '{{discount_percent_with_parentheses}}': (data as any)['{{discount_percent_with_parentheses}}'] || '',
      '{{discount_display}}': (data as any)['{{discount_display}}'] || '',
      '{{discount_full_line}}': (data as any)['{{discount_full_line}}'] || '',
      // Support both names: total_after_discount and total_price_discount
      '{{total_after_discount}}': (data as any)['{{total_after_discount}}'] || (data as any)['{{total_price_discount}}'] || (data as any)['{{total_price}}'] || '$0.00',
      '{{total_price_discount}}': (data as any)['{{total_price_discount}}'] || (data as any)['{{total_after_discount}}'] || (data as any)['{{total_price}}'] || '$0.00',
      '{{final_total}}': (data as any)['{{final_total}}'] || (data as any)['{{total_after_discount}}'] || (data as any)['{{total_price_discount}}'] || (data as any)['{{total_price}}'] || '$0.00',
      
      // Instance tokens
      '{{instance_users}}': this.numberToWords(parseInt((data as any)['{{instance_users}}'] || (data as any)['{{numberOfInstances}}'] || (data as any)['{{instances}}'] || '1')),
      '{{instance_type}}': (data as any)['{{instance_type}}'] || (data as any)['{{instanceType}}'] || data.instanceType || 'Standard',
      '{{instanceType}}': (data as any)['{{instanceType}}'] || (data as any)['{{instance_type}}'] || data.instanceType || 'Standard',
      '{{instance_type_cost}}': (data as any)['{{instance_type_cost}}'] || (() => {
        const { getInstanceTypeCost, formatCurrency } = require('./pricing');
        const instanceType = (data as any)['{{instance_type}}'] || (data as any)['{{instanceType}}'] || data.instanceType || 'Standard';
        return formatCurrency(getInstanceTypeCost(instanceType));
      })(),
      '{{numberOfInstances}}': (data as any)['{{numberOfInstances}}'] || (data as any)['{{instance_users}}'] || (data as any)['{{instances}}'] || '1',
      '{{number_of_instances}}': (data as any)['{{number_of_instances}}'] || (data as any)['{{numberOfInstances}}'] || (data as any)['{{instance_users}}'] || '1',
      '{{instances}}': (data as any)['{{instances}}'] || (data as any)['{{numberOfInstances}}'] || (data as any)['{{instance_users}}'] || '1',
      
      // Data size tokens
      '{{data_size}}': (data as any)['{{data_size}}'] || (data as any)['{{dataSizeGB}}'] || (data as any)['{{data_size_gb}}'] || '0',
      '{{dataSizeGB}}': (data as any)['{{dataSizeGB}}'] || (data as any)['{{data_size}}'] || (data as any)['{{data_size_gb}}'] || '0',
      '{{data_size_gb}}': (data as any)['{{data_size_gb}}'] || (data as any)['{{data_size}}'] || (data as any)['{{dataSizeGB}}'] || '0',
      
      // Per-data cost tokens
      '{{per_data_cost}}': (data as any)['{{per_data_cost}}'] || '$0.00',
      
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
        // Never force-fill discount-related tokens; keep them empty so rows can be removed
        const lower = key.toLowerCase();
        if (lower.includes('discount') || lower.includes('show_discount') || lower.includes('hide_discount') || lower.includes('if_discount')) {
          processedData[key] = '';
          return;
        }
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
          processedData[key] = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
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
Subtotal: ${templateData.total}${(templateData['{{discount}}'] && templateData['{{discount}}'] !== '' && templateData['{{discount}}'] !== '0') ? `
Discount: ${templateData['{{discount}}']}% - ${templateData['{{discount_amount}}']}` : ''}
Total After Discount: ${templateData['{{total_after_discount}}'] || templateData.total}

TERMS AND CONDITIONS
This agreement outlines the services to be provided by CloudFuze for the migration and management of the client's data and systems as specified above.

The total cost of ${templateData.total} covers all services including migration, data transfer, and ${templateData.duration} months of service.

This agreement is valid from the date of signature and will be in effect for the duration specified above.

Generated on: ${templateData.date}
Quote ID: ${templateData.quoteId}
      `.trim();
      
      // Create a proper DOCX file using the docx library
      const { Document, Packer, Paragraph, TextRun } = await import('docx');
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "SERVICE AGREEMENT",
                  bold: true,
                  size: 32
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Company: ${templateData.company || 'N/A'}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Date: ${templateData.date || new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Quote ID: ${templateData.quoteId || 'N/A'}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "\nCLIENT INFORMATION",
                  bold: true,
                  size: 28
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Client Name: ${templateData.clientName || 'N/A'}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Email: ${templateData.email || 'N/A'}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Company: ${templateData.company || 'N/A'}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "\nSERVICE DETAILS",
                  bold: true,
                  size: 28
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Number of Users: ${templateData.users || 'N/A'}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Duration: ${templateData.duration || 'N/A'} months`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Plan: ${templateData.planName || 'N/A'}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "\nPRICING BREAKDOWN",
                  bold: true,
                  size: 28
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Total Cost: ${templateData.total || 'N/A'}`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "\nTERMS AND CONDITIONS",
                  bold: true,
                  size: 28
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "This agreement outlines the services to be provided by CloudFuze for the migration and management of the client's data and systems as specified above.",
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `The total cost of ${templateData.total || 'N/A'} covers all services including migration, data transfer, and ${templateData.duration || 'N/A'} months of service.`,
                  size: 24
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "This agreement is valid from the date of signature and will be in effect for the duration specified above.",
                  size: 24
                })
              ]
            })
          ]
        }]
      });
      
      const blob = await Packer.toBlob(doc);
      
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
      date: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
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

  /**
   * Format date in mm/dd/yyyy format
   */
  private formatDateMMDDYYYY(dateString: string): string {
    console.log('🔍 formatDateMMDDYYYY called with:', dateString, 'type:', typeof dateString);
    
    if (!dateString || dateString === 'N/A' || dateString === 'undefined' || dateString === 'null') {
      console.log('  Returning N/A - empty or invalid dateString');
      return 'N/A';
    }
    
    try {
      let date: Date;
      
      // Handle different date formats
      if (dateString.includes('-')) {
        // Handle YYYY-MM-DD format (from HTML date input)
        date = new Date(dateString + 'T00:00:00');
      } else if (dateString.includes('/')) {
        // Handle MM/DD/YYYY format
        date = new Date(dateString);
      } else {
        // Try parsing as-is
        date = new Date(dateString);
      }
      
      console.log('  Parsed date object:', date);
      console.log('  Date is valid:', !isNaN(date.getTime()));
      console.log('  Date toString:', date.toString());
      
      if (isNaN(date.getTime())) {
        console.log('  Invalid date, returning N/A');
        return 'N/A';
      }
      
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const year = date.getFullYear();
      const result = `${month}/${day}/${year}`;
      console.log('  Formatted result:', result);
      return result;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'N/A';
    }
  }

  /**
   * Convert number to words (e.g., 2 -> "Two", 45 -> "Forty-Five")
   */
  private numberToWords(num: number): string {
    if (num === 0) return 'Zero';
    if (num < 0) return 'Negative ' + this.numberToWords(-num);
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) {
      const ten = Math.floor(num / 10);
      const one = num % 10;
      return tens[ten] + (one > 0 ? '-' + ones[one] : '');
    }
    if (num < 1000) {
      const hundred = Math.floor(num / 100);
      const remainder = num % 100;
      return ones[hundred] + ' Hundred' + (remainder > 0 ? ' ' + this.numberToWords(remainder) : '');
    }
    if (num < 1000000) {
      const thousand = Math.floor(num / 1000);
      const remainder = num % 1000;
      return this.numberToWords(thousand) + ' Thousand' + (remainder > 0 ? ' ' + this.numberToWords(remainder) : '');
    }
    if (num < 1000000000) {
      const million = Math.floor(num / 1000000);
      const remainder = num % 1000000;
      return this.numberToWords(million) + ' Million' + (remainder > 0 ? ' ' + this.numberToWords(remainder) : '');
    }
    
    // For very large numbers, return the number as string
    return num.toString();
  }
}

// Export singleton instance
export const docxTemplateProcessor = DocxTemplateProcessor.getInstance();

// Export utility functions
// Note: Interfaces are already exported at the top of the file
