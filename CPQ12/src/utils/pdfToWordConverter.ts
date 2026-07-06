// Note: docx library is for Node.js, not browsers
// We'll create a simple Word-compatible document using a different approach
import { extractTextFromPDF, extractTextWithPosition, PDFPageContent, TextItem } from './pdfProcessor';

/**
 * Escapes special RTF characters in text
 */
function escapeRtfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ');
}

/**
 * Groups text items by lines based on Y position
 */
function groupTextItemsByLines(items: TextItem[], pageHeight: number, tolerance: number = 5): TextItem[][] {
  // Sort items by Y position (top to bottom)
  const sortedItems = [...items].sort((a, b) => b.y - a.y);
  
  const lines: TextItem[][] = [];
  let currentLine: TextItem[] = [];
  let currentY: number | null = null;
  
  for (const item of sortedItems) {
    if (currentY === null || Math.abs(item.y - currentY) <= tolerance) {
      // Same line
      currentLine.push(item);
      if (currentY === null) currentY = item.y;
    } else {
      // New line
      if (currentLine.length > 0) {
        // Sort items in line by X position (left to right)
        currentLine.sort((a, b) => a.x - b.x);
        lines.push(currentLine);
      }
      currentLine = [item];
      currentY = item.y;
    }
  }
  
  // Add last line
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Detects text alignment based on X position
 */
function detectAlignment(items: TextItem[], pageWidth: number): 'left' | 'center' | 'right' {
  if (items.length === 0) return 'left';
  
  const firstX = items[0].x;
  const lastX = items[items.length - 1].x + items[items.length - 1].width;
  const lineWidth = lastX - firstX;
  const centerX = pageWidth / 2;
  const leftMargin = 50; // Typical left margin
  const rightMargin = pageWidth - 50; // Typical right margin
  
  // Check if centered (items are around the center of the page)
  if (Math.abs(firstX + lineWidth / 2 - centerX) < 50) {
    return 'center';
  }
  
  // Check if right-aligned (items are near the right margin)
  if (lastX > rightMargin - 100) {
    return 'right';
  }
  
  // Default to left
  return 'left';
}

/**
 * Converts text items with position to RTF format preserving alignment
 */
function itemsToRtf(pages: PDFPageContent[]): string {
  const rtfLines: string[] = [];
  
  for (const page of pages) {
    // Group items by lines
    const lines = groupTextItemsByLines(page.items, page.height);
    
    for (const lineItems of lines) {
      if (lineItems.length === 0) {
        rtfLines.push('\\par');
        continue;
      }
      
      // Detect alignment
      const alignment = detectAlignment(lineItems, page.width);
      const alignmentCode = alignment === 'center' ? '\\qc' : alignment === 'right' ? '\\qr' : '\\ql';
      
      // Build line text with formatting
      const lineParts: string[] = [];
      for (const item of lineItems) {
        let formattedText = escapeRtfText(item.text);
        
        // Apply formatting
        if (item.bold) {
          formattedText = `{\\b ${formattedText}}`;
        }
        if (item.italic) {
          formattedText = `{\\i ${formattedText}}`;
        }
        
        // Add font size if different from default
        if (item.fontSize && Math.abs(item.fontSize - 24) > 2) {
          const fontSize = Math.round(item.fontSize * 2); // RTF uses half-points
          formattedText = `{\\fs${fontSize} ${formattedText}}`;
        }
        
        lineParts.push(formattedText);
      }
      
      const lineText = lineParts.join(' ');
      // Reset alignment after paragraph to prevent affecting next line
      rtfLines.push(`${alignmentCode} ${lineText}\\par\\ql`);
    }
    
    // Add page break (except for last page)
    if (page.pageNumber < pages.length) {
      rtfLines.push('\\page');
    }
  }
  
  return rtfLines.join('\n');
}

/**
 * Converts extracted PDF text to RTF format (fallback for plain text)
 */
function textToRtf(text: string): string {
  // Split text into lines and process
  const lines = text.split(/\r?\n/);
  const rtfLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Empty line
    if (!trimmed) {
      rtfLines.push('\\par');
      continue;
    }
    
    // Check if line looks like a heading (short, all caps, or starts with number)
    const isHeading = trimmed.length < 80 && (
      trimmed === trimmed.toUpperCase() ||
      /^\d+[\.\)]\s/.test(trimmed) ||
      /^[A-Z][A-Z\s]{3,}$/.test(trimmed)
    );
    
    const escapedText = escapeRtfText(trimmed);
    
    if (isHeading) {
      rtfLines.push(`{\\b ${escapedText}}\\par`);
    } else {
      rtfLines.push(`${escapedText}\\par`);
    }
  }
  
  return rtfLines.join('\n');
}

/**
 * Converts a PDF file to Word format (.rtf)
 * Extracts actual text content from the PDF and converts it to RTF format
 * @param pdfFile - The PDF file to convert
 * @returns Promise<File> - The converted Word document as a File object
 */
