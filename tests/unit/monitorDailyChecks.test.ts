import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
// @ts-expect-error - CommonJS module, no type declarations
import dailyChecks from '../../monitor-daily-checks.cjs';

// monitor-daily-checks.cjs shipped in exactly one commit and never ran: every backtick template
// literal had been stripped, so the file did not parse. Its first working version then defaulted
// to http://localhost, where nginx answers 301 and every check failed nightly.
//
// These tests lock in that it parses, that it probes only endpoints server.cjs actually serves,
// that req() treats a 301 as a failure, and that no failure is silently dropped.
//
// Only the req() suite touches the network, and only its own loopback server.

type Check = {
  name: string; ok: boolean; status?: number | null; error?: string | null;
  detail?: string; informational?: boolean; url?: string; body?: string;
  attempts?: number; retried?: boolean;
};
type Payload = {
  message: string; healthy: boolean; failedCount: number; checkCount: number; retriedCount?: number;
};
type RunResult = { summary: { checks: Check[]; host: string }; message: string; payload: Payload; reportPath: string | null };
type ReqResult = { ok: boolean; status?: number; body?: string; error?: string };

const {
  main, req, buildMessage, deriveHealthChecks, resolveAppHost, ENDPOINTS,
  MAX_ATTEMPTS, RETRY_DELAY_MS,
} = dailyChecks as {
  main: (o: Record<string, unknown>) => Promise<RunResult>;
  req: (method: string, url: string, body?: unknown, timeout?: number) => Promise<ReqResult>;
  buildMessage: (s: Record<string, unknown>) => string;
  deriveHealthChecks: (r: Record<string, unknown>) => Check[];
  resolveAppHost: () => string;
  ENDPOINTS: { name: string; pathname: string }[];
  MAX_ATTEMPTS: number;
  RETRY_DELAY_MS: number;
};

const SCRIPT = path.join(process.cwd(), 'monitor-daily-checks.cjs');
const SERVER = path.join(process.cwd(), 'server.cjs');
const serverSource = fs.readFileSync(SERVER, 'utf8');

// Mirrors the literal response of `app.get('/api/health')` at server.cjs:5925. The field values
// are asserted against server.cjs below, so a rename there fails the test instead of silently
// turning a dead database into a green report.
const HEALTHY_BODY = JSON.stringify({
  success: true,
  message: 'CPQ Server is running',
  timestamp: '2026-09-17T03:30:00.000Z',
  database: 'Connected',
  email: 'Configured',
  hubspot: 'Demo mode',
});

type StubResponse = { ok: boolean; status?: number; body?: string; error?: string };

/** Builds an injectable request function that answers from a path -> response map. */
function stubRequest(byPath: Record<string, StubResponse | (() => StubResponse)>) {
  const calls: { method: string; url: string }[] = [];
  const request = async (method: string, url: string): Promise<StubResponse> => {
    calls.push({ method, url });
    const key = new URL(url).pathname;
    const entry = byPath[key];
    if (!entry) return { ok: false, status: 404, body: 'Cannot GET' };
    return typeof entry === 'function' ? entry() : entry;
  };
  return { request, calls };
}

/**
 * Builds a request function that answers a DIFFERENT response per attempt on the same path, so a
 * fail-then-pass retry can be distinguished from a stub that simply always passes.
 */
function sequenceRequest(byPath: Record<string, StubResponse[]>) {
  const calls: { method: string; url: string }[] = [];
  const request = async (method: string, url: string): Promise<StubResponse> => {
    calls.push({ method, url });
    const key = new URL(url).pathname;
    const queue = byPath[key];
    if (!queue || queue.length === 0) return { ok: false, status: 404, body: 'Cannot GET' };
    // The last entry repeats, so a two-entry queue is "first attempt, then every attempt after".
    return queue.length === 1 ? queue[0] : (queue.shift() as StubResponse);
  };
  const callsFor = (pathname: string) => calls.filter((c) => new URL(c.url).pathname === pathname);
  return { request, calls, callsFor };
}

const ALL_HEALTHY: Record<string, StubResponse> = {
  '/api/health': { ok: true, status: 200, body: HEALTHY_BODY },
  '/api/database/health': { ok: true, status: 200, body: '{"success":true}' },
  '/api/libreoffice/health': { ok: true, status: 200, body: '{"success":true}' },
};

let reportDir = '';
let posted: { url: string; payload: Payload }[] = [];
/** Every retry delay the run asked for. Injected, so the suite never really sleeps 5 seconds. */
let delays: number[] = [];
const delay = async (ms: number) => { delays.push(ms); };
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

const post = async (url: string, payload: Payload) => {
  posted.push({ url, payload });
  return true;
};

/**
 * Every run gets a bogus but truthy webhook: an empty one is refilled from monitor.env on prod.
 * The retry delay is injected too — a failing stub is retried for real, and the wait must not be.
 */
function run(byPath: Record<string, StubResponse | (() => StubResponse)>) {
  return main({
    request: stubRequest(byPath).request,
    post,
    reportDir,
    webhookUrl: 'http://127.0.0.1:1/stub',
    host: 'https://zenop.ai',
    delay,
  });
}

function checkNamed(result: RunResult, name: string): Check {
  const found = result.summary.checks.find((c) => c.name === name);
  expect(found, `no check named ${name}`).toBeDefined();
  return found as Check;
}

beforeEach(() => {
  reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-daily-checks-'));
  posted = [];
  delays = [];
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  fs.rmSync(reportDir, { recursive: true, force: true });
});

