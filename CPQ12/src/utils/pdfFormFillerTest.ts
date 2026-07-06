import {
  fillPDFForm,
  getFormFieldInfo,
  createSampleFormData,
  validatePDFForFormFilling,
  getFormFieldStatistics,
  FormFillingData,
  FormFillingResult
} from './pdfFormFiller';
import { pdfFormFiller } from './pdfFormFillerIntegration';

/**
 * Test the PDF form filling system with a PDF file
 */
export async function testPDFFormFiller(pdfFile: File): Promise<FormFillingResult> {
  try {
    console.log('🧪 Starting PDF form filler test...');
    console.log('📄 PDF file:', pdfFile.name, 'Size:', pdfFile.size, 'bytes');
    
    // Validate PDF file
    const validation = validatePDFForFormFilling(pdfFile);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid PDF file');
    }
    
    // Get form field information first
    console.log('🔍 Getting form field information...');
    const fieldInfo = await getFormFieldInfo(await pdfFile.arrayBuffer());
    
    if (fieldInfo.success) {
      console.log(`✅ Found ${fieldInfo.totalFields} form fields`);
      logFormFieldDetails(fieldInfo.fields);
    } else {
      console.log('⚠️ No form fields found or error occurred:', fieldInfo.error);
    }
    
    // Create sample form data
    const sampleData = createSampleFormData();
    console.log('📊 Sample form data:', sampleData);
    
    // Fill the form
    console.log('🔄 Filling PDF form...');
    const result = await fillPDFForm(await pdfFile.arrayBuffer(), sampleData);
    
    if (result.success) {
      console.log('✅ Form filling completed successfully!');
      console.log(`📊 Results: ${result.filledCount}/${result.totalFields} fields filled`);
      console.log(`⏱️ Processing time: ${result.processingTime}ms`);
      
      // Log detailed results
      logFormFillingResults(result);
      
      // Get statistics
      const stats = getFormFieldStatistics(fieldInfo.fields);
      console.log('📈 Form field statistics:', stats);
      
    } else {
      console.error('❌ Form filling failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      filledFields: [],
      totalFields: 0,
      filledCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: 0
    };
  }
}

/**
 * Test with custom form data
 */
export async function testCustomFormFilling(
  pdfFile: File,
  customData: FormFillingData
): Promise<FormFillingResult> {
  try {
    console.log('🧪 Testing custom form filling...');
    console.log('📊 Custom data:', customData);
    
    // Validate PDF file
    const validation = validatePDFForFormFilling(pdfFile);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid PDF file');
    }
    
    // Validate form data
    const dataValidation = pdfFormFiller.validateFormData(customData);
    if (!dataValidation.isValid) {
      console.warn('⚠️ Form data validation warnings:', dataValidation.errors);
    }
    
    // Fill the form
    const result = await fillPDFForm(await pdfFile.arrayBuffer(), customData);
    
    if (result.success) {
      console.log('✅ Custom form filling completed!');
      console.log(`📊 Filled ${result.filledCount}/${result.totalFields} fields`);
      logFormFillingResults(result);
    } else {
      console.error('❌ Custom form filling failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Custom test failed:', error);
    return {
      success: false,
      filledFields: [],
      totalFields: 0,
      filledCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: 0
    };
  }
}

/**
 * Test form field detection only
 */
