'use strict';

// The completion email a document creator receives once an agreement is fully executed.
//
// Pure functions only: no database, no network, no clock, no mailer. The caller owns all of
// that, which is what lets every guard below be unit tested without SendGrid or Mongo.
//
// Nothing here writes or changes a status. It only READS the statuses the existing mapping in
// zoho-sign-status.cjs already wrote, so that mapping stays the single source of truth.

const { ESIGN_RECIPIENT_DONE_STATUSES } = require('./esign-sequential-utils.cjs');

/**
 * How many polls a single document may spend trying to get its completion email out before it
 * is abandoned. This counts EVERY attempt, including the ones that defer without sending — a
 * document stuck on "recipients incomplete" is re-selected on every tick and would otherwise
 * poll Zoho forever against a per-account rate limit.
 *
 * 24 at the default five-minute interval is about two hours, which absorbs a key rotation or a
 * database blip without abandoning the email, and still terminates.
 */
const COMPLETION_EMAIL_MAX_ATTEMPTS = 24;

/**
 * A bare addr-spec. `uploaded_by` is written verbatim from an unauthenticated upload body
 * (server.cjs POST /api/esign/documents/upload), and SendGrid parses the `Name <addr>` form —
 * so accepting anything that merely contains an "@" would let a crafted uploader string
 * redirect a completed agreement's link to an address of the uploader's choosing.
 */
const BARE_EMAIL_PATTERN = /^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/;

/** Control characters that have no business in a mail subject, plus the bidi overrides that
 *  let a filename render a subject that reads backwards. */
const SUBJECT_UNSAFE_CHARS = new RegExp('[\u0000-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]', 'g');
const SUBJECT_MAX_FILENAME_LENGTH = 120;

/**
 * Recipients CPQ never waits on. A Zoho VIEW action is a spectator with nothing to sign, so
 * requiring one to reach `signed` would hold the email back forever on any envelope that has
 * one. `action` is CPQ's own discriminator and `zoho_action_type` is what the send path wrote —
 * both are checked so a row from either provider resolves correctly.
 */
const NON_SIGNING_ZOHO_ACTION_TYPES = Object.freeze(['VIEW']);
const NON_SIGNING_CPQ_ACTIONS = Object.freeze(['viewer']);

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** True for a recipient the envelope actually waits on before it can be called executed. */
function isRequiredSigner(recipient) {
  if (!recipient) return false;
  const zohoType = String(recipient.zoho_action_type || '').trim().toUpperCase();
  if (NON_SIGNING_ZOHO_ACTION_TYPES.includes(zohoType)) return false;
  const action = String(recipient.action || '').trim().toLowerCase();
  return !NON_SIGNING_CPQ_ACTIONS.includes(action);
}

/** Reuses the existing done vocabulary verbatim — a reviewer's `reviewed` counts as done. */
function isDoneRecipient(recipient) {
  return ESIGN_RECIPIENT_DONE_STATUSES.includes(String((recipient && recipient.status) || ''));
}

/**
 * Every required signer is done.
 *
 * Zoho's request_status is deliberately NOT accepted as proof on its own. An envelope can read
 * `completed` upstream while a CPQ recipient row still says `viewed` — a lost tick, or a
 * recipient write that failed — and telling the creator "everyone has signed" in that state
 * would be a false statement about a contract. An envelope with no required signer at all
 * returns false rather than vacuously true.
 */
function allRequiredRecipientsSigned(recipients) {
  const required = (Array.isArray(recipients) ? recipients : []).filter(isRequiredSigner);
  if (required.length === 0) return false;
  return required.every(isDoneRecipient);
}

/**
 * The creator-facing page for one agreement: the same route the "View status" button opens,
 * which already offers the executed PDF. No new endpoint is introduced.
 *
 * KNOWN GAP, pre-existing and wider than this feature: that SPA route and the
 * GET /api/esign/documents/:id/file it reads are NOT behind an auth guard (src/App.tsx puts the
 * /esign group outside ProtectedRoute). Anyone holding the document id can fetch the executed
 * PDF. Mailing the link does not create that hole but is the first thing to distribute the id
 * outside an authenticated session, so putting auth on that route is tracked separately.
 */
function buildAgreementLink(baseUrl, documentId) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const id = String(documentId || '').trim();
  if (base === '' || id === '') return '';
  return `${base}/esign/${encodeURIComponent(id)}/status`;
}

/** Readable completion timestamp; falls back to the raw value rather than printing "Invalid Date". */
function formatCompletedOn(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value == null ? '' : value);
  return date.toUTCString();
}

/**
 * Subject-safe filename: control characters and bidi overrides stripped, whitespace collapsed,
 * length capped. `file_name` comes from an uploaded file's original name and multer is
 * configured with no filename limit, so an unbounded name would become an unbounded subject.
 */
