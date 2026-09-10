import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import progressUtils from '../../esign-progress-utils.cjs';

type Recipient = {
  name?: string;
  email?: string;
  status?: string;
  order?: number;
};

type Progress = {
  total: number;
  completed: number;
  outstanding: Array<{ name?: string; email?: string }>;
};

const {
  summarizeEsignRecipientProgress,
  esignRecipientDisplayLabel,
  formatEsignOutstandingNames,
  formatEsignProgressLine,
  esignProgressActionLabel,
} = progressUtils as {
  summarizeEsignRecipientProgress: (recipients: unknown) => Progress;
  esignRecipientDisplayLabel: (rec: unknown) => string;
  formatEsignOutstandingNames: (outstanding: unknown) => string;
  formatEsignProgressLine: (progress: unknown) => string;
  esignProgressActionLabel: (action: unknown) => string;
};

const reviewer = (over: Partial<Recipient> = {}): Recipient => ({
  name: 'Joanna Wald',
  email: 'joanna.wald@example.com',
  status: 'reviewed',
  order: 1,
  ...over,
});

const signer = (over: Partial<Recipient> = {}): Recipient => ({
  name: 'Adi Nandyala',
  email: 'adi.nandyala@example.com',
  status: 'pending',
  order: 2,
  ...over,
});

describe('summarizeEsignRecipientProgress', () => {
  it('counts signed and reviewed rows as done and leaves the rest outstanding', () => {
    const progress = summarizeEsignRecipientProgress([
      reviewer(),
      signer({ name: 'Christopher Dunn', email: 'christopher.dunn@example.com', status: 'signed' }),
      signer(),
    ]);
    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(2);
    expect(progress.outstanding).toEqual([{ name: 'Adi Nandyala', email: 'adi.nandyala@example.com' }]);
  });

  it('returns an empty outstanding list when everyone has acted', () => {
    const progress = summarizeEsignRecipientProgress([reviewer(), signer({ status: 'signed' })]);
    expect(progress).toEqual({ total: 2, completed: 2, outstanding: [] });
  });

  it('reports nobody done when no recipient has acted', () => {
    const progress = summarizeEsignRecipientProgress([signer(), signer({ name: 'Priya Raman', email: 'priya.raman@example.com' })]);
    expect(progress.total).toBe(2);
    expect(progress.completed).toBe(0);
    expect(progress.outstanding).toEqual([
      { name: 'Adi Nandyala', email: 'adi.nandyala@example.com' },
      { name: 'Priya Raman', email: 'priya.raman@example.com' },
    ]);
  });

  it('treats a denied recipient as still outstanding', () => {
    const progress = summarizeEsignRecipientProgress([reviewer(), signer({ status: 'denied' })]);
    expect(progress.completed).toBe(1);
    expect(progress.outstanding).toEqual([{ name: 'Adi Nandyala', email: 'adi.nandyala@example.com' }]);
  });

  it('treats a recipient with no status field as outstanding', () => {
    const noStatus = { name: 'Rahul Menon', email: 'rahul.menon@example.com' };
    const progress = summarizeEsignRecipientProgress([noStatus]);
    expect(progress).toEqual({
      total: 1,
      completed: 0,
      outstanding: [{ name: 'Rahul Menon', email: 'rahul.menon@example.com' }],
    });
  });

  it('preserves input order in the outstanding list', () => {
    const progress = summarizeEsignRecipientProgress([
      signer({ name: 'Third', email: 'third@example.com' }),
      reviewer(),
      signer({ name: 'First', email: 'first@example.com' }),
    ]);
    expect(progress.outstanding.map((r) => r.name)).toEqual(['Third', 'First']);
  });

  it('survives an empty list and non-array input', () => {
    expect(summarizeEsignRecipientProgress([])).toEqual({ total: 0, completed: 0, outstanding: [] });
    expect(summarizeEsignRecipientProgress(null)).toEqual({ total: 0, completed: 0, outstanding: [] });
    expect(summarizeEsignRecipientProgress(undefined)).toEqual({ total: 0, completed: 0, outstanding: [] });
    expect(summarizeEsignRecipientProgress({ length: 2 })).toEqual({ total: 0, completed: 0, outstanding: [] });
  });

  it('tolerates a null row inside the list', () => {
    const progress = summarizeEsignRecipientProgress([null, reviewer()]);
    expect(progress.total).toBe(2);
    expect(progress.completed).toBe(1);
    expect(progress.outstanding).toEqual([{ name: undefined, email: undefined }]);
  });
});

describe('esignRecipientDisplayLabel', () => {
  it('prefers the recipient name', () => {
    expect(esignRecipientDisplayLabel(signer())).toBe('Adi Nandyala');
  });

  it('trims a padded name', () => {
    expect(esignRecipientDisplayLabel({ name: '  Joanna Wald  ' })).toBe('Joanna Wald');
  });

  it('falls back to the email when the name is missing or whitespace only', () => {
    expect(esignRecipientDisplayLabel({ email: 'adi.nandyala@example.com' })).toBe('adi.nandyala@example.com');
    expect(esignRecipientDisplayLabel({ name: '   ', email: ' adi.nandyala@example.com ' })).toBe('adi.nandyala@example.com');
  });

  it('falls back to a neutral placeholder with neither name nor email', () => {
    expect(esignRecipientDisplayLabel({})).toBe('A recipient');
    expect(esignRecipientDisplayLabel({ name: '', email: '' })).toBe('A recipient');
    expect(esignRecipientDisplayLabel(null)).toBe('A recipient');
    expect(esignRecipientDisplayLabel(undefined)).toBe('A recipient');
  });
});

