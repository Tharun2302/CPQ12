// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import QuoteGenerator from '../../src/components/QuoteGenerator';
import { PRICING_TIERS } from '../../src/utils/pricing';
import { ConfigurationData, PricingCalculation } from '../../src/types/pricing';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BACKEND = 'http://backend.test';

const mergeDocxFiles = vi.fn();
vi.mock('../../src/utils/docxMerger', () => ({ mergeDocxFiles: (...args: unknown[]) => mergeDocxFiles(...args) }));
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
// The preview step after generation is out of scope; the fake template is not a real DOCX
vi.mock('mammoth', () => {
  const m = { convertToHtml: vi.fn(async () => ({ value: '<p></p>', messages: [] })), images: { imgElement: vi.fn(() => ({})) } };
  return { default: m, ...m };
});

type Ex = { _id: string; name: string; combinations: string[]; includeType?: string; planType?: string; category?: string; displayOrder?: number };

let catalogue: Ex[] = [];
let brokenFiles = new Set<string>();

// Every request is answered locally; nothing reaches a real host
function stubBackend() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith(`${BACKEND}/api/exhibits?`) || url === `${BACKEND}/api/exhibits`) {
      return new Response(JSON.stringify({ success: true, exhibits: catalogue }), { status: 200 });
    }
    const file = url.match(/\/api\/exhibits\/([^/?]+)\/file/);
    if (file) {
      return brokenFiles.has(file[1])
        ? new Response('', { status: 500 })
        // Real DOCX files are ZIPs; the Manage merge rejects anything without this header
        : new Response(`${ZIP_HEADER}file-${file[1]}`, { status: 200, headers: { 'content-type': DOCX } });
    }
    if (url.includes('/api/email/send')) return new Response(JSON.stringify({ success: true }), { status: 200 });
    return new Response(JSON.stringify({ success: false }), { status: 404 });
  }));
}

const fetchedUrls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => String(u));

const calculation: PricingCalculation = {
  userCost: 0,
  dataCost: 0,
  migrationCost: 0,
  instanceCost: 0,
  totalCost: 1000,
  tier: PRICING_TIERS.find((t) => t.name === 'Basic')!,
};

// Project start must fall after the default effective date (one month out) for Generate to run
const baseConfig = {
  numberOfUsers: 10,
  instanceType: 'Standard',
  numberOfInstances: 1,
  duration: 1,
  dataSizeGB: 10,
  startDate: '2099-01-01',
};

const MANAGE = { ...baseConfig, servicePlan: 'Manage', combination: 'manage-standalone', migrationType: 'data-sprawl', manageUsers: 5 } as ConfigurationData;
const OVERAGE = { ...baseConfig, servicePlan: 'Migrate', combination: 'overage-agreement', migrationType: 'Overage Agreement' } as ConfigurationData;
const MULTI = { ...baseConfig, servicePlan: 'Migrate', combination: 'multi-combination', migrationType: 'Multi combination' } as ConfigurationData;

const template = {
  id: 'tpl-1',
  name: 'Agreement',
  file: new File(['template'], 'agreement.docx', { type: DOCX }),
};

function renderGenerator(configuration: ConfigurationData, selectedExhibits: string[]) {
  render(
    <MemoryRouter>
      <QuoteGenerator
        calculation={calculation}
        configuration={configuration}
        onGenerateQuote={vi.fn()}
        selectedTemplate={template}
        selectedExhibits={selectedExhibits}
      />
    </MemoryRouter>,
  );
}

// Generate Agreement is the live CTA; the email path is reached from Send to Deal Desk
const PATHS = [
  {
    name: 'generate',
    run: async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: /Generate Agreement/i }));
      await waitFor(() => expect(screen.queryByText('Generating...')).toBeNull(), { timeout: 10000 });
    },
  },
  {
    name: 'email',
    run: async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: /Send to Deal Desk/i }));
      await waitFor(() => expect(fetchedUrls().some((u) => u.includes('/api/email/send'))).toBe(true), { timeout: 10000 });
    },
  },
];

// Every real DOCX is a ZIP, so it starts with these four bytes
const ZIP_HEADER = 'PK\u0003\u0004';

