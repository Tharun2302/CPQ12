import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

// getContainerLogs() used execFileSync, which returns stdout only and forwards the child's stderr
// to the parent. The cpq-application container writes its "level":"error" lines to stderr, so on
// production a 24-hour scan reported 6 info-level hits and zero errors while two real CORS errors
// printed loose on the terminal. These tests lock in that both streams are scanned, that a docker
// CLI failure is never parsed as a log line, and that the buffer limit is loud rather than silent.
//
// The docker binary is stubbed by a --require preload that redirects only the binary name, so the
// real spawnSync still does the buffering. No docker binary and no container are involved, and the
// webhook is a local stub on 127.0.0.1.

const SCRIPT = path.join(process.cwd(), 'monitor-user-logs.cjs');
const PRELOAD = path.join(process.cwd(), 'tests/helpers/fakeDockerPreload.cjs');
const LOG_FIXTURE = path.join(process.cwd(), 'tests/fixtures/monitorLogSample.txt');

const ONE_MB = 1024 * 1024;

const STDOUT_LINES = [
  '{"timestamp":"2026-09-10T10:00:01.000Z","level":"info","source":"server","message":"stdout heartbeat one"}',
  '{"timestamp":"2026-09-10T10:00:02.000Z","level":"error","source":"server","message":"stdout TypeError: quote total is not a function"}',
  '{"timestamp":"2026-09-10T10:00:03.000Z","level":"error","source":"server","message":"stdout MongoError: topology was destroyed"}',
  '{"timestamp":"2026-09-10T10:00:04.000Z","level":"warn","source":"server","message":"stdout Invalid email or password for user 42"}',
];
const STDERR_LINES = [
  '{"timestamp":"2026-09-10T10:00:05.000Z","level":"error","source":"server","message":"stderr Error: Not allowed by CORS: https://167.71.227.231"}',
  '{"timestamp":"2026-09-10T10:00:06.000Z","level":"error","source":"server","message":"stderr ECONNREFUSED connecting to the pricing service"}',
  '{"timestamp":"2026-09-10T10:00:07.000Z","level":"warn","source":"server","message":"stderr token expired for session abc"}',
  '{"timestamp":"2026-09-10T10:00:08.000Z","level":"info","source":"server","message":"stderr heartbeat two"}',
];

