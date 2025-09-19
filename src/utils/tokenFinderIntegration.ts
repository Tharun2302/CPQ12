import { 
  findTokenPositions, 
  searchForTokens, 
  validatePDFBytes,
  getTokenStatistics,
  DEFAULT_TOKEN_PATTERNS,
  TokenPosition,
  TokenSearchResult,
  TokenPattern
} from './tokenFinder';

/**
 * Integration helper for using token finder in React components
 */
export class TokenFinderIntegration {
  private static instance: TokenFinderIntegration;
  
  public static getInstance(): TokenFinderIntegration {
    if (!TokenFinderIntegration.instance) {
      TokenFinderIntegration.instance = new TokenFinderIntegration();
    }
    return TokenFinderIntegration.instance;
  }
  
  /**
   * Find tokens in a PDF file (for use in file upload handlers)
   */
  async findTokensInPDFFile(
    file: File,
    customPatterns?: TokenPattern[]
  ): Promise<TokenSearchResult> {
    try {
      console.log('🔍 TokenFinderIntegration: Processing PDF file...');
      console.log('📄 File:', file.name, 'Size:', file.size, 'bytes');
      
      // Validate file type
      if (file.type !== 'application/pdf') {
        throw new Error('File must be a PDF document');
      }
      
      // Convert to ArrayBuffer
      const pdfBytes = await file.arrayBuffer();
      
      // Use custom patterns or default patterns
      const patterns = customPatterns || DEFAULT_TOKEN_PATTERNS;
      
      // Find tokens
      const result = await findTokenPositions(pdfBytes, patterns);
      
      if (result.success) {
        console.log('✅ TokenFinderIntegration: Tokens found successfully');
        console.log(`📊 Found ${result.totalTokens} tokens across ${result.totalPages} pages`);
      } else {
        console.error('❌ TokenFinderIntegration: Token search failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ TokenFinderIntegration: Error processing PDF:', error);
      return {
        success: false,
        tokens: [],
        totalPages: 0,
        totalTokens: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }
  
  /**
   * Find specific tokens in a PDF file
   */
  async findSpecificTokens(
    file: File,
    tokenPatterns: string[],
    caseSensitive: boolean = false
  ): Promise<TokenSearchResult> {
    try {
      console.log('🎯 TokenFinderIntegration: Searching for specific tokens...');
      console.log('🔍 Patterns:', tokenPatterns);
      
      if (file.type !== 'application/pdf') {
        throw new Error('File must be a PDF document');
      }
      
      const pdfBytes = await file.arrayBuffer();
      const result = await searchForTokens(pdfBytes, tokenPatterns, caseSensitive);
      
      console.log(`✅ TokenFinderIntegration: Found ${result.totalTokens} specific tokens`);
      
      return result;
      
    } catch (error) {
      console.error('❌ TokenFinderIntegration: Error in specific token search:', error);
      return {
        success: false,
        tokens: [],
        totalPages: 0,
        totalTokens: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }
  
  /**
   * Get token summary for display in UI
   */
  getTokenSummary(result: TokenSearchResult): {
    hasTokens: boolean;
    totalTokens: number;
    totalPages: number;
    processingTime: number;
    tokensByPage: { [key: number]: number };
    commonTokens: string[];
  } {
    if (!result.success || result.tokens.length === 0) {
      return {
        hasTokens: false,
        totalTokens: 0,
        totalPages: result.totalPages,
        processingTime: result.processingTime,
        tokensByPage: {},
        commonTokens: []
      };
    }
    
    // Group tokens by page
    const tokensByPage: { [key: number]: number } = {};
    const tokenCounts: { [key: string]: number } = {};
    
    result.tokens.forEach(token => {
      tokensByPage[token.pageIndex] = (tokensByPage[token.pageIndex] || 0) + 1;
      tokenCounts[token.token] = (tokenCounts[token.token] || 0) + 1;
    });
    
    // Get most common tokens
    const commonTokens = Object.entries(tokenCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([token]) => token);
    
    return {
      hasTokens: true,
      totalTokens: result.totalTokens,
      totalPages: result.totalPages,
      processingTime: result.processingTime,
      tokensByPage,
      commonTokens
    };
  }
  
  /**
   * Format tokens for display in a table
   */
  formatTokensForTable(tokens: TokenPosition[]): Array<{
    id: string;
    token: string;
    text: string;
    page: number;
    position: string;
    confidence: string;
  }> {
    return tokens.map((token, index) => ({
      id: `token-${index}`,
      token: token.token,
      text: token.text,
      page: token.pageIndex + 1,
      position: `(${token.x.toFixed(1)}, ${token.y.toFixed(1)})`,
      confidence: `${(token.confidence * 100).toFixed(1)}%`
    }));
  }
  
  /**
   * Export tokens to CSV format
   */
  exportTokensToCSV(tokens: TokenPosition[]): string {
    const headers = [
      'Token',
      'Text',
      'Page',
      'X',
      'Y',
      'Width',
      'Height',
      'Confidence',
      'Bounding Box X1',
      'Bounding Box Y1',
      'Bounding Box X2',
      'Bounding Box Y2'
    ];
    
    const rows = tokens.map(token => [
      token.token,
      token.text,
      token.pageIndex + 1,
      token.x.toFixed(2),
      token.y.toFixed(2),
      token.width.toFixed(2),
      token.height.toFixed(2),
      (token.confidence * 100).toFixed(1),
      token.boundingBox.x1.toFixed(2),
      token.boundingBox.y1.toFixed(2),
      token.boundingBox.x2.toFixed(2),
      token.boundingBox.y2.toFixed(2)
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    return csvContent;
  }
  
  /**
   * Download tokens as CSV file
   */
  downloadTokensAsCSV(tokens: TokenPosition[], filename: string = 'tokens.csv'): void {
    try {
      const csvContent = this.exportTokensToCSV(tokens);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      console.log(`✅ Tokens exported to CSV: ${filename}`);
      
    } catch (error) {
      console.error('❌ Error exporting tokens to CSV:', error);
      throw new Error('Failed to export tokens to CSV');
    }
  }
  
  /**
   * Create custom token patterns for specific use cases
   */
  createCustomPatterns(
    companyTokens?: string[],
    pricingTokens?: string[],
    instanceTokens?: string[]
  ): TokenPattern[] {
    const patterns: TokenPattern[] = [];
    
    if (companyTokens && companyTokens.length > 0) {
      patterns.push({
        name: 'Custom Company Tokens',
        category: 'company',
        patterns: companyTokens,
        caseSensitive: false
      });
    }
    
    if (pricingTokens && pricingTokens.length > 0) {
      patterns.push({
        name: 'Custom Pricing Tokens',
        category: 'pricing',
        patterns: pricingTokens,
        caseSensitive: false
      });
    }
    
    if (instanceTokens && instanceTokens.length > 0) {
      patterns.push({
        name: 'Custom Instance Tokens',
        category: 'instance',
        patterns: instanceTokens,
        caseSensitive: false
      });
    }
    
    return patterns;
  }
  
  /**
   * Validate PDF file before processing
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
}

// Export singleton instance
export const tokenFinder = TokenFinderIntegration.getInstance();

// Export utility functions for direct use
export {
  findTokenPositions,
  searchForTokens,
  validatePDFBytes,
  getTokenStatistics,
  DEFAULT_TOKEN_PATTERNS,
  type TokenPosition,
  type TokenSearchResult,
  type TokenPattern
};
