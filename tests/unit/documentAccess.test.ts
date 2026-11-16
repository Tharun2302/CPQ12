import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import access from '../../document-access.cjs';
// @ts-expect-error - CommonJS helper used by the backfill script, no type declarations
import backfill from '../../scripts/lib/documentCreatorBackfill.cjs';

const { documentListOwnerMatch, combineMatches, mayReadDocument, mayDeleteDocument, creatorStampFromLogin } = access as Record<string, (...args: any[]) => any>;
const { resolveDocumentCreator, planBackfill } = backfill as Record<string, (...args: any[]) => any>;

const CREATOR = 'creator@cloudfuze.com';
const STRANGER = { email: 'stranger@cloudfuze.com' };
const DOC = { id: 'Acme_Jane_12345', createdByEmail: CREATOR };
const LEGACY = { id: 'Old_Doc_00001' };

describe('documentListOwnerMatch', () => {
  it('document admins see everything', () => {
    expect(documentListOwnerMatch({ user: STRANGER, isDocumentAdmin: true })).toEqual({});
  });

  it('everyone else sees only what they created, matched on the normalized login email', () => {
    expect(documentListOwnerMatch({ user: { email: ' Creator@CloudFuze.com ' }, isDocumentAdmin: false }))
      .toEqual({ createdByEmail: CREATOR });
  });

  it('a login with no email matches nothing', () => {
    expect(documentListOwnerMatch({ user: {}, isDocumentAdmin: false })).toEqual({ _id: null });
    expect(documentListOwnerMatch({ user: null })).toEqual({ _id: null });
  });

  it('only a literal true counts as admin', () => {
    expect(documentListOwnerMatch({ user: STRANGER, isDocumentAdmin: 'yes' })).toEqual({ createdByEmail: STRANGER.email });
  });
});

describe('combineMatches', () => {
  it('drops empty filters and only uses $and when needed', () => {
    expect(combineMatches({}, {})).toEqual({});
    expect(combineMatches({ id: { $in: ['a'] } }, {})).toEqual({ id: { $in: ['a'] } });
    expect(combineMatches({ id: { $in: ['a'] } }, { createdByEmail: CREATOR }))
      .toEqual({ $and: [{ id: { $in: ['a'] } }, { createdByEmail: CREATOR }] });
  });
});

describe('mayReadDocument', () => {
  it('allows the creator', () => {
    expect(mayReadDocument({ doc: DOC, user: { email: 'CREATOR@cloudfuze.com' } })).toBe(true);
  });

  it.each(['isDocumentAdmin', 'isApprovalAdmin', 'isRedlineAdmin'])('allows a stranger who is %s', (flag) => {
    expect(mayReadDocument({ doc: DOC, user: STRANGER, [flag]: true })).toBe(true);
  });

  it('allows the requester or an assigned approver of a linked approval', () => {
    const workflow = { creatorEmail: 'req@cloudfuze.com', workflowSteps: [{ email: 'Legal@CloudFuze.com' }] };
    expect(mayReadDocument({ doc: DOC, user: { email: 'req@cloudfuze.com' }, linkedWorkflows: [workflow] })).toBe(true);
    expect(mayReadDocument({ doc: DOC, user: { email: 'legal@cloudfuze.com' }, linkedWorkflows: [workflow] })).toBe(true);
    expect(mayReadDocument({ doc: DOC, user: STRANGER, linkedWorkflows: [workflow] })).toBe(false);
  });

  it('allows the creator of a linked e-sign document (address in uploaded_by or requested_by_email)', () => {
    expect(mayReadDocument({ doc: DOC, user: { email: 'up@cloudfuze.com' }, linkedEsignDocs: [{ uploaded_by: 'up@cloudfuze.com' }] })).toBe(true);
    expect(mayReadDocument({ doc: DOC, user: { email: 'rq@cloudfuze.com' }, linkedEsignDocs: [{ uploaded_by: 'Some Name', requested_by_email: 'rq@cloudfuze.com' }] })).toBe(true);
  });

  it('denies a stranger', () => {
    expect(mayReadDocument({ doc: DOC, user: STRANGER })).toBe(false);
  });

  it('legacy document with no creator: stranger denied, document admin allowed', () => {
    expect(mayReadDocument({ doc: LEGACY, user: STRANGER })).toBe(false);
    expect(mayReadDocument({ doc: LEGACY, user: { email: '' } })).toBe(false);
    expect(mayReadDocument({ doc: LEGACY, user: STRANGER, isDocumentAdmin: true })).toBe(true);
  });

  it('denies a caller without an email even when flags are set', () => {
    expect(mayReadDocument({ doc: DOC, user: {}, isDocumentAdmin: true })).toBe(false);
    expect(mayReadDocument({ doc: null, user: STRANGER, isDocumentAdmin: true })).toBe(false);
  });
});

