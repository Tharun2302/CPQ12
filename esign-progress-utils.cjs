'use strict';

// Progress summary for e-sign envelopes — the counts and wording the creator's per-action
// progress email shows. Kept out of server.cjs so the arithmetic and phrasing can be unit
// tested without a database or SendGrid.

const { ESIGN_RECIPIENT_DONE_STATUSES } = require('./esign-sequential-utils.cjs');

/**
 * How far an envelope has got. Anything not in a done status counts as outstanding, so a
 * `denied` row and a row saved before `status` existed both keep the creator waiting rather
 * than silently reading as finished.
 */
function summarizeEsignRecipientProgress(recipients) {
  if (!Array.isArray(recipients)) return { total: 0, completed: 0, outstanding: [] };
  const outstanding = [];
  let completed = 0;
  for (const rec of recipients) {
    if (rec && ESIGN_RECIPIENT_DONE_STATUSES.includes(String(rec.status || ''))) {
      completed += 1;
    } else {
      outstanding.push({ name: rec ? rec.name : undefined, email: rec ? rec.email : undefined });
    }
  }
  return { total: recipients.length, completed, outstanding };
}

/** Name if there is one, else the address, else a neutral placeholder. */
function esignRecipientDisplayLabel(rec) {
  if (!rec) return 'A recipient';
  const name = String(rec.name || '').trim();
  if (name) return name;
  const email = String(rec.email || '').trim();
  if (email) return email;
  return 'A recipient';
}

/** "A", "A and B", "A, B and C", and past five "A, B, C, D, E and 3 more". */
function formatEsignOutstandingNames(outstanding) {
  if (!Array.isArray(outstanding) || outstanding.length === 0) return '';
  const labels = outstanding.map(esignRecipientDisplayLabel);
  if (labels.length === 1) return labels[0];
  if (labels.length > 5) return `${labels.slice(0, 5).join(', ')} and ${labels.length - 5} more`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** One-line progress phrase for the email body. */
function formatEsignProgressLine(progress) {
  if (!progress || typeof progress !== 'object' || !progress.total) {
    return 'No recipients on this document';
  }
  const head = `${progress.completed} of ${progress.total} done`;
  const names = formatEsignOutstandingNames(progress.outstanding);
  return names ? `${head} — waiting on ${names}` : head;
}

/** Human wording for the action that triggered the email. */
function esignProgressActionLabel(action) {
  const value = String(action || '').trim().toLowerCase();
  if (value === 'reviewed') return 'Reviewed (approved)';
  if (value === 'signed') return 'Signed';
  return 'Completed';
}

module.exports = {
  summarizeEsignRecipientProgress,
  esignRecipientDisplayLabel,
  formatEsignOutstandingNames,
  formatEsignProgressLine,
  esignProgressActionLabel,
};