describe('monitor-daily-checks.cjs parses and loads', () => {
  it('passes node --check (regression for the stripped template literals)', () => {
    expect(() => execFileSync(process.execPath, ['--check', SCRIPT])).not.toThrow();
  });

  it('imports without throwing and exports its functions', () => {
    expect(typeof main).toBe('function');
    expect(typeof req).toBe('function');
    expect(typeof buildMessage).toBe('function');
    expect(typeof deriveHealthChecks).toBe('function');
  });

  it('does not run main() on import — only when invoked directly', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/if \(require\.main === module\)/);
    expect(src).toMatch(/module\.exports = \{/);
  });
});

describe('req() over a real loopback server', () => {
  let server: http.Server;
  let base = '';
  const handlers: Record<string, http.RequestListener> = {};

  beforeEach(async () => {
    server = http.createServer((req_, res) => {
      const handler = handlers[(req_.url || '').split('?')[0]];
      if (!handler) { res.writeHead(404).end('no handler'); return; }
      handler(req_, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    await new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
  });

  // This is the check that would have caught the http://localhost default: nginx's only :80
  // server block answers `return 301 https://$host$request_uri`.
  it('treats a 301 redirect as a FAILURE and does not follow it', async () => {
    let followed = 0;
    handlers['/api/health'] = (_q, res) => {
      res.writeHead(301, { Location: 'https://zenop.ai/api/health' }).end();
    };
    handlers['/followed'] = (_q, res) => { followed += 1; res.writeHead(200).end('{}'); };
    const res = await req('GET', `${base}/api/health`);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(301);
    expect(followed).toBe(0);
  });

  it('treats a 302 redirect as a failure too', async () => {
    handlers['/api/health'] = (_q, res) => { res.writeHead(302, { Location: '/elsewhere' }).end(); };
    const res = await req('GET', `${base}/api/health`);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(302);
  });

  it('returns ok with the body on a 200', async () => {
    handlers['/api/health'] = (_q, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(HEALTHY_BODY);
    };
    const res = await req('GET', `${base}/api/health`);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string).database).toBe('Connected');
  });

  it('reports a 503 as not ok', async () => {
    handlers['/api/libreoffice/health'] = (_q, res) => { res.writeHead(503).end('{"success":false}'); };
    const res = await req('GET', `${base}/api/libreoffice/health`);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  // r.setTimeout only measures socket INACTIVITY. A response that dribbles a byte every so often
  // resets it forever, so the wall-clock guard is what actually ends the run.
  it('gives up on a slow-drip response that never trips socket inactivity', async () => {
    let timer: NodeJS.Timeout;
    handlers['/api/health'] = (_q, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      timer = setInterval(() => { try { res.write('.'); } catch (e) { /* closed */ } }, 20);
      res.on('close', () => clearInterval(timer));
    };
    const started = Date.now();
    const res = await req('GET', `${base}/api/health`, null, 200);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('times out on a server that accepts the socket and never answers', async () => {
    handlers['/api/health'] = () => { /* deliberately never responds */ };
    const res = await req('GET', `${base}/api/health`, null, 150);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('timeout');
  });

  it('aborts a response larger than the 1 MB cap instead of buffering it', async () => {
    const chunk = 'x'.repeat(64 * 1024);
    handlers['/api/health'] = (_q, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      let sent = 0;
      const pump = () => {
        while (sent < 4 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) { res.once('drain', pump); return; }
        }
        res.end();
      };
      pump();
    };
    const res = await req('GET', `${base}/api/health`, null, 5000);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('response body too large');
    expect(res.body).toBeUndefined();
  });

  it('reports a refused connection as a failure rather than throwing', async () => {
    const res = await req('GET', 'http://127.0.0.1:1/api/health', null, 2000);
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
  });

  it('rejects a malformed URL without throwing', async () => {
    const res = await req('GET', 'not-a-url');
    expect(res).toEqual({ ok: false, error: 'invalid url' });
  });
});

describe('endpoint list', () => {
  // Asserting against the same literals the module holds would pass for three invented paths,
  // which is exactly the defect this list was written to fix. Check server.cjs instead.
  it('probes only paths registered as GET routes in server.cjs', () => {
    expect(ENDPOINTS.length).toBeGreaterThan(0);
    for (const endpoint of ENDPOINTS) {
      expect(serverSource, `${endpoint.pathname} is not a route in server.cjs`)
        .toContain(`app.get('${endpoint.pathname}'`);
    }
  });

  it('covers the three health endpoints', () => {
    expect(ENDPOINTS.map((e) => e.pathname).sort()).toEqual(
      ['/api/database/health', '/api/health', '/api/libreoffice/health'],
    );
  });

  it('no longer references the invented endpoints or POSTs a test payload', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    for (const gone of [
      "'/health'", "'/status'", '/api/test/generate-pdf', '/api/generate-pdf',
      '/api/test/redline', '/api/redline', '/api/test/send-for-approval',
      '/api/approvals/test', '/api/test/esign', '/api/esign/test',
    ]) {
      expect(src).not.toContain(gone);
    }
    expect(src).not.toMatch(/dryRun/);
  });

  it('issues GET only', async () => {
    const stub = stubRequest(ALL_HEALTHY);
    await main({ request: stub.request, post, reportDir, webhookUrl: 'http://127.0.0.1:1/stub', host: 'https://zenop.ai' });
    expect(stub.calls).toHaveLength(3);
    expect(stub.calls.every((c) => c.method === 'GET')).toBe(true);
  });
});

describe('default host', () => {
  const previous = process.env.APP_HOST;
  afterEach(() => {
    if (previous === undefined) delete process.env.APP_HOST;
    else process.env.APP_HOST = previous;
  });

  it('defaults to https://zenop.ai, the path through nginx and TLS', () => {
    delete process.env.APP_HOST;
    expect(resolveAppHost()).toBe('https://zenop.ai');
  });

  it('never defaults to plain http (:80 is a 301) or to https://localhost (cert mismatch)', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    // Match the default expression only; the comment above it names both rejected candidates.
    expect(src).toMatch(/APP_HOST \|\| 'https:\/\/zenop\.ai'/);
    expect(src).not.toMatch(/APP_HOST \|\| 'http:\/\/localhost'/);
    expect(src).not.toMatch(/APP_HOST \|\| 'https:\/\/localhost'/);
    expect(src).not.toContain('localhost:3000');
  });

  it('honors APP_HOST and strips trailing slashes', () => {
    process.env.APP_HOST = 'http://localhost:3001/';
    expect(resolveAppHost()).toBe('http://localhost:3001');
  });
});

describe('/api/health body parsing', () => {
  // Locks the fixture to the source. A rename in server.cjs must break a test, not production.
  it('matches the literals server.cjs:5925 actually emits', () => {
    expect(serverSource).toContain("database: databaseAvailable ? 'Connected' : 'Disconnected'");
    expect(serverSource).toContain("email: isEmailConfigured ? 'Configured' : 'Not configured'");
    expect(serverSource).toContain("hubspot: HUBSPOT_API_KEY !== 'demo-key' ? 'Configured' : 'Demo mode'");
  });

  it('has no derived "database connection" check — that field is a boot-time snapshot', async () => {
    const result = await run(ALL_HEALTHY);
    expect(result.summary.checks.find((c) => c.name === 'database connection')).toBeUndefined();
    // The live ping endpoint is still probed and still counted.
    expect(checkNamed(result, 'database health').ok).toBe(true);
    expect(checkNamed(result, 'database health').informational).toBeUndefined();
  });

  it('reports email configuration as informational, so it cannot pad the pass count', async () => {
    const result = await run(ALL_HEALTHY);
    const email = checkNamed(result, 'email configuration (at last boot)');
    expect(email.informational).toBe(true);
    expect(email.detail).toBe('Configured');
    expect(result.message).toContain('INFO email configuration (at last boot): Configured');
  });

  it('still reports healthy when email is Not configured, because it is not counted', async () => {
    const body = JSON.stringify({ success: true, database: 'Connected', email: 'Not configured' });
    const result = await run({ ...ALL_HEALTHY, '/api/health': { ok: true, status: 200, body } });
    expect(checkNamed(result, 'email configuration (at last boot)').informational).toBe(true);
    expect(result.payload.healthy).toBe(true);
  });

  it('treats HubSpot demo mode as informational, not a failure', async () => {
    const result = await run(ALL_HEALTHY);
    expect(checkNamed(result, 'hubspot').informational).toBe(true);
    expect(result.payload.healthy).toBe(true);
  });

  it('fails the payload check when the body is not JSON, rather than skipping it', () => {
    const derived = deriveHealthChecks({ ok: true, body: '<html>502 Bad Gateway</html>' });
    const payload = derived.find((c) => c.name === 'app health payload') as Check;
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/parse/);
  });

  it('fails the run when /api/health answers 200 with HTML', async () => {
    const result = await run({
      ...ALL_HEALTHY,
      '/api/health': { ok: true, status: 200, body: '<html>502 Bad Gateway</html>' },
    });
    expect(result.payload.healthy).toBe(false);
    expect(checkNamed(result, 'app health payload').ok).toBe(false);
  });

  it('fails the payload check when /api/health itself did not respond', async () => {
    const result = await run({ ...ALL_HEALTHY, '/api/health': { ok: false, error: 'timeout' } });
    expect(checkNamed(result, 'app health').ok).toBe(false);
    expect(checkNamed(result, 'app health payload').ok).toBe(false);
    expect(result.payload.failedCount).toBe(2);
  });
});

describe('probe failures are never dropped', () => {
  it('reports a non-2xx status as failed', async () => {
    const result = await run({
      ...ALL_HEALTHY,
      '/api/libreoffice/health': { ok: false, status: 503, body: '{"success":false}' },
    });
    const check = checkNamed(result, 'LibreOffice fallback');
    expect(check.ok).toBe(false);
    expect(check.status).toBe(503);
    expect(result.message).toContain('FAIL LibreOffice fallback');
    expect(result.payload.healthy).toBe(false);
  });

  it('does not claim the LibreOffice probe covers PDF generation', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(ENDPOINTS.map((e) => e.name)).toContain('LibreOffice fallback');
    expect(src).not.toContain('PDF generation (LibreOffice)');
    expect(src).toMatch(/[Gg]otenberg/);
  });

  it('reports a 301 from the stubbed transport as failed', async () => {
    const result = await run({
      ...ALL_HEALTHY,
      '/api/database/health': { ok: false, status: 301, body: '' },
    });
    expect(checkNamed(result, 'database health').ok).toBe(false);
    expect(checkNamed(result, 'database health').status).toBe(301);
    expect(result.payload.healthy).toBe(false);
  });

  it('reports a timeout as failed', async () => {
    const result = await run({ ...ALL_HEALTHY, '/api/database/health': { ok: false, error: 'timeout' } });
    const check = checkNamed(result, 'database health');
    expect(check.ok).toBe(false);
    expect(check.error).toBe('timeout');
    expect(result.message).toContain('FAIL database health');
  });

  it('reports a thrown request as failed instead of crashing the run', async () => {
    const result = await run({
      ...ALL_HEALTHY,
      '/api/database/health': () => { throw new Error('socket hang up'); },
    });
    expect(checkNamed(result, 'database health').ok).toBe(false);
    expect(checkNamed(result, 'database health').error).toBe('socket hang up');
    expect(checkNamed(result, 'LibreOffice fallback').ok).toBe(true);
  });

  it('reports every endpoint as failed when every path 404s', async () => {
    const result = await run({});
    expect(result.payload.healthy).toBe(false);
    expect(result.summary.checks.filter((c) => !c.informational && !c.ok)).toHaveLength(4);
  });

  it('still posts when the Teams poster throws', async () => {
    const result = await main({
      request: stubRequest(ALL_HEALTHY).request,
      post: async () => { throw new Error('flow rejected the payload'); },
      reportDir,
      webhookUrl: 'http://127.0.0.1:1/stub',
      host: 'https://zenop.ai',
    });
    expect(result.payload.healthy).toBe(true);
    expect(errSpy).toHaveBeenCalled();
  });
});

