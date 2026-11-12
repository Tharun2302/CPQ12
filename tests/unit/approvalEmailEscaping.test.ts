import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The approval email builders live inside server.cjs, which cannot be imported without starting
// the server, so the real functions are lifted out of the source and run here. What matters is
// their output: text from a request or a stored workflow must arrive as text, never as markup.

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = serverSrc.indexOf(startMarker);
  const end = serverSrc.indexOf(endMarker, start);
  expect(start, `not found: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `not found: ${endMarker}`).toBeGreaterThan(start);
  return serverSrc.slice(start, end);
}

const BUILDER_NAMES = [
  'generateTeamEmailHTML',
  'generateTechnicalTeamEmailHTML',
  'generateLegalTeamEmailHTML',
  'generateClientEmailHTML',
  'generateDealDeskEmailHTML',
  'generateDenialEmailHTML',
] as const;

type Builders = Record<(typeof BUILDER_NAMES)[number], (...args: unknown[]) => string> & {
  sanitizeEmailSubject: (subject: unknown) => string;
};

function loadBuilders(): Builders {
  const source = [
    sourceBetween('function formatUsdAmount(', '// Approval portal access tokens'),
    sourceBetween('function cloudFuzeEmailFooterHTML(', '// Email sending function using SendGrid'),
    sourceBetween('function escapeHtml(', 'function escapeEmailMessage('),
    sourceBetween('function sanitizeEmailSubject(', 'async function loadDocumentPdfAttachment('),
    `return { ${[...BUILDER_NAMES, 'sanitizeEmailSubject'].join(', ')} };`,
  ].join('\n');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('process', source)({ env: { BASE_URL: 'https://cpq.example.test' } }) as Builders;
}

const builders = loadBuilders();

const MARKUP = '<a href="http://evil.test">Click</a>';
const ESCAPED = '&lt;a href=&quot;http://evil.test&quot;&gt;Click&lt;/a&gt;';

const hostile = {
  workflowId: `WF-1"><img src=x>`,
  documentId: `DOC ${MARKUP}`,
  clientName: `Client ${MARKUP}`,
  requestedByName: `Rep ${MARKUP}`,
  creatorEmail: `rep@x.test${MARKUP}`,
  teamGroup: `smb ${MARKUP}`,
  amount: 1200,
};

function expectNoInjectedMarkup(html: string): void {
  expect(html).not.toContain('<a href="http://evil.test"');
  expect(html).not.toContain('<img src=x>');
}

