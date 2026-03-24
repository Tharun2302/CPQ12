/** Matches server + EsignSignPage reviewer detection. */
export function isEsignReviewerRecipient(rec: {
  action?: 'signer' | 'reviewer' | null;
  role?: string;
}): boolean {
  const action = rec.action;
  const role = (rec.role || 'signer').toString();
  return (
    action === 'reviewer' ||
    (action !== 'signer' &&
      (role.toLowerCase() === 'reviewer' || role === 'Technical Team' || role === 'Legal Team'))
  );
}

export function getFieldsForRecipient<T extends { recipient_id?: string | null }>(
  fields: T[],
  recipientId: string,
  hasRecipientAssignment: boolean
): T[] {
  if (!hasRecipientAssignment) return fields;
  return fields.filter((f) => !f.recipient_id || f.recipient_id === recipientId);
}

/** Returns an error message if send should be blocked, or null if OK. */
export function validateSignatureFieldsBeforeSend(
  recipients: { id: string; name?: string; email?: string; role?: string; action?: 'signer' | 'reviewer' | null }[],
  fields: { type?: string; recipient_id?: string | null }[]
): string | null {
  const signers = recipients.filter((r) => !isEsignReviewerRecipient(r));
  if (!signers.length) return null;

  if (!fields.length) {
    return 'Place at least one field on the document before sending. Signers need at least one signature field (drag Signature onto the PDF on the place-fields step).';
  }

  const hasAssignment = fields.some((f) => f.recipient_id);
  for (const r of signers) {
    const rf = getFieldsForRecipient(fields, r.id, hasAssignment);
    const hasSig = rf.some((f) => (f.type || 'signature') === 'signature');
    if (!hasSig) {
      const label = r.name || r.email || 'Signer';
      return `Each signer needs at least one signature field. "${label}" has none assigned to them. Assign a signature field to this signer or leave fields unassigned so all signers share the same placements.`;
    }
  }
  return null;
}
