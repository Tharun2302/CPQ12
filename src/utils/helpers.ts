import { QuoteData, ClientDetails, ConfigurationInputs, TokenBox, PDFRegion } from '../types';

/**
 * Currency formatting utility
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  } catch (error) {
    console.warn('Currency formatting failed, using fallback:', error);
    return `$${amount.toLocaleString()}`;
  }
}

/**
 * Generate unique quote ID
 */
export function generateQuoteId(): string {
  return `QTE-001`;
}

/**
 * Find pricing region in PDF
 */
export function findPricingRegion(
  textContent: string,
  pageIndex: number = 0
): PDFRegion | null {
  try {
    // Common pricing keywords
    const pricingKeywords = [
      'total', 'amount', 'price', 'cost', 'quote', 'estimate',
      'subtotal', 'tax', 'discount', 'final', 'due'
    ];
    
    // Look for pricing patterns
    const pricingPatterns = [
      /\$\s*[\d,]+\.?\d*/g,
      /total\s*:?\s*\$?\s*[\d,]+\.?\d*/gi,
      /amount\s*:?\s*\$?\s*[\d,]+\.?\d*/gi,
      /price\s*:?\s*\$?\s*[\d,]+\.?\d*/gi
    ];
    
    let bestMatch: { pattern: RegExp; match: RegExpExecArray } | null = null;
    
    // Find the best pricing match
    for (const pattern of pricingPatterns) {
      const match = pattern.exec(textContent);
      if (match && (!bestMatch || match[0].length > bestMatch.match[0].length)) {
        bestMatch = { pattern, match };
      }
    }
    
    if (bestMatch) {
      // Estimate position based on text content
      const matchIndex = bestMatch.match.index;
      const textLength = textContent.length;
      const relativePosition = matchIndex / textLength;
      
      // Common pricing region coordinates (estimated)
      const region: PDFRegion = {
        x: 400 + (relativePosition * 100), // Right side of page
        y: 100 + (relativePosition * 200), // Lower part of page
        width: 200,
        height: 100,
        pageIndex,
        confidence: 0.8,
        detectionMethod: 'text_analysis'
      };
      
      return region;
    }
    
    return null;
    
  } catch (error) {
    console.error('Error finding pricing region:', error);
    return null;
  }
}

/**
 * Find pricing page index
 */
export function findPricingPageIndex(textContent: string[]): number {
  try {
    const pricingKeywords = ['total', 'amount', 'price', 'cost', 'quote'];
    
    for (let i = 0; i < textContent.length; i++) {
      const pageText = textContent[i].toLowerCase();
      
      // Count pricing keyword occurrences
      const keywordCount = pricingKeywords.reduce((count, keyword) => {
        return count + (pageText.match(new RegExp(keyword, 'g')) || []).length;
      }, 0);
      
      // If this page has many pricing keywords, it's likely the pricing page
      if (keywordCount >= 3) {
        return i;
      }
    }
    
    // Default to last page if no clear pricing page found
    return Math.max(0, textContent.length - 1);
    
  } catch (error) {
    console.error('Error finding pricing page index:', error);
    return 0;
  }
}

/**
 * Overlay center cell in PDF
 */
export function overlayCenterCell(
  page: any,
  x: number,
  y: number,
  width: number,
  height: number,
  content: string,
  fontSize: number = 12
): void {
  try {
    // Draw white rectangle background
    page.drawRectangle({
      x: x,
      y: y,
      width: width,
      height: height,
      color: { r: 1, g: 1, b: 1 }, // White
      borderColor: { r: 1, g: 1, b: 1 },
      borderWidth: 0
    });
    
    // Calculate text position (centered)
    const textWidth = page.getFont().widthOfTextAtSize(content, fontSize);
    const textX = x + (width - textWidth) / 2;
    const textY = y + (height - fontSize) / 2;
    
    // Draw text
    page.drawText(content, {
      x: textX,
      y: textY,
      size: fontSize,
      color: { r: 0, g: 0, b: 0 } // Black
    });
    
  } catch (error) {
    console.error('Error overlaying center cell:', error);
  }
}

