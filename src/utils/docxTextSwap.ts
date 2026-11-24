import PizZip from 'pizzip';

export interface TextReplacement {
  from: string;
  to: string;
}

export type ReplacementPlan =
  | { ok: true; replacements: TextReplacement[]; unplaceable: string[] }
  | { ok: false; sharedText: string };

const NOT_PRINTED = new Set(['', 'N/A']);

// Text that stands for one changing date and anything else at once can't be told apart in the file
function findSharedText(changed: TextReplacement[], targetsByText: Map<string, Set<string>>): string | null {
  for (const { from } of changed) {
    if (targetsByText.get(from)!.size > 1) return from;
    const containing = [...targetsByText.entries()].some(([text, targets]) =>
      text !== from && text.includes(from) && targets.has(text));
    if (containing) return from;
  }
  return null;
}

// Only keys the saved values already have can be in the file
export function planTextReplacements(
  current: Record<string, string>,
  next: Record<string, string>
): ReplacementPlan {
  const targetsByText = new Map<string, Set<string>>();
  const changed: TextReplacement[] = [];
  const unplaceable: string[] = [];

  for (const key of Object.keys(current)) {
    const from = String(current[key] ?? '');
    const to = key in next ? String(next[key] ?? '') : from;
    if (!NOT_PRINTED.has(from)) {
      if (!targetsByText.has(from)) targetsByText.set(from, new Set());
      targetsByText.get(from)!.add(to);
    }
    if (from === to) continue;
    if (NOT_PRINTED.has(from)) unplaceable.push(key);
    else changed.push({ from, to });
  }

  const sharedText = findSharedText(changed, targetsByText);
  if (sharedText !== null) return { ok: false, sharedText };

  const unique = [...new Map(changed.map((r) => [r.from, r.to])).entries()].map(([from, to]) => ({ from, to }));
  // "valid till <date>" comes out right from the bare date swap alone; keeping both would hide the bare one
  const replacements = unique.filter((r) => {
    const inner = unique.filter((o) => o !== r && r.from.includes(o.from));
    return inner.length === 0 || swapText(r.from, inner) !== r.to;
  });
  return { ok: true, replacements, unplaceable };
}

interface Match {
  at: number;
  from: string;
  to: string;
}

// Earliest match wins, the longer one at the same spot, and matches never overlap
function findMatches(text: string, replacements: TextReplacement[]): Match[] {
  const matches: Match[] = [];
  let pos = 0;
  while (pos < text.length) {
    let best: Match | null = null;
    for (const r of replacements) {
      const at = text.indexOf(r.from, pos);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && r.from.length > best.from.length)) best = { at, ...r };
    }
    if (!best) break;
    matches.push(best);
    pos = best.at + best.from.length;
  }
  return matches;
}

// The same simultaneous swap as the file gets, applied to one string
export function swapText(text: string, replacements: TextReplacement[]): string {
  let out = '';
  let pos = 0;
  for (const m of findMatches(text, replacements)) {
    out += text.slice(pos, m.at) + m.to;
    pos = m.at + m.from.length;
  }
  return out + text.slice(pos);
}

const TEXT_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
// The lookbehind skips self-closing <w:t .../>, which would otherwise swallow the following XML
const TEXT_NODE = /<w:t((?:\s[^>]*)?)(?<!\/)>([\s\S]*?)<\/w:t>/g;
const PARAGRAPH_END = '</w:p>';
const PARAGRAPH_BREAK = '\n';

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, entity: string) => {
    const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
    if (named[entity]) return named[entity];
    return String.fromCodePoint(entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
  });
}

function encodeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface TextNode {
  start: number;
  end: number;
  attrs: string;
  text: string;
  changed: boolean;
}

// Word splits text across runs, so each paragraph's runs are searched as one string
function readTextNodes(xml: string): { nodes: TextNode[]; joined: string; offsets: number[] } {
  const nodes: TextNode[] = [];
  for (const m of xml.matchAll(TEXT_NODE)) {
    nodes.push({ start: m.index!, end: m.index! + m[0].length, attrs: m[1] || '', text: decodeXml(m[2]), changed: false });
  }
  const offsets: number[] = [];
  let joined = '';
  nodes.forEach((node, i) => {
    if (i > 0 && xml.slice(nodes[i - 1].end, node.start).includes(PARAGRAPH_END)) joined += PARAGRAPH_BREAK;
    offsets.push(joined.length);
    joined += node.text;
  });
  return { nodes, joined, offsets };
}

function locate(offsets: number[], pos: number, isEnd: boolean): { node: number; offset: number } {
  for (let i = offsets.length - 1; i >= 0; i -= 1) {
    if (isEnd ? offsets[i] < pos : offsets[i] <= pos) return { node: i, offset: pos - offsets[i] };
  }
  return { node: 0, offset: pos };
}

// The new text goes into the run where the match starts, so it keeps that run's formatting
function applyMatch(nodes: TextNode[], offsets: number[], match: Match) {
  const first = locate(offsets, match.at, false);
  const last = locate(offsets, match.at + match.from.length, true);
  const head = nodes[first.node];
  const tail = first.node === last.node ? head.text.slice(last.offset) : '';
  head.text = head.text.slice(0, first.offset) + match.to + tail;
  head.changed = true;
  if (first.node === last.node) return;
  for (let i = first.node + 1; i < last.node; i += 1) nodes[i] = { ...nodes[i], text: '', changed: true };
  nodes[last.node] = { ...nodes[last.node], text: nodes[last.node].text.slice(last.offset), changed: true };
}

function writeTextNodes(xml: string, nodes: TextNode[]): string {
  let out = '';
  let cursor = 0;
  for (const node of nodes) {
    if (!node.changed) continue;
    const needsPreserve = /^\s|\s$/.test(node.text) && !/xml:space=/.test(node.attrs);
    const attrs = needsPreserve ? `${node.attrs} xml:space="preserve"` : node.attrs;
    out += xml.slice(cursor, node.start) + `<w:t${attrs}>${encodeXml(node.text)}</w:t>`;
    cursor = node.end;
  }
  return out + xml.slice(cursor);
}

function replaceInPart(xml: string, replacements: TextReplacement[], counts: Record<string, number>): string | null {
  const { nodes, joined, offsets } = readTextNodes(xml);
  const matches = findMatches(joined, replacements);
  if (matches.length === 0) return null;
  // Right to left, so the offsets of earlier matches stay valid
  for (const match of [...matches].reverse()) {
    counts[match.from] = (counts[match.from] || 0) + 1;
    applyMatch(nodes, offsets, match);
  }
  return writeTextNodes(xml, nodes);
}

// Swaps text wherever it is printed (body, headers, footers, notes); everything else is left as-is
export function replaceTextInDocx(
  data: ArrayBuffer | Uint8Array,
  replacements: TextReplacement[]
): { docx: Uint8Array; counts: Record<string, number> } {
  const zip = new PizZip(data);
  const counts: Record<string, number> = {};
  for (const name of Object.keys(zip.files)) {
    if (!TEXT_PART.test(name)) continue;
    const updated = replaceInPart(zip.file(name)!.asText(), replacements, counts);
    if (updated !== null) zip.file(name, updated);
  }
  return { docx: zip.generate({ type: 'uint8array', compression: 'DEFLATE' }), counts };
}
