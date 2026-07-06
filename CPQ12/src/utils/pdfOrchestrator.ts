import { PDFDocument } from 'pdf-lib';
import { QuoteData } from './quotePDFGenerator';
import { pdfFormFiller } from './pdfFormFillerIntegration';
import { tokenReplacer } from './tokenReplacerIntegration';
import { quotePDFGenerator } from './quotePDFGeneratorIntegration';
import { pdfOverlaySystem } from './pdfOverlaySystem';

export interface BuildMergedBlobOptions {
  // Form filling options
  fillForms?: boolean;
  flattenForms?: boolean;
  
  // Token replacement options
  replaceTokens?: boolean;
  tokenReplacementMap?: { [key: string]: string };
  
  // Quote generation options
  generateQuotePDF?: boolean;
  quotePDFOptions?: {
    companyName?: string;
    companyLogo?: string;
    companyAddress?: string;
    companyPhone?: string;
    companyEmail?: string;
    includeTerms?: boolean;
    includeSignature?: boolean;
    theme?: 'blue' | 'green' | 'purple' | 'gray';
  };
  
  // Overlay options
  overlayQuotePDF?: boolean;
  overlayOptions?: {
    scaleToFit?: boolean;
    maintainAspectRatio?: boolean;
    centerInRegion?: boolean;
    padding?: number;
    clearRegion?: boolean;
    clearColor?: { r: number; g: number; b: number };
    fallbackRegion?: {
      x: number;
      y: number;
      width: number;
      height: number;
      pageIndex: number;
    };
    debugMode?: boolean;
  };
  
  // General options
  preserveOriginal?: boolean;
  debugMode?: boolean;
  timeout?: number; // milliseconds
}

export interface BuildMergedBlobResult {
  success: boolean;
  mergedPDF?: Blob;
  originalPDF?: Blob;
  quotePDF?: Blob;
  processingSteps: {
    step: string;
    success: boolean;
    duration: number;
    error?: string;
    details?: any;
  }[];
  totalProcessingTime: number;
  error?: string;
  warnings: string[];
  debugInfo?: {
    originalPDFSize: number;
    quotePDFSize?: number;
    finalPDFSize: number;
    formFieldsFound: number;
    tokensReplaced: number;
    overlayRegion?: any;
  };
}

/**
 * Main orchestration function for building merged PDF blobs
 */
export async function buildMergedBlob(
  originalPDFBytes: ArrayBuffer,
  quoteData: QuoteData,
  options: BuildMergedBlobOptions = {}
): Promise<BuildMergedBlobResult> {
  const startTime = Date.now();
  const processingSteps: BuildMergedBlobResult['processingSteps'] = [];
  const warnings: string[] = [];
  
  try {
    console.log('🚀 Starting buildMergedBlob orchestration...');
    console.log('📊 Quote data:', {
      company: quoteData.company,
      clientName: quoteData.clientName,
      totalCost: quoteData.calculation.totalCost
    });
    
    // Set default options
    const defaultOptions: BuildMergedBlobOptions = {
      fillForms: true,
      flattenForms: true,
      replaceTokens: true,
      generateQuotePDF: true,
      overlayQuotePDF: true,
      preserveOriginal: true,
      debugMode: false,
      timeout: 30000, // 30 seconds
      ...options
    };
    
    console.log('⚙️ Processing options:', defaultOptions);
    
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout')), defaultOptions.timeout);
    });
    
    // Main processing promise
    const processingPromise = processPDFWorkflow(
      originalPDFBytes,
      quoteData,
      defaultOptions,
      processingSteps,
      warnings
    );
    
    // Race between processing and timeout
    const result = await Promise.race([processingPromise, timeoutPromise]);
    
    const totalProcessingTime = Date.now() - startTime;
    
    console.log(`✅ buildMergedBlob completed successfully in ${totalProcessingTime}ms`);
    console.log(`📊 Processed ${processingSteps.length} steps`);
    
    return {
      ...result,
      totalProcessingTime,
      processingSteps,
      warnings
    };
    
  } catch (error) {
    const totalProcessingTime = Date.now() - startTime;
    console.error('❌ buildMergedBlob failed:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingSteps,
      totalProcessingTime,
      warnings
    };
  }
}

