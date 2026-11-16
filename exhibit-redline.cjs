'use strict';

// Saving an "Edit for RedLine" edit over an exhibit's DOCX. Kept out of server.cjs so the
// backup-before-overwrite rule can be unit tested without a database.

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function isDocxBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function exhibitFileBuffer(exhibit) {
  const fd = exhibit && exhibit.fileData;
  if (!fd) return null;
  if (Buffer.isBuffer(fd)) return fd;
  if (typeof fd === 'string') return Buffer.from(fd, 'base64');
  if (fd.buffer) return Buffer.from(fd.buffer);
  return null;
}

const CHANGED_WHILE_EDITING = 'This exhibit was changed by someone else while you were editing, so your edit was not saved. Close the editor and open it again.';
const CLOSED_SESSION_STATUSES = ['persisting', 'persisted', 'closed'];
// An open editor pings every minute, so a lock this quiet belongs to a closed tab
const EXHIBIT_LOCK_STALE_MS = 3 * 60 * 1000;

// The open edit session another admin must wait for, or null when the exhibit is free
function findExhibitEditLock(sessions, exhibitId, now) {
  for (const s of sessions) {
    if (s.exhibitId !== exhibitId) continue;
    if (s.status === 'persisted' || s.status === 'closed') continue;
    if (now - (s.lastSeenAt || s.createdAt || 0) > EXHIBIT_LOCK_STALE_MS) continue;
    return s;
  }
  return null;
}

// What to do with an OnlyOffice callback for an exhibit session. With JWT on, `body` must be the verified payload.
function exhibitCallbackStep(sessionId, body) {
  if (!body || body.key !== sessionId) return 'reject';
  if ((body.status === 2 || body.status === 6) && body.url) return 'download';
  if (body.status === 4) return 'no-changes';
  if (body.status === 3 || body.status === 7) return 'error';
  return 'ignore';
}

// Store a downloaded edit on the session, unless Done already claimed it or the file isn't a DOCX
function applyExhibitDownload(session, buf) {
  if (CLOSED_SESSION_STATUSES.includes(session.status)) return 'discarded';
  if (!isDocxBuffer(buf)) {
    session.status = 'editor-error';
    return 'invalid';
  }
  session.editedDocx = buf;
  session.status = 'ready';
  return 'stored';
}

// Session status after OnlyOffice answers a forcesave command (error 4 = nothing changed since the last save)
function statusAfterForceSave(session, commandError) {
  if (commandError === 0) return 'saving';
  if (commandError === 4) return session.editedDocx ? 'ready' : 'no-changes';
  return 'editor-error';
}

// Overwrites the exhibit's DOCX after backing up the current file; `expectedVersion` blocks overwriting a newer file.
async function saveRedlineOverExhibit(db, { filter, exhibitId, editedDocx, editorEmail, backupVersionId, expectedVersion }) {
  if (!isDocxBuffer(editedDocx)) {
    return { ok: false, httpStatus: 400, error: 'The edited file is not a valid Word document' };
  }

  const original = await db.collection('exhibits').findOne(
    filter,
    { projection: { fileName: 1, fileData: 1, fileType: 1, fileSize: 1, version: 1 } }
  );
  if (!original) return { ok: false, httpStatus: 404, error: 'Exhibit not found' };
  if (expectedVersion !== undefined && (original.version || 0) !== expectedVersion) {
    return { ok: false, httpStatus: 409, error: CHANGED_WHILE_EDITING };
  }

  // Written before the overwrite: if the backup fails, the exhibit is left untouched.
  await db.collection('exhibit_versions').insertOne({
    id: backupVersionId,
    exhibitId: String(exhibitId),
    fileName: original.fileName || null,
    fileData: original.fileData || null,
    fileType: original.fileType || null,
    fileSize: original.fileSize || null,
    version: original.version || 0,
    reason: 'redline',
    replacedBy: editorEmail || null,
    createdAt: new Date(),
  });

  const version = (original.version || 0) + 1;
  // Matching the version read above stops an upload that lands mid-save from being overwritten unbacked
  const result = await db.collection('exhibits').updateOne({ ...filter, version: original.version ?? null }, {
    $set: {
      fileData: editedDocx.toString('base64'),
      fileType: DOCX_MIME,
      fileSize: editedDocx.length,
      version,
      updatedAt: new Date(),
      lastRedlinedBy: editorEmail || null,
    },
  });
  if (result.matchedCount === 0) return { ok: false, httpStatus: 409, error: CHANGED_WHILE_EDITING };

  return { ok: true, backupVersionId, fileName: original.fileName || null, version };
}

module.exports = {
  CLOSED_SESSION_STATUSES,
  EXHIBIT_LOCK_STALE_MS,
  findExhibitEditLock,
  isDocxBuffer,
  exhibitFileBuffer,
  exhibitCallbackStep,
  applyExhibitDownload,
  statusAfterForceSave,
  saveRedlineOverExhibit,
};
