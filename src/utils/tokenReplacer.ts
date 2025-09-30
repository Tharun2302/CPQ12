import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import { findTokenPositions, TokenPosition, TokenSearchResult } from './tokenFinder';

export interface QuoteData {
  id: string;
  clientName: string;
  clientEmail: string;
  company: string;
  configuration: {
    numberOfUsers: number;
    instanceType: string;
    numberOfInstances: number;
    duration: number;
    migrationType: string;
    dataSizeGB: number;
  };
  calculation: {
    tier: {
      name: string;
      features: string[];
    };
    userCost: number;
    dataCost: number;
    migrationCost: number;
    instanceCost: number;
    totalCost: number;
  };
  selectedTier: {
    name: string;
    features: string[];
  };
  status: string;
  createdAt: Date;
  templateUsed: {
    id: string;
    name: string;
    isDefault: boolean;
  };
}

export interface TokenReplacement {
  originalToken: string;
  replacementText: string;
  position: TokenPosition;
  success: boolean;
  error?: string;
}

export interface TokenReplacementResult {
  success: boolean;
  replacedTokens: TokenReplacement[];
  totalTokens: number;
  replacedCount: number;
  processedPDF?: Blob;
  error?: string;
  processingTime: number;
}

// Token mapping configuration
export const TOKEN_REPLACEMENT_MAP = {
  // Company tokens
  'company': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'company name': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'company_name': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'companyname': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'Company Name': (quoteData: QuoteData) => quoteData.company || 'N/A', // Exact case for {{ Company Name }}
  'Company_Name': (quoteData: QuoteData) => quoteData.company || 'N/A', // Underscore version for {{ Company_Name }}
  'organisation': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'organization': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'title': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'corp': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'corporation': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'business': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'firm': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'enterprise': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'org': (quoteData: QuoteData) => quoteData.company || 'N/A',
  'COMPANY_NAME': (quoteData: QuoteData) => quoteData.company || 'N/A',
  '[COMPANY]': (quoteData: QuoteData) => quoteData.company || 'N/A',
  
  // User count tokens
  'userscount': (quoteData: QuoteData) => quoteData.configuration.numberOfUsers.toString(),
  'users_count': (quoteData: QuoteData) => quoteData.configuration.numberOfUsers.toString(),
  'usercount': (quoteData: QuoteData) => quoteData.configuration.numberOfUsers.toString(),
  'number_of_users': (quoteData: QuoteData) => quoteData.configuration.numberOfUsers.toString(),
  'numberofusers': (quoteData: QuoteData) => quoteData.configuration.numberOfUsers.toString(),
  'seats': (quoteData: QuoteData) => quoteData.configuration.numberOfUsers.toString(),
  'licenses': (quoteData: QuoteData) => quoteData.configuration.numberOfUsers.toString(),
  'USERS_COUNT': (quoteData: QuoteData) => quoteData.configuration.numberOfUsers.toString(),
  
  // Price tokens
  'price_data': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.dataCost),
  'price_migration': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.migrationCost),
  'total price': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.totalCost),
  'totalprice': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.totalCost),
  'total_price': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.totalCost),
  'price_instance': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.instanceCost),
  'priceinstance': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.instanceCost),
  'total': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.totalCost),
  'price': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.totalCost),
  'amount': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.totalCost),
  'cost': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.totalCost),
  'TOTAL_PRICE': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.totalCost),
  'PRICE_DATA': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.dataCost),
  'PRICE_MIGRATION': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.migrationCost),
  'PRICE_INSTANCE': (quoteData: QuoteData) => formatCurrency(quoteData.calculation.instanceCost),
  
  // Instance tokens
  'instance_users': (quoteData: QuoteData) => quoteData.configuration.numberOfInstances.toString(),
  'instanceusers': (quoteData: QuoteData) => quoteData.configuration.numberOfInstances.toString(),
  'instance_count': (quoteData: QuoteData) => quoteData.configuration.numberOfInstances.toString(),
  'instances_count': (quoteData: QuoteData) => quoteData.configuration.numberOfInstances.toString(),
  'number_of_instances': (quoteData: QuoteData) => quoteData.configuration.numberOfInstances.toString(),
  'numberofinstances': (quoteData: QuoteData) => quoteData.configuration.numberOfInstances.toString(),
  'instance_type': (quoteData: QuoteData) => quoteData.configuration.instanceType || 'N/A',
  'instancetype': (quoteData: QuoteData) => quoteData.configuration.instanceType || 'N/A',
  'INSTANCE_TYPE': (quoteData: QuoteData) => quoteData.configuration.instanceType || 'N/A',
  'instance_type_cost': (quoteData: QuoteData) => {
    const { getInstanceTypeCost, formatCurrency } = require('./pricing');
    return formatCurrency(getInstanceTypeCost(quoteData.configuration.instanceType || 'Standard'));
  },
  'INSTANCE_TYPE_COST': (quoteData: QuoteData) => {
    const { getInstanceTypeCost, formatCurrency } = require('./pricing');
    return formatCurrency(getInstanceTypeCost(quoteData.configuration.instanceType || 'Standard'));
  },
  'INSTANCE_USERS': (quoteData: QuoteData) => quoteData.configuration.numberOfInstances.toString(),
  
  // Additional tokens
  'client_name': (quoteData: QuoteData) => quoteData.clientName || 'N/A',
  'clientname': (quoteData: QuoteData) => quoteData.clientName || 'N/A',
  'client email': (quoteData: QuoteData) => quoteData.clientEmail || 'N/A',
  'client_email': (quoteData: QuoteData) => quoteData.clientEmail || 'N/A',
  'email': (quoteData: QuoteData) => quoteData.clientEmail || 'N/A',
  'quote_date': (quoteData: QuoteData) => formatDate(quoteData.createdAt),
  'date': (quoteData: QuoteData) => formatDate(quoteData.createdAt),
  'quote_id': (quoteData: QuoteData) => quoteData.id || 'N/A',
  
  // Date tokens - formatted as mm/dd/yyyy
  'Start_date': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.startDate || ''),
  'start_date': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.startDate || ''),
  'startdate': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.startDate || ''),
  'project_start_date': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.startDate || ''),
  'project_start': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.startDate || ''),
  'End_date': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.endDate || ''),
  'end_date': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.endDate || ''),
  'enddate': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.endDate || ''),
  'project_end_date': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.endDate || ''),
  'project_end': (quoteData: QuoteData) => formatDateMMDDYYYY(quoteData.configuration.endDate || ''),
  'plan_name': (quoteData: QuoteData) => quoteData.calculation.tier.name || 'N/A',
  'migration_type': (quoteData: QuoteData) => quoteData.configuration.migrationType || 'N/A',
  'instance_type': (quoteData: QuoteData) => quoteData.configuration.instanceType || 'N/A',
  'duration': (quoteData: QuoteData) => quoteData.configuration.duration.toString(),
  'data_size': (quoteData: QuoteData) => quoteData.configuration.dataSizeGB.toString(),
};

