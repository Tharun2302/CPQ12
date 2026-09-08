'use strict';

// Values entered by an earlier recipient on fields a later one cannot see. generate-signed merges
// onto the original upload using only the signing recipient's visible fields, so anything assigned
// to a reviewer ahead of them would be dropped from the signed PDF. Kept out of server.cjs so the
// selection rule can be unit tested without a database or PDF work.

/**
 * Non-signature fields outside `visibleFields` that already hold a value.
 * @param {Array} allFields every signature_fields row for the document
 * @param {Array} visibleFields the rows this recipient can see
 * @param {(field: object) => string|undefined} effectiveValueFor reviewer entry, else creator prefill
 * @returns {Array<{field: object, value: string}>}
 */
function pickEsignCarriedFields(allFields, visibleFields, effectiveValueFor) {
  const visibleIds = new Set(
    (Array.isArray(visibleFields) ? visibleFields : [])
      .map((f) => (f && f._id != null ? String(f._id) : null))
      .filter(Boolean)
  );
  const carried = [];
  for (const field of Array.isArray(allFields) ? allFields : []) {
    if (!field || field._id == null) continue;
    if (visibleIds.has(String(field._id))) continue;
    if (String(field.type || 'signature').toLowerCase() === 'signature') continue;
    const value = typeof effectiveValueFor === 'function' ? effectiveValueFor(field) : undefined;
    if (value === undefined || value === null || String(value).trim() === '') continue;
    carried.push({ field, value: String(value) });
  }
  return carried;
}

module.exports = { pickEsignCarriedFields };
