import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

// getContainerLogs() returned [] on every failure, so main() computed
// healthy = (bugCount === 0 && userCount === 0) = true and sent "✅ HEALTHY — All working good".
// Three routes were confirmed on production: docker exit 1 (No such container), docker exit 2
// with nothing on stderr, and an unparseable DOCKER_MAX_BUFFER_BYTES. The real reason reached
// only console.error -> cron mail, which is the channel that let the original stderr bug survive
// for months. These tests pin the distinction between "scanned clean" and "could not scan".
//
// The webhook is a local stub on 127.0.0.1 and MONITOR_ENV_FILE points at a path that does not
// exist, so the loader cannot refill TEAMS_WEBHOOK_URL from /root/.cpq-monitor/monitor.env.

const SCRIPT = path.join(process.cwd(), 'monitor-user-logs.cjs');
const PRELOAD = path.join(process.cwd(), 'tests/helpers/fakeDockerPreload.cjs');

// The five keys the live "CPQ Server Alerts" Power Automate flow reads. Adding keys is safe;
// renaming, retyping or removing one of these is not.
const CONTRACT_KEYS = ['message', 'bugCount', 'userCount', 'generatedAt', 'healthy'] as const;

type Payload = {
  message: string; bugCount: number; userCount: number; generatedAt: string;
  healthy: boolean; scanOk: boolean; scanError: string | null; aiStatus: string;
};

let server: http.Server;
let webhookUrl = '';
let received: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      received.push(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  webhookUrl = `http://127.0.0.1:${port}/webhook`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('a scan that could not run is never reported as healthy', () => {
  let dir = '';
  let reports = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-degraded-'));
    reports = path.join(dir, 'reports');
    received = [];
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const fixture = (name: string, lines: string[]) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, lines.length ? lines.join('\n') + '\n' : '');
    return file;
  };

  const run = (env: Record<string, string>) => new Promise<{ code: number; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ['--require', PRELOAD, SCRIPT], {
      env: {
        ...process.env,
        MONITOR_ENV_FILE: path.join(dir, 'absent.env'),
        REPORT_DIR: reports,
        MONITOR_LOG_FILE: '',
        TEAMS_WEBHOOK_URL: webhookUrl,
        SCAN_WINDOW_MINUTES: '16',
        CPQ_CONTAINER: 'cpq-application',
        FAKE_DOCKER_STDOUT_FILE: '', FAKE_DOCKER_STDERR_FILE: '',
        FAKE_DOCKER_STDOUT_FILLER: '', FAKE_DOCKER_STDERR_FILLER: '',
        FAKE_DOCKER_EXIT: '0',
        DOCKER_MAX_BUFFER_BYTES: '',
        AI_PROVIDER: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
        AI_FIXTURE_FILE: '', AI_DRY_RUN: '', STATE_FILE: '', FORCE_ALERT: '',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code: code === null ? -1 : code, stderr }));
  });

  const payload = (): Payload => {
    expect(received).toHaveLength(1);
    return JSON.parse(received[0]) as Payload;
  };

  const failures: Array<[string, () => Record<string, string>]> = [
    ['docker exits 1 with a reason on stderr', () => ({
      FAKE_DOCKER_EXIT: '1',
      FAKE_DOCKER_STDERR_FILE: fixture('cli.txt', ['Error: No such container: cpq-application']),
    })],
    ['docker exits 2 with nothing on stderr at all', () => ({ FAKE_DOCKER_EXIT: '2' })],
    ['the output overruns the configured buffer', () => ({
      DOCKER_MAX_BUFFER_BYTES: String(1024 * 1024),
      FAKE_DOCKER_STDERR_FILLER: String(2 * 1024 * 1024),
    })],
    ['MONITOR_LOG_FILE is set but unreadable', () => ({
      MONITOR_LOG_FILE: path.join(dir, 'nope.txt'),
    })],
  ];

  it.each(failures)('posts MONITOR DEGRADED, not HEALTHY, when %s', async (_name, makeEnv) => {
    const { code } = await run(makeEnv());
    expect(code).toBe(0);
    const body = payload();
    expect(body.message).toContain('MONITOR DEGRADED');
    expect(body.message).not.toContain('All working good');
    expect(body.message).not.toContain('HEALTHY');
    expect(body.healthy).toBe(false);
    expect(body.scanOk).toBe(false);
    expect(body.aiStatus).toBe('failed_log_read');
    expect(typeof body.scanError).toBe('string');
    expect((body.scanError as string).length).toBeGreaterThan(0);
  }, 30000);

  it.each(failures)('keeps every key of the Power Automate contract when %s', async (_name, makeEnv) => {
    await run(makeEnv());
    const body = payload() as unknown as Record<string, unknown>;
    for (const key of CONTRACT_KEYS) expect(body).toHaveProperty(key);
    expect(typeof body.message).toBe('string');
    expect(typeof body.bugCount).toBe('number');
    expect(typeof body.userCount).toBe('number');
    expect(typeof body.generatedAt).toBe('string');
    expect(typeof body.healthy).toBe('boolean');
  }, 30000);

  it('says why in the report as well as in the alert', async () => {
    await run({
      FAKE_DOCKER_EXIT: '1',
      FAKE_DOCKER_STDERR_FILE: fixture('cli.txt', ['Error: No such container: cpq-application']),
    });
    const files = fs.readdirSync(reports);
    expect(files).toHaveLength(1);
    const report = fs.readFileSync(path.join(reports, files[0]), 'utf8');
    expect(report).toContain('Scan status: DEGRADED');
    expect(report).toContain('No such container');
  }, 30000);

  it('still reports healthy when the scan genuinely ran and found nothing', async () => {
    const { code } = await run({
      FAKE_DOCKER_STDOUT_FILE: fixture('out.txt', [
        '{"timestamp":"2026-09-10T10:00:00.000Z","level":"info","source":"server","message":"all good"}',
      ]),
    });
    expect(code).toBe(0);
    const body = payload();
    expect(body.healthy).toBe(true);
    expect(body.scanOk).toBe(true);
    expect(body.scanError).toBeNull();
    expect(body.message).toContain('HEALTHY');
    expect(body.aiStatus).toBe('skipped_clean');
  }, 30000);

  // QA LOW-1: `docker logs` can hit a corrupt log segment, print its own diagnostic on stderr and
  // still exit 0. Pre-fix that text was classified as an application error — a manufactured bug,
  // the exact failure mode the first pass's own rationale warned about on the other branch.
  it('does not turn a docker stream error on the success path into a fake application bug', async () => {
    const { code } = await run({
      FAKE_DOCKER_EXIT: '0',
      FAKE_DOCKER_STDERR_FILE: fixture('cli.txt', [
        'error from daemon in stream: Error grabbing logs: invalid character',
      ]),
    });
    expect(code).toBe(0);
    const body = payload();
    expect(body.bugCount).toBe(0);
    expect(body.userCount).toBe(0);
    expect(body.scanOk).toBe(false);
    expect(body.healthy).toBe(false);
    expect(body.message).toContain('MONITOR DEGRADED');
    expect(body.scanError).toContain('error from daemon in stream');
  }, 30000);

  it('still shows the application lines it did manage to read on a partial scan', async () => {
    const real = '{"timestamp":"2026-09-10T10:00:05.000Z","level":"error","source":"server",'
      + '"message":"ECONNREFUSED connecting to the pricing service"}';
    const { code } = await run({
      FAKE_DOCKER_EXIT: '0',
      FAKE_DOCKER_STDERR_FILE: fixture('cli.txt', [
        'error grabbing logs: invalid character',
        real,
      ]),
    });
    expect(code).toBe(0);
    const body = payload();
    expect(body.bugCount).toBe(1);
    expect(body.scanOk).toBe(false);
    expect(body.message).toContain('ECONNREFUSED connecting to the pricing service');
    // The CLI text is the Reason line, never a bullet in the error list.
    expect(body.message).not.toContain('• error grabbing logs');
  }, 30000);
});

