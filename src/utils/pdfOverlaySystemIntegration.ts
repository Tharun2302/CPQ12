import {
  PDFOverlaySystem,
  pdfOverlaySystem,
  OverlayRegion,
  OverlayOptions,
  OverlayResult
} from './pdfOverlaySystem';
import { saveAs } from 'file-saver';

/**
 * Integration helper for using PDF overlay system in React components
 */
export class PDFOverlaySystemIntegration {
  private static instance: PDFOverlaySystemIntegration;
  
  public static getInstance(): PDFOverlaySystemIntegration {
    if (!PDFOverlaySystemIntegration.instance) {
      PDFOverlaySystemIntegration.instance = new PDFOverlaySystemIntegration();
    }
    return PDFOverlaySystemIntegration.instance;
  }
  
  /**
   * Overlay quote PDF onto template PDF from file uploads
   */
  async overlayPDFsFromFiles(
    templateFile: File,
    quoteFile: File,
    options: OverlayOptions = {}
  ): Promise<OverlayResult> {
    try {
      console.log('🔄 PDFOverlaySystemIntegration: Processing PDF files...');
      console.log('📄 Template file:', templateFile.name, 'Size:', templateFile.size, 'bytes');
      console.log('📄 Quote file:', quoteFile.name, 'Size:', quoteFile.size, 'bytes');
      
      // Validate files
      const templateValidation = this.validatePDFFile(templateFile);
      if (!templateValidation.isValid) {
        throw new Error(templateValidation.error || 'Invalid template PDF file');
      }
      
      const quoteValidation = this.validatePDFFile(quoteFile);
      if (!quoteValidation.isValid) {
        throw new Error(quoteValidation.error || 'Invalid quote PDF file');
      }
      
      // Convert files to ArrayBuffers
      const templateBytes = await templateFile.arrayBuffer();
      const quoteBytes = await quoteFile.arrayBuffer();
      
      // Overlay PDFs
      const result = await pdfOverlaySystem.overlayQuotePDF(templateBytes, quoteBytes, options);
      
      if (result.success) {
        console.log('✅ PDFOverlaySystemIntegration: PDF overlay completed successfully');
        console.log(`📊 Overlay region: ${result.overlayRegion?.width}x${result.overlayRegion?.height}`);
        console.log(`📊 Scaling factor: ${result.scalingInfo?.scaleFactor.toFixed(2)}x`);
      } else {
        console.error('❌ PDFOverlaySystemIntegration: PDF overlay failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ PDFOverlaySystemIntegration: Error processing PDFs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }
  
  /**
   * Overlay quote PDF onto template PDF with automatic region detection
   */
  async overlayWithAutoDetection(
    templatePDFBytes: ArrayBuffer,
    quotePDFBytes: ArrayBuffer,
    layout: 'invoice' | 'quote' | 'proposal' | 'custom' = 'quote'
  ): Promise<OverlayResult> {
    try {
      console.log('🔄 PDFOverlaySystemIntegration: Overlaying with auto-detection...');
      
      // Create options with automatic region detection
      const options: OverlayOptions = {
        scaleToFit: true,
        maintainAspectRatio: true,
        centerInRegion: true,
        padding: 15,
        clearRegion: true,
        clearColor: { r: 1, g: 1, b: 1 },
        debugMode: false
      };
      
      // Overlay PDFs
      const result = await pdfOverlaySystem.overlayQuotePDF(templatePDFBytes, quotePDFBytes, options);
      
      if (result.success) {
        console.log('✅ Auto-detection overlay completed successfully');
        console.log(`📊 Detection method: ${result.overlayRegion?.detectionMethod}`);
        console.log(`📊 Confidence: ${result.overlayRegion?.confidence.toFixed(2)}`);
      } else {
        console.error('❌ Auto-detection overlay failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ PDFOverlaySystemIntegration: Error in auto-detection overlay:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }
  
  /**
   * Overlay with custom region coordinates
   */
  async overlayWithCustomRegion(
    templatePDFBytes: ArrayBuffer,
    quotePDFBytes: ArrayBuffer,
    customRegion: OverlayRegion,
    options: OverlayOptions = {}
  ): Promise<OverlayResult> {
    try {
      console.log('🔄 PDFOverlaySystemIntegration: Overlaying with custom region...');
      console.log('📍 Custom region:', {
        x: customRegion.x,
        y: customRegion.y,
        width: customRegion.width,
        height: customRegion.height,
        pageIndex: customRegion.pageIndex
      });
      
      // Set custom region as fallback
      const overlayOptions: OverlayOptions = {
        ...options,
        fallbackRegion: customRegion
      };
      
      // Overlay PDFs
      const result = await pdfOverlaySystem.overlayQuotePDF(templatePDFBytes, quotePDFBytes, overlayOptions);
      
      if (result.success) {
        console.log('✅ Custom region overlay completed successfully');
      } else {
        console.error('❌ Custom region overlay failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ PDFOverlaySystemIntegration: Error in custom region overlay:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }
  
  /**
   * Download processed PDF with automatic filename generation
   */
  downloadProcessedPDF(
    pdfBlob: Blob,
    templateFilename: string,
    quoteFilename: string
  ): void {
    try {
      // Generate filename based on template and quote names
      const timestamp = new Date().toISOString().slice(0, 10);
      const templateName = templateFilename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
      const quoteName = quoteFilename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Overlay_${templateName}_${quoteName}_${timestamp}.pdf`;
      
      saveAs(pdfBlob, filename);
      
      console.log(`✅ PDFOverlaySystemIntegration: Downloaded processed PDF as "${filename}"`);
      
    } catch (error) {
      console.error('❌ PDFOverlaySystemIntegration: Error downloading PDF:', error);
      throw new Error('Failed to download processed PDF');
    }
  }
  
  /**
   * Get overlay result summary for UI display
   */
  getOverlaySummary(result: OverlayResult): {
    success: boolean;
    summary: string;
    details: string[];
    statistics: {
      overlayRegion?: string;
      scalingFactor?: string;
      processingTime: string;
      pdfSize?: string;
    };
  } {
    if (!result.success) {
      return {
        success: false,
        summary: 'PDF overlay failed',
        details: [result.error || 'Unknown error'],
        statistics: {
          processingTime: '0ms'
        }
      };
    }
    
    const details = [
      `Overlay region: ${result.overlayRegion?.width.toFixed(1)}x${result.overlayRegion?.height.toFixed(1)} at (${result.overlayRegion?.x.toFixed(1)}, ${result.overlayRegion?.y.toFixed(1)})`,
      `Page: ${(result.overlayRegion?.pageIndex || 0) + 1}`,
      `Detection method: ${result.overlayRegion?.detectionMethod}`,
      `Confidence: ${(result.overlayRegion?.confidence || 0).toFixed(2)}`,
      `Scaling factor: ${result.scalingInfo?.scaleFactor.toFixed(2)}x`,
      `Processing time: ${result.processingTime}ms`
    ];
    
    if (result.processedPDF) {
      details.push(`PDF size: ${(result.processedPDF.size / 1024).toFixed(2)} KB`);
    }
    
    return {
      success: true,
      summary: `PDF overlay completed successfully with ${result.overlayRegion?.detectionMethod} detection`,
      details,
      statistics: {
        overlayRegion: result.overlayRegion ? `${result.overlayRegion.width.toFixed(1)}x${result.overlayRegion.height.toFixed(1)}` : undefined,
        scalingFactor: result.scalingInfo ? `${result.scalingInfo.scaleFactor.toFixed(2)}x` : undefined,
        processingTime: `${result.processingTime}ms`,
        pdfSize: result.processedPDF ? `${(result.processedPDF.size / 1024).toFixed(2)} KB` : undefined
      }
    };
  }
  
  /**
   * Create common overlay regions for different document types
   */
  createCommonRegions(
    pageWidth: number,
    pageHeight: number
  ): { [key: string]: OverlayRegion } {
    return {
      invoice: pdfOverlaySystem.createFallbackRegion(pageWidth, pageHeight, 'invoice'),
      quote: pdfOverlaySystem.createFallbackRegion(pageWidth, pageHeight, 'quote'),
      proposal: pdfOverlaySystem.createFallbackRegion(pageWidth, pageHeight, 'proposal'),
      custom: pdfOverlaySystem.createFallbackRegion(pageWidth, pageHeight, 'custom'),
      
      // Additional common regions
      topRight: {
        x: pageWidth * 0.6,
        y: pageHeight * 0.7,
        width: pageWidth * 0.35,
        height: pageHeight * 0.25,
        pageIndex: 0,
        confidence: 0.8,
        detectionMethod: 'manual'
      },
      bottomRight: {
        x: pageWidth * 0.6,
        y: pageHeight * 0.1,
        width: pageWidth * 0.35,
        height: pageHeight * 0.4,
        pageIndex: 0,
        confidence: 0.8,
        detectionMethod: 'manual'
      },
      center: {
        x: pageWidth * 0.25,
        y: pageHeight * 0.25,
        width: pageWidth * 0.5,
        height: pageHeight * 0.5,
        pageIndex: 0,
        confidence: 0.7,
        detectionMethod: 'manual'
      }
    };
  }
  
  /**
   * Validate PDF file
   */
  validatePDFFile(file: File): { isValid: boolean; error?: string } {
    if (!file) {
      return { isValid: false, error: 'No file provided' };
    }
    
    if (file.type !== 'application/pdf') {
      return { isValid: false, error: 'File must be a PDF document' };
    }
    
    if (file.size === 0) {
      return { isValid: false, error: 'File is empty' };
    }
    
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      return { isValid: false, error: 'File is too large (max 50MB)' };
    }
    
    return { isValid: true };
  }
  
  /**
   * Get overlay options for different use cases
   */
  getOverlayOptionsForUseCase(useCase: 'preview' | 'production' | 'debug'): OverlayOptions {
    const baseOptions: OverlayOptions = {
      scaleToFit: true,
      maintainAspectRatio: true,
      centerInRegion: true,
      clearRegion: true,
      clearColor: { r: 1, g: 1, b: 1 }
    };
    
    switch (useCase) {
      case 'preview':
        return {
          ...baseOptions,
          padding: 5,
          debugMode: false
        };
      
      case 'production':
        return {
          ...baseOptions,
          padding: 10,
          debugMode: false
        };
      
      case 'debug':
        return {
          ...baseOptions,
          padding: 15,
          debugMode: true
        };
      
      default:
        return baseOptions;
    }
  }
  
  /**
   * Analyze template PDF for overlay regions
   */
  async analyzeTemplateForRegions(templatePDFBytes: ArrayBuffer): Promise<{
    success: boolean;
    regions: OverlayRegion[];
    pageInfo: Array<{ width: number; height: number; pageIndex: number }>;
    error?: string;
  }> {
    try {
      console.log('🔍 PDFOverlaySystemIntegration: Analyzing template for regions...');
      
      // Load PDF to get page information
      const { PDFDocument } = await import('pdf-lib');
      const templatePDF = await PDFDocument.load(templatePDFBytes);
      const pages = templatePDF.getPages();
      
      const pageInfo = pages.map((page, index) => {
        const size = page.getSize();
        return {
          width: size.width,
          height: size.height,
          pageIndex: index
        };
      });
      
      // Create common regions for each page
      const regions: OverlayRegion[] = [];
      
      pageInfo.forEach(page => {
        const commonRegions = this.createCommonRegions(page.width, page.height);
        Object.values(commonRegions).forEach(region => {
          regions.push({
            ...region,
            pageIndex: page.pageIndex
          });
        });
      });
      
      console.log(`✅ Found ${regions.length} potential overlay regions across ${pages.length} pages`);
      
      return {
        success: true,
        regions,
        pageInfo
      };
      
    } catch (error) {
      console.error('❌ PDFOverlaySystemIntegration: Error analyzing template:', error);
      return {
        success: false,
        regions: [],
        pageInfo: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Batch overlay multiple quote PDFs onto a template
   */
  async batchOverlay(
    templatePDFBytes: ArrayBuffer,
    quotePDFBytesArray: ArrayBuffer[],
    options: OverlayOptions = {}
  ): Promise<Array<{ index: number; result: OverlayResult }>> {
    try {
      console.log(`🔄 PDFOverlaySystemIntegration: Batch overlaying ${quotePDFBytesArray.length} quote PDFs...`);
      
      const results: Array<{ index: number; result: OverlayResult }> = [];
      
      for (let i = 0; i < quotePDFBytesArray.length; i++) {
        console.log(`📄 Processing quote PDF ${i + 1}/${quotePDFBytesArray.length}...`);
        
        const result = await pdfOverlaySystem.overlayQuotePDF(
          templatePDFBytes,
          quotePDFBytesArray[i],
          options
        );
        
        results.push({ index: i, result });
        
        if (result.success) {
          console.log(`✅ Quote PDF ${i + 1} processed successfully`);
        } else {
          console.error(`❌ Quote PDF ${i + 1} failed:`, result.error);
        }
      }
      
      const successful = results.filter(r => r.result.success).length;
      console.log(`✅ Batch overlay completed: ${successful}/${results.length} successful`);
      
      return results;
      
    } catch (error) {
      console.error('❌ PDFOverlaySystemIntegration: Error in batch overlay:', error);
      return [];
    }
  }
  
  /**
   * Get overlay statistics
   */
  getOverlayStatistics(results: OverlayResult[]): {
    totalProcessed: number;
    successfulOverlays: number;
    failedOverlays: number;
    averageProcessingTime: number;
    averageConfidence: number;
    detectionMethods: { [key: string]: number };
  } {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    const totalConfidence = successful.reduce((sum, r) => sum + (r.overlayRegion?.confidence || 0), 0);
    
    const detectionMethods: { [key: string]: number } = {};
    successful.forEach(result => {
      const method = result.overlayRegion?.detectionMethod || 'unknown';
      detectionMethods[method] = (detectionMethods[method] || 0) + 1;
    });
    
    return {
      totalProcessed: results.length,
      successfulOverlays: successful.length,
      failedOverlays: failed.length,
      averageProcessingTime: results.length > 0 ? totalProcessingTime / results.length : 0,
      averageConfidence: successful.length > 0 ? totalConfidence / successful.length : 0,
      detectionMethods
    };
  }
  
  /**
   * Export overlay results to JSON
   */
  exportOverlayResultsToJSON(results: OverlayResult[]): string {
    const exportData = results.map((result, index) => ({
      index,
      success: result.success,
      error: result.error,
      processingTime: result.processingTime,
      overlayRegion: result.overlayRegion ? {
        x: result.overlayRegion.x,
        y: result.overlayRegion.y,
        width: result.overlayRegion.width,
        height: result.overlayRegion.height,
        pageIndex: result.overlayRegion.pageIndex,
        confidence: result.overlayRegion.confidence,
        detectionMethod: result.overlayRegion.detectionMethod
      } : null,
      scalingInfo: result.scalingInfo ? {
        originalWidth: result.scalingInfo.originalWidth,
        originalHeight: result.scalingInfo.originalHeight,
        scaledWidth: result.scalingInfo.scaledWidth,
        scaledHeight: result.scalingInfo.scaledHeight,
        scaleFactor: result.scalingInfo.scaleFactor
      } : null
    }));
    
    return JSON.stringify(exportData, null, 2);
  }
  
  /**
   * Download overlay results as JSON
   */
  downloadOverlayResultsAsJSON(
    results: OverlayResult[],
    filename: string = 'overlay_results.json'
  ): void {
    try {
      const jsonContent = this.exportOverlayResultsToJSON(results);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      
      saveAs(blob, filename);
      
      console.log(`✅ Overlay results exported to JSON: ${filename}`);
      
    } catch (error) {
      console.error('❌ Error exporting overlay results to JSON:', error);
      throw new Error('Failed to export overlay results to JSON');
    }
  }
}

// Export singleton instance
export const pdfOverlayIntegration = PDFOverlaySystemIntegration.getInstance();

// Export utility functions for direct use
export {
  pdfOverlaySystem,
  type OverlayRegion,
  type OverlayOptions,
  type OverlayResult
};