export async function testFormFieldDetection(pdfFile: File): Promise<{
  success: boolean;
  fields: any[];
  totalFields: number;
  error?: string;
}> {
  try {
    console.log('🔍 Testing form field detection...');
    
    // Validate PDF file
    const validation = validatePDFForFormFilling(pdfFile);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid PDF file');
    }
    
    // Get form field information
    const result = await getFormFieldInfo(await pdfFile.arrayBuffer());
    
    if (result.success) {
      console.log(`✅ Form field detection completed!`);
      console.log(`📊 Found ${result.totalFields} form fields`);
      
      // Log detailed field information
      logFormFieldDetails(result.fields);
      
      // Get statistics
      const stats = getFormFieldStatistics(result.fields);
      console.log('📈 Field statistics:', stats);
      
    } else {
      console.error('❌ Form field detection failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Field detection test failed:', error);
    return {
      success: false,
      fields: [],
      totalFields: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Log detailed form field information
 */
function logFormFieldDetails(fields: any[]): void {
  console.log('\n🔍 Detailed Form Field Information:');
  console.log('=' .repeat(60));
  
  if (fields.length === 0) {
    console.log('No form fields found.');
    return;
  }
  
  // Group fields by category
  const fieldsByCategory: { [key: string]: any[] } = {};
  fields.forEach(field => {
    if (!fieldsByCategory[field.category]) {
      fieldsByCategory[field.category] = [];
    }
    fieldsByCategory[field.category].push(field);
  });
  
  // Log fields by category
  Object.keys(fieldsByCategory).forEach(category => {
    const categoryFields = fieldsByCategory[category];
    
    console.log(`\n📂 ${category.toUpperCase()} Fields (${categoryFields.length}):`);
    console.log('-'.repeat(40));
    
    categoryFields.forEach((field, index) => {
      console.log(`${index + 1}. Field: "${field.name}"`);
      console.log(`   Type: ${field.type}`);
      console.log(`   Confidence: ${(field.confidence * 100).toFixed(1)}%`);
      console.log(`   Read Only: ${field.isReadOnly ? 'Yes' : 'No'}`);
      console.log(`   Required: ${field.isRequired ? 'Yes' : 'No'}`);
      console.log('');
    });
  });
  
  console.log('=' .repeat(60));
}

/**
 * Log form filling results
 */
function logFormFillingResults(result: FormFillingResult): void {
  console.log('\n📊 Form Filling Results:');
  console.log('=' .repeat(50));
  
  if (!result.success) {
    console.log('❌ Form filling failed:', result.error);
    return;
  }
  
  console.log(`📄 Total fields: ${result.totalFields}`);
  console.log(`✅ Fields filled: ${result.filledCount}`);
  console.log(`📈 Fill rate: ${result.totalFields > 0 ? ((result.filledCount / result.totalFields) * 100).toFixed(1) : 0}%`);
  console.log(`⏱️ Processing time: ${result.processingTime}ms`);
  
  if (result.filledFields.length > 0) {
    console.log('\n🎯 Filled Fields:');
    console.log('-'.repeat(30));
    
    result.filledFields.forEach((field, index) => {
      console.log(`${index + 1}. ${field.name} (${field.category})`);
      console.log(`   Value: "${field.value}"`);
      console.log(`   Type: ${field.type}`);
      console.log('');
    });
  }
  
  console.log('=' .repeat(50));
}

/**
 * Performance test for form filling
 */
export async function performanceTest(
  pdfFile: File,
  iterations: number = 3
): Promise<{
  averageTime: number;
  minTime: number;
  maxTime: number;
  results: FormFillingResult[];
}> {
  console.log(`🏃‍♂️ Running form filling performance test with ${iterations} iterations...`);
  
  const results: FormFillingResult[] = [];
  const times: number[] = [];
  const sampleData = createSampleFormData();
  
  for (let i = 0; i < iterations; i++) {
    console.log(`🔄 Iteration ${i + 1}/${iterations}...`);
    
    const result = await testCustomFormFilling(pdfFile, sampleData);
    results.push(result);
    
    if (result.success) {
      times.push(result.processingTime);
    }
    
    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  if (times.length === 0) {
    console.log('❌ No successful iterations for performance test');
    return {
      averageTime: 0,
      minTime: 0,
      maxTime: 0,
      results
    };
  }
  
  const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log('📊 Performance Test Results:');
  console.log(`⏱️ Average time: ${averageTime.toFixed(2)}ms`);
  console.log(`⚡ Min time: ${minTime}ms`);
  console.log(`🐌 Max time: ${maxTime}ms`);
  
  return {
    averageTime,
    minTime,
    maxTime,
    results
  };
}

/**
 * Create a sample PDF with form fields for testing
 */
export function createSamplePDFWithFormFields(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      // This would create a sample PDF with form fields
      // For now, we'll return a simple text-based approach
      const sampleContent = `
        Sample PDF Form Template
        
        Company Information:
        Company Name: [Form Field: company_name]
        Organization: [Form Field: organisation]
        
        Client Details:
        Client Name: [Form Field: client_name]
        Contact Name: [Form Field: contact_name]
        
        Contact Information:
        Email Address: [Form Field: email_address]
        E-mail: [Form Field: e_mail]
        
        User Information:
        Number of Users: [Form Field: users_count]
        Seats: [Form Field: seats]
        Licenses: [Form Field: licenses]
        
        Pricing:
        Total Price: [Form Field: total_price]
        Amount: [Form Field: amount]
        Cost: [Form Field: cost]
        
        Dates:
        Quote Date: [Form Field: quote_date]
        Valid Date: [Form Field: valid_date]
        Due Date: [Form Field: due_date]
      `;
      
      // Create a simple text file (in a real implementation, you'd create a proper PDF with form fields)
      const blob = new Blob([sampleContent], { type: 'text/plain' });
      resolve(blob);
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Validate PDF form filler functionality
 */
export async function validatePDFFormFiller(): Promise<boolean> {
  try {
    console.log('🔍 Validating PDF form filler functionality...');
    
    // Test 1: Check if pdf-lib is available
    if (typeof PDFDocument === 'undefined') {
      console.error('❌ pdf-lib is not available');
      return false;
    }
    
    // Test 2: Check if field patterns are defined
    const { FIELD_PATTERNS } = await import('./pdfFormFiller');
    if (!FIELD_PATTERNS || Object.keys(FIELD_PATTERNS).length === 0) {
      console.error('❌ Field patterns are not defined');
      return false;
    }
    
    // Test 3: Check pattern structure
    for (const [category, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (!Array.isArray(patterns) || patterns.length === 0) {
        console.error('❌ Invalid pattern structure for category:', category);
        return false;
      }
    }
    
    // Test 4: Test sample data creation
    const sampleData = createSampleFormData();
    if (!sampleData || typeof sampleData !== 'object') {
      console.error('❌ Sample data creation failed');
      return false;
    }
    
    console.log('✅ PDF form filler validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ PDF form filler validation failed:', error);
    return false;
  }
}
