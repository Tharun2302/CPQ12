import { PDFDocument, PDFForm, PDFField, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFButton } from 'pdf-lib';
import { saveAs } from 'file-saver';

export interface FormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'optionlist' | 'button' | 'unknown';
  value?: string | boolean | string[];
  isReadOnly: boolean;
  isRequired: boolean;
  category: 'company' | 'client' | 'email' | 'user' | 'price' | 'date' | 'unknown';
  confidence: number;
}

export interface FormFillingData {
  company?: string;
  clientName?: string;
  email?: string;
  users?: number;
  totalPrice?: number;
  date?: Date | string;
  customFields?: { [key: string]: string | number | boolean };
}

export interface FormFillingResult {
  success: boolean;
  filledFields: FormFieldInfo[];
  totalFields: number;
  filledCount: number;
  flattenedPDF?: Blob;
  error?: string;
  processingTime: number;
}

// Field name patterns for different categories
export const FIELD_PATTERNS = {
  company: [
    'company', 'organisation', 'organization', 'title', 'corp', 'corporation',
    'business', 'firm', 'enterprise', 'org', 'company_name', 'companyname'
  ],
  client: [
    'client', 'customer', 'contact', 'name', 'client_name', 'customername',
    'contact_name', 'fullname', 'full_name', 'firstname', 'lastname'
  ],
  email: [
    'email', 'e-mail', 'mail', 'email_address', 'emailaddress', 'contact_email',
    'client_email', 'e_mail', 'electronic_mail'
  ],
  user: [
    'users', 'seats', 'licenses', 'user_count', 'usercount', 'seat_count',
    'seatcount', 'license_count', 'licensecount', 'number_of_users', 'numberofusers'
  ],
  price: [
    'total', 'price', 'amount', 'cost', 'total_price', 'totalprice', 'total_cost',
    'totalcost', 'amount_due', 'amountdue', 'price_total', 'pricetotal', 'sum',
    'total_amount', 'totalamount', 'grand_total', 'grandtotal'
  ],
  date: [
    'date', 'created_date', 'createddate', 'issue_date', 'issuedate', 'quote_date',
    'quotedate', 'valid_date', 'validdate', 'expiry_date', 'expirydate', 'due_date',
    'duedate', 'effective_date', 'effectivedate'
  ]
};

/**
 * Load PDF document and get form information
 */