/**
 * Process the complete PDF workflow
 */
async function processPDFWorkflow(
  originalPDFBytes: ArrayBuffer,
  quoteData: QuoteData,
  options: BuildMergedBlobOptions,
  processingSteps: BuildMergedBlobResult['processingSteps'],
  warnings: string[]
): Promise<Omit<BuildMergedBlobResult, 'processingSteps' | 'totalProcessingTime' | 'warnings'>> {
  
  let currentPDFBytes = originalPDFBytes;
  let quotePDFBytes: ArrayBuffer | null = null;
  let formFieldsFound = 0;
  let tokensReplaced = 0;
  let overlayRegion: any = null;
  
  // Step 1: Load and validate original PDF
  console.log('📄 Step 1: Loading original PDF...');
  const step1Start = Date.now();
  
  try {
    const originalPDF = await PDFDocument.load(currentPDFBytes);
    const pageCount = originalPDF.getPageCount();
    
    console.log(`✅ Original PDF loaded: ${pageCount} pages`);
    
    processingSteps.push({
      step: 'Load Original PDF',
      success: true,
      duration: Date.now() - step1Start,
      details: { pageCount }
    });
    
  } catch (error) {
    const errorMsg = `Failed to load original PDF: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error('❌', errorMsg);
    
    processingSteps.push({
      step: 'Load Original PDF',
      success: false,
      duration: Date.now() - step1Start,
      error: errorMsg
    });
    
    throw new Error(errorMsg);
  }
  
  // Step 2: Fill form fields (if enabled)
  if (options.fillForms) {
    console.log('📝 Step 2: Filling form fields...');
    const step2Start = Date.now();
    
    try {
      const formResult = await pdfFormFiller.fillPDFFormFromFile(
        new File([currentPDFBytes], 'template.pdf', { type: 'application/pdf' }),
        quoteData
      );
      
      if (formResult.success && formResult.filledPDF) {
        currentPDFBytes = await formResult.filledPDF.arrayBuffer();
        formFieldsFound = formResult.filledFields.length;
        
        console.log(`✅ Form fields filled: ${formFieldsFound} fields`);
        
        processingSteps.push({
          step: 'Fill Form Fields',
          success: true,
          duration: Date.now() - step2Start,
          details: { fieldsFilled: formFieldsFound }
        });
      } else {
        warnings.push('No form fields found or form filling failed');
        console.log('⚠️ No form fields found, skipping form filling');
        
        processingSteps.push({
          step: 'Fill Form Fields',
          success: true,
          duration: Date.now() - step2Start,
          details: { message: 'No form fields found' }
        });
      }
      
    } catch (error) {
      const errorMsg = `Form filling failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌', errorMsg);
      warnings.push(errorMsg);
      
      processingSteps.push({
        step: 'Fill Form Fields',
        success: false,
        duration: Date.now() - step2Start,
        error: errorMsg
      });
    }
  }
  
  // Step 3: Replace text tokens (if enabled)
  if (options.replaceTokens) {
    console.log('🔄 Step 3: Replacing text tokens...');
    const step3Start = Date.now();
    
    try {
      const tokenResult = await tokenReplacer.replaceTokensInPDFFile(
        new File([currentPDFBytes], 'template.pdf', { type: 'application/pdf' }),
        quoteData
      );
      
      if (tokenResult.success && tokenResult.processedPDF) {
        currentPDFBytes = await tokenResult.processedPDF.arrayBuffer();
        tokensReplaced = tokenResult.replacedCount;
        
        console.log(`✅ Text tokens replaced: ${tokensReplaced} tokens`);
        
        processingSteps.push({
          step: 'Replace Text Tokens',
          success: true,
          duration: Date.now() - step3Start,
          details: { tokensReplaced }
        });
      } else {
        warnings.push('No tokens found or token replacement failed');
        console.log('⚠️ No tokens found, skipping token replacement');
        
        processingSteps.push({
          step: 'Replace Text Tokens',
          success: true,
          duration: Date.now() - step3Start,
          details: { message: 'No tokens found' }
        });
      }
      
    } catch (error) {
      const errorMsg = `Token replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌', errorMsg);
      warnings.push(errorMsg);
      
      processingSteps.push({
        step: 'Replace Text Tokens',
        success: false,
        duration: Date.now() - step3Start,
        error: errorMsg
      });
    }
  }
  
  // Step 4: Generate quote PDF (if enabled)
  if (options.generateQuotePDF) {
    console.log('📋 Step 4: Generating quote PDF...');
    const step4Start = Date.now();
    
    try {
      const quoteResult = await quotePDFGenerator.generateQuotePDFWithOptions(
        quoteData,
        options.quotePDFOptions || {}
      );
      
      if (quoteResult.success && quoteResult.pdfBytes) {
        quotePDFBytes = quoteResult.pdfBytes.buffer;
        
        console.log(`✅ Quote PDF generated: ${quoteResult.pdfBytes.length} bytes`);
        
        processingSteps.push({
          step: 'Generate Quote PDF',
          success: true,
          duration: Date.now() - step4Start,
          details: { 
            quoteId: quoteResult.quoteId,
            pdfSize: quoteResult.pdfBytes.length 
          }
        });
      } else {
        throw new Error(quoteResult.error || 'Failed to generate quote PDF');
      }
      
    } catch (error) {
      const errorMsg = `Quote PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌', errorMsg);
      
      processingSteps.push({
        step: 'Generate Quote PDF',
        success: false,
        duration: Date.now() - step4Start,
        error: errorMsg
      });
      
      throw new Error(errorMsg);
    }
  }
  
  // Step 5: Overlay quote PDF (if enabled and quote PDF exists)
  if (options.overlayQuotePDF && quotePDFBytes) {
    console.log('🎨 Step 5: Overlaying quote PDF...');
    const step5Start = Date.now();
    
    try {
      const overlayResult = await pdfOverlaySystem.overlayQuotePDF(
        currentPDFBytes,
        quotePDFBytes,
        options.overlayOptions || {},
        quoteData
      );
      
      if (overlayResult.success && overlayResult.processedPDF) {
        currentPDFBytes = await overlayResult.processedPDF.arrayBuffer();
        overlayRegion = overlayResult.overlayRegion;
        
        console.log(`✅ Quote PDF overlaid successfully`);
        console.log(`📊 Overlay region: ${overlayRegion?.width}x${overlayRegion?.height}`);
        
        processingSteps.push({
          step: 'Overlay Quote PDF',
          success: true,
          duration: Date.now() - step5Start,
          details: { 
            overlayRegion,
            scalingInfo: overlayResult.scalingInfo 
          }
        });
      } else {
        throw new Error(overlayResult.error || 'Failed to overlay quote PDF');
      }
      
    } catch (error) {
      const errorMsg = `Quote PDF overlay failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌', errorMsg);
      
      processingSteps.push({
        step: 'Overlay Quote PDF',
        success: false,
        duration: Date.now() - step5Start,
        error: errorMsg
      });
      
      throw new Error(errorMsg);
    }
  }
  
  // Step 6: Save final PDF
  console.log('💾 Step 6: Saving final PDF...');
  const step6Start = Date.now();
  
  try {
    // Handle ArrayBuffer detachment issues
    let finalPDFBytes: ArrayBuffer;
    
    try {
      // Try to use the current PDF bytes directly
      finalPDFBytes = currentPDFBytes;
    } catch (error) {
      // If detached, reload the PDF
      console.log('⚠️ ArrayBuffer detached, reloading PDF...');
      const tempPDF = await PDFDocument.load(currentPDFBytes);
      finalPDFBytes = await tempPDF.save();
    }
    
    const mergedPDF = new Blob([finalPDFBytes], { type: 'application/pdf' });
    
    console.log(`✅ Final PDF saved: ${mergedPDF.size} bytes`);
    
    processingSteps.push({
      step: 'Save Final PDF',
      success: true,
      duration: Date.now() - step6Start,
      details: { finalSize: mergedPDF.size }
    });
    
    // Prepare result
    const result: Omit<BuildMergedBlobResult, 'processingSteps' | 'totalProcessingTime' | 'warnings'> = {
      success: true,
      mergedPDF,
      debugInfo: {
        originalPDFSize: originalPDFBytes.byteLength,
        quotePDFSize: quotePDFBytes?.byteLength,
        finalPDFSize: mergedPDF.size,
        formFieldsFound,
        tokensReplaced,
        overlayRegion
      }
    };
    
    // Add original PDF if requested
    if (options.preserveOriginal) {
      result.originalPDF = new Blob([originalPDFBytes], { type: 'application/pdf' });
    }
    
    // Add quote PDF if generated
    if (quotePDFBytes) {
      result.quotePDF = new Blob([quotePDFBytes], { type: 'application/pdf' });
    }
    
    return result;
    
  } catch (error) {
    const errorMsg = `Failed to save final PDF: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error('❌', errorMsg);
    
    processingSteps.push({
      step: 'Save Final PDF',
      success: false,
      duration: Date.now() - step6Start,
      error: errorMsg
    });
    
    throw new Error(errorMsg);
  }
}

