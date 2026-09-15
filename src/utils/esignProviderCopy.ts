/**
 * The provider-specific wording and rules shared by the two send screens, so the copy and the
 * extra Zoho checks cannot drift between the place-fields route and the older send route.
 */
export const ZOHO_SEND_SUCCESS_LINE = 'Sent via Zoho Sign. Signers will receive an email from Zoho.';

/** Zoho refuses a request with more than 25 recipients outright. */
export const ZOHO_MAX_RECIPIENTS = 25;

/** Success banners are styled by their opening words on both send screens; this keeps that list in one place. */
export function isEsignSendSuccessMessage(message: string): boolean {
  return (
    message.startsWith('Successfully') ||
    message.startsWith('Signing') ||
    message.startsWith('Document') ||
    message.startsWith(ZOHO_SEND_SUCCESS_LINE)
  );
}

export interface EsignValidationItem {
  label: string;
  done: boolean;
  optional?: boolean;
}

/**
 * The two checks that only matter when the request is going to Zoho.
 *
 * Zoho rejects a non-VIEW action carrying no field at all, where the in-house flow tolerates it,
 * and caps a request at 25 recipients. Surfacing both before the send turns two opaque Zoho API
 * errors into something the sender can fix on the page they are already on.
 */
export function zohoValidationItems(
  recipientCount: number,
  signerIds: string[],
  fields: { recipient_id?: string | null }[]
): EsignValidationItem[] {
  const signersWithoutAnyField = signerIds.filter(
    (id) => !fields.some((f) => !f.recipient_id || f.recipient_id === id)
  );
  return [
    { label: `${ZOHO_MAX_RECIPIENTS} recipients or fewer`, done: recipientCount <= ZOHO_MAX_RECIPIENTS },
    {
      label: 'Every signer has at least one field',
      done: signerIds.length === 0 || signersWithoutAnyField.length === 0,
    },
  ];
}