/**
 * Format currency values
 */
function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

/**
 * Format date values
 */
function formatDate(date: Date | string): string {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
}

// Date formatting helper for mm/dd/yyyy format
function formatDateMMDDYYYY(dateString: string): string {
  if (!dateString || dateString === 'N/A') return 'N/A';
  try {
    const date = new Date(dateString);
    // Convert to EST timezone (America/New_York)
    const estDateString = date.toLocaleString('en-US', { 
      timeZone: 'America/New_York' 
    });
    const estDate = new Date(estDateString);
    const month = (estDate.getMonth() + 1).toString().padStart(2, '0');
    const day = estDate.getDate().toString().padStart(2, '0');
    const year = estDate.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (error) {
    console.error('Error formatting date:', dateString, error);
    return 'N/A';
  }
}

/**
 * Replace tokens in PDF document
 */
export async function replaceTokensInPDF(
  pdfBytes: ArrayBuffer,
  quoteData: QuoteData
): Promise<TokenReplacementResult> {
  const startTime = Date.now();
  
  try {
    console.log('🔄 Starting token replacement in PDF...');
    console.log('📊 Quote data:', {
      company: quoteData.company,
      users: quoteData.configuration.numberOfUsers,
      totalCost: quoteData.calculation.totalCost
    });
    
    // Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    console.log('📄 PDF document loaded successfully');
    
    // Find tokens in the PDF
    console.log('🔍 Finding tokens in PDF...');
    const tokenSearchResult = await findTokenPositions(pdfBytes);
    
    if (!tokenSearchResult.success) {
      throw new Error(`Token search failed: ${tokenSearchResult.error}`);
    }
    
    console.log(`🎯 Found ${tokenSearchResult.totalTokens} tokens across ${tokenSearchResult.totalPages} pages`);
    
    if (tokenSearchResult.totalTokens === 0) {
      console.log('⚠️ No tokens found in PDF');
      return {
        success: true,
        replacedTokens: [],
        totalTokens: 0,
        replacedCount: 0,
        processedPDF: new Blob([await pdfDoc.save()], { type: 'application/pdf' }),
        processingTime: Date.now() - startTime
      };
    }
    
    // Process each token
    const replacedTokens: TokenReplacement[] = [];
    let replacedCount = 0;
    
    for (const token of tokenSearchResult.tokens) {
      console.log(`\n🔄 Processing token: "${token.token}" at position (${token.x}, ${token.y}) on page ${token.pageIndex + 1}`);
      
      try {
        const replacement = await replaceTokenInPDF(pdfDoc, token, quoteData);
        replacedTokens.push(replacement);
        
        if (replacement.success) {
          replacedCount++;
          console.log(`✅ Successfully replaced "${token.token}" with "${replacement.replacementText}"`);
        } else {
          console.log(`❌ Failed to replace "${token.token}": ${replacement.error}`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing token "${token.token}":`, error);
        replacedTokens.push({
          originalToken: token.token,
          replacementText: '',
          position: token,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Save the processed PDF
    console.log('💾 Saving processed PDF...');
    const pdfBytes = await pdfDoc.save();
    const processedPDF = new Blob([pdfBytes], { type: 'application/pdf' });
    
    const processingTime = Date.now() - startTime;
    
    console.log(`\n✅ Token replacement completed in ${processingTime}ms`);
    console.log(`📊 Results: ${replacedCount}/${tokenSearchResult.totalTokens} tokens replaced`);
    
    return {
      success: true,
      replacedTokens,
      totalTokens: tokenSearchResult.totalTokens,
      replacedCount,
      processedPDF,
      processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Error in token replacement:', error);
    
    return {
      success: false,
      replacedTokens: [],
      totalTokens: 0,
      replacedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime
    };
  }
}

/**
 * Replace a single token in the PDF
 */
async function replaceTokenInPDF(
  pdfDoc: PDFDocument,
  token: TokenPosition,
  quoteData: QuoteData
): Promise<TokenReplacement> {
  try {
    console.log(`  🔍 Processing token: "${token.token}"`);
    
    // Get the page
    const pages = pdfDoc.getPages();
    const page = pages[token.pageIndex];
    
    if (!page) {
      throw new Error(`Page ${token.pageIndex} not found`);
    }
    
    // Get replacement text
    const replacementText = getReplacementText(token.token, quoteData);
    
    if (!replacementText) {
      console.log(`  ⚠️ No replacement found for token: "${token.token}"`);
      return {
        originalToken: token.token,
        replacementText: '',
        position: token,
        success: false,
        error: 'No replacement text found'
      };
    }
    
    console.log(`  📝 Replacement text: "${replacementText}"`);
    
    // Draw white rectangle over the original text
    console.log(`  🎨 Drawing white rectangle over original text...`);
    page.drawRectangle({
      x: token.boundingBox.x1,
      y: token.boundingBox.y1,
      width: token.boundingBox.x2 - token.boundingBox.x1,
      height: token.boundingBox.y2 - token.boundingBox.y1,
      color: rgb(1, 1, 1), // White
      borderColor: rgb(1, 1, 1),
      borderWidth: 0
    });
    
    // Calculate font size based on token height
    const fontSize = Math.max(8, Math.min(16, token.height * 0.8));
    console.log(`  📏 Calculated font size: ${fontSize}px`);
    
    // Get font
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Calculate text position (centered in the original token area)
    const textWidth = font.widthOfTextAtSize(replacementText, fontSize);
    const textX = token.x + (token.width - textWidth) / 2;
    const textY = token.y + (token.height - fontSize) / 2;
    
    console.log(`  📍 Text position: (${textX.toFixed(2)}, ${textY.toFixed(2)})`);
    
    // Draw the replacement text
    console.log(`  ✍️ Drawing replacement text...`);
    page.drawText(replacementText, {
      x: textX,
      y: textY,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0) // Black text
    });
    
    console.log(`  ✅ Token replacement completed successfully`);
    
    return {
      originalToken: token.token,
      replacementText,
      position: token,
      success: true
    };
    
  } catch (error) {
    console.error(`  ❌ Error replacing token "${token.token}":`, error);
    return {
      originalToken: token.token,
      replacementText: '',
      position: token,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get replacement text for a token
 */
function getReplacementText(token: string, quoteData: QuoteData): string | null {
  // Normalize token for lookup
  const normalizedToken = token.toLowerCase()
    .replace(/[{}]/g, '') // Remove braces
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
  
  console.log(`    🔍 Looking up replacement for normalized token: "${normalizedToken}"`);
  
  // Check direct mapping
  if (TOKEN_REPLACEMENT_MAP[normalizedToken as keyof typeof TOKEN_REPLACEMENT_MAP]) {
    const replacement = TOKEN_REPLACEMENT_MAP[normalizedToken as keyof typeof TOKEN_REPLACEMENT_MAP](quoteData);
    console.log(`    ✅ Found direct mapping: "${normalizedToken}" → "${replacement}"`);
    return replacement;
  }
  
  // Check partial matches
  for (const [key, replacementFn] of Object.entries(TOKEN_REPLACEMENT_MAP)) {
    if (normalizedToken.includes(key) || key.includes(normalizedToken)) {
      const replacement = replacementFn(quoteData);
      console.log(`    ✅ Found partial mapping: "${normalizedToken}" → "${replacement}" (via "${key}")`);
      return replacement;
    }
  }
  
  console.log(`    ⚠️ No replacement found for token: "${normalizedToken}"`);
  return null;
}

/**
 * Create sample quote data for testing
 */
export function createSampleQuoteData(): QuoteData {
  return {
    id: 'quote-001',
    clientName: 'John Smith',
    clientEmail: 'john.smith@company.com',
    company: 'Sample Company Inc.',
    configuration: {
      numberOfUsers: 100,
      instanceType: 'Standard',
      numberOfInstances: 2,
      duration: 6,
      migrationType: 'Email',
      dataSizeGB: 50
    },
    calculation: {
      tier: {
        name: 'Professional',
        features: ['Feature 1', 'Feature 2', 'Feature 3']
      },
      userCost: 5000,
      dataCost: 1000,
      migrationCost: 3000,
      instanceCost: 2000,
      totalCost: 11000
    },
    selectedTier: {
      name: 'Professional',
      features: ['Feature 1', 'Feature 2', 'Feature 3']
    },
    status: 'draft',
    createdAt: new Date(),
    templateUsed: {
      id: 'template-001',
      name: 'Sample Template',
      isDefault: false
    }
  };
}

/**
 * Validate PDF file for token replacement
 */
export function validatePDFForTokenReplacement(file: File): { isValid: boolean; error?: string } {
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
 * Get token replacement statistics
 */
export function getTokenReplacementStatistics(result: TokenReplacementResult): {
  totalTokens: number;
  replacedTokens: number;
  failedTokens: number;
  successRate: string;
  processingTime: string;
  tokensByCategory: { [key: string]: number };
} {
  const tokensByCategory: { [key: string]: number } = {};
  let failedTokens = 0;
  
  result.replacedTokens.forEach(token => {
    if (token.success) {
      // Determine category based on token name
      const category = determineTokenCategory(token.originalToken);
      tokensByCategory[category] = (tokensByCategory[category] || 0) + 1;
    } else {
      failedTokens++;
    }
  });
  
  const successRate = result.totalTokens > 0 
    ? ((result.replacedCount / result.totalTokens) * 100).toFixed(1)
    : '0';
  
  return {
    totalTokens: result.totalTokens,
    replacedTokens: result.replacedCount,
    failedTokens,
    successRate: `${successRate}%`,
    processingTime: `${result.processingTime}ms`,
    tokensByCategory
  };
}

/**
 * Determine token category for statistics
 */
function determineTokenCategory(token: string): string {
  const normalizedToken = token.toLowerCase();
  
  if (normalizedToken.includes('company') || normalizedToken.includes('organisation')) {
    return 'Company';
  } else if (normalizedToken.includes('user') || normalizedToken.includes('seat')) {
    return 'Users';
  } else if (normalizedToken.includes('price') || normalizedToken.includes('cost') || normalizedToken.includes('total')) {
    return 'Pricing';
  } else if (normalizedToken.includes('email') || normalizedToken.includes('mail')) {
    return 'Contact';
  } else if (normalizedToken.includes('date')) {
    return 'Date';
  } else {
    return 'Other';
  }
}

/**
 * Export token replacement results to JSON
 */
export function exportTokenReplacementResults(result: TokenReplacementResult): string {
  return JSON.stringify(result, null, 2);
}
