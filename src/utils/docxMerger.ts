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

function createPageBreakParagraph(doc: Document): Element {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = doc.createElementNS(ns, 'w:p');
  const r = doc.createElementNS(ns, 'w:r');
  const br = doc.createElementNS(ns, 'w:br');
  br.setAttribute('w:type', 'page');
  r.appendChild(br);
  p.appendChild(r);
  return p;
}

export interface VerbatimStripReport {
  drawings: number;
  hyperlinks: number;
  fields: number;
  sectionBreaks: number;
}

function removeAll(root: Element, tagName: string, onRemove?: (el: Element) => void): number {
  const found = Array.from(root.getElementsByTagName(tagName)) as Element[];
  for (const el of found) {
    if (onRemove) onRemove(el);
    el.parentNode?.removeChild(el);
  }
  return found.length;
}

/**
 * Strips the parts of a foreign document that this merger cannot carry across.
 *
 * Only word/document.xml and word/styles.xml are copied - never document.xml.rels,
 * word/media/* or numbering.xml. Anything holding a relationship id would therefore
 * resolve against the HOST document's relationships: a dangling id makes Word demand
 * repair on a signature-bearing agreement, and a colliding one silently rewires the
 * reference to whichever host part owns that id. Field instructions are stripped
 * because INCLUDEPICTURE/INCLUDETEXT/DDE would reach out to an attacker-chosen target
 * on the counter-signer's machine. A paragraph-level w:sectPr is stripped because it
 * defines the section ENDING at that paragraph - i.e. it would retroactively re-page
 * the whole agreement it was appended after.
 *
 * Callers must report what was dropped; silent loss is not acceptable in a contract.
 */
export function stripUnsupportedForVerbatim(el: Element): VerbatimStripReport {
  const report: VerbatimStripReport = { drawings: 0, hyperlinks: 0, fields: 0, sectionBreaks: 0 };

  for (const tag of ['w:drawing', 'w:pict', 'w:object', 'w:altChunk']) {
    report.drawings += removeAll(el, tag);
  }

  // Unwrap rather than delete: the link text is real content, only the target is unusable
  const links = Array.from(el.getElementsByTagName('w:hyperlink')) as Element[];
  for (const link of links) {
    const parent = link.parentNode;
    if (!parent) continue;
    while (link.firstChild) parent.insertBefore(link.firstChild, link);
    parent.removeChild(link);
    report.hyperlinks += 1;
  }

  // w:fldSimple caches its rendered result in child runs, so unwrapping keeps the text
  const simpleFields = Array.from(el.getElementsByTagName('w:fldSimple')) as Element[];
  for (const field of simpleFields) {
    const parent = field.parentNode;
    if (!parent) continue;
    while (field.firstChild) parent.insertBefore(field.firstChild, field);
    parent.removeChild(field);
    report.fields += 1;
  }
  report.fields += removeAll(el, 'w:instrText');
  report.fields += removeAll(el, 'w:fldChar');

  report.sectionBreaks += removeAll(el, 'w:sectPr');

  // Belt and braces: anything still carrying a relationship id loses just the attribute
  for (const attr of ['r:id', 'r:embed', 'r:link']) {
    const holders = Array.from(el.getElementsByTagName('*')) as Element[];
    for (const holder of holders) {
      if (holder.getAttribute && holder.getAttribute(attr)) holder.removeAttribute(attr);
    }
  }

  return report;
}

/**
 * Merges multiple DOCX files into one, grouped by Included/Not Included
 * @param mainDocx - The main processed template DOCX blob
 * @param exhibitDocxBlobs - Array of exhibit DOCX blobs to append
 * @param exhibitMetadata - Optional array of exhibit metadata (name, category, includeType) for grouping
 * @param options - sectionTitle adds a header bar before ungrouped appends (no effect when exhibitMetadata is supplied)
 * @returns Promise<Blob> - The merged DOCX file
 */