describe('mayDeleteDocument', () => {
  it('allows the creator and a document admin only', () => {
    expect(mayDeleteDocument({ doc: DOC, user: { email: CREATOR } })).toBe(true);
    expect(mayDeleteDocument({ doc: DOC, user: STRANGER, isDocumentAdmin: true })).toBe(true);
    expect(mayDeleteDocument({ doc: DOC, user: STRANGER })).toBe(false);
    expect(mayDeleteDocument({ doc: LEGACY, user: STRANGER })).toBe(false);
  });
});

describe('creatorStampFromLogin', () => {
  it('takes identity from the verified user only', () => {
    expect(creatorStampFromLogin({ id: 'u-1', email: ' Rep@CloudFuze.com ' }))
      .toEqual({ createdByEmail: 'rep@cloudfuze.com', createdByUserId: 'u-1', createdBySource: 'login' });
  });
});

describe('backfill resolver', () => {
  const wf = (email: string, extra: Record<string, unknown> = {}) =>
    ({ documentId: DOC.id, creatorEmail: email, creatorVerified: true, ...extra });
  const legacyWf = (email: string) => ({ documentId: DOC.id, creatorEmail: email });

  it('keeps an existing value', () => {
    expect(resolveDocumentCreator({ doc: DOC, workflows: [wf('other@x.com')] })).toEqual({ status: 'existing' });
  });

  it('attributes a single verified requester (several workflows, same person)', () => {
    const out = resolveDocumentCreator({ doc: LEGACY, workflows: [wf('Req@x.com'), wf('req@x.com')] });
    expect(out).toEqual({ status: 'attributed', email: 'req@x.com', source: 'backfill:approval' });
  });

  it('ignores rows marked unverified and prefers verified rows over legacy ones', () => {
    const out = resolveDocumentCreator({
      doc: LEGACY,
      workflows: [wf('req@x.com'), wf('forged@x.com', { creatorVerified: false }), legacyWf('old@x.com')],
    });
    expect(out).toEqual({ status: 'attributed', email: 'req@x.com', source: 'backfill:approval' });
  });

  it('with includeUnverified: false, skips legacy rows and does not fall back to e-sign', () => {
    const out = resolveDocumentCreator({
      doc: LEGACY, workflows: [legacyWf('old@x.com')], esignDocs: [{ uploaded_by: 'e@x.com' }], includeUnverified: false,
    });
    expect(out).toEqual({ status: 'unverified', candidates: ['old@x.com'] });
  });

  it('uses legacy rows by default, under their own source', () => {
    const out = resolveDocumentCreator({ doc: LEGACY, workflows: [legacyWf('Old@x.com')] });
    expect(out).toEqual({ status: 'attributed', email: 'old@x.com', source: 'backfill:approval-unverified' });
    const two = resolveDocumentCreator({ doc: LEGACY, workflows: [legacyWf('a@x.com'), legacyWf('b@x.com')], includeUnverified: true });
    expect(two).toMatchObject({ status: 'ambiguous', source: 'backfill:approval-unverified' });
  });

  it('reports different verified requesters as ambiguous', () => {
    const out = resolveDocumentCreator({ doc: LEGACY, workflows: [wf('a@x.com'), wf('b@x.com')] });
    expect(out).toMatchObject({ status: 'ambiguous', source: 'backfill:approval' });
  });

  it('falls back to the linked e-sign creator', () => {
    const out = resolveDocumentCreator({ doc: LEGACY, workflows: [], esignDocs: [{ uploaded_by: 'Name', requested_by_email: 'Es@x.com' }] });
    expect(out).toEqual({ status: 'attributed', email: 'es@x.com', source: 'backfill:esign' });
  });

  it('leaves the rest unattributable', () => {
    expect(resolveDocumentCreator({ doc: LEGACY })).toEqual({ status: 'unattributable' });
    expect(resolveDocumentCreator({ doc: LEGACY, workflows: [wf('', {})], esignDocs: [{ uploaded_by: 'No Address' }] }))
      .toEqual({ status: 'unattributable' });
  });

  it('planBackfill tallies by outcome and only plans writes for attributed rows', () => {
    const out = planBackfill({
      documents: [DOC, { id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }, { id: 'd5' }],
      workflows: [
        { documentId: 'd1', creatorEmail: 'a@x.com', creatorVerified: true },
        { documentId: 'd3', creatorEmail: 'a@x.com', creatorVerified: true },
        { documentId: 'd3', creatorEmail: 'b@x.com', creatorVerified: true },
        { documentId: 'd5', creatorEmail: 'old@x.com' },
      ],
      esignDocs: [{ source_document_id: 'd2', uploaded_by: 'e@x.com' }],
      includeUnverified: false,
    });
    expect(out.summary).toEqual({
      total: 6,
      existing: 1,
      attributed: { 'backfill:approval': 1, 'backfill:approval-unverified': 0, 'backfill:esign': 1 },
      ambiguous: { 'backfill:approval': 1, 'backfill:approval-unverified': 0, 'backfill:esign': 0 },
      unverifiedOnly: 1,
      unattributable: 1,
    });
    expect(out.plan).toEqual([
      { id: 'd1', email: 'a@x.com', source: 'backfill:approval' },
      { id: 'd2', email: 'e@x.com', source: 'backfill:esign' },
    ]);
    expect(out.ambiguousIds).toEqual(['d3']);
    expect(out.unverifiedIds).toEqual(['d5']);
    expect(out.unattributableIds).toEqual(['d4']);

    const withLegacy = planBackfill({
      documents: [{ id: 'd5' }], workflows: [{ documentId: 'd5', creatorEmail: 'old@x.com' }], esignDocs: [],
    });
    expect(withLegacy.plan).toEqual([{ id: 'd5', email: 'old@x.com', source: 'backfill:approval-unverified' }]);
  });
});

