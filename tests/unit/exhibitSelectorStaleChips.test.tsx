// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

import ExhibitSelector from '../../src/components/ExhibitSelector';

// Regression coverage for: picking "Google Chat to Teams" showed a stale "Teams to Slack" chip
// alongside it after navigating away and back. The chip list must be scoped to the active
// combination — except in Multi combination, which intentionally bundles several pairs at once.

const exhibit = (over: Record<string, unknown>) => ({
  _id: 'e1', name: 'Google Chat to Teams - Standard Include', description: '', fileName: 'gc.docx',
  fileSize: 1024, category: 'messaging', combinations: ['google-chat-to-teams'], planType: 'standard',
  includeType: 'included', displayOrder: 1, keywords: [], isRequired: false,
  createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z', ...over,
});

const CATALOGUE = [
  exhibit({}),
  exhibit({ _id: 'e2', name: 'Teams to Slack - Standard Include', combinations: ['teams-to-slack'] }),
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function mockFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/combinations')) return json({ success: true, combinations: [] });
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: CATALOGUE });
    return json({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderChips(props: { combination: string; selectedExhibits: string[] }) {
  mockFetch();
  render(
    <ExhibitSelector
      combination={props.combination}
      selectedExhibits={props.selectedExhibits}
      onExhibitsChange={() => {}}
    />
  );
  const heading = await screen.findByText(/Selected combinations/i);
  return within(heading.parentElement as HTMLElement);
}

describe('ExhibitSelector selected-combination chips', () => {
  it('hides a chip for a stale exhibit from a different single pair', async () => {
    // Both a leaked "teams-to-slack" id and the real "google-chat-to-teams" id are selected,
    // simulating a stale-storage leak; only the active pair's chip should render.
    const chips = await renderChips({ combination: 'google-chat-to-teams', selectedExhibits: ['e1', 'e2'] });

    expect(chips.getByText(/Google Chat to Teams/)).toBeTruthy();
    expect(chips.queryByText(/Teams to Slack/)).toBeNull();
  });

  it('shows only the active pair even when it is the only selection', async () => {
    const chips = await renderChips({ combination: 'teams-to-slack', selectedExhibits: ['e1', 'e2'] });

    expect(chips.getByText(/Teams to Slack/)).toBeTruthy();
    expect(chips.queryByText(/Google Chat to Teams/)).toBeNull();
  });

  it('shows chips from multiple pairs in Multi combination, by design', async () => {
    const chips = await renderChips({ combination: 'multi-combination', selectedExhibits: ['e1', 'e2'] });

    expect(chips.getByText(/Google Chat to Teams/)).toBeTruthy();
    expect(chips.getByText(/Teams to Slack/)).toBeTruthy();
  });
});
