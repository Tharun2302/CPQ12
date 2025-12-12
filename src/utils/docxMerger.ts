import PizZip from 'pizzip';

/**
 * Merges multiple DOCX files into one
 * @param mainDocx - The main processed template DOCX blob
 * @param exhibitDocxBlobs - Array of exhibit DOCX blobs to append
 * @returns Promise<Blob> - The merged DOCX file
 */
export async function mergeDocxFiles(
  mainDocx: Blob,
  exhibitDocxBlobs: Blob[]
): Promise<Blob> {
  try {
    console.log('📎 Starting DOCX merge...', {
      mainDocxSize: mainDocx.size,
      exhibitCount: exhibitDocxBlobs.length,
      exhibitSizes: exhibitDocxBlobs.map(b => b.size)
    });

    if (exhibitDocxBlobs.length === 0) {
      console.log('📎 No exhibits to merge, returning main document');
      return mainDocx;
    }

    // Read main document
    const mainBuffer = await mainDocx.arrayBuffer();
    const mainZip = new PizZip(mainBuffer);
    const mainXml = mainZip.file('word/document.xml')?.asText();
    
    if (!mainXml) {
      throw new Error('Could not read main document XML');
    }

    console.log('✅ Main document loaded, extracting body content...');

    // Parse main document XML
    const parser = new DOMParser();
    const mainDoc = parser.parseFromString(mainXml, 'text/xml');
    const mainBody = mainDoc.getElementsByTagName('w:body')[0];

    if (!mainBody) {
      throw new Error('Could not find main document body');
    }

    // Process each exhibit
    for (let i = 0; i < exhibitDocxBlobs.length; i++) {
      console.log(`📎 Processing exhibit ${i + 1}/${exhibitDocxBlobs.length}...`);
      
      const exhibitBuffer = await exhibitDocxBlobs[i].arrayBuffer();
      const exhibitZip = new PizZip(exhibitBuffer);
      const exhibitXml = exhibitZip.file('word/document.xml')?.asText();
      
      if (!exhibitXml) {
        console.warn(`⚠️ Could not read exhibit ${i + 1} XML, skipping`);
        continue;
      }

      const exhibitDoc = parser.parseFromString(exhibitXml, 'text/xml');
      const exhibitBody = exhibitDoc.getElementsByTagName('w:body')[0];
      
      if (!exhibitBody) {
        console.warn(`⚠️ Could not find exhibit ${i + 1} body, skipping`);
        continue;
      }

      // Add page break before exhibit
      const pageBreak = mainDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:p');
      const pageBreakRun = mainDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
      const br = mainDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:br');
      br.setAttribute('w:type', 'page');
      pageBreakRun.appendChild(br);
      pageBreak.appendChild(pageBreakRun);
      mainBody.insertBefore(pageBreak, mainBody.lastChild);

      // Copy all children from exhibit body (except the last sectPr)
      const children = Array.from(exhibitBody.childNodes);
      for (const child of children) {
        // Skip the final sectPr (section properties) - keep only main doc's sectPr
        if (child.nodeName === 'w:sectPr') {
          continue;
        }
        
        // Import the node into the main document
        const importedNode = mainDoc.importNode(child, true);
        mainBody.insertBefore(importedNode, mainBody.lastChild);
      }

      console.log(`✅ Exhibit ${i + 1} merged`);
    }

    // Serialize the merged XML back
    const serializer = new XMLSerializer();
    const mergedXml = serializer.serializeToString(mainDoc);

    // Update the main zip with merged content
    mainZip.file('word/document.xml', mergedXml);

    // Generate the merged DOCX blob
    const mergedBuffer = mainZip.generate({ 
      type: 'arraybuffer',
      compression: 'DEFLATE'
    });
    const mergedBlob = new Blob([mergedBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    console.log('✅ DOCX merge complete!', {
      originalSize: mainDocx.size,
      mergedSize: mergedBlob.size,
      exhibitsMerged: exhibitDocxBlobs.length
    });

    return mergedBlob;

  } catch (error) {
    console.error('❌ Error merging DOCX files:', error);
    throw error;
  }
}

