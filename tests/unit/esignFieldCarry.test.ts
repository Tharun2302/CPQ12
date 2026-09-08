import { describe, it, expect } from 'vitest';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import fieldCarry from '../../esign-field-carry.cjs';

type Field = { _id?: unknown; type?: string; recipient_id?: string | null; prefill?: string | null };

const { pickEsignCarriedFields } = fieldCarry as {
  pickEsignCarriedFields: (
    allFields: unknown,
    visibleFields: unknown,
    effectiveValueFor: (f: Field) => string | undefined
  ) => Array<{ field: Field; value: string }>;
};

const reviewerText: Field = { _id: 'f1', type: 'text', recipient_id: 'reviewer1' };
const signerSignature: Field = { _id: 'f2', type: 'signature', recipient_id: 'signer1' };
const signerName: Field = { _id: 'f3', type: 'name', recipient_id: 'signer1' };
const reviewerDate: Field = { _id: 'f4', type: 'date', recipient_id: 'reviewer1' };

/** Stands in for esignEffectivePrefillForField: reviewer entry first, else creator prefill. */
const valuesByField = (map: Record<string, string | undefined>) => (f: Field) => map[String(f._id)];

describe('pickEsignCarriedFields', () => {
  it("carries a reviewer's filled field that the signer cannot see", () => {
    const carried = pickEsignCarriedFields(
      [reviewerText, signerSignature, signerName],
      [signerSignature, signerName],
      valuesByField({ f1: 'anush' })
    );
    expect(carried).toHaveLength(1);
    expect(carried[0].field._id).toBe('f1');
    expect(carried[0].value).toBe('anush');
  });

  it('never carries a field the signer can already see, so nothing is drawn twice', () => {
    const carried = pickEsignCarriedFields(
      [signerName],
      [signerName],
      valuesByField({ f3: 'Joanna Wald' })
    );
    expect(carried).toEqual([]);
  });

  it('never carries a signature — one recipient must not stamp another signature', () => {
    const otherSignature = { _id: 'f9', type: 'signature', recipient_id: 'signer2' };
    const carried = pickEsignCarriedFields(
      [otherSignature],
      [],
      valuesByField({ f9: 'data:image/png;base64,AAA' })
    );
    expect(carried).toEqual([]);
  });

  it('skips hidden fields nobody filled', () => {
    expect(pickEsignCarriedFields([reviewerText, reviewerDate], [], valuesByField({}))).toEqual([]);
  });

  it('treats blank and whitespace-only values as unfilled', () => {
    const carried = pickEsignCarriedFields(
      [reviewerText, reviewerDate],
      [],
      valuesByField({ f1: '', f4: '   ' })
    );
    expect(carried).toEqual([]);
  });

  it('carries several hidden fields in document order', () => {
    const carried = pickEsignCarriedFields(
      [reviewerText, signerName, reviewerDate],
      [signerName],
      valuesByField({ f1: 'anush', f4: '2026-09-09' })
    );
    expect(carried.map((c) => c.field._id)).toEqual(['f1', 'f4']);
  });

  it('stringifies non-string values so the PDF merge always gets text', () => {
    const carried = pickEsignCarriedFields(
      [{ _id: 'f5', type: 'text' }],
      [],
      (() => 42 as unknown as string) as (f: Field) => string
    );
    expect(carried[0].value).toBe('42');
  });

  it('defaults a missing type to signature and refuses to carry it', () => {
    expect(pickEsignCarriedFields([{ _id: 'f6' }], [], valuesByField({ f6: 'x' }))).toEqual([]);
  });

  it('survives malformed input', () => {
    expect(pickEsignCarriedFields(null, null, valuesByField({}))).toEqual([]);
    expect(pickEsignCarriedFields([null, undefined], [], valuesByField({}))).toEqual([]);
    expect(pickEsignCarriedFields([{ type: 'text' }], [], () => 'no id so skipped')).toEqual([]);
    expect(pickEsignCarriedFields([reviewerText], [{ type: 'text' }], valuesByField({ f1: 'anush' }))).toHaveLength(1);
  });

  it('matches visible ids across string and ObjectId-like shapes', () => {
    const objectIdLike = { toString: () => 'f1' };
    const carried = pickEsignCarriedFields(
      [{ _id: objectIdLike, type: 'text' }],
      [{ _id: 'f1', type: 'text' }],
      () => 'anush'
    );
    expect(carried).toEqual([]);
  });
});
