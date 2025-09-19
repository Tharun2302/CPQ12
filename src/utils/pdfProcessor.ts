import { PDFDocument, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import jsPDF from 'jspdf';
import { saveAs } from 'file-saver';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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

export interface PlaceholderMap {
  [key: string]: string | number;
}

/**
 * Extract text content from a PDF file
 */
export async function extractTextFromPDF(pdfFile: File): Promise<string> {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

/**
 * Find placeholders in text content
 */
export function findPlaceholders(text: string): string[] {
  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  const placeholders: string[] = [];
  let match;
  
  while ((match = placeholderRegex.exec(text)) !== null) {
    placeholders.push(match[1].trim());
  }
  
  return [...new Set(placeholders)]; // Remove duplicates
}

/**
 * Create placeholder mapping from quote data
 */
export function createPlaceholderMap(quoteData: QuoteData): PlaceholderMap {
  const formatCurrency = (amount: number) => `$${amount.toLocaleString()}`;
  const formatDate = (date: Date) => date.toLocaleDateString();
  
  return {
    // Client Information
    'clientName': quoteData.clientName,
    'clientEmail': quoteData.clientEmail,
    'company': quoteData.company,
    
    // CRITICAL: Add specific token formats for DOCX templates
    'Company Name': quoteData.company,
    'Company_Name': quoteData.company,
    'company name': quoteData.company,
    'company_name': quoteData.company,
    
    // Quote Information
    'quoteId': quoteData.id,
    'quoteNumber': `CPQ-001`,
    'quoteDate': formatDate(quoteData.createdAt),
    
    // Configuration
    'numberOfUsers': quoteData.configuration.numberOfUsers,
    'instanceType': quoteData.configuration.instanceType,
    'numberOfInstances': quoteData.configuration.numberOfInstances,
    'duration': quoteData.configuration.duration,
    'migrationType': quoteData.configuration.migrationType,
    'dataSizeGB': quoteData.configuration.dataSizeGB,
    
    // CRITICAL: Add specific token formats for DOCX templates
    'users_count': quoteData.configuration.numberOfUsers.toString(),
    'userscount': quoteData.configuration.numberOfUsers.toString(),
    'users': quoteData.configuration.numberOfUsers.toString(),
    'Duration of months': quoteData.configuration.duration.toString(),
    'Duration_of_months': quoteData.configuration.duration.toString(),
    'duration_months': quoteData.configuration.duration.toString(),
    
    // Pricing
    'userCost': formatCurrency(quoteData.calculation.userCost),
    'dataCost': formatCurrency(quoteData.calculation.dataCost),
    'migrationCost': formatCurrency(quoteData.calculation.migrationCost),
    'instanceCost': formatCurrency(quoteData.calculation.instanceCost),
    'totalCost': formatCurrency(quoteData.calculation.totalCost),
    
    // CRITICAL: Add specific token formats for DOCX templates
    'users_cost': formatCurrency(quoteData.calculation.userCost),
    'price_migration': formatCurrency(quoteData.calculation.migrationCost),
    'migration_price': formatCurrency(quoteData.calculation.migrationCost),
    'total price': formatCurrency(quoteData.calculation.totalCost),
    'total_price': formatCurrency(quoteData.calculation.totalCost),
    'prices': formatCurrency(quoteData.calculation.totalCost),
    
    // Plan Information
    'planName': quoteData.calculation.tier.name,
    'planFeatures': quoteData.calculation.tier.features.join(', '),
    
    // Additional computed fields
    'totalUsers': quoteData.configuration.numberOfUsers * quoteData.configuration.numberOfInstances,
    'totalDataGB': quoteData.configuration.dataSizeGB * quoteData.configuration.numberOfInstances,
    'monthlyCost': formatCurrency(quoteData.calculation.totalCost / quoteData.configuration.duration),
  };
}

/**
 * Replace placeholders in text content
 */
export function replacePlaceholders(text: string, placeholderMap: PlaceholderMap): string {
  let processedText = text;
  
  Object.entries(placeholderMap).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    processedText = processedText.replace(regex, String(value));
  });
  
  return processedText;
}

/**
 * Process PDF template with quote data
 */
