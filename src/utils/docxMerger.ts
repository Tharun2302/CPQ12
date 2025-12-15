import PizZip from 'pizzip';

/**
 * Creates a title paragraph for exhibit groups
 */
function createExhibitTitleParagraph(doc: Document, title: string): Element {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = doc.createElementNS(ns, 'w:p');
  
  // Paragraph properties for title styling
  const pPr = doc.createElementNS(ns, 'w:pPr');
  const pStyle = doc.createElementNS(ns, 'w:pStyle');
  pStyle.setAttribute('w:val', 'Heading1');
  pPr.appendChild(pStyle);
  p.appendChild(pPr);
  
  // Run for the title text
  const r = doc.createElementNS(ns, 'w:r');
  const rPr = doc.createElementNS(ns, 'w:rPr');
  const b = doc.createElementNS(ns, 'w:b');
  rPr.appendChild(b);
  r.appendChild(rPr);
  
  const t = doc.createElementNS(ns, 'w:t');
  t.textContent = title;
  r.appendChild(t);
  p.appendChild(r);
  
  return p;
}

/**
 * Merges multiple DOCX files into one, grouped by Included/Not Included
 * @param mainDocx - The main processed template DOCX blob
 * @param exhibitDocxBlobs - Array of exhibit DOCX blobs to append
 * @param exhibitMetadata - Optional array of exhibit metadata (name, category) for grouping
 * @returns Promise<Blob> - The merged DOCX file
 */
export async function mergeDocxFiles(
  mainDocx: Blob,
  exhibitDocxBlobs: Blob[],
  exhibitMetadata?: Array<{ name: string; category?: string }>
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

    // Group exhibits by Included/Not Included if metadata is provided
    let groupedExhibits: { included: number[]; notIncluded: number[] } | null = null;
    
    if (exhibitMetadata && exhibitMetadata.length === exhibitDocxBlobs.length) {
      groupedExhibits = { included: [], notIncluded: [] };
      exhibitMetadata.forEach((meta, index) => {
        const isNotIncluded = meta.name.toLowerCase().includes('not included');
        if (isNotIncluded) {
          groupedExhibits!.notIncluded.push(index);
        } else {
          groupedExhibits!.included.push(index);
        }
      });
      console.log('📋 Grouped exhibits:', {
        included: groupedExhibits.included.length,
        notIncluded: groupedExhibits.notIncluded.length
      });
    }

    // Process exhibits in groups if grouping is available
    if (groupedExhibits && (groupedExhibits.included.length > 0 || groupedExhibits.notIncluded.length > 0)) {
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      
      // Process Included exhibits group
      if (groupedExhibits.included.length > 0) {
        // Add page break before the group (but not before title)
        const pageBreak = mainDoc.createElementNS(ns, 'w:p');
        const pageBreakRun = mainDoc.createElementNS(ns, 'w:r');
        const br = mainDoc.createElementNS(ns, 'w:br');
        br.setAttribute('w:type', 'page');
        pageBreakRun.appendChild(br);
        pageBreak.appendChild(pageBreakRun);
        mainBody.insertBefore(pageBreak, mainBody.lastChild);
        
        // Add title for Included group (no page break after title)
        const titleP = createExhibitTitleParagraph(mainDoc, 'Exhibit 1 - INCLUDED IN MIGRATION');
        mainBody.insertBefore(titleP, mainBody.lastChild);
        
        // Merge all Included exhibits (they will come right after the title)
        for (const index of groupedExhibits.included) {
          console.log(`📎 Processing Included exhibit ${index + 1}...`);
          await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[index], parser, false); // false = no page break before exhibit
        }
      }
      
      // Process Not Included exhibits group
      if (groupedExhibits.notIncluded.length > 0) {
        // Add page break before the group (but not before title)
        const pageBreak = mainDoc.createElementNS(ns, 'w:p');
        const pageBreakRun = mainDoc.createElementNS(ns, 'w:r');
        const br = mainDoc.createElementNS(ns, 'w:br');
        br.setAttribute('w:type', 'page');
        pageBreakRun.appendChild(br);
        pageBreak.appendChild(pageBreakRun);
        mainBody.insertBefore(pageBreak, mainBody.lastChild);
        
        // Add title for Not Included group (no page break after title)
        const titleP = createExhibitTitleParagraph(mainDoc, 'Exhibit 2 - NOT INCLUDED IN MIGRATION');
        mainBody.insertBefore(titleP, mainBody.lastChild);
        
        // Merge all Not Included exhibits (they will come right after the title)
        for (const index of groupedExhibits.notIncluded) {
          console.log(`📎 Processing Not Included exhibit ${index + 1}...`);
          await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[index], parser, false); // false = no page break before exhibit
        }
      }
    } else {
      // Fallback: Process exhibits in order without grouping
      for (let i = 0; i < exhibitDocxBlobs.length; i++) {
        console.log(`📎 Processing exhibit ${i + 1}/${exhibitDocxBlobs.length}...`);
        await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[i], parser, true); // true = add page break
      }
    }
    
    // Helper function to merge a single exhibit
    async function mergeExhibit(
      mainDoc: Document,
      mainBody: Element,
      exhibitBlob: Blob,
      parser: DOMParser,
      addPageBreak: boolean = true
    ): Promise<void> {
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      
      const exhibitBuffer = await exhibitBlob.arrayBuffer();
      const exhibitZip = new PizZip(exhibitBuffer);
      const exhibitXml = exhibitZip.file('word/document.xml')?.asText();
      
      if (!exhibitXml) {
        console.warn(`⚠️ Could not read exhibit XML, skipping`);
        return;
      }

      const exhibitDoc = parser.parseFromString(exhibitXml, 'text/xml');
      const exhibitBody = exhibitDoc.getElementsByTagName('w:body')[0];
      
      if (!exhibitBody) {
        console.warn(`⚠️ Could not find exhibit body, skipping`);
        return;
      }

      // Add page break before exhibit only if requested
      if (addPageBreak) {
        const pageBreak = mainDoc.createElementNS(ns, 'w:p');
        const pageBreakRun = mainDoc.createElementNS(ns, 'w:r');
        const br = mainDoc.createElementNS(ns, 'w:br');
        br.setAttribute('w:type', 'page');
        pageBreakRun.appendChild(br);
        pageBreak.appendChild(pageBreakRun);
        mainBody.insertBefore(pageBreak, mainBody.lastChild);
      }

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

      console.log(`✅ Exhibit merged`);
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

