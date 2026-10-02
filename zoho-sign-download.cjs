// Single-document download for agreements signed through Zoho Sign.
// The stored executed PDF keeps Zoho's completion certificate (preview, completion email and
// bulk download still use it); the Download action hands out the signed document alone.
// Kept in its own module so it can be unit tested without booting the server.

const fs = require('fs');

const PDF_MAGIC = '%PDF';
// The download route is reachable without a session, so a failing Zoho must not be retried on every click.
const FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
// The shared client retries for minutes; a Download falls back to the stored copy well before a browser gives up.
const DOWNLOAD_DEADLINE_MS = 15 * 1000;

const inFlight = new Map();
const failedAt = new Map();

function readIfPresent(filePath) {
  if (!filePath) return null;
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  } catch {
    return null;
  }
}

function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('deadline'), { code: 'DEADLINE_EXCEEDED' })), ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function fetchDocumentOnly({ doc, client, saveDocumentOnly, log, deadlineMs }) {
  try {
    // merge keeps it one PDF; with_coc=false is Zoho's own switch for leaving the certificate out.
    const result = await withDeadline(
      client.downloadPdf(doc.zoho_request_id, { withCoc: false, merge: true }),
      deadlineMs
    );
    const buffer = result && result.buffer;
    if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 4).toString('latin1') !== PDF_MAGIC) {
      if (log) log(`Zoho Sign returned no PDF for the document-only download of ${doc._id}`);
      return null;
    }
    if (saveDocumentOnly) {
      try {
        await saveDocumentOnly(buffer);
      } catch {
        if (log) log(`Could not cache the document-only Zoho PDF for ${doc._id}`);
      }
    }
    return buffer;
  } catch (error) {
    if (log) log(`Zoho Sign document-only download failed for ${doc._id} (${(error && error.code) || 'error'})`);
    return null;
  }
}

/**
 * The signed document without the certificate, or null when the caller should serve its usual
 * file. Only Zoho-signed rows qualify: `zoho_signed_file_path` is written by the poller once the
 * executed PDF is stored, so unsigned and in-house documents never reach Zoho from here.
 * Zoho is asked once per document; `saveDocumentOnly(buffer)` caches the copy for later downloads,
 * concurrent first downloads share one request, and a failure pauses retries for that document.
 */
async function resolveZohoDocumentOnlyPdf({
  doc, client, saveDocumentOnly, log, now = Date.now, deadlineMs = DOWNLOAD_DEADLINE_MS
}) {
  if (!doc || !doc.zoho_request_id || !doc.zoho_signed_file_path) return null;

  const cached = readIfPresent(doc.zoho_document_only_file_path);
  if (cached) return cached;

  const key = String(doc._id);
  if (inFlight.has(key)) return inFlight.get(key);
  if (failedAt.has(key) && now() - failedAt.get(key) < FAILURE_COOLDOWN_MS) return null;

  const pending = fetchDocumentOnly({ doc, client, saveDocumentOnly, log, deadlineMs }).then((buffer) => {
    if (buffer) failedAt.delete(key);
    else failedAt.set(key, now());
    return buffer;
  });
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(key);
  }
}

function resetDocumentOnlyState() {
  inFlight.clear();
  failedAt.clear();
}

module.exports = { resolveZohoDocumentOnlyPdf, resetDocumentOnlyState, FAILURE_COOLDOWN_MS, DOWNLOAD_DEADLINE_MS };
