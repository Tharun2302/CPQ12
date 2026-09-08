import { describe, it, expect } from 'vitest';
import {
  esignLinkRecipientIsReviewer,
  esignLinkableRecipients,
  esignRecipientLinkLabel,
  esignRecipientLinkState,
  esignRecipientRoleDisplay,
  type EsignLinkRecipient,
} from '../../src/utils/esignRecipientLinks';

const recipient = (over: Partial<EsignLinkRecipient> = {}): EsignLinkRecipient => ({
  id: 'r1',
  name: 'Joanna Wald',
  email: 'joanna.wald@example.com',
  role: 'signer',
  status: 'pending',
  signing_token: 'tok-1',
  sent_at: '2026-09-08T18:00:00Z',
  ...over,
});

describe('esignLinkRecipientIsReviewer', () => {
  it('trusts an explicit action over the role', () => {
    expect(esignLinkRecipientIsReviewer(recipient({ action: 'reviewer' }))).toBe(true);
    expect(esignLinkRecipientIsReviewer(recipient({ action: 'signer', role: 'Legal Team' }))).toBe(false);
  });

  it('falls back to the review-only roles', () => {
    expect(esignLinkRecipientIsReviewer(recipient({ role: 'Technical Team' }))).toBe(true);
    expect(esignLinkRecipientIsReviewer(recipient({ role: 'Legal Team' }))).toBe(true);
    expect(esignLinkRecipientIsReviewer(recipient({ role: 'signer' }))).toBe(false);
  });

  // The place-fields role dropdown writes role: 'reviewer' and clears action, so this must match
  // the server (recipientIsEsignReviewer) or the same person is labelled Signer here and Reviewer there.
  it('treats a role-only reviewer as a reviewer', () => {
    expect(esignLinkRecipientIsReviewer(recipient({ role: 'reviewer', action: undefined }))).toBe(true);
    expect(esignLinkRecipientIsReviewer(recipient({ role: 'Reviewer', action: null }))).toBe(true);
    expect(esignRecipientLinkLabel(recipient({ role: 'reviewer', action: null }))).toBe('Reviewer');
  });
});

describe('esignRecipientLinkState', () => {
  it('marks an invited, not-yet-acted recipient as ready', () => {
    expect(esignRecipientLinkState(recipient())).toBe('ready');
    expect(esignRecipientLinkState(recipient({ status: 'viewed' }))).toBe('ready');
  });

  it('marks a token with no email as awaiting their turn', () => {
    expect(esignRecipientLinkState(recipient({ sent_at: null }))).toBe('awaiting_turn');
    expect(esignRecipientLinkState(recipient({ sent_at: undefined }))).toBe('awaiting_turn');
  });

  it('does not call an already-viewed recipient deferred even with no sent_at', () => {
    expect(esignRecipientLinkState(recipient({ sent_at: null, status: 'viewed' }))).toBe('ready');
  });

  it('marks acted-on recipients as spent', () => {
    for (const status of ['signed', 'reviewed', 'denied']) {
      expect(esignRecipientLinkState(recipient({ status }))).toBe('spent');
    }
  });

  it('defaults a missing status to pending', () => {
    expect(esignRecipientLinkState({ id: 'r1', signing_token: 't', sent_at: null })).toBe('awaiting_turn');
  });
});

describe('esignLinkableRecipients', () => {
  it('keeps only recipients holding a token', () => {
    const rows = [recipient(), recipient({ id: 'r2', signing_token: null }), recipient({ id: 'r3' })];
    expect(esignLinkableRecipients(rows).map((r) => r.id)).toEqual(['r1', 'r3']);
  });

  it('survives missing and malformed input', () => {
    expect(esignLinkableRecipients(null)).toEqual([]);
    expect(esignLinkableRecipients(undefined)).toEqual([]);
    expect(esignLinkableRecipients([null as unknown as EsignLinkRecipient, recipient()])).toHaveLength(1);
  });
});

describe('esignRecipientLinkLabel', () => {
  it('names the role when the link is ready', () => {
    expect(esignRecipientLinkLabel(recipient())).toBe('Signer');
    expect(esignRecipientLinkLabel(recipient({ action: 'reviewer' }))).toBe('Reviewer');
  });

  it('explains why a deferred link is not their turn', () => {
    expect(esignRecipientLinkLabel(recipient({ sent_at: null }))).toBe('Signer · waiting for their turn');
    expect(esignRecipientLinkLabel(recipient({ sent_at: null, action: 'reviewer' }))).toBe(
      'Reviewer · waiting for their turn'
    );
  });

  it('reports what a spent link was used for', () => {
    expect(esignRecipientLinkLabel(recipient({ status: 'signed' }))).toBe('Signer · signed');
    expect(esignRecipientLinkLabel(recipient({ status: 'reviewed', action: 'reviewer' }))).toBe('Reviewer · reviewed');
    expect(esignRecipientLinkLabel(recipient({ status: 'denied' }))).toBe('Signer · denied');
  });
});

describe('esignRecipientRoleDisplay', () => {
  // The bug this exists for: the action dropdown sets action='reviewer' and leaves role='signer',
  // so printing `role` raw labelled a reviewer as "Signer" on the status and tracking pages.
  it('says Reviewer when only the action was switched', () => {
    expect(esignRecipientRoleDisplay(recipient({ role: 'signer', action: 'reviewer' }))).toBe('Reviewer');
  });

  it('says Reviewer when only the role was switched', () => {
    expect(esignRecipientRoleDisplay(recipient({ role: 'reviewer', action: null }))).toBe('Reviewer');
  });

  it('says Signer for a plain signer, however it is spelled', () => {
    expect(esignRecipientRoleDisplay(recipient({ role: 'signer', action: null }))).toBe('Signer');
    expect(esignRecipientRoleDisplay(recipient({ role: 'Signer', action: undefined }))).toBe('Signer');
    expect(esignRecipientRoleDisplay(recipient({ role: '', action: null }))).toBe('Signer');
  });

  it('keeps a named team alongside what they actually do', () => {
    expect(esignRecipientRoleDisplay(recipient({ role: 'Legal Team', action: null }))).toBe('Legal Team · Reviewer');
    expect(esignRecipientRoleDisplay(recipient({ role: 'Technical Team', action: 'signer' }))).toBe(
      'Technical Team · Signer'
    );
    expect(esignRecipientRoleDisplay(recipient({ role: 'Team Lead', action: null }))).toBe('Team Lead · Signer');
  });
});
