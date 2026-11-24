const MAX_TAGS = 500;
const MAX_TAG_LENGTH = 200;

/** The template tag list a client sent with a saved agreement, or null when it is not a usable list. */
function sanitizeTemplateTags(value) {
  if (!Array.isArray(value) || value.length > MAX_TAGS) return null;
  if (!value.every((tag) => typeof tag === 'string' && tag.length > 0 && tag.length <= MAX_TAG_LENGTH)) return null;
  return [...new Set(value)];
}

module.exports = { sanitizeTemplateTags };
