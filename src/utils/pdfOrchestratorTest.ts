import {
  buildMergedBlob,
  createDefaultBuildOptions,
  validateQuoteDataForBuild,
  getProcessingStatistics,
  exportProcessingResultsToJSON,
  BuildMergedBlobOptions,
  BuildMergedBlobResult,
  QuoteData
} from './pdfOrchestrator';
import { pdfOrchestrator } from './pdfOrchestratorIntegration';
import { createSampleQuoteData } from './quotePDFGenerator';

/**
 * Test the PDF orchestrator with sample data
 */
export async function testPDFOrchestrator(): Promise<BuildMergedBlobResult> {
  try {
    console.log('🧪 Starting PDF orchestrator test...');
    
    // Create sample quote data
    const sampleQuoteData = createSampleQuoteData();
    console.log('📊 Sample quote data:', {
      company: sampleQuoteData.company,
      clientName: sampleQuoteData.clientName,
      totalCost: sampleQuoteData.calculation.totalCost
    });
    
    // Create sample template PDF
    console.log('📄 Creating sample template PDF...');
    const templatePDFBytes = await createSampleTemplatePDF();
    console.log(`✅ Template PDF created: ${templatePDFBytes.byteLength} bytes`);
    
    // Test with default options
    console.log('🔄 Testing with default options...');
    const result = await buildMergedBlob(templatePDFBytes, sampleQuoteData);
    
    if (result.success) {
      console.log('✅ PDF orchestrator test completed successfully!');
      console.log(`📊 Processing steps: ${result.processingSteps.length}`);
      console.log(`⏱️ Total time: ${result.totalProcessingTime}ms`);
      console.log(`📄 Final PDF size: ${result.mergedPDF?.size} bytes`);
      
      // Log detailed results
      logOrchestratorResults(result);
      
    } else {
      console.error('❌ PDF orchestrator test failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingSteps: [],
      totalProcessingTime: 0,
      warnings: []
    };
  }
}

/**
 * Test with custom options
 */
export async function testCustomOrchestratorOptions(
  customOptions: BuildMergedBlobOptions
): Promise<BuildMergedBlobResult> {
  try {
    console.log('🧪 Testing custom orchestrator options...');
    console.log('⚙️ Custom options:', customOptions);
    
    // Create sample data
    const sampleQuoteData = createSampleQuoteData();
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Test with custom options
    const result = await buildMergedBlob(templatePDFBytes, sampleQuoteData, customOptions);
    
    if (result.success) {
      console.log('✅ Custom orchestrator options test completed!');
      logOrchestratorResults(result);
    } else {
      console.error('❌ Custom orchestrator options test failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Custom options test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingSteps: [],
      totalProcessingTime: 0,
      warnings: []
    };
  }
}

/**
 * Test with integration helper
 */
export async function testPDFOrchestratorIntegration(): Promise<BuildMergedBlobResult> {
  try {
    console.log('🧪 Testing PDF orchestrator with integration helper...');
    
    // Create sample data
    const sampleQuoteData = createSampleQuoteData();
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Use integration helper to build merged PDF
    const result = await pdfOrchestrator.buildMergedPDFWithDefaults(
      templatePDFBytes,
      sampleQuoteData
    );
    
    if (result.success) {
      console.log('✅ Integration test completed successfully!');
      
      // Get summary using integration helper
      const summary = pdfOrchestrator.getBuildSummary(result);
      console.log('📊 Summary:', summary.summary);
      console.log('📋 Details:', summary.details);
      
      // Get processing steps
      const steps = pdfOrchestrator.getProcessingSteps(result);
      console.log('📋 Processing steps:', steps);
      
    } else {
      console.error('❌ Integration test failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingSteps: [],
      totalProcessingTime: 0,
      warnings: []
    };
  }
}

/**
 * Test different use cases
 */
export async function testDifferentUseCases(): Promise<Array<{ useCase: string; result: BuildMergedBlobResult }>> {
  try {
    console.log('🧪 Testing different use cases...');
    
    // Create sample data
    const sampleQuoteData = createSampleQuoteData();
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Test different use cases
    const useCases = ['preview', 'production', 'debug'];
    const results: Array<{ useCase: string; result: BuildMergedBlobResult }> = [];
    
    for (const useCase of useCases) {
      console.log(`🔄 Testing ${useCase} use case...`);
      
      const options = pdfOrchestrator.createBuildOptionsForUseCase(useCase as any);
      const result = await buildMergedBlob(templatePDFBytes, sampleQuoteData, options);
      
      results.push({ useCase, result });
      
      if (result.success) {
        console.log(`✅ ${useCase} use case test completed successfully`);
      } else {
        console.error(`❌ ${useCase} use case test failed:`, result.error);
      }
    }
    
    console.log(`✅ Tested ${results.length} different use cases`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Different use cases test failed:', error);
    return [];
  }
}

/**
 * Test batch processing
 */
export async function testBatchProcessing(): Promise<Array<{ index: number; result: BuildMergedBlobResult }>> {
  try {
    console.log('🧪 Testing batch processing...');
    
    // Create multiple quote data sets
    const quoteDataArray: QuoteData[] = [];
    
    for (let i = 0; i < 3; i++) {
      const quoteData = createSampleQuoteData();
      quoteData.id = `quote-${i + 1}`;
      quoteData.company = `Company ${i + 1}`;
      quoteData.clientName = `Client ${i + 1}`;
      quoteData.calculation.totalCost = 10000 + (i * 5000);
      
      quoteDataArray.push(quoteData);
    }
    
    console.log(`📄 Created ${quoteDataArray.length} quote data sets for batch processing`);
    
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Test batch processing
    const results = await pdfOrchestrator.batchBuildMergedPDFs(
      templatePDFBytes,
      quoteDataArray
    );
    
    const successful = results.filter(r => r.result.success).length;
    console.log(`✅ Batch processing completed: ${successful}/${results.length} successful`);
    
    // Get statistics
    const statistics = pdfOrchestrator.getBatchBuildStatistics(results);
    console.log('📊 Batch processing statistics:', statistics);
    
    return results;
    
  } catch (error) {
    console.error('❌ Batch processing test failed:', error);
    return [];
  }
}

/**
 * Log detailed orchestrator results
 */
function logOrchestratorResults(result: BuildMergedBlobResult): void {
  console.log('\n📊 PDF Orchestrator Results:');
  console.log('=' .repeat(60));
  
  if (!result.success) {
    console.log('❌ Orchestration failed:', result.error);
    return;
  }
  
  console.log(`✅ Orchestration completed successfully`);
  console.log(`⏱️ Total processing time: ${result.totalProcessingTime}ms`);
  console.log(`📊 Processing steps: ${result.processingSteps.length}`);
  
  if (result.warnings.length > 0) {
    console.log(`⚠️ Warnings: ${result.warnings.length}`);
    result.warnings.forEach(warning => {
      console.log(`  • ${warning}`);
    });
  }
  
  console.log('\n📋 Processing Steps:');
  console.log('-'.repeat(40));
  
  result.processingSteps.forEach((step, index) => {
    const status = step.success ? '✅' : '❌';
    console.log(`${index + 1}. ${status} ${step.step} (${step.duration}ms)`);
    
    if (step.error) {
      console.log(`   Error: ${step.error}`);
    }
    
    if (step.details) {
      console.log(`   Details:`, step.details);
    }
  });
  
  if (result.debugInfo) {
    console.log('\n🔍 Debug Information:');
    console.log('-'.repeat(40));
    console.log(`Original PDF size: ${(result.debugInfo.originalPDFSize / 1024).toFixed(2)} KB`);
    console.log(`Final PDF size: ${(result.debugInfo.finalPDFSize / 1024).toFixed(2)} KB`);
    console.log(`Form fields found: ${result.debugInfo.formFieldsFound}`);
    console.log(`Tokens replaced: ${result.debugInfo.tokensReplaced}`);
    
    if (result.debugInfo.overlayRegion) {
      console.log(`Overlay region: ${result.debugInfo.overlayRegion.width}x${result.debugInfo.overlayRegion.height}`);
    }
  }
  
  console.log('=' .repeat(60));
}

/**
 * Performance test for PDF orchestrator
 */
export async function performanceTest(
  iterations: number = 3
): Promise<{
  averageTime: number;
  minTime: number;
  maxTime: number;
  results: BuildMergedBlobResult[];
}> {
  console.log(`🏃‍♂️ Running PDF orchestrator performance test with ${iterations} iterations...`);
  
  const results: BuildMergedBlobResult[] = [];
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    console.log(`🔄 Iteration ${i + 1}/${iterations}...`);
    
    const result = await testPDFOrchestrator();
    results.push(result);
    
    if (result.success) {
      times.push(result.totalProcessingTime);
    }
    
    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 1000));
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
    const validation = validateQuoteDataForBuild(testCase);
    
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
 * Test processing statistics
 */
export function testProcessingStatistics(): void {
  console.log('🧪 Testing processing statistics...');
  
  // Create mock result
  const mockResult: BuildMergedBlobResult = {
    success: true,
    processingSteps: [
      { step: 'Load Original PDF', success: true, duration: 100 },
      { step: 'Fill Form Fields', success: true, duration: 200 },
      { step: 'Replace Text Tokens', success: true, duration: 150 },
      { step: 'Generate Quote PDF', success: true, duration: 300 },
      { step: 'Overlay Quote PDF', success: true, duration: 250 },
      { step: 'Save Final PDF', success: true, duration: 50 }
    ],
    totalProcessingTime: 1050,
    warnings: []
  };
  
  const statistics = getProcessingStatistics(mockResult);
  
  console.log('📊 Processing Statistics:');
  console.log(`Total steps: ${statistics.totalSteps}`);
  console.log(`Successful steps: ${statistics.successfulSteps}`);
  console.log(`Failed steps: ${statistics.failedSteps}`);
  console.log(`Total duration: ${statistics.totalDuration}ms`);
  console.log(`Average step duration: ${statistics.averageStepDuration.toFixed(1)}ms`);
  console.log(`Success rate: ${statistics.successRate}`);
}

/**
 * Create a sample template PDF for testing
 */
async function createSampleTemplatePDF(): Promise<ArrayBuffer> {
  try {
    // In a real implementation, you'd load an actual template PDF
    // For testing, we'll create a simple PDF using jsPDF
    
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Add some content to simulate a template
    doc.setFontSize(16);
    doc.text('Sample Template PDF', 20, 30);
    
    doc.setFontSize(12);
    doc.text('Company Information:', 20, 50);
    doc.text('Client Details:', 20, 70);
    doc.text('Project Description:', 20, 90);
    
    // Add form fields area
    doc.setFontSize(14);
    doc.text('Form Fields Area:', 20, 120);
    doc.rect(20, 130, 170, 30); // Form fields area
    
    // Add token replacement area
    doc.setFontSize(14);
    doc.text('Token Replacement Area:', 20, 170);
    doc.text('Company: {company name}', 25, 185);
    doc.text('Total: {total price}', 25, 195);
    doc.text('Users: {userscount}', 25, 205);
    
    // Add pricing overlay area
    doc.setFontSize(14);
    doc.text('Pricing Overlay Area:', 20, 220);
    doc.rect(20, 230, 170, 50); // Pricing overlay area
    
    // Add footer
    doc.setFontSize(8);
    doc.text('Template PDF - Generated for testing', 20, 280);
    
    return doc.output('arraybuffer');
    
  } catch (error) {
    console.error('❌ Error creating sample template PDF:', error);
    throw error;
  }
}

/**
 * Validate PDF orchestrator functionality
 */
export async function validatePDFOrchestrator(): Promise<boolean> {
  try {
    console.log('🔍 Validating PDF orchestrator functionality...');
    
    // Test 1: Check if pdf-lib is available
    if (typeof PDFDocument === 'undefined') {
      console.error('❌ pdf-lib is not available');
      return false;
    }
    
    // Test 2: Test quote data validation
    const validationTest = testQuoteDataValidation();
    if (validationTest.validData === 0) {
      console.error('❌ Quote data validation test failed');
      return false;
    }
    
    // Test 3: Test processing statistics
    testProcessingStatistics();
    
    // Test 4: Test basic orchestrator functionality
    const basicTest = await testPDFOrchestrator();
    if (!basicTest.success) {
      console.error('❌ Basic orchestrator test failed');
      return false;
    }
    
    // Test 5: Test integration helper
    const integrationTest = await testPDFOrchestratorIntegration();
    if (!integrationTest.success) {
      console.error('❌ Integration test failed');
      return false;
    }
    
    console.log('✅ PDF orchestrator validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ PDF orchestrator validation failed:', error);
    return false;
  }
}