describe('formatEsignOutstandingNames', () => {
  const named = (name: string) => ({ name, email: `${name.split(' ')[0].toLowerCase()}@example.com` });

  it('returns an empty string for nothing outstanding', () => {
    expect(formatEsignOutstandingNames([])).toBe('');
    expect(formatEsignOutstandingNames(null)).toBe('');
    expect(formatEsignOutstandingNames(undefined)).toBe('');
    expect(formatEsignOutstandingNames('Adi Nandyala')).toBe('');
  });

  it('returns the single name on its own', () => {
    expect(formatEsignOutstandingNames([named('Adi Nandyala')])).toBe('Adi Nandyala');
  });

  it('joins two names with and', () => {
    expect(formatEsignOutstandingNames([named('Adi Nandyala'), named('Joanna Wald')])).toBe(
      'Adi Nandyala and Joanna Wald'
    );
  });

  it('joins three to five names with commas and a trailing and', () => {
    expect(
      formatEsignOutstandingNames([named('Adi Nandyala'), named('Joanna Wald'), named('Christopher Dunn')])
    ).toBe('Adi Nandyala, Joanna Wald and Christopher Dunn');
    expect(
      formatEsignOutstandingNames([
        named('Adi Nandyala'),
        named('Joanna Wald'),
        named('Christopher Dunn'),
        named('Priya Raman'),
        named('Rahul Menon'),
      ])
    ).toBe('Adi Nandyala, Joanna Wald, Christopher Dunn, Priya Raman and Rahul Menon');
  });

  it('caps the list at five names and counts the remainder', () => {
    const six = ['Adi Nandyala', 'Joanna Wald', 'Christopher Dunn', 'Priya Raman', 'Rahul Menon', 'Sofia Ortiz'].map(named);
    expect(formatEsignOutstandingNames(six)).toBe(
      'Adi Nandyala, Joanna Wald, Christopher Dunn, Priya Raman, Rahul Menon and 1 more'
    );
    const eight = [...six, named('Liam Byrne'), named('Mei Tanaka')];
    expect(formatEsignOutstandingNames(eight)).toBe(
      'Adi Nandyala, Joanna Wald, Christopher Dunn, Priya Raman, Rahul Menon and 3 more'
    );
  });

  it('uses email labels for unnamed recipients', () => {
    expect(formatEsignOutstandingNames([{ email: 'adi.nandyala@example.com' }, {}])).toBe(
      'adi.nandyala@example.com and A recipient'
    );
  });
});

describe('formatEsignProgressLine', () => {
  it('reports no recipients when the envelope has none', () => {
    expect(formatEsignProgressLine({ total: 0, completed: 0, outstanding: [] })).toBe('No recipients on this document');
    expect(formatEsignProgressLine(null)).toBe('No recipients on this document');
    expect(formatEsignProgressLine(undefined)).toBe('No recipients on this document');
    expect(formatEsignProgressLine('3 of 3')).toBe('No recipients on this document');
  });

  it('drops the waiting clause when everyone is done', () => {
    expect(formatEsignProgressLine(summarizeEsignRecipientProgress([reviewer(), reviewer(), signer({ status: 'signed' })]))).toBe(
      '3 of 3 done'
    );
  });

  it('names who the creator is waiting on with an em dash', () => {
    const progress = summarizeEsignRecipientProgress([reviewer(), signer({ status: 'signed' }), signer()]);
    expect(formatEsignProgressLine(progress)).toBe('2 of 3 done — waiting on Adi Nandyala');
  });

  it('names several outstanding recipients', () => {
    const progress = summarizeEsignRecipientProgress([
      reviewer(),
      signer(),
      signer({ name: 'Priya Raman', email: 'priya.raman@example.com' }),
    ]);
    expect(formatEsignProgressLine(progress)).toBe('1 of 3 done — waiting on Adi Nandyala and Priya Raman');
  });
});

describe('esignProgressActionLabel', () => {
  it('labels a review approval', () => {
    expect(esignProgressActionLabel('reviewed')).toBe('Reviewed (approved)');
  });

  it('labels a signature', () => {
    expect(esignProgressActionLabel('signed')).toBe('Signed');
  });

  it('falls back to Completed for anything else', () => {
    expect(esignProgressActionLabel('')).toBe('Completed');
    expect(esignProgressActionLabel(undefined)).toBe('Completed');
    expect(esignProgressActionLabel(null)).toBe('Completed');
    expect(esignProgressActionLabel('denied')).toBe('Completed');
    expect(esignProgressActionLabel('forwarded')).toBe('Completed');
  });
});
