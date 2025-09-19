import PizZip from 'pizzip';

export interface TemplateDiagnosticResult {
  success: boolean;
  templateTokens: string[];
  dataTokens: string[];
  mismatchedTokens: string[];
  missingTokens: string[];
  extraTokens: string[];
  fileInfo: {
    name: string;
    size: number;
    type: string;
    isValidDocx: boolean;
  };
  documentStructure: {
    hasDocumentXml: boolean;
    hasPlaceholders: boolean;
    placeholderCount: number;
    documentPreview: string;
  };
  recommendations: string[];
}

/**
 * Comprehensive template diagnostic tool
 */
export class TemplateDiagnostic {
  
  /**
   * Diagnose template and data compatibility
   */
  static async diagnoseTemplate(
    templateFile: File,
    templateData: Record<string, any>
  ): Promise<TemplateDiagnosticResult> {
    console.log('🔍 Starting comprehensive template diagnostic...');
    
    try {
      // 1. Analyze the template file
      const fileInfo = await this.analyzeFile(templateFile);
      console.log('📄 File analysis:', fileInfo);
      
      // 2. Extract tokens from template
      const templateTokens = await this.extractTemplateTokens(templateFile);
      console.log('🏷️ Template tokens found:', templateTokens);
      
      // 3. Analyze data tokens
      const dataTokens = Object.keys(templateData);
      console.log('📊 Data tokens provided:', dataTokens);
      
      // 4. Find mismatches
      console.log('🔍 Comparing tokens:');
      console.log('  Template tokens (raw):', templateTokens);
      console.log('  Data tokens (raw):', dataTokens);
      
      const mismatchedTokens = this.findMismatches(templateTokens, dataTokens);
      const missingTokens = this.findMissingTokens(templateTokens, dataTokens);
      const extraTokens = this.findExtraTokens(templateTokens, dataTokens);
      
      console.log('🔍 Comparison results:');
      console.log('  Missing tokens:', missingTokens);
      console.log('  Mismatched tokens:', mismatchedTokens);
      console.log('  Extra tokens:', extraTokens);
      
      // 5. Analyze document structure
      const documentStructure = await this.analyzeDocumentStructure(templateFile);
      
      // 6. Generate recommendations
      const recommendations = this.generateRecommendations({
        fileInfo,
        templateTokens,
        dataTokens,
        mismatchedTokens,
        missingTokens,
        extraTokens,
        documentStructure
      });
      
      const result: TemplateDiagnosticResult = {
        success: true,
        templateTokens,
        dataTokens,
        mismatchedTokens,
        missingTokens,
        extraTokens,
        fileInfo,
        documentStructure,
        recommendations
      };
      
      console.log('✅ Diagnostic completed:', result);
      return result;
      
    } catch (error) {
      console.error('❌ Diagnostic failed:', error);
      return {
        success: false,
        templateTokens: [],
        dataTokens: [],
        mismatchedTokens: [],
        missingTokens: [],
        extraTokens: [],
        fileInfo: {
          name: templateFile.name,
          size: templateFile.size,
          type: templateFile.type,
          isValidDocx: false
        },
        documentStructure: {
          hasDocumentXml: false,
          hasPlaceholders: false,
          placeholderCount: 0,
          documentPreview: ''
        },
        recommendations: ['Template file could not be analyzed. Please check if it\'s a valid DOCX file.']
      };
    }
  }
  
  /**
   * Analyze file properties
   */
  private static async analyzeFile(file: File) {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      isValidDocx: file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  }
  
  /**
   * Extract tokens from template
   */
  private static async extractTemplateTokens(file: File): Promise<string[]> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = new PizZip(arrayBuffer);
      
      // Check if it's a valid DOCX
      if (!zip.files['word/document.xml']) {
        throw new Error('Not a valid DOCX file');
      }
      
      // Extract document content
      const documentXml = zip.files['word/document.xml'].asText();
      
      // Clean the XML content to extract only text content
      const cleanText = this.extractTextFromDocxXml(documentXml);
      
      console.log('🔍 Cleaned text from DOCX:', cleanText.substring(0, 500) + '...');
      