// Two of the four counted checks fail for benign reasons: /api/libreoffice/health shells out to
// `soffice --version` under a hard 5s timeout that a cold start can exceed while healthy, and
// /api/database/health is a real Atlas ping that a momentary failover breaks. A single sample
// cannot tell those apart from an outage, and an alert that cries wolf gets ignored. So a FAILED
// check is tried once more; a passing one never is.
describe('a failed check is retried once', () => {
  const OK_DB: StubResponse = { ok: true, status: 200, body: '{"success":true}' };
  const DOWN_DB: StubResponse = { ok: false, status: 503, error: 'connection refused' };

  /** Runs main() against a per-attempt response queue, with the retry wait injected. */
  function runSequence(byPath: Record<string, StubResponse[]>) {
    const stub = sequenceRequest(byPath);
    return main({
      request: stub.request,
      post,
      reportDir,
      webhookUrl: 'http://127.0.0.1:1/stub',
      host: 'https://zenop.ai',
      delay,
    }).then((result) => ({ result, stub }));
  }

  const HEALTHY_SEQUENCE: Record<string, StubResponse[]> = {
    '/api/health': [{ ok: true, status: 200, body: HEALTHY_BODY }],
    '/api/database/health': [OK_DB],
    '/api/libreoffice/health': [OK_DB],
  };

  it('reports a check that failed then passed on the retry as PASSED', async () => {
    const { result } = await runSequence({
      ...HEALTHY_SEQUENCE,
      '/api/libreoffice/health': [{ ok: false, status: 503, error: 'converter timed out' }, OK_DB],
    });
    const check = checkNamed(result, 'LibreOffice fallback');
    expect(check.ok).toBe(true);
    expect(check.status).toBe(200);
    expect(result.payload.healthy).toBe(true);
    expect(result.payload.failedCount).toBe(0);
  });

  it('makes the retry visible in the message, the report and the payload', async () => {
    const { result } = await runSequence({
      ...HEALTHY_SEQUENCE,
      '/api/libreoffice/health': [{ ok: false, status: 503, error: 'converter timed out' }, OK_DB],
    });
    expect(result.message).toMatch(/^PASS LibreOffice fallback:.*retried once$/m);
    expect(result.message).toContain('Retried: 1 of 4 checks failed on the first attempt');
    expect(result.payload.retriedCount).toBe(1);
    expect(checkNamed(result, 'LibreOffice fallback').retried).toBe(true);
    const written = fs.readFileSync(result.reportPath as string, 'utf8');
    expect(written).toBe(result.message);
    expect(posted[0].payload.message).toBe(result.message);
  });

  it('issues exactly two requests for the endpoint that failed first', async () => {
    const { stub } = await runSequence({
      ...HEALTHY_SEQUENCE,
      '/api/libreoffice/health': [{ ok: false, status: 503, error: 'converter timed out' }, OK_DB],
    });
    expect(stub.callsFor('/api/libreoffice/health')).toHaveLength(2);
  });

  it('does NOT retry a check that passed first time', async () => {
    const { stub } = await runSequence({
      ...HEALTHY_SEQUENCE,
      '/api/libreoffice/health': [{ ok: false, status: 503, error: 'converter timed out' }, OK_DB],
    });
    expect(stub.callsFor('/api/health')).toHaveLength(1);
    expect(stub.callsFor('/api/database/health')).toHaveLength(1);
  });

  it('retries nothing at all when every check passes first time', async () => {
    const { result, stub } = await runSequence(HEALTHY_SEQUENCE);
    expect(stub.calls).toHaveLength(3);
    expect(delays).toEqual([]);
    expect(result.payload.retriedCount).toBe(0);
    // A healthy morning's message must read exactly as it did before retries existed.
    expect(result.message).not.toContain('retried');
    expect(result.message).not.toContain('Retried:');
    expect(result.message).toContain('Result: all 4 checks passed');
  });

  it('reports a check that failed twice as FAILED, counted once and not twice', async () => {
    const { result, stub } = await runSequence({ ...HEALTHY_SEQUENCE, '/api/database/health': [DOWN_DB] });
    expect(stub.callsFor('/api/database/health')).toHaveLength(2);
    expect(result.payload.healthy).toBe(false);
    expect(result.payload.failedCount).toBe(1);
    expect(result.payload.checkCount).toBe(4);
    expect(result.summary.checks.filter((c) => c.name === 'database health')).toHaveLength(1);
    expect(result.message.split('\n').filter((l) => l.startsWith('FAIL database health'))).toHaveLength(1);
    expect(result.message).toMatch(/^FAIL database health:.*retried once$/m);
  });

  it('retries each failing endpoint independently rather than restarting the run', async () => {
    const { result, stub } = await runSequence({
      '/api/health': [{ ok: true, status: 200, body: HEALTHY_BODY }],
      '/api/database/health': [DOWN_DB],
      '/api/libreoffice/health': [{ ok: false, status: 503, error: 'cold start' }, OK_DB],
    });
    expect(stub.callsFor('/api/health')).toHaveLength(1);
    expect(stub.callsFor('/api/database/health')).toHaveLength(2);
    expect(stub.callsFor('/api/libreoffice/health')).toHaveLength(2);
    expect(checkNamed(result, 'database health').ok).toBe(false);
    expect(checkNamed(result, 'LibreOffice fallback').ok).toBe(true);
    expect(result.payload.failedCount).toBe(1);
    expect(result.payload.retriedCount).toBe(2);
  });

  it('retries a transport that throws, and passes if the second attempt answers', async () => {
    let calls = 0;
    const result = await main({
      request: async (_m: string, url: string) => {
        if (new URL(url).pathname !== '/api/database/health') return { ok: true, status: 200, body: HEALTHY_BODY };
        calls += 1;
        if (calls === 1) throw new Error('socket hang up');
        return { ok: true, status: 200, body: '{"success":true}' };
      },
      post,
      reportDir,
      webhookUrl: 'http://127.0.0.1:1/stub',
      host: 'https://zenop.ai',
      delay,
    });
    expect(calls).toBe(2);
    expect(checkNamed(result, 'database health').ok).toBe(true);
    expect(checkNamed(result, 'database health').retried).toBe(true);
  });

  // The easiest thing to get wrong: app health payload, email and hubspot are all derived from the
  // /api/health BODY. If the retry's body were dropped, a retried run would report the stale one.
  it('recomputes the derived checks from the RETRY body, not the first attempt', async () => {
    const retryBody = JSON.stringify({
      success: true,
      message: 'CPQ Server is running',
      database: 'Connected',
      email: 'Not configured',
      hubspot: 'Configured',
    });
    const { result, stub } = await runSequence({
      ...HEALTHY_SEQUENCE,
      // First attempt fails while carrying the OLD body; the retry succeeds with a DIFFERENT one.
      '/api/health': [
        { ok: false, status: 503, body: HEALTHY_BODY, error: 'gateway timeout' },
        { ok: true, status: 200, body: retryBody },
      ],
    });
    expect(stub.callsFor('/api/health')).toHaveLength(2);
    expect(checkNamed(result, 'app health').ok).toBe(true);
    expect(checkNamed(result, 'app health').retried).toBe(true);
    // Derived from the retry: 'Configured' appears only in the first body, so a stale read shows.
    expect(checkNamed(result, 'email configuration (at last boot)').detail).toBe('Not configured');
    expect(checkNamed(result, 'hubspot').detail).toBe('Configured');
    // And it is a real parse of the retry body, not the 'unknown' fallback of a failed attempt.
    expect(checkNamed(result, 'app health payload').ok).toBe(true);
    expect(checkNamed(result, 'app health payload').detail).toBe('valid JSON');
    expect(result.payload.healthy).toBe(true);
  });

  it('still fails the derived payload check when both /api/health attempts fail', async () => {
    const { result } = await runSequence({ ...HEALTHY_SEQUENCE, '/api/health': [{ ok: false, error: 'timeout' }] });
    expect(checkNamed(result, 'app health').ok).toBe(false);
    expect(checkNamed(result, 'app health payload').ok).toBe(false);
    expect(result.payload.failedCount).toBe(2);
    expect(result.payload.retriedCount).toBe(1);
  });

  it('waits RETRY_DELAY_MS between attempts without the suite really sleeping', async () => {
    const started = Date.now();
    const { result } = await runSequence({
      '/api/health': [{ ok: false, error: 'timeout' }],
      '/api/database/health': [DOWN_DB],
      '/api/libreoffice/health': [DOWN_DB],
    });
    expect(delays).toEqual([RETRY_DELAY_MS, RETRY_DELAY_MS, RETRY_DELAY_MS]);
    expect(RETRY_DELAY_MS).toBe(5000);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.payload.failedCount).toBe(4);
  });

  it('retries once, not more — MAX_ATTEMPTS is 2', async () => {
    expect(MAX_ATTEMPTS).toBe(2);
    const { stub } = await runSequence({ ...HEALTHY_SEQUENCE, '/api/database/health': [DOWN_DB] });
    expect(stub.callsFor('/api/database/health')).toHaveLength(2);
  });

  // An env-supplied number here would need validated parsing — parseInt('1.9e6') is 1, a bug this
  // repo has already shipped. Every number in this file is a literal; keep it that way.
  it('hardcodes the retry count and delay instead of adding an env variable', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/const MAX_ATTEMPTS = 2;/);
    expect(src).toMatch(/const RETRY_DELAY_MS = 5000;/);
    expect(src).not.toMatch(/process\.env\.(MAX_ATTEMPTS|RETRY[A-Z_]*|ATTEMPT[A-Z_]*)/);
    // No env value is turned into a number anywhere in this file.
    expect(src).not.toMatch(/parseInt\(process\.env|Number\(process\.env|\+process\.env/);
  });

  it('does not unref the retry timer, which would let the process exit mid-gap', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const sleepFn = src.split('function sleep(ms)')[1].split('\n}')[0];
    expect(sleepFn).toContain('setTimeout(resolve, ms)');
    expect(sleepFn).not.toContain('unref');
  });
});