type Payload = {
  message: string; bugCount: number; userCount: number; healthy: boolean; aiStatus: string;
  scanOk: boolean; scanError: string | null; generatedAt: string;
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

describe('getContainerLogs: docker stdout and stderr are both scanned', () => {
  let dir = '';
  let reports = '';
  let callFile = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-dockerlogs-'));
    reports = path.join(dir, 'reports');
    callFile = path.join(dir, 'docker-calls.jsonl');
    received = [];
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const fixture = (name: string, lines: string[]) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, lines.length ? lines.join('\n') + '\n' : '');
    return file;
  };

  const run = (env: Record<string, string>) => new Promise<{ code: number; stderr: string; stdout: string }>((resolve) => {
    const child = spawn(process.execPath, ['--require', PRELOAD, SCRIPT], {
      env: {
        ...process.env,
        MONITOR_ENV_FILE: path.join(dir, 'absent.env'),
        REPORT_DIR: reports,
        // Empty, not unset: the docker path is the code under test.
        MONITOR_LOG_FILE: '',
        TEAMS_WEBHOOK_URL: webhookUrl,
        SCAN_WINDOW_MINUTES: '64',
        CPQ_CONTAINER: 'cpq-application',
        FAKE_DOCKER_CALL_FILE: callFile,
        FAKE_DOCKER_STDOUT_FILE: '',
        FAKE_DOCKER_STDERR_FILE: '',
        FAKE_DOCKER_STDOUT_FILLER: '',
        FAKE_DOCKER_STDERR_FILLER: '',
        FAKE_DOCKER_EXIT: '0',
        DOCKER_MAX_BUFFER_BYTES: '',
        AI_PROVIDER: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        AI_FIXTURE_FILE: '',
        AI_DRY_RUN: '',
        STATE_FILE: '',
        FORCE_ALERT: '',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code: code === null ? -1 : code, stdout, stderr }));
  });

  const payload = (): Payload => {
    expect(received).toHaveLength(1);
    return JSON.parse(received[0]) as Payload;
  };

  const reportText = () => {
    const files = fs.readdirSync(reports);
    expect(files).toHaveLength(1);
    return fs.readFileSync(path.join(reports, files[0]), 'utf8');
  };

  const dockerCalls = () => (fs.existsSync(callFile)
    ? fs.readFileSync(callFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : []);

  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it('scans error lines the container writes to stderr only', async () => {
    const { code, stderr } = await run({
      FAKE_DOCKER_STDERR_FILE: fixture('stderr.txt', [STDERR_LINES[0], STDERR_LINES[1]]),
    });
    expect(stderr).not.toContain('FATAL');
    expect(code).toBe(0);
    const body = payload();
    expect(body.bugCount).toBe(2);
    expect(body.healthy).toBe(false);
    expect(body.scanOk).toBe(true);
    // The Teams payload is redacted; the on-box report keeps the raw address for diagnosis.
    expect(body.message).toContain('Not allowed by CORS: https://[IP]');
    expect(body.message).not.toContain('167.71.227.231');
    expect(body.message).toContain('ECONNREFUSED connecting to the pricing service');
    expect(reportText()).toContain('Not allowed by CORS: https://167.71.227.231');
  }, 30000);

  it('merges stdout and stderr without dropping or duplicating a line', async () => {
    const { code } = await run({
      FAKE_DOCKER_STDOUT_FILE: fixture('stdout.txt', STDOUT_LINES),
      FAKE_DOCKER_STDERR_FILE: fixture('stderr.txt', STDERR_LINES),
    });
    expect(code).toBe(0);
    const body = payload();
    // Two generic errors per stream, one user-activity line per stream. A duplicated stream doubles these.
    expect(body.bugCount).toBe(4);
    expect(body.userCount).toBe(2);
    const report = reportText();
    for (const line of [...STDOUT_LINES, ...STDERR_LINES]) {
      const isNoise = line.includes('heartbeat');
      expect(occurrences(report, line)).toBe(isNoise ? 0 : 1);
    }
  }, 30000);

  it('passes the scan window through to docker unchanged', async () => {
    await run({ FAKE_DOCKER_STDERR_FILE: fixture('stderr.txt', [STDERR_LINES[0]]) });
    const calls = dockerCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['logs', '--since', '64m', 'cpq-application']);
    expect(calls[0].encoding).toBe('utf8');
  }, 30000);

  it('returns no lines and never parses the CLI error text when docker exits non-zero', async () => {
    const { code, stderr } = await run({
      FAKE_DOCKER_STDERR_FILE: fixture('stderr.txt', ['Error: No such container: cpq-application']),
      FAKE_DOCKER_EXIT: '1',
    });
    expect(stderr).not.toContain('FATAL');
    expect(code).toBe(0);
    const body = payload();
    expect(body.bugCount).toBe(0);
    expect(body.userCount).toBe(0);
    // "could not scan" is NOT "scanned clean". The old assertion here codified the false green.
    expect(body.healthy).toBe(false);
    expect(body.scanOk).toBe(false);
    expect(body.aiStatus).toBe('failed_log_read');
    expect(body.message).toContain('MONITOR DEGRADED');
    expect(body.message).not.toContain('All working good');
    expect(body.scanError).toContain('docker logs exited 1');
    // The CLI text still must not be parsed as an application log line.
    expect(body.message).not.toContain('❌');
    // The reason still has to be visible to whoever reads the cron mail.
    expect(stderr).toContain('Failed to read docker logs for cpq-application');
    expect(stderr).toContain('docker logs exited 1');
    expect(stderr).toContain('No such container');
    expect(reportText()).toContain('--- Generic bug lines (why) ---\n(none)');
  }, 30000);

  it('bounds the docker buffer well above 1 MB and well below the droplet RAM', async () => {
    await run({ FAKE_DOCKER_STDERR_FILE: fixture('stderr.txt', [STDERR_LINES[0]]) });
    const call = dockerCalls()[0];
    // maxBuffer is per stream, so the real ceiling is twice this on a 1 GB box.
    expect(call.maxBuffer).toBeGreaterThan(ONE_MB);
    expect(call.maxBuffer).toBeLessThanOrEqual(16 * ONE_MB);
    expect(call.timeout).toBeGreaterThan(0);
    expect(call.timeout).toBeLessThanOrEqual(600000);
  }, 30000);

  it('scans a stream larger than the 1 MB spawnSync default', async () => {
    const { code, stderr } = await run({
      FAKE_DOCKER_STDOUT_FILE: fixture('stdout.txt', [STDOUT_LINES[1], STDOUT_LINES[2]]),
      FAKE_DOCKER_STDERR_FILE: fixture('stderr.txt', [STDERR_LINES[0], STDERR_LINES[1]]),
      FAKE_DOCKER_STDOUT_FILLER: String(1_600_000),
      FAKE_DOCKER_STDERR_FILLER: String(1_600_000),
    });
    expect(code).toBe(0);
    expect(stderr).not.toContain('ENOBUFS');
    const body = payload();
    expect(body.bugCount).toBe(4);
    expect(body.message).toContain('Not allowed by CORS: https://[IP]');
  }, 60000);

  it('fails loudly and scans nothing when the configured buffer is exceeded', async () => {
    const { code, stderr } = await run({
      DOCKER_MAX_BUFFER_BYTES: String(ONE_MB),
      FAKE_DOCKER_STDERR_FILE: fixture('stderr.txt', STDERR_LINES),
      FAKE_DOCKER_STDERR_FILLER: String(2 * ONE_MB),
    });
    expect(stderr).not.toContain('FATAL');
    expect(code).toBe(0);
    expect(stderr).toContain('Failed to read docker logs for cpq-application');
    expect(stderr).toContain('ENOBUFS');
    const body = payload();
    // Truncated output must not be scanned at all: a half-line would be a new blind spot.
    expect(body.bugCount).toBe(0);
    // ...and it must not be reported as healthy either.
    expect(body.healthy).toBe(false);
    expect(body.scanOk).toBe(false);
    expect(body.message).toContain('MONITOR DEGRADED');
    expect(body.message).not.toContain('Not allowed by CORS');
    expect(body.message).not.toContain('filler padding line');
    expect(reportText()).not.toContain('filler padding line');
  }, 30000);

  it('leaves the MONITOR_LOG_FILE branch untouched: docker is never invoked', async () => {
    const { code } = await run({
      MONITOR_LOG_FILE: LOG_FIXTURE,
      FAKE_DOCKER_STDERR_FILE: fixture('stderr.txt', STDERR_LINES),
    });
    expect(code).toBe(0);
    expect(dockerCalls()).toHaveLength(0);
    const body = payload();
    // Hardcoded, not recomputed from classify()/NOISE_PATTERNS: derived counts cannot fail if
    // classification itself breaks. tests/fixtures/monitorLogSample.txt has 12 lines, 3 of them
    // "❌ Errors: 0" noise, 6 bug lines and 1 user-activity line.
    expect(body.bugCount).toBe(6);
    expect(body.userCount).toBe(1);
    expect(body.scanOk).toBe(true);
    expect(body.message).not.toContain('stderr Error: Not allowed by CORS');
  }, 30000);
});