/**
 * Create default options for buildMergedBlob
 */
export function createDefaultBuildOptions(): BuildMergedBlobOptions {
  return {
    fillForms: true,
    flattenForms: true,
    replaceTokens: true,
    generateQuotePDF: true,
    overlayQuotePDF: true,
    preserveOriginal: true,
    debugMode: false,
    timeout: 30000,
    quotePDFOptions: {
      companyName: 'Your Company',
      companyAddress: '123 Business Street, City, State 12345',
      companyPhone: '(555) 123-4567',
      companyEmail: 'info@yourcompany.com',
      includeTerms: true,
      includeSignature: true,
      theme: 'blue'
    },
    overlayOptions: {
      scaleToFit: true,
      maintainAspectRatio: true,
      centerInRegion: true,
      padding: 10,
      clearRegion: true,
      clearColor: { r: 1, g: 1, b: 1 },
      debugMode: false
    }
  };
}

/**
 * Validate quote data for buildMergedBlob
 */
export function validateQuoteDataForBuild(quoteData: QuoteData): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required fields
  if (!quoteData.company) {
    errors.push('Company name is required');
  }
  
  if (!quoteData.clientName) {
    errors.push('Client name is required');
  }
  
  if (!quoteData.clientEmail) {
    errors.push('Client email is required');
  }
  
  if (!quoteData.calculation.totalCost || quoteData.calculation.totalCost <= 0) {
    errors.push('Total cost must be greater than 0');
  }
  
  if (!quoteData.configuration.numberOfUsers || quoteData.configuration.numberOfUsers <= 0) {
    errors.push('Number of users must be greater than 0');
  }
  
  // Warnings
  if (!quoteData.calculation.tier.features || quoteData.calculation.tier.features.length === 0) {
    warnings.push('No plan features specified');
  }
  
  if (quoteData.configuration.duration < 1) {
    warnings.push('Duration should be at least 1 month');
  }
  
  if (!quoteData.clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quoteData.clientEmail)) {
    warnings.push('Client email format may be invalid');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get processing statistics from result
 */
export function getProcessingStatistics(result: BuildMergedBlobResult): {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  totalDuration: number;
  averageStepDuration: number;
  successRate: string;
} {
  const totalSteps = result.processingSteps.length;
  const successfulSteps = result.processingSteps.filter(step => step.success).length;
  const failedSteps = totalSteps - successfulSteps;
  const totalDuration = result.totalProcessingTime;
  const averageStepDuration = totalSteps > 0 ? totalDuration / totalSteps : 0;
  const successRate = totalSteps > 0 ? ((successfulSteps / totalSteps) * 100).toFixed(1) : '0';
  
  return {
    totalSteps,
    successfulSteps,
    failedSteps,
    totalDuration,
    averageStepDuration,
    successRate: `${successRate}%`
  };
}

/**
 * Export processing results to JSON
 */
export function exportProcessingResultsToJSON(result: BuildMergedBlobResult): string {
  return JSON.stringify(result, null, 2);
}
