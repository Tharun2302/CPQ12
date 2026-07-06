import jsPDF from 'jspdf';

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

export interface QuotePDFOptions {
  companyName?: string;
  companyLogo?: string; // Base64 encoded logo
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  includeTerms?: boolean;
  includeSignature?: boolean;
  theme?: 'blue' | 'green' | 'purple' | 'gray';
}

export interface QuotePDFResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  quoteId?: string;
  error?: string;
  processingTime: number;
}

/**
 * Generate a unique quote ID
 */
export function generateQuoteId(): string {
  const timestamp = Date.now().toString();
  const random1 = Math.random().toString(36).substring(2, 7).toUpperCase();
  const random2 = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `QTE-${random1}-${random2}`;
}

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
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York'
  });
}

/**
 * Get theme colors
 */
function getThemeColors(theme: string = 'blue') {
  const themes = {
    blue: {
      primary: '#2563eb',
      secondary: '#1e40af',
      accent: '#3b82f6',
      light: '#dbeafe',
      text: '#1e293b'
    },
    green: {
      primary: '#059669',
      secondary: '#047857',
      accent: '#10b981',
      light: '#d1fae5',
      text: '#064e3b'
    },
    purple: {
      primary: '#7c3aed',
      secondary: '#6d28d9',
      accent: '#8b5cf6',
      light: '#ede9fe',
      text: '#581c87'
    },
    gray: {
      primary: '#374151',
      secondary: '#1f2937',
      accent: '#6b7280',
      light: '#f3f4f6',
      text: '#111827'
    }
  };
  
  return themes[theme as keyof typeof themes] || themes.blue;
}

/**
 * Generate quote PDF
 */