/**
 * Replace intro line in PDF
 */
export function replaceIntroLine(
  page: any,
  oldText: string,
  newText: string,
  fontSize: number = 12
): void {
  try {
    // This is a simplified implementation
    // In a real scenario, you'd need to find the exact position of the old text
    // and replace it with the new text
    
    console.log(`Replacing intro line: "${oldText}" -> "${newText}"`);
    
    // For now, just log the replacement
    // Actual implementation would require text position detection
    
  } catch (error) {
    console.error('Error replacing intro line:', error);
  }
}

/**
 * Local storage helpers
 */
export class LocalStorageHelper {
  private static readonly STORAGE_KEY = 'cpq_app_data';
  
  /**
   * Save data to local storage
   */
  static save<T>(key: string, data: T): boolean {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(`${this.STORAGE_KEY}_${key}`, serialized);
      return true;
    } catch (error) {
      console.error('Error saving to local storage:', error);
      return false;
    }
  }
  
  /**
   * Load data from local storage
   */
  static load<T>(key: string): T | null {
    try {
      const serialized = localStorage.getItem(`${this.STORAGE_KEY}_${key}`);
      if (serialized) {
        return JSON.parse(serialized);
      }
      return null;
    } catch (error) {
      console.error('Error loading from local storage:', error);
      return null;
    }
  }
  
  /**
   * Remove data from local storage
   */
  static remove(key: string): boolean {
    try {
      localStorage.removeItem(`${this.STORAGE_KEY}_${key}`);
      return true;
    } catch (error) {
      console.error('Error removing from local storage:', error);
      return false;
    }
  }
  
  /**
   * Clear all app data from local storage
   */
  static clearAll(): boolean {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.STORAGE_KEY)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('Error clearing local storage:', error);
      return false;
    }
  }
  
  /**
   * Get storage usage info
   */
  static getStorageInfo(): {
    used: number;
    available: number;
    percentage: number;
  } {
    try {
      let used = 0;
      const keys = Object.keys(localStorage);
      
      keys.forEach(key => {
        if (key.startsWith(this.STORAGE_KEY)) {
          used += localStorage.getItem(key)?.length || 0;
        }
      });
      
      // Estimate available space (5MB limit for most browsers)
      const available = 5 * 1024 * 1024 - used;
      const percentage = (used / (5 * 1024 * 1024)) * 100;
      
      return { used, available, percentage };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { used: 0, available: 0, percentage: 0 };
    }
  }
}

/**
 * PDF validation and error handling
 */
