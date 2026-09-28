export const POSSIBLE_DUPLICATE_EXHIBIT = 'POSSIBLE_DUPLICATE_EXHIBIT';

export interface DuplicateExhibitMatch {
  id: string;
  name: string;
  fileName: string;
  combinations: string[];
  planType: string;
  includeType: string;
  reasons: string[];
}

interface DuplicateResponseBody {
  code?: string;
  error?: string;
  duplicates?: DuplicateExhibitMatch[];
}

const MAX_LISTED = 5;

export function isPossibleDuplicateResponse(status: number, body: unknown): body is DuplicateResponseBody {
  return status === 409
    && typeof body === 'object'
    && body !== null
    && (body as DuplicateResponseBody).code === POSSIBLE_DUPLICATE_EXHIBIT;
}

function describeMatch(match: DuplicateExhibitMatch): string {
  const label = match.name || match.fileName || match.id;
  const plan = [match.planType, match.includeType === 'notincluded' ? 'Not Include' : 'Include']
    .filter(Boolean)
    .join(' / ');
  const combination = (match.combinations || []).filter((c) => c !== 'all').join(', ') || 'all';
  return `• ${label} (${combination}; ${plan})`;
}

/** The text of the "upload anyway?" prompt shown for a possible duplicate. */
export function duplicateConfirmMessage(body: DuplicateResponseBody): string {
  const matches = Array.isArray(body.duplicates) ? body.duplicates : [];
  const listed = matches.slice(0, MAX_LISTED).map(describeMatch);
  if (matches.length > MAX_LISTED) listed.push(`• …and ${matches.length - MAX_LISTED} more`);
  return [
    'This exhibit looks like a duplicate of:',
    ...listed,
    '',
    'Save it anyway?',
  ].join('\n');
}
