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
import { saveAs } from 'file-saver';
import { getEffectiveDurationMonths } from './configDuration';

/**
 * Integration helper for using PDF orchestrator in React components
 */
export class PDFOrchestratorIntegration {
  private static instance: PDFOrchestratorIntegration;
  
  public static getInstance(): PDFOrchestratorIntegration {
    if (!PDFOrchestratorIntegration.instance) {
      PDFOrchestratorIntegration.instance = new PDFOrchestratorIntegration();
    }
    return PDFOrchestratorIntegration.instance;
  }
  
  /**
   * Build merged PDF from file upload and quote data
   */
  async buildMergedPDFFromFile(
    templateFile: File,
    quoteData: QuoteData,
    options: BuildMergedBlobOptions = {}
  ): Promise<BuildMergedBlobResult> {
    try {
      console.log('🔄 PDFOrchestratorIntegration: Building merged PDF from file...');
      console.log('📄 Template file:', templateFile.name, 'Size:', templateFile.size, 'bytes');
      console.log('📊 Quote data:', {
        company: quoteData.company,
        clientName: quoteData.clientName,
        totalCost: quoteData.calculation.totalCost
      });
      
      // Validate template file
      const fileValidation = this.validateTemplateFile(templateFile);
      if (!fileValidation.isValid) {
        throw new Error(fileValidation.error || 'Invalid template file');
      }
      
      // Validate quote data
      const dataValidation = validateQuoteDataForBuild(quoteData);
      if (!dataValidation.isValid) {
        throw new Error(`Invalid quote data: ${dataValidation.errors.join(', ')}`);
      }
      
      if (dataValidation.warnings.length > 0) {
        console.warn('⚠️ Quote data warnings:', dataValidation.warnings);
      }
      
      // Convert file to ArrayBuffer
      const templateBytes = await templateFile.arrayBuffer();
      
      // Build merged PDF
      const result = await buildMergedBlob(templateBytes, quoteData, options);
      
      if (result.success) {
        console.log('✅ PDFOrchestratorIntegration: Merged PDF built successfully');
        console.log(`📊 Processing steps: ${result.processingSteps.length}`);
        console.log(`⏱️ Total time: ${result.totalProcessingTime}ms`);
      } else {
        console.error('❌ PDFOrchestratorIntegration: Merged PDF build failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ PDFOrchestratorIntegration: Error building merged PDF:', error);
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
   * Build merged PDF with default options
   */
  async buildMergedPDFWithDefaults(
    templateBytes: ArrayBuffer,
    quoteData: QuoteData
  ): Promise<BuildMergedBlobResult> {
    try {
      console.log('🔄 PDFOrchestratorIntegration: Building merged PDF with defaults...');
      
      const defaultOptions = createDefaultBuildOptions();
      const result = await buildMergedBlob(templateBytes, quoteData, defaultOptions);
      
      if (result.success) {
        console.log('✅ Default build completed successfully');
      } else {
        console.error('❌ Default build failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ PDFOrchestratorIntegration: Error in default build:', error);
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
   * Build merged PDF with custom options
   */
  async buildMergedPDFWithOptions(
    templateBytes: ArrayBuffer,
    quoteData: QuoteData,
    customOptions: BuildMergedBlobOptions
  ): Promise<BuildMergedBlobResult> {
    try {
      console.log('🔄 PDFOrchestratorIntegration: Building merged PDF with custom options...');
      console.log('⚙️ Custom options:', customOptions);
      
      const result = await buildMergedBlob(templateBytes, quoteData, customOptions);
      
      if (result.success) {
        console.log('✅ Custom build completed successfully');
      } else {
        console.error('❌ Custom build failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ PDFOrchestratorIntegration: Error in custom build:', error);
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
   * Download merged PDF with automatic filename generation
   */
  downloadMergedPDF(
    pdfBlob: Blob,
    quoteData: QuoteData,
    templateFilename?: string
  ): void {
    try {
      // Generate filename based on quote data
      const timestamp = new Date().toISOString().slice(0, 10);
      const companyName = quoteData.company?.replace(/[^a-zA-Z0-9]/g, '_') || 'Company';
      const templateName = templateFilename?.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_') || 'Template';
      const filename = `Merged_${companyName}_${templateName}_${timestamp}.pdf`;
      
      saveAs(pdfBlob, filename);
      
      console.log(`✅ PDFOrchestratorIntegration: Downloaded merged PDF as "${filename}"`);
      
    } catch (error) {
      console.error('❌ PDFOrchestratorIntegration: Error downloading PDF:', error);
      throw new Error('Failed to download merged PDF');
    }
  }
  
  /**
   * Get build result summary for UI display
   */
  getBuildSummary(result: BuildMergedBlobResult): {
    success: boolean;
    summary: string;
    details: string[];
    statistics: {
      totalSteps: number;
      successfulSteps: number;
      failedSteps: number;
      totalDuration: string;
      successRate: string;
    };
    warnings: string[];
  } {
    if (!result.success) {
      return {
        success: false,
        summary: 'PDF build failed',
        details: [result.error || 'Unknown error'],
        statistics: {
          totalSteps: 0,
          successfulSteps: 0,
          failedSteps: 0,
          totalDuration: '0ms',
          successRate: '0%'
        },
        warnings: result.warnings
      };
    }
    
    const stats = getProcessingStatistics(result);
    
    const details = [
      `Total processing steps: ${stats.totalSteps}`,
      `Successful steps: ${stats.successfulSteps}`,
      `Failed steps: ${stats.failedSteps}`,
      `Success rate: ${stats.successRate}`,
      `Total duration: ${stats.totalDuration}ms`,
      `Average step duration: ${stats.averageStepDuration.toFixed(1)}ms`
    ];
    
    if (result.debugInfo) {
      details.push(`Original PDF size: ${(result.debugInfo.originalPDFSize / 1024).toFixed(2)} KB`);
      details.push(`Final PDF size: ${(result.debugInfo.finalPDFSize / 1024).toFixed(2)} KB`);
      details.push(`Form fields found: ${result.debugInfo.formFieldsFound}`);
      details.push(`Tokens replaced: ${result.debugInfo.tokensReplaced}`);
    }
    
    return {
      success: true,
      summary: `PDF build completed successfully with ${stats.successRate} success rate`,
      details,
      statistics: {
        totalSteps: stats.totalSteps,
        successfulSteps: stats.successfulSteps,
        failedSteps: stats.failedSteps,
        totalDuration: `${stats.totalDuration}ms`,
        successRate: stats.successRate
      },
      warnings: result.warnings
    };
  }
  
  /**
   * Get processing steps for UI display
   */
  getProcessingSteps(result: BuildMergedBlobResult): Array<{
    step: string;
    success: boolean;
    duration: string;
    error?: string;
    details?: any;
  }> {
    return result.processingSteps.map(step => ({
      step: step.step,
      success: step.success,
      duration: `${step.duration}ms`,
      error: step.error,
      details: step.details
    }));
  }
  
  /**
   * Validate template file
   */
  validateTemplateFile(file: File): { isValid: boolean; error?: string } {
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
   * Create build options for different use cases
   */
  createBuildOptionsForUseCase(useCase: 'preview' | 'production' | 'debug'): BuildMergedBlobOptions {
    const baseOptions = createDefaultBuildOptions();
    
    switch (useCase) {
      case 'preview':
        return {
          ...baseOptions,
          fillForms: true,
          replaceTokens: true,
          generateQuotePDF: true,
          overlayQuotePDF: false, // Skip overlay for preview
          preserveOriginal: false,
          debugMode: false,
          timeout: 15000
        };
      
      case 'production':
        return {
          ...baseOptions,
          fillForms: true,
          replaceTokens: true,
          generateQuotePDF: true,
          overlayQuotePDF: true,
          preserveOriginal: true,
          debugMode: false,
          timeout: 30000
        };
      
      case 'debug':
        return {
          ...baseOptions,
          fillForms: true,
          replaceTokens: true,
          generateQuotePDF: true,
          overlayQuotePDF: true,
          preserveOriginal: true,
          debugMode: true,
          timeout: 60000,
          overlayOptions: {
            ...baseOptions.overlayOptions,
            debugMode: true
          }
        };
      
      default:
        return baseOptions;
    }
  }
  
  /**
   * Create quote data from existing quote object
   */
  createQuoteDataFromQuote(quoteData: any): QuoteData {
    try {
      console.log('🔄 PDFOrchestratorIntegration: Creating quote data from existing quote...');
      
      const formattedQuoteData: QuoteData = {
        id: quoteData.id || `quote-001`,
        clientName: quoteData.clientName || 'N/A',
        clientEmail: quoteData.clientEmail || 'N/A',
        company: quoteData.company || 'N/A',
        configuration: {
          numberOfUsers: quoteData.configuration?.numberOfUsers || 0,
          instanceType: quoteData.configuration?.instanceType || 'Standard',
          numberOfInstances: quoteData.configuration?.numberOfInstances || 1,
          duration: getEffectiveDurationMonths(quoteData.configuration) || 1,
          migrationType: quoteData.configuration?.migrationType || 'Email',
          dataSizeGB: quoteData.configuration?.dataSizeGB || 0
        },
        calculation: {
          tier: {
            name: quoteData.calculation?.tier?.name || 'Basic',
            features: quoteData.calculation?.tier?.features || []
          },
          userCost: quoteData.calculation?.userCost || 0,
          dataCost: quoteData.calculation?.dataCost || 0,
          migrationCost: quoteData.calculation?.migrationCost || 0,
          instanceCost: quoteData.calculation?.instanceCost || 0,
          totalCost: quoteData.calculation?.totalCost || 0
        },
        selectedTier: {
          name: quoteData.selectedTier?.name || quoteData.calculation?.tier?.name || 'Basic',
          features: quoteData.selectedTier?.features || quoteData.calculation?.tier?.features || []
        },
        status: quoteData.status || 'draft',
        createdAt: quoteData.createdAt ? new Date(quoteData.createdAt) : new Date(),
        templateUsed: {
          id: quoteData.templateUsed?.id || 'default',
          name: quoteData.templateUsed?.name || 'Default Template',
          isDefault: quoteData.templateUsed?.isDefault || false
        }
      };
      
      console.log('✅ PDFOrchestratorIntegration: Quote data created successfully');
      console.log('📊 Quote data:', {
        company: formattedQuoteData.company,
        clientName: formattedQuoteData.clientName,
        totalCost: formattedQuoteData.calculation.totalCost
      });
      
      return formattedQuoteData;
      
    } catch (error) {
      console.error('❌ PDFOrchestratorIntegration: Error creating quote data:', error);
      throw new Error('Failed to create quote data from existing quote');
    }
  }
  
  /**
   * Batch build multiple PDFs
   */
  async batchBuildMergedPDFs(
    templateBytes: ArrayBuffer,
    quoteDataArray: QuoteData[],
    options: BuildMergedBlobOptions = {}
  ): Promise<Array<{ index: number; result: BuildMergedBlobResult }>> {
    try {
      console.log(`🔄 PDFOrchestratorIntegration: Batch building ${quoteDataArray.length} merged PDFs...`);
      
      const results: Array<{ index: number; result: BuildMergedBlobResult }> = [];
      
      for (let i = 0; i < quoteDataArray.length; i++) {
        console.log(`📄 Processing quote ${i + 1}/${quoteDataArray.length}...`);
        
        const result = await buildMergedBlob(templateBytes, quoteDataArray[i], options);
        results.push({ index: i, result });
        
        if (result.success) {
          console.log(`✅ Quote ${i + 1} processed successfully`);
        } else {
          console.error(`❌ Quote ${i + 1} failed:`, result.error);
        }
        
        // Small delay between iterations to prevent overwhelming the system
        if (i < quoteDataArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      const successful = results.filter(r => r.result.success).length;
      console.log(`✅ Batch build completed: ${successful}/${results.length} successful`);
      
      return results;
      
    } catch (error) {
      console.error('❌ PDFOrchestratorIntegration: Error in batch build:', error);
      return [];
    }
  }
  
  /**
   * Get batch build statistics
   */
  getBatchBuildStatistics(results: Array<{ index: number; result: BuildMergedBlobResult }>): {
    totalProcessed: number;
    successfulBuilds: number;
    failedBuilds: number;
    averageProcessingTime: number;
    totalProcessingTime: number;
    successRate: string;
  } {
    const successful = results.filter(r => r.result.success);
    const failed = results.filter(r => !r.result.success);
    
    const totalProcessingTime = results.reduce((sum, r) => sum + r.result.totalProcessingTime, 0);
    const averageProcessingTime = results.length > 0 ? totalProcessingTime / results.length : 0;
    const successRate = results.length > 0 ? ((successful.length / results.length) * 100).toFixed(1) : '0';
    
    return {
      totalProcessed: results.length,
      successfulBuilds: successful.length,
      failedBuilds: failed.length,
      averageProcessingTime,
      totalProcessingTime,
      successRate: `${successRate}%`
    };
  }
  
  /**
   * Export build results to JSON
   */
  exportBuildResultsToJSON(results: BuildMergedBlobResult[]): string {
    const exportData = results.map((result, index) => ({
      index,
      success: result.success,
      error: result.error,
      totalProcessingTime: result.totalProcessingTime,
      processingSteps: result.processingSteps.map(step => ({
        step: step.step,
        success: step.success,
        duration: step.duration,
        error: step.error
      })),
      warnings: result.warnings,
      debugInfo: result.debugInfo
    }));
    
    return JSON.stringify(exportData, null, 2);
  }
  
  /**
   * Download build results as JSON
   */
  downloadBuildResultsAsJSON(
    results: BuildMergedBlobResult[],
    filename: string = 'build_results.json'
  ): void {
    try {
      const jsonContent = this.exportBuildResultsToJSON(results);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      
      saveAs(blob, filename);
      
      console.log(`✅ Build results exported to JSON: ${filename}`);
      
    } catch (error) {
      console.error('❌ Error exporting build results to JSON:', error);
      throw new Error('Failed to export build results to JSON');
    }
  }
  
  /**
   * Preview merged PDF in new window
   */
  previewMergedPDF(pdfBlob: Blob): void {
    try {
      const url = URL.createObjectURL(pdfBlob);
      const newWindow = window.open(url, '_blank');
      
      if (newWindow) {
        // Clean up URL after a delay
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 10000);
        
        console.log('✅ PDFOrchestratorIntegration: PDF preview opened in new window');
      } else {
        console.error('❌ PDFOrchestratorIntegration: Failed to open PDF preview');
        URL.revokeObjectURL(url);
      }
      
    } catch (error) {
      console.error('❌ PDFOrchestratorIntegration: Error previewing PDF:', error);
      throw new Error('Failed to preview PDF');
    }
  }
  
  /**
   * Get supported file types
   */
  getSupportedFileTypes(): string[] {
    return ['application/pdf'];
  }
  
  /**
   * Get maximum file size
   */
  getMaxFileSize(): number {
    return 100 * 1024 * 1024; // 100MB
  }
  
  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const pdfOrchestrator = PDFOrchestratorIntegration.getInstance();

// Export utility functions for direct use
export {
  buildMergedBlob,
  createDefaultBuildOptions,
  validateQuoteDataForBuild,
  getProcessingStatistics,
  exportProcessingResultsToJSON,
  type BuildMergedBlobOptions,
  type BuildMergedBlobResult,
  type QuoteData
};
