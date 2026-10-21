import { describe, it, expect } from 'vitest';
import { formatStepActor } from '../../src/utils/approvalActor';
import { techSignInErrorMessage, techSignInReasonMessage } from '../../src/utils/technicalSignIn';

describe('formatStepActor', () => {
  it('shows the verified actor when actedBy is present', () => {
    const step = { email: 'tech-team@cpq12.test', actedBy: { name: 'Ada Lovelace', email: 'ada@cpq12.test' } };
    expect(formatStepActor(step)).toBe('By: Ada Lovelace (ada@cpq12.test)');
  });

  it('falls back to the actor email when the name is missing', () => {
    expect(formatStepActor({ email: 'team@cpq12.test', actedBy: { email: 'ada@cpq12.test' } })).toBe('By: ada@cpq12.test');
  });

  it('keeps the existing Email line without actedBy', () => {
    expect(formatStepActor({ email: 'tech-team@cpq12.test' })).toBe('Email: tech-team@cpq12.test');
  });

  it('returns null when there is nothing to show', () => {
    expect(formatStepActor(undefined)).toBeNull();
    expect(formatStepActor({})).toBeNull();
  });
});

describe('technical sign-in messages', () => {
  it('names the account for NOT_ON_LIST', () => {
    const msg = techSignInReasonMessage({
      signedIn: true, verified: true, allowed: false, enforced: true,
      name: 'Bob', email: 'bob@cloudfuze.com', reason: 'NOT_ON_LIST',
    });
    expect(msg).toBe("You're signed in as Bob (bob@cloudfuze.com), but you're not on the Technical approver list.");
  });

  it('surfaces server messages only for technical sign-in error codes', () => {
    const authErr = Object.assign(new Error('Sign in with Microsoft to approve.'), { status: 401, code: 'TECH_SIGNIN_REQUIRED' });
    const forbidden = Object.assign(new Error('Not on the list.'), { status: 403, code: 'TECH_NOT_AUTHORIZED' });
    const other = Object.assign(new Error('boom'), { status: 500 });
    expect(techSignInErrorMessage(authErr)).toBe('Sign in with Microsoft to approve.');
    expect(techSignInErrorMessage(forbidden)).toBe('Not on the list.');
    expect(techSignInErrorMessage(other)).toBeNull();
    expect(techSignInErrorMessage('nope')).toBeNull();
  });
});
