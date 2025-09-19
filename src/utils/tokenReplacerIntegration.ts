import {
  replaceTokensInPDF,
  createSampleQuoteData,
  validatePDFForTokenReplacement,
  getTokenReplacementStatistics,
  exportTokenReplacementResults,
  QuoteData,
  TokenReplacementResult,
  TokenReplacement
} from './tokenReplacer';
import { saveAs } from 'file-saver';

/**
 * Integration helper for using token replacement in React components
 */
export class TokenReplacerIntegration {
  private static instance: TokenReplacerIntegration;
  
  public static getInstance(): TokenReplacerIntegration {
    if (!TokenReplacerIntegration.instance) {
      TokenReplacerIntegration.instance = new TokenReplacerIntegration();
    }
    return TokenReplacerIntegration.instance;
  }
  
  /**
   * Replace tokens in PDF from file upload
   */
  async replaceTokensInPDFFile(
    file: File,
    quoteData: QuoteData
  ): Promise<TokenReplacementResult> {
    try {
      console.log('🔄 TokenReplacerIntegration: Processing PDF file...');
      console.log('📄 File:', file.name, 'Size:', file.size, 'bytes');
      
      // Validate file
      const validation = validatePDFForTokenReplacement(file);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid PDF file');
      }
      
      // Convert to ArrayBuffer
      const pdfBytes = await file.arrayBuffer();
      
      // Replace tokens
      const result = await replaceTokensInPDF(pdfBytes, quoteData);
      
      if (result.success) {
        console.log('✅ TokenReplacerIntegration: Token replacement completed successfully');
        console.log(`📊 Replaced ${result.replacedCount}/${result.totalTokens} tokens`);
      } else {
        console.error('❌ TokenReplacerIntegration: Token replacement failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ TokenReplacerIntegration: Error processing PDF:', error);
      return {
        success: false,
        replacedTokens: [],
        totalTokens: 0,
        replacedCount: 0,
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
      console.log('🔄 TokenReplacerIntegration: Creating quote data from existing quote...');
      
      const formattedQuoteData: QuoteData = {
        id: quoteData.id || `quote-001`,
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
      
      console.log('✅ TokenReplacerIntegration: Quote data created successfully');
      console.log('📊 Quote data:', {
        company: formattedQuoteData.company,
        users: formattedQuoteData.configuration.numberOfUsers,
        totalCost: formattedQuoteData.calculation.totalCost
      });
      
      return formattedQuoteData;
      
    } catch (error) {
      console.error('❌ TokenReplacerIntegration: Error creating quote data:', error);
      return createSampleQuoteData();
    }
  }
  
  /**
   * Download processed PDF with automatic filename generation
   */
  downloadProcessedPDFWithName(
    pdfBlob: Blob,
    originalFilename: string,
    quoteData: QuoteData
  ): void {
    try {
      // Generate filename based on quote data
      const timestamp = new Date().toISOString().slice(0, 10);
      const companyName = quoteData.company?.replace(/[^a-zA-Z0-9]/g, '_') || 'Company';
      const filename = `${companyName}_Processed_${timestamp}.pdf`;
      
      saveAs(pdfBlob, filename);
      
      console.log(`✅ TokenReplacerIntegration: Downloaded processed PDF as "${filename}"`);
      
    } catch (error) {
      console.error('❌ TokenReplacerIntegration: Error downloading PDF:', error);
      throw new Error('Failed to download processed PDF');
    }
  }
  
  /**
   * Get token replacement summary for UI display
   */
  getTokenReplacementSummary(result: TokenReplacementResult): {
    success: boolean;
    summary: string;
    details: string[];
    statistics: {
      totalTokens: number;
      replacedTokens: number;
      failedTokens: number;
      successRate: string;
      processingTime: string;
    };
  } {
    if (!result.success) {
      return {
        success: false,
        summary: 'Token replacement failed',
        details: [result.error || 'Unknown error'],
        statistics: {
          totalTokens: 0,
          replacedTokens: 0,
          failedTokens: 0,
          successRate: '0%',
          processingTime: '0ms'
        }
      };
    }
    
    const stats = getTokenReplacementStatistics(result);
    
    const details = [
      `Total tokens found: ${result.totalTokens}`,
      `Tokens replaced: ${result.replacedCount}`,
      `Success rate: ${stats.successRate}`,
      `Processing time: ${stats.processingTime}`
    ];
    
    if (result.replacedTokens.length > 0) {
      details.push('Replaced tokens:');
      result.replacedTokens.forEach(token => {
        if (token.success) {
          details.push(`  ✅ ${token.originalToken} → ${token.replacementText}`);
        } else {
          details.push(`  ❌ ${token.originalToken} (failed: ${token.error})`);
        }
      });
    }
    
    return {
      success: true,
      summary: `Successfully replaced ${result.replacedCount} of ${result.totalTokens} tokens`,
      details,
      statistics: stats
    };
  }
  
  /**
   * Format token replacements for table display
   */
  formatTokenReplacementsForTable(replacedTokens: TokenReplacement[]): Array<{
    id: string;
    originalToken: string;
    replacementText: string;
    page: number;
    position: string;
    status: string;
    error?: string;
  }> {
    return replacedTokens.map((token, index) => ({
      id: `token-${index}`,
      originalToken: token.originalToken,
      replacementText: token.replacementText,
      page: token.position.pageIndex + 1,
      position: `(${token.position.x.toFixed(1)}, ${token.position.y.toFixed(1)})`,
      status: token.success ? 'Success' : 'Failed',
      error: token.error
    }));
  }
  
  /**
   * Validate quote data for token replacement
   */
  validateQuoteData(quoteData: QuoteData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check required fields
    if (!quoteData.company && !quoteData.clientName) {
      warnings.push('No company or client name provided');
    }
    
    if (!quoteData.configuration.numberOfUsers || quoteData.configuration.numberOfUsers <= 0) {
      warnings.push('Invalid or missing user count');
    }
    
    if (!quoteData.calculation.totalCost || quoteData.calculation.totalCost <= 0) {
      warnings.push('Invalid or missing total cost');
    }
    
    // Validate email format if provided
    if (quoteData.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quoteData.clientEmail)) {
      errors.push('Invalid email format');
    }
    
    // Validate numeric fields
    if (quoteData.configuration.numberOfUsers < 0 || !Number.isInteger(quoteData.configuration.numberOfUsers)) {
      errors.push('User count must be a positive integer');
    }
    
    if (quoteData.calculation.totalCost < 0 || typeof quoteData.calculation.totalCost !== 'number') {
      errors.push('Total cost must be a positive number');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Preview token replacement results
   */
  previewTokenReplacementResults(result: TokenReplacementResult): {
    success: boolean;
    summary: string;
    details: string[];
    statistics: {
      totalTokens: number;
      replacedTokens: number;
      failedTokens: number;
      successRate: string;
      processingTime: string;
      tokensByCategory: { [key: string]: number };
    };
  } {
    if (!result.success) {
      return {
        success: false,
        summary: 'Token replacement failed',
        details: [result.error || 'Unknown error'],
        statistics: {
          totalTokens: 0,
          replacedTokens: 0,
          failedTokens: 0,
          successRate: '0%',
          processingTime: '0ms',
          tokensByCategory: {}
        }
      };
    }
    
    const stats = getTokenReplacementStatistics(result);
    
    const details = [
      `Total tokens found: ${result.totalTokens}`,
      `Tokens replaced: ${result.replacedCount}`,
      `Failed tokens: ${stats.failedTokens}`,
      `Success rate: ${stats.successRate}`,
      `Processing time: ${stats.processingTime}`
    ];
    
    if (Object.keys(stats.tokensByCategory).length > 0) {
      details.push('Tokens by category:');
      Object.entries(stats.tokensByCategory).forEach(([category, count]) => {
        details.push(`  • ${category}: ${count} tokens`);
      });
    }
    
    return {
      success: true,
      summary: `Successfully replaced ${result.replacedCount} of ${result.totalTokens} tokens`,
      details,
      statistics: stats
    };
  }
  
  /**
   * Export token replacement results to CSV
   */
  exportTokenReplacementsToCSV(replacedTokens: TokenReplacement[]): string {
    const headers = [
      'Original Token',
      'Replacement Text',
      'Page',
      'X Position',
      'Y Position',
      'Status',
      'Error'
    ];
    
    const rows = replacedTokens.map(token => [
      token.originalToken,
      token.replacementText,
      token.position.pageIndex + 1,
      token.position.x.toFixed(2),
      token.position.y.toFixed(2),
      token.success ? 'Success' : 'Failed',
      token.error || ''
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    return csvContent;
  }
  
  /**
   * Download token replacement results as CSV
   */
  downloadTokenReplacementsAsCSV(
    replacedTokens: TokenReplacement[],
    filename: string = 'token_replacements.csv'
  ): void {
    try {
      const csvContent = this.exportTokenReplacementsToCSV(replacedTokens);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      console.log(`✅ Token replacements exported to CSV: ${filename}`);
      
    } catch (error) {
      console.error('❌ Error exporting token replacements to CSV:', error);
      throw new Error('Failed to export token replacements to CSV');
    }
  }
  
  /**
   * Get supported token patterns
   */
  getSupportedTokenPatterns(): {
    company: string[];
    users: string[];
    pricing: string[];
    contact: string[];
    date: string[];
  } {
    return {
      company: [
        'company', 'company name', 'company_name', 'companyname',
        'organisation', 'organization', 'title', 'corp', 'corporation',
        'business', 'firm', 'enterprise', 'org', 'COMPANY_NAME', '[COMPANY]'
      ],
      users: [
        'userscount', 'users_count', 'usercount', 'number_of_users',
        'numberofusers', 'seats', 'licenses', 'USERS_COUNT'
      ],
      pricing: [
        'price_data', 'price_migration', 'total price', 'totalprice',
        'total_price', 'price_instance', 'priceinstance', 'total',
        'price', 'amount', 'cost', 'TOTAL_PRICE', 'PRICE_DATA',
        'PRICE_MIGRATION', 'PRICE_INSTANCE'
      ],
      contact: [
        'client_name', 'clientname', 'client email', 'client_email',
        'email', 'e-mail', 'mail'
      ],
      date: [
        'quote_date', 'date', 'created_date', 'issue_date',
        'valid_date', 'expiry_date', 'due_date'
      ]
    };
  }
  
  /**
   * Check if a token is supported
   */
  isTokenSupported(token: string): boolean {
    const patterns = this.getSupportedTokenPatterns();
    const normalizedToken = token.toLowerCase().replace(/[{}]/g, '').trim();
    
    return Object.values(patterns).some(patternList =>
      patternList.some(pattern => 
        normalizedToken.includes(pattern.toLowerCase()) || 
        pattern.toLowerCase().includes(normalizedToken)
      )
    );
  }
}

// Export singleton instance
export const tokenReplacer = TokenReplacerIntegration.getInstance();

// Export utility functions for direct use
export {
  replaceTokensInPDF,
  createSampleQuoteData,
  validatePDFForTokenReplacement,
  getTokenReplacementStatistics,
  exportTokenReplacementResults,
  type QuoteData,
  type TokenReplacementResult,
  type TokenReplacement
};
