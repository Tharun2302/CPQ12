import { SprawlType } from '../types/pricing';

export interface ParsedSprawlName {
  // Undefined when the name carries no "<Type> Sprawl" phrase.
  type?: SprawlType;
  source: string;
}

const TYPE_PHRASE = /(^|[\s\-–:])(content|data|message|messaging|email|mail)\s+sprawl(?=$|[\s\-–:])/i;
const INCLUDE_WORDS = /(^|[\s\-–:])(not\s*included|not\s*include|included|include)(\s+features?)?(?=$|[\s\-–:])/gi;
const PLAN_WORDS = /(^|[\s\-–:])(basic|standard|advanced|premium|enterprise)\s+plan(\s*[-–:]\s*(basic|standard|advanced|premium|enterprise))?(?=$|[\s\-–:])/gi;
const SCOPE_SUFFIX =/\s+(std|adv|basic|standard|advanced|premium|enterprise)\s+(inscope|outscope|in scope|out scope)\s*$/i;

const TYPE_WORD: Record<SprawlType, string> = { Content: 'Content', Message: 'Message', Email: 'Email' };

export function sprawlTypeFromWord(word: string): SprawlType | undefined {
  const w = String(word || '').toLowerCase();
  if (w === 'content' || w === 'data') return 'Content';
  if (w === 'message' || w === 'messaging') return 'Message';
  if (w === 'email' || w === 'mail') return 'Email';
  return undefined;
}

const tidy = (s: string): string => s.replace(/\s+/g, ' ').replace(/^[\s\-–:]+|[\s\-–:]+$/g, '').trim();

// Real names put the type either side of the source and "Not Included" anywhere; all must reduce alike.
export function parseSprawlName(name: string): ParsedSprawlName {
  // The tier is priced from planType, so "Standard Plan - Standard" is noise in a folder name.
  const cleaned = String(name || '')
    .replace(PLAN_WORDS, '$1')
    .replace(INCLUDE_WORDS, '$1')
    .replace(SCOPE_SUFFIX, '');
  const match = TYPE_PHRASE.exec(cleaned);
  if (!match) return { source: tidy(cleaned) };
  const source = cleaned.slice(0, match.index) + match[1] + cleaned.slice(match.index + match[0].length);
  return { type: sprawlTypeFromWord(match[2]), source: tidy(source) };
}

export function sprawlFolderLabel(type: SprawlType, source: string): string {
  return source ? `${TYPE_WORD[type]} Sprawl ${source}` : `${TYPE_WORD[type]} Sprawl`;
}

// Same case/space folding as ExhibitSelector's canonicalFolder.
export function sprawlFolderKey(type: SprawlType, source: string): string {
  return sprawlFolderLabel(type, source).toLowerCase().replace(/\s+/g, ' ').trim();
}
