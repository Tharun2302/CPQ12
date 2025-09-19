import {
  generateQuotePDF,
  generateQuoteId,
  createSampleQuoteData,
  validateQuoteData,
  QuoteData,
  QuotePDFOptions,
  QuotePDFResult
} from './quotePDFGenerator';
import { saveAs } from 'file-saver';

/**
 * Integration helper for using quote PDF generator in React components
 */
export class QuotePDFGeneratorIntegration {
  private static instance: QuotePDFGeneratorIntegration;
  
  public static getInstance(): QuotePDFGeneratorIntegration {
    if (!QuotePDFGeneratorIntegration.instance) {
      QuotePDFGeneratorIntegration.instance = new QuotePDFGeneratorIntegration();
    }
    return QuotePDFGeneratorIntegration.instance;
  }
  
  /**
   * Generate quote PDF with default options
   */
  async generateQuotePDFWithDefaults(quoteData: QuoteData): Promise<QuotePDFResult> {
    try {
      console.log('🔄 QuotePDFGeneratorIntegration: Generating quote PDF with defaults...');
      
      // Validate quote data
      const validation = validateQuoteData(quoteData);
      if (!validation.isValid) {
        throw new Error(`Invalid quote data: ${validation.errors.join(', ')}`);
      }
      
      // Default options
      const defaultOptions: QuotePDFOptions = {
        companyName: 'Your Company',
        companyAddress: '123 Business Street, City, State 12345',
        companyPhone: '(555) 123-4567',
        companyEmail: 'info@yourcompany.com',
        includeTerms: true,
        includeSignature: true,
        theme: 'blue'
      };
      
      // Generate PDF
      const result = await generateQuotePDF(quoteData, defaultOptions);
      
      if (result.success) {
        console.log('✅ QuotePDFGeneratorIntegration: PDF generated successfully');
        console.log(`📄 Quote ID: ${result.quoteId}`);
        console.log(`📊 PDF size: ${result.pdfBytes?.length} bytes`);
      } else {
        console.error('❌ QuotePDFGeneratorIntegration: PDF generation failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ QuotePDFGeneratorIntegration: Error generating PDF:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }
  
  /**
   * Generate quote PDF with custom options
   */
  async generateQuotePDFWithOptions(
    quoteData: QuoteData,
    options: QuotePDFOptions
  ): Promise<QuotePDFResult> {
    try {
      console.log('🔄 QuotePDFGeneratorIntegration: Generating quote PDF with custom options...');
      
      // Validate quote data
      const validation = validateQuoteData(quoteData);
      if (!validation.isValid) {
        throw new Error(`Invalid quote data: ${validation.errors.join(', ')}`);
      }
      
      // Generate PDF
      const result = await generateQuotePDF(quoteData, options);
      
      if (result.success) {
        console.log('✅ QuotePDFGeneratorIntegration: PDF generated successfully');
        console.log(`📄 Quote ID: ${result.quoteId}`);
        console.log(`📊 PDF size: ${result.pdfBytes?.length} bytes`);
      } else {
        console.error('❌ QuotePDFGeneratorIntegration: PDF generation failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ QuotePDFGeneratorIntegration: Error generating PDF:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }
  
  /**
   * Create quote data from existing quote object
   */
  createQuoteDataFromQuote(quoteData: any): QuoteData {
    try {
      console.log('🔄 QuotePDFGeneratorIntegration: Creating quote data from existing quote...');
      
      const formattedQuoteData: QuoteData = {
        id: quoteData.id || generateQuoteId(),
        clientName: quoteData.clientName || 'N/A',
        clientEmail: quoteData.clientEmail || 'N/A',
        company: quoteData.company || 'N/A',
        configuration: {
          numberOfUsers: quoteData.configuration?.numberOfUsers || 0,
          instanceType: quoteData.configuration?.instanceType || 'Standard',
          numberOfInstances: quoteData.configuration?.numberOfInstances || 1,
          duration: quoteData.configuration?.duration || 1,
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
      
      console.log('✅ QuotePDFGeneratorIntegration: Quote data created successfully');
      console.log('📊 Quote data:', {
        company: formattedQuoteData.company,
        clientName: formattedQuoteData.clientName,
        totalCost: formattedQuoteData.calculation.totalCost
      });
      
      return formattedQuoteData;
      
    } catch (error) {
      console.error('❌ QuotePDFGeneratorIntegration: Error creating quote data:', error);
      return createSampleQuoteData();
    }
  }
  
  /**
   * Download generated PDF with automatic filename generation
   */
  downloadQuotePDF(
    pdfBytes: Uint8Array,
    quoteData: QuoteData,
    quoteId?: string
  ): void {
    try {
      // Generate filename based on quote data
      const timestamp = new Date().toISOString().slice(0, 10);
      const companyName = quoteData.company?.replace(/[^a-zA-Z0-9]/g, '_') || 'Company';
      const filename = `Quote_${companyName}_${quoteId || 'Unknown'}_${timestamp}.pdf`;
      
      // Convert Uint8Array to Blob
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      
      // Download the file
      saveAs(blob, filename);
      
      console.log(`✅ QuotePDFGeneratorIntegration: Downloaded quote PDF as "${filename}"`);
      
    } catch (error) {
      console.error('❌ QuotePDFGeneratorIntegration: Error downloading PDF:', error);
      throw new Error('Failed to download quote PDF');
    }
  }
  
  /**
   * Get quote PDF summary for UI display
   */
  getQuotePDFSummary(result: QuotePDFResult): {
    success: boolean;
    summary: string;
    details: string[];
    statistics: {
      quoteId?: string;
      pdfSize: string;
      processingTime: string;
    };
  } {
    if (!result.success) {
      return {
        success: false,
        summary: 'PDF generation failed',
        details: [result.error || 'Unknown error'],
        statistics: {
          pdfSize: '0 bytes',
          processingTime: '0ms'
        }
      };
    }
    
    const pdfSize = result.pdfBytes ? `${(result.pdfBytes.length / 1024).toFixed(2)} KB` : '0 bytes';
    
    const details = [
      `Quote ID: ${result.quoteId || 'N/A'}`,
      `PDF Size: ${pdfSize}`,
      `Processing Time: ${result.processingTime}ms`,
      `Generated: ${new Date().toLocaleString()}`
    ];
    
    return {
      success: true,
      summary: `Quote PDF generated successfully with ID: ${result.quoteId}`,
      details,
      statistics: {
        quoteId: result.quoteId,
        pdfSize,
        processingTime: `${result.processingTime}ms`
      }
    };
  }
  
  /**
   * Create company options for PDF generation
   */
  createCompanyOptions(companyInfo: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    logo?: string;
  }): Partial<QuotePDFOptions> {
    return {
      companyName: companyInfo.name,
      companyAddress: companyInfo.address,
      companyPhone: companyInfo.phone,
      companyEmail: companyInfo.email,
      companyLogo: companyInfo.logo
    };
  }
  
  /**
   * Get available themes
   */
  getAvailableThemes(): Array<{ value: string; label: string; description: string }> {
    return [
      {
        value: 'blue',
        label: 'Blue Theme',
        description: 'Professional blue color scheme'
      },
      {
        value: 'green',
        label: 'Green Theme',
        description: 'Fresh green color scheme'
      },
      {
        value: 'purple',
        label: 'Purple Theme',
        description: 'Creative purple color scheme'
      },
      {
        value: 'gray',
        label: 'Gray Theme',
        description: 'Neutral gray color scheme'
      }
    ];
  }
  
  /**
   * Validate quote data with detailed feedback
   */
  validateQuoteDataWithFeedback(quoteData: QuoteData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  } {
    const validation = validateQuoteData(quoteData);
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Additional validation checks
    if (!quoteData.clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quoteData.clientEmail)) {
      warnings.push('Client email format may be invalid');
    }
    
    if (quoteData.calculation.totalCost < 100) {
      suggestions.push('Consider adding more detailed cost breakdown');
    }
    
    if (!quoteData.calculation.tier.features || quoteData.calculation.tier.features.length === 0) {
      suggestions.push('Consider adding plan features for better clarity');
    }
    
    if (quoteData.configuration.duration < 1) {
      warnings.push('Duration should be at least 1 month');
    }
    
    return {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings,
      suggestions
    };
  }
  
  /**
   * Generate multiple quote PDFs with different themes
   */
  async generateMultipleQuotePDFs(
    quoteData: QuoteData,
    baseOptions: QuotePDFOptions = {}
  ): Promise<Array<{ theme: string; result: QuotePDFResult }>> {
    try {
      console.log('🔄 QuotePDFGeneratorIntegration: Generating multiple quote PDFs...');
      
      const themes = ['blue', 'green', 'purple', 'gray'];
      const results: Array<{ theme: string; result: QuotePDFResult }> = [];
      
      for (const theme of themes) {
        console.log(`🎨 Generating PDF with ${theme} theme...`);
        
        const options: QuotePDFOptions = {
          ...baseOptions,
          theme: theme as any
        };
        
        const result = await generateQuotePDF(quoteData, options);
        results.push({ theme, result });
        
        if (result.success) {
          console.log(`✅ ${theme} theme PDF generated successfully`);
        } else {
          console.error(`❌ ${theme} theme PDF generation failed:`, result.error);
        }
      }
      
      console.log(`✅ Generated ${results.length} quote PDFs with different themes`);
      
      return results;
      
    } catch (error) {
      console.error('❌ QuotePDFGeneratorIntegration: Error generating multiple PDFs:', error);
      return [];
    }
  }
  
  /**
   * Export quote data to JSON for backup
   */
  exportQuoteDataToJSON(quoteData: QuoteData): string {
    return JSON.stringify(quoteData, null, 2);
  }
  
  /**
   * Download quote data as JSON file
   */
  downloadQuoteDataAsJSON(quoteData: QuoteData, filename?: string): void {
    try {
      const jsonContent = this.exportQuoteDataToJSON(quoteData);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      
      const defaultFilename = `Quote_${quoteData.company?.replace(/[^a-zA-Z0-9]/g, '_')}_${quoteData.id}_${new Date().toISOString().slice(0, 10)}.json`;
      
      saveAs(blob, filename || defaultFilename);
      
      console.log(`✅ Quote data exported to JSON: ${filename || defaultFilename}`);
      
    } catch (error) {
      console.error('❌ Error exporting quote data to JSON:', error);
      throw new Error('Failed to export quote data to JSON');
    }
  }
  
  /**
   * Get quote PDF generation statistics
   */
  getQuotePDFStatistics(results: QuotePDFResult[]): {
    totalGenerated: number;
    successfulGenerations: number;
    failedGenerations: number;
    averageProcessingTime: number;
    totalPDFSize: number;
  } {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    const totalPDFSize = successful.reduce((sum, r) => sum + (r.pdfBytes?.length || 0), 0);
    
    return {
      totalGenerated: results.length,
      successfulGenerations: successful.length,
      failedGenerations: failed.length,
      averageProcessingTime: results.length > 0 ? totalProcessingTime / results.length : 0,
      totalPDFSize
    };
  }
}

// Export singleton instance
export const quotePDFGenerator = QuotePDFGeneratorIntegration.getInstance();

// Export utility functions for direct use
export {
  generateQuotePDF,
  generateQuoteId,
  createSampleQuoteData,
  validateQuoteData,
  type QuoteData,
  type QuotePDFOptions,
  type QuotePDFResult
};