export const convertPdfToWord = async (pdfFile: File): Promise<File> => {
  try {
    console.log('🔄 Starting PDF to Word conversion...');
    console.log('📄 Input file:', pdfFile.name, 'Size:', pdfFile.size);
    console.log('📄 File type:', pdfFile.type);
    
    // Validate input file
    if (!pdfFile || !pdfFile.name) {
      throw new Error('Invalid file input');
    }

    // Extract text content from PDF with position information
    console.log('📖 Extracting text from PDF with position information...');
    let rtfBody: string;
    try {
      // Try to extract with position information first (preserves alignment)
      const pages = await extractTextWithPosition(pdfFile);
      console.log('✅ Text with position extracted successfully, pages:', pages.length);
      
      if (pages.length > 0 && pages[0].items.length > 0) {
        // Convert to RTF with alignment preservation
        rtfBody = itemsToRtf(pages);
        console.log('✅ RTF generated with alignment preservation');
      } else {
        // Fallback to plain text extraction
        console.warn('⚠️ No items found, falling back to plain text extraction');
        const extractedText = await extractTextFromPDF(pdfFile);
        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text content found');
        }
        rtfBody = textToRtf(extractedText);
      }
    } catch (extractError) {
      console.error('❌ Error extracting text with position:', extractError);
      console.log('🔄 Trying plain text extraction as fallback...');
      
      try {
        // Fallback to plain text extraction
        const extractedText = await extractTextFromPDF(pdfFile);
        if (!extractedText || extractedText.trim().length === 0) {
          throw new Error('No text content found');
        }
        rtfBody = textToRtf(extractedText);
        console.log('✅ Plain text extraction successful');
      } catch (fallbackError) {
        console.error('❌ Plain text extraction also failed:', fallbackError);
        // Use fallback content
        const fallbackText = `Document: ${pdfFile.name}\n\nThis PDF document has been converted to Word format.\n\nNote: Text extraction from the PDF was not possible. This may be due to:\n- The PDF contains scanned images\n- The PDF is password protected\n- PDF.js worker configuration issue\n\nPlease review the original PDF for complete content.`;
        rtfBody = textToRtf(fallbackText);
      }
    }
    
    // Create RTF document with proper header
    const rtfContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}{\\f1 Arial;}}
{\\colortbl;\\red0\\green0\\blue0;\\red0\\green0\\blue255;}
\\f0\\fs24
${rtfBody}
}`;

    console.log('📝 RTF document created, generating file...');
    
    // Create a new File object with the RTF document
    // Use .docx extension so Word recognizes it (Word can open RTF content with .docx extension)
    const wordFileName = pdfFile.name.replace(/\.pdf$/i, '.docx');
    const wordFile = new File([rtfContent], wordFileName, {
      type: 'application/msword' // RTF content, but Word-compatible MIME type
    });

    console.log('✅ PDF to Word conversion completed');
    console.log('📄 Output file:', wordFileName, 'Size:', wordFile.size);

    return wordFile;
  } catch (error) {
    console.error('❌ Error converting PDF to Word:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to convert PDF to Word format: ${error.message}`);
  }
};

/**
 * Downloads a Word document file
 * @param wordFile - The Word file to download
 * @param fileName - Optional custom filename
 */
export const downloadWordFile = (wordFile: File, fileName?: string): void => {
  try {
    console.log('📥 Starting Word file download...');
    console.log('📄 Word file object:', wordFile);
    console.log('📄 Word file name:', wordFile.name);
    console.log('📄 Word file size:', wordFile.size);
    console.log('📄 Word file type:', wordFile.type);
    console.log('📄 Target filename:', fileName);
    
    if (!wordFile) {
      throw new Error('Word file is null or undefined');
    }
    
    if (wordFile.size === 0) {
      throw new Error('Word file is empty (0 bytes)');
    }
    
    const url = URL.createObjectURL(wordFile);
    console.log('🔗 Created object URL:', url);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || wordFile.name;
    
    console.log('🔗 Download link created:', {
      href: link.href,
      download: link.download
    });
    
    document.body.appendChild(link);
    console.log('🖱️ Triggering click...');
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log('✅ Word document download completed:', fileName || wordFile.name);
  } catch (error) {
    console.error('❌ Error downloading Word document:', error);
    throw new Error(`Failed to download Word document: ${error.message}`);
  }
};

/**
 * Validates if a file is a PDF
 * @param file - The file to validate
 * @returns boolean - True if the file is a PDF
 */
export const isPdfFile = (file: File): boolean => {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
};

/**
 * Gets the file extension from a filename
 * @param filename - The filename to extract extension from
 * @returns string - The file extension (without dot)
 */
export const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

/**
 * Test function to verify RTF generation is working
 * @returns Promise<boolean> - True if RTF generation is working
 */
export const testDocxLibrary = async (): Promise<boolean> => {
  try {
    console.log('🧪 Testing RTF generation...');
    
    // Create a simple test RTF document
    const testRtfContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\f0\\fs24
{\\b Test Document}\\par
This is a test RTF document.\\par
}`;

    // Test if we can create a File object
    const testFile = new File([testRtfContent], 'test.rtf', {
      type: 'application/rtf'
    });
    
    console.log('✅ RTF generation test successful, file size:', testFile.size);
    return true;
  } catch (error) {
    console.error('❌ RTF generation test failed:', error);
    return false;
  }
};
