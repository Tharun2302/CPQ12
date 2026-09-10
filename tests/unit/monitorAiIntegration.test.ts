import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// The whole main() path, offline: log lines come from a file, the provider response comes from a
// fixture, and TEAMS_WEBHOOK_URL is unset so nothing is posted. No network call, no money spent.
const require = createRequire(import.meta.url);
const SCRIPT = path.join(process.cwd(), 'monitor-user-logs.cjs');
const LOG_FIXTURE = path.join(process.cwd(), 'tests/fixtures/monitorLogSample.txt');

type Payload = {
  message: string; bugCount: number; userCount: number; generatedAt: string; healthy: boolean;
  aiExplained: boolean; aiStatus: string; severity: string | null; aiSummary: string | null;
  errorGroups: number; aiProvider: string | null; aiModel: string | null;
};

const PROVIDERS: Array<[string, Record<string, string>, string]> = [
  ['openai', { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-key' }, 'tests/fixtures/openaiResponse.json'],
  ['anthropic', { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key' }, 'tests/fixtures/anthropicResponse.json'],
];

const AI_ENV_KEYS = [
  'AI_PROVIDER', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AI_MODEL', 'AI_BASE_URL', 'AI_AUTH_STYLE',
  'AI_FIXTURE_FILE', 'AI_DRY_RUN', 'AI_MAX_GROUPS', 'AI_MAX_CALLS_PER_DAY', 'AI_CACHE_TTL_MIN',
  'MONITOR_LOG_FILE', 'STATE_FILE', 'REPORT_DIR', 'TEAMS_WEBHOOK_URL', 'MONITOR_ENV_FILE', 'FORCE_ALERT',
];

describe('monitor main() — offline integration', () => {
  let dir = '';
  let saved: Record<string, string | undefined> = {};
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-monitor-int-'));
    saved = Object.fromEntries(AI_ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of AI_ENV_KEYS) delete process.env[k];
    // Point the env-file loader at nothing so a developer's real monitor.env can never leak in.
    process.env.MONITOR_ENV_FILE = path.join(dir, 'no-such.env');
    process.env.REPORT_DIR = path.join(dir, 'reports');
    process.env.MONITOR_LOG_FILE = LOG_FIXTURE;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    fs.rmSync(dir, { recursive: true, force: true });
    logSpy.mockRestore();
    errSpy.mockRestore();
    vi.resetModules();
  });

  const run = async (): Promise<Payload> => {
    delete require.cache[require.resolve(SCRIPT)];
    const mod = require(SCRIPT);
    return mod.main();
  };

  const latestReport = () => {
    const reportDir = process.env.REPORT_DIR as string;
    const files = fs.readdirSync(reportDir).sort();
    return fs.readFileSync(path.join(reportDir, files[files.length - 1]), 'utf8');
  };

  it('produces the pre-change payload and message when AI_PROVIDER is unset', async () => {
    const payload = await run();
    expect(payload.aiExplained).toBe(false);
    expect(payload.aiStatus).toBe('skipped_disabled');
    expect(payload.aiProvider).toBeNull();
    expect(payload.aiModel).toBeNull();
    expect(payload.severity).toBeNull();
    // Byte-identical to the old fallback: the header, then the two "(why)" sections of raw lines.
    expect(payload.message.startsWith('🔎 CPQ12 User & Error Monitor\n')).toBe(true);
    expect(payload.message).toContain('USER-ACTIVITY (why):');
    expect(payload.message).toContain('GENERIC ERRORS (why):');
    expect(payload.message).not.toContain('Explained by');
    expect(payload.message).not.toContain('Severity:');
  });

  it('keeps the five existing payload keys with their original types on every path', async () => {
    const off = await run();
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.AI_FIXTURE_FILE = path.join(process.cwd(), 'tests/fixtures/openaiResponse.json');
    process.env.AI_MAX_GROUPS = '2';
    const on = await run();
    for (const payload of [off, on]) {
      expect(typeof payload.message).toBe('string');
      expect(typeof payload.bugCount).toBe('number');
      expect(typeof payload.userCount).toBe('number');
      expect(typeof payload.generatedAt).toBe('string');
      expect(typeof payload.healthy).toBe('boolean');
    }
    expect(off.bugCount).toBe(on.bugCount);
    expect(off.userCount).toBe(on.userCount);
  });

  it('drops the "❌ Errors: 0" lines from bugCount', async () => {
    const payload = await run();
    expect(payload.bugCount).toBe(6);
    expect(payload.userCount).toBe(1);
    expect(payload.healthy).toBe(false);
  });

  it('reports healthy with no AI call on a clean scan', async () => {
    const clean = path.join(dir, 'clean.txt');
    fs.writeFileSync(clean, '{"timestamp":"t","level":"info","source":"s","message":"all good"}\n');
    process.env.MONITOR_LOG_FILE = clean;
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const payload = await run();
    expect(payload.healthy).toBe(true);
    expect(payload.aiStatus).toBe('skipped_clean');
    expect(payload.aiExplained).toBe(false);
    expect(payload.message).toContain('HEALTHY');
  });

  it.each(PROVIDERS)('explains the scan under %s and records it in the report', async (name, env, fixture) => {
    Object.assign(process.env, env);
    process.env.AI_FIXTURE_FILE = path.join(process.cwd(), fixture);
    process.env.STATE_FILE = path.join(dir, `${name}.json`);
    process.env.AI_MAX_GROUPS = '2';

    const payload = await run();
    expect(payload.aiExplained).toBe(true);
    expect(payload.aiStatus).toBe('ok');
    expect(payload.aiProvider).toBe(name);
    expect(payload.severity).toBe('high');
    expect(payload.errorGroups).toBe(2);
    expect(payload.aiSummary).toContain('MongoDB Atlas was unreachable');
    expect(payload.message).toContain('Severity: HIGH');
    expect(payload.message).toContain('1) E-signature — HIGH (x1)');
    expect(payload.message).toContain(`Explained by ${name} / `);
    // healthy still means "no errors found", not "AI succeeded".
    expect(payload.healthy).toBe(false);

    const report = latestReport();
    expect(report).toContain('--- AI explanation ---');
    expect(report).toContain('Status: ok');
    expect(report).toContain(`Provider/model: ${name} / `);
  });

  it('produces identical output under both providers apart from the attribution', async () => {
    const results: Payload[] = [];
    for (const [name, env, fixture] of PROVIDERS) {
      for (const k of AI_ENV_KEYS) if (k.endsWith('_API_KEY') || k === 'AI_PROVIDER') delete process.env[k];
      Object.assign(process.env, env);
      process.env.AI_FIXTURE_FILE = path.join(process.cwd(), fixture);
      process.env.STATE_FILE = path.join(dir, `eq-${name}.json`);
      process.env.AI_MAX_GROUPS = '2';
      results.push(await run());
    }
    const [a, b] = results;
    const strip = (p: Payload) => ({
      ...p,
      generatedAt: 'X',
      message: p.message.replace(/Time: .*/, 'Time: X').replace(/Explained by .*/, 'Explained by X'),
      aiProvider: 'X', aiModel: 'X',
    });
    expect(strip(a)).toEqual(strip(b));
    expect(a.aiProvider).toBe('openai');
    expect(b.aiProvider).toBe('anthropic');
    expect(a.aiModel).toBe('gpt-5.6-terra');
    expect(b.aiModel).toBe('claude-opus-5');
  });

  it('falls back to the raw-line message when the key is missing, and does not try the other provider', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.AI_FIXTURE_FILE = path.join(process.cwd(), 'tests/fixtures/anthropicResponse.json');
    const payload = await run();
    expect(payload.aiStatus).toBe('skipped_no_key');
    expect(payload.aiExplained).toBe(false);
    expect(payload.aiProvider).toBeNull();
    expect(payload.message).toContain('GENERIC ERRORS (why):');
  });

  it.each([
    ['unknown provider', { AI_PROVIDER: 'gemini', OPENAI_API_KEY: 'sk-x' }, 'failed_config_provider'],
    ['bad base URL', { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-x', AI_BASE_URL: 'nonsense' }, 'failed_config_url'],
  ])('falls back on %s and still returns a full payload', async (_name, env, status) => {
    Object.assign(process.env, env);
    const payload = await run();
    expect(payload.aiStatus).toBe(status);
    expect(payload.aiExplained).toBe(false);
    expect(payload.message).toContain('GENERIC ERRORS (why):');
    expect(typeof payload.bugCount).toBe('number');
  });

  it('records the fallback reason in the report so a missing explanation is explainable', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.OPENAI_API_KEY = 'sk-x';
    await run();
    const report = latestReport();
    expect(report).toContain('Status: failed_config_provider');
    expect(report).toContain('Provider/model: (none)');
    expect(report).toContain('(no explanation this scan');
  });

  it('never leaks a key into the report or the payload', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-super-secret-integration-key';
    process.env.AI_FIXTURE_FILE = path.join(process.cwd(), 'tests/fixtures/openaiResponse.json');
    process.env.AI_MAX_GROUPS = '2';
    const payload = await run();
    expect(JSON.stringify(payload)).not.toContain('sk-super-secret-integration-key');
    expect(latestReport()).not.toContain('sk-super-secret-integration-key');
    const logged = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String).join('\n');
    expect(logged).not.toContain('sk-super-secret-integration-key');
  });

  it('prints the outbound payload and makes no call in dry-run mode', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-dry-run-key';
    process.env.AI_DRY_RUN = '1';
    const payload = await run();
    expect(payload.aiStatus).toBe('skipped_dry_run');
    expect(payload.aiExplained).toBe(false);
    const printed = logSpy.mock.calls.flat().map(String).join('\n');
    expect(printed).toContain('DRY RUN (openai / gpt-5.6-terra)');
    expect(printed).not.toContain('sk-dry-run-key');
  });

  it('still writes the dated report before the AI layer runs', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-x';
    await run();
    const report = latestReport();
    expect(report).toContain('=== CPQ12 User & Error Monitor ===');
    expect(report).toContain('--- Generic bug lines (why) ---');
  });
});
