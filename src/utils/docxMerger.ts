import PizZip from 'pizzip';

/**
 * Creates a title paragraph for exhibit groups
 */
function createExhibitTitleParagraph(doc: Document, title: string): Element {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = doc.createElementNS(ns, 'w:p');
  
  // Paragraph properties for title styling
  const pPr = doc.createElementNS(ns, 'w:pPr');
  
  // Add paragraph alignment (center)
  const jc = doc.createElementNS(ns, 'w:jc');
  jc.setAttribute('w:val', 'center');
  pPr.appendChild(jc);
  
  // Add shading for blue background bar
  const shd = doc.createElementNS(ns, 'w:shd');
  shd.setAttribute('w:fill', 'D9E1F2'); // Light blue color (similar to the blue bar)
  shd.setAttribute('w:val', 'clear');
  pPr.appendChild(shd);
  
  // Add spacing
  const spacing = doc.createElementNS(ns, 'w:spacing');
  spacing.setAttribute('w:before', '240'); // Space before
  spacing.setAttribute('w:after', '120'); // Space after
  pPr.appendChild(spacing);
  
  // Add paragraph style
  const pStyle = doc.createElementNS(ns, 'w:pStyle');
  pStyle.setAttribute('w:val', 'Heading1');
  pPr.appendChild(pStyle);
  p.appendChild(pPr);
  
  // Run for the title text
  const r = doc.createElementNS(ns, 'w:r');
  const rPr = doc.createElementNS(ns, 'w:rPr');
  
  // Bold text
  const b = doc.createElementNS(ns, 'w:b');
  rPr.appendChild(b);
  
  // Uppercase text
  const caps = doc.createElementNS(ns, 'w:caps');
  rPr.appendChild(caps);
  
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
        const nameLower = meta.name.toLowerCase();
        // Check for various "not included" patterns (with/without spaces, different cases, dashes)
        // Pattern: "not - include", "not - included", "not include", "not included", etc.
        // Use regex to handle variations with spaces, dashes, and different word boundaries
        // More comprehensive pattern matching for "not included" variations
        // Check for "not" followed by optional spaces/dashes and "include" (with or without 'd')
        const hasNot = nameLower.includes('not');
        const hasInclude = nameLower.includes('include');
        
        // If it has both "not" and "include", check the pattern more carefully
        let isNotIncluded = false;
        if (hasNot && hasInclude) {
          // Check various patterns - use lookahead to avoid requiring a character after "include"
          const patterns = [
            /not\s+included/i,                    // "not included"
            /not\s+include(?!d)/i,                // "not include" (not followed by 'd')
            /not\s*-\s*include(?!d)/i,            // "not - include" or "not-include" (not followed by 'd')
            /not\s*-\s*included/i,                // "not - included" or "not-included"
            /notincluded/i,                       // "notincluded"
            /notinclude(?!d)/i,                   // "notinclude" (not followed by 'd')
            /not\s*-\s*include\b/i                // "not - include" (word boundary, more flexible)
          ];
          
          isNotIncluded = patterns.some(pattern => pattern.test(nameLower));
          
          // Fallback: If "not" appears before "include" and it's not "included", it's likely "not include"
          if (!isNotIncluded) {
            const notIndex = nameLower.indexOf('not');
            const includeIndex = nameLower.indexOf('include');
            if (notIndex !== -1 && includeIndex !== -1 && notIndex < includeIndex) {
              // Check if it's "included" (with 'd') - if not, it's "not include"
              const afterInclude = nameLower.substring(includeIndex + 7); // "include" is 7 chars
              if (!afterInclude.startsWith('d')) {
                isNotIncluded = true;
              }
            }
          }
        }
        
        if (isNotIncluded) {
          groupedExhibits!.notIncluded.push(index);
          console.log(`   📌 [${index}] "${meta.name}" → NOT INCLUDED`);
        } else {
          groupedExhibits!.included.push(index);
          console.log(`   📌 [${index}] "${meta.name}" → INCLUDED`);
        }
      });
      console.log('📋 Grouped exhibits:', {
        included: groupedExhibits.included.length,
        notIncluded: groupedExhibits.notIncluded.length,
        includedIndices: groupedExhibits.included,
        notIncludedIndices: groupedExhibits.notIncluded
      });
    } else {
      console.warn('⚠️ Metadata length mismatch or missing:', {
        metadataLength: exhibitMetadata?.length,
        blobsLength: exhibitDocxBlobs.length
      });
    }

    // Helper function to merge a single exhibit (defined before use)
    const mergeExhibit = async (
      mainDoc: Document,
      mainBody: Element,
      exhibitBlob: Blob,
      parser: DOMParser,
      addPageBreak: boolean = true,
      skipFirstHeading: boolean = false,
      isIncludedExhibit: boolean = false
    ): Promise<void> => {
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
      let skippedFirstHeading = false;
      
      for (const child of children) {
        // Skip the final sectPr (section properties) - keep only main doc's sectPr
        if (child.nodeName === 'w:sectPr') {
          continue;
        }
        
        // Check if this is a paragraph (heading or content)
        if (child.nodeName === 'w:p' && child instanceof Element) {
          const pElement = child as Element;
          
          // Get all text from this paragraph
          const textNodes = pElement.getElementsByTagName('w:t');
          let paragraphText = '';
          for (let i = 0; i < textNodes.length; i++) {
            paragraphText += (textNodes[i].textContent || '');
          }
          const lowerText = paragraphText.toLowerCase();
          
          // Check if this paragraph is a heading
          const pStyle = pElement.getElementsByTagName('w:pStyle')[0];
          const isHeading = pStyle && (
            pStyle.getAttribute('w:val')?.toLowerCase().includes('heading') ||
            pStyle.getAttribute('w:val')?.toLowerCase().includes('title')
          );
          
          // For INCLUDED exhibits: Skip ANY content that contains "NOT INCLUDED" patterns
          // Check ALL paragraphs, not just headings or long ones
          if (isIncludedExhibit) {
            // Check for various "not included" patterns (with/without spaces, different cases)
            const hasNotIncluded = lowerText.includes('not included') ||
                                  lowerText.includes('not include') ||
                                  lowerText.includes('notincluded') ||
                                  lowerText.includes('notinclude') ||
                                  lowerText.includes('not-include') ||
                                  lowerText.includes('not-included') ||
                                  lowerText.includes('exhibit 2');
            if (hasNotIncluded) {
              console.log(`   ⏭️  Skipping "NOT INCLUDED" content from included exhibit: ${paragraphText.substring(0, 50)}...`);
              continue;
            }
          }
          
          // For NOT INCLUDED exhibits: Skip first heading (already handled by main header)
          if (skipFirstHeading && !skippedFirstHeading) {
            // Check for various "not included" patterns
            const hasNotIncluded = lowerText.includes('not included') ||
                                  lowerText.includes('not include') ||
                                  lowerText.includes('notincluded') ||
                                  lowerText.includes('notinclude') ||
                                  lowerText.includes('not-include') ||
                                  lowerText.includes('not-included') ||
                                  lowerText.includes('exhibit 2');
            if (isHeading || hasNotIncluded) {
              console.log(`   ⏭️  Skipping first heading from exhibit (main "Exhibit 2" header already added)`);
              skippedFirstHeading = true;
              continue;
            }
          }
          
          // For NOT INCLUDED exhibits: Skip any headings/content that contain "INCLUDED"
          if (!isIncludedExhibit && (isHeading || paragraphText.length > 50)) {
            if (lowerText.includes('included') && !lowerText.includes('not included') && !lowerText.includes('exhibit 1')) {
              console.log(`   ⏭️  Skipping "INCLUDED" content from not included exhibit: ${paragraphText.substring(0, 50)}...`);
              continue;
            }
          }
        }
        
        // Import the node into the main document
        const importedNode = mainDoc.importNode(child, true);
        mainBody.insertBefore(importedNode, mainBody.lastChild);
      }

      console.log(`✅ Exhibit merged`);
    };

    // Process exhibits in groups if grouping is available
    // ORDER: 1) All Included exhibits first, 2) Then "Exhibit 2" header, 3) Then all Not Included exhibits
    console.log('🔍 Checking grouping conditions:', {
      hasGroupedExhibits: !!groupedExhibits,
      includedCount: groupedExhibits?.included.length || 0,
      notIncludedCount: groupedExhibits?.notIncluded.length || 0
    });
    
    if (groupedExhibits && (groupedExhibits.included.length > 0 || groupedExhibits.notIncluded.length > 0)) {
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      
      console.log('✅ Using grouped exhibit processing');
      
      // STEP 1: Process ALL Included exhibits FIRST
      if (groupedExhibits.included.length > 0) {
        console.log(`📋 STEP 1: Processing ${groupedExhibits.included.length} Included exhibit(s)...`);
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
        
        // Merge ALL Included exhibits (they will come right after the title)
        // Pass isIncludedExhibit=true to filter out any "NOT INCLUDED" content
        for (const index of groupedExhibits.included) {
          console.log(`📎 Processing Included exhibit ${index + 1}...`);
          await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[index], parser, false, false, true); // isIncludedExhibit=true
        }
        console.log(`✅ Completed all ${groupedExhibits.included.length} Included exhibits`);
      }
      
      // STEP 2: AFTER all Included exhibits are done, add "Exhibit 2" header FIRST
      // STEP 3: THEN process all Not Included exhibits (their tables will appear below the header)
      if (groupedExhibits.notIncluded.length > 0) {
        console.log(`📋 STEP 2 & 3: Processing ${groupedExhibits.notIncluded.length} Not Included exhibit(s)...`);
        console.log(`📋 Not Included exhibit indices:`, groupedExhibits.notIncluded);
        console.log(`📋 Not Included exhibit names:`, groupedExhibits.notIncluded.map(idx => exhibitMetadata?.[idx]?.name || `[${idx}]`));
        
        // Add page break before the Not Included group (but not before title)
        const pageBreak = mainDoc.createElementNS(ns, 'w:p');
        const pageBreakRun = mainDoc.createElementNS(ns, 'w:r');
        const br = mainDoc.createElementNS(ns, 'w:br');
        br.setAttribute('w:type', 'page');
        pageBreakRun.appendChild(br);
        pageBreak.appendChild(pageBreakRun);
        mainBody.insertBefore(pageBreak, mainBody.lastChild);
        
        // Add "Exhibit 2" header FIRST - before any not included tables
        console.log('📌 Adding "Exhibit 2 - NOT INCLUDED IN MIGRATION FEATURES" header...');
        const titleP = createExhibitTitleParagraph(mainDoc, 'Exhibit 2 - NOT INCLUDED IN MIGRATION FEATURES');
        mainBody.insertBefore(titleP, mainBody.lastChild);
        console.log('✅ "Exhibit 2" header added successfully');
        
        // Merge ALL Not Included exhibits (their content will appear BELOW the "Exhibit 2" header)
        // Skip the first heading from each exhibit since we already have the main "Exhibit 2" header
        // Pass isIncludedExhibit=false to filter out any "INCLUDED" content
        for (const index of groupedExhibits.notIncluded) {
          console.log(`📎 Processing Not Included exhibit ${index + 1}...`);
          await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[index], parser, false, true, false); // skipFirstHeading=true, isIncludedExhibit=false
        }
        console.log(`✅ Completed all ${groupedExhibits.notIncluded.length} Not Included exhibits`);
      }
    } else {
      // Fallback: Process exhibits in order without grouping
      console.log('⚠️ No grouping available, processing exhibits in order without headers');
      for (let i = 0; i < exhibitDocxBlobs.length; i++) {
        console.log(`📎 Processing exhibit ${i + 1}/${exhibitDocxBlobs.length}...`);
        await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[i], parser, true); // true = add page break
      }
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

