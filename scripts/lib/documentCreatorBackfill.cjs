'use strict';

// Pure resolver for scripts/backfill-document-creators.cjs, kept separate so the attribution
// rules are unit tested without a database.

const { normalizeEmail } = require('../../onlyoffice-redline.cjs');
const { esignDocumentCreatorEmail } = require('../../esign-creator-utils.cjs');

const SOURCES = ['backfill:approval', 'backfill:approval-unverified', 'backfill:esign'];

function uniqueEmails(values) {
  return [...new Set(values.map(normalizeEmail).filter((e) => e.includes('@')))];
}

const requesterOf = (w) => w.creatorEmail || w.createdBy;

// Rows from before login-verified approvals (no creatorVerified flag) took the requester from the
// request body, so they could be forged; they keep their own source label so they can be reviewed.
function splitWorkflows(workflows) {
  const verified = workflows.filter((w) => w && w.creatorVerified === true);
  const unverified = workflows.filter((w) => w && w.creatorVerified === undefined);
  return { verified: uniqueEmails(verified.map(requesterOf)), unverified: uniqueEmails(unverified.map(requesterOf)) };
}

function fromCandidates(candidates, source) {
  if (candidates.length === 1) return { status: 'attributed', email: candidates[0], source };
  return { status: 'ambiguous', source, candidates };
}

/**
 * Works out who created a legacy document.
 * Returns { status: 'existing' } | { status: 'attributed', email, source }
 *       | { status: 'ambiguous', source, candidates } | { status: 'unverified', candidates }
 *       | { status: 'unattributable' }.
 */
function resolveDocumentCreator({ doc, workflows = [], esignDocs = [], includeUnverified = true }) {
  if (normalizeEmail(doc && doc.createdByEmail)) return { status: 'existing' };

  const { verified, unverified } = splitWorkflows(workflows);
  if (verified.length) return fromCandidates(verified, 'backfill:approval');
  if (unverified.length) {
    return includeUnverified
      ? fromCandidates(unverified, 'backfill:approval-unverified')
      : { status: 'unverified', candidates: unverified };
  }

  const esignCreators = uniqueEmails(esignDocs.map(esignDocumentCreatorEmail));
  if (esignCreators.length) return fromCandidates(esignCreators, 'backfill:esign');

  return { status: 'unattributable' };
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row && row[key] != null ? String(row[key]) : '';
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

const countBySource = () => Object.fromEntries(SOURCES.map((s) => [s, 0]));

/** Resolves every document and tallies the outcome. `plan` lists only the documents to write. */
function planBackfill({ documents, workflows, esignDocs, includeUnverified = true }) {
  const workflowsByDoc = groupBy(workflows, 'documentId');
  const esignByDoc = groupBy(esignDocs, 'source_document_id');
  const summary = {
    total: documents.length,
    existing: 0,
    attributed: countBySource(),
    ambiguous: countBySource(),
    unverifiedOnly: 0,
    unattributable: 0,
  };
  const plan = [];
  const ambiguousIds = [];
  const unverifiedIds = [];
  const unattributableIds = [];
  for (const doc of documents) {
    const out = resolveDocumentCreator({
      doc,
      workflows: workflowsByDoc.get(String(doc.id)) || [],
      esignDocs: esignByDoc.get(String(doc.id)) || [],
      includeUnverified,
    });
    if (out.status === 'existing') summary.existing += 1;
    else if (out.status === 'attributed') {
      summary.attributed[out.source] += 1;
      plan.push({ id: doc.id, email: out.email, source: out.source });
    } else if (out.status === 'ambiguous') {
      summary.ambiguous[out.source] += 1;
      ambiguousIds.push(doc.id);
    } else if (out.status === 'unverified') {
      summary.unverifiedOnly += 1;
      unverifiedIds.push(doc.id);
    } else {
      summary.unattributable += 1;
      unattributableIds.push(doc.id);
    }
  }
  return { summary, plan, ambiguousIds, unverifiedIds, unattributableIds };
}

module.exports = { resolveDocumentCreator, planBackfill };
