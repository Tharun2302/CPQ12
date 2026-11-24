import PizZip from 'pizzip';

const WORD_XML_PART = /^word\/.+\.xml$/;

// Same repairs DocxTemplateProcessor makes before rendering, so "{{Date} (the …)" still counts as printed
function repairUnclosedTags(text: string): string {
  return text
    .replace(/\{\{([^}]+)\}([A-Za-z])/g, '{{$1}} $2')
    .replace(/\{\{([^}]+)\}(?!\})/g, '{{$1}}');
}

/** Placeholder names in a DOCX (body, headers, footers), read across Word's run splits. */
export function placeholderNamesInDocx(bytes: ArrayBuffer | Uint8Array): string[] {
  const zip = new PizZip(bytes);
  const names = new Set<string>();
  for (const name of Object.keys(zip.files)) {
    if (!WORD_XML_PART.test(name)) continue;
    const text = repairUnclosedTags(zip.file(name)!.asText().replace(/<[^>]+>/g, ''));
    for (const match of text.matchAll(/\{\{([^{}]+)\}\}/g)) names.add(match[1].trim());
  }
  return [...names];
}

/** Tags of the exact template file an agreement is rendered from; null when they can't be read. */
export async function templateTagsOfFile(file: Blob | null | undefined): Promise<string[] | null> {
  if (!file) return null;
  try {
    return placeholderNamesInDocx(await file.arrayBuffer());
  } catch {
    return null;
  }
}