export async function mergeDocxFiles(
  mainDocx: Blob,
  exhibitDocxBlobs: Blob[],
  exhibitMetadata?: Array<{ name: string; category?: string; includeType?: 'included' | 'notincluded' }>,
  options?: { sectionTitle?: string; verbatim?: boolean; onStripReport?: (report: VerbatimStripReport) => void }
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

    // Validate main document
    if (!mainDocx || !(mainDocx instanceof Blob)) {
      throw new Error('Main document must be a valid Blob');
    }
    
    if (mainDocx.size === 0) {
      throw new Error('Main document is empty');
    }
    
    // Read main document
    let mainBuffer: ArrayBuffer;
    try {
      mainBuffer = await mainDocx.arrayBuffer();
    } catch (error) {
      throw new Error(`Failed to read main document buffer: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    let mainZip: PizZip;
    try {
      mainZip = new PizZip(mainBuffer);
    } catch (error) {
      throw new Error(`Failed to parse main document as ZIP: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    const mainXml = mainZip.file('word/document.xml')?.asText();
    
    if (!mainXml) {
      throw new Error('Could not read main document XML. The file may not be a valid DOCX file.');
    }

    const stripTotals: VerbatimStripReport = { drawings: 0, hyperlinks: 0, fields: 0, sectionBreaks: 0 };
    const accumulateStrip = (r: VerbatimStripReport): void => {
      stripTotals.drawings += r.drawings;
      stripTotals.hyperlinks += r.hyperlinks;
      stripTotals.fields += r.fields;
      stripTotals.sectionBreaks += r.sectionBreaks;
    };

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
    ): Promise<number> => {
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      // Verbatim callers append a contract attachment: a silent skip would leave the
      // section header standing over nothing, so surface the failure instead.
      const verbatim = options?.verbatim === true;
      const fail = (message: string): number => {
        if (verbatim) throw new Error(message);
        console.warn(`⚠️ ${message}, skipping`);
        return 0;
      };
      let appended = 0;
      
      // Validate exhibit blob
      if (!exhibitBlob || !(exhibitBlob instanceof Blob)) {
        return fail('Invalid document blob');
      }
      
      if (exhibitBlob.size === 0) {
        return fail('Document is empty');
      }
      
      let exhibitBuffer: ArrayBuffer;
      try {
        exhibitBuffer = await exhibitBlob.arrayBuffer();
      } catch (error) {
        return fail(`Could not read the document: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      let exhibitZip: PizZip;
      try {
        exhibitZip = new PizZip(exhibitBuffer);
      } catch (error) {
        return fail(`Not a readable .docx file: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      const exhibitXml = exhibitZip.file('word/document.xml')?.asText();
      
      if (!exhibitXml) {
        return fail('Not a Word .docx file (no word/document.xml inside)');
      }

      const exhibitDoc = parser.parseFromString(exhibitXml, 'text/xml');
      const exhibitBody = exhibitDoc.getElementsByTagName('w:body')[0];
      // IMPORTANT: Bring over any missing xmlns declarations so imported nodes serialize correctly.
      ensureNamespacesFromExhibit(exhibitDoc);
      
      if (!exhibitBody) {
        return fail('The document body could not be read');
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

      // Trim trailing empty / line-break-only paragraphs from the exhibit tail.
      // Without this, an exhibit that ends in stray <w:p/> blocks or <w:br/>
      // line-breaks combines with the merger's inserted page-break before the
      // next group's title and produces a blank page in the output.
      const isMeaningful = (node: Node): boolean => {
        if (node.nodeName === 'w:tbl') return true;
        if (node.nodeName !== 'w:p') return false;
        const el = node as Element;
        const textNodes = el.getElementsByTagName('w:t');
        for (let i = 0; i < textNodes.length; i++) {
          if ((textNodes[i].textContent || '').trim().length > 0) return true;
        }
        return false;
      };
      if (!verbatim) {
        while (children.length > 0 && !isMeaningful(children[children.length - 1])) {
          children.pop();
        }
      }

      let skippedFirstHeading = false;
      
      for (const child of children) {
        // Skip the final sectPr (section properties) - keep only main doc's sectPr
        if (child.nodeName === 'w:sectPr') {
          continue;
        }
        
        // Handle tables explicitly to ensure all properties are preserved
        if (child.nodeName === 'w:tbl' && child instanceof Element) {
          // Tables should be imported with all properties (tblPr, alignment, borders, etc.)
          const importedTable = mainDoc.importNode(child, true) as Element;

          // Ensure table is centered by adding/updating table justification
          let tblPr = importedTable.getElementsByTagName('w:tblPr')[0];
          if (!tblPr) {
            tblPr = mainDoc.createElementNS(ns, 'w:tblPr');
            importedTable.insertBefore(tblPr, importedTable.firstChild);
          }

          // CRITICAL FIX: Remove w:tblpPr (floating/absolute table position) which causes
          // tables to overlap other content when merged into a different document.
          const tblpPr = tblPr.getElementsByTagName('w:tblpPr')[0];
          if (tblpPr) {
            tblPr.removeChild(tblpPr);
            console.log('   🔧 Removed floating table position (w:tblpPr) to prevent overlap');
          }

          // Set table width to 100% of page (auto-fit) to avoid overflow
          let tblW = tblPr.getElementsByTagName('w:tblW')[0];
          if (!tblW) {
            tblW = mainDoc.createElementNS(ns, 'w:tblW');
            tblPr.appendChild(tblW);
          }
          tblW.setAttribute('w:w', '0');
          tblW.setAttribute('w:type', 'auto');

          // Check if justification already exists
          let jc = tblPr.getElementsByTagName('w:jc')[0];
          if (!jc) {
            jc = mainDoc.createElementNS(ns, 'w:jc');
            jc.setAttribute('w:val', 'center');
            tblPr.appendChild(jc);
          } else {
            jc.setAttribute('w:val', 'center');
          }

          // CRITICAL FIX: Remove exact/fixed row heights (w:hRule="exact") from all rows.
          // Fixed heights cause text to overflow outside the cell bounds and overlap nearby content.
          const rows = importedTable.getElementsByTagName('w:tr');
          for (let r = 0; r < rows.length; r++) {
            const trPr = rows[r].getElementsByTagName('w:trPr')[0];
            if (trPr) {
              const trHeight = trPr.getElementsByTagName('w:trHeight')[0];
              if (trHeight) {
                const rule = trHeight.getAttribute('w:hRule');
                if (rule === 'exact') {
                  // Change exact height to atLeast so the row can grow
                  trHeight.setAttribute('w:hRule', 'atLeast');
                  console.log('   🔧 Changed exact row height to atLeast to prevent cell overflow');
                }
              }
            }
          }

          // GAP FIX: Consecutive feature tables (e.g. "Box to MyDrive" + "Box to Shared
          // Drive") render touching in Word/OOXML when there is no paragraph — or only a
          // zero-height empty paragraph — between them. Ensure a small visible gap above a
          // table when it follows another table directly OR an empty separator paragraph.
          const prevContent = mainBody.lastChild?.previousSibling as Element | null;
          const paragraphIsEmpty = (p: Element): boolean => {
            const tNodes = p.getElementsByTagName('w:t');
            for (let i = 0; i < tNodes.length; i++) {
              if ((tNodes[i].textContent || '').trim().length > 0) return false;
            }
            return true;
          };
          const setParagraphGap = (p: Element): void => {
            let gapPPr = p.getElementsByTagName('w:pPr')[0];
            if (!gapPPr) {
              gapPPr = mainDoc.createElementNS(ns, 'w:pPr');
              p.insertBefore(gapPPr, p.firstChild);
            }
            let gapSpacing = gapPPr.getElementsByTagName('w:spacing')[0];
            if (!gapSpacing) {
              gapSpacing = mainDoc.createElementNS(ns, 'w:spacing');
              gapPPr.appendChild(gapSpacing);
            }
            gapSpacing.setAttribute('w:before', '120');
            gapSpacing.setAttribute('w:after', '120');
          };
          if (prevContent && prevContent.nodeName === 'w:tbl') {
            // Two tables directly adjacent — insert an empty spacer paragraph between them.
            const spacer = mainDoc.createElementNS(ns, 'w:p');
            setParagraphGap(spacer);
            mainBody.insertBefore(spacer, mainBody.lastChild);
            console.log('   ↔️  Inserted spacer paragraph between adjacent tables');
          } else if (
            prevContent &&
            prevContent.nodeName === 'w:p' &&
            paragraphIsEmpty(prevContent) &&
            prevContent.previousSibling?.nodeName === 'w:tbl'
          ) {
            // An empty separator paragraph already sits between the two tables but renders
            // with no height — give it visible spacing so the gap actually shows.
            setParagraphGap(prevContent);
            console.log('   ↔️  Added spacing to empty separator paragraph between tables');
          }

          if (verbatim) accumulateStrip(stripUnsupportedForVerbatim(importedTable));
          mainBody.insertBefore(importedTable, mainBody.lastChild);
          appended += 1;
          console.log('   📊 Imported table with overlap-safe properties');
          continue;
        }
        
        // Check if this is a paragraph (heading or content)
        if (!verbatim && child.nodeName === 'w:p' && child instanceof Element) {
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
        if (verbatim && importedNode.nodeType === 1) {
          accumulateStrip(stripUnsupportedForVerbatim(importedNode as Element));
        }
        mainBody.insertBefore(importedNode, mainBody.lastChild);
        appended += 1;
      }

      console.log(`✅ Exhibit merged`);
      return appended;
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
      const sectionTitle = options?.sectionTitle?.trim();
      const verbatimAppend = options?.verbatim === true;
      const headerNodes: Element[] = [];
      if (sectionTitle) {
        const pageBreak = createPageBreakParagraph(mainDoc);
        const titleP = createExhibitTitleParagraph(mainDoc, sectionTitle);
        mainBody.insertBefore(pageBreak, mainBody.lastChild);
        mainBody.insertBefore(titleP, mainBody.lastChild);
        headerNodes.push(pageBreak, titleP);
      }
      // A header standing over content that never arrived is worse than no header at all
      const removeHeader = (): void => {
        for (const node of headerNodes) node.parentNode?.removeChild(node);
        headerNodes.length = 0;
      };
      let totalAppended = 0;
      for (let i = 0; i < exhibitDocxBlobs.length; i++) {
        console.log(`📎 Processing document ${i + 1}/${exhibitDocxBlobs.length}...`);
        try {
          // The section title already emitted the page break for the first document
          totalAppended += await mergeExhibit(mainDoc, mainBody, exhibitDocxBlobs[i], parser, !(sectionTitle && i === 0));
        } catch (e) {
          if (verbatimAppend) {
            removeHeader();
            throw e;
          }
          console.error('❌ Failed to merge an exhibit (skipping):', {
            index: i,
            name: exhibitMetadata?.[i]?.name,
            error: e
          });
        }
      }
      if (verbatimAppend) {
        if (totalAppended === 0) {
          removeHeader();
          throw new Error('The document contained no content that could be appended.');
        }
        options?.onStripReport?.(stripTotals);
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
    console.error('Error details:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      mainDocxSize: mainDocx?.size,
      exhibitCount: exhibitDocxBlobs?.length
    });
    
    // Provide a more helpful error message
    if (error instanceof Error) {
      throw new Error(`Failed to merge DOCX files: ${error.message}`);
    } else {
      throw new Error(`Failed to merge DOCX files: ${String(error)}`);
    }
  }
}