describe('approval email builders escape request and workflow text', () => {
  it.each(['generateTeamEmailHTML', 'generateTechnicalTeamEmailHTML', 'generateLegalTeamEmailHTML'] as const)(
    '%s shows hostile values as text and keeps the portal link intact',
    (name) => {
      const html = builders[name](hostile, 'tok');
      expectNoInjectedMarkup(html);
      expect(html).toContain(`<strong>Client:</strong> Client ${ESCAPED}`);
      expect(html).toContain(`<strong>Document ID:</strong> DOC ${ESCAPED}`);
      expect(html).toContain(`<strong>Requested by:</strong> Rep ${ESCAPED}`);
      expect(html).toContain('<strong>Workflow ID:</strong> WF-1&quot;&gt;&lt;img src=x&gt;');
      expect(html).toContain(`href="https://cpq.example.test/approval/${encodeURIComponent(hostile.workflowId)}?role=`);
      expect(html).toContain('&token=tok"');
    }
  );

  it('generateTeamEmailHTML escapes the team group everywhere it is shown', () => {
    const html = builders.generateTeamEmailHTML(hostile, 'tok');
    expect(html).not.toContain('<A HREF=');
    expect(html.match(/&lt;A HREF=&quot;HTTP:\/\/EVIL\.TEST&quot;&gt;CLICK&lt;\/A&gt;/g)?.length).toBe(3);
  });

  it('falls back to the creator email, escaped, when no requester name is given', () => {
    const html = builders.generateTechnicalTeamEmailHTML({ ...hostile, requestedByName: '' }, 'tok');
    expect(html).toContain(`<strong>Requested by:</strong> rep@x.test${ESCAPED}`);
  });

  it('generateClientEmailHTML escapes the greeting and document id', () => {
    const html = builders.generateClientEmailHTML(hostile, 'role=client&token=tok');
    expectNoInjectedMarkup(html);
    expect(html).toContain(`<h2>Hello Client ${ESCAPED},</h2>`);
    expect(html).toContain(`<strong>Document ID:</strong> DOC ${ESCAPED}`);
    expect(html).toContain(`/client-notification?workflow=${encodeURIComponent(hostile.workflowId)}&role=client&token=tok"`);
  });

  it('generateDealDeskEmailHTML escapes the client and document id', () => {
    const html = builders.generateDealDeskEmailHTML(hostile, 'role=client&token=tok');
    expectNoInjectedMarkup(html);
    expect(html).toContain(`<strong>Client:</strong> Client ${ESCAPED}`);
    expect(html).toContain(`<strong>Document ID:</strong> DOC ${ESCAPED}`);
    expect(html).toContain(`/api/approval-workflows/${encodeURIComponent(hostile.workflowId)}/document?role=client&token=tok"`);
  });

  it('generateDenialEmailHTML escapes the approver comment, the denier and the workflow details', () => {
    const html = builders.generateDenialEmailHTML({
      workflowData: hostile,
      deniedBy: `Legal ${MARKUP}`,
      comments: `Too high ${MARKUP}<script>alert(1)</script>`,
    });
    expectNoInjectedMarkup(html);
    expect(html).not.toContain('<script>');
    expect(html).toContain(`<strong>Reason:</strong> Too high ${ESCAPED}&lt;script&gt;alert(1)&lt;/script&gt;`);
    expect(html).toContain(`by <strong>Legal ${ESCAPED}</strong>`);
    expect(html).toContain(`<title>Approval Denied - Legal ${ESCAPED}</title>`);
    expect(html).toContain(`<strong>Client:</strong> Client ${ESCAPED}`);
  });

  it('still renders ordinary values unchanged', () => {
    const html = builders.generateLegalTeamEmailHTML(
      { workflowId: 'WF-1775162752752', documentId: 'Acme_Corp_12345', clientName: 'Acme Corp', requestedByName: 'Jane Doe', amount: 45000 },
      'tok'
    );
    expect(html).toContain('<strong>Client:</strong> Acme Corp');
    expect(html).toContain('<strong>Document ID:</strong> Acme_Corp_12345');
    expect(html).toContain('<strong>Amount:</strong> $45,000.00');
    expect(html).toContain('href="https://cpq.example.test/approval/WF-1775162752752?role=legal&token=tok"');
  });
});

describe('approval email subjects stay on one line', () => {
  it('sanitizeEmailSubject removes CR and LF', () => {
    expect(builders.sanitizeEmailSubject('Approval Required: DOC\r\nBcc: attacker@evil.test - Client')).toBe(
      'Approval Required: DOC Bcc: attacker@evil.test - Client'
    );
  });

  it('every approval, completion and denial subject is passed through sanitizeEmailSubject', () => {
    const subjects = serverSrc.match(/^.*`[^`\n]*(?:CloudFuze Approval Required: |Document Submitted for Approval: |Approval Workflow Completed: |Approval Denied by )\$\{.*$/gm) || [];
    expect(subjects.length).toBeGreaterThanOrEqual(9);
    for (const line of subjects) expect(line, line.trim()).toContain('sanitizeEmailSubject(`');
  });

  it('the automatic reminder fallback body escapes the stored document id and client', () => {
    expect(serverSrc).toContain('<strong>${escapeHtml(workflow.documentId)}</strong> (${escapeHtml(workflow.clientName)}).</p>');
  });
});
