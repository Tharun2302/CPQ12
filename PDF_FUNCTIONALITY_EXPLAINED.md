# PDF Functionality in CPQ Application - Complete Guide

## Overview
The CPQ (Configure, Price, Quote) application has comprehensive PDF processing capabilities that handle quote generation, template processing, form filling, token replacement, and document merging.

## Core PDF Features

### 1. **PDF Generation** (`quotePDFGenerator.ts`)
- **Purpose**: Generate new PDF quotes from scratch using jsPDF library
- **Features**:
  - Creates professional quote documents with customizable themes (blue, green, purple, gray)
  - Includes company branding (logo, address, contact info)
  - Generates unique quote IDs (format: `QTE-XXXXX-XXXXX`)
  - Formats currency, dates, and pricing information
  - Supports multiple pages with proper pagination
  - Includes terms & conditions and signature sections

**Key Functions**:
```typescript
generateQuotePDF(quoteData, options) → QuotePDFResult
```

### 2. **PDF Template Processing** (`pdfProcessor.ts`)
- **Purpose**: Process existing PDF templates with quote data
- **Workflow**:
  1. Extract text from PDF to find placeholders
  2. Identify tokens/placeholders in the document
  3. Create mapping between placeholders and quote data
  4. Replace placeholders with actual values
  5. Generate processed PDF

**Key Functions**:
```typescript
processPDFTemplate(templateFile, quoteData) → {processedPDF, placeholderMap}
extractTextFromPDF(templateFile) → string
findPlaceholders(pdfText) → string[]
```

### 3. **Token Finding & Replacement** (`tokenFinder.ts` & `tokenReplacer.ts`)
- **Purpose**: Find and replace tokens/placeholders in PDF documents
- **Token Patterns Supported**:
  - Company tokens: `{company name}`, `{{Company Name}}`, `COMPANY_NAME`
  - Pricing tokens: `{userscount}`, `{total price}`, `{price_data}`
  - Instance tokens: `{instance cost}`, `{{Instance Cost}}`
  - Custom tokens with various formats (curly braces, brackets, etc.)

**How It Works**:
1. Uses PDF.js to extract text content with positioning
2. Searches for token patterns across all pages
3. Records exact positions (x, y coordinates) of each token
4. Replaces tokens using pdf-lib library
5. Maintains document formatting and layout

**Key Functions**:
```typescript
findTokenPositions(pdfBytes, tokenPatterns) → TokenSearchResult
replaceTokensInPDF(pdfBytes, quoteData) → TokenReplacementResult
```

### 4. **PDF Form Filling** (`pdfFormFiller.ts`)
- **Purpose**: Automatically fill PDF form fields with quote data
- **Smart Field Detection**:
  - Automatically categorizes form fields (company, client, email, user count, price, date)
  - Uses pattern matching to identify field types
  - Supports text fields, checkboxes, dropdowns, option lists
  - Calculates confidence scores for field matching

**Field Categories**:
- **Company**: company, organisation, corporation, business
- **Client**: client, customer, contact, name
- **Email**: email, e-mail, mail, contact_email
- **User**: users, seats, licenses, user_count
- **Price**: total, price, amount, cost, total_price
- **Date**: date, created_date, quote_date, expiry_date

**Key Functions**:
```typescript
loadPDFWithForm(pdfBytes) → {pdfDoc, form, fields}
fillPDFForm(pdfBytes, formData) → FormFillingResult
```

### 5. **PDF Overlay System** (`pdfOverlaySystem.ts`)
- **Purpose**: Overlay generated quote PDFs onto template PDFs
- **Features**:
  - Detects overlay regions in templates
  - Scales and positions quote PDFs to fit designated areas
  - Maintains aspect ratios
  - Supports custom padding and positioning
  - Can clear regions before overlaying

**Key Functions**:
```typescript
detectOverlayRegion(pdfBytes) → PDFRegion
overlayQuotePDF(originalPDF, quotePDF, region) → Blob
```

### 6. **PDF Orchestrator** (`pdfOrchestrator.ts`)
- **Purpose**: Coordinates all PDF processing steps in a unified workflow
- **Processing Pipeline**:
  1. Load and validate original PDF
  2. Fill PDF forms (if enabled)
  3. Replace tokens (if enabled)
  4. Generate quote PDF (if enabled)
  5. Overlay quote PDF onto template (if enabled)
  6. Flatten forms (make non-editable)
  7. Return final merged PDF

**Key Functions**:
```typescript
buildMergedBlob(originalPDFBytes, quoteData, options) → BuildMergedBlobResult
```

### 7. **PDF Merging** (`pdfMerger.ts`)
- **Purpose**: Merge multiple PDF documents together
- **Use Cases**:
  - Combining quote PDF with exhibits/attachments
  - Merging multiple quote pages
  - Appending terms & conditions
  - Combining template pages

**Key Functions**:
```typescript
mergePDFs(pdfFiles) → Blob
```