describe('redaction', () => {
  it('masks a secret that surfaces in an endpoint error detail', async () => {
    const leak = 'MongoServerError: failed to connect to mongodb://admin:hunter2@cluster0.ab12.mongodb.net/cpq';
    const result = await run({ ...ALL_HEALTHY, '/api/database/health': { ok: false, status: 500, error: leak } });
    expect(result.message).not.toContain('hunter2');
    expect(result.payload.message).not.toContain('hunter2');
    expect(checkNamed(result, 'database health').error).not.toContain('hunter2');
  });

  it('caps a very long error at 280 characters', async () => {
    const long = 'E'.repeat(5000);
    const result = await run({ ...ALL_HEALTHY, '/api/database/health': { ok: false, status: 500, error: long } });
    expect((checkNamed(result, 'database health').error as string).length).toBeLessThanOrEqual(280);
  });

  it('imports the shared redactor rather than a private copy', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/require\(['"]\.\/monitor-ai-explain\.cjs['"]\)/);
    expect(src).toMatch(/\.slice\(0, MAX_FIELD_CHARS\)/);
  });

  // The redactor masks IPv4 literals, so a bare-IP APP_HOST reports as http://[IP]. Both
  // documented values must survive it, or every report loses the host line to redaction.
  it.each(['https://zenop.ai', 'http://localhost:3001'])('leaves %s readable', (host) => {
    const message = buildMessage({
      label: 'x', host, generatedAt: '2026-09-17T03:30:00.000Z', checks: [],
    });
    expect(message).toContain(`Host: ${host}`);
  });
});

describe('response bodies are not retained', () => {
  it('drops the body from every check result', async () => {
    const result = await run(ALL_HEALTHY);
    for (const check of result.summary.checks) {
      expect(check.body, `${check.name} still carries a body`).toBeUndefined();
    }
  });

  it('keeps the body only long enough for probeEndpoint to hand it to the parser', async () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/endpoint\.parseHealthBody \?/);
    expect(src).toMatch(/delete result\.body/);
  });
});