export async function generateQuotePDF(
  quoteData: QuoteData,
  options: QuotePDFOptions = {}
): Promise<QuotePDFResult> {
  const startTime = Date.now();
  
  try {
    console.log('🔄 Starting quote PDF generation...');
    console.log('📊 Quote data:', {
      company: quoteData.company,
      clientName: quoteData.clientName,
      totalCost: quoteData.calculation.totalCost
    });
    
    // Generate unique quote ID
    const quoteId = generateQuoteId();
    console.log(`🆔 Generated quote ID: ${quoteId}`);
    
    // Create PDF document
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Get theme colors
    const colors = getThemeColors(options.theme);
    
    console.log('🎨 Setting up PDF layout...');
    
    // Set up fonts and colors
    doc.setFont('helvetica');
    doc.setTextColor(colors.text);
    
    // Generate PDF content
    await generatePDFContent(doc, quoteData, quoteId, options, colors, pageWidth, pageHeight);
    
    // Get PDF bytes
    const pdfBytes = doc.output('arraybuffer');
    
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Quote PDF generated successfully in ${processingTime}ms`);
    console.log(`📄 PDF size: ${pdfBytes.byteLength} bytes`);
    
    return {
      success: true,
      pdfBytes: new Uint8Array(pdfBytes),
      quoteId,
      processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Error generating quote PDF:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime
    };
  }
}

/**
 * Generate PDF content
 */
async function generatePDFContent(
  doc: jsPDF,
  quoteData: QuoteData,
  quoteId: string,
  options: QuotePDFOptions,
  colors: any,
  pageWidth: number,
  pageHeight: number
): Promise<void> {
  let currentY = 20;
  
  // Header Section
  currentY = await generateHeader(doc, quoteData, quoteId, options, colors, pageWidth, currentY);
  
  // Client Details Section
  currentY = generateClientDetails(doc, quoteData, colors, pageWidth, currentY);
  
  // Plan Information Section
  currentY = generatePlanInformation(doc, quoteData, colors, pageWidth, currentY);
  
  // Configuration Details Section
  currentY = generateConfigurationDetails(doc, quoteData, colors, pageWidth, currentY);
  
  // Cost Breakdown Section
  currentY = generateCostBreakdown(doc, quoteData, colors, pageWidth, currentY);
  
  // Terms and Conditions (if enabled)
  if (options.includeTerms) {
    currentY = generateTermsAndConditions(doc, colors, pageWidth, currentY);
  }
  
  // Signature Section (if enabled)
  if (options.includeSignature) {
    currentY = generateSignatureSection(doc, colors, pageWidth, currentY);
  }
  
  // Footer
  generateFooter(doc, options, colors, pageWidth, pageHeight);
}

/**
 * Generate header section
 */
async function generateHeader(
  doc: jsPDF,
  quoteData: QuoteData,
  quoteId: string,
  options: QuotePDFOptions,
  colors: any,
  pageWidth: number,
  startY: number
): Promise<number> {
  console.log('📋 Generating header section...');
  
  let currentY = startY;
  
  // Company logo (if provided)
  if (options.companyLogo) {
    try {
      // Add logo (simplified - in real implementation, you'd handle image loading)
      doc.setFillColor(colors.light);
      doc.rect(20, currentY, 30, 20, 'F');
      doc.setTextColor(colors.primary);
      doc.setFontSize(12);
      doc.text('LOGO', 35, currentY + 12);
      currentY += 25;
    } catch (error) {
      console.warn('⚠️ Could not add company logo:', error);
    }
  }
  
  // Company name and details
  doc.setTextColor(colors.primary);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(options.companyName || 'Your Company', 20, currentY);
  
  currentY += 10;
  
  // Company contact info
  if (options.companyAddress || options.companyPhone || options.companyEmail) {
    doc.setTextColor(colors.text);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    let contactY = currentY;
    if (options.companyAddress) {
      doc.text(options.companyAddress, 20, contactY);
      contactY += 4;
    }
    if (options.companyPhone) {
      doc.text(`Phone: ${options.companyPhone}`, 20, contactY);
      contactY += 4;
    }
    if (options.companyEmail) {
      doc.text(`Email: ${options.companyEmail}`, 20, contactY);
      contactY += 4;
    }
    currentY = contactY + 5;
  }
  
  // Quote ID and date
  currentY += 10;
  doc.setFillColor(colors.primary);
  doc.rect(pageWidth - 80, startY, 60, 25, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTE', pageWidth - 50, startY + 8, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(quoteId, pageWidth - 50, startY + 15, { align: 'center' });
  
  doc.setFontSize(8);
  doc.text(formatDate(quoteData.createdAt), pageWidth - 50, startY + 22, { align: 'center' });
  
  return Math.max(currentY, startY + 30);
}

/**
 * Generate client details section
 */
function generateClientDetails(
  doc: jsPDF,
  quoteData: QuoteData,
  colors: any,
  pageWidth: number,
  startY: number
): number {
  console.log('👤 Generating client details section...');
  
  let currentY = startY + 10;
  
  // Section title
  doc.setTextColor(colors.primary);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Client Information', 20, currentY);
  
  currentY += 8;
  
  // Client details box
  const boxHeight = 40;
  doc.setFillColor(colors.light);
  doc.rect(20, currentY, pageWidth - 40, boxHeight, 'F');
  
  // Client information
  doc.setTextColor(colors.text);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  
  const clientInfo = [
    `Company: ${quoteData.company}`,
    `Client Name: ${quoteData.clientName}`,
    `Email: ${quoteData.clientEmail}`
  ];
  
  clientInfo.forEach((info, index) => {
    doc.text(info, 25, currentY + 8 + (index * 8));
  });
  
  return currentY + boxHeight + 10;
}

/**
 * Generate plan information section
 */
function generatePlanInformation(
  doc: jsPDF,
  quoteData: QuoteData,
  colors: any,
  pageWidth: number,
  startY: number
): number {
  console.log('📋 Generating plan information section...');
  
  let currentY = startY + 10;
  
  // Section title
  doc.setTextColor(colors.primary);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Selected Plan', 20, currentY);
  
  currentY += 8;
  
  // Plan details box
  const boxHeight = 30;
  doc.setFillColor(colors.light);
  doc.rect(20, currentY, pageWidth - 40, boxHeight, 'F');
  
  // Plan information
  doc.setTextColor(colors.text);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  
  doc.text(`Plan: ${quoteData.calculation.tier.name}`, 25, currentY + 8);
  doc.text(`Status: ${quoteData.status.charAt(0).toUpperCase() + quoteData.status.slice(1)}`, 25, currentY + 18);
  
  // Features (if available)
  if (quoteData.calculation.tier.features.length > 0) {
    currentY += boxHeight + 5;
    doc.setFontSize(10);
    doc.text('Features:', 25, currentY);
    
    quoteData.calculation.tier.features.forEach((feature, index) => {
      if (currentY + (index + 1) * 5 < 250) { // Prevent overflow
        doc.text(`• ${feature}`, 30, currentY + 5 + (index * 5));
      }
    });
    
    currentY += quoteData.calculation.tier.features.length * 5 + 5;
  } else {
    currentY += boxHeight + 10;
  }
  
  return currentY;
}

/**
 * Generate configuration details section
 */
function generateConfigurationDetails(
  doc: jsPDF,
  quoteData: QuoteData,
  colors: any,
  pageWidth: number,
  startY: number
): number {
  console.log('⚙️ Generating configuration details section...');
  
  let currentY = startY + 10;
  
  // Section title
  doc.setTextColor(colors.primary);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Configuration Details', 20, currentY);
  
  currentY += 8;
  
  // Configuration table
  const configData = [
    ['Migration Type', quoteData.configuration.migrationType],
    ['Number of Users', quoteData.configuration.numberOfUsers.toString()],
    ['Instance Type', quoteData.configuration.instanceType],
    ['Number of Instances', quoteData.configuration.numberOfInstances.toString()],
    ['Duration', `${quoteData.configuration.duration} months`],
    ['Data Size', `${quoteData.configuration.dataSizeGB} GB`]
  ];
  
  // Table header
  doc.setFillColor(colors.primary);
  doc.rect(20, currentY, pageWidth - 40, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Configuration Item', 25, currentY + 5);
  doc.text('Value', pageWidth - 60, currentY + 5);
  
  currentY += 8;
  
  // Table rows
  doc.setTextColor(colors.text);
  doc.setFont('helvetica', 'normal');
  
  configData.forEach((row, index) => {
    const rowY = currentY + (index * 6);
    
    // Alternate row colors
    if (index % 2 === 0) {
      doc.setFillColor(248, 249, 250);
      doc.rect(20, rowY, pageWidth - 40, 6, 'F');
    }
    
    doc.text(row[0], 25, rowY + 4);
    doc.text(row[1], pageWidth - 60, rowY + 4);
  });
  
  return currentY + (configData.length * 6) + 10;
}

/**
 * Generate cost breakdown section
 */
function generateCostBreakdown(
  doc: jsPDF,
  quoteData: QuoteData,
  colors: any,
  pageWidth: number,
  startY: number
): number {
  console.log('💰 Generating cost breakdown section...');
  
  let currentY = startY + 10;
  
  // Section title
  doc.setTextColor(colors.primary);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Cost Breakdown', 20, currentY);
  
  currentY += 8;
  
  // Cost breakdown table
  const costData = [
    ['User Costs', formatCurrency(quoteData.calculation.userCost)],
    ['Data Costs', formatCurrency(quoteData.calculation.dataCost)],
    ['Migration Cost', formatCurrency(quoteData.calculation.migrationCost)],
    ['Instance Cost', formatCurrency(quoteData.calculation.instanceCost)]
  ];
  
  // Table header
  doc.setFillColor(colors.primary);
  doc.rect(20, currentY, pageWidth - 40, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Cost Item', 25, currentY + 5);
  doc.text('Amount', pageWidth - 60, currentY + 5);
  
  currentY += 8;
  
  // Table rows
  doc.setTextColor(colors.text);
  doc.setFont('helvetica', 'normal');
  
  costData.forEach((row, index) => {
    const rowY = currentY + (index * 6);
    
    // Alternate row colors
    if (index % 2 === 0) {
      doc.setFillColor(248, 249, 250);
      doc.rect(20, rowY, pageWidth - 40, 6, 'F');
    }
    
    doc.text(row[0], 25, rowY + 4);
    doc.text(row[1], pageWidth - 60, rowY + 4);
  });
  
  currentY += (costData.length * 6) + 10;
  
  // Total cost
  doc.setFillColor(colors.secondary);
  doc.rect(20, currentY, pageWidth - 40, 12, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Total Cost', 25, currentY + 8);
  doc.text(formatCurrency(quoteData.calculation.totalCost), pageWidth - 60, currentY + 8);
  
  return currentY + 20;
}

/**
 * Generate terms and conditions section
 */
function generateTermsAndConditions(
  doc: jsPDF,
  colors: any,
  pageWidth: number,
  startY: number
): number {
  console.log('📜 Generating terms and conditions section...');
  
  let currentY = startY + 10;
  
  // Section title
  doc.setTextColor(colors.primary);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Terms and Conditions', 20, currentY);
  
  currentY += 8;
  
  // Terms content
  doc.setTextColor(colors.text);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  const terms = [
    '1. This quote is valid for 30 days from the date of issue.',
    '2. Prices are subject to change without notice.',
    '3. Payment terms: Net 30 days.',
    '4. All services are subject to our standard terms of service.',
    '5. This quote does not include taxes, which will be added as applicable.'
  ];
  
  terms.forEach((term, index) => {
    doc.text(term, 20, currentY + (index * 4));
  });
  
  return currentY + (terms.length * 4) + 10;
}

/**
 * Generate signature section
 */
function generateSignatureSection(
  doc: jsPDF,
  colors: any,
  pageWidth: number,
  startY: number
): number {
  console.log('✍️ Generating signature section...');
  
  let currentY = startY + 10;
  
  // Signature lines
  doc.setTextColor(colors.text);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Client signature
  doc.text('Client Signature:', 20, currentY);
  doc.line(20, currentY + 5, 100, currentY + 5);
  doc.text('Date:', 120, currentY);
  doc.line(120, currentY + 5, 180, currentY + 5);
  
  currentY += 20;
  
  // Company signature
  doc.text('Authorized Signature:', 20, currentY);
  doc.line(20, currentY + 5, 100, currentY + 5);
  doc.text('Date:', 120, currentY);
  doc.line(120, currentY + 5, 180, currentY + 5);
  
  return currentY + 20;
}

/**
 * Generate footer
 */
function generateFooter(
  doc: jsPDF,
  options: QuotePDFOptions,
  colors: any,
  pageWidth: number,
  pageHeight: number
): void {
  console.log('📄 Generating footer...');
  
  // Footer line
  doc.setDrawColor(colors.primary);
  doc.line(20, pageHeight - 20, pageWidth - 20, pageHeight - 20);
  
  // Footer text
  doc.setTextColor(colors.text);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  const footerText = `Generated on ${formatDate(new Date())} | ${options.companyName || 'Your Company'}`;
  doc.text(footerText, 20, pageHeight - 10);
  
  // Page number
  doc.text('Page 1 of 1', pageWidth - 30, pageHeight - 10);
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
        features: ['Advanced Analytics', 'Priority Support', 'Custom Integrations', '24/7 Monitoring']
      },
      userCost: 5000,
      dataCost: 1000,
      migrationCost: 3000,
      instanceCost: 2000,
      totalCost: 11000
    },
    selectedTier: {
      name: 'Professional',
      features: ['Advanced Analytics', 'Priority Support', 'Custom Integrations', '24/7 Monitoring']
    },
    status: 'draft',
    createdAt: new Date(),
    templateUsed: {
      id: 'template-001',
      name: 'Standard Quote Template',
      isDefault: true
    }
  };
}

/**
 * Validate quote data for PDF generation
 */
export function validateQuoteData(quoteData: QuoteData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!quoteData.company) {
    errors.push('Company name is required');
  }
  
  if (!quoteData.clientName) {
    errors.push('Client name is required');
  }
  
  if (!quoteData.clientEmail) {
    errors.push('Client email is required');
  }
  
  if (!quoteData.calculation.totalCost || quoteData.calculation.totalCost <= 0) {
    errors.push('Total cost must be greater than 0');
  }
  
  if (!quoteData.configuration.numberOfUsers || quoteData.configuration.numberOfUsers <= 0) {
    errors.push('Number of users must be greater than 0');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
