import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker - use a more reliable CDN
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
} catch (error) {
  console.warn('⚠️ Failed to set PDF.js worker, using fallback');
  // Fallback to a known working version
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

export interface TokenPosition {
  token: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
  lineIndex: number;
  confidence: number;
  boundingBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface TokenSearchResult {
  success: boolean;
  tokens: TokenPosition[];
  totalPages: number;
  totalTokens: number;
  error?: string;
  processingTime: number;
}

export interface TokenPattern {
  name: string;
  patterns: string[];
  category: 'company' | 'pricing' | 'instance' | 'custom';
  caseSensitive?: boolean;
  exactMatch?: boolean;
}

// Predefined token patterns
export const DEFAULT_TOKEN_PATTERNS: TokenPattern[] = [
  {
    name: 'Company Tokens',
    category: 'company',
    patterns: [
      '{company name}',
      '{{company name}}',
      '{{Company Name}}', // Exact case from template
      '{{Company_Name}}', // Underscore version from template
      'company name',
      'Company Name',
      '{company}',
      '{{company}}',
      'Company',
      'COMPANY_NAME',
      '[COMPANY]'
    ],
    caseSensitive: false
  },
  {
    name: 'Pricing Tokens',
    category: 'pricing',
    patterns: [
      '{userscount}',
      '{total price}',
      '{price_data}',
      '{price_migration}',
      '{price_instance}',
      '{{userscount}}',
      '{{total price}}',
      '{{price_data}}',
      '{{price_migration}}',
      '{{price_instance}}',
      'userscount',
      'total price',
      'price_data',
      'price_migration',
      'price_instance',
      'USERS_COUNT',
      'TOTAL_PRICE',
      'PRICE_DATA',
      'PRICE_MIGRATION',
      'PRICE_INSTANCE'
    ],
    caseSensitive: false
  },
  {
    name: 'Instance Tokens',
    category: 'instance',
    patterns: [
      '{{instance cost}}',
      '{{ Instance Cost }}',
      '{instance cost}',
      '{ Instance Cost }',
      'instance cost',
      'Instance Cost',
      'INSTANCE_COST',
      '[INSTANCE_COST]',
      '{{instance}}',
      '{instance}',
      'instance'
    ],
    caseSensitive: false
  }
];

/**
 * Find token positions in PDF document
 */
export async function findTokenPositions(
  pdfBytes: ArrayBuffer,
  tokenPatterns: TokenPattern[] = DEFAULT_TOKEN_PATTERNS
): Promise<TokenSearchResult> {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Starting token search in PDF document...');
    console.log('📊 Token patterns to search:', tokenPatterns.length);
    
    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
    const totalPages = pdf.numPages;
    
    console.log(`📄 PDF loaded successfully. Pages: ${totalPages}`);
    
    const allTokens: TokenPosition[] = [];
    
    // Process each page
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      console.log(`📄 Processing page ${pageIndex + 1}/${totalPages}...`);
      
      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Get text content with positioning information
      const textContent = await page.getTextContent();
      
      // Group text items by lines
      const lines = groupTextItemsByLines(textContent.items, viewport);
      
      console.log(`📝 Found ${lines.length} text lines on page ${pageIndex + 1}`);
      
      // Search for tokens in each line
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const lineText = line.text;
        
        // Search for each token pattern
        for (const tokenPattern of tokenPatterns) {
          const foundTokens = findTokensInLine(
            line,
            lineText,
            tokenPattern,
            pageIndex,
            lineIndex
          );
          
          allTokens.push(...foundTokens);
        }
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Token search completed in ${processingTime}ms`);
    console.log(`🎯 Found ${allTokens.length} tokens across ${totalPages} pages`);
    
    return {
      success: true,
      tokens: allTokens,
      totalPages,
      totalTokens: allTokens.length,
      processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Error in token search:', error);
    
    return {
      success: false,
      tokens: [],
      totalPages: 0,
      totalTokens: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime
    };
  }
}

/**
 * Group text items by lines based on their Y coordinates
 */
function groupTextItemsByLines(
  textItems: any[],
  viewport: any
): Array<{
  text: string;
  items: any[];
  y: number;
  x: number;
  width: number;
  height: number;
  boundingBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}> {
  // Sort text items by Y coordinate (top to bottom)
  const sortedItems = textItems
    .filter(item => item.str && item.str.trim().length > 0)
    .sort((a, b) => b.transform[5] - a.transform[5]); // Y coordinate comparison
  
  const lines: Array<{
    text: string;
    items: any[];
    y: number;
    x: number;
    width: number;
    height: number;
    boundingBox: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };
  }> = [];
  
  let currentLine: any[] = [];
  let currentY = -1;
  const lineTolerance = 5; // Tolerance for grouping items into the same line
  
  for (const item of sortedItems) {
    const itemY = item.transform[5];
    
    // If this is the first item or Y coordinate is significantly different
    if (currentY === -1 || Math.abs(itemY - currentY) > lineTolerance) {
      // Process the previous line if it exists
      if (currentLine.length > 0) {
        const line = createLineFromItems(currentLine, viewport);
        lines.push(line);
      }
      
      // Start a new line
      currentLine = [item];
      currentY = itemY;
    } else {
      // Add to current line
      currentLine.push(item);
    }
  }
  
  // Process the last line
  if (currentLine.length > 0) {
    const line = createLineFromItems(currentLine, viewport);
    lines.push(line);
  }
  
  return lines;
}

/**
 * Create a line object from text items
 */
function createLineFromItems(
  items: any[],
  viewport: any
): {
  text: string;
  items: any[];
  y: number;
  x: number;
  width: number;
  height: number;
  boundingBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
} {
  // Sort items by X coordinate (left to right)
  const sortedItems = items.sort((a, b) => a.transform[4] - b.transform[4]);
  
  // Combine text
  const text = sortedItems.map(item => item.str).join(' ');
  
  // Calculate bounding box
  const x1 = Math.min(...sortedItems.map(item => item.transform[4]));
  const y1 = Math.min(...sortedItems.map(item => item.transform[5]));
  const x2 = Math.max(...sortedItems.map(item => item.transform[4] + item.width));
  const y2 = Math.max(...sortedItems.map(item => item.transform[5] + item.height));
  
  return {
    text,
    items: sortedItems,
    y: y1,
    x: x1,
    width: x2 - x1,
    height: y2 - y1,
    boundingBox: {
      x1,
      y1,
      x2,
      y2
    }
  };
}

/**
 * Find tokens in a specific line
 */
function findTokensInLine(
  line: any,
  lineText: string,
  tokenPattern: TokenPattern,
  pageIndex: number,
  lineIndex: number
): TokenPosition[] {
  const foundTokens: TokenPosition[] = [];
  
  for (const pattern of tokenPattern.patterns) {
    const searchText = tokenPattern.caseSensitive ? lineText : lineText.toLowerCase();
    const searchPattern = tokenPattern.caseSensitive ? pattern : pattern.toLowerCase();
    
    let searchIndex = 0;
    let match;
    
    // Use global regex to find all occurrences
    const regex = new RegExp(
      searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      tokenPattern.caseSensitive ? 'g' : 'gi'
    );
    
    while ((match = regex.exec(searchText)) !== null) {
      const tokenStart = match.index;
      const tokenEnd = match.index + match[0].length;
      
      // Find the corresponding text items for this token
      const tokenItems = findTextItemsForToken(
        line.items,
        tokenStart,
        tokenEnd,
        lineText
      );
      
      if (tokenItems.length > 0) {
        const tokenPosition = createTokenPosition(
          pattern,
          match[0],
          tokenItems,
          pageIndex,
          lineIndex,
          tokenPattern.category
        );
        
        foundTokens.push(tokenPosition);
        
        console.log(`🎯 Found token: "${pattern}" at page ${pageIndex + 1}, line ${lineIndex + 1}`);
        console.log(`📍 Position: (${tokenPosition.x}, ${tokenPosition.y})`);
      }
      
      // Move search index to avoid infinite loops
      searchIndex = match.index + 1;
    }
  }
  
  return foundTokens;
}

/**
 * Find text items that correspond to a specific token
 */
function findTextItemsForToken(
  items: any[],
  tokenStart: number,
  tokenEnd: number,
  lineText: string
): any[] {
  const tokenItems: any[] = [];
  let currentIndex = 0;
  
  for (const item of items) {
    const itemText = item.str;
    const itemStart = currentIndex;
    const itemEnd = currentIndex + itemText.length;
    
    // Check if this item overlaps with the token
    if (itemStart < tokenEnd && itemEnd > tokenStart) {
      tokenItems.push(item);
    }
    
    currentIndex += itemText.length + 1; // +1 for space
  }
  
  return tokenItems;
}

/**
 * Create a token position object
 */
function createTokenPosition(
  pattern: string,
  matchedText: string,
  items: any[],
  pageIndex: number,
  lineIndex: number,
  category: string
): TokenPosition {
  // Calculate bounding box from items
  const x1 = Math.min(...items.map(item => item.transform[4]));
  const y1 = Math.min(...items.map(item => item.transform[5]));
  const x2 = Math.max(...items.map(item => item.transform[4] + item.width));
  const y2 = Math.max(...items.map(item => item.transform[5] + item.height));
  
  // Calculate confidence based on exact match
  const confidence = matchedText.toLowerCase() === pattern.toLowerCase() ? 1.0 : 0.8;
  
  return {
    token: pattern,
    text: matchedText,
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    pageIndex,
    lineIndex,
    confidence,
    boundingBox: {
      x1,
      y1,
      x2,
      y2
    }
  };
}

/**
 * Search for specific token patterns in PDF
 */
export async function searchForTokens(
  pdfBytes: ArrayBuffer,
  searchPatterns: string[],
  caseSensitive: boolean = false
): Promise<TokenSearchResult> {
  const tokenPattern: TokenPattern = {
    name: 'Custom Search',
    category: 'custom',
    patterns: searchPatterns,
    caseSensitive
  };
  
  return await findTokenPositions(pdfBytes, [tokenPattern]);
}

/**
 * Get token statistics
 */
export function getTokenStatistics(tokens: TokenPosition[]): {
  totalTokens: number;
  tokensByCategory: { [key: string]: number };
  tokensByPage: { [key: number]: number };
  averageConfidence: number;
} {
  const tokensByCategory: { [key: string]: number } = {};
  const tokensByPage: { [key: number]: number } = {};
  let totalConfidence = 0;
  
  for (const token of tokens) {
    // Count by category (we'll need to add category to TokenPosition)
    const category = 'unknown'; // This would need to be passed from the search
    tokensByCategory[category] = (tokensByCategory[category] || 0) + 1;
    
    // Count by page
    tokensByPage[token.pageIndex] = (tokensByPage[token.pageIndex] || 0) + 1;
    
    // Sum confidence
    totalConfidence += token.confidence;
  }
  
  return {
    totalTokens: tokens.length,
    tokensByCategory,
    tokensByPage,
    averageConfidence: tokens.length > 0 ? totalConfidence / tokens.length : 0
  };
}

/**
 * Export tokens to JSON for debugging
 */
export function exportTokensToJSON(tokens: TokenPosition[]): string {
  return JSON.stringify(tokens, null, 2);
}

/**
 * Validate PDF bytes before processing
 */
export function validatePDFBytes(pdfBytes: ArrayBuffer): boolean {
  try {
    // Check if it's a valid PDF by looking for PDF header
    const uint8Array = new Uint8Array(pdfBytes);
    const header = String.fromCharCode(...uint8Array.slice(0, 4));
    
    if (header !== '%PDF') {
      console.error('❌ Invalid PDF header:', header);
      return false;
    }
    
    if (pdfBytes.byteLength === 0) {
      console.error('❌ PDF file is empty');
      return false;
    }
    
    console.log('✅ PDF bytes validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Error validating PDF bytes:', error);
    return false;
  }
}