describe('the shared env file', () => {
  const ENV_FIXTURE = path.join(os.tmpdir(), 'cpq-monitor-env-fixture.env');

  afterEach(() => { try { fs.unlinkSync(ENV_FIXTURE); } catch (e) { /* not created */ } });

  // FOOTGUN: the loader tests `!process.env[key]`, so an intentionally EMPTY variable is refilled
  // from monitor.env. Blanking TEAMS_WEBHOOK_URL on the prod box therefore posts to REAL Teams.
  it('refills an intentionally empty env var from the env file', () => {
    fs.writeFileSync(ENV_FIXTURE, 'TEAMS_WEBHOOK_URL=https://prod.example/flow\nDAILY_SCAN_LABEL=From File\n');
    const out = execFileSync(process.execPath, [
      '-e', "require(process.argv[1]); process.stdout.write(process.env.TEAMS_WEBHOOK_URL);", SCRIPT,
    ], { env: { ...process.env, MONITOR_ENV_FILE: ENV_FIXTURE, TEAMS_WEBHOOK_URL: '' }, encoding: 'utf8' });
    expect(out).toBe('https://prod.example/flow');
  });

  it('does not overwrite a variable that is already set to a non-empty value', () => {
    fs.writeFileSync(ENV_FIXTURE, 'TEAMS_WEBHOOK_URL=https://prod.example/flow\n');
    const out = execFileSync(process.execPath, [
      '-e', "require(process.argv[1]); process.stdout.write(process.env.TEAMS_WEBHOOK_URL);", SCRIPT,
    ], { env: { ...process.env, MONITOR_ENV_FILE: ENV_FIXTURE, TEAMS_WEBHOOK_URL: 'http://127.0.0.1:1/stub' }, encoding: 'utf8' });
    expect(out).toBe('http://127.0.0.1:1/stub');
  });

  it('documents the footgun at the loader', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/FOOTGUN/);
  });
});

