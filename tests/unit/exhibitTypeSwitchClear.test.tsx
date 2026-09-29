// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationForm from '../../src/components/ConfigurationForm';
import type { ConfigurationData } from '../../src/types/pricing';

// The real catalogue shape: Migrate has Combination + Overage, Manage has two templates.
const COMBINATIONS = [
  { value: 'multi-combination', label: 'Multi-Combination', migrationType: 'Multi combination' },
  { value: 'overage-agreement', label: 'Overage-Agreement', migrationType: 'Overage Agreement' },
  { value: 'mange+sprawl', label: 'mange+sprawl', migrationType: 'Manage' },
  { value: 'data-sprawl', label: 'Data-Sprawl', migrationType: 'Manage' },
];

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/combinations')) return json({ success: true, combinations: COMBINATIONS });
    if (url.includes('/api/exhibits')) return json({ success: true, exhibits: [] });
    return json({ success: true });
  }));
}

function renderForm() {
  mockFetch();
  const onExhibitsChange = vi.fn();
  const onConfigurationChange = vi.fn();
  const utils = render(
    <ConfigurationForm
      onConfigurationChange={onConfigurationChange}
      onSubmit={vi.fn()}
      selectedExhibits={['exhibit-dbg-std-inc', 'exhibit-dsprawl-std']}
      onExhibitsChange={onExhibitsChange}
    />,
  );
  return { ...utils, onExhibitsChange, onConfigurationChange, user: userEvent.setup() };
}

function selectWithOption(container: HTMLElement, value: string): HTMLSelectElement {
  const match = Array.from(container.querySelectorAll('select')).find((el) =>
    Array.from(el.options).some((o) => o.value === value),
  );
  if (!match) throw new Error(`No <select> offers ${value}`);
  return match as HTMLSelectElement;
}

function lastEmittedConfig(spy: ReturnType<typeof vi.fn>): ConfigurationData {
  return spy.mock.calls[spy.mock.calls.length - 1][0] as ConfigurationData;
}

function expectRowsCleared(config: ConfigurationData) {
  expect(config.messagingConfigs).toEqual([]);
  expect(config.contentConfigs).toEqual([]);
  expect(config.emailConfigs).toEqual([]);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Configure: switching type or combination drops the previous exhibits', () => {
  it('does not touch the ticked exhibits just by opening the page', async () => {
    const { onExhibitsChange } = renderForm();
    await screen.findByRole('button', { name: 'Manage' });
    expect(onExhibitsChange).not.toHaveBeenCalled();
  });

  it('clears exhibits and their per-pair rows when a plan tab is clicked', async () => {
    const { onExhibitsChange, onConfigurationChange, user } = renderForm();

    await user.click(await screen.findByRole('button', { name: 'Manage' }));

    expect(onExhibitsChange).toHaveBeenCalledWith([]);
    expectRowsCleared(lastEmittedConfig(onConfigurationChange));
  });

  it('clears them when Migrate switches from Combination to Overage', async () => {
    const { container, onExhibitsChange, onConfigurationChange, user } = renderForm();
    await waitFor(() => selectWithOption(container, 'overage-agreement'));

    await user.selectOptions(selectWithOption(container, 'overage-agreement'), 'multi-combination');
    onExhibitsChange.mockClear();
    await user.selectOptions(selectWithOption(container, 'overage-agreement'), 'overage-agreement');

    expect(onExhibitsChange).toHaveBeenCalledWith([]);
    const config = lastEmittedConfig(onConfigurationChange);
    expect(config.combination).toBe('overage-agreement');
    expectRowsCleared(config);
  });

  it('clears them when Manage switches between Data-Sprawl and mange+sprawl', async () => {
    const { container, onExhibitsChange, onConfigurationChange, user } = renderForm();
    await user.click(await screen.findByRole('button', { name: 'Manage' }));
    await waitFor(() => selectWithOption(container, 'data-sprawl'));

    await user.selectOptions(selectWithOption(container, 'data-sprawl'), 'data-sprawl');
    onExhibitsChange.mockClear();
    await user.selectOptions(selectWithOption(container, 'data-sprawl'), 'mange+sprawl');

    expect(onExhibitsChange).toHaveBeenCalledWith([]);
    const config = lastEmittedConfig(onConfigurationChange);
    expect(config.migrationType).toBe('mange+sprawl');
    expectRowsCleared(config);
  });
});
