import { SecurityConfig, FileValidation } from '../types';

// Security configuration
export const securityConfig: SecurityConfig = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedFileTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  scanForMalware: false, // Set to true in production with proper scanning service
  validateFileHeaders: true,
  sanitizeInputs: true,
  rateLimit: {
    enabled: true,
    maxRequests: 10,
    windowMs: 60000 // 1 minute
  }
};

// File validation with security checks
export class SecurityValidator {
  private static requestCounts: Map<string, { count: number; resetTime: number }> = new Map();

  /**
   * Validate file with security checks
   */
  static validateFile(file: File, clientId?: string): FileValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check rate limiting
    if (clientId && securityConfig.rateLimit.enabled) {
      if (!this.checkRateLimit(clientId)) {
        errors.push('Rate limit exceeded. Please try again later.');
      }
    }

    // Check file existence
    if (!file) {
      errors.push('No file provided');
      return { isValid: false, errors, warnings, maxSize: securityConfig.maxFileSize, allowedTypes: securityConfig.allowedFileTypes };
    }

    // Check file size
    if (file.size === 0) {
      errors.push('File is empty');
    } else if (file.size > securityConfig.maxFileSize) {
      errors.push(`File is too large. Maximum size is ${this.formatFileSize(securityConfig.maxFileSize)}`);
    } else if (file.size > securityConfig.maxFileSize * 0.8) {
      warnings.push('File is close to size limit');
    }

    // Check file type
    if (!securityConfig.allowedFileTypes.includes(file.type)) {
      errors.push(`File type not allowed. Allowed types: ${securityConfig.allowedFileTypes.join(', ')}`);
    }

    // Check file extension
    const allowedExtensions = ['.pdf', '.docx'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!allowedExtensions.includes(fileExtension)) {
      errors.push(`File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
    }

    // Check file name
    if (file.name.length > 255) {
      errors.push('File name is too long');
    }

    // Check for suspicious file names
    const suspiciousPatterns = [
      /\.exe$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /\.scr$/i,
      /\.pif$/i,
      /\.com$/i,
      /\.vbs$/i,
      /\.js$/i,
      /\.jar$/i
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(file.name))) {
      errors.push('File type not allowed for security reasons');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      maxSize: securityConfig.maxFileSize,
      allowedTypes: securityConfig.allowedFileTypes
    };
  }

  /**
   * Check rate limiting
   */
  private static checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const clientData = this.requestCounts.get(clientId);

    if (!clientData || now > clientData.resetTime) {
      // Reset or initialize
      this.requestCounts.set(clientId, {
        count: 1,
        resetTime: now + securityConfig.rateLimit.windowMs
      });
      return true;
    }

    if (clientData.count >= securityConfig.rateLimit.maxRequests) {
      return false;
    }

    clientData.count++;
    return true;
  }

  /**
   * Validate file headers for security
   */
  static async validateFileHeaders(file: File): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!securityConfig.validateFileHeaders) {
      return { isValid: true, errors };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer.slice(0, 16)); // Read first 16 bytes

      // Check for PDF header
      if (file.type === 'application/pdf') {
        const pdfHeader = [0x25, 0x50, 0x44, 0x46]; // %PDF
        if (!uint8Array.slice(0, 4).every((byte, index) => byte === pdfHeader[index])) {
          errors.push('Invalid PDF file header');
        }
      }

      // Check for DOCX header (ZIP-based)
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const zipHeader = [0x50, 0x4B, 0x03, 0x04]; // PK..
        if (!uint8Array.slice(0, 4).every((byte, index) => byte === zipHeader[index])) {
          errors.push('Invalid DOCX file header');
        }
      }

      // Check for executable file signatures
      const executableSignatures = [
        [0x4D, 0x5A], // MZ (PE/EXE)
        [0x7F, 0x45, 0x4C, 0x46], // ELF
        [0xFE, 0xED, 0xFA, 0xCE], // Mach-O
        [0xFE, 0xED, 0xFA, 0xCF], // Mach-O
        [0xCE, 0xFA, 0xED, 0xFE], // Mach-O
        [0xCF, 0xFA, 0xED, 0xFE]  // Mach-O
      ];

      for (const signature of executableSignatures) {
        if (signature.every((byte, index) => uint8Array[index] === byte)) {
          errors.push('File appears to be an executable, which is not allowed');
          break;
        }
      }

    } catch (error) {
      errors.push('Failed to validate file headers');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize input string
   */
  static sanitizeInput(input: string): string {
    if (!securityConfig.sanitizeInputs) {
      return input;
    }

    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Sanitize file name
   */
  static sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special characters
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .substring(0, 255); // Limit length
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check if file is safe to process
   */
  static async isFileSafe(file: File, clientId?: string): Promise<{
    isSafe: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const validation = this.validateFile(file, clientId);
    const headerValidation = await this.validateFileHeaders(file);

    return {
      isSafe: validation.isValid && headerValidation.isValid,
      errors: [...validation.errors, ...headerValidation.errors],
      warnings: validation.warnings
    };
  }

  /**
   * Get security status
   */
  static getSecurityStatus(): {
    config: SecurityConfig;
    activeConnections: number;
    rateLimitStatus: { [key: string]: { count: number; resetTime: number } };
  } {
    return {
      config: securityConfig,
      activeConnections: this.requestCounts.size,
      rateLimitStatus: Object.fromEntries(this.requestCounts)
    };
  }

  /**
   * Clear rate limit data
   */
  static clearRateLimitData(): void {
    this.requestCounts.clear();
  }

  /**
   * Update security configuration
   */
  static updateSecurityConfig(newConfig: Partial<SecurityConfig>): void {
    Object.assign(securityConfig, newConfig);
    console.log('Security configuration updated:', securityConfig);
  }
}

// Export security configuration and validator
export { SecurityValidator };
export default securityConfig;
