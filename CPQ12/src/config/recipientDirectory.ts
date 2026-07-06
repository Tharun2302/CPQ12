/**
 * Static directory of known signing recipients keyed by lowercased email.
 *
 * When a recipient is added in Place Fields with one of these emails, the
 * recipient's Name input auto-populates from `name`, and any Name / Title
 * field dropped onto the document is prefilled with the matching values
 * (rendered as a read-only label to the signer).
 *
 * To add a new person: add one entry below. Keep email keys lowercased so
 * `lookupRecipient` matches regardless of how the email was typed.
 */
export interface RecipientDirectoryEntry {
  name: string;
  title: string;
}

export const RECIPIENT_DIRECTORY: Record<string, RecipientDirectoryEntry> = {
  'adi.nandyala@cloudfuze.com': {
    name: 'Adi Nandyala',
    title: 'Director of Operations',
  },
  'abhilasha.kandakatla@cloudfuze.com': {
    name: 'Abhilasha',
    title: 'Trainee',
  },
  // Add additional entries here as needed.
};

/** Case-insensitive, whitespace-tolerant lookup. Returns null if not found. */
export function lookupRecipient(email: string | null | undefined): RecipientDirectoryEntry | null {
  if (!email) return null;
  const key = email.trim().toLowerCase();
  if (!key) return null;
  return RECIPIENT_DIRECTORY[key] ?? null;
}
