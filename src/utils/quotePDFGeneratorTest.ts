import {
  generateQuotePDF,
  createSampleQuoteData,
  validateQuoteData,
  generateQuoteId,
  QuoteData,
  QuotePDFOptions,
  QuotePDFResult
} from './quotePDFGenerator';
import { quotePDFGenerator } from './quotePDFGeneratorIntegration';

/**
 * Test the quote PDF generation system
 */
export async function testQuotePDFGenerator(): Promise<QuotePDFResult> {
  try {
    console.log('🧪 Starting quote PDF generation test...');
    
    // Create sample quote data
    const sampleQuoteData = createSampleQuoteData();
    console.log('📊 Sample quote data:', {
      company: sampleQuoteData.company,
      clientName: sampleQuoteData.clientName,
      totalCost: sampleQuoteData.calculation.totalCost
    });
    
    // Test quote ID generation
    const quoteId = generateQuoteId();
    console.log(`🆔 Generated quote ID: ${quoteId}`);
    
    // Validate quote data
    const validation = validateQuoteData(sampleQuoteData);
    if (!validation.isValid) {
      throw new Error(`Invalid quote data: ${validation.errors.join(', ')}`);
    }
    console.log('✅ Quote data validation passed');
    
    // Generate PDF with default options
    console.log('🔄 Generating quote PDF...');
    const result = await generateQuotePDF(sampleQuoteData);
    
    if (result.success) {
      console.log('✅ Quote PDF generated successfully!');
      console.log(`📄 Quote ID: ${result.quoteId}`);
      console.log(`📊 PDF size: ${result.pdfBytes?.length} bytes`);
      console.log(`⏱️ Processing time: ${result.processingTime}ms`);
      
      // Log detailed results
      logQuotePDFResults(result);
      
    } else {
      console.error('❌ Quote PDF generation failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: 0
    };
  }
}

/**
 * Test with custom options
 */
export async function testCustomQuotePDFGeneration(
  customQuoteData?: QuoteData,
  customOptions?: QuotePDFOptions
): Promise<QuotePDFResult> {
  try {
    console.log('🧪 Testing custom quote PDF generation...');
    
    // Use provided data or create sample data
    const quoteData = customQuoteData || createSampleQuoteData();
    console.log('📊 Quote data:', {
      company: quoteData.company,
      clientName: quoteData.clientName,
      totalCost: quoteData.calculation.totalCost
    });
    
    // Custom options
    const options: QuotePDFOptions = {
      companyName: 'Custom Company Inc.',
      companyAddress: '456 Custom Street, Custom City, CC 54321',
      companyPhone: '(555) 987-6543',
      companyEmail: 'custom@company.com',
      includeTerms: true,
      includeSignature: true,
      theme: 'green',
      ...customOptions
    };
    
    console.log('⚙️ Custom options:', options);
    
    // Generate PDF
    const result = await generateQuotePDF(quoteData, options);
    
    if (result.success) {
      console.log('✅ Custom quote PDF generated successfully!');
      console.log(`📄 Quote ID: ${result.quoteId}`);
      console.log(`📊 PDF size: ${result.pdfBytes?.length} bytes`);
      logQuotePDFResults(result);
    } else {
      console.error('❌ Custom quote PDF generation failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Custom test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: 0
    };
  }
}

/**
 * Test with integration helper
 */
export async function testQuotePDFGeneratorIntegration(): Promise<QuotePDFResult> {
  try {
    console.log('🧪 Testing quote PDF generator with integration helper...');
    
    // Create sample quote data using integration helper
    const sampleQuoteData = createSampleQuoteData();
    
    // Use integration helper to generate PDF
    const result = await quotePDFGenerator.generateQuotePDFWithDefaults(sampleQuoteData);
    
    if (result.success) {
      console.log('✅ Integration test completed successfully!');
      
      // Get summary using integration helper
      const summary = quotePDFGenerator.getQuotePDFSummary(result);
      console.log('📊 Summary:', summary.summary);
      console.log('📋 Details:', summary.details);
      
      // Test download functionality (without actually downloading)
      console.log('📥 Testing download functionality...');
      if (result.pdfBytes) {
        console.log('✅ PDF bytes available for download');
        console.log(`📊 PDF size: ${(result.pdfBytes.length / 1024).toFixed(2)} KB`);
      }
      
    } else {
      console.error('❌ Integration test failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: 0
    };
  }
}

/**
 * Test multiple themes
 */
export async function testMultipleThemes(): Promise<Array<{ theme: string; result: QuotePDFResult }>> {
  try {
    console.log('🧪 Testing multiple themes...');
    
    const sampleQuoteData = createSampleQuoteData();
    const baseOptions: QuotePDFOptions = {
      companyName: 'Multi-Theme Company',
      companyAddress: '789 Theme Street, Theme City, TC 98765',
      companyPhone: '(555) 111-2222',
      companyEmail: 'themes@company.com',
      includeTerms: true,
      includeSignature: false
    };
    
    const results = await quotePDFGenerator.generateMultipleQuotePDFs(sampleQuoteData, baseOptions);
    
    console.log(`✅ Generated ${results.length} quote PDFs with different themes`);
    
    results.forEach(({ theme, result }) => {
      if (result.success) {
        console.log(`✅ ${theme} theme: ${result.pdfBytes?.length} bytes`);
      } else {
        console.error(`❌ ${theme} theme failed:`, result.error);
      }
    });
    
    return results;
    
  } catch (error) {
    console.error('❌ Multiple themes test failed:', error);
    return [];
  }
}

/**
 * Log detailed quote PDF results
 */
function logQuotePDFResults(result: QuotePDFResult): void {
  console.log('\n📊 Quote PDF Generation Results:');
  console.log('=' .repeat(50));
  
  if (!result.success) {
    console.log('❌ PDF generation failed:', result.error);
    return;
  }
  
  console.log(`🆔 Quote ID: ${result.quoteId}`);
  console.log(`📄 PDF Size: ${result.pdfBytes ? (result.pdfBytes.length / 1024).toFixed(2) + ' KB' : 'Unknown'}`);
  console.log(`⏱️ Processing Time: ${result.processingTime}ms`);
  console.log(`📅 Generated: ${new Date().toLocaleString()}`);
  
  if (result.pdfBytes) {
    console.log(`📊 PDF Details:`);
    console.log(`  • Size: ${result.pdfBytes.length} bytes`);
    console.log(`  • Size (KB): ${(result.pdfBytes.length / 1024).toFixed(2)} KB`);
    console.log(`  • Size (MB): ${(result.pdfBytes.length / (1024 * 1024)).toFixed(2)} MB`);
  }
  
  console.log('=' .repeat(50));
}

/**
 * Performance test for quote PDF generation
 */
export async function performanceTest(
  iterations: number = 5
): Promise<{
  averageTime: number;
  minTime: number;
  maxTime: number;
  results: QuotePDFResult[];
}> {
  console.log(`🏃‍♂️ Running quote PDF generation performance test with ${iterations} iterations...`);
  
  const results: QuotePDFResult[] = [];
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    console.log(`🔄 Iteration ${i + 1}/${iterations}...`);
    
    const result = await testQuotePDFGenerator();
    results.push(result);
    
    if (result.success) {
      times.push(result.processingTime);
    }
    
    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 100));
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
 * Test quote ID generation
 */
export function testQuoteIdGeneration(): {
  totalGenerated: number;
  uniqueIds: number;
  duplicates: number;
  formatValid: number;
  formatInvalid: number;
} {
  console.log('🧪 Testing quote ID generation...');
  
  const generatedIds: string[] = [];
  const iterations = 100;
  
  for (let i = 0; i < iterations; i++) {
    const id = generateQuoteId();
    generatedIds.push(id);
  }
  
  // Check uniqueness
  const uniqueIds = new Set(generatedIds);
  const duplicates = generatedIds.length - uniqueIds.size;
  
  // Check format (QTE-XXXXX-XXXX)
  const formatRegex = /^QTE-[A-Z0-9]{5}-[A-Z0-9]{5}$/;
  const formatValid = generatedIds.filter(id => formatRegex.test(id)).length;
  const formatInvalid = generatedIds.length - formatValid;
  
  console.log(`✅ Generated ${generatedIds.length} quote IDs`);
  console.log(`📊 Unique IDs: ${uniqueIds.size}`);
  console.log(`📊 Duplicates: ${duplicates}`);
  console.log(`📊 Format Valid: ${formatValid}`);
  console.log(`📊 Format Invalid: ${formatInvalid}`);
  
  if (duplicates > 0) {
    console.warn('⚠️ Duplicate IDs found!');
  }
  
  if (formatInvalid > 0) {
    console.warn('⚠️ Invalid format IDs found!');
  }
  
  return {
    totalGenerated: generatedIds.length,
    uniqueIds: uniqueIds.size,
    duplicates,
    formatValid,
    formatInvalid
  };
}

/**
 * Test quote data validation
 */
export function testQuoteDataValidation(): {
  validData: number;
  invalidData: number;
  validationErrors: string[];
} {
  console.log('🧪 Testing quote data validation...');
  
  const testCases = [
    // Valid data
    createSampleQuoteData(),
    
    // Invalid data - missing company
    { ...createSampleQuoteData(), company: '' },
    
    // Invalid data - missing client name
    { ...createSampleQuoteData(), clientName: '' },
    
    // Invalid data - missing email
    { ...createSampleQuoteData(), clientEmail: '' },
    
    // Invalid data - zero total cost
    { ...createSampleQuoteData(), calculation: { ...createSampleQuoteData().calculation, totalCost: 0 } },
    
    // Invalid data - negative users
    { ...createSampleQuoteData(), configuration: { ...createSampleQuoteData().configuration, numberOfUsers: -1 } }
  ];
  
  let validData = 0;
  let invalidData = 0;
  const validationErrors: string[] = [];
  
  testCases.forEach((testCase, index) => {
    const validation = validateQuoteData(testCase);
    
    if (validation.isValid) {
      validData++;
      console.log(`✅ Test case ${index + 1}: Valid`);
    } else {
      invalidData++;
      console.log(`❌ Test case ${index + 1}: Invalid - ${validation.errors.join(', ')}`);
      validationErrors.push(...validation.errors);
    }
  });
  
  console.log(`📊 Valid data: ${validData}`);
  console.log(`📊 Invalid data: ${invalidData}`);
  console.log(`📊 Total validation errors: ${validationErrors.length}`);
  
  return {
    validData,
    invalidData,
    validationErrors
  };
}

/**
 * Test available themes
 */
export function testAvailableThemes(): Array<{ theme: string; result: boolean }> {
  console.log('🧪 Testing available themes...');
  
  const themes = quotePDFGenerator.getAvailableThemes();
  const results: Array<{ theme: string; result: boolean }> = [];
  
  themes.forEach(theme => {
    console.log(`🎨 Theme: ${theme.label} (${theme.value})`);
    console.log(`   Description: ${theme.description}`);
    results.push({ theme: theme.value, result: true });
  });
  
  console.log(`✅ Tested ${themes.length} themes`);
  
  return results;
}

/**
 * Validate quote PDF generator functionality
 */
export async function validateQuotePDFGenerator(): Promise<boolean> {
  try {
    console.log('🔍 Validating quote PDF generator functionality...');
    
    // Test 1: Check if jsPDF is available
    if (typeof jsPDF === 'undefined') {
      console.error('❌ jsPDF is not available');
      return false;
    }
    
    // Test 2: Test quote ID generation
    const idTest = testQuoteIdGeneration();
    if (idTest.duplicates > 0 || idTest.formatInvalid > 0) {
      console.error('❌ Quote ID generation test failed');
      return false;
    }
    
    // Test 3: Test quote data validation
    const validationTest = testQuoteDataValidation();
    if (validationTest.validData === 0) {
      console.error('❌ Quote data validation test failed');
      return false;
    }
    
    // Test 4: Test sample data creation
    const sampleData = createSampleQuoteData();
    if (!sampleData || typeof sampleData !== 'object') {
      console.error('❌ Sample data creation failed');
      return false;
    }
    
    // Test 5: Test basic PDF generation
    const pdfTest = await testQuotePDFGenerator();
    if (!pdfTest.success) {
      console.error('❌ Basic PDF generation test failed');
      return false;
    }
    
    console.log('✅ Quote PDF generator validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Quote PDF generator validation failed:', error);
    return false;
  }
}
