import { isEsignReviewerRecipient } from './esignSendValidation';

/**
 * Which signing links may be handed out, and what to say about the ones that may not.
 * Every recipient holds their own token, so a single "copy signing link" is ambiguous the moment
 * an envelope has two of them — the UI has to name whose link it is copying.
 */

export interface EsignLinkRecipient {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  action?: string | null;
  status?: string;
  order?: number;
  signing_token?: string | null;
  sent_at?: string | null;
}

/** `spent` = they already acted; `awaiting_turn` = sequential envelope, not invited yet. */
export type EsignLinkState = 'ready' | 'awaiting_turn' | 'spent';

export function esignLinkRecipientIsReviewer(rec: EsignLinkRecipient): boolean {
  return isEsignReviewerRecipient({
    action: (rec.action as 'signer' | 'reviewer' | null | undefined) ?? null,
    role: rec.role,
  });
}

export function esignRecipientLinkState(rec: EsignLinkRecipient): EsignLinkState {
  const status = (rec.status || 'pending').toLowerCase();
  if (status === 'signed' || status === 'reviewed' || status === 'denied') return 'spent';
  // Token issued but never emailed is how a sequential send marks "their turn has not come up".
  if (!rec.sent_at && status === 'pending') return 'awaiting_turn';
  return 'ready';
}

/** Only recipients holding a token can have a link copied at all. */
export function esignLinkableRecipients(recipients: EsignLinkRecipient[] | null | undefined): EsignLinkRecipient[] {
  if (!Array.isArray(recipients)) return [];
  return recipients.filter((r) => r && r.signing_token);
}

/**
 * Role text for a recipient row. Never print `role` raw: picking "reviewer" from the action
 * dropdown sets `action` and leaves `role` as "signer", so the raw field reads Signer for a
 * reviewer. A named team (Technical Team, Legal Team…) is kept alongside what they actually do.
 */
export function esignRecipientRoleDisplay(rec: EsignLinkRecipient): string {
  const acts = esignLinkRecipientIsReviewer(rec) ? 'Reviewer' : 'Signer';
  const role = (rec.role || '').trim();
  const generic = !role || role.toLowerCase() === 'signer' || role.toLowerCase() === 'reviewer';
  return generic ? acts : `${role} · ${acts}`;
}

/** Clipboard write with a textarea fallback for browsers that refuse navigator.clipboard. */
export async function copyEsignSigningLink(signingToken: string): Promise<void> {
  const url = `${window.location.origin}/sign/${signingToken}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/** Sub-label under a recipient's name in the copy picker. */
export function esignRecipientLinkLabel(rec: EsignLinkRecipient): string {
  const isReviewer = esignLinkRecipientIsReviewer(rec);
  const base = isReviewer ? 'Reviewer' : 'Signer';
  switch (esignRecipientLinkState(rec)) {
    case 'spent':
      return `${base} · ${(rec.status || '').toLowerCase() === 'denied' ? 'denied' : isReviewer ? 'reviewed' : 'signed'}`;
    case 'awaiting_turn':
      return `${base} · waiting for their turn`;
    default:
      return base;
  }
}
