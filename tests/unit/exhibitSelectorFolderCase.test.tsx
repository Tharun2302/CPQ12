// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import ExhibitSelector from '../../src/components/ExhibitSelector';

// A pair's folder label is derived from its combination key ("Onedrive To Onedrive") for some
// exhibits and from the exhibit name ("Onedrive to Onedrive") for others, so the selector
// showed one pair as two folders while Exhibit Manager showed one.

const exhibit = (over: Record<string, unknown>) => ({
  _id: 'e1', name: 'Onedrive to Onedrive Standard Plan - Standard Include', description: '',
  fileName: 'o.docx', fileSize: 1024, category: 'content', combinations: ['onedrive-to-onedrive'],
  planType: 'standard', includeType: 'included', displayOrder: 1, keywords: [], isRequired: false,
  createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z', ...over,
});

const CATALOGUE = [
  exhibit({}),
  exhibit({ _id: 'e2', name: 'Onedrive to Onedrive Standard Plan - Standard Not Include', includeType: 'notincluded' }),
  exhibit({ _id: 'e3', name: 'Onedrive to Onedrive Basic Plan - Basic Include', planType: 'basic', combinations: ['multi-combination'] }),
  exhibit({ _id: 'e4', name: 'Onedrive to Onedrive Basic Plan - Basic Not Include', planType: 'basic', includeType: 'notincluded', combinations: ['multi-combination'] }),
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ExhibitSelector folder grouping', () => {
  it('puts folder labels that differ only by case into one folder', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/combinations')) return json({ success: true, combinations: [] });
      if (url.includes('/api/exhibits')) return json({ success: true, exhibits: CATALOGUE });
      return json({ success: true });
    }));
    render(<ExhibitSelector combination="multi-combination" selectedExhibits={[]} onExhibitsChange={() => {}} />);

    await waitFor(() => expect(screen.getAllByText(/^Onedrive to Onedrive$/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/^Onedrive to Onedrive$/i)).toHaveLength(1);
  });
});