### 8. **DOCX to PDF Conversion** (Server-side)
- **Purpose**: Convert Word documents to PDF format
- **Conversion Methods** (with fallbacks):
  1. **LibreOffice** (primary): Uses `libreoffice-convert` package
  2. **System LibreOffice**: Spawns LibreOffice process
  3. **Gotenberg Service**: External conversion service
  4. **CloudConvert API**: Cloud-based conversion

**Server Endpoint**:
```
POST /api/convert/docx-to-pdf
```

### 9. **PDF Preview & Viewing**
- **Frontend Components**:
  - `TemplateProcessor.tsx`: Upload and process PDF templates
  - Preview functionality using browser's PDF viewer
  - Download processed PDFs
  - Real-time processing status

**Features**:
- Upload PDF templates
- Process with quote data
- Preview in new window
- Download final document

## Complete PDF Workflow

### Scenario 1: Generate Quote from Template
```
1. User uploads PDF template
2. System finds tokens/placeholders in template
3. System fills form fields (if any)
4. System replaces tokens with quote data
5. System generates final PDF
6. User previews/downloads processed PDF
```

### Scenario 2: Generate Quote from Scratch
```
1. User configures quote (users, pricing, etc.)
2. System generates PDF using jsPDF
3. PDF includes all quote details, pricing, terms
4. User previews/downloads generated PDF
```

### Scenario 3: Merge Quote with Exhibits
```
1. User selects exhibits (DOCX files)
2. System converts exhibits to PDF
3. System merges quote PDF with exhibit PDFs
4. System generates final combined document
5. User downloads merged PDF
```

## Technical Stack

### Frontend Libraries:
- **pdf-lib**: PDF manipulation (form filling, text replacement, merging)
- **pdfjs-dist**: PDF text extraction and token finding
- **jspdf**: Generate PDFs from scratch
- **file-saver**: Download PDF files

### Backend Libraries:
- **libreoffice-convert**: DOCX to PDF conversion
- **pdfkit**: Server-side PDF generation (alternative)
- **multer**: File upload handling

## Key Configuration Options

### PDF Processing Options:
```typescript
{
  fillForms: boolean,        // Fill PDF form fields
  flattenForms: boolean,      // Make forms non-editable
  replaceTokens: boolean,     // Replace text tokens
  generateQuotePDF: boolean,  // Generate quote PDF
  overlayQuotePDF: boolean,  // Overlay quote on template
  preserveOriginal: boolean, // Keep original PDF
  debugMode: boolean,        // Enable debug logging
  timeout: number            // Processing timeout (ms)
}
```

### Quote PDF Options:
```typescript
{
  companyName: string,
  companyLogo: string,        // Base64 encoded
  companyAddress: string,
  companyPhone: string,
  companyEmail: string,
  includeTerms: boolean,
  includeSignature: boolean,
  theme: 'blue' | 'green' | 'purple' | 'gray'
}
```

## Error Handling

- **Timeout Protection**: 30-second default timeout for processing
- **Fallback Methods**: Multiple conversion methods if one fails
- **Validation**: PDF file validation before processing
- **Error Logging**: Comprehensive error tracking and reporting
- **User Feedback**: Clear error messages and processing status

## Performance Optimizations

- **Lazy Loading**: PDF files loaded on-demand
- **Caching**: Template caching to reduce repeated processing
- **Async Processing**: Non-blocking PDF operations
- **Streaming**: Large file handling with streaming
- **Worker Threads**: Background processing for heavy operations

## Security Features

- **File Validation**: Checks file types and sizes
- **Input Sanitization**: Prevents malicious content
- **Size Limits**: Maximum file size restrictions
- **Rate Limiting**: Prevents abuse

## Usage Examples

### Generate Quote PDF:
```typescript
import { generateQuotePDF } from './utils/quotePDFGenerator';

const result = await generateQuotePDF(quoteData, {
  companyName: 'Zenop.ai',
  theme: 'blue',
  includeTerms: true
});
```

### Process PDF Template:
```typescript
import { buildMergedBlob } from './utils/pdfOrchestrator';

const result = await buildMergedBlob(pdfBytes, quoteData, {
  fillForms: true,
  replaceTokens: true,
  overlayQuotePDF: true
});
```

### Find Tokens in PDF:
```typescript
import { findTokenPositions } from './utils/tokenFinder';

const result = await findTokenPositions(pdfBytes, tokenPatterns);
console.log(`Found ${result.totalTokens} tokens`);
```

## API Endpoints

### PDF/Document Endpoints:
- `POST /api/convert/docx-to-pdf` - Convert DOCX to PDF
- `POST /api/documents` - Upload and process documents
- `GET /api/documents/:id` - Get document metadata
- `GET /api/documents/:id/file` - Download document PDF
- `GET /api/documents/:id/preview` - Preview document

## Best Practices

1. **Always validate PDF files** before processing
2. **Use appropriate timeouts** for large files
3. **Handle errors gracefully** with user-friendly messages
4. **Cache templates** to improve performance
5. **Monitor processing times** for optimization
6. **Test with various PDF formats** to ensure compatibility

## Future Enhancements

- OCR support for scanned PDFs
- Digital signature integration
- PDF annotation support
- Batch processing capabilities
- Advanced template editor
- PDF compression optimization
