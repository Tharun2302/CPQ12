import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - CommonJS module, no type declarations
import teamsNotify from '../../teams-notify.cjs';

const { postToTeams } = teamsNotify as { postToTeams: (url: string, payload: unknown) => Promise<boolean> };

// =============================================================================
// Extraction regression guard: neither caller should carry its own copy any more.
// =============================================================================
describe('extraction — monitor-user-logs.cjs and monitor-commits.cjs no longer duplicate postToTeams', () => {
  it('both files import postToTeams from teams-notify.cjs and define it nowhere themselves', () => {
    const userLogs = fs.readFileSync(path.join(process.cwd(), 'monitor-user-logs.cjs'), 'utf8');
    const commits = fs.readFileSync(path.join(process.cwd(), 'monitor-commits.cjs'), 'utf8');
    for (const src of [userLogs, commits]) {
      expect(src).toMatch(/require\(['"]\.\/teams-notify\.cjs['"]\)/);
      expect(src).not.toMatch(/function postToTeams/);
    }
  });
});

// =============================================================================
// postToTeams behavior
// =============================================================================
describe('postToTeams', () => {
  it('resolves false and logs, without throwing, when the URL is empty', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(postToTeams('', { message: 'x' })).resolves.toBe(false);
    expect(log.mock.calls.flat().join(' ')).toContain('No TEAMS_WEBHOOK_URL set');
    log.mockRestore();
  });

  it('resolves false, without throwing, for an invalid URL', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(postToTeams('not-a-url', { message: 'x' })).resolves.toBe(false);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('resolves false for a connection failure (nothing listening)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(postToTeams('http://127.0.0.1:1', { message: 'x' })).resolves.toBe(false);
    err.mockRestore();
  });

  describe('against a real local HTTP server', () => {
    let server: http.Server;
    let received: { body: string; port: number | null } = { body: '', port: null };
    let baseUrl = '';
    let statusToReturn = 202;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
          received.body = body;
          res.writeHead(statusToReturn, { 'Content-Type': 'application/json' });
          res.end('{}');
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}/webhook`;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it('POSTs the JSON payload and resolves true on a 2xx response', async () => {
      statusToReturn = 200;
      const payload = { message: 'hello from the test', commitCount: 3 };
      await expect(postToTeams(baseUrl, payload)).resolves.toBe(true);
      expect(JSON.parse(received.body)).toEqual(payload);
    });

    it('resolves false on a non-2xx response', async () => {
      statusToReturn = 500;
      await expect(postToTeams(baseUrl, { message: 'x' })).resolves.toBe(false);
    });

    it('honors an explicit port in the webhook URL (the fix monitor-commits.cjs gains)', async () => {
      statusToReturn = 200;
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      await expect(postToTeams(`http://127.0.0.1:${port}/webhook`, { message: 'port-check' })).resolves.toBe(true);
      expect(JSON.parse(received.body)).toEqual({ message: 'port-check' });
    });
  });
});

// =============================================================================
// Timeout: a webhook that accepts the socket and never answers must not hang the
// caller. Before this, postToTeams had an 'error' handler but no time limit, so a
// stalled Power Automate endpoint left the cron job running forever with no alert
// sent — the silent-failure mode the monitors exist to avoid.
// =============================================================================
describe('postToTeams — a stalled webhook cannot hang the caller', () => {
  it('resolves false when the server accepts the request and never responds', async () => {
    const sockets: import('node:net').Socket[] = [];
    const server = http.createServer(() => { /* deliberately never responds */ });
    server.on('connection', (s) => sockets.push(s));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = Date.now();
    const result = await postToTeams(`http://127.0.0.1:${port}/webhook`, { message: 'x' }, { timeoutMs: 300 });
    const elapsed = Date.now() - started;

    expect(result).toBe(false);
    expect(elapsed).toBeLessThan(3000);
    expect(err.mock.calls.flat().join(' ')).toContain('timeout');
    err.mockRestore();
    sockets.forEach((s) => s.destroy());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('resolves false for a slow drip that keeps resetting the socket-inactivity timer', async () => {
    const timers: NodeJS.Timeout[] = [];
    const sockets: import('node:net').Socket[] = [];
    // Writes forever, well inside the timeout, so only the wall-clock guard can end this.
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      timers.push(setInterval(() => res.write(' '), 20));
    });
    server.on('connection', (s) => sockets.push(s));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = Date.now();
    const result = await postToTeams(`http://127.0.0.1:${port}/webhook`, { message: 'x' }, { timeoutMs: 300 });
    const elapsed = Date.now() - started;

    expect(result).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(3000);
    err.mockRestore();
    timers.forEach((t) => clearInterval(t));
    sockets.forEach((s) => s.destroy());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('settles exactly once — a timeout followed by socket teardown does not double-resolve', async () => {
    const sockets: import('node:net').Socket[] = [];
    const server = http.createServer(() => { /* never responds */ });
    server.on('connection', (s) => sockets.push(s));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await expect(
      postToTeams(`http://127.0.0.1:${port}/webhook`, { message: 'x' }, { timeoutMs: 200 }),
    ).resolves.toBe(false);
    await new Promise((r) => setTimeout(r, 200));

    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
    err.mockRestore();
    sockets.forEach((s) => s.destroy());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // All four callers, not three: commit-explain.cjs runs from a git hook and is the one whose
  // own 20s watchdog constrains POST_TIMEOUT_MS, so leaving it out of this loop was the gap that
  // let the ceiling be picked without it.
  it('production callers pass no options, so they get the hardcoded ceiling', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'teams-notify.cjs'), 'utf8');
    expect(src).toMatch(/const POST_TIMEOUT_MS = \d+;/);
    for (const caller of ['monitor-user-logs.cjs', 'monitor-commits.cjs',
      'monitor-daily-checks.cjs', 'commit-explain.cjs']) {
      const callerSrc = fs.readFileSync(path.join(process.cwd(), caller), 'utf8');
      expect(callerSrc).toMatch(/require\(['"]\.\/teams-notify\.cjs['"]\)/);
      // Not `[^)]*` — that cannot cross a nested call like postToTeams(url, build(x), {...}),
      // so a real misuse slipped through and the test passed anyway.
      expect(callerSrc).not.toMatch(/postToTeams\([\s\S]{0,200}?timeoutMs/);
    }
  });

  // The bound is enforced by the wall-clock guard alone. Pinning req.setTimeout instead would
  // fail the build for anyone who correctly removed that dead timer.
  it('bounds the attempt with a wall-clock guard, not socket inactivity', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'teams-notify.cjs'), 'utf8');
    expect(src).toMatch(/guard = setTimeout\(/);
    expect(src).not.toMatch(/req\.setTimeout\(/);
  });

  it('stays under the git-hook watchdog that commit-explain.cjs exits on', () => {
    const notify = fs.readFileSync(path.join(process.cwd(), 'teams-notify.cjs'), 'utf8');
    const hook = fs.readFileSync(path.join(process.cwd(), 'commit-explain.cjs'), 'utf8');
    const ceiling = Number(/const POST_TIMEOUT_MS = (\d+);/.exec(notify)?.[1]);
    const watchdog = Number(/COMMIT_EXPLAIN_HARD_TIMEOUT_MS', (\d+)/.exec(hook)?.[1]);
    expect(Number.isFinite(ceiling)).toBe(true);
    expect(Number.isFinite(watchdog)).toBe(true);
    // The post is that script's last step; it must not be able to consume the whole budget.
    expect(ceiling).toBeLessThanOrEqual(watchdog / 2);
  });
});
