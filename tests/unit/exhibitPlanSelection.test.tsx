// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

import ExhibitSelector from '../../src/components/ExhibitSelector';

// Regression: Basic exhibits attached to the Multi-Combination agreement were stored as
// combinations ['multi-combination'] instead of their pair. The tier rule groups by pair, saw
// the pair as having no Basic exhibits, and fell back to Standard, so a Basic SOW carried both.

const exhibit = (over: Record<string, unknown>) => ({
  description: '', fileName: 'x.docx', fileSize: 1024, category: 'content', displayOrder: 1,
  keywords: [], isRequired: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const ONEDRIVE = [
  exhibit({ _id: 'od-std-in', name: 'Onedrive to Onedrive Standard Plan - Standard Include', combinations: ['onedrive-to-onedrive'], planType: 'standard', includeType: 'included' }),
  exhibit({ _id: 'od-std-out', name: 'Onedrive to Onedrive Standard Plan - Standard Not Include', combinations: ['onedrive-to-onedrive'], planType: 'standard', includeType: 'notincluded' }),
  exhibit({ _id: 'od-basic-in', name: 'Onedrive to Onedrive Basic Plan - Basic Include', combinations: ['multi-combination'], planType: 'basic', includeType: 'included' }),
  exhibit({ _id: 'od-basic-out', name: 'Onedrive to Onedrive Basic Plan - Basic Not Include', combinations: ['multi-combination'], planType: 'basic', includeType: 'notincluded' }),
];

const MS_PAIR = 'microsoft-onedrive-sharepointonline-to-microsoft-onedrive-sharepointonline';
const MS_NAME = 'Microsoft OneDrive/SharepointOnline to Microsoft OneDrive/SharePointOnline';
const MICROSOFT = [
  exhibit({ _id: 'ms-std-in', name: `${MS_NAME} Standard Plan - Standard Include`, combinations: [MS_PAIR], planType: 'standard', includeType: 'included' }),
  exhibit({ _id: 'ms-std-out', name: `${MS_NAME} Standard Plan - Standard Not Include`, combinations: [MS_PAIR], planType: 'standard', includeType: 'notincluded' }),
  exhibit({ _id: 'ms-basic-in', name: `${MS_NAME} Basic Plan - Basic Include`, combinations: ['multi-combination'], planType: 'basic', includeType: 'included' }),
  exhibit({ _id: 'ms-basic-out', name: `${MS_NAME} Basic Plan - Basic Not Include`, combinations: ['multi-combination'], planType: 'basic', includeType: 'notincluded' }),
];

// Correctly tagged pair with only a Standard tier: the existing Basic -> Standard fallback must keep working.
const STANDARD_ONLY = [
  exhibit({ _id: 'bd-std-in', name: 'Box To Dropbox Standard Plan - Standard Include', combinations: ['box-to-dropbox'], planType: 'standard', includeType: 'included' }),
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function autoSelected(tier: string, catalogue: unknown[]): Promise<string[]> {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/combinations')) return json({ success: true, combinations: [] });
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: catalogue });
    return json({ success: true });
  }));
  const onExhibitsChange = vi.fn();
  render(
    <ExhibitSelector
      combination="multi-combination"
      selectedExhibits={[]}
      selectedTier={{ tier: { name: tier } }}
      onExhibitsChange={onExhibitsChange}
    />,
  );
  await waitFor(() => expect(onExhibitsChange).toHaveBeenCalled());
  const calls = onExhibitsChange.mock.calls;
  return [...(calls[calls.length - 1][0] as string[])].sort();
}

describe('Plan-specific exhibit selection', () => {
  it('Basic selects only Basic exhibits, even when the Basic ones are tagged multi-combination', async () => {
    expect(await autoSelected('Basic', [...ONEDRIVE, ...MICROSOFT])).toEqual(
      ['ms-basic-in', 'ms-basic-out', 'od-basic-in', 'od-basic-out'],
    );
  });

  it('Standard selects only Standard exhibits', async () => {
    expect(await autoSelected('Standard', [...ONEDRIVE, ...MICROSOFT])).toEqual(
      ['ms-std-in', 'ms-std-out', 'od-std-in', 'od-std-out'],
    );
  });

  it('keeps Basic Include and Basic Not Include as separate selections', async () => {
    const ids = await autoSelected('Basic', ONEDRIVE);
    expect(ids).toContain('od-basic-in');
    expect(ids).toContain('od-basic-out');
    expect(ids).toHaveLength(2);
  });

  it('still falls back to Standard for a pair that has no Basic exhibit at all', async () => {
    expect(await autoSelected('Basic', [...ONEDRIVE, ...STANDARD_ONLY])).toEqual(
      ['bd-std-in', 'od-basic-in', 'od-basic-out'],
    );
  });
});