describe('the daily label does not collide with the log monitor', () => {
  it('reads DAILY_SCAN_LABEL, never the shared SCAN_LABEL', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toContain("process.env.DAILY_SCAN_LABEL");
    expect(src).not.toMatch(/process\.env\.SCAN_LABEL/);
  });

  it('is documented in .env.monitor.example', () => {
    const example = fs.readFileSync(path.join(process.cwd(), '.env.monitor.example'), 'utf8');
    expect(example).toMatch(/^DAILY_SCAN_LABEL=/m);
    expect(example).toMatch(/https:\/\/zenop\.ai/);
    expect(example).toMatch(/http:\/\/localhost:3001/);
  });
});

describe('report file and Teams payload', () => {
  it('writes a dated report containing the message', async () => {
    const result = await run(ALL_HEALTHY);
    expect(result.reportPath).toBeTruthy();
    const written = fs.readFileSync(result.reportPath as string, 'utf8');
    expect(written).toBe(result.message);
    expect(path.basename(result.reportPath as string)).toMatch(/^daily-checks-\d{4}-\d{2}-\d{2}T\d{6}\.txt$/);
    expect(fs.readdirSync(reportDir)).toHaveLength(1);
  });

  it('writes the report with mode 0600', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/writeFileSync\(reportPath, message, \{ mode: 0o600 \}\)/);
  });

  it('posts a payload whose message field is a non-empty string', async () => {
    await run(ALL_HEALTHY);
    expect(posted).toHaveLength(1);
    expect(typeof posted[0].payload.message).toBe('string');
    expect(posted[0].payload.message).toContain('Result: all 4 checks passed');
    expect(posted[0].payload.message).toContain('PASS app health');
  });

  it('counts four checks, not the five the stale database check used to pad it to', async () => {
    const result = await run(ALL_HEALTHY);
    expect(result.payload.checkCount).toBe(4);
  });

  it('still posts, and nulls reportPath, when the report cannot be written', async () => {
    const blocker = path.join(reportDir, 'blocker');
    fs.writeFileSync(blocker, 'a file where the report directory would go');
    const result = await main({
      request: stubRequest(ALL_HEALTHY).request,
      post,
      reportDir: path.join(blocker, 'reports'),
      webhookUrl: 'http://127.0.0.1:1/stub',
      host: 'https://zenop.ai',
    });
    expect(result.reportPath).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    expect(posted).toHaveLength(1);
    expect(posted[0].payload.message.length).toBeGreaterThan(0);
  });

  it('uses the shared teams-notify helper rather than a private copy', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/require\(['"]\.\/teams-notify\.cjs['"]\)/);
    expect(src).not.toMatch(/function postToTeams/);
  });
});

