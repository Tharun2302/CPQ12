const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// Function to create a complete template with quote content and signature sections
async function mergeQuoteWithPlaceholders(templateFile, quoteData, quoteNumber) {
  try {
    console.log('🔄 Starting PDF merge process with complete template structure...');
    console.log('📋 Quote data type:', typeof quoteData);
    console.log('📋 Quote data keys:', Object.keys(quoteData || {}));
    console.log('📄 Quote number:', quoteNumber);
    
    // Create a new PDF document with multiple pages
    const pdfDoc = await PDFDocument.create();
    
    // Get fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Page 1: Header and Quote Information
    const page1 = pdfDoc.addPage([612, 792]); // Standard letter size
    const page1Width = page1.getWidth();
    const page1Height = page1.getHeight();
    
    // Draw header on page 1
    page1.drawText('CloudFuze Purchase Agreement', {
      x: 50,
      y: page1Height - 100,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw quote information on page 1
    page1.drawText(`Quote Number: ${quoteNumber}`, {
      x: 50,
      y: page1Height - 150,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Draw client information on page 1
    if (quoteData.clientName) {
      page1.drawText(`Client: ${quoteData.clientName}`, {
        x: 50,
        y: page1Height - 180,
        size: 12,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }
    
    // Draw quote details on page 1
    if (quoteData.migrationType) {
      page1.drawText(`Migration Type: ${quoteData.migrationType}`, {
        x: 50,
        y: page1Height - 210,
        size: 12,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }
    
    if (quoteData.instanceType) {
      page1.drawText(`Instance Type: ${quoteData.instanceType}`, {
        x: 50,
        y: page1Height - 240,
        size: 12,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }
    
    if (quoteData.duration) {
      page1.drawText(`Duration: ${quoteData.duration} months`, {
        x: 50,
        y: page1Height - 270,
        size: 12,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }
    
    if (quoteData.totalPrice) {
      page1.drawText(`Total Price: $${quoteData.totalPrice.toLocaleString()}`, {
        x: 50,
        y: page1Height - 300,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
    }
    
    // Page 2: Additional Terms and Conditions
    const page2 = pdfDoc.addPage([612, 792]);
    const page2Width = page2.getWidth();
    const page2Height = page2.getHeight();
    
    // Draw terms and conditions on page 2
    page2.drawText('Terms and Conditions', {
      x: 50,
      y: page2Height - 100,
      size: 20,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page2.drawText('1. Service Agreement: This agreement outlines the terms for CloudFuze migration services.', {
      x: 50,
      y: page2Height - 150,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    page2.drawText('2. Payment Terms: Payment is due upon completion of services.', {
      x: 50,
      y: page2Height - 180,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    page2.drawText('3. Service Delivery: Services will be delivered according to the agreed timeline.', {
      x: 50,
      y: page2Height - 210,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    page2.drawText('4. Support: Technical support is included for the duration specified.', {
      x: 50,
      y: page2Height - 240,
      size: 12,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    
    // Page 3: Signature Section
    const page3 = pdfDoc.addPage([612, 792]);
    const page3Width = page3.getWidth();
    const page3Height = page3.getHeight();
    
    // Add signature sections to the third page
    if (quoteData.signatureData || quoteData.clientSignatureData) {
      // User signature section (left side) - matching reference image format
      if (quoteData.signatureData) {
        page3.drawText('For CloudFuze, Inc.', {
          x: 50,
          y: page3Height - 300,
          size: 14,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        
        // Draw underlined spaces for signature fields
        const leftLineY = page3Height - 320;
        const lineLength = 150;
        
        // Draw underline for "By:" field
        page3.drawLine({
          start: { x: 50, y: leftLineY },
          end: { x: 50 + lineLength, y: leftLineY },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        // Draw underline for "Name:" field
        page3.drawLine({
          start: { x: 50, y: leftLineY - 25 },
          end: { x: 50 + lineLength, y: leftLineY - 25 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        // Draw underline for "Title:" field
        page3.drawLine({
          start: { x: 50, y: leftLineY - 50 },
          end: { x: 50 + lineLength, y: leftLineY - 50 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        // Draw underline for "Date:" field
        page3.drawLine({
          start: { x: 50, y: leftLineY - 75 },
          end: { x: 50 + lineLength, y: leftLineY - 75 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        // Draw labels
        page3.drawText('By:', {
          x: 50,
          y: leftLineY + 5,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        page3.drawText('Name:', {
          x: 50,
          y: leftLineY - 20,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        page3.drawText('Title:', {
          x: 50,
          y: leftLineY - 45,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        page3.drawText('Date:', {
          x: 50,
          y: leftLineY - 70,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        // Draw user signature data on the underlined spaces
        // User signature (above the "By:" line)
        page3.drawText(quoteData.signatureData.eSignature || 'User Signature', {
          x: 50,
          y: leftLineY + 15,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        // User name (on the "Name:" underline)
        page3.drawText(quoteData.signatureData.fullName || 'CloudFuze User', {
          x: 50,
          y: leftLineY - 10,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        // User title (on the "Title:" underline)
        page3.drawText(quoteData.signatureData.title || 'CloudFuze Representative', {
          x: 50,
          y: leftLineY - 35,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        // User date (on the "Date:" underline)
        page3.drawText(quoteData.signatureData.date || new Date().toISOString().split('T')[0], {
          x: 50,
          y: leftLineY - 60,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
      }
      
      // Client signature section (right side) - matching reference image format
      if (quoteData.clientSignatureData) {
        // Client company name (should be dynamic based on quote data)
        const clientCompanyName = quoteData.clientName ? `${quoteData.clientName}, Inc.` : 'Client Company, Inc.';
        
        page3.drawText(`For ${clientCompanyName}`, {
          x: 350,
          y: page3Height - 300,
          size: 14,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        
        // Draw underlined spaces for signature fields
        const lineY = page3Height - 320;
        const lineLength = 150;
        
        // Draw underline for "By:" field
        page3.drawLine({
          start: { x: 350, y: lineY },
          end: { x: 350 + lineLength, y: lineY },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        // Draw underline for "Name:" field
        page3.drawLine({
          start: { x: 350, y: lineY - 25 },
          end: { x: 350 + lineLength, y: lineY - 25 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        // Draw underline for "Title:" field
        page3.drawLine({
          start: { x: 350, y: lineY - 50 },
          end: { x: 350 + lineLength, y: lineY - 50 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        // Draw underline for "Date:" field
        page3.drawLine({
          start: { x: 350, y: lineY - 75 },
          end: { x: 350 + lineLength, y: lineY - 75 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        
        // Draw labels
        page3.drawText('By:', {
          x: 350,
          y: lineY + 5,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        page3.drawText('Name:', {
          x: 350,
          y: lineY - 20,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        page3.drawText('Title:', {
          x: 350,
          y: lineY - 45,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        page3.drawText('Date:', {
          x: 350,
          y: lineY - 70,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        // Draw client signature data on the underlined spaces
        // Client signature (above the "By:" line)
        page3.drawText(quoteData.clientSignatureData.eSignature || 'Client Signature', {
          x: 350,
          y: lineY + 15,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        // Client name (on the "Name:" underline)
        page3.drawText(quoteData.clientSignatureData.fullName || 'Client Name', {
          x: 350,
          y: lineY - 10,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        // Client title (on the "Title:" underline)
        page3.drawText(quoteData.clientSignatureData.title || 'Client Title', {
          x: 350,
          y: lineY - 35,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
        
        // Client date (on the "Date:" underline)
        page3.drawText(quoteData.clientSignatureData.date || new Date().toISOString().split('T')[0], {
          x: 350,
          y: lineY - 60,
          size: 12,
          font: helveticaFont,
          color: rgb(0, 0, 0),
        });
      }
    }
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Create blob-like object
    const blob = {
      arrayBuffer: async () => pdfBytes,
      size: pdfBytes.length,
      type: 'application/pdf'
    };
    
    console.log('✅ Complete template PDF created successfully with 3 pages');
    console.log('📄 Page 1: Quote information and details');
    console.log('📄 Page 2: Terms and conditions');
    console.log('📄 Page 3: Signature sections (user left, client right)');
    
    return {
      quoteBlob: blob,
      newTemplateBlob: blob
    };
    
  } catch (error) {
    console.error('❌ Error in mergeQuoteWithPlaceholders:', error);
    throw error;
  }
}

module.exports = {
  mergeQuoteWithPlaceholders
};