      // Find all tokens in the format {{token}}
      const tokenRegex = /\{\{([^}]+)\}\}/g;
      const tokens: string[] = [];
      let match;
      
      while ((match = tokenRegex.exec(cleanText)) !== null) {
        const token = match[1].trim();
        console.log('🔍 Found potential token:', token);
        
        // Filter out tokens that contain XML markup or are malformed
        if (token && !token.includes('<') && !token.includes('>') && !token.includes('/') && !tokens.includes(token)) {
          tokens.push(token);
          console.log('✅ Added valid token:', token);
        } else {
          console.log('❌ Rejected malformed token:', token);
        }
      }
      
      return tokens;
      
    } catch (error) {
      console.error('Error extracting tokens:', error);
      return [];
    }
  }

  /**
   * Extract clean text content from DOCX XML, handling split tokens
   */
  private static extractTextFromDocxXml(xmlContent: string): string {
    try {
      // First, let's try to extract text content more carefully
      // Look for text nodes specifically
      const textNodes = xmlContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
      let cleanText = '';
      
      if (textNodes) {
        // Extract text from each text node
        textNodes.forEach(node => {
          const textMatch = node.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
          if (textMatch && textMatch[1]) {
            cleanText += textMatch[1];
          }
        });
      } else {
        // Fallback: Remove XML tags but preserve text content
        cleanText = xmlContent
          .replace(/<[^>]*>/g, '') // Remove all XML tags
          .replace(/&lt;/g, '<')   // Decode HTML entities
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')    // Normalize whitespace
          .trim();
      }
      
      // Decode HTML entities
      cleanText = cleanText
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
      
      // Handle cases where tokens might be split across XML elements
      // Look for patterns like "{{token" followed by "}}" in nearby text
      const splitTokenRegex = /\{\{([^}]*?)\s*\}\}/g;
      const matches = cleanText.match(splitTokenRegex);
      
      if (matches) {
        // Reconstruct any split tokens
        matches.forEach(match => {
          const tokenContent = match.replace(/\{\{|\}\}/g, '').trim();
          if (tokenContent && !tokenContent.includes(' ')) {
            // This looks like a valid token
            cleanText = cleanText.replace(match, `{{${tokenContent}}}`);
          }
        });
      }
      
      return cleanText;
    } catch (error) {
      console.error('Error cleaning DOCX XML:', error);
      return xmlContent;
    }
  }
  
  /**
   * Find token mismatches
   */
  private static findMismatches(templateTokens: string[], dataTokens: string[]): string[] {
    const mismatches: string[] = [];
    
    templateTokens.forEach(templateToken => {
      const normalizedTemplate = templateToken.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      const hasMatch = dataTokens.some(dataToken => {
        const normalizedData = dataToken.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalizedTemplate === normalizedData;
      });
      
      if (!hasMatch) {
        mismatches.push(templateToken);
      }
    });
    
    return mismatches;
  }
  
  /**
   * Find missing tokens (in template but not in data)
   */
  private static findMissingTokens(templateTokens: string[], dataTokens: string[]): string[] {
    return templateTokens.filter(templateToken => {
      // Remove {{}} brackets from data tokens for comparison
      const normalizedDataTokens = dataTokens.map(token => 
        token.replace(/^\{\{|\}\}$/g, '')
      );
      return !normalizedDataTokens.includes(templateToken);
    });
  }
  
  /**
   * Find extra tokens (in data but not in template)
   */
  private static findExtraTokens(templateTokens: string[], dataTokens: string[]): string[] {
    return dataTokens.filter(dataToken => {
      // Remove {{}} brackets from data token for comparison
      const normalizedDataToken = dataToken.replace(/^\{\{|\}\}$/g, '');
      return !templateTokens.includes(normalizedDataToken);
    });
  }
  
  /**
   * Analyze document structure
   */
  private static async analyzeDocumentStructure(file: File) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = new PizZip(arrayBuffer);
      
      const hasDocumentXml = !!zip.files['word/document.xml'];
      let hasPlaceholders = false;
      let placeholderCount = 0;
      let documentPreview = '';
      
      if (hasDocumentXml) {
        const documentXml = zip.files['word/document.xml'].asText();
        hasPlaceholders = documentXml.includes('{{') && documentXml.includes('}}');
        
        const placeholderMatches = documentXml.match(/\{\{[^}]+\}\}/g);
        placeholderCount = placeholderMatches ? placeholderMatches.length : 0;
        
        // Get a preview of the document content (first 500 characters)
        documentPreview = documentXml.substring(0, 500);
      }
      
      return {
        hasDocumentXml,
        hasPlaceholders,
        placeholderCount,
        documentPreview
      };
      
    } catch (error) {
      console.error('Error analyzing document structure:', error);
      return {
        hasDocumentXml: false,
        hasPlaceholders: false,
        placeholderCount: 0,
        documentPreview: ''
      };
    }
  }
  
  /**
   * Generate recommendations based on analysis
   */
  private static generateRecommendations(analysis: any): string[] {
    const recommendations: string[] = [];
    
    // File validation recommendations
    if (!analysis.fileInfo.isValidDocx) {
      recommendations.push('❌ File is not a valid DOCX format. Please save your template as .docx file.');
    }
    
    if (analysis.fileInfo.size === 0) {
      recommendations.push('❌ File is empty. Please check your template file.');
    }
    
    // Document structure recommendations
    if (!analysis.documentStructure.hasDocumentXml) {
      recommendations.push('❌ Document structure is invalid. Please recreate your template.');
    }
    
    if (!analysis.documentStructure.hasPlaceholders) {
      recommendations.push('❌ No placeholders found in template. Add tokens like {{Company Name}}, {{users_count}}, etc.');
    }
    
    // Token mismatch recommendations
    if (analysis.missingTokens.length > 0) {
      recommendations.push(`❌ Missing data for tokens: ${analysis.missingTokens.join(', ')}`);
      recommendations.push('💡 Add these tokens to your template data or update your template to use available tokens.');
    }
    
    if (analysis.mismatchedTokens.length > 0) {
      recommendations.push(`❌ Token format mismatches: ${analysis.mismatchedTokens.join(', ')}`);
      recommendations.push('💡 Check token spelling and format. Use exact token names from your template.');
    }
    
    // Success recommendations
    if (analysis.missingTokens.length === 0 && analysis.mismatchedTokens.length === 0) {
      recommendations.push('✅ All tokens match! The issue might be in the DOCX processing.');
      recommendations.push('💡 Try using a simpler template format or check the docxtemplater configuration.');
    }
    
    return recommendations;
  }
  
  /**
   * Create a simple test template
   */
  static createTestTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Test Template</title>
</head>
<body>
    <h1>Test Agreement for {{Company Name}}</h1>
    <p>Client: {{clientName}}</p>
    <p>Email: {{email}}</p>
    <p>Users: {{users_count}}</p>
    <p>User Cost: {{users.cost}}</p>
    <p>Duration: {{Duration of months}} months</p>
    <p>Total Price: {{total price}}</p>
    <p>Migration Cost: {{price_migration}}</p>
    <p>Date: {{date}}</p>
</body>
</html>
    `.trim();
  }
}

export default TemplateDiagnostic;