// The Teams message is line-oriented and the Power Automate flow renders `message` verbatim, so
// a newline reaching it from a health-response field lets the monitored app forge PASS/FAIL lines
// and a fake "Result:" verdict. The structured payload stayed honest, but the human on call reads
// the rendered text — so the monitor could be made to announce success during a real outage.
describe('control characters cannot forge lines in the Teams message', () => {
  const FORGED_EMAIL = [
    'Configured',
    'PASS database health: https://zenop.ai/api/database/health — HTTP 200',
    'FAIL ignore-me',
  ].join('\n');
  const FORGED_HUBSPOT = 'Demo mode\nResult: all 99 checks passed';

  const FORGED_BODY = JSON.stringify({
    success: true,
    message: 'CPQ Server is running',
    database: 'Connected',
    email: FORGED_EMAIL,
    hubspot: FORGED_HUBSPOT,
  });

  /** Two of four counted checks genuinely fail, so a forged "all passed" line would be a lie. */
  const TWO_GENUINE_FAILURES: Record<string, StubResponse> = {
    '/api/health': { ok: true, status: 200, body: FORGED_BODY },
    '/api/database/health': { ok: false, status: 503, error: 'connection refused' },
    '/api/libreoffice/health': { ok: false, status: 503, error: 'converter down' },
  };

  const CLEAN_EQUIVALENT: Record<string, StubResponse> = {
    ...TWO_GENUINE_FAILURES,
    '/api/health': { ok: true, status: 200, body: HEALTHY_BODY },
  };

  const stateLines = (message: string) =>
    message.split('\n').filter((l) => /^(PASS|FAIL|INFO) /.test(l));

  it('renders the same number of lines as an identical run with clean fields', async () => {
    const forged = await run(TWO_GENUINE_FAILURES);
    const clean = await run(CLEAN_EQUIVALENT);
    expect(forged.message.split('\n')).toHaveLength(clean.message.split('\n').length);
  });

  it('emits exactly one state line per check, not one per embedded newline', async () => {
    const result = await run(TWO_GENUINE_FAILURES);
    expect(stateLines(result.message)).toHaveLength(result.summary.checks.length);
  });

  it('emits exactly one Result: line, and it reports the real failure count', async () => {
    const result = await run(TWO_GENUINE_FAILURES);
    const verdicts = result.message.split('\n').filter((l) => l.startsWith('Result:'));
    expect(verdicts).toEqual(['Result: 2 of 4 checks FAILED']);
    expect(result.message).not.toMatch(/^Result: all 99 checks passed$/m);
    expect(result.payload.healthy).toBe(false);
    expect(result.payload.failedCount).toBe(2);
  });

  it('does not let a forged PASS or FAIL line appear on its own line', async () => {
    const result = await run(TWO_GENUINE_FAILURES);
    const lines = result.message.split('\n');
    expect(lines).not.toContain('FAIL ignore-me');
    expect(lines).not.toContain('PASS database health: https://zenop.ai/api/database/health — HTTP 200');
    // The forged text survives, flattened onto the INFO line it actually belongs to.
    expect(result.message).toMatch(/^INFO email configuration \(at last boot\): Configured PASS database health/m);
  });

  it('writes the same flattened text to the report file that it posts to Teams', async () => {
    const result = await run(TWO_GENUINE_FAILURES);
    const written = fs.readFileSync(result.reportPath as string, 'utf8');
    expect(written).toBe(result.message);
    expect(written.split('\n').filter((l) => /^(PASS|FAIL|INFO) /.test(l)))
      .toHaveLength(result.summary.checks.length);
    expect(posted[0].payload.message).toBe(result.message);
  });

  it('a detail containing \\n adds no line to the rendered message', () => {
    const base = buildMessage({
      label: 'x', host: 'https://zenop.ai', generatedAt: '2026-09-17T03:30:00.000Z',
      checks: [{ name: 'a', ok: true, detail: 'plain' }],
    });
    const injected = buildMessage({
      label: 'x', host: 'https://zenop.ai', generatedAt: '2026-09-17T03:30:00.000Z',
      checks: [{ name: 'a', ok: true, detail: 'plain\nFAIL forged\nResult: all 99 checks passed' }],
    });
    expect(injected.split('\n')).toHaveLength(base.split('\n').length);
    expect(injected.split('\n').filter((l) => l.startsWith('FAIL'))).toHaveLength(0);
  });

  it('flattens carriage returns, tabs, NUL and DEL as well as newlines', () => {
    const message = buildMessage({
      label: 'x', host: 'https://zenop.ai', generatedAt: '2026-09-17T03:30:00.000Z',
      checks: [{ name: 'a', ok: true, detail: 'a\rb\tc def' }],
    });
    expect(message).toContain('PASS a: a b c d e f');
    // \n is the message's own line separator, so only the rendered line must be free of them.
    const line = message.split('\n').find((l) => l.startsWith('PASS a')) as string;
    expect(line).not.toMatch(/[\r\t -]/);
  });

  // Order matters: stripping AFTER the 280-char cut could leave a newline sitting at the cut.
  it('strips control characters before the length cap, and still caps at 280', async () => {
    const long = `${'E\n'.repeat(3000)}tail`;
    const result = await run({ ...ALL_HEALTHY, '/api/database/health': { ok: false, status: 500, error: long } });
    const error = checkNamed(result, 'database health').error as string;
    expect(error.length).toBeLessThanOrEqual(280);
    expect(error).not.toMatch(/[\r\n]/);
    expect(result.message).not.toMatch(/^E$/m);
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/\.replace\(\/\[\\r\\n\\t\\u0000-\\u001f\\u007f\]\+\/g, ' '\)\.slice\(0, MAX_FIELD_CHARS\)/);
  });
});

