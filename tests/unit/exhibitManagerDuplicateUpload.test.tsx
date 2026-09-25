// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'exhibit_admin' } }),
}));

import ExhibitManager from '../../src/components/ExhibitManager';

// The server answers a likely duplicate with a 409 the admin can override. These drive the real
// upload modal to prove the override is only ever sent after the admin says yes.

const COMBINATIONS = [
  { value: 'multi-combination', label: 'Multi-Combination', migrationType: 'Multi combination' },
];

const EXISTING = [{
  _id: 'e1', name: 'Egnyte to SharePoint Online Standard Plan - Standard Include', description: '',
  fileName: 'egnyte-sp.docx', fileSize: 2048, category: 'content', combinations: ['multi-combination'],
  planType: 'standard', includeType: 'included', displayOrder: 1, keywords: [], isRequired: false,
  createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z',
}];

const DUPLICATE_BODY = {
  success: false,
  code: 'POSSIBLE_DUPLICATE_EXHIBIT',
  error: 'This looks like a duplicate of "Egnyte to SharePoint Online Standard Plan - Standard Include".',
  duplicates: [{
    id: 'e1', name: EXISTING[0].name, fileName: 'egnyte-sp.docx', combinations: ['multi-combination'],
    planType: 'standard', includeType: 'included', reasons: ['same_combination_plan_include'],
  }],
};

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

function mockFetch() {
  // The component appends the override to the same FormData, so record it as each request goes out.
  const posts: Array<string | null> = [];
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/settings/exhibit-admins')) return reply(200, { success: true, emails: [] });
    if (url.includes('/api/combinations')) return reply(200, { success: true, combinations: COMBINATIONS });
    if (url.includes('/api/exhibits') && init?.method === 'POST') {
      const body = init.body as FormData;
      posts.push(body.get('allowDuplicate') as string | null);
      return body.get('allowDuplicate') === 'true'
        ? reply(200, { success: true, exhibit: { _id: 'new' } })
        : reply(409, DUPLICATE_BODY);
    }
    if (url.includes('/api/exhibits')) return reply(200, { success: true, exhibits: EXISTING });
    return reply(200, { success: true });
  }));
  return posts;
}

function selectOffering(container: HTMLElement, ...optionValues: string[]): HTMLSelectElement {
  const match = Array.from(container.querySelectorAll('select')).find((el) => {
    const values = Array.from(el.options).map((o) => o.value);
    return optionValues.every((v) => values.includes(v));
  });
  if (!match) throw new Error(`No <select> offering ${optionValues.join(', ')}`);
  return match as HTMLSelectElement;
}

async function uploadDuplicate() {
  const posts = mockFetch();
  const user = userEvent.setup();
  const { container } = render(<ExhibitManager />);
  await waitFor(() => expect(screen.getByRole('button', { name: /Upload Exhibit/ })).toBeTruthy());
  await user.click(screen.getAllByRole('button', { name: /Upload Exhibit/ })[0]);
  await user.selectOptions(await screen.findByLabelText<HTMLSelectElement>('Agreement template'), 'multi-combination');
  await user.upload(
    container.querySelector('input[type="file"]') as HTMLInputElement,
    new File(['x'], 'Egnyte to Microsoft std- Include.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  );
  await user.selectOptions(selectOffering(container, 'basic', 'standard', 'advanced'), 'standard');
  await user.selectOptions(selectOffering(container, 'included', 'notincluded'), 'included');
  await user.click(screen.getAllByRole('button', { name: /^Upload Exhibit$/ }).pop()!);
  return posts;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Uploading a likely duplicate exhibit', () => {
  it('asks first, then re-sends with the override once the admin confirms', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const posts = await uploadDuplicate();

    await waitFor(() => expect(posts).toHaveLength(2));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('Egnyte to SharePoint Online Standard Plan - Standard Include');
    expect(posts).toEqual([null, 'true']);
    expect(await screen.findByText('Exhibit uploaded successfully!')).toBeTruthy();
  });

  it('uploads nothing and shows the warning when the admin cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const posts = await uploadDuplicate();

    expect(await screen.findByText(/This looks like a duplicate of/)).toBeTruthy();
    expect(posts).toEqual([null]);
  });
});