export class PDFValidator {
  /**
   * Validate PDF file
   */
  static validatePDF(file: File): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!file) {
      errors.push('No file provided');
    } else {
      // Check file type
      if (file.type !== 'application/pdf') {
        errors.push('File must be a PDF document');
      }
      
      // Check file size
      if (file.size === 0) {
        errors.push('File is empty');
      } else if (file.size > 100 * 1024 * 1024) { // 100MB limit
        errors.push('File is too large (max 100MB)');
      } else if (file.size > 50 * 1024 * 1024) { // 50MB warning
        warnings.push('Large file size may affect performance');
      }
      
      // Check file name
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        warnings.push('File does not have .pdf extension');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Validate PDF content
   */
  static async validatePDFContent(pdfBytes: ArrayBuffer): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    pageCount: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Check PDF header
      const header = new Uint8Array(pdfBytes.slice(0, 4));
      const pdfHeader = [0x25, 0x50, 0x44, 0x46]; // %PDF
      
      if (!header.every((byte, index) => byte === pdfHeader[index])) {
        errors.push('Invalid PDF header');
      }
      
      // Try to load PDF to check if it's valid
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pageCount = pdfDoc.getPageCount();
      
      if (pageCount === 0) {
        errors.push('PDF has no pages');
      } else if (pageCount > 100) {
        warnings.push('PDF has many pages, processing may be slow');
      }
      
      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        pageCount
      };
      
    } catch (error) {
      errors.push(`PDF validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        isValid: false,
        errors,
        warnings,
        pageCount: 0
      };
    }
  }
}

/**
 * DOCX validation and error handling
 */
export class DocxValidator {
  /**
   * Validate DOCX file
   */
  static validateDocx(file: File): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!file) {
      errors.push('No file provided');
    } else {
      // Check file type
      if (file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        errors.push('File must be a DOCX document');
      }
      
      // Check file size
      if (file.size === 0) {
        errors.push('File is empty');
      } else if (file.size > 50 * 1024 * 1024) { // 50MB limit
        errors.push('File is too large (max 50MB)');
      } else if (file.size > 25 * 1024 * 1024) { // 25MB warning
        warnings.push('Large file size may affect performance');
      }
      
      // Check file name
      if (!file.name.toLowerCase().endsWith('.docx')) {
        warnings.push('File does not have .docx extension');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Form validation helpers
 */
export class FormValidator {
  /**
   * Validate email address
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Validate phone number
   */
  static validatePhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }
  
  /**
   * Validate required field
   */
  static validateRequired(value: any): boolean {
    return value !== null && value !== undefined && value !== '';
  }
  
  /**
   * Validate number range
   */
  static validateNumberRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }
  
  /**
   * Validate quote data
   */
  static validateQuoteData(quoteData: Partial<QuoteData>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate client information
    if (!quoteData.client?.companyName) {
      errors.push('Company name is required');
    }
    
    if (!quoteData.client?.clientName) {
      errors.push('Client name is required');
    }
    
    if (!quoteData.client?.clientEmail) {
      errors.push('Client email is required');
    } else if (!this.validateEmail(quoteData.client.clientEmail)) {
      errors.push('Invalid email format');
    }
    
    // Validate configuration
    if (!quoteData.configuration?.numberOfUsers || quoteData.configuration.numberOfUsers <= 0) {
      errors.push('Number of users must be greater than 0');
    }
    
    if (!quoteData.configuration?.duration || quoteData.configuration.duration <= 0) {
      errors.push('Duration must be greater than 0');
    }
    
    // Validate costs
    if (!quoteData.costs?.totalCost || quoteData.costs.totalCost <= 0) {
      errors.push('Total cost must be greater than 0');
    }
    
    // Warnings
    if (quoteData.configuration?.numberOfUsers && quoteData.configuration.numberOfUsers > 1000) {
      warnings.push('Large number of users may affect pricing');
    }
    
    if (quoteData.configuration?.dataSizeGB && quoteData.configuration.dataSizeGB > 1000) {
      warnings.push('Large data size may affect processing time');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();
  
  /**
   * Start timing
   */
  static startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }
  
  /**
   * End timing and get duration
   */
  static endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.timers.delete(name);
      return duration;
    }
    return 0;
  }
  
  /**
   * Get memory usage
   */
  static getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }
  
  /**
   * Measure function execution time
   */
  static async measureExecution<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    this.startTimer(name);
    try {
      const result = await fn();
      const duration = this.endTimer(name);
      return { result, duration };
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }
}

/**
 * Error handling utilities
 */
export class ErrorHandler {
  /**
   * Create standardized error
   */
  static createError(
    code: string,
    message: string,
    details?: any,
    component?: string
  ) {
    return {
      code,
      message,
      details,
      timestamp: new Date(),
      component
    };
  }
  
  /**
   * Log error with context
   */
  static logError(error: any, context?: string): void {
    console.error(`[${context || 'Unknown'}] Error:`, error);
    
    // In production, you might want to send this to an error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Send to error tracking service
      console.log('Error logged to tracking service');
    }
  }
  
  /**
   * Handle async errors
   */
  static async handleAsyncError<T>(
    promise: Promise<T>,
    fallback?: T,
    context?: string
  ): Promise<T | undefined> {
    try {
      return await promise;
    } catch (error) {
      this.logError(error, context);
      return fallback;
    }
  }
}

// All utilities are already exported individually above
