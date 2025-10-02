import { 
  findTokenPositions, 
  searchForTokens, 
  validatePDFBytes,
  getTokenStatistics,
  exportTokensToJSON,
  DEFAULT_TOKEN_PATTERNS,
  TokenPosition,
  TokenSearchResult
} from './tokenFinder';

/**
 * Test the token finding system with a PDF file
 */
export async function testTokenFinder(pdfFile: File): Promise<TokenSearchResult> {
  try {
    console.log('🧪 Starting token finder test...');
    console.log('📄 PDF file:', pdfFile.name, 'Size:', pdfFile.size, 'bytes');
    
    // Convert file to ArrayBuffer
    const pdfBytes = await pdfFile.arrayBuffer();
    
    // Validate PDF bytes
    if (!validatePDFBytes(pdfBytes)) {
      throw new Error('Invalid PDF file');
    }
    
    // Test with default token patterns
    console.log('🔍 Testing with default token patterns...');
    const result = await findTokenPositions(pdfBytes, DEFAULT_TOKEN_PATTERNS);
    
    if (result.success) {
      console.log('✅ Token search completed successfully!');
      console.log(`📊 Results: ${result.totalTokens} tokens found across ${result.totalPages} pages`);
      console.log(`⏱️ Processing time: ${result.processingTime}ms`);
      
      // Log detailed results
      logTokenResults(result.tokens);
      
      // Get statistics
      const stats = getTokenStatistics(result.tokens);
      console.log('📈 Token statistics:', stats);
      
      // Export to JSON for debugging
      const jsonExport = exportTokensToJSON(result.tokens);
      console.log('📄 Token data (JSON):', jsonExport);
      
    } else {
      console.error('❌ Token search failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
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
 * Test with custom token patterns
 */
export async function testCustomTokenSearch(
  pdfFile: File, 
  customPatterns: string[]
): Promise<TokenSearchResult> {
  try {
    console.log('🧪 Testing custom token search...');
    console.log('🎯 Custom patterns:', customPatterns);
    
    const pdfBytes = await pdfFile.arrayBuffer();
    
    if (!validatePDFBytes(pdfBytes)) {
      throw new Error('Invalid PDF file');
    }
    
    const result = await searchForTokens(pdfBytes, customPatterns, false);
    
    if (result.success) {
      console.log('✅ Custom token search completed!');
      console.log(`📊 Found ${result.totalTokens} tokens`);
      logTokenResults(result.tokens);
    } else {
      console.error('❌ Custom token search failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Custom test failed:', error);
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
 * Log detailed token results
 */
function logTokenResults(tokens: TokenPosition[]): void {
  console.log('\n🎯 Detailed Token Results:');
  console.log('=' .repeat(50));
  
  if (tokens.length === 0) {
    console.log('No tokens found.');
    return;
  }
  
  // Group tokens by page
  const tokensByPage: { [key: number]: TokenPosition[] } = {};
  tokens.forEach(token => {
    if (!tokensByPage[token.pageIndex]) {
      tokensByPage[token.pageIndex] = [];
    }
    tokensByPage[token.pageIndex].push(token);
  });
  
  // Log tokens by page
  Object.keys(tokensByPage).forEach(pageKey => {
    const pageIndex = parseInt(pageKey);
    const pageTokens = tokensByPage[pageIndex];
    
    console.log(`\n📄 Page ${pageIndex + 1} (${pageTokens.length} tokens):`);
    console.log('-'.repeat(30));
    
    pageTokens.forEach((token, index) => {
      console.log(`${index + 1}. Token: "${token.token}"`);
      console.log(`   Text: "${token.text}"`);
      console.log(`   Position: (${token.x.toFixed(2)}, ${token.y.toFixed(2)})`);
      console.log(`   Size: ${token.width.toFixed(2)} x ${token.height.toFixed(2)}`);
      console.log(`   Confidence: ${(token.confidence * 100).toFixed(1)}%`);
      console.log(`   Bounding Box: (${token.boundingBox.x1.toFixed(2)}, ${token.boundingBox.y1.toFixed(2)}) to (${token.boundingBox.x2.toFixed(2)}, ${token.boundingBox.y2.toFixed(2)})`);
      console.log('');
    });
  });
  
  console.log('=' .repeat(50));
}

/**
 * Create a sample PDF with tokens for testing
 */
export function createSamplePDFWithTokens(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      // This would create a sample PDF with known tokens
      // For now, we'll return a simple text-based approach
      const sampleContent = `
        Professional Quote Template
        
        Company Information:
        Company Name: {company name}
        Contact: {{company name}}
        
        Pricing Details:
        Users Count: {userscount}
        Total Price: {total price}
        Data Price: {price_data}
        Migration Price: {price_migration}
        Instance Price: {price_instance}
        
        Instance Information:
        Instance Cost: {{instance cost}}
        Instance Details: {{ Instance Cost }}
        
        Additional Tokens:
        Company: [COMPANY]
        Users: USERS_COUNT
        Total: TOTAL_PRICE
      `;
      
      // Create a simple text file (in a real implementation, you'd create a proper PDF)
      const blob = new Blob([sampleContent], { type: 'text/plain' });
      resolve(blob);
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Performance test for token finding
 */
export async function performanceTest(
  pdfFile: File,
  iterations: number = 5
): Promise<{
  averageTime: number;
  minTime: number;
  maxTime: number;
  results: TokenSearchResult[];
}> {
  console.log(`🏃‍♂️ Running performance test with ${iterations} iterations...`);
  
  const results: TokenSearchResult[] = [];
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    console.log(`🔄 Iteration ${i + 1}/${iterations}...`);
    
    const result = await testTokenFinder(pdfFile);
    results.push(result);
    times.push(result.processingTime);
    
    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log('📊 Performance Test Results:');
  console.log(`⏱️ Average time: ${averageTime.toFixed(2)}ms`);
  console.log(`⚡ Min time: ${minTime}ms`);
  console.log(`🐌 Max time: ${maxTime}ms`);
  
  return {
    averageTime,
    minTime,
    maxTime,
    results
  };
}

/**
 * Validate token finder functionality
 */
export async function validateTokenFinder(): Promise<boolean> {
  try {
    console.log('🔍 Validating token finder functionality...');
    
    // Test 1: Check if pdfjs-dist is available
    if (typeof pdfjsLib === 'undefined') {
      console.error('❌ pdfjs-dist is not available');
      return false;
    }
    
    // Test 2: Check if default patterns are defined
    if (!DEFAULT_TOKEN_PATTERNS || DEFAULT_TOKEN_PATTERNS.length === 0) {
      console.error('❌ Default token patterns are not defined');
      return false;
    }
    
    // Test 3: Check pattern structure
    for (const pattern of DEFAULT_TOKEN_PATTERNS) {
      if (!pattern.name || !pattern.patterns || !pattern.category) {
        console.error('❌ Invalid pattern structure:', pattern);
        return false;
      }
    }
    
    console.log('✅ Token finder validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Token finder validation failed:', error);
    return false;
  }
}
