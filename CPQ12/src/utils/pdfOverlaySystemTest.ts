import {
  pdfOverlaySystem,
  OverlayRegion,
  OverlayOptions,
  OverlayResult
} from './pdfOverlaySystem';
import { pdfOverlayIntegration } from './pdfOverlaySystemIntegration';
import { createSampleQuoteData } from './quotePDFGenerator';
import { generateQuotePDF } from './quotePDFGenerator';

/**
 * Test the PDF overlay system with sample data
 */
export async function testPDFOverlaySystem(): Promise<OverlayResult> {
  try {
    console.log('🧪 Starting PDF overlay system test...');
    
    // Create sample quote data and generate quote PDF
    console.log('📊 Creating sample quote data...');
    const sampleQuoteData = createSampleQuoteData();
    
    console.log('🔄 Generating quote PDF...');
    const quoteResult = await generateQuotePDF(sampleQuoteData);
    
    if (!quoteResult.success || !quoteResult.pdfBytes) {
      throw new Error('Failed to generate sample quote PDF');
    }
    
    console.log('✅ Quote PDF generated successfully');
    console.log(`📄 Quote PDF size: ${quoteResult.pdfBytes.length} bytes`);
    
    // Create a simple template PDF (in a real implementation, you'd load an actual template)
    console.log('📄 Creating sample template PDF...');
    const templatePDFBytes = await createSampleTemplatePDF();
    
    console.log('✅ Template PDF created successfully');
    console.log(`📄 Template PDF size: ${templatePDFBytes.length} bytes`);
    
    // Test overlay with default options
    console.log('🔄 Testing PDF overlay...');
    const overlayResult = await pdfOverlaySystem.overlayQuotePDF(
      templatePDFBytes,
      quoteResult.pdfBytes
    );
    
    if (overlayResult.success) {
      console.log('✅ PDF overlay test completed successfully!');
      console.log(`📊 Overlay region: ${overlayResult.overlayRegion?.width}x${overlayResult.overlayRegion?.height}`);
      console.log(`📊 Scaling factor: ${overlayResult.scalingInfo?.scaleFactor.toFixed(2)}x`);
      console.log(`⏱️ Processing time: ${overlayResult.processingTime}ms`);
      
      // Log detailed results
      logOverlayResults(overlayResult);
      
    } else {
      console.error('❌ PDF overlay test failed:', overlayResult.error);
    }
    
    return overlayResult;
    
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
 * Test with custom overlay options
 */
export async function testCustomOverlayOptions(
  customOptions: OverlayOptions
): Promise<OverlayResult> {
  try {
    console.log('🧪 Testing custom overlay options...');
    console.log('⚙️ Custom options:', customOptions);
    
    // Create sample data
    const sampleQuoteData = createSampleQuoteData();
    const quoteResult = await generateQuotePDF(sampleQuoteData);
    
    if (!quoteResult.success || !quoteResult.pdfBytes) {
      throw new Error('Failed to generate sample quote PDF');
    }
    
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Test overlay with custom options
    const overlayResult = await pdfOverlaySystem.overlayQuotePDF(
      templatePDFBytes,
      quoteResult.pdfBytes,
      customOptions
    );
    
    if (overlayResult.success) {
      console.log('✅ Custom overlay options test completed!');
      logOverlayResults(overlayResult);
    } else {
      console.error('❌ Custom overlay options test failed:', overlayResult.error);
    }
    
    return overlayResult;
    
  } catch (error) {
    console.error('❌ Custom options test failed:', error);
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
export async function testPDFOverlayIntegration(): Promise<OverlayResult> {
  try {
    console.log('🧪 Testing PDF overlay with integration helper...');
    
    // Create sample data
    const sampleQuoteData = createSampleQuoteData();
    const quoteResult = await generateQuotePDF(sampleQuoteData);
    
    if (!quoteResult.success || !quoteResult.pdfBytes) {
      throw new Error('Failed to generate sample quote PDF');
    }
    
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Use integration helper to overlay PDFs
    const result = await pdfOverlayIntegration.overlayWithAutoDetection(
      templatePDFBytes,
      quoteResult.pdfBytes,
      'quote'
    );
    
    if (result.success) {
      console.log('✅ Integration test completed successfully!');
      
      // Get summary using integration helper
      const summary = pdfOverlayIntegration.getOverlaySummary(result);
      console.log('📊 Summary:', summary.summary);
      console.log('📋 Details:', summary.details);
      
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
 * Test custom region overlay
 */
export async function testCustomRegionOverlay(): Promise<OverlayResult> {
  try {
    console.log('🧪 Testing custom region overlay...');
    
    // Create sample data
    const sampleQuoteData = createSampleQuoteData();
    const quoteResult = await generateQuotePDF(sampleQuoteData);
    
    if (!quoteResult.success || !quoteResult.pdfBytes) {
      throw new Error('Failed to generate sample quote PDF');
    }
    
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Create custom region (bottom-right area)
    const customRegion: OverlayRegion = {
      x: 400,
      y: 100,
      width: 200,
      height: 300,
      pageIndex: 0,
      confidence: 0.9,
      detectionMethod: 'manual'
    };
    
    console.log('📍 Custom region:', customRegion);
    
    // Test overlay with custom region
    const result = await pdfOverlayIntegration.overlayWithCustomRegion(
      templatePDFBytes,
      quoteResult.pdfBytes,
      customRegion
    );
    
    if (result.success) {
      console.log('✅ Custom region overlay test completed!');
      logOverlayResults(result);
    } else {
      console.error('❌ Custom region overlay test failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Custom region test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: 0
    };
  }
}

/**
 * Test batch overlay
 */
export async function testBatchOverlay(): Promise<Array<{ index: number; result: OverlayResult }>> {
  try {
    console.log('🧪 Testing batch overlay...');
    
    // Create multiple quote PDFs
    const quotePDFs: ArrayBuffer[] = [];
    
    for (let i = 0; i < 3; i++) {
      const sampleQuoteData = createSampleQuoteData();
      sampleQuoteData.id = `quote-${i + 1}`;
      sampleQuoteData.company = `Company ${i + 1}`;
      
      const quoteResult = await generateQuotePDF(sampleQuoteData);
      
      if (quoteResult.success && quoteResult.pdfBytes) {
        quotePDFs.push(quoteResult.pdfBytes);
      }
    }
    
    console.log(`📄 Created ${quotePDFs.length} quote PDFs for batch processing`);
    
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Test batch overlay
    const results = await pdfOverlayIntegration.batchOverlay(
      templatePDFBytes,
      quotePDFs
    );
    
    const successful = results.filter(r => r.result.success).length;
    console.log(`✅ Batch overlay completed: ${successful}/${results.length} successful`);
    
    // Get statistics
    const statistics = pdfOverlayIntegration.getOverlayStatistics(
      results.map(r => r.result)
    );
    console.log('📊 Batch overlay statistics:', statistics);
    
    return results;
    
  } catch (error) {
    console.error('❌ Batch overlay test failed:', error);
    return [];
  }
}

/**
 * Log detailed overlay results
 */
function logOverlayResults(result: OverlayResult): void {
  console.log('\n📊 PDF Overlay Results:');
  console.log('=' .repeat(50));
  
  if (!result.success) {
    console.log('❌ Overlay failed:', result.error);
    return;
  }
  
  console.log(`✅ Overlay completed successfully`);
  console.log(`⏱️ Processing time: ${result.processingTime}ms`);
  
  if (result.overlayRegion) {
    console.log(`📍 Overlay region:`);
    console.log(`  • Position: (${result.overlayRegion.x.toFixed(1)}, ${result.overlayRegion.y.toFixed(1)})`);
    console.log(`  • Size: ${result.overlayRegion.width.toFixed(1)}x${result.overlayRegion.height.toFixed(1)}`);
    console.log(`  • Page: ${result.overlayRegion.pageIndex + 1}`);
    console.log(`  • Detection method: ${result.overlayRegion.detectionMethod}`);
    console.log(`  • Confidence: ${result.overlayRegion.confidence.toFixed(2)}`);
  }
  
  if (result.scalingInfo) {
    console.log(`📏 Scaling information:`);
    console.log(`  • Original size: ${result.scalingInfo.originalWidth.toFixed(1)}x${result.scalingInfo.originalHeight.toFixed(1)}`);
    console.log(`  • Scaled size: ${result.scalingInfo.scaledWidth.toFixed(1)}x${result.scalingInfo.scaledHeight.toFixed(1)}`);
    console.log(`  • Scale factor: ${result.scalingInfo.scaleFactor.toFixed(2)}x`);
  }
  
  if (result.processedPDF) {
    console.log(`📄 Processed PDF:`);
    console.log(`  • Size: ${result.processedPDF.size} bytes`);
    console.log(`  • Size (KB): ${(result.processedPDF.size / 1024).toFixed(2)} KB`);
  }
  
  console.log('=' .repeat(50));
}

/**
 * Performance test for PDF overlay
 */
export async function performanceTest(
  iterations: number = 5
): Promise<{
  averageTime: number;
  minTime: number;
  maxTime: number;
  results: OverlayResult[];
}> {
  console.log(`🏃‍♂️ Running PDF overlay performance test with ${iterations} iterations...`);
  
  const results: OverlayResult[] = [];
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    console.log(`🔄 Iteration ${i + 1}/${iterations}...`);
    
    const result = await testPDFOverlaySystem();
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
 * Test overlay region detection
 */
export async function testOverlayRegionDetection(): Promise<{
  success: boolean;
  regions: OverlayRegion[];
  pageInfo: Array<{ width: number; height: number; pageIndex: number }>;
  error?: string;
}> {
  try {
    console.log('🧪 Testing overlay region detection...');
    
    const templatePDFBytes = await createSampleTemplatePDF();
    
    const result = await pdfOverlayIntegration.analyzeTemplateForRegions(templatePDFBytes);
    
    if (result.success) {
      console.log(`✅ Found ${result.regions.length} overlay regions`);
      console.log(`📄 Analyzed ${result.pageInfo.length} pages`);
      
      result.regions.forEach((region, index) => {
        console.log(`📍 Region ${index + 1}: ${region.width.toFixed(1)}x${region.height.toFixed(1)} at (${region.x.toFixed(1)}, ${region.y.toFixed(1)}) on page ${region.pageIndex + 1}`);
      });
    } else {
      console.error('❌ Region detection failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Region detection test failed:', error);
    return {
      success: false,
      regions: [],
      pageInfo: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Test different overlay options
 */
export async function testDifferentOverlayOptions(): Promise<Array<{ options: OverlayOptions; result: OverlayResult }>> {
  try {
    console.log('🧪 Testing different overlay options...');
    
    // Create sample data
    const sampleQuoteData = createSampleQuoteData();
    const quoteResult = await generateQuotePDF(sampleQuoteData);
    
    if (!quoteResult.success || !quoteResult.pdfBytes) {
      throw new Error('Failed to generate sample quote PDF');
    }
    
    const templatePDFBytes = await createSampleTemplatePDF();
    
    // Test different option combinations
    const optionSets = [
      {
        name: 'Default Options',
        options: pdfOverlaySystem.createDefaultOptions()
      },
      {
        name: 'No Scaling',
        options: {
          scaleToFit: false,
          maintainAspectRatio: true,
          centerInRegion: true,
          padding: 10,
          clearRegion: true
        }
      },
      {
        name: 'No Clearing',
        options: {
          scaleToFit: true,
          maintainAspectRatio: true,
          centerInRegion: true,
          padding: 10,
          clearRegion: false
        }
      },
      {
        name: 'Debug Mode',
        options: {
          scaleToFit: true,
          maintainAspectRatio: true,
          centerInRegion: true,
          padding: 15,
          clearRegion: true,
          debugMode: true
        }
      }
    ];
    
    const results: Array<{ options: OverlayOptions; result: OverlayResult }> = [];
    
    for (const { name, options } of optionSets) {
      console.log(`🔄 Testing ${name}...`);
      
      const result = await pdfOverlaySystem.overlayQuotePDF(
        templatePDFBytes,
        quoteResult.pdfBytes,
        options
      );
      
      results.push({ options, result });
      
      if (result.success) {
        console.log(`✅ ${name} test completed successfully`);
      } else {
        console.error(`❌ ${name} test failed:`, result.error);
      }
    }
    
    console.log(`✅ Tested ${results.length} different option sets`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Different options test failed:', error);
    return [];
  }
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
    
    // Add a pricing section area (this is where the overlay will go)
    doc.setFontSize(14);
    doc.text('Pricing Information:', 20, 120);
    doc.rect(20, 130, 170, 100); // This creates a box where pricing will be overlaid
    
    doc.setFontSize(10);
    doc.text('(Quote will be overlaid in this area)', 25, 140);
    
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
 * Validate PDF overlay system functionality
 */
export async function validatePDFOverlaySystem(): Promise<boolean> {
  try {
    console.log('🔍 Validating PDF overlay system functionality...');
    
    // Test 1: Check if pdf-lib is available
    if (typeof PDFDocument === 'undefined') {
      console.error('❌ pdf-lib is not available');
      return false;
    }
    
    // Test 2: Test overlay system instance
    if (!pdfOverlaySystem) {
      console.error('❌ PDF overlay system instance is not available');
      return false;
    }
    
    // Test 3: Test integration helper
    if (!pdfOverlayIntegration) {
      console.error('❌ PDF overlay integration helper is not available');
      return false;
    }
    
    // Test 4: Test basic overlay functionality
    const basicTest = await testPDFOverlaySystem();
    if (!basicTest.success) {
      console.error('❌ Basic overlay test failed');
      return false;
    }
    
    // Test 5: Test region detection
    const regionTest = await testOverlayRegionDetection();
    if (!regionTest.success) {
      console.error('❌ Region detection test failed');
      return false;
    }
    
    console.log('✅ PDF overlay system validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ PDF overlay system validation failed:', error);
    return false;
  }
}
