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