// The alert samples only the first MAX_SAMPLE_LINES lines, so merge order decides what a human
// sees. With stdout first, 14 lines of routine stdout noise pushed the one real stderr error out
// of the message entirely. This is the live path whenever the AI layer is off, skipped or failing.
describe('stderr comes first in the merge so a real error is never crowded out', () => {
  let dir = '';
  let received2: string[] = [];
  let server2: http.Server;
  let url2 = '';

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-order-'));
    received2 = [];
    server2 = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => { received2.push(body); res.writeHead(200); res.end('{}'); });
    });
    await new Promise<void>((resolve) => server2.listen(0, '127.0.0.1', resolve));
    const address = server2.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    url2 = `http://127.0.0.1:${port}/webhook`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server2.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the one stderr error in the alert behind 14 stdout noise lines', async () => {
    const noise = Array.from({ length: 14 }, (_, i) => JSON.stringify({
      timestamp: '2026-09-10T10:00:00.000Z', level: 'error', source: 'server',
      message: `forcesave error ignored for document ${i}`,
    }));
    const real = JSON.stringify({
      timestamp: '2026-09-10T10:00:20.000Z', level: 'error', source: 'server',
      message: 'MongoError: topology was destroyed',
    });
    const out = path.join(dir, 'out.txt');
    const err = path.join(dir, 'err.txt');
    fs.writeFileSync(out, noise.join('\n') + '\n');
    fs.writeFileSync(err, real + '\n');

    const code = await new Promise<number>((resolve) => {
      const child = spawn(process.execPath, ['--require', PRELOAD, SCRIPT], {
        env: {
          ...process.env,
          MONITOR_ENV_FILE: path.join(dir, 'absent.env'),
          REPORT_DIR: path.join(dir, 'reports'),
          MONITOR_LOG_FILE: '',
          TEAMS_WEBHOOK_URL: url2,
          FAKE_DOCKER_STDOUT_FILE: out,
          FAKE_DOCKER_STDERR_FILE: err,
          FAKE_DOCKER_STDOUT_FILLER: '', FAKE_DOCKER_STDERR_FILLER: '',
          FAKE_DOCKER_EXIT: '0', DOCKER_MAX_BUFFER_BYTES: '',
          AI_PROVIDER: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
          AI_FIXTURE_FILE: '', AI_DRY_RUN: '', STATE_FILE: '', FORCE_ALERT: '',
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      child.stderr.resume();
      child.on('close', (c) => resolve(c === null ? -1 : c));
    });

    expect(code).toBe(0);
    expect(received2).toHaveLength(1);
    const body = JSON.parse(received2[0]) as Payload;
    expect(body.bugCount).toBe(15);
    expect(body.message).toContain('MongoError: topology was destroyed');
  }, 30000);
});