const mergedFiles = async (call = 0) =>
  Promise.all((mergeDocxFiles.mock.calls[call][1] as Blob[]).map(async (b) => (await b.text()).slice(ZIP_HEADER.length)));

beforeEach(() => {
  mergeDocxFiles.mockReset().mockImplementation(async (main: Blob) => main);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionStorage.clear();
  localStorage.clear();
  catalogue = [];
  brokenFiles = new Set();
  stubBackend();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Rendering the full QuoteGenerator takes over 5 s when the whole suite runs in parallel
describe.each(PATHS)('QuoteGenerator exhibit merge by agreement type ($name path)', { timeout: 30000 }, ({ run }) => {
  it('Manage: merges exactly the ticked attached exhibits, in picker order', async () => {
    catalogue = [
      { _id: 'm2', name: 'Data Sprawl - Second', combinations: ['data-sprawl'], displayOrder: 2 },
      { _id: 'm1', name: 'Data Sprawl - First', combinations: ['Data-Sprawl'], displayOrder: 1 },
      { _id: 'm3', name: 'Data Sprawl - Unticked', combinations: ['data-sprawl'], displayOrder: 3 },
      { _id: 'p1', name: 'Box to Dropbox Basic Plan - Basic Include', combinations: ['box-to-dropbox'], includeType: 'included', planType: 'basic' },
    ];
    renderGenerator(MANAGE, ['m2', 'm1', 'p1']);

    await run();

    expect(mergeDocxFiles).toHaveBeenCalledTimes(1);
    expect(await mergedFiles()).toEqual(['file-m1', 'file-m2']);
    const [, , meta, options] = mergeDocxFiles.mock.calls[0];
    expect(meta).toBeUndefined();
    expect(options).toEqual({ keepAllContent: true });
    expect(fetchedUrls().some((u) => u.includes('/api/exhibits/m3/file'))).toBe(false);
  });

  it('Manage: shows an alert naming an exhibit whose file fails to load', async () => {
    catalogue = [
      { _id: 'm1', name: 'Data Sprawl - First', combinations: ['data-sprawl'], displayOrder: 1 },
      { _id: 'broken', name: 'Data Sprawl - Broken', combinations: ['data-sprawl'], displayOrder: 2 },
    ];
    brokenFiles = new Set(['broken']);
    renderGenerator(MANAGE, ['m1', 'broken']);

    await run();

    expect(await mergedFiles()).toEqual(['file-m1']);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Data Sprawl - Broken'));
  });

  it('Multi combination: ticked pair still expands to Include + Not Include with grouped metadata', async () => {
    catalogue = [
      { _id: 'in', name: 'Box to Dropbox Basic Plan - Basic Include', combinations: ['box-to-dropbox'], includeType: 'included', planType: 'basic', category: 'content' },
      { _id: 'out', name: 'Box to Dropbox Basic Plan - Basic Not Include', combinations: ['box-to-dropbox'], includeType: 'notincluded', planType: 'basic', category: 'content' },
      { _id: 'm1', name: 'Data Sprawl - First', combinations: ['data-sprawl'] },
    ];
    renderGenerator(MULTI, ['in']);

    await run();

    expect(mergeDocxFiles).toHaveBeenCalledTimes(1);
    expect(await mergedFiles()).toEqual(['file-in', 'file-out']);
    const [, , meta, options] = mergeDocxFiles.mock.calls[0];
    expect(meta).toEqual([
      { name: 'Box to Dropbox Basic Plan - Basic Include', category: 'content', includeType: 'included' },
      { name: 'Box to Dropbox Basic Plan - Basic Not Include', category: 'content', includeType: 'notincluded' },
    ]);
    expect(options).toBeUndefined();
  });

  it('Overage: merges no exhibits even with a stale selection', async () => {
    catalogue = [
      { _id: 'in', name: 'Box to Dropbox Basic Plan - Basic Include', combinations: ['box-to-dropbox'], includeType: 'included', planType: 'basic' },
      { _id: 'm1', name: 'Data Sprawl - First', combinations: ['data-sprawl'] },
    ];
    renderGenerator(OVERAGE, ['in', 'm1']);

    await run();

    expect(mergeDocxFiles).not.toHaveBeenCalled();
  });
});
