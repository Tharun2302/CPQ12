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
  
  // Payment terms tokens
  '{{payment_terms}}'?: string;
  '{{Payment_terms}}'?: string;
  '{{Payment Terms}}'?: string;
  '{{Payment_Terms}}'?: string;
  '{{paymentTerms}}'?: string;
  
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
  paymentTerms?: string;
  
  // Exhibit array for dynamic table rows
  exhibits?: Array<{
    exhibitType: string;
    exhibitDesc: string;
    exhibitPlan: string;
    exhibitPrice: string;
  }>;
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
   * Helper function to access ZIP files with both path separators (cross-platform)
   * Windows DOCX files may use backslashes, Unix uses forward slashes
   */
  private getZipFile(zip: any, path: string): any {
    // Try forward slash first (standard)
    let file = zip.files[path];
    if (file) return file;
    
    // Try backslash (Windows)
    const backslashPath = path.replace(/\//g, '\\');
    file = zip.files[backslashPath];
    if (file) return file;
    
    // Not found
    return null;
  }

  /**
   * Helper function to read ZIP file text with both path separators
   */
  private getZipFileText(zip: any, path: string): string {
    const file = this.getZipFile(zip, path);
    return file ? file.asText() : '';
  }

  /**
   * Helper function to write to ZIP file (always use forward slash for writing)
   */
  private setZipFile(zip: any, path: string, content: string): void {
    // Always use forward slash for writing (PizZip normalizes internally)
    zip.file(path, content);
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
        // Log the first few bytes to help diagnose the issue
        const firstBytes = Array.from(uint8Array.slice(0, Math.min(20, uint8Array.length)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.error('❌ File signature check failed. First bytes:', firstBytes);
        
        // Check if it looks like HTML (common when backend returns an error page)
        const textDecoder = new TextDecoder('utf-8');
        const firstChars = textDecoder.decode(uint8Array.slice(0, Math.min(100, uint8Array.length)));
        if (firstChars.toLowerCase().includes('<html') || firstChars.toLowerCase().includes('<!doctype')) {
          throw new Error('Template file appears to be an HTML page, not a DOCX file. The backend may have returned an error page instead of the file.');
        }
        
        throw new Error(`Template file is not a valid ZIP/DOCX file (missing ZIP signature). File may be corrupted or not a DOCX file.`);
      }
      
      let zip;
      try {
        zip = new PizZip(templateBytes);
        console.log('📦 ZIP file created, files:', Object.keys(zip.files));
      } catch (zipError) {
        console.error('❌ PizZip creation failed:', zipError);
        
        // Try to detect what kind of file this is
        const textDecoder = new TextDecoder('utf-8');
        const filePreview = textDecoder.decode(uint8Array.slice(0, Math.min(200, uint8Array.length)));
        console.error('❌ File preview:', filePreview);
        
        throw new Error(`Failed to parse DOCX file as ZIP: ${zipError instanceof Error ? zipError.message : 'Unknown error'}. The file may be corrupted or not a valid DOCX file.`);
      }
      
      // Check if this is a valid DOCX file
      // Note: Handle both forward slashes (/) and backslashes (\) for cross-platform compatibility
      const hasDocumentXml = zip.files['word/document.xml'] || zip.files['word\\document.xml'];
      
      if (!hasDocumentXml) {
        const availableFiles = Object.keys(zip.files).join(', ');
        console.error('❌ DOCX validation failed. Available files in ZIP:', availableFiles);
        throw new Error(`Invalid DOCX file: missing word/document.xml. Available files: ${availableFiles || 'none'}. This may be a corrupted DOCX file or a different type of ZIP archive.`);
      }
      
      console.log('✅ Found word/document.xml in DOCX archive');
      
      // Get the correct document.xml file (handle both path separators for cross-platform compatibility)
      const documentXml = this.getZipFileText(zip, 'word/document.xml');
      if (!documentXml) {
        throw new Error('Could not access word/document.xml after validation');
      }
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
        const originalXml = documentXml;
        const fixedXml = originalXml.replace(/\{\{([^}]+)\}([A-Za-z])/g, '{{$1}} $2');
        if (fixedXml !== originalXml) {
          // Use helper function for cross-platform compatibility
          this.setZipFile(zip, 'word/document.xml', fixedXml);
          console.log('🩹 Auto-fixed malformed placeholders in document.xml (missing \"}\" before text).');
        }
      } catch (autoFixErr) {
        console.warn('⚠️ Unable to auto-fix malformed placeholders:', autoFixErr);
      }

      // For now, let's always try to process the template first
      // The fallback will be triggered if processing fails
      console.log('🔄 Attempting to process template with Docxtemplater...');
      
      // CRITICAL FIX: Normalize all ZIP paths to forward slashes for cross-platform compatibility
      // Windows DOCX files may have backslash paths which confuse Docxtemplater
      const normalizedZip = new PizZip();
      Object.keys(zip.files).forEach((path) => {
        const normalizedPath = path.replace(/\\/g, '/');
        const file = zip.files[path];
        if (file.dir) {
          normalizedZip.folder(normalizedPath);
          return;
        }

        // In the browser, PizZip file objects typically expose `asUint8Array()` or `asBinary()`.
        // Be defensive: some builds won't have `asNodeBuffer`.
        const content =
          typeof file.asUint8Array === 'function'
            ? file.asUint8Array()
            : typeof file.asBinary === 'function'
              ? file.asBinary()
              : typeof file.asText === 'function'
                ? file.asText()
                : '';

        // Mark binary when content is binary-like to avoid corruption (esp. images).
        const isBinary = typeof content !== 'string';
        normalizedZip.file(normalizedPath, content as any, { binary: isBinary });
      });
      
      console.log('✅ ZIP paths normalized for Docxtemplater. Files:', Object.keys(normalizedZip.files).slice(0, 10));
      
      // Create docxtemplater instance with normalized ZIP and custom delimiters
      const doc = new Docxtemplater(normalizedZip, {
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
      //
      // IMPORTANT: Some DOCX templates include extra whitespace inside the tag,
      // e.g. "{{ per_data_cost }}" (note the spaces). Docxtemplater will treat
      // the tag name literally unless trimmed by a parser, so we provide
      // compatibility keys and also generate common variants.
      const docxtemplaterData: any = {};
      Object.keys(processedData).forEach((key) => {
        if (key.startsWith('{{') && key.endsWith('}}')) {
          // Remove {{}} brackets for docxtemplater
          const rawCleanKey = key.slice(2, -2);
          const cleanKey = rawCleanKey.trim();
          const value = processedData[key];

          // Primary (trimmed) key
          docxtemplaterData[cleanKey] = value;

          // Also store the raw (untrimmed) key just in case the template uses spaces in the tag name.
          if (rawCleanKey !== cleanKey) {
            docxtemplaterData[rawCleanKey] = value;
          }

          // CRITICAL: Also add underscore version for compatibility
          // This handles cases where template has "Company Name" but docxtemplater expects "Company_Name"
          if (cleanKey.includes(' ')) {
            const underscoreKey = cleanKey.replace(/\s+/g, '_');
            docxtemplaterData[underscoreKey] = value;
            console.log(`🔧 Added underscore version: "${cleanKey}" → "${underscoreKey}"`);
          }

          // CRITICAL: Also add space version for compatibility
          // This handles cases where template has "Company_Name" but docxtemplater expects "Company Name"
          if (cleanKey.includes('_')) {
            const spaceKey = cleanKey.replace(/_/g, ' ');
            docxtemplaterData[spaceKey] = value;
            console.log(`🔧 Added space version: "${cleanKey}" → "${spaceKey}"`);
          }

          // Also add a hyphenated version for templates that use kebab-case keys.
          if (cleanKey.includes('_') || cleanKey.includes(' ')) {
            const kebabKey = cleanKey.replace(/\s+/g, '-').replace(/_/g, '-');
            docxtemplaterData[kebabKey] = value;
          }
        } else {
          // Keep non-bracket keys as is
          docxtemplaterData[key] = processedData[key];
        }
      });

      // Extra compatibility: if templates have a single space padding inside tags
      // (e.g. "{{ per_data_cost }}" where tag name is " per_data_cost "), make
      // sure those keys exist too.
      try {
        Object.keys(docxtemplaterData).forEach((k) => {
          if (typeof k === 'string' && k.trim() === k) {
            const padded = ` ${k} `;
            if (!(padded in docxtemplaterData)) {
              docxtemplaterData[padded] = docxtemplaterData[k];
            }
          }
        });
      } catch (e) {
        console.warn('⚠️ Unable to add whitespace-padded token compatibility keys:', e);
      }
      
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
        'instance_cost': processedData['{{instance_cost}}'] || processedData['{{instance..cost}}'] || processedData['{{instance cost}}'] || processedData['{{instanceCost}}'] || '$0.00',
        'instance..cost': processedData['{{instance..cost}}'] || processedData['{{instance_cost}}'] || processedData['{{instance cost}}'] || '$0.00', // Handle double-dot typo
        'instance cost': processedData['{{instance cost}}'] || processedData['{{instance_cost}}'] || processedData['{{instance..cost}}'] || '$0.00', // Space version
        'per_user_cost': processedData['{{per_user_cost}}'] || processedData['{{per_user_monthly_cost}}'] || '$0.00',
        'data_size': processedData['{{data_size}}'] || processedData['{{dataSizeGB}}'] || processedData['{{data_size_gb}}'] || '0',
        'dataSizeGB': processedData['{{dataSizeGB}}'] || processedData['{{data_size}}'] || processedData['{{data_size_gb}}'] || '0',
        'data_size_gb': processedData['{{data_size_gb}}'] || processedData['{{data_size}}'] || processedData['{{dataSizeGB}}'] || '0',
        'per_data_cost': processedData['{{per_data_cost}}'] || '$0.00',
        // Multi combination - Content tokens with spaces
        'content number of instances': processedData['{{content number of instances}}'] || processedData['{{content_number_of_instances}}'] || '0',
        'content instance type': processedData['{{content instance type}}'] || processedData['{{content_instance_type}}'] || 'Standard',
        // Multi combination - Messaging tokens with spaces
        'messaging number of instances': processedData['{{messaging number of instances}}'] || processedData['{{messaging_number_of_instances}}'] || '0',
        'messaging instance type': processedData['{{messaging instance type}}'] || processedData['{{messaging_instance_type}}'] || 'Standard',
        // Discount tokens with spaces
        'discount percent': processedData['{{discount percent}}'] || processedData['{{discount_percent}}'] || '',
        'discount amount': processedData['{{discount amount}}'] || processedData['{{discount_amount}}'] || '',
        // Multi combination - Content tokens
        'content_migration_name': processedData['{{content_migration_name}}'] || processedData['{{contentMigrationName}}'] || '',
        'contentMigrationName': processedData['{{contentMigrationName}}'] || processedData['{{content_migration_name}}'] || '',
        'content_users_count': processedData['{{content_users_count}}'] || processedData['{{contentUsersCount}}'] || processedData['{{content_number_of_users}}'] || '0',
        'contentUsersCount': processedData['{{contentUsersCount}}'] || processedData['{{content_users_count}}'] || '0',
        'content_data_size': processedData['{{content_data_size}}'] || processedData['{{contentDataSize}}'] || processedData['{{content_data_size_gb}}'] || '0',
        'contentDataSize': processedData['{{contentDataSize}}'] || processedData['{{content_data_size}}'] || '0',
        'content_migration_cost': processedData['{{content_migration_cost}}'] || processedData['{{contentMigrationCost}}'] || '$0.00',
        'contentMigrationCost': processedData['{{contentMigrationCost}}'] || processedData['{{content_migration_cost}}'] || '$0.00',
        // Multi combination - Messaging tokens
        'messaging_migration_name': processedData['{{messaging_migration_name}}'] || processedData['{{messagingMigrationName}}'] || '',
        'messagingMigrationName': processedData['{{messagingMigrationName}}'] || processedData['{{messaging_migration_name}}'] || '',
        'messaging_users_count': processedData['{{messaging_users_count}}'] || processedData['{{messagingUsersCount}}'] || processedData['{{messaging_number_of_users}}'] || '0',
        'messagingUsersCount': processedData['{{messagingUsersCount}}'] || processedData['{{messaging_users_count}}'] || '0',
        'messaging_messages': processedData['{{messaging_messages}}'] || processedData['{{messagingMessages}}'] || '0',
        'messagingMessages': processedData['{{messagingMessages}}'] || processedData['{{messaging_messages}}'] || '0',
        'messaging_migration_cost': processedData['{{messaging_migration_cost}}'] || processedData['{{messagingMigrationCost}}'] || '$0.00',
        'messagingMigrationCost': processedData['{{messagingMigrationCost}}'] || processedData['{{messaging_migration_cost}}'] || '$0.00',
        // Message count token (for backward compatibility)
        'message_count': processedData['{{message_count}}'] || processedData['{{messaging_messages}}'] || processedData['{{messages}}'] || '0',
        // Server instance cost breakdown (Multi combination)
        'server_instance_cost_breakdown': processedData['{{server_instance_cost_breakdown}}'] || '',
        'server_descriptions': processedData['{{server_descriptions}}'] || processedData['{{serverDescriptions}}'] || ''
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
        console.log('  server_instance_cost_breakdown:', docxtemplaterData['server_instance_cost_breakdown']);
        console.log('  server_descriptions:', docxtemplaterData['server_descriptions']);
        
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
            const originalXml = this.getZipFileText(zipAfter, xmlPath);

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
              this.setZipFile(zipAfter, xmlPath, cleanedXml);
              console.log('🧹 Removed Discount/empty rows because discount is not applied');
            }

            // Fallback: if any isolated "Discount" text remains (not in a table), blank it
            let fallbackXml = this.getZipFileText(zipAfter, xmlPath) || cleanedXml;
            const discountTextRun = /<w:t[^>]*>\s*Discount\s*<\/w:t>/gi;
            if (discountTextRun.test(fallbackXml)) {
              fallbackXml = fallbackXml.replace(discountTextRun, '<w:t></w:t>');
              this.setZipFile(zipAfter, xmlPath, fallbackXml);
              console.log('🧹 Fallback applied: stripped remaining "Discount" text runs');
            }
          }
        } catch (cleanupErr) {
          console.warn('⚠️ Could not post-process DOCX to remove Discount rows:', cleanupErr);
        }

        // ========================================================================
        // Remove ONLY the *extra template* validity artifacts, without touching
        // the per-server validity we now embed in {{server_descriptions}}.
        //
        // Safe removals (standalone-only):
        // - "Instance Valid for <n> Month(s)"
        // - "Instance Valid for <n>" (some templates place the word "Months" outside the token)
        // - "Valid for <n>" / "Valid for <n> Months Month" (duplicate Month)
        // NOTE: Do NOT remove orphan "Month(s)" / "s" text runs globally, because Word may split
        // the *legit* server_descriptions line into multiple runs (e.g., "Months" in its own run).
        // We only remove whole paragraphs when the paragraph's visible text is JUST the unwanted line.
        // ========================================================================
        try {
          const zipAfter = doc.getZip();
          const xmlPath = 'word/document.xml';
          const originalXml = this.getZipFileText(zipAfter, xmlPath);
          if (originalXml) {
            const stripTagsLower = (xml: string) =>
              xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

            const paraRegex = /<w:p[\s\S]*?<\/w:p>/gi;
            let updatedXml = originalXml.replace(paraRegex, (para) => {
              const textRaw = stripTagsLower(para);
              // Normalize punctuation that often surrounds these lines in templates
              const text = textRaw
                .replace(/[()]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                // common bullet/leader characters at start of a line
                .replace(/^[\u2022•\-–—\s]+/, '')
                .trim();

              // Standalone-only removals (must match the entire paragraph text)
              //
              // IMPORTANT:
              // Many templates intentionally use "Valid for {{Duration_of_months}} Months" in the
              // **Managed Migration Service** row. We must NOT remove that line.
              //
              // So we only remove the instance-specific variants here.
              if (/^instance valid for \d+(?: months?)?$/.test(text)) return '';
              if (/^instance valid for \d+ months? month$/.test(text)) return '';

              return para;
            });

            if (updatedXml !== originalXml) {
              this.setZipFile(zipAfter, xmlPath, updatedXml);
              console.log('🧹 Removed extra template validity artifacts (standalone only)');
            }
          }
        } catch (instanceCleanupErr) {
          console.warn('⚠️ Could not post-process DOCX to remove standalone validity artifacts:', instanceCleanupErr);
        }

        // Always remove fully empty table rows (common cause of "blank rows" in pricing tables)
        // We only remove rows that have no visible text AND no drawings/objects to avoid breaking layout tables.
        try {
          const zipAfter = doc.getZip();
          const xmlPath = 'word/document.xml';
          const originalXml = this.getZipFileText(zipAfter, xmlPath);
          if (originalXml) {
            const stripTags = (xml: string) => xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/gi;
            const cleanedXml = originalXml.replace(rowRegex, (row) => {
              const rowText = stripTags(row);
              const hasNonTextContent =
                /<w:drawing\b|<w:pict\b|<v:shape\b|<w:object\b|<w:instrText\b/i.test(row);
              if (rowText.length === 0 && !hasNonTextContent) {
                return '';
              }
              return row;
            });
            if (cleanedXml !== originalXml) {
              this.setZipFile(zipAfter, xmlPath, cleanedXml);
              console.log('🧹 Removed fully empty table rows from document.xml');
            }
          }
        } catch (emptyRowCleanupErr) {
          console.warn('⚠️ Could not post-process DOCX to remove empty table rows:', emptyRowCleanupErr);
        }
        
        // CRITICAL: Log the final processed document to verify tokens were replaced
        const finalDocumentXml = this.getZipFileText(doc.getZip(), 'word/document.xml');
        const finalCleanText = this.extractTextFromDocxXml(finalDocumentXml);
        console.log('🔍 FINAL DOCUMENT TEXT (first 1000 chars):', finalCleanText.substring(0, 1000));
        
        // Check if "undefined" is still present
        if (finalCleanText.includes('undefined')) {
          console.error('❌ CRITICAL: "undefined" still found in final document!');
          console.log('🔍 Text around "undefined":', finalCleanText.substring(
            Math.max(0, finalCleanText.indexOf('undefined') - 100),
            finalCleanText.indexOf('undefined') + 100
          ));
          
          // CRITICAL: Remove "undefined" strings from the document XML
          console.log('🔧 Attempting to remove "undefined" strings from document...');
          const zipAfter = doc.getZip();
          const xmlPath = 'word/document.xml';
          let documentXml = this.getZipFileText(zipAfter, xmlPath);
          
          // Replace "undefined" with empty string or appropriate fallback
          // This handles cases where tokens weren't replaced properly
          const originalXml = documentXml;
          documentXml = documentXml.replace(/undefined/gi, '');
          
          // Also remove any remaining {{}} tokens that weren't replaced
          documentXml = documentXml.replace(/\{\{[^}]+\}\}/g, '');
          
          if (documentXml !== originalXml) {
            this.setZipFile(zipAfter, xmlPath, documentXml);
            console.log('✅ Removed "undefined" strings and unreplaced tokens from document');
          }
          
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
      
      // CRITICAL: Final cleanup - remove any "undefined" strings from the document before generating
      const finalZip = doc.getZip();
      const finalXmlPath = 'word/document.xml';
      let finalDocumentXml = this.getZipFileText(finalZip, finalXmlPath);
      const originalFinalXml = finalDocumentXml;
      
      // Remove "undefined" strings (case-insensitive)
      finalDocumentXml = finalDocumentXml.replace(/undefined/gi, '');
      
      // Remove any remaining unreplaced tokens
      finalDocumentXml = finalDocumentXml.replace(/\{\{[^}]+\}\}/g, '');

      // CRITICAL: Overage per-GB value
      //
      // Some templates include the per-GB overage rate either:
      // - as a hardcoded value (e.g. "$1.00 per GB" or "$0.00 per GB"), OR
      // - as a token {{per_data_cost}} followed by " per GB".
      //
      // Email migrations commonly have dataSizeGB=0 and dataCost=0, which can lead to a
      // rendered "$0.00" if the token logic upstream is missing/misconfigured.
      //
      // To make the generated agreement consistent, we patch the *rendered DOCX XML*
      // near the "Overage Charges" line to use a sane per-GB rate.
      //
      // This makes the generated agreement consistent even if the DOCX template wasn't updated.
      try {
        // Only treat these templates as "email templates" for special handling.
        const emailTemplateNames = new Set([
          'gmail-to-gmail.docx',
          'gmail-to-outlook.docx',
          'outlook-to-gmail.docx',
          'outlook-to-outlook.docx',
        ]);
        const templateNameLower = (templateFile?.name || '').toLowerCase();
        // IMPORTANT: Email flow in QuoteGenerator does NOT always pass a "{{migration type}}" token,
        // so we must detect based on the actual template file being rendered.
        const isEmailContext = emailTemplateNames.has(templateNameLower);

        // For Email migrations: we will remove the per-GB segment entirely later.
        // Do not "patch" per-GB here, as it can re-introduce per-GB text.
        if (isEmailContext) {
          // no-op
        } else {
        const rawPerDataCost = String((processedData as any)?.['{{per_data_cost}}'] || '').trim();
        const tierNameForFallback = String(
          (processedData as any)?.['{{tier_name}}'] ??
          (processedData as any)?.['{{plan_name}}'] ??
          (processedData as any)?.['{{plan}}'] ??
          ''
        ).toLowerCase();

        // If upstream produced "$0.00" (or empty), fall back based on tier name.
        const fallbackPerDataCost =
          tierNameForFallback.includes('basic') ? '$1.00' :
          tierNameForFallback.includes('advanced') ? '$1.80' :
          '$1.50'; // default to Standard

        const effectivePerDataCost =
          rawPerDataCost && rawPerDataCost !== '$0.00' ? rawPerDataCost : fallbackPerDataCost;

        if (effectivePerDataCost) {
          const beforeOveragePatch = finalDocumentXml;
          // 1) Patch common hardcoded variants (case-insensitive).
          finalDocumentXml = finalDocumentXml.replace(
            /\$?\s*(?:0|1)(?:\.00)?\s*per\s*GB\.?/gi,
            `${effectivePerDataCost} per GB`
          );

          // 2) Patch cases where the token rendered to "$0.00" and " per GB" is in a separate run.
          // We look for the Overage line and replace the first "$0.00" nearby.
          const overageIdx = finalDocumentXml.toLowerCase().indexOf('overage');
          if (overageIdx !== -1 && effectivePerDataCost !== '$0.00') {
            const start = Math.max(0, overageIdx - 500);
            const end = Math.min(finalDocumentXml.length, overageIdx + 4000);
            const window = finalDocumentXml.slice(start, end);
            const patchedWindow = window.replace(/\$0(?:\.00)?/i, effectivePerDataCost);
            if (patchedWindow !== window) {
              finalDocumentXml = finalDocumentXml.slice(0, start) + patchedWindow + finalDocumentXml.slice(end);
            }
          }

          if (finalDocumentXml !== beforeOveragePatch) {
            console.log('✅ Overage per-GB patched in DOCX with:', effectivePerDataCost);
          } else {
            console.log('ℹ️ No overage per-GB patch needed (template already consistent).');
          }
        }
        }
      } catch (err) {
        console.warn('⚠️ Unable to patch hardcoded overage per-GB text:', err);
      }

      // CRITICAL: Remove stray duplicated short-currency fragments that sometimes appear
      // right before a properly formatted currency value.
      //
      // Example observed in generated PDF/DOCX:
      //   "$1.5$1.50 per GB"
      // We keep the correctly formatted "$1.50" and drop the stray "$1.5".
      //
      // Generic form:
      //   "$<d>.<n>" immediately followed by "$<d>.<n>0"
      // Works for Standard ($1.50) and Advanced ($1.80) as well.
      try {
        const before = finalDocumentXml;
        finalDocumentXml = finalDocumentXml.replace(/\$(\d+)\.(\d)\s*(?=\$\1\.\2(0))/g, '');
        if (finalDocumentXml !== before) {
          console.log('🧹 Removed stray short-currency duplicates (e.g. "$1.5$1.50")');
        }
      } catch (dupCleanupErr) {
        console.warn('⚠️ Unable to remove stray short-currency duplicates:', dupCleanupErr);
      }

      // EMAIL TEMPLATES: Remove per-GB overage segment AND "| {{data_size}} GBs" from description
      //
      // Email migrations do not have a GB/data-size concept in configuration, so the agreement
      // should not show "per GB" in the "Overage Charges" bullet or "| X GBs" in description.
      //
      // We only do this for email templates (gmail/outlook).
      try {
        const emailTemplateNames = new Set([
          'gmail-to-gmail.docx',
          'gmail-to-outlook.docx',
          'outlook-to-gmail.docx',
          'outlook-to-outlook.docx',
        ]);
        const templateNameLower = (templateFile?.name || '').toLowerCase();
        // Restrict cleanup to only the 4 email templates (detected by template filename).
        const isEmailContext = emailTemplateNames.has(templateNameLower);

        if (isEmailContext) {
          console.log('🧾 EMAIL TEMPLATE DETECTED:', templateFile?.name, '→ removing GB references');
          const before = finalDocumentXml;

          // AGGRESSIVE CLEANUP FOR EMAIL TEMPLATES:
          // Remove all GB-related patterns from the entire document (not just Overage section).
          // This handles cases where Word splits the text across multiple runs/cells.

          // 1) Remove "| {{data_size}} GBs" token (before docxtemplater renders it)
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*\{\{[^}]*data_size[^}]*\}\}\s*GBs/gi, '');

          // 2) Remove "| {{data_description}}" token (before docxtemplater renders it)
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*\{\{[^}]*data_description[^}]*\}\}/gi, '');
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*\{\{[^}]*dataDescription[^}]*\}\}/gi, '');

          // 3) Remove literal "| X GBs" (after docxtemplater rendered the token)
          //    Handles: "| 0 GBs", "| 11 GBs", etc. - More aggressive pattern
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*\d+\s*GBs?/gi, '');
          // Also handle cases where there might be spaces or formatting: "| 0 GBs", " | 0 GBs ", etc.
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*0\s*GBs?/gi, '');
          finalDocumentXml = finalDocumentXml.replace(/\|\s*0\s*GBs?/gi, '');

          // 4) Remove "per GB" from anywhere in the document
          //    Handles: "| $1.00 per GB", "per GB.", "{{per_data_cost}} per GB", etc.
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*\$?\s*\d+(?:\.\d{1,2})?\s*per\s*GB\.?/gi, '');
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*\{\{[^}]*per_data_cost[^}]*\}\}\s*per\s*GB\.?/gi, '');

          // 5) Remove empty pipe separators that might be left after removing GBs
          //    Handles: "Up to X Users | " -> "Up to X Users"
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*$/gm, '');
          finalDocumentXml = finalDocumentXml.replace(/\s*\|\s*<w:br/gi, '<w:br');

          // 6) Extra safety: remove any standalone "GBs" or "per GB" text runs that might be orphaned
          //    after the above replacements (only if preceded by pipe or within pricing context)
          finalDocumentXml = finalDocumentXml.replace(/<w:t[^>]*>\s*\|\s*<\/w:t>\s*<w:t[^>]*>\s*\d+\s*GBs?\s*<\/w:t>/gi, '');
          finalDocumentXml = finalDocumentXml.replace(/<w:t[^>]*>\s*per\s*GB\.?\s*<\/w:t>/gi, '<w:t></w:t>');
          
          // 7) Remove pipe separator when followed by empty data_description (handles Word's XML structure)
          finalDocumentXml = finalDocumentXml.replace(/<w:t[^>]*>([^<]*Users[^<]*)<\/w:t>\s*<w:t[^>]*>\s*\|\s*<\/w:t>\s*<w:t[^>]*>\s*0\s*GBs?\s*<\/w:t>/gi, '<w:t>$1</w:t>');
          finalDocumentXml = finalDocumentXml.replace(/<w:t[^>]*>([^<]*Users[^<]*)<\/w:t>\s*<w:t[^>]*>\s*\|\s*0\s*GBs?\s*<\/w:t>/gi, '<w:t>$1</w:t>');
          
          // 8) Handle combined format "Up to X Users | 0 GBs" in a single text run
          finalDocumentXml = finalDocumentXml.replace(/(Up to \d+ Users)\s*\|\s*0\s*GBs?/gi, '$1');
          finalDocumentXml = finalDocumentXml.replace(/(Up to \d+ Users)\s*\|\s*\{\{[^}]*data_description[^}]*\}\}/gi, '$1');
          finalDocumentXml = finalDocumentXml.replace(/(Up to \d+ Users)\s*\|\s*\{\{[^}]*dataDescription[^}]*\}\}/gi, '$1');
          
          // 9) Remove trailing pipe when data_description is empty (handles "Up to X Users | " pattern)
          finalDocumentXml = finalDocumentXml.replace(/(Up to \d+ Users)\s*\|\s*$/gm, '$1');
          finalDocumentXml = finalDocumentXml.replace(/(Up to \d+ Users)\s*\|\s*<w:br/gi, '$1<w:br');
          finalDocumentXml = finalDocumentXml.replace(/(Up to \d+ Users)\s*\|\s*<\/w:t>/gi, '$1</w:t>');

          if (finalDocumentXml !== before) {
            console.log('✅ Email template cleanup: removed all GB references from document');
          } else {
            console.log('ℹ️ Email template cleanup: no GB references found to remove');
          }
        }
      } catch (emailOverageErr) {
        console.warn('⚠️ Unable to remove per-GB overage for email templates:', emailOverageErr);
      }

      // CRITICAL: Global mojibake / NBSP cleanup for ALL templates
      //
      // We have observed PDF previews showing characters like:
      // - "Â" (U+00C2) and "aÂ" in phrases like "in aÂ High-End"
      // - "â€™", "â€œ", "â€" (UTF-8 smart quotes interpreted as Windows-1252)
      //
      // Root cause is usually non‑breaking spaces (U+00A0) or smart quotes embedded
      // in the DOCX template XML. Some DOCX→PDF conversions render these as visible artifacts.
      //
      // We normalize them at the rendered XML stage so it applies to every template.
      try {
        const before = finalDocumentXml;
        const replacements: Array<[string, string]> = [
          // NBSP → normal space
          [String.fromCharCode(160), ' '], // U+00A0
          // Stray "Â" prefix that often appears before spaces/punctuation
          ['Â', ''], // U+00C2

          // Common mojibake for smart quotes/apostrophes
          ['â€™', "'"],
          ['â€˜', "'"],
          ['â€œ', '"'],
          ['â€', '"'],
          // zero-width space mojibake
          ['â€‹', ''],
        ];

        for (const [from, to] of replacements) {
          if (finalDocumentXml.includes(from)) {
            finalDocumentXml = finalDocumentXml.split(from).join(to);
          }
        }

        if (finalDocumentXml !== before) {
          console.log('🧹 Normalized mojibake/NBSP artifacts in rendered DOCX XML');
        }
      } catch (mojibakeCleanupErr) {
        console.warn('⚠️ Unable to normalize mojibake/NBSP artifacts:', mojibakeCleanupErr);
      }
      
      if (finalDocumentXml !== originalFinalXml) {
        this.setZipFile(finalZip, finalXmlPath, finalDocumentXml);
        console.log('✅ Final cleanup: Removed "undefined" strings and unreplaced tokens');
      }
      
      // Generate output from Docxtemplater
      let buffer = finalZip.generate({
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
        let finalDocumentXml = this.getZipFileText(finalZip, 'word/document.xml');
        if (finalDocumentXml) {
          const finalCleanText = this.extractTextFromDocxXml(finalDocumentXml);
          console.log('🔍 Final document text preview:', finalCleanText.substring(0, 500) + '...');
          
          // CRITICAL: Check for and remove "undefined" strings
          if (finalCleanText.toLowerCase().includes('undefined')) {
            console.warn('⚠️ Found "undefined" in final document, performing cleanup...');
            let cleanedXml = finalDocumentXml;
            
            // Remove "undefined" strings (case-insensitive)
            cleanedXml = cleanedXml.replace(/undefined/gi, '');
            
            // Remove any remaining unreplaced tokens
            cleanedXml = cleanedXml.replace(/\{\{[^}]+\}\}/g, '');
            
            if (cleanedXml !== finalDocumentXml) {
              this.setZipFile(finalZip, 'word/document.xml', cleanedXml);
              // Regenerate buffer with cleaned XML
              buffer = finalZip.generate({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              });
              console.log('✅ Cleaned "undefined" strings from final document');
            }
          }
          
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

            // 3. IMPORTANT: Do NOT remove individual <w:tc> cells.
            // Deleting table cells can corrupt the table grid and causes Word to show:
            // "Word found unreadable content... Do you want to recover..."
            // We only remove whole discount rows / standalone discount paragraphs above.

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
              this.setZipFile(finalZip, 'word/document.xml', modifiedXml);
              // Also clean headers and footers if they contain specific discount content
              Object.keys(finalZip.files).forEach((fileName) => {
                if (/^word\/(header\d+\.xml|footer\d+\.xml)$/i.test(fileName) || /^word\\(header\d+\.xml|footer\d+\.xml)$/i.test(fileName)) {
                  try {
                    const xml = this.getZipFileText(finalZip, fileName);
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
                      this.setZipFile(finalZip, fileName, cleaned);
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

    // CRITICAL: Pass through exhibits array for dynamic table loops ({{#exhibits}} ... {{/exhibits}})
    // QuoteGenerator sets this as a non-bracket key: templateData.exhibits = [...]
    // If we don't preserve it here, docxtemplater will receive no "exhibits" and render 0 rows.
    const exhibits = (data as any)?.exhibits;
    if (Array.isArray(exhibits)) {
      processedData.exhibits = exhibits;
      console.log('✅ DOCX PROCESSOR: exhibits array copied to processedData', {
        length: exhibits.length,
        sample: exhibits[0]
      });
    } else {
      processedData.exhibits = [];
      console.log('ℹ️ DOCX PROCESSOR: No exhibits array found; defaulting to []');
    }

    // CRITICAL: Pass through servers array for dynamic table loops ({{#servers}} ... {{/servers}})
    // Similar to exhibits, this allows multi-combination agreements to show one row per server/combination
    const servers = (data as any)?.servers;
    if (Array.isArray(servers)) {
      processedData.servers = servers;
      console.log('✅ DOCX PROCESSOR: servers array copied to processedData', {
        length: servers.length,
        sample: servers[0]
      });
    } else {
      processedData.servers = [];
      console.log('ℹ️ DOCX PROCESSOR: No servers array found; defaulting to []');
    }
    
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
    
    // Extract payment terms
    const paymentTerms = (data as any)['{{payment_terms}}'] ||
      (data as any)['{{Payment_terms}}'] ||
      (data as any)['{{Payment Terms}}'] ||
      (data as any)['{{Payment_Terms}}'] ||
      (data as any)['{{paymentTerms}}'] ||
      (data as any).paymentTerms ||
      '100% Upfront';
    
    // Extract start and end dates from template data
    const startDate = (data as any)['{{Start_date}}'] || (data as any).configuration?.startDate || '';
    let endDate = (data as any)['{{End_date}}'] || (data as any).configuration?.endDate || '';
    
    // CRITICAL: Fallback calculation for end date if not provided or is "N/A" (for hidden field scenario)
    // Check if endDate is empty, "N/A", or invalid, and calculate from startDate + duration
    const needsEndDateCalculation = !endDate || 
                                    endDate === 'N/A' || 
                                    endDate === 'undefined' || 
                                    endDate === 'null' || 
                                    endDate.trim() === '';
    
    if (needsEndDateCalculation) {
      // Try to get duration from multiple sources
      const duration = (data as any).configuration?.duration || 
                      (data as any)['{{Duration_of_months}}'] || 
                      (data as any)['{{Duration of months}}'] || 
                      (data as any)['{{duration_months}}'] || 
                      0;
      
      console.log('🔧 DOCX PROCESSOR: End date is missing/invalid, attempting calculation...');
      console.log('  Start date:', startDate);
      console.log('  Duration:', duration);
      console.log('  Configuration duration:', (data as any).configuration?.duration);
      
      if (startDate && duration && duration > 0) {
        try {
          // Handle both formatted dates (MM/DD/YYYY) and ISO dates (YYYY-MM-DD)
          let startDateObj: Date;
          if (startDate.includes('/')) {
            // MM/DD/YYYY format
            const [month, day, year] = startDate.split('/');
            startDateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else if (startDate.includes('-')) {
            // YYYY-MM-DD format
            startDateObj = new Date(startDate + 'T00:00:00');
          } else {
            startDateObj = new Date(startDate);
          }
          
          if (!isNaN(startDateObj.getTime())) {
            const endDateObj = new Date(startDateObj);
            endDateObj.setMonth(endDateObj.getMonth() + parseInt(duration.toString()));
            endDate = endDateObj.toISOString().split('T')[0];
            console.log(`✅ DOCX PROCESSOR: Calculated end date: ${endDate} (Start: ${startDate}, Duration: ${duration} months)`);
          } else {
            console.warn('⚠️ DOCX PROCESSOR: Invalid start date format, cannot calculate end date');
          }
        } catch (error) {
          console.error('❌ DOCX PROCESSOR: Error calculating end date:', error);
        }
      } else {
        console.warn('⚠️ DOCX PROCESSOR: Cannot calculate end date - missing startDate or duration');
        console.warn('  startDate:', startDate);
        console.warn('  duration:', duration);
      }
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
    console.log('  paymentTerms:', paymentTerms);
    
    console.log('🔍 PAYMENT TERMS EXTRACTION DEBUG:');
    console.log('  data[{{payment_terms}}]:', (data as any)['{{payment_terms}}']);
    console.log('  data[{{Payment_terms}}]:', (data as any)['{{Payment_terms}}']);
    console.log('  data[{{Payment Terms}}]:', (data as any)['{{Payment Terms}}']);
    console.log('  data[{{Payment_Terms}}]:', (data as any)['{{Payment_Terms}}']);
    console.log('  data[{{paymentTerms}}]:', (data as any)['{{paymentTerms}}']);
    console.log('  data.paymentTerms:', (data as any).paymentTerms);
    console.log('  Final paymentTerms value:', paymentTerms);
    
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

      // Shared Server/Instance (Multi combination) tokens
      // IMPORTANT: These are custom tokens set by QuoteGenerator.tsx and must be passed through as-is.
      '{{server_descriptions}}': (data as any)['{{server_descriptions}}'] || (data as any)['{{serverDescriptions}}'] || '',
      '{{serverDescriptions}}': (data as any)['{{serverDescriptions}}'] || (data as any)['{{server_descriptions}}'] || '',
      '{{server descriptions}}': (data as any)['{{server descriptions}}'] || (data as any)['{{server_descriptions}}'] || '',
      '{{server_instance_cost_breakdown}}': (data as any)['{{server_instance_cost_breakdown}}'] || '',
      
      // Per-user cost variations - fixed to match pricing display
      // NOTE: Use {{user_cost}} (not {{users_cost}}) because {{users_cost}} now includes data cost
      '{{per_user_cost}}': (data as any)['{{per_user_cost}}'] || ((data as any)['{{user_cost}}'] ? 
        (parseFloat(((data as any)['{{user_cost}}'] as string).replace(/[$,]/g, '')) / parseInt(userCount)).toFixed(2) : '0.00'),
      '{{per_user_monthly_cost}}': (data as any)['{{per_user_monthly_cost}}'] || ((data as any)['{{user_cost}}'] ? 
        (parseFloat(((data as any)['{{user_cost}}'] as string).replace(/[$,]/g, '')) / (parseInt(userCount) * parseInt(duration))).toFixed(2) : '0.00'),
      '{{user_rate}}': (data as any)['{{user_rate}}'] || ((data as any)['{{user_cost}}'] ? 
        (parseFloat(((data as any)['{{user_cost}}'] as string).replace(/[$,]/g, '')) / parseInt(userCount)).toFixed(2) : '0.00'),
      '{{monthly_user_rate}}': (data as any)['{{monthly_user_rate}}'] || ((data as any)['{{user_cost}}'] ? 
        (parseFloat(((data as any)['{{user_cost}}'] as string).replace(/[$,]/g, '')) / (parseInt(userCount) * parseInt(duration))).toFixed(2) : '0.00'),
      
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

      // Instance validity text - now handled within server_descriptions
      // Set to empty string to prevent duplicate display
      '{{instance_validity_text}}': '',
      '{{instance validity text}}': '',
      '{{instanceValidityText}}': '',
      
      // Duration validity text - for Managed Migration Service row
      '{{duration_validity_text}}': (data as any)['{{duration_validity_text}}'] || '',
      '{{duration validity text}}': (data as any)['{{duration validity text}}'] || '',
      '{{durationValidityText}}': (data as any)['{{durationValidityText}}'] || '',
      
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
      
      // Payment terms variations
      '{{payment_terms}}': paymentTerms,
      '{{Payment_terms}}': paymentTerms,
      '{{Payment Terms}}': paymentTerms,
      '{{Payment_Terms}}': paymentTerms,
      '{{paymentTerms}}': paymentTerms,
      
      // Project date variations - formatted as mm/dd/yyyy
      '{{Start_date}}': this.formatDateMMDDYYYY(startDate),
      '{{start_date}}': this.formatDateMMDDYYYY(startDate),
      '{{startdate}}': this.formatDateMMDDYYYY(startDate),
      '{{project_start_date}}': this.formatDateMMDDYYYY(startDate),
      '{{project_start}}': this.formatDateMMDDYYYY(startDate),
      '{{End_date}}': endDate ? this.formatDateMMDDYYYY(endDate) : 'N/A',
      '{{end_date}}': endDate ? this.formatDateMMDDYYYY(endDate) : 'N/A',
      '{{enddate}}': endDate ? this.formatDateMMDDYYYY(endDate) : 'N/A',
      '{{project_end_date}}': endDate ? this.formatDateMMDDYYYY(endDate) : 'N/A',
      '{{project_end}}': endDate ? this.formatDateMMDDYYYY(endDate) : 'N/A',
      // Also add space version for compatibility
      '{{End date}}': endDate ? this.formatDateMMDDYYYY(endDate) : 'N/A',
      '{{end date}}': endDate ? this.formatDateMMDDYYYY(endDate) : 'N/A',
      
      // Additional common tokens
      '{{price_data}}': data['{{price_data}}'] || '$0.00',
      '{{data_cost}}': data['{{price_data}}'] || '$0.00',
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
      '{{discount_percent}}': (data as any)['{{discount_percent}}'] || (data as any)['{{discount percent}}'] || '',
      '{{discount percent}}': (data as any)['{{discount percent}}'] || (data as any)['{{discount_percent}}'] || '', // Space version
      '{{discount_amount}}': (data as any)['{{discount_amount}}'] || (data as any)['{{discount amount}}'] || '',
      '{{discount amount}}': (data as any)['{{discount amount}}'] || (data as any)['{{discount_amount}}'] || '', // Space version
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
      '{{instance_type}}': (data as any)['{{instance_type}}'] || (data as any)['{{instance type}}'] || (data as any)['{{instanceType}}'] || data.instanceType || 'Standard',
      '{{instance type}}': (data as any)['{{instance type}}'] || (data as any)['{{instance_type}}'] || (data as any)['{{instanceType}}'] || data.instanceType || 'Standard', // Space version
      '{{instanceType}}': (data as any)['{{instanceType}}'] || (data as any)['{{instance_type}}'] || (data as any)['{{instance type}}'] || data.instanceType || 'Standard',
      '{{instance_type_cost}}': (data as any)['{{instance_type_cost}}'] || (data as any)['{{instance_type cost}}'] || (data as any)['{{instance..cost}}'] || (data as any)['{{instance_cost}}'] || (() => {
        const { getInstanceTypeCost, formatCurrency } = require('./pricing');
        const instanceType = (data as any)['{{instance_type}}'] || (data as any)['{{instance type}}'] || (data as any)['{{instanceType}}'] || data.instanceType || 'Standard';
        return formatCurrency(getInstanceTypeCost(instanceType));
      })(),
      '{{instance_type cost}}': (data as any)['{{instance_type cost}}'] || (data as any)['{{instance_type_cost}}'] || (data as any)['{{instance..cost}}'] || (data as any)['{{instance_cost}}'] || '$0.00', // Space version
      '{{instance..cost}}': (data as any)['{{instance..cost}}'] || (data as any)['{{instance_cost}}'] || (data as any)['{{instance_type_cost}}'] || '$0.00', // Handle double-dot typo
      '{{instance_cost}}': (data as any)['{{instance_cost}}'] || (data as any)['{{instance..cost}}'] || (data as any)['{{instance_type_cost}}'] || '$0.00',
      '{{instance cost}}': (data as any)['{{instance cost}}'] || (data as any)['{{instance_cost}}'] || (data as any)['{{instance..cost}}'] || '$0.00', // Space version
      '{{numberOfInstances}}': (data as any)['{{numberOfInstances}}'] || (data as any)['{{instance_users}}'] || (data as any)['{{instances}}'] || '1',
      '{{number_of_instances}}': (data as any)['{{number_of_instances}}'] || (data as any)['{{number of instances}}'] || (data as any)['{{numberOfInstances}}'] || (data as any)['{{instance_users}}'] || '1',
      '{{number of instances}}': (data as any)['{{number of instances}}'] || (data as any)['{{number_of_instances}}'] || (data as any)['{{numberOfInstances}}'] || '1', // Space version
      '{{instances}}': (data as any)['{{instances}}'] || (data as any)['{{numberOfInstances}}'] || (data as any)['{{instance_users}}'] || '1',
      
      // Data size tokens
      '{{data_size}}': (data as any)['{{data_size}}'] || (data as any)['{{dataSizeGB}}'] || (data as any)['{{data_size_gb}}'] || '0',
      '{{dataSizeGB}}': (data as any)['{{dataSizeGB}}'] || (data as any)['{{data_size}}'] || (data as any)['{{data_size_gb}}'] || '0',
      '{{data_size_gb}}': (data as any)['{{data_size_gb}}'] || (data as any)['{{data_size}}'] || (data as any)['{{dataSizeGB}}'] || '0',
      
      // Multi combination - Content tokens
      '{{content_migration_name}}': (data as any)['{{content_migration_name}}'] || (data as any)['{{contentMigrationName}}'] || '',
      '{{contentMigrationName}}': (data as any)['{{contentMigrationName}}'] || (data as any)['{{content_migration_name}}'] || '',
      '{{content_users_count}}': (data as any)['{{content_users_count}}'] || (data as any)['{{contentUsersCount}}'] || (data as any)['{{content_number_of_users}}'] || (data as any)['{{content number of users}}'] || '0',
      '{{contentUsersCount}}': (data as any)['{{contentUsersCount}}'] || (data as any)['{{content_users_count}}'] || (data as any)['{{content_number_of_users}}'] || '0',
      '{{content_number_of_users}}': (data as any)['{{content_number_of_users}}'] || (data as any)['{{content number of users}}'] || (data as any)['{{content_users_count}}'] || '0',
      '{{content number of users}}': (data as any)['{{content number of users}}'] || (data as any)['{{content_number_of_users}}'] || (data as any)['{{content_users_count}}'] || '0', // Space version
      '{{content_number_of_instances}}': (data as any)['{{content_number_of_instances}}'] || (data as any)['{{content number of instances}}'] || '0',
      '{{content number of instances}}': (data as any)['{{content number of instances}}'] || (data as any)['{{content_number_of_instances}}'] || '0', // Space version
      '{{content_instance_type}}': (data as any)['{{content_instance_type}}'] || (data as any)['{{content instance type}}'] || (data as any)['{{contentInstanceType}}'] || 'Standard',
      '{{content instance type}}': (data as any)['{{content instance type}}'] || (data as any)['{{content_instance_type}}'] || (data as any)['{{contentInstanceType}}'] || 'Standard', // Space version
      '{{contentInstanceType}}': (data as any)['{{contentInstanceType}}'] || (data as any)['{{content_instance_type}}'] || (data as any)['{{content instance type}}'] || 'Standard',
      '{{content_data_size}}': (data as any)['{{content_data_size}}'] || (data as any)['{{contentDataSize}}'] || (data as any)['{{content_data_size_gb}}'] || '0',
      '{{contentDataSize}}': (data as any)['{{contentDataSize}}'] || (data as any)['{{content_data_size}}'] || (data as any)['{{content_data_size_gb}}'] || '0',
      '{{content_data_size_gb}}': (data as any)['{{content_data_size_gb}}'] || (data as any)['{{content_data_size}}'] || '0',
      '{{content_migration_cost}}': (data as any)['{{content_migration_cost}}'] || (data as any)['{{contentMigrationCost}}'] || '$0.00',
      '{{contentMigrationCost}}': (data as any)['{{contentMigrationCost}}'] || (data as any)['{{content_migration_cost}}'] || '$0.00',
      '{{content_user_cost}}': (data as any)['{{content_user_cost}}'] || (data as any)['{{contentUserCost}}'] || '$0.00',
      '{{contentUserCost}}': (data as any)['{{contentUserCost}}'] || (data as any)['{{content_user_cost}}'] || '$0.00',
      '{{content_data_cost}}': (data as any)['{{content_data_cost}}'] || (data as any)['{{contentDataCost}}'] || '$0.00',
      '{{contentDataCost}}': (data as any)['{{contentDataCost}}'] || (data as any)['{{content_data_cost}}'] || '$0.00',
      '{{content_instance_cost}}': (data as any)['{{content_instance_cost}}'] || (data as any)['{{contentInstanceCost}}'] || '$0.00',
      '{{contentInstanceCost}}': (data as any)['{{contentInstanceCost}}'] || (data as any)['{{content_instance_cost}}'] || '$0.00',
      '{{content_total_cost}}': (data as any)['{{content_total_cost}}'] || (data as any)['{{contentTotalCost}}'] || '$0.00',
      '{{contentTotalCost}}': (data as any)['{{contentTotalCost}}'] || (data as any)['{{content_total_cost}}'] || '$0.00',
      
      // Multi combination - Messaging tokens
      '{{messaging_migration_name}}': (data as any)['{{messaging_migration_name}}'] || (data as any)['{{messagingMigrationName}}'] || '',
      '{{messagingMigrationName}}': (data as any)['{{messagingMigrationName}}'] || (data as any)['{{messaging_migration_name}}'] || '',
      '{{messaging_users_count}}': (data as any)['{{messaging_users_count}}'] || (data as any)['{{messagingUsersCount}}'] || (data as any)['{{messaging_number_of_users}}'] || (data as any)['{{messaging number of users}}'] || '0',
      '{{messagingUsersCount}}': (data as any)['{{messagingUsersCount}}'] || (data as any)['{{messaging_users_count}}'] || (data as any)['{{messaging_number_of_users}}'] || '0',
      '{{messaging_number_of_users}}': (data as any)['{{messaging_number_of_users}}'] || (data as any)['{{messaging number of users}}'] || (data as any)['{{messaging_users_count}}'] || '0',
      '{{messaging number of users}}': (data as any)['{{messaging number of users}}'] || (data as any)['{{messaging_number_of_users}}'] || (data as any)['{{messaging_users_count}}'] || '0', // Space version
      '{{messaging_number_of_instances}}': (data as any)['{{messaging_number_of_instances}}'] || (data as any)['{{messaging number of instances}}'] || '0',
      '{{messaging number of instances}}': (data as any)['{{messaging number of instances}}'] || (data as any)['{{messaging_number_of_instances}}'] || '0', // Space version
      '{{messaging_instance_type}}': (data as any)['{{messaging_instance_type}}'] || (data as any)['{{messaging instance type}}'] || (data as any)['{{messagingInstanceType}}'] || 'Standard',
      '{{messaging instance type}}': (data as any)['{{messaging instance type}}'] || (data as any)['{{messaging_instance_type}}'] || (data as any)['{{messagingInstanceType}}'] || 'Standard', // Space version
      '{{messagingInstanceType}}': (data as any)['{{messagingInstanceType}}'] || (data as any)['{{messaging_instance_type}}'] || (data as any)['{{messaging instance type}}'] || 'Standard',
      '{{messaging_messages}}': (data as any)['{{messaging_messages}}'] || (data as any)['{{messagingMessages}}'] || '0',
      '{{messagingMessages}}': (data as any)['{{messagingMessages}}'] || (data as any)['{{messaging_messages}}'] || '0',
      '{{messaging_migration_cost}}': (data as any)['{{messaging_migration_cost}}'] || (data as any)['{{messagingMigrationCost}}'] || '$0.00',
      '{{messagingMigrationCost}}': (data as any)['{{messagingMigrationCost}}'] || (data as any)['{{messaging_migration_cost}}'] || '$0.00',
      '{{messaging_user_cost}}': (data as any)['{{messaging_user_cost}}'] || (data as any)['{{messagingUserCost}}'] || '$0.00',
      '{{messagingUserCost}}': (data as any)['{{messagingUserCost}}'] || (data as any)['{{messaging_user_cost}}'] || '$0.00',
      '{{messaging_data_cost}}': (data as any)['{{messaging_data_cost}}'] || (data as any)['{{messagingDataCost}}'] || '$0.00',
      '{{messagingDataCost}}': (data as any)['{{messagingDataCost}}'] || (data as any)['{{messaging_data_cost}}'] || '$0.00',
      '{{messaging_instance_cost}}': (data as any)['{{messaging_instance_cost}}'] || (data as any)['{{messagingInstanceCost}}'] || '$0.00',
      '{{messagingInstanceCost}}': (data as any)['{{messagingInstanceCost}}'] || (data as any)['{{messaging_instance_cost}}'] || '$0.00',
      '{{messaging_total_cost}}': (data as any)['{{messaging_total_cost}}'] || (data as any)['{{messagingTotalCost}}'] || '$0.00',
      '{{messagingTotalCost}}': (data as any)['{{messagingTotalCost}}'] || (data as any)['{{messaging_total_cost}}'] || '$0.00',
      
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
      planName: data.planName || 'Basic',
      paymentTerms: paymentTerms
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
        processedData[key] === undefined || processedData[key] === null || processedData[key] === '' || String(processedData[key]).toLowerCase() === 'undefined'
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
          // Never force-fill server_descriptions; keep it empty if not provided
          if (lower.includes('server_descriptions') || (lower.includes('server') && lower.includes('description'))) {
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
          } else if (key.toLowerCase().includes('migration') && !key.toLowerCase().includes('cost') && !key.toLowerCase().includes('price')) {
            processedData[key] = 'Content';
          } else if (key.toLowerCase().includes('client') || key.toLowerCase().includes('name')) {
            processedData[key] = 'Demo Client';
          } else if (key.toLowerCase().includes('email')) {
            processedData[key] = 'demo@example.com';
          } else if (key.toLowerCase().includes('date')) {
            processedData[key] = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
          } else if (key.toLowerCase().includes('data') && key.toLowerCase().includes('size')) {
            processedData[key] = '0';
          } else if (key.toLowerCase().includes('instance')) {
            processedData[key] = '1';
          } else {
            processedData[key] = 'N/A';
          }
        });
        
        console.log('🔧 DOCX PROCESSOR: Fixed undefined values:', undefinedKeys);
      }
      
      // CRITICAL: Additional pass to ensure no values are the string "undefined"
      Object.keys(processedData).forEach(key => {
        if (String(processedData[key]).toLowerCase() === 'undefined') {
          console.warn(`⚠️ Found string "undefined" for key ${key}, replacing with fallback`);
          const lower = key.toLowerCase();
          if (lower.includes('cost') || lower.includes('price')) {
            processedData[key] = '$0.00';
          } else if (lower.includes('count') || lower.includes('number') || lower.includes('size')) {
            processedData[key] = '0';
          } else if (lower.includes('duration') || lower.includes('month')) {
            processedData[key] = '1';
          } else {
            processedData[key] = '';
          }
        }
      });
    
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
      const documentXml = this.getZipFileText(zip, 'word/document.xml');
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