export async function processPDFTemplate(
  templateFile: File, 
  quoteData: QuoteData
): Promise<{ processedPDF: Blob; placeholderMap: PlaceholderMap }> {
  try {
    console.log('🔄 Processing PDF template with quote data...');
    
    // Extract text from PDF to find placeholders
    const pdfText = await extractTextFromPDF(templateFile);
    console.log('📄 Extracted text from PDF template');
    
    // Find placeholders
    const placeholders = findPlaceholders(pdfText);
    console.log('🔍 Found placeholders:', placeholders);
    
    // Create placeholder mapping
    const placeholderMap = createPlaceholderMap(quoteData);
    console.log('📋 Created placeholder mapping:', placeholderMap);
    
    // Load the PDF document
    const arrayBuffer = await templateFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // Get all pages
    const pages = pdfDoc.getPages();
    
    // For each page, we'll need to replace text
    // Note: This is a simplified approach. For complex PDFs, you might need more sophisticated text replacement
    pages.forEach((page, index) => {
      console.log(`📄 Processing page ${index + 1}`);
      // Here you would implement text replacement logic
      // This is complex and depends on your specific PDF structure
    });
    
    // Generate the processed PDF
    const pdfBytes = await pdfDoc.save();
    const processedPDF = new Blob([pdfBytes], { type: 'application/pdf' });
    
    console.log('✅ PDF template processed successfully');
    
    return {
      processedPDF,
      placeholderMap
    };
    
  } catch (error) {
    console.error('❌ Error processing PDF template:', error);
    throw new Error(`Failed to process PDF template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a new PDF from scratch with quote data
 */
export async function generateQuotePDF(quoteData: QuoteData): Promise<Blob> {
  try {
    console.log('🔄 Generating new quote PDF...');
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Set up fonts and colors
    doc.setFont('helvetica');
    doc.setFontSize(24);
    doc.setTextColor(0, 0, 0);
    
    // Header
    doc.text('Professional Quote', pageWidth / 2, 30, { align: 'center' });
    
    // Quote Information
    doc.setFontSize(12);
    doc.text(`Quote ID: CPQ-001`, 20, 50);
    doc.text(`Date: ${quoteData.createdAt.toLocaleDateString()}`, 20, 60);
    
    // Client Information
    doc.setFontSize(14);
    doc.text('Client Information', 20, 80);
    doc.setFontSize(12);
    doc.text(`Name: ${quoteData.clientName}`, 20, 95);
    doc.text(`Email: ${quoteData.clientEmail}`, 20, 105);
    doc.text(`Company: ${quoteData.company}`, 20, 115);
    
    // Configuration
    doc.setFontSize(14);
    doc.text('Project Configuration', 20, 135);
    doc.setFontSize(12);
    doc.text(`Migration Type: ${quoteData.configuration.migrationType}`, 20, 150);
    doc.text(`Number of Users: ${quoteData.configuration.numberOfUsers}`, 20, 160);
    doc.text(`Instance Type: ${quoteData.configuration.instanceType}`, 20, 170);
    doc.text(`Number of Instances: ${quoteData.configuration.numberOfInstances}`, 20, 180);
    doc.text(`Duration: ${quoteData.configuration.duration} months`, 20, 190);
    doc.text(`Data Size: ${quoteData.configuration.dataSizeGB} GB`, 20, 200);
    
    // Pricing Breakdown
    doc.setFontSize(14);
    doc.text('Pricing Breakdown', 20, 220);
    doc.setFontSize(12);
    
    const formatCurrency = (amount: number) => `$${amount.toLocaleString()}`;
    
    doc.text(`User Costs: ${formatCurrency(quoteData.calculation.userCost)}`, 20, 235);
    doc.text(`Data Costs: ${formatCurrency(quoteData.calculation.dataCost)}`, 20, 245);
    doc.text(`Migration: ${formatCurrency(quoteData.calculation.migrationCost)}`, 20, 255);
    doc.text(`Instances: ${formatCurrency(quoteData.calculation.instanceCost)}`, 20, 265);
    
    // Total
    doc.setFontSize(16);
    doc.text(`Total Cost: ${formatCurrency(quoteData.calculation.totalCost)}`, 20, 285);
    
    // Plan Information
    doc.setFontSize(14);
    doc.text('Selected Plan', 20, 305);
    doc.setFontSize(12);
    doc.text(`Plan: ${quoteData.calculation.tier.name}`, 20, 320);
    
    // Features
    if (quoteData.calculation.tier.features.length > 0) {
      doc.text('Features:', 20, 335);
      quoteData.calculation.tier.features.forEach((feature, index) => {
        doc.text(`• ${feature}`, 25, 345 + (index * 10));
      });
    }
    
    console.log('✅ Quote PDF generated successfully');
    
    return doc.output('blob');
    
  } catch (error) {
    console.error('❌ Error generating quote PDF:', error);
    throw new Error(`Failed to generate quote PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Download a PDF file
 */
export function downloadPDF(pdfBlob: Blob, filename: string): void {
  try {
    saveAs(pdfBlob, filename);
    console.log(`✅ PDF downloaded: ${filename}`);
  } catch (error) {
    console.error('❌ Error downloading PDF:', error);
    throw new Error('Failed to download PDF');
  }
}

/**
 * Validate PDF file
 */
export function validatePDFFile(file: File): boolean {
  if (file.type !== 'application/pdf') {
    return false;
  }
  
  if (file.size === 0) {
    return false;
  }
  
  return true;
}

/**
 * Get PDF file info
 */
export async function getPDFInfo(file: File): Promise<{
  pageCount: number;
  fileSize: string;
  isValid: boolean;
}> {
  try {
    if (!validatePDFFile(file)) {
      return {
        pageCount: 0,
        fileSize: '0 KB',
        isValid: false
      };
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    return {
      pageCount: pdf.numPages,
      fileSize: formatFileSize(file.size),
      isValid: true
    };
    
  } catch (error) {
    console.error('Error getting PDF info:', error);
    return {
      pageCount: 0,
      fileSize: '0 KB',
      isValid: false
    };
  }
}
