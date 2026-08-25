import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import creatorUtils from '../../esign-creator-utils.cjs';

// Every creator-only e-sign action (delete, remind, extend expiry, cancel signing) resolves
// identity through this rule. If it disagrees with what the agreement list shows as
// "Created by", the UI offers actions the server then rejects with a 403.

const { esignDocumentCreatorEmail, actorIsEsignDocumentCreator } = creatorUtils as {
  esignDocumentCreatorEmail: (doc: unknown) => string;
  actorIsEsignDocumentCreator: (doc: unknown, actorEmail: unknown) => boolean;
};

const ME = 'abhilasha.kandakatla@cloudfuze.com';

describe('esignDocumentCreatorEmail', () => {
  it('uses uploaded_by when it is an address (manually uploaded document)', () => {
    expect(esignDocumentCreatorEmail({ uploaded_by: ME })).toBe(ME);
  });

  it('falls back to requested_by_email when uploaded_by is a display name', () => {
    expect(esignDocumentCreatorEmail({ uploaded_by: 'Abhilasha Kandakatla', requested_by_email: ME })).toBe(ME);
  });

  it('prefers uploaded_by over requested_by_email when both are addresses', () => {
    expect(esignDocumentCreatorEmail({ uploaded_by: ME, requested_by_email: 'someone.else@cloudfuze.com' })).toBe(ME);
  });

  it('returns empty when neither field carries an address', () => {
    expect(esignDocumentCreatorEmail({ uploaded_by: 'Abhilasha Kandakatla' })).toBe('');
    expect(esignDocumentCreatorEmail({})).toBe('');
    expect(esignDocumentCreatorEmail(null)).toBe('');
  });
});

describe('actorIsEsignDocumentCreator', () => {
  it('authorizes the creator of a manually uploaded document', () => {
    expect(actorIsEsignDocumentCreator({ uploaded_by: ME }, ME)).toBe(true);
  });

  it('authorizes the creator of an approval-generated document', () => {
    // Regression: uploaded_by is a name here, so a uploaded_by-only check locked the real
    // creator out of Delete/Remind/Extend on their own agreement with a 403.
    const doc = { uploaded_by: 'Abhilasha Kandakatla', requested_by_email: ME };
    expect(actorIsEsignDocumentCreator(doc, ME)).toBe(true);
  });

  it('ignores case and surrounding whitespace on both sides', () => {
    expect(actorIsEsignDocumentCreator({ uploaded_by: '  Abhilasha.Kandakatla@CloudFuze.com ' }, ME)).toBe(true);
  });

  it('rejects a different user', () => {
    expect(actorIsEsignDocumentCreator({ uploaded_by: ME }, 'anthony@cloudfuze.com')).toBe(false);
    expect(actorIsEsignDocumentCreator({ uploaded_by: 'Someone Else', requested_by_email: 'anthony@cloudfuze.com' }, ME)).toBe(false);
  });

  it('rejects when the document has no resolvable creator address', () => {
    expect(actorIsEsignDocumentCreator({ uploaded_by: 'Abhilasha Kandakatla' }, ME)).toBe(false);
    expect(actorIsEsignDocumentCreator({}, ME)).toBe(false);
  });

  it('rejects when the actor has no email, so an unauthenticated caller never matches', () => {
    expect(actorIsEsignDocumentCreator({ uploaded_by: ME }, '')).toBe(false);
    expect(actorIsEsignDocumentCreator({ uploaded_by: ME }, null)).toBe(false);
    expect(actorIsEsignDocumentCreator({ uploaded_by: ME }, undefined)).toBe(false);
  });
});
