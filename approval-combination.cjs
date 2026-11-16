const MAX_COMBINATION_LENGTH = 150;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Returns { ok, value }: value is the trimmed label, or null when none was supplied.
function parseCombinationInput(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const value = raw.trim();
  if (value === '') return { ok: true, value: null };
  if (value.length > MAX_COMBINATION_LENGTH) return { ok: false };
  return { ok: true, value };
}

// Older workflows have no combination, so the email simply leaves the line out.
function combinationRowHtml(workflowData) {
  const parsed = parseCombinationInput(workflowData && workflowData.combination);
  if (!parsed.ok || !parsed.value) return '';
  return `<p><strong>Combination:</strong> ${escapeHtml(parsed.value)}</p>`;
}

module.exports = {
  MAX_COMBINATION_LENGTH,
  parseCombinationInput,
  combinationRowHtml,
};
