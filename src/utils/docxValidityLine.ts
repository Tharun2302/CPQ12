export const QUOTE_VALIDITY_TEXT = 'This quote is valid till';

// Balanced open/close pairs, so a match can never run from one element into the next.
function elementRanges(xml: string, tag: string): Array<[number, number]> {
  const tokenRe = new RegExp(`<w:${tag}(?=[\\s>/])[^>]*>|</w:${tag}>`, 'g');
  const stack: number[] = [];
  const ranges: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(xml)) !== null) {
    const token = match[0];
    if (token.startsWith('</')) {
      const start = stack.pop();
      if (start !== undefined) ranges.push([start, match.index + token.length]);
    } else if (!token.endsWith('/>')) {
      stack.push(match.index);
    }
  }
  return ranges;
}

function innermostRange(ranges: Array<[number, number]>, pos: number): [number, number] | undefined {
  let best: [number, number] | undefined;
  for (const range of ranges) {
    if (range[0] < pos && pos < range[1] && (!best || range[0] > best[0])) best = range;
  }
  return best;
}

/** Removes the innermost <w:{tag}> element around each occurrence of text; text outside one is left alone. */
export function removeElementsContaining(xml: string, text: string, tag: string): string {
  let out = xml;
  let from = 0;
  for (;;) {
    const pos = out.indexOf(text, from);
    if (pos === -1) return out;
    const range = innermostRange(elementRanges(out, tag), pos);
    if (!range) {
      from = pos + text.length;
      continue;
    }
    out = out.slice(0, range[0]) + out.slice(range[1]);
    from = range[0];
  }
}

/** Drops every existing validity row (or, outside tables, paragraph) before a fresh line is inserted. */
export function removeExistingValidityLines(xml: string): string {
  const withoutRows = removeElementsContaining(xml, QUOTE_VALIDITY_TEXT, 'tr');
  return removeElementsContaining(withoutRows, QUOTE_VALIDITY_TEXT, 'p');
}