describe('parseDocumentIdInput', () => {
  const { parseDocumentIdInput } = access as Record<string, (...args: any[]) => any>;

  it('accepts absent values and trimmed non-empty strings', () => {
    expect(parseDocumentIdInput(undefined)).toEqual({ ok: true, value: null });
    expect(parseDocumentIdInput(null)).toEqual({ ok: true, value: null });
    expect(parseDocumentIdInput('')).toEqual({ ok: true, value: null });
    expect(parseDocumentIdInput(' Acme_Bob_12345 ')).toEqual({ ok: true, value: 'Acme_Bob_12345' });
  });

  it.each([
    [['Acme_Bob_12345', 'x']], [{ $ne: null }], [42], [true], ['   '], ['x'.repeat(201)],
  ])('rejects %j', (raw) => {
    expect(parseDocumentIdInput(raw)).toEqual({ ok: false });
  });
});

describe('backfill script safety', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(path.resolve(process.cwd(), 'scripts/backfill-document-creators.cjs'), 'utf8');

  it('only writes with --apply plus the explicit confirm flag, and never overwrites a creator', () => {
    expect(src).toContain("process.argv.includes('--apply')");
    expect(src).toContain("process.argv.includes('--i-understand-this-is-the-live-database')");
    expect(src).toContain("!process.argv.includes('--verified-only')");
    expect(src.indexOf('if (!apply)')).toBeLessThan(src.indexOf('await applyPlan('));
    expect(src.indexOf('if (!confirmed)')).toBeLessThan(src.indexOf('await applyPlan('));
    expect(src).toContain("createdByEmail: { $in: [null, ''] }");
    expect(src).not.toMatch(/deleteOne|deleteMany|drop\(/);
  });
});