function sanitizeSubjectFileName(value) {
  return String(value == null ? '' : value)
    .replace(SUBJECT_UNSAFE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SUBJECT_MAX_FILENAME_LENGTH);
}

/** A single, unambiguous mailbox address — no display name, no group, no comma list. */
function isDeliverableCreatorEmail(value) {
  return BARE_EMAIL_PATTERN.test(String(value == null ? '' : value).trim());
}

/** Name if the creator has one, else the address, else a neutral greeting. */
function creatorGreetingName(creatorName, creatorEmail) {
  const name = String(creatorName || '').trim();
  if (name) return name;
  const email = String(creatorEmail || '').trim();
  if (email) return email;
  return 'there';
}

/**
 * Subject and HTML body. Every interpolated value is escaped: the document name is
 * user-supplied (an uploaded filename) and lands inside an HTML email.
 */
function buildCompletionEmail(input) {
  const opts = input || {};
  const documentName = String(opts.documentName || 'Document');
  const greeting = creatorGreetingName(opts.creatorName, opts.creatorEmail);
  const completedOn = formatCompletedOn(opts.completedAt);
  const link = String(opts.agreementLink || '');

  const subject = `Agreement Completed – ${sanitizeSubjectFileName(documentName)}`;
  const html = `
    <p>Hi ${escapeHtml(greeting)},</p>
    <p>The agreement "${escapeHtml(documentName)}" has been successfully completed.</p>
    <p>All recipients have completed their signatures. The completed agreement is now available for your review.</p>
    <p>
      <strong>Agreement:</strong> ${escapeHtml(documentName)}<br />
      <strong>Status:</strong> Completed<br />
      <strong>Completed On:</strong> ${escapeHtml(completedOn)}
    </p>
    <p>You can access the completed agreement here:</p>
    <p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
    <p>Regards,<br />CPQ Team</p>
  `;
  return { subject, html };
}

/**
 * Whether this poll should send the completion email, and if not, why.
 *
 * `permanent` separates "stop asking" from "try again next tick". A missing creator address
 * will never fix itself on a retry, whereas a signed PDF that has not landed yet will — the
 * poller's own self-healing download branch is what fixes it.
 *
 * NOTE: this never reports a status. The document stays completed in every branch; the only
 * thing decided here is whether an email goes out.
 */
function evaluateCompletionEmail(input) {
  const opts = input || {};
  const doc = opts.doc || {};

  if (doc.completion_email_sent_at) return { send: false, permanent: true, reason: 'already-sent' };
  // A document already abandoned for a reason no retry can fix is not reconsidered, or it would
  // be re-flagged and re-evaluated on every later selection.
  if (doc.completion_email_skipped_reason) return { send: false, permanent: true, reason: 'already-skipped' };
  if (String(doc.status || '') !== 'completed') return { send: false, permanent: true, reason: 'document-not-completed' };

  // A non-numeric counter is treated as exhausted, not as zero. Reading it as "no attempts yet"
  // would disable the only bound on retries in exactly the corrupt state that needs it most.
  const rawAttempts = Number(doc.completion_email_attempts || 0);
  const attempts = Number.isFinite(rawAttempts) ? rawAttempts : COMPLETION_EMAIL_MAX_ATTEMPTS;
  if (attempts >= COMPLETION_EMAIL_MAX_ATTEMPTS) {
    return { send: false, permanent: true, reason: 'attempts-exhausted' };
  }

  // Requirement 8: the executed PDF must actually be in hand. The poller holds the completed
  // transition until it has stored one, so this is a second belt on the same rule — a lost file
  // must not produce an email pointing at a page that can only serve the unsigned original.
  if (!opts.signedFileAvailable) return { send: false, permanent: false, reason: 'signed-file-unavailable' };

  if (!allRequiredRecipientsSigned(opts.recipients)) {
    return { send: false, permanent: false, reason: 'recipients-incomplete' };
  }

  if (!isDeliverableCreatorEmail(opts.creatorEmail)) {
    return { send: false, permanent: true, reason: 'no-creator-email' };
  }

  if (String(opts.agreementLink || '').trim() === '') {
    return { send: false, permanent: true, reason: 'no-agreement-link' };
  }

  return { send: true, permanent: false, reason: 'ready' };
}

module.exports = {
  COMPLETION_EMAIL_MAX_ATTEMPTS,
  isDeliverableCreatorEmail,
  sanitizeSubjectFileName,
  isRequiredSigner,
  allRequiredRecipientsSigned,
  buildAgreementLink,
  formatCompletedOn,
  buildCompletionEmail,
  evaluateCompletionEmail,
};