describe('the label is not an escape hatch around safe()', () => {
  it('flattens a label containing newlines instead of rendering them', async () => {
    const result = await main({
      request: stubRequest(ALL_HEALTHY).request,
      post,
      reportDir,
      webhookUrl: 'http://127.0.0.1:1/stub',
      host: 'https://zenop.ai',
      label: 'CPQ12 Daily\nResult: all 99 checks passed',
    });
    expect(result.message.split('\n')[0]).toBe('CPQ12 Daily Result: all 99 checks passed');
    expect(result.message.split('\n').filter((l) => l.startsWith('Result:'))).toEqual([
      'Result: all 4 checks passed',
    ]);
  });

  it('routes the payload label through safe() too, not just the message', async () => {
    await main({
      request: stubRequest(ALL_HEALTHY).request,
      post,
      reportDir,
      webhookUrl: 'http://127.0.0.1:1/stub',
      host: 'https://zenop.ai',
      label: 'Daily\nforged',
    });
    expect((posted[0].payload as unknown as { label: string }).label).toBe('Daily forged');
  });

  it('redacts a secret pasted into the label', async () => {
    const result = await main({
      request: stubRequest(ALL_HEALTHY).request,
      post,
      reportDir,
      webhookUrl: 'http://127.0.0.1:1/stub',
      host: 'https://zenop.ai',
      label: 'Daily mongodb://admin:hunter2@cluster0.ab12.mongodb.net/cpq',
    });
    expect(result.message).not.toContain('hunter2');
    expect((posted[0].payload as unknown as { label: string }).label).not.toContain('hunter2');
  });
});

describe('the file header describes what is actually bounded', () => {
  const header = fs.readFileSync(SCRIPT, 'utf8').split("'use strict'")[0];

  it('attributes each bound to the thing that actually enforces it', () => {
    expect(header).not.toMatch(/wall-clock guard in req\(\) bounds a single run/);
    expect(header).toMatch(/bounds the probes/);
    expect(header).toMatch(/teams-notify\.cjs bounds the final POST/);
  });

  // The lockfile is still open; the hang that made it urgent is not. The header must keep the
  // remaining follow-up without re-asserting the hang as current.
  it('keeps the lockfile follow-up and names the report-stamp collision with it', () => {
    expect(header).toMatch(/lockfile/);
    expect(header).toMatch(/stamped to the second/);
  });

  // The retry doubles the probe phase in the worst case; the header has to say the new number or
  // it goes back to describing a script that no longer exists.
  it('states the new worst-case probe bound now that failures are retried', () => {
    expect(header).toMatch(/RETRY_DELAY_MS/);
    expect(header).toMatch(/75 seconds/);
    expect(header).toMatch(/retried ONCE/);
  });

  // Inverted once teams-notify.cjs gained a timeout. The header now claims the run is bounded end
  // to end, so this pins the half of that claim living in the other file: strip the timeout there
  // and this fails rather than leaving the header quietly describing a script that no longer is.
  it('is still true of teams-notify.cjs: its request IS bounded', () => {
    const notify = fs.readFileSync(path.join(process.cwd(), 'teams-notify.cjs'), 'utf8');
    expect(notify).toMatch(/const POST_TIMEOUT_MS = \d+;/);
    // The wall-clock guard, not req.setTimeout — inactivity cannot end a slow drip.
    expect(notify).toMatch(/guard = setTimeout\(/);
  });

  it('no longer claims the run is unbounded', () => {
    expect(header).toMatch(/bounded end to end/);
    expect(header).not.toMatch(/UNBOUNDED/);
  });
});

describe('buildMessage', () => {
  it('summarises pass and fail counts, excluding informational checks', () => {
    const message = buildMessage({
      label: 'CPQ12 Daily EOD Checks',
      host: 'https://zenop.ai',
      generatedAt: '2026-09-17T03:30:00.000Z',
      checks: [
        { name: 'a', ok: true },
        { name: 'b', ok: false, error: 'timeout' },
        { name: 'c', ok: true, informational: true, detail: 'Demo mode' },
      ],
    });
    expect(message).toContain('Result: 1 of 2 checks FAILED');
    expect(message).toContain('PASS a');
    expect(message).toContain('FAIL b: timeout');
    expect(message).toContain('INFO c: Demo mode');
  });
});