export async function loadPDFWithForm(pdfBytes: ArrayBuffer): Promise<{
  pdfDoc: PDFDocument;
  form: PDFForm | null;
  fields: FormFieldInfo[];
}> {
  try {
    console.log('📄 Loading PDF document...');
    
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    
    console.log('📋 PDF loaded successfully');
    console.log(`📊 Form fields found: ${form.getFields().length}`);
    
    // Get all form fields
    const fields = form.getFields().map(field => {
      const fieldInfo = analyzeFormField(field);
      console.log(`🔍 Field: "${field.getName()}" (${fieldInfo.type}) - Category: ${fieldInfo.category}`);
      return fieldInfo;
    });
    
    return {
      pdfDoc,
      form: fields.length > 0 ? form : null,
      fields
    };
    
  } catch (error) {
    console.error('❌ Error loading PDF with form:', error);
    throw new Error(`Failed to load PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze a form field to determine its type and category
 */
function analyzeFormField(field: PDFField): FormFieldInfo {
  const fieldName = field.getName().toLowerCase();
  
  // Determine field type
  let fieldType: FormFieldInfo['type'] = 'unknown';
  if (field instanceof PDFTextField) {
    fieldType = 'text';
  } else if (field instanceof PDFCheckBox) {
    fieldType = 'checkbox';
  } else if (field instanceof PDFDropdown) {
    fieldType = 'dropdown';
  } else if (field instanceof PDFOptionList) {
    fieldType = 'optionlist';
  } else if (field instanceof PDFButton) {
    fieldType = 'button';
  }
  
  // Determine category based on field name patterns
  const category = determineFieldCategory(fieldName);
  
  // Calculate confidence based on pattern matching
  const confidence = calculateFieldConfidence(fieldName, category);
  
  return {
    name: field.getName(),
    type: fieldType,
    isReadOnly: field.isReadOnly(),
    isRequired: field.isRequired(),
    category,
    confidence
  };
}

/**
 * Determine field category based on name patterns
 */
function determineFieldCategory(fieldName: string): FormFieldInfo['category'] {
  const name = fieldName.toLowerCase();
  
  // Check each category
  for (const [category, patterns] of Object.entries(FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      if (name.includes(pattern.toLowerCase())) {
        // Special handling for client fields (should not contain 'email')
        if (category === 'client' && (name.includes('email') || name.includes('mail'))) {
          continue;
        }
        return category as FormFieldInfo['category'];
      }
    }
  }
  
  return 'unknown';
}

/**
 * Calculate confidence score for field category matching
 */
function calculateFieldConfidence(fieldName: string, category: FormFieldInfo['category']): number {
  if (category === 'unknown') {
    return 0;
  }
  
  const name = fieldName.toLowerCase();
  const patterns = FIELD_PATTERNS[category as keyof typeof FIELD_PATTERNS];
  
  let maxMatch = 0;
  for (const pattern of patterns) {
    if (name.includes(pattern.toLowerCase())) {
      // Calculate match strength based on pattern length and position
      const matchStrength = pattern.length / name.length;
      maxMatch = Math.max(maxMatch, matchStrength);
    }
  }
  
  return Math.min(maxMatch * 2, 1); // Scale to 0-1 range
}

/**
 * Fill PDF form with data
 */
export async function fillPDFForm(
  pdfBytes: ArrayBuffer,
  data: FormFillingData
): Promise<FormFillingResult> {
  const startTime = Date.now();
  
  try {
    console.log('🔄 Starting PDF form filling...');
    console.log('📊 Data to fill:', data);
    
    const { pdfDoc, form, fields } = await loadPDFWithForm(pdfBytes);
    
    if (!form || fields.length === 0) {
      console.log('⚠️ No form fields found in PDF');
      return {
        success: true,
        filledFields: [],
        totalFields: 0,
        filledCount: 0,
        flattenedPDF: new Blob([await pdfDoc.save()], { type: 'application/pdf' }),
        processingTime: Date.now() - startTime
      };
    }
    
    const filledFields: FormFieldInfo[] = [];
    let filledCount = 0;
    
    // Fill fields based on category
    for (const fieldInfo of fields) {
      const field = form.getField(fieldInfo.name);
      let wasFilled = false;
      
      try {
        switch (fieldInfo.category) {
          case 'company':
            if (data.company && field instanceof PDFTextField) {
              field.setText(data.company);
              wasFilled = true;
              console.log(`✅ Filled company field: "${fieldInfo.name}" with "${data.company}"`);
            }
            break;
            
          case 'client':
            if (data.clientName && field instanceof PDFTextField) {
              field.setText(data.clientName);
              wasFilled = true;
              console.log(`✅ Filled client field: "${fieldInfo.name}" with "${data.clientName}"`);
            }
            break;
            
          case 'email':
            if (data.email && field instanceof PDFTextField) {
              field.setText(data.email);
              wasFilled = true;
              console.log(`✅ Filled email field: "${fieldInfo.name}" with "${data.email}"`);
            }
            break;
            
          case 'user':
            if (data.users !== undefined && field instanceof PDFTextField) {
              field.setText(data.users.toString());
              wasFilled = true;
              console.log(`✅ Filled user field: "${fieldInfo.name}" with "${data.users}"`);
            }
            break;
            
          case 'price':
            if (data.totalPrice !== undefined && field instanceof PDFTextField) {
              const priceText = typeof data.totalPrice === 'number' 
                ? `$${data.totalPrice.toLocaleString()}` 
                : data.totalPrice.toString();
              field.setText(priceText);
              wasFilled = true;
              console.log(`✅ Filled price field: "${fieldInfo.name}" with "${priceText}"`);
            }
            break;
            
          case 'date':
            if (data.date && field instanceof PDFTextField) {
              const dateText = data.date instanceof Date 
                ? data.date.toLocaleDateString() 
                : data.date.toString();
              field.setText(dateText);
              wasFilled = true;
              console.log(`✅ Filled date field: "${fieldInfo.name}" with "${dateText}"`);
            }
            break;
        }
        
        // Handle custom fields
        if (data.customFields && data.customFields[fieldInfo.name]) {
          const customValue = data.customFields[fieldInfo.name];
          if (field instanceof PDFTextField) {
            field.setText(customValue.toString());
            wasFilled = true;
            console.log(`✅ Filled custom field: "${fieldInfo.name}" with "${customValue}"`);
          }
        }
        
        if (wasFilled) {
          filledCount++;
          filledFields.push({
            ...fieldInfo,
            value: field instanceof PDFTextField ? field.getText() : undefined
          });
        }
        
      } catch (fieldError) {
        console.warn(`⚠️ Failed to fill field "${fieldInfo.name}":`, fieldError);
      }
    }
    
    // Flatten the form to make it static
    console.log('🔄 Flattening form...');
    form.flatten();
    
    // Save the filled PDF
    const pdfBytes = await pdfDoc.save();
    const flattenedPDF = new Blob([pdfBytes], { type: 'application/pdf' });
    
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Form filling completed in ${processingTime}ms`);
    console.log(`📊 Filled ${filledCount}/${fields.length} fields`);
    
    return {
      success: true,
      filledFields,
      totalFields: fields.length,
      filledCount,
      flattenedPDF,
      processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Error filling PDF form:', error);
    
    return {
      success: false,
      filledFields: [],
      totalFields: 0,
      filledCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime
    };
  }
}

/**
 * Get form field information without filling
 */
export async function getFormFieldInfo(pdfBytes: ArrayBuffer): Promise<{
  success: boolean;
  fields: FormFieldInfo[];
  totalFields: number;
  error?: string;
}> {
  try {
    console.log('🔍 Getting form field information...');
    
    const { fields } = await loadPDFWithForm(pdfBytes);
    
    console.log(`✅ Found ${fields.length} form fields`);
    
    return {
      success: true,
      fields,
      totalFields: fields.length
    };
    
  } catch (error) {
    console.error('❌ Error getting form field info:', error);
    
    return {
      success: false,
      fields: [],
      totalFields: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Download filled PDF
 */
export function downloadFilledPDF(pdfBlob: Blob, filename: string): void {
  try {
    saveAs(pdfBlob, filename);
    console.log(`✅ Filled PDF downloaded: ${filename}`);
  } catch (error) {
    console.error('❌ Error downloading filled PDF:', error);
    throw new Error('Failed to download filled PDF');
  }
}

/**
 * Validate PDF file for form filling
 */
export function validatePDFForFormFilling(file: File): { isValid: boolean; error?: string } {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }
  
  if (file.type !== 'application/pdf') {
    return { isValid: false, error: 'File must be a PDF document' };
  }
  
  if (file.size === 0) {
    return { isValid: false, error: 'File is empty' };
  }
  
  if (file.size > 100 * 1024 * 1024) { // 100MB limit
    return { isValid: false, error: 'File is too large (max 100MB)' };
  }
  
  return { isValid: true };
}

/**
 * Create sample form filling data
 */
export function createSampleFormData(): FormFillingData {
  return {
    company: 'Sample Company Inc.',
    clientName: 'John Smith',
    email: 'john.smith@samplecompany.com',
    users: 100,
    totalPrice: 15000,
    date: new Date(),
    customFields: {
      'project_name': 'Sample Project',
      'contract_number': 'CON-2024-001'
    }
  };
}

/**
 * Format form fields for display in UI
 */
export function formatFormFieldsForDisplay(fields: FormFieldInfo[]): Array<{
  id: string;
  name: string;
  type: string;
  category: string;
  confidence: string;
  isReadOnly: boolean;
  isRequired: boolean;
}> {
  return fields.map((field, index) => ({
    id: `field-${index}`,
    name: field.name,
    type: field.type,
    category: field.category,
    confidence: `${(field.confidence * 100).toFixed(1)}%`,
    isReadOnly: field.isReadOnly,
    isRequired: field.isRequired
  }));
}

/**
 * Get form field statistics
 */
export function getFormFieldStatistics(fields: FormFieldInfo[]): {
  totalFields: number;
  fieldsByType: { [key: string]: number };
  fieldsByCategory: { [key: string]: number };
  readOnlyFields: number;
  requiredFields: number;
  averageConfidence: number;
} {
  const fieldsByType: { [key: string]: number } = {};
  const fieldsByCategory: { [key: string]: number } = {};
  let readOnlyFields = 0;
  let requiredFields = 0;
  let totalConfidence = 0;
  
  fields.forEach(field => {
    // Count by type
    fieldsByType[field.type] = (fieldsByType[field.type] || 0) + 1;
    
    // Count by category
    fieldsByCategory[field.category] = (fieldsByCategory[field.category] || 0) + 1;
    
    // Count read-only and required
    if (field.isReadOnly) readOnlyFields++;
    if (field.isRequired) requiredFields++;
    
    // Sum confidence
    totalConfidence += field.confidence;
  });
  
  return {
    totalFields: fields.length,
    fieldsByType,
    fieldsByCategory,
    readOnlyFields,
    requiredFields,
    averageConfidence: fields.length > 0 ? totalConfidence / fields.length : 0
  };
}
