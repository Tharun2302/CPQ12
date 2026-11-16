import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import approvalCombination from '../../approval-combination.cjs';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import stepGuard from '../../approval-step-guard.cjs';
import { approvalCombinationLabel } from '../../src/utils/approvalCombinationLabel';
import type { ConfigurationData } from '../../src/types/pricing';

const { parseCombinationInput, combinationRowHtml } = approvalCombination as {
  parseCombinationInput: (raw: unknown) => { ok: boolean; value?: string | null };
  combinationRowHtml: (data: unknown) => string;
};
const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

describe('parseCombinationInput', () => {
  it('accepts a trimmed string and treats missing or blank as none', () => {
    expect(parseCombinationInput(' Data Sprawl ')).toEqual({ ok: true, value: 'Data Sprawl' });
    expect(parseCombinationInput(undefined)).toEqual({ ok: true, value: null });
    expect(parseCombinationInput(null)).toEqual({ ok: true, value: null });
    expect(parseCombinationInput('  ')).toEqual({ ok: true, value: null });
  });

  it('rejects non-strings and over-long labels', () => {
    expect(parseCombinationInput(['a']).ok).toBe(false);
    expect(parseCombinationInput({ $ne: null }).ok).toBe(false);
    expect(parseCombinationInput(7).ok).toBe(false);
    expect(parseCombinationInput('x'.repeat(151)).ok).toBe(false);
    expect(parseCombinationInput('x'.repeat(150)).ok).toBe(true);
  });
});

describe('combinationRowHtml', () => {
  it('renders an escaped Combination line', () => {
    expect(combinationRowHtml({ combination: 'Multi-Combination + Data Sprawl' }))
      .toBe('<p><strong>Combination:</strong> Multi-Combination + Data Sprawl</p>');
    expect(combinationRowHtml({ combination: '<img src=x onerror=alert(1)>' }))
      .toBe('<p><strong>Combination:</strong> &lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('leaves the line out for older workflows or bad values', () => {
    expect(combinationRowHtml({})).toBe('');
    expect(combinationRowHtml({ combination: '  ' })).toBe('');
    expect(combinationRowHtml({ combination: ['x'] })).toBe('');
    expect(combinationRowHtml(null)).toBe('');
  });
});

describe('approval emails show the combination', () => {
  it.each([
    'generateTeamEmailHTML', 'generateTechnicalTeamEmailHTML', 'generateLegalTeamEmailHTML',
    'generateDealDeskEmailHTML', 'generateDenialEmailHTML',
  ])('%s includes the Combination row', (fn) => {
    const start = serverSrc.indexOf(`function ${fn}(`);
    expect(start).toBeGreaterThan(-1);
    const body = serverSrc.slice(start, serverSrc.indexOf('\n}\n', start));
    expect(body).toContain('${combinationRowHtml(workflowData)}');
  });

  it('the first team email uses the stored label, not the request body', () => {
    const start = serverSrc.indexOf('async function enrichWorkflowDataFromRecord');
    const body = serverSrc.slice(start, serverSrc.indexOf('\n}\n', start));
    expect(body).toContain('workflowData.combination = wf.combination;');
  });

  it('the combination cannot be changed after the workflow is created', () => {
    expect((stepGuard as any).LOCKED_WORKFLOW_FIELDS).toContain('combination');
    const { updates, stripped } = (stepGuard as any).stripLockedWorkflowFields({ combination: 'DIY', clientName: 'C' });
    expect(updates).toEqual({ clientName: 'C' });
    expect(stripped).toEqual(['combination']);
  });
});

describe('approvalCombinationLabel', () => {
  const cfg = (c: Partial<ConfigurationData>) => c as ConfigurationData;

  it('uses the agreement name when nothing from the Migrate list is ticked', () => {
    expect(approvalCombinationLabel(cfg({ migrationType: 'Content', combination: 'box-to-dropbox' }), 'BOX TO DROPBOX'))
      .toBe('BOX TO DROPBOX');
  });

  it('names Multi-Combination and Overage-Agreement by their Migrate labels', () => {
    expect(approvalCombinationLabel(cfg({ migrationType: 'Multi combination' }), 'Combination')).toBe('Multi-Combination');
    expect(approvalCombinationLabel(cfg({ migrationType: 'Overage Agreement', combination: 'overage-agreement' }), 'OVERAGE AGREEMENT'))
      .toBe('Overage-Agreement');
  });

  it('drops the generic placeholder name', () => {
    expect(approvalCombinationLabel(cfg({ migrationType: 'Content' }), 'Selected Template')).toBe('');
    expect(approvalCombinationLabel(null, '')).toBe('');
  });
});
