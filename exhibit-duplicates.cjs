'use strict';

// Overridable duplicate warnings for exhibit uploads and edits; the exact-fileName 409 stays a hard block.

const DUPLICATE_CODE = 'POSSIBLE_DUPLICATE_EXHIBIT';
const DEFAULT_INCLUDE_TYPE = 'included';
const MAX_REPORTED = 5;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_SUFFIX_PASSES = 10;

const REASON_KEY = 'same_combination_plan_include';
const REASON_FILE = 'similar_file_name';

function lower(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

// 'all' is a wildcard rather than an identity, so it never makes two exhibits the same.
function identityCombinations(combinations) {
  const list = Array.isArray(combinations) ? combinations : [];
  return new Set(list.map(lower).filter((slug) => slug !== '' && slug !== 'all'));
}

/** Drops the case, spacing, ".docx" and copy-suffix differences a re-upload of one document picks up. */
function normalizeExhibitFileName(fileName) {
  // Capped and collapsed before the anchored patterns run, so hostile input stays cheap.
  let name = lower(fileName).slice(0, MAX_FILE_NAME_LENGTH).replace(/[\s_-]+/g, ' ').trim();
  for (let pass = 0; pass < MAX_SUFFIX_PASSES; pass += 1) {
    const next = name.replace(/\.docx?$/, '').replace(/ ?\(\d+\)$/, '').trim();
    if (next === name) break;
    name = next;
  }
  // Only a lone trailing "1" is a copy marker; "Exhibit 2" or "Microsoft 365" are real names.
  return name.replace(/([a-z)]) ?1$/, '$1').trim();
}

function keyOf(exhibit) {
  return {
    combinations: identityCombinations(exhibit && exhibit.combinations),
    planType: lower(exhibit && exhibit.planType),
    includeType: lower(exhibit && exhibit.includeType) || DEFAULT_INCLUDE_TYPE,
  };
}

function sharesCombination(a, b) {
  for (const slug of a) if (b.has(slug)) return true;
  return false;
}

function sameKey(a, b) {
  return a.planType === b.planType
    && a.includeType === b.includeType
    && a.combinations.size === b.combinations.size
    && Array.from(a.combinations).every((slug) => b.combinations.has(slug));
}

/** Existing exhibits the candidate would duplicate; `reasons` limits which rules apply. */
function findExhibitDuplicates(candidate, existing, options) {
  const excludeId = options && options.excludeId != null ? String(options.excludeId) : null;
  const rules = new Set((options && options.reasons) || [REASON_KEY, REASON_FILE]);
  const key = keyOf(candidate);
  const normalizedName = normalizeExhibitFileName(candidate && candidate.fileName);
  const matches = [];

  (Array.isArray(existing) ? existing : []).forEach((exhibit) => {
    if (!exhibit) return;
    const id = String(exhibit._id != null ? exhibit._id : exhibit.id);
    if (excludeId !== null && id === excludeId) return;

    const reasons = [];
    const other = keyOf(exhibit);
    if (
      rules.has(REASON_KEY)
      && key.planType !== ''
      && key.planType === other.planType
      && key.includeType === other.includeType
      && sharesCombination(key.combinations, other.combinations)
    ) {
      reasons.push(REASON_KEY);
    }
    if (rules.has(REASON_FILE) && normalizedName !== '' && normalizedName === normalizeExhibitFileName(exhibit.fileName)) {
      reasons.push(REASON_FILE);
    }
    if (reasons.length === 0) return;

    matches.push({
      id,
      name: String(exhibit.name || ''),
      fileName: String(exhibit.fileName || ''),
      combinations: Array.isArray(exhibit.combinations) ? exhibit.combinations.slice() : [],
      planType: String(exhibit.planType || ''),
      includeType: String(exhibit.includeType || ''),
      reasons,
    });
  });

  return matches;
}

/**
 * Which duplicate rules an edit needs: [] when nothing identifying changed, only the file-name
 * rule when just the file was swapped (the key was already accepted), both otherwise.
 */
function duplicateRulesForEdit(existing, update) {
  const patch = update || {};
  const keyChanged = !sameKey(keyOf(existing), keyOf({ ...(existing || {}), ...patch }));
  if (keyChanged) return [REASON_KEY, REASON_FILE];
  const fileChanged = Object.prototype.hasOwnProperty.call(patch, 'fileName')
    && normalizeExhibitFileName(patch.fileName) !== normalizeExhibitFileName(existing && existing.fileName);
  return fileChanged ? [REASON_FILE] : [];
}

/** True only for an explicit override; a multipart field arrives as the string "true". */
function isDuplicateOverride(value) {
  return value === true || lower(value) === 'true';
}

/** null to proceed, or the 409 to send. */
function checkExhibitDuplicates(input) {
  const source = input || {};
  if (isDuplicateOverride(source.allowDuplicate)) return null;

  const duplicates = findExhibitDuplicates(source.candidate, source.existing, {
    excludeId: source.excludeId,
    reasons: source.reasons,
  });
  if (duplicates.length === 0) return null;

  const names = duplicates.slice(0, MAX_REPORTED).map((d) => `"${d.name || d.fileName}"`).join(', ');
  const more = duplicates.length > MAX_REPORTED ? ` and ${duplicates.length - MAX_REPORTED} more` : '';
  return {
    status: 409,
    body: {
      success: false,
      code: DUPLICATE_CODE,
      error: `Not saved: this looks like a duplicate of ${names}${more}.`,
      duplicates,
    },
  };
}

module.exports = {
  DUPLICATE_CODE,
  normalizeExhibitFileName,
  findExhibitDuplicates,
  duplicateRulesForEdit,
  isDuplicateOverride,
  checkExhibitDuplicates,
};
