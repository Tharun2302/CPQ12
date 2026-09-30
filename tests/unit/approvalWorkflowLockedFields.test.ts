import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import guard from '../../approval-step-guard.cjs';

// PUT /api/approval-workflows/:id takes an unauthenticated body. If it could rewrite
// creatorEmail, anyone could make themselves "the requester" and pass requester-only checks
// such as Edit for RedLine during an approval.

const { stripLockedWorkflowFields } = guard as {
  stripLockedWorkflowFields: (body: unknown) => { updates: Record<string, unknown>; stripped: string[] };
};

describe('stripLockedWorkflowFields', () => {
  it('drops the requester and ownership fields', () => {
    const { updates, stripped } = stripLockedWorkflowFields({
      creatorEmail: 'attacker@evil.test',
      createdBy: 'attacker@evil.test',
      documentId: 'someone-elses-doc',
      id: 'WF-other',
      createdAt: '2020-01-01',
      status: 'denied',
    });
    expect(updates).toEqual({ status: 'denied' });
    expect(stripped.sort()).toEqual(['createdAt', 'createdBy', 'creatorEmail', 'documentId', 'id']);
  });

  it('drops creatorVerified so a row cannot be promoted to a trusted requester', () => {
    expect(stripLockedWorkflowFields({ creatorVerified: true, status: 'pending' }).updates).toEqual({ status: 'pending' });
  });

  it('drops the redline history so it cannot be forged or erased', () => {
    const { updates } = stripLockedWorkflowFields({
      hasRedlineEdit: false, redlineEdits: [], redlineForked: true, redlineDocumentId: 'x', redlineEditedAt: 'y',
    });
    expect(updates).toEqual({});
  });

  it('drops dotted paths into locked fields and Mongo operator keys', () => {
    const { updates, stripped } = stripLockedWorkflowFields({
      'redlineEdits.0.editedBy': 'attacker@evil.test',
      $where: '1',
      'workflowSteps.1.comments': 'ok',
    });
    expect(updates).toEqual({ 'workflowSteps.1.comments': 'ok' });
    expect(stripped).toEqual(['redlineEdits.0.editedBy', '$where']);
  });

  it('keeps the fields real screens send (cancel, client approval, infra/QA steps)', () => {
    const body = { status: 'in_progress', currentStep: 3, workflowSteps: [{ step: 1, status: 'approved' }] };
    expect(stripLockedWorkflowFields(body).updates).toEqual(body);
  });

  it('lets creation keep documentId while still dropping the requester and id', () => {
    const { updates } = stripLockedWorkflowFields(
      { documentId: 'doc-1', creatorEmail: 'someone@evil.test', id: 'WF-victim', status: 'approved' },
      { allow: ['documentId'] }
    );
    expect(updates).toEqual({ documentId: 'doc-1', status: 'approved' });
  });

  it('treats a missing or non-object body as no updates', () => {
    expect(stripLockedWorkflowFields(null).updates).toEqual({});
    expect(stripLockedWorkflowFields([{ creatorEmail: 'x' }]).updates).toEqual({});
    expect(stripLockedWorkflowFields('creatorEmail').updates).toEqual({});
  });
});
