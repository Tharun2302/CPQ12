import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

// The suite is organised around explainErrors(), so it structurally cannot see a failure that
// happens in main() after that call returns — which is exactly where the render crash lived.
// These tests assert the one invariant the cron job actually depends on: whatever the state of
// the inputs, the script posts to Teams and exits 0.
//
// The webhook is a local stub on 127.0.0.1. No external call is made and nothing is spent.

const SCRIPT = path.join(process.cwd(), 'monitor-user-logs.cjs');
const LOG_FIXTURE = path.join(process.cwd(), 'tests/fixtures/monitorLogSample.txt');
const OPENAI_FIXTURE = path.join(process.cwd(), 'tests/fixtures/openaiResponse.json');

type Posted = { body: string };

let server: http.Server;
let webhookUrl = '';
let received: Posted[] = [];

const GOOD_EXPLANATION = {
  id: 'e1', whatBroke: 'A job failed.', likelyCause: 'Atlas unreachable.', affectedArea: 'e-signature',
  severity: 'high', nextStep: 'Check the access list.', confidence: 'high',
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      received.push({ body });
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

describe('cron safety: the script always posts and always exits 0', () => {
  let dir = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-cron-'));
    received = [];
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const run = (env: Record<string, string>) => new Promise<{ code: number; stderr: string; stdout: string }>((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        MONITOR_ENV_FILE: path.join(dir, 'absent.env'),
        REPORT_DIR: path.join(dir, 'reports'),
        MONITOR_LOG_FILE: LOG_FIXTURE,
        TEAMS_WEBHOOK_URL: webhookUrl,
        AI_PROVIDER: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        AI_MODEL: '',
        AI_BASE_URL: '',
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

  const stateWith = (explanation: unknown) => {
    const file = path.join(dir, 'state.json');
    fs.writeFileSync(file, JSON.stringify({
      aiCallsToday: 0,
      aiCallsDate: new Date().toISOString().slice(0, 10),
      cache: {
        '❌ e-sign expiry reminder job failed: getaddrinfo enotfound <mongohost>': {
          explanation, cachedAt: new Date().toISOString(), provider: 'openai', model: 'gpt-5.6-terra',
        },
      },
    }));
    return file;
  };

  const scenarios: Array<[string, () => Record<string, string>]> = [
    ['the AI layer is off', () => ({})],
    ['a healthy fixture response', () => ({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_FIXTURE_FILE: OPENAI_FIXTURE, AI_MAX_GROUPS: '2',
    })],
    ['the state file is corrupt', () => {
      const file = path.join(dir, 'corrupt.json');
      fs.writeFileSync(file, '{not json at all');
      return { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', STATE_FILE: file, AI_FIXTURE_FILE: OPENAI_FIXTURE, AI_MAX_GROUPS: '2' };
    }],
    ['a cached explanation has a numeric severity', () => ({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_MAX_GROUPS: '1', AI_CACHE_TTL_MIN: '10000',
      STATE_FILE: stateWith({ ...GOOD_EXPLANATION, severity: 123 }),
    })],
    ['a cached explanation is missing every field', () => ({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_MAX_GROUPS: '1', AI_CACHE_TTL_MIN: '10000',
      STATE_FILE: stateWith({ id: 'e1' }),
    })],
    ['a cached explanation is null', () => ({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_MAX_GROUPS: '1', AI_CACHE_TTL_MIN: '10000',
      STATE_FILE: stateWith(null),
    })],
    ['the fixture file does not exist', () => ({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_FIXTURE_FILE: path.join(dir, 'nope.json'),
    })],
    ['the provider name is unknown', () => ({ AI_PROVIDER: 'gemini', OPENAI_API_KEY: 'sk-test' })],
    ['the key is missing', () => ({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '' })],
    ['the base URL is a metadata endpoint', () => ({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_BASE_URL: 'http://169.254.169.254/latest/meta-data',
    })],
    ['the base URL is unparseable', () => ({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_BASE_URL: 'nonsense' })],
    ['the group cap is zero', () => ({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_MAX_GROUPS: '0' })],
    ['the state file path is a directory', () => ({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', STATE_FILE: dir, AI_FIXTURE_FILE: OPENAI_FIXTURE, AI_MAX_GROUPS: '2',
    })],
    ['the report directory cannot be created', () => ({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', REPORT_DIR: path.join(LOG_FIXTURE, 'not-a-dir'),
    })],
    ['dry-run mode is on', () => ({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_DRY_RUN: '1' })],
  ];

  it.each(scenarios)('exits 0 and posts a well-formed alert when %s', async (_name, makeEnv) => {
    const { code, stderr } = await run(makeEnv());
    expect(stderr).not.toContain('FATAL');
    expect(code).toBe(0);
    expect(received).toHaveLength(1);
    const payload = JSON.parse(received[0].body);
    for (const key of ['message', 'bugCount', 'userCount', 'generatedAt', 'healthy']) {
      expect(payload).toHaveProperty(key);
    }
    expect(typeof payload.message).toBe('string');
    expect(payload.message.length).toBeGreaterThan(0);
    expect(typeof payload.bugCount).toBe('number');
    expect(typeof payload.healthy).toBe('boolean');
  }, 30000);

  it('never leaks the API key to the webhook, the report or stdio', async () => {
    const key = 'sk-cron-safety-sentinel-0123456789';
    const reports = path.join(dir, 'reports');
    const { code, stdout, stderr } = await run({
      AI_PROVIDER: 'openai', OPENAI_API_KEY: key, AI_FIXTURE_FILE: OPENAI_FIXTURE,
      AI_MAX_GROUPS: '2', REPORT_DIR: reports, STATE_FILE: path.join(dir, 'state.json'),
    });
    expect(code).toBe(0);
    expect(received[0].body).not.toContain(key);
    expect(stdout).not.toContain(key);
    expect(stderr).not.toContain(key);
    for (const file of fs.readdirSync(reports)) {
      expect(fs.readFileSync(path.join(reports, file), 'utf8')).not.toContain(key);
    }
    expect(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')).not.toContain(key);
  }, 30000);

  it('reports healthy and still posts when the scan is clean', async () => {
    const clean = path.join(dir, 'clean.txt');
    fs.writeFileSync(clean, '{"timestamp":"2026-09-10T00:00:00.000Z","level":"info","source":"server","message":"all good"}\n');
    const { code } = await run({ MONITOR_LOG_FILE: clean, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' });
    expect(code).toBe(0);
    const payload = JSON.parse(received[0].body);
    expect(payload.healthy).toBe(true);
    expect(payload.aiStatus).toBe('skipped_clean');
  }, 30000);
});
