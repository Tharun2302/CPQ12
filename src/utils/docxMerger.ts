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
  
  // Solid shading for full-width bar - light sky blue to match reference (#88D1E6)
  const shd = doc.createElementNS(ns, 'w:shd');
  shd.setAttribute('w:fill', '88D1E6'); // Light sky blue / cyan - one solid color across full width
  shd.setAttribute('w:val', 'clear');
  pPr.appendChild(shd);
  
  // Add spacing
  const spacing = doc.createElementNS(ns, 'w:spacing');
  spacing.setAttribute('w:before', '240'); // Space before
  spacing.setAttribute('w:after', '120'); // Space after
  pPr.appendChild(spacing);
  
  // Do not use Heading1 style - template theme can add gradient (purple/blue/white). Use explicit formatting only.
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
 * @param exhibitMetadata - Optional array of exhibit metadata (name, category, includeType) for grouping
 * @returns Promise<Blob> - The merged DOCX file
 */
export async function mergeDocxFiles(
  mainDocx: Blob,
  exhibitDocxBlobs: Blob[],
  exhibitMetadata?: Array<{ name: string; category?: string; includeType?: 'included' | 'notincluded' }>
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

    // Helper to merge styles from exhibit into main document
    const mergeStylesFromExhibit = (exhibitZip: PizZip) => {
      try {
        const exhibitStylesXml = exhibitZip.file('word/styles.xml')?.asText();
        if (!exhibitStylesXml) {
          console.log('   ℹ️  No styles.xml in exhibit, skipping style merge');
          return;
        }

        const mainStylesXml = mainZip.file('word/styles.xml')?.asText();
        if (!mainStylesXml) {
          console.log('   ⚠️  Main document has no styles.xml, creating one from exhibit');
          mainZip.file('word/styles.xml', exhibitStylesXml);
          return;
        }

        // Parse both style documents
        const parser = new DOMParser();
        const mainStylesDoc = parser.parseFromString(mainStylesXml, 'text/xml');
        const exhibitStylesDoc = parser.parseFromString(exhibitStylesXml, 'text/xml');
        
        const mainStylesRoot = mainStylesDoc.getElementsByTagName('w:styles')[0];
        const exhibitStylesRoot = exhibitStylesDoc.getElementsByTagName('w:styles')[0];
        
        if (!mainStylesRoot || !exhibitStylesRoot) {
          console.log('   ⚠️  Could not find styles root, skipping style merge');
          return;
        }

        // Copy unique styles from exhibit that don't exist in main
        const mainStyleIds = new Set();
        Array.from(mainStylesRoot.getElementsByTagName('w:style')).forEach(style => {
          const styleId = style.getAttribute('w:styleId');
          if (styleId) mainStyleIds.add(styleId);
        });

        let stylesAdded = 0;
        Array.from(exhibitStylesRoot.getElementsByTagName('w:style')).forEach(exhibitStyle => {
          const styleId = exhibitStyle.getAttribute('w:styleId');
          if (styleId && !mainStyleIds.has(styleId)) {
            const importedStyle = mainStylesDoc.importNode(exhibitStyle, true);
            mainStylesRoot.appendChild(importedStyle);
            mainStyleIds.add(styleId);
            stylesAdded++;
          }
        });

        if (stylesAdded > 0) {
          const serializer = new XMLSerializer();
          const updatedStylesXml = serializer.serializeToString(mainStylesDoc);
          mainZip.file('word/styles.xml', updatedStylesXml);
          console.log(`   ✅ Merged ${stylesAdded} unique style(s) from exhibit`);
        } else {
          console.log('   ℹ️  No new styles to merge (all exhibit styles already exist in main)');
        }
      } catch (error) {
        console.warn('   ⚠️  Error merging styles (continuing without styles):', error);
      }
    };

    console.log('✅ Main document loaded, extracting body content...');

    // Parse main document XML
    const parser = new DOMParser();
    const mainDoc = parser.parseFromString(mainXml, 'text/xml');
    const mainBody = mainDoc.getElementsByTagName('w:body')[0];
    const mainRoot = mainDoc.documentElement; // <w:document ...xmlns:* />

    if (!mainBody) {
      throw new Error('Could not find main document body');
    }
    if (!mainRoot) {
      throw new Error('Could not find main document root element');
    }

    // Ensure the merged XML contains all namespace declarations used by appended exhibits.
    // Without this, XMLSerializer (and/or Word) can fail when imported nodes contain prefixes
    // that are only declared on the exhibit's <w:document>.
    const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
    const ensureNamespacesFromExhibit = (exhibitDoc: Document) => {
      const exhibitRoot = exhibitDoc.documentElement;
      if (!exhibitRoot) return;

      // Copy all xmlns declarations from exhibit root to main root when missing
      const attrs = Array.from(exhibitRoot.attributes || []);
      for (const attr of attrs) {
        const name = attr.name || '';
        if (name === 'xmlns') {
          // Default namespace
          if (!mainRoot.getAttribute('xmlns')) {
            mainRoot.setAttribute('xmlns', attr.value);
          }
          continue;
        }
        if (name.startsWith('xmlns:')) {
          if (!mainRoot.getAttribute(name)) {
            // Use namespace-aware setter for xmlns:* attributes
            mainRoot.setAttributeNS(XMLNS_NS, name, attr.value);
          }
        }
      }
    };

    // Group exhibits by Included/Not Included if metadata is provided
    let groupedExhibits: { included: number[]; notIncluded: number[] } | null = null;
    
    if (exhibitMetadata && exhibitMetadata.length === exhibitDocxBlobs.length) {
      groupedExhibits = { included: [], notIncluded: [] };
      exhibitMetadata.forEach((meta, index) => {
        // Use stored includeType from upload selection when present
        if (meta.includeType === 'notincluded') {
          groupedExhibits!.notIncluded.push(index);
          console.log(`   📌 [${index}] "${meta.name}" → NOT INCLUDED (from includeType)`);
          return;
        }
        if (meta.includeType === 'included') {
          groupedExhibits!.included.push(index);
          console.log(`   📌 [${index}] "${meta.name}" → INCLUDED (from includeType)`);
          return;
        }
        // Fallback: infer from name for older exhibits without includeType
        const nameLower = meta.name.toLowerCase();
        const hasNot = nameLower.includes('not');
        const hasInclude = nameLower.includes('include');
        let isNotIncluded = false;
        if (hasNot && hasInclude) {
          const patterns = [
            /not\s+included/i,
            /not\s+include(?!d)/i,
            /not\s*-\s*include(?!d)/i,
            /not\s*-\s*included/i,
            /notincluded/i,
            /notinclude(?!d)/i,
            /not\s*-\s*include\b/i
          ];
          isNotIncluded = patterns.some(pattern => pattern.test(nameLower));
          if (!isNotIncluded) {
            const notIndex = nameLower.indexOf('not');
            const includeIndex = nameLower.indexOf('include');
            if (notIndex !== -1 && includeIndex !== -1 && notIndex < includeIndex) {
              const afterInclude = nameLower.substring(includeIndex + 7);
              if (!afterInclude.startsWith('d')) {
                isNotIncluded = true;
              }
            }
          }
        }
        if (isNotIncluded) {
          groupedExhibits!.notIncluded.push(index);
          console.log(`   📌 [${index}] "${meta.name}" → NOT INCLUDED (from name)`);
        } else {
          groupedExhibits!.included.push(index);
          console.log(`   📌 [${index}] "${meta.name}" → INCLUDED (from name)`);
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
      // IMPORTANT: Bring over any missing xmlns declarations so imported nodes serialize correctly.
      ensureNamespacesFromExhibit(exhibitDoc);
      
      if (!exhibitBody) {
        console.warn(`⚠️ Could not find exhibit body, skipping`);
        return;
      }

      // Merge styles from exhibit to preserve table and formatting styles
      console.log('   📐 Merging styles from exhibit to preserve table formatting...');
      mergeStylesFromExhibit(exhibitZip);

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
        
        // Handle tables explicitly to ensure all properties are preserved
        if (child.nodeName === 'w:tbl' && child instanceof Element) {
          // Tables should be imported with all properties (tblPr, alignment, borders, etc.)
          const importedTable = mainDoc.importNode(child, true);
          mainBody.insertBefore(importedTable, mainBody.lastChild);
          console.log('   📊 Imported table with all properties preserved');
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
          
          // Skip first heading (already handled by main header) for NOT INCLUDED exhibits only
          // For INCLUDED exhibits, preserve ALL content including headings to maintain exact document structure
          if (skipFirstHeading && !skippedFirstHeading && !isIncludedExhibit) {
            // For NOT INCLUDED exhibits: Check for various "not included" patterns
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
        
        // Import the node into the main document (deep clone to preserve all properties)
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
        // For included exhibits, preserve the EXACT document structure - don't skip headings
        // Only filter out "NOT INCLUDED" content to maintain exact formatting and table structure
        // Pass skipFirstHeading=false to preserve all content including headings
        // Pass isIncludedExhibit=true to filter out any "NOT INCLUDED" content
        for (const index of groupedExhibits.included) {
          console.log(`📎 Processing Included exhibit ${index + 1}...`);
          try {
            await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[index], parser, false, false, true); // skipFirstHeading=false, isIncludedExhibit=true
          } catch (e) {
            console.error('❌ Failed to merge an Included exhibit (skipping):', {
              index,
              name: exhibitMetadata?.[index]?.name,
              error: e
            });
          }
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
          try {
            await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[index], parser, false, true, false); // skipFirstHeading=true, isIncludedExhibit=false
          } catch (e) {
            console.error('❌ Failed to merge a Not Included exhibit (skipping):', {
              index,
              name: exhibitMetadata?.[index]?.name,
              error: e
            });
          }
        }
        console.log(`✅ Completed all ${groupedExhibits.notIncluded.length} Not Included exhibits`);
      }
    } else {
      // Fallback: Process exhibits in order without grouping
      console.log('⚠️ No grouping available, processing exhibits in order without headers');
      for (let i = 0; i < exhibitDocxBlobs.length; i++) {
        console.log(`📎 Processing exhibit ${i + 1}/${exhibitDocxBlobs.length}...`);
        try {
          await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[i], parser, true); // true = add page break
        } catch (e) {
          console.error('❌ Failed to merge an exhibit (skipping):', {
            index: i,
            name: exhibitMetadata?.[i]?.name,
            error: e
          });
        }
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

