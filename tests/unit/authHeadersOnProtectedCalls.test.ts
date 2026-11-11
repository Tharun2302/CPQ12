import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

// Slice from the fetch opening to its headers/body so a neighbouring call cannot satisfy the check
function callWindow(src: string, opening: RegExp): string {
  const start = src.search(opening);
  expect(start, `fetch call not found: ${opening}`).toBeGreaterThan(-1);
  const rest = src.slice(start);
  const ends = [rest.indexOf('body:'), rest.indexOf('});')].filter((i) => i > 0);
  return rest.slice(0, Math.min(...ends));
}

interface Site {
  label: string;
  file: string;
  opening: RegExp;
  formData?: boolean;
}

const SITES: Site[] = [
  { label: 'POST /api/quotes', file: 'src/App.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/quotes`,\s*\{\s*method: 'POST'/ },
  { label: 'DELETE /api/quotes/:id', file: 'src/App.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/quotes\/\$\{quoteId\}`,\s*\{\s*method: 'DELETE'/ },
  { label: 'PUT /api/quotes/:id', file: 'src/App.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/quotes\/\$\{quoteId\}`,\s*\{\s*method: 'PUT'/ },
  { label: 'POST /api/documents (save)', file: 'src/services/documentServiceMongoDB.ts', opening: /fetch\(this\.apiUrl,\s*\{\s*method: 'POST'/ },
  { label: 'DELETE /api/documents/:id', file: 'src/services/documentServiceMongoDB.ts', opening: /fetch\(`\$\{this\.apiUrl\}\/\$\{id\}`,\s*\{\s*method: 'DELETE'/ },
  { label: 'POST /api/documents (manual approval)', file: 'src/components/ApprovalWorkflow.tsx', opening: /fetch\(`\$\{backendUrl\}\/api\/documents`/ },
  { label: 'PUT /api/team-approval-settings (ApprovalWorkflow)', file: 'src/components/ApprovalWorkflow.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/team-approval-settings`,\s*\{/ },
  { label: 'PUT /api/team-approval-settings (QuoteGenerator)', file: 'src/components/QuoteGenerator.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/team-approval-settings`,\s*\{/ },
  { label: 'POST /api/email/send (deal desk, JSON)', file: 'src/components/QuoteGenerator.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/email\/send`,\s*\{\s*method: 'POST',\s*headers: \{ 'Content-Type'/ },
  { label: 'POST /api/email/send (agreement, FormData)', file: 'src/components/QuoteGenerator.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/email\/send`,\s*\{\s*method: 'POST',\s*headers: getAuthHeaders\(\)/, formData: true },
  { label: 'POST /api/email/send (QuoteManager)', file: 'src/components/QuoteManager.tsx', opening: /fetch\(`\$\{backendUrl\}\/api\/email\/send`/, formData: true },
  { label: 'POST /api/email/send (TemplateManager)', file: 'src/components/TemplateManager.tsx', opening: /fetch\(`\$\{backendUrl\}\/api\/email\/send`/, formData: true },
  { label: 'POST /api/email/send (ContactUsModal)', file: 'src/components/ContactUsModal.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/email\/send`/, formData: true },
  { label: 'POST /api/convert/docx-to-pdf', file: 'src/utils/templateService.ts', opening: /return fetch\(url,\s*\{\s*method: 'POST'/, formData: true },
  { label: 'POST /api/templates (upload)', file: 'src/utils/templateService.ts', opening: /fetch\(`\$\{this\.baseUrl\}\/templates`,\s*\{\s*method: 'POST'/, formData: true },
  { label: 'DELETE /api/templates/:id', file: 'src/utils/templateService.ts', opening: /fetch\(`\$\{this\.baseUrl\}\/templates\/\$\{templateId\}`,\s*\{\s*method: 'DELETE'/ },
  { label: 'PUT /api/templates/:id', file: 'src/utils/templateService.ts', opening: /fetch\(`\$\{this\.baseUrl\}\/templates\/\$\{templateId\}`,\s*\{\s*method: 'PUT'/ },
  { label: 'PUT /api/combinations/:id', file: 'src/components/CombinationManager.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/combinations\/\$\{editingCombo\.id\}`,\s*\{/ },
  { label: 'POST /api/combinations/:id/file', file: 'src/components/CombinationManager.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/combinations\/\$\{editingCombo\.id\}\/file`,\s*\{/, formData: true },
  { label: 'POST /api/combinations (FormData)', file: 'src/components/CombinationManager.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/combinations`,\s*\{\s*method: 'POST',\s*headers: getAuthHeaders\(\),\s*body: fd/, formData: true },
  { label: 'POST /api/combinations (JSON)', file: 'src/components/CombinationManager.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/combinations`,\s*\{\s*method: 'POST',\s*headers: \{ 'Content-Type'/ },
  { label: 'GET /api/chat/analytics', file: 'src/components/Analytics.tsx', opening: /fetch\(`\$\{API_URL\}\/chat\/analytics/ },
  { label: 'GET /api/chat/logs', file: 'src/components/Analytics.tsx', opening: /fetch\(`\$\{API_URL\}\/chat\/logs/ },
  { label: 'POST /api/documents/upload', file: 'src/components/MigrationMonitoringDashboard.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/documents\/upload`/, formData: true },
  { label: 'DELETE /api/documents/:id (migration)', file: 'src/components/MigrationMonitoringDashboard.tsx', opening: /fetch\(`\$\{BACKEND_URL\}\/api\/documents\/\$\{mongoId\}`,\s*\{\s*method: 'DELETE'/ },
];

describe('login-only backend calls send the saved login', () => {
  for (const site of SITES) {
    it(`${site.label} (${site.file})`, () => {
      const src = read(site.file);
      expect(src).toMatch(/getAuthHeaders/);
      const win = callWindow(src, site.opening);
      expect(win).toMatch(/getAuthHeaders\(\)/);
      if (site.formData) expect(win).not.toMatch(/Content-Type/);
    });
  }
});

describe('calls that can run before login stay untouched', () => {
  it('App-level GET /api/quotes does not send headers (runs on public pages)', () => {
    expect(read('src/App.tsx')).toContain('await fetch(`${BACKEND_URL}/api/quotes`);');
  });
});
