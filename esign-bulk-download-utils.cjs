// Pure helpers for the admin bulk-download (zip) endpoint in server.cjs.
// Kept in their own module so they can be unit tested without booting the server.

const BULK_DOWNLOAD_MAX_DOCS = 200;

/**
 * Unique, filesystem-safe entry name for a zip. Agreements frequently share a file name,
 * and a duplicate entry silently overwrites the earlier one inside the archive — so
 * collisions get a -2, -3… suffix. `usedNames` is mutated with the name that was handed out.
 */
function uniqueZipEntryName(rawName, fallbackId, usedNames) {
  let base = String(rawName == null ? '' : rawName).replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  if (!base) base = `document-${fallbackId}.pdf`;
  if (!/\.pdf$/i.test(base)) base = `${base}.pdf`;
  if (base.length > 150) base = `${base.slice(0, 146)}.pdf`;
  const stem = base.replace(/\.pdf$/i, '');
  let name = base;
  let n = 2;
  while (usedNames.has(name.toLowerCase())) {
    name = `${stem}-${n}.pdf`;
    n += 1;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

/**
 * Trim the client-supplied id list down to well-formed, de-duplicated Mongo ObjectId hex
 * strings. Anything malformed is dropped rather than thrown, so one bad row in a large
 * selection cannot fail the whole download.
 */
function normalizeBulkDownloadIds(rawIds) {
  if (!Array.isArray(rawIds)) return [];
  const seen = new Set();
  const ids = [];
  for (const id of rawIds) {
    const str = String(id == null ? '' : id).trim();
    if (!str || seen.has(str) || !/^[0-9a-fA-F]{24}$/.test(str)) continue;
    seen.add(str);
    ids.push(str);
  }
  return ids;
}

module.exports = { BULK_DOWNLOAD_MAX_DOCS, uniqueZipEntryName, normalizeBulkDownloadIds };
