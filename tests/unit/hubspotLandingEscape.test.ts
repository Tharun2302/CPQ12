import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

const start = serverSrc.indexOf('function landingText(');
const end = serverSrc.indexOf('// Database health check endpoint');
const landingSrc = serverSrc.slice(start, end);

type Captured = { headers: Record<string, string>; body: string; redirected: string | null; logged: unknown[] };

function callLanding(query: Record<string, unknown>): Captured {
  let handler: (req: unknown, res: unknown) => void = () => {};
  const app = { get: (_p: string, h: typeof handler) => { handler = h; } };
  const logged: unknown[] = [];
  new Function('app', 'console', landingSrc)(app, { log: (v: unknown) => logged.push(v) });
  const out: Captured = { headers: {}, body: '', redirected: null, logged };
  const res = {
    set(h: Record<string, string>) { Object.assign(out.headers, h); return res; },
    send(b: string) { out.body = b; return res; },
    redirect(_a: unknown, b?: unknown) { out.redirected = String(b ?? _a); return res; },
  };
  handler({ query }, res);
  return out;
}

const PARAMS = [
  'dealId', 'dealName', 'amount', 'closeDate', 'stage', 'ownerId',
  'ContactEmail', 'ContactFirstName', 'ContactLastName', 'CompanyName', 'CompanyByContact', 'CompanyFromContact',
];

const PAYLOADS = [
  '</script><script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "';alert(1);//",
  "'><svg/onload=alert(1)>",
];

describe('GET /hubspot-landing escaping', () => {
  describe.each(PARAMS)('param %s', (param) => {
    it.each(PAYLOADS)('payload %s never appears unescaped', (payload) => {
      const { body } = callLanding({ [param]: payload });
      expect(body).not.toMatch(/<script/i);
      expect(body).not.toMatch(/<img/i);
      expect(body).not.toMatch(/<svg/i);
      expect(body).not.toContain('</script');
      expect(body).not.toContain(payload);
    });
  });

  it('only the page own tags remain: no tag from a value can open', () => {
    const query = Object.fromEntries(PARAMS.map((p) => [p, '<b onmouseover="x">\'</b>']));
    const { body } = callLanding(query);
    const tags = body.match(/<[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag, `unexpected tag ${tag}`).toMatch(/^<\/?(h2|p|strong)>$/);
  });

  it('escapes the five HTML characters', () => {
    const { body } = callLanding({ dealName: `<>&"'` });
    expect(body).toContain('&lt;&gt;&amp;&quot;&#39;');
  });

  it('ignores non-string values (arrays and objects from a crafted query)', () => {
    const { body } = callLanding({ dealName: ['<script>alert(1)</script>'], stage: { $ne: '<script>' } });
    expect(body).not.toMatch(/<script/i);
    expect(body).toContain('<strong>Stage:</strong> N/A');
  });

  it('caps each value at 200 characters', () => {
    const { body } = callLanding({ dealName: 'a'.repeat(5000) });
    expect(body).toContain('a'.repeat(200));
    expect(body).not.toContain('a'.repeat(201));
  });

  it('sends html with nosniff and a deny-all CSP, and the page itself needs no script, style or image', () => {
    const { headers, body } = callLanding({ dealName: 'x' });
    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(headers['Content-Security-Policy']).not.toContain('unsafe-inline');
    expect(body).not.toMatch(/<(script|style|link|img|iframe|form|meta|base)\b/i);
    expect(body).not.toMatch(/\son\w+\s*=|style\s*=|javascript:/i);
  });

  it('a legitimate HubSpot link renders the same page content as before', () => {
    const { body, redirected } = callLanding({
      dealId: '57397519774',
      dealName: 'Acme Migration',
      amount: '25000',
      closeDate: '2026-12-31',
      stage: 'qualifiedtobuy',
      ownerId: '1234',
      ContactEmail: 'jane@acme.com',
      ContactFirstName: 'Jane',
      ContactLastName: 'Doe',
      CompanyName: 'Acme Corp',
      CompanyFromContact: 'Acme Inc',
    });
    expect(body).toContain('<p><strong>Deal:</strong> Acme Migration (ID: 57397519774)</p>');
    expect(body).toContain('<p><strong>Amount:</strong> 25000</p>');
    expect(body).toContain('<p><strong>Stage:</strong> qualifiedtobuy</p>');
    expect(body).toContain('<p><strong>Close Date:</strong> 2026-12-31</p>');
    expect(body).toContain('<p><strong>Owner ID:</strong> 1234</p>');
    expect(body).toContain('<p><strong>Name:</strong> Jane Doe</p>');
    expect(body).toContain('<p><strong>Email:</strong> jane@acme.com</p>');
    expect(body).toContain('<p><strong>Company:</strong> Acme Corp</p>');
    expect(body).toContain('<p><strong>Company by Contact:</strong> Acme Inc</p>');
    expect(redirected).toBeNull();
  });

  it('prefers CompanyByContact over CompanyFromContact as before', () => {
    const { body } = callLanding({ CompanyByContact: 'A', CompanyFromContact: 'B' });
    expect(body).toContain('<strong>Company by Contact:</strong> A</p>');
  });

  it('never redirects or builds a link from the query, so no other origin can be targeted', () => {
    const { body, redirected, headers } = callLanding({
      dealId: 'https://evil.example/x',
      dealName: '//evil.example',
      redirect: 'https://evil.example',
      next: 'https://evil.example',
    });
    expect(redirected).toBeNull();
    expect(headers.Location).toBeUndefined();
    expect(landingSrc).not.toMatch(/res\.redirect|Location|window\.location|http-equiv/i);
    expect(body).not.toMatch(/href\s*=|src\s*=|<meta/i);
  });

  it('does not store anything server-side (the app keeps cpq_hubspot_data in the browser)', () => {
    expect(landingSrc).not.toMatch(/\bdb\.|localStorage|cpq_hubspot_data/);
  });
});
