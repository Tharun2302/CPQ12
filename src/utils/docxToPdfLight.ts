import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Lightweight DOCX → PDF conversion.
 * - Uses mammoth to extract clean text from DOCX
 * - Uses pdf-lib to render text into a simple, readable PDF
 *
 * Note: This intentionally does NOT preserve complex formatting (tables, columns, images).
 */
export async function convertDocxToPdfLight(docxBlob: Blob, options?: { title?: string }): Promise<Blob> {
  // Lazy import to reduce initial bundle size
  const mammoth = await import('mammoth');

  const arrayBuffer = await docxBlob.arrayBuffer();
  const { value: rawText } = await mammoth.extractRawText({ arrayBuffer } as any);

  // Normalize/sanitize text for WinAnsi (StandardFonts) compatibility
  const sanitizeForWinAnsi = (input: string): string => {
    return input
      // remove zero-width characters
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      // normalize NBSP
      .replace(/\u00A0/g, ' ')
      // curly quotes → straight
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // en/em dashes → hyphen
      .replace(/[\u2013\u2014]/g, '-')
      // ellipsis → three dots
      .replace(/\u2026/g, '...')
      // any remaining non-ISO-8859-1 characters → '?'
      .replace(/[^\x00-\xFF]/g, '?');
  };

  const safeText = sanitizeForWinAnsi(rawText);

  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageMargin = { top: 50, right: 50, bottom: 50, left: 50 };
  const fontSize = 12;
  const lineHeight = fontSize * 1.35;

  let page = pdfDoc.addPage([612, 792]); // Letter size in points
  const maxWidth = page.getWidth() - (pageMargin.left + pageMargin.right);

  let cursorY = page.getHeight() - pageMargin.top;

  // Optional title header
  if (options?.title) {
    const titleSize = 18;
    page.drawText(options.title, {
      x: pageMargin.left,
      y: cursorY,
      size: titleSize,
      font: helvetica,
      color: rgb(0, 0, 0)
    });
    cursorY -= titleSize * 1.8;
  }

  const paragraphs = safeText
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/g) // blank lines denote paragraph breaks
    .map(p => p.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    // Simple word-wrapping based on font metrics
    const words = paragraph.split(/\s+/);
    let line = '';

    const flushLine = (text: string) => {
      if (!text) return;
      // Page break if needed
      if (cursorY - lineHeight < pageMargin.bottom) {
        page = pdfDoc.addPage([612, 792]);
        cursorY = page.getHeight() - pageMargin.top;
      }
      page.drawText(text, {
        x: pageMargin.left,
        y: cursorY,
        size: fontSize,
        font: helvetica,
        color: rgb(0, 0, 0)
      });
      cursorY -= lineHeight;
    };

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = helvetica.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth && line) {
        flushLine(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    flushLine(line);
    // Paragraph spacing
    cursorY -= lineHeight * 0.5;
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


