import {
  replaceTokensInPDF,
  createSampleQuoteData,
  validatePDFForTokenReplacement,
  getTokenReplacementStatistics,
  exportTokenReplacementResults,
  QuoteData,
  TokenReplacementResult
} from './tokenReplacer';
import { tokenReplacer } from './tokenReplacerIntegration';

/**
 * Test the token replacement system with a PDF file
 */
export async function testTokenReplacer(pdfFile: File): Promise<TokenReplacementResult> {
  try {
    console.log('🧪 Starting token replacement test...');
    console.log('📄 PDF file:', pdfFile.name, 'Size:', pdfFile.size, 'bytes');
    
    // Validate PDF file
    const validation = validatePDFForTokenReplacement(pdfFile);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid PDF file');
    }
    
    // Create sample quote data
    const sampleQuoteData = createSampleQuoteData();
    console.log('📊 Sample quote data:', {
      company: sampleQuoteData.company,
      users: sampleQuoteData.configuration.numberOfUsers,
      totalCost: sampleQuoteData.calculation.totalCost
    });
    
    // Replace tokens in PDF
    console.log('🔄 Replacing tokens in PDF...');
    const result = await replaceTokensInPDF(await pdfFile.arrayBuffer(), sampleQuoteData);
    
    if (result.success) {
      console.log('✅ Token replacement completed successfully!');
      console.log(`📊 Results: ${result.replacedCount}/${result.totalTokens} tokens replaced`);
      console.log(`⏱️ Processing time: ${result.processingTime}ms`);
      
      // Log detailed results
      logTokenReplacementResults(result);
      
      // Get statistics
      const stats = getTokenReplacementStatistics(result);
      console.log('📈 Token replacement statistics:', stats);
      
    } else {
      console.error('❌ Token replacement failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
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
 * Test with custom quote data
 */
export async function testCustomTokenReplacement(
  pdfFile: File,
  customQuoteData: QuoteData
): Promise<TokenReplacementResult> {
  try {
    console.log('🧪 Testing custom token replacement...');
    console.log('📊 Custom quote data:', {
      company: customQuoteData.company,
      users: customQuoteData.configuration.numberOfUsers,
      totalCost: customQuoteData.calculation.totalCost
    });
    
    // Validate PDF file
    const validation = validatePDFForTokenReplacement(pdfFile);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid PDF file');
    }
    
    // Validate quote data
    const dataValidation = tokenReplacer.validateQuoteData(customQuoteData);
    if (!dataValidation.isValid) {
      console.warn('⚠️ Quote data validation errors:', dataValidation.errors);
    }
    if (dataValidation.warnings.length > 0) {
      console.warn('⚠️ Quote data validation warnings:', dataValidation.warnings);
    }
    
    // Replace tokens
    const result = await replaceTokensInPDF(await pdfFile.arrayBuffer(), customQuoteData);
    
    if (result.success) {
      console.log('✅ Custom token replacement completed!');
      console.log(`📊 Replaced ${result.replacedCount}/${result.totalTokens} tokens`);
      logTokenReplacementResults(result);
    } else {
      console.error('❌ Custom token replacement failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Custom test failed:', error);
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
 * Test token replacement with integration helper
 */
export async function testTokenReplacerIntegration(pdfFile: File): Promise<TokenReplacementResult> {
  try {
    console.log('🧪 Testing token replacement with integration helper...');
    
    // Create sample quote data using integration helper
    const sampleQuoteData = createSampleQuoteData();
    
    // Use integration helper to replace tokens
    const result = await tokenReplacer.replaceTokensInPDFFile(pdfFile, sampleQuoteData);
    
    if (result.success) {
      console.log('✅ Integration test completed successfully!');
      
      // Get summary using integration helper
      const summary = tokenReplacer.getTokenReplacementSummary(result);
      console.log('📊 Summary:', summary.summary);
      console.log('📋 Details:', summary.details);
      
      // Get preview using integration helper
      const preview = tokenReplacer.previewTokenReplacementResults(result);
      console.log('👁️ Preview:', preview.summary);
      
    } else {
      console.error('❌ Integration test failed:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
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
 * Log detailed token replacement results
 */
function logTokenReplacementResults(result: TokenReplacementResult): void {
  console.log('\n📊 Token Replacement Results:');
  console.log('=' .repeat(60));
  
  if (!result.success) {
    console.log('❌ Token replacement failed:', result.error);
    return;
  }
  
  console.log(`📄 Total tokens found: ${result.totalTokens}`);
  console.log(`✅ Tokens replaced: ${result.replacedCount}`);
  console.log(`❌ Tokens failed: ${result.totalTokens - result.replacedCount}`);
  console.log(`📈 Success rate: ${result.totalTokens > 0 ? ((result.replacedCount / result.totalTokens) * 100).toFixed(1) : 0}%`);
  console.log(`⏱️ Processing time: ${result.processingTime}ms`);
  
  if (result.replacedTokens.length > 0) {
    console.log('\n🎯 Token Replacement Details:');
    console.log('-'.repeat(40));
    
    // Group by success/failure
    const successfulTokens = result.replacedTokens.filter(token => token.success);
    const failedTokens = result.replacedTokens.filter(token => !token.success);
    
    if (successfulTokens.length > 0) {
      console.log('\n✅ Successful Replacements:');
      successfulTokens.forEach((token, index) => {
        console.log(`${index + 1}. "${token.originalToken}" → "${token.replacementText}"`);
        console.log(`   Page: ${token.position.pageIndex + 1}, Position: (${token.position.x.toFixed(1)}, ${token.position.y.toFixed(1)})`);
        console.log('');
      });
    }
    
    if (failedTokens.length > 0) {
      console.log('\n❌ Failed Replacements:');
      failedTokens.forEach((token, index) => {
        console.log(`${index + 1}. "${token.originalToken}"`);
        console.log(`   Error: ${token.error}`);
        console.log(`   Page: ${token.position.pageIndex + 1}, Position: (${token.position.x.toFixed(1)}, ${token.position.y.toFixed(1)})`);
        console.log('');
      });
    }
  }
  
  console.log('=' .repeat(60));
}

/**
 * Performance test for token replacement
 */
export async function performanceTest(
  pdfFile: File,
  iterations: number = 3
): Promise<{
  averageTime: number;
  minTime: number;
  maxTime: number;
  results: TokenReplacementResult[];
}> {
  console.log(`🏃‍♂️ Running token replacement performance test with ${iterations} iterations...`);
  
  const results: TokenReplacementResult[] = [];
  const times: number[] = [];
  const sampleQuoteData = createSampleQuoteData();
  
  for (let i = 0; i < iterations; i++) {
    console.log(`🔄 Iteration ${i + 1}/${iterations}...`);
    
    const result = await testCustomTokenReplacement(pdfFile, sampleQuoteData);
    results.push(result);
    
    if (result.success) {
      times.push(result.processingTime);
    }
    
    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  if (times.length === 0) {
    console.log('❌ No successful iterations for performance test');
    return {
      averageTime: 0,
      minTime: 0,
      maxTime: 0,
      results
    };
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
 * Test supported token patterns
 */
export function testSupportedTokenPatterns(): {
  supported: string[];
  unsupported: string[];
  totalTested: number;
} {
  console.log('🧪 Testing supported token patterns...');
  
  const testTokens = [
    // Company tokens
    'company', 'company name', 'company_name', 'companyname',
    'organisation', 'organization', 'title', 'corp', 'corporation',
    'business', 'firm', 'enterprise', 'org', 'COMPANY_NAME', '[COMPANY]',
    
    // User tokens
    'userscount', 'users_count', 'usercount', 'number_of_users',
    'numberofusers', 'seats', 'licenses', 'USERS_COUNT',
    
    // Price tokens
    'price_data', 'price_migration', 'total price', 'totalprice',
    'total_price', 'price_instance', 'priceinstance', 'total',
    'price', 'amount', 'cost', 'TOTAL_PRICE', 'PRICE_DATA',
    'PRICE_MIGRATION', 'PRICE_INSTANCE',
    
    // Contact tokens
    'client_name', 'clientname', 'client email', 'client_email',
    'email', 'e-mail', 'mail',
    
    // Date tokens
    'quote_date', 'date', 'created_date', 'issue_date',
    'valid_date', 'expiry_date', 'due_date',
    
    // Unsupported tokens
    'unsupported_token', 'random_text', 'unknown_field'
  ];
  
  const supported: string[] = [];
  const unsupported: string[] = [];
  
  testTokens.forEach(token => {
    if (tokenReplacer.isTokenSupported(token)) {
      supported.push(token);
    } else {
      unsupported.push(token);
    }
  });
  
  console.log(`✅ Supported tokens: ${supported.length}`);
  console.log(`❌ Unsupported tokens: ${unsupported.length}`);
  console.log(`📊 Total tested: ${testTokens.length}`);
  
  if (unsupported.length > 0) {
    console.log('⚠️ Unsupported tokens:', unsupported);
  }
  
  return {
    supported,
    unsupported,
    totalTested: testTokens.length
  };
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
        Organization: {{company name}}
        Title: [COMPANY]
        
        Client Details:
        Client Name: {client_name}
        Contact: clientname
        
        Contact Information:
        Email Address: {email}
        E-mail: client_email
        
        User Information:
        Number of Users: {userscount}
        Seats: users_count
        Licenses: USERS_COUNT
        
        Pricing Details:
        Data Cost: {price_data}
        Migration Cost: {price_migration}
        Instance Cost: {price_instance}
        Total Price: {total price}
        Amount: TOTAL_PRICE
        
        Additional Information:
        Quote Date: {quote_date}
        Valid Date: date
        Plan Name: plan_name
        Migration Type: migration_type
        Instance Type: instance_type
        Duration: duration
        Data Size: data_size
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
 * Validate token replacement functionality
 */
export async function validateTokenReplacer(): Promise<boolean> {
  try {
    console.log('🔍 Validating token replacement functionality...');
    
    // Test 1: Check if pdf-lib is available
    if (typeof PDFDocument === 'undefined') {
      console.error('❌ pdf-lib is not available');
      return false;
    }
    
    // Test 2: Check if token finder is available
    try {
      const { findTokenPositions } = await import('./tokenFinder');
      if (typeof findTokenPositions !== 'function') {
        console.error('❌ findTokenPositions function is not available');
        return false;
      }
    } catch (error) {
      console.error('❌ Token finder module is not available');
      return false;
    }
    
    // Test 3: Check if token replacement map is defined
    const { TOKEN_REPLACEMENT_MAP } = await import('./tokenReplacer');
    if (!TOKEN_REPLACEMENT_MAP || Object.keys(TOKEN_REPLACEMENT_MAP).length === 0) {
      console.error('❌ Token replacement map is not defined');
      return false;
    }
    
    // Test 4: Test sample data creation
    const sampleData = createSampleQuoteData();
    if (!sampleData || typeof sampleData !== 'object') {
      console.error('❌ Sample data creation failed');
      return false;
    }
    
    // Test 5: Test supported token patterns
    const patternTest = testSupportedTokenPatterns();
    if (patternTest.supported.length === 0) {
      console.error('❌ No supported token patterns found');
      return false;
    }
    
    console.log('✅ Token replacement validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Token replacement validation failed:', error);
    return false;
  }
}
