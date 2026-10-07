// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import QuoteGenerator from '../../src/components/QuoteGenerator';
import { DocxTemplateProcessor } from '../../src/utils/docxTemplateProcessor';
import { calculateAllTiers } from '../../src/utils/pricing';
import type { ConfigurationData } from '../../src/types/pricing';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

vi.mock('../../src/utils/docxMerger', () => ({ mergeDocxFiles: vi.fn(async (main: Blob) => main) }));
vi.mock('../../src/utils/docxTemplateProcessor', () => ({
  DocxTemplateProcessor: {
    processDocxTemplate: vi.fn(async () => ({ success: true, processedDocx: new Blob(['agreement'], { type: DOCX }) })),
  },
}));
vi.mock('../../src/config/api', () => ({ BACKEND_URL: 'http://backend.test', API_ENDPOINTS: {} }));
vi.mock('../../src/hooks/useApprovalWorkflows', () => ({
  useApprovalWorkflows: () => ({ createWorkflow: vi.fn(), workflows: [] }),
}));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../src/components/OnlyOfficeEditor', () => ({ default: () => null }));
vi.mock('../../src/utils/pdfProcessor', () => ({ downloadAndSavePDF: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('mammoth', () => {
  const m = { convertToHtml: vi.fn(async () => ({ value: '<p></p>', messages: [] })), images: { imgElement: vi.fn(() => ({})) } };
  return { default: m, ...m };
});

const STANDALONE = {
  numberOfUsers: 1, instanceType: 'Standard', numberOfInstances: 1, duration: 1, dataSizeGB: 0,
  servicePlan: 'Manage', combination: 'manage-standalone', migrationType: '',
  manageAgreementLabel: 'Manage Standalone', manageUsers: 30, startDate: '2026-10-07',
} as unknown as ConfigurationData;

const template = { id: 'tpl-1', name: 'Agreement', file: new File(['template'], 'agreement.docx', { type: DOCX }) };

const processMock = () => DocxTemplateProcessor.processDocxTemplate as unknown as ReturnType<typeof vi.fn>;
const lastTemplateData = () => {
  const calls = processMock().mock.calls;
  return calls[calls.length - 1][1] as Record<string, string>;
};

function renderGenerator(configuration: ConfigurationData) {
  const calculation = calculateAllTiers(configuration)[0];
  render(
    <MemoryRouter>
      <QuoteGenerator
        calculation={calculation}
        configuration={configuration}
        onGenerateQuote={vi.fn()}
        selectedTemplate={template}
        selectedExhibits={[]}
      />
    </MemoryRouter>,
  );
}

const PATHS = [
  {
    name: 'generate',
    run: async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: /Generate Agreement/i }));
      await waitFor(() => expect(processMock()).toHaveBeenCalled(), { timeout: 10000 });
    },
  },
  {
    name: 'email',
    run: async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: /Send to Deal Desk/i }));
      await waitFor(() => expect(processMock()).toHaveBeenCalled(), { timeout: 10000 });
    },
  },
];

beforeEach(() => {
  // Only Date is faked: the effective date defaults to a month out and must precede the 2026-10-07 start.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 7, 1, 12));
  processMock().mockClear();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 404 })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(PATHS)('Manage Standalone agreement data carries the chosen Duration ($name path)', { timeout: 30000 }, ({ run }) => {
  it.each([
    [12, '10/06/2027', '12-Months'],
    [24, '10/06/2028', '24-Months'],
    [1, '11/06/2026', '1-Month'],
  ])('%i months -> ends %s, label %s, price stays $1,800.00', async (months, end, label) => {
    renderGenerator({ ...STANDALONE, serviceTermMonths: months } as ConfigurationData);
    await run();
    const data = lastTemplateData();
    expect(data['{{service_start_date}}']).toBe('10/07/2026');
    expect(data['{{service_end_date}}']).toBe(end);
    expect(data['{{service_term_label}}']).toBe(label);
    expect(data['{{users_count}}']).toBe('30');
    expect(data['{{users_cost}}']).toBe('$1,800.00');
    expect(data['{{total_price}}']).toBe('$1,800.00');
  });

  it('a quote saved before the Duration field existed prints 12 months', async () => {
    renderGenerator(STANDALONE);
    await run();
    expect(lastTemplateData()['{{service_end_date}}']).toBe('10/06/2027');
    expect(lastTemplateData()['{{service_term_label}}']).toBe('12-Months');
  });

  it('mange+sprawl keeps the 3-Month Free Trial even with a leftover serviceTermMonths', async () => {
    renderGenerator({ ...STANDALONE, migrationType: 'mange+sprawl', manageAgreementLabel: 'mange+sprawl', serviceTermMonths: 24 } as ConfigurationData);
    await run();
    expect(lastTemplateData()['{{service_end_date}}']).toBe('01/06/2027');
    expect(lastTemplateData()['{{service_term_label}}']).toBe('3-Month Free Trial');
  });
});
