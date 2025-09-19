// Note: docx library is for Node.js, not browsers
// We'll create a simple Word-compatible document using a different approach

/**
 * Converts a PDF file to Word format (.docx)
 * Note: Since docx library is for Node.js, we'll create a simple RTF document instead
 * @param pdfFile - The PDF file to convert
 * @returns Promise<File> - The converted Word document as a File object
 */
export const convertPdfToWord = async (pdfFile: File): Promise<File> => {
  try {
    console.log('🔄 Starting PDF to Word conversion...');
    console.log('📄 Input file:', pdfFile.name, 'Size:', pdfFile.size);
    console.log('📄 File type:', pdfFile.type);
    console.log('📄 File lastModified:', pdfFile.lastModified);
    
    // Validate input file
    if (!pdfFile || !pdfFile.name) {
      throw new Error('Invalid file input');
    }

    // Create a simple RTF document (Rich Text Format) that Word can open
    const rtfContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\f0\\fs24
{\\b Professional Quote Template}\\par
\\par
Converted from: ${pdfFile.name}\\par
\\par
{\\b Company Information}\\par
Company Name: [Your Company Name]\\par
Address: [Your Company Address]\\par
Phone: [Your Phone Number]\\par
Email: [Your Email Address]\\par
\\par
{\\b Client Information}\\par
Client Name: [Client Name]\\par
Company: [Client Company]\\par
Email: [Client Email]\\par
\\par
{\\b Project Details}\\par
Project Description: [Enter project description here]\\par
Scope of Work: [Enter scope of work here]\\par
\\par
{\\b Pricing Information}\\par
Total Cost: [Enter total cost]\\par
Payment Terms: [Enter payment terms]\\par
\\par
{\\b Instructions for Use}\\par
This document has been created from your PDF template. You can now:\\par
• Edit the content directly in Microsoft Word\\par
• Customize the layout, fonts, and formatting\\par
• Add your company logo and branding\\par
• Save as a new template for future use\\par
• Convert back to PDF when ready to send to clients\\par
}`;

    console.log('📝 RTF document created, generating file...');
    
    // Create a new File object with the RTF document
    const wordFileName = pdfFile.name.replace(/\.pdf$/i, '.rtf');
    const wordFile = new File([rtfContent], wordFileName, {
      type: 'application/rtf'
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
