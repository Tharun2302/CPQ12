import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error - CommonJS monitor script, no type declarations
import monitor from '../../monitor-user-logs.cjs';
// @ts-expect-error - CommonJS helper shared with monitor-user-logs.cjs, no type declarations
import aiExplain from '../../monitor-ai-explain.cjs';
import buildMessageGolden from '../fixtures/buildMessageGolden.json';

type LogEntry = { timestamp: string | null; level: string | null; source: string | null; message: string; raw: string; parsed: boolean };
type Group = { id?: string; key: string; level: string; sample: string; raw: string; count: number; firstSeen: string | null; lastSeen: string | null };
type Explanation = { id: string; whatBroke: string; likelyCause: string; affectedArea: string; severity: string; nextStep: string; confidence: string };
type AiResult = { overallSummary: string; worstSeverity: string; explanations: Explanation[]; cachedIds: string[]; provider: string; model: string };
type Envelope = { ai: AiResult | null; aiStatus: string; errorGroups: number; provider: string | null; model: string | null; groups: Group[] };
type Config = { ok: boolean; status: string; provider?: string; model?: string; baseUrl?: string; authStyle?: string; warning?: string | null; apiKey?: string };
type CallOutcome = { ok: boolean; json?: unknown; reason?: string; status?: number; detail?: string | null };
type CacheEntry = { explanation: Explanation; cachedAt: string; provider: string; model: string };
type MonitorState = { aiCallsToday: number; aiCallsDate: string; cache: Record<string, CacheEntry> };
type WireResponse = { status?: number; body?: string; error?: string; timedOut?: boolean };

const {
  parseLogLine, isAiEligible, fingerprint, groupErrors, redact, hasResidualSecret,
  buildPrompt, resolveConfig, callProvider, validateResponse, loadState, saveState,
  explainErrors, renderAiMessage, SYSTEM_PROMPT,
} = aiExplain as {
  parseLogLine: (raw: unknown) => LogEntry;
  isAiEligible: (entry: unknown, patterns: unknown) => boolean;
  fingerprint: (message: unknown) => string;
  groupErrors: (entries: LogEntry[], maxGroups: number) => Group[];
  redact: (text: unknown) => string;
  hasResidualSecret: (text: unknown) => boolean;
  buildPrompt: (groups: Group[], ctx: Record<string, unknown>) => { system: string; user: string; idMap: Record<string, Group> };
  resolveConfig: (env: unknown) => Config;
  callProvider: (adapter: unknown, req: unknown, opts: Record<string, unknown>) => Promise<CallOutcome>;
  validateResponse: (text: unknown, finish: unknown, idMap: Record<string, unknown>) => AiResult | null;
  loadState: (path: string) => MonitorState;
  saveState: (path: string, state: MonitorState) => void;
  explainErrors: (lines: unknown, ctx: Record<string, unknown>) => Promise<Envelope>;
  renderAiMessage: (summary: Record<string, unknown>, ai: AiResult, groups: Group[]) => string;
  SYSTEM_PROMPT: string;
};
const { buildMessage, classify, NOISE_PATTERNS, GENERIC_PATTERNS } = monitor as {
  buildMessage: (summary: Record<string, unknown>, userLines: string[], bugLines: string[]) => string;
  classify: (line: string) => { isUser: boolean; isBug: boolean };
  NOISE_PATTERNS: RegExp[];
  GENERIC_PATTERNS: RegExp[];
};

const FIXTURE_LOG = path.join(process.cwd(), 'tests/fixtures/monitorLogSample.txt');
const fixtureLines = () => fs.readFileSync(FIXTURE_LOG, 'utf8').split(/\r?\n/).filter((l) => l.trim().length);

const SUMMARY = { generatedAt: '2026-09-09T06:11:30.000Z', container: 'cpq-application', bugCount: 2, userCount: 1 };
const USER_LINE = '{"timestamp":"2026-09-09T05:00:00.000Z","level":"info","source":"server","message":"i User abc already logged in today"}';
const BUG_LINES = [
  '{"timestamp":"2026-09-09T06:11:02.399Z","level":"error","source":"server","message":"X E-sign expiry reminder job failed: connect ETIMEDOUT 203.0.113.10:27017"}',
  '{"timestamp":"2026-09-09T06:11:02.400Z","level":"error","source":"server","message":"X Auto-reminder job failed: connect ETIMEDOUT 203.0.113.10:27017"}',
];

// =============================================================================
// The regression test the whole design hangs on. These strings were captured
// from the ORIGINAL buildMessage() before the AI layer existed. With the AI
// layer off, the monitor's output must stay byte-identical to this.
// =============================================================================
// 90 cases captured from the ORIGINAL buildMessage() implementation (git HEAD, before the AI
// layer existed) and committed as a fixture, so the regression check does not depend on git
// still holding the pre-change file. This is requirement F4: with the AI layer off the Teams
// text must stay byte-identical to what the team sees today.
describe('buildMessage() byte-identity against the pre-change implementation', () => {
  it('reproduces every captured case exactly', () => {
    expect(buildMessageGolden.length).toBeGreaterThan(80);
    const mismatches: string[] = [];
    for (const c of buildMessageGolden) {
      const actual = buildMessage(c.summary, c.userLines, c.bugLines);
      if (actual !== c.expected) mismatches.push(c.name);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('buildMessage() fallback — snapshot of pre-change behaviour', () => {
  it('renders user and bug sections exactly as before', () => {
    expect(buildMessage(SUMMARY, [USER_LINE], BUG_LINES)).toBe(
      '🔎 CPQ12 User & Error Monitor\n'
      + 'Time: 2026-09-09T06:11:30.000Z\n'
      + 'Container: cpq-application\n'
      + 'New bug/error lines: 2\n'
      + 'User-activity events: 1\n'
      + '\n'
      + 'USER-ACTIVITY (why):\n'
      + `• ${USER_LINE}\n`
      + '\n'
      + 'GENERIC ERRORS (why):\n'
      + `• ${BUG_LINES[0]}\n`
      + `• ${BUG_LINES[1]}`,
    );
  });

  it('renders a bugs-only message exactly as before', () => {
    expect(buildMessage({ ...SUMMARY, userCount: 0 }, [], BUG_LINES)).toBe(
      '🔎 CPQ12 User & Error Monitor\n'
      + 'Time: 2026-09-09T06:11:30.000Z\n'
      + 'Container: cpq-application\n'
      + 'New bug/error lines: 2\n'
      + 'User-activity events: 0\n'
      + '\n'
      + 'GENERIC ERRORS (why):\n'
      + `• ${BUG_LINES[0]}\n`
      + `• ${BUG_LINES[1]}`,
    );
  });

  it('renders the empty message exactly as before', () => {
    expect(buildMessage({ ...SUMMARY, bugCount: 0, userCount: 0 }, [], [])).toBe(
      '🔎 CPQ12 User & Error Monitor\n'
      + 'Time: 2026-09-09T06:11:30.000Z\n'
      + 'Container: cpq-application\n'
      + 'New bug/error lines: 0\n'
      + 'User-activity events: 0\n'
      + '\n'
      + 'No issues found in scanned window.',
    );
  });

  it('still truncates a long line at 280 chars with an ellipsis', () => {
    const out = buildMessage({ ...SUMMARY, bugCount: 1, userCount: 0 }, [], ['E'.repeat(300)]);
    expect(out.endsWith('• ' + 'E'.repeat(280) + '…')).toBe(true);
  });
});

// =============================================================================
// Parsing, eligibility, grouping, noise
// =============================================================================
describe('parseLogLine', () => {
  it('reads the structured envelope the logger emits', () => {
    const entry = parseLogLine(BUG_LINES[0]);
    expect(entry.parsed).toBe(true);
    expect(entry.level).toBe('error');
    expect(entry.source).toBe('server');
    expect(entry.timestamp).toBe('2026-09-09T06:11:02.399Z');
    expect(entry.message).toBe('X E-sign expiry reminder job failed: connect ETIMEDOUT 203.0.113.10:27017');
  });

  it('falls back to the raw line for non-JSON input and never throws', () => {
    for (const raw of ['TypeError: boom', '', '{not json', null, undefined, 42]) {
      expect(() => parseLogLine(raw)).not.toThrow();
      expect(parseLogLine(raw).parsed).toBe(false);
    }
    expect(parseLogLine('TypeError: boom').message).toBe('TypeError: boom');
  });

  it('lowercases the level so eligibility is case-insensitive', () => {
    expect(parseLogLine('{"level":"ERROR","message":"x"}').level).toBe('error');
  });
});

describe('isAiEligible', () => {
  const at = (level: string, message: string) => parseLogLine(JSON.stringify({ timestamp: 't', level, source: 's', message }));

  it('excludes the folder-sync success line, which is level info', () => {
    expect(isAiEligible(at('info', '   ❌ Errors: 0'), GENERIC_PATTERNS)).toBe(false);
  });

  it('includes a warn-level Gotenberg failure', () => {
    expect(isAiEligible(at('warn', '⚠️ Gotenberg request error: fetch failed'), GENERIC_PATTERNS)).toBe(true);
  });

  it('includes error level', () => {
    expect(isAiEligible(at('error', '❌ Auto-reminder job failed'), GENERIC_PATTERNS)).toBe(true);
  });

  it('excludes routine login notices', () => {
    expect(isAiEligible(at('info', 'ℹ️ User x already logged in today'), GENERIC_PATTERNS)).toBe(false);
  });

  it('falls back to the generic regexes for an unparsable line', () => {
    expect(isAiEligible(parseLogLine('TypeError: boom'), GENERIC_PATTERNS)).toBe(true);
    expect(isAiEligible(parseLogLine('just a plain line'), GENERIC_PATTERNS)).toBe(false);
  });

  it('is safe with junk input', () => {
    expect(isAiEligible(null, GENERIC_PATTERNS)).toBe(false);
    expect(isAiEligible(parseLogLine('TypeError: boom'), undefined)).toBe(false);
  });
});

describe('NOISE_PATTERNS and bugCount', () => {
  const countFixture = () => {
    let bugCount = 0;
    let userCount = 0;
    for (const line of fixtureLines()) {
      if (NOISE_PATTERNS.some((p: RegExp) => p.test(line))) continue;
      const c = classify(line);
      if (c.isBug) bugCount += 1;
      if (c.isUser) userCount += 1;
    }
    return { bugCount, userCount };
  };

  it('no longer counts the "❌ Errors: 0" success line as a bug', () => {
    expect(NOISE_PATTERNS.some((p: RegExp) => p.test('   ❌ Errors: 0'))).toBe(true);
    // The fixture holds 3 of those lines; without the rule bugCount would be 9, not 6.
    expect(countFixture()).toEqual({ bugCount: 6, userCount: 1 });
  });

  it('keeps the original CORS noise rule', () => {
    expect(NOISE_PATTERNS.some((p: RegExp) => p.test('Not allowed by CORS: https://www.zenop.ai/x'))).toBe(true);
  });
});

// `logs/` is gitignored, so the captured production logs are not in the repo, and the files that
// are there rotate and grow. Nothing below hardcodes a count: every expectation is derived from
// whatever the files hold at the time, so these assert the mechanism, not a snapshot.
const LOG_DIR = path.join(process.cwd(), 'logs');
const realLogs = (): string[] => {
  try {
    return fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log')).map((f) => path.join(LOG_DIR, f));
  } catch {
    return [];
  }
};
const CORS_NOISE = /Not allowed by CORS: https:\/\/www\.zenop\.ai/i;
const SUCCESS_LINE = /❌ Errors: 0(?!\d)/;

describe('the real captured production logs, when present', () => {
  const files = realLogs();
  const linesOf = (f: string) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim().length);

  it.runIf(files.length)('removes exactly the folder-sync success lines from bugCount', () => {
    for (const file of files) {
      const lines = linesOf(file);
      const before = lines.filter((l) => !CORS_NOISE.test(l) && classify(l).isBug).length;
      const after = lines.filter((l) => !NOISE_PATTERNS.some((p: RegExp) => p.test(l)) && classify(l).isBug).length;
      const successLines = lines.filter((l) => !CORS_NOISE.test(l) && classify(l).isBug && SUCCESS_LINE.test(l)).length;
      expect(after).toBe(before - successLines);
    }
  });

  it.runIf(files.length)('never makes a folder-sync success line AI-eligible', () => {
    for (const file of files) {
      const entries = linesOf(file).map(parseLogLine).filter((e: LogEntry) => isAiEligible(e, GENERIC_PATTERNS));
      expect(entries.every((e: LogEntry) => !SUCCESS_LINE.test(e.message))).toBe(true);
      // Every eligible structured line is error or warn; unparsable ones matched a generic regex.
      expect(entries.every((e: LogEntry) => !e.parsed || e.level === 'error' || e.level === 'warn')).toBe(true);
    }
  });

  it.runIf(files.length)('leaves no secret in the assembled payload for any real log file', () => {
    for (const file of files) {
      const entries = linesOf(file).map(parseLogLine).filter((e: LogEntry) => isAiEligible(e, GENERIC_PATTERNS));
      const groups = groupErrors(entries, 8);
      if (!groups.length) continue;
      const prompt = buildPrompt(groups, { generatedAt: 't', container: 'c', windowMinutes: 16 });
      expect(hasResidualSecret(`${prompt.system}\n${prompt.user}`)).toBe(false);
      const userPart = prompt.user.split('Scan window:')[1];
      expect(userPart).not.toMatch(/[a-z0-9-]+\.[a-z0-9]{6,}\.mongodb\.net/i);
      expect(userPart).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      expect(userPart).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    }
  });
});

describe('fingerprint and groupErrors', () => {
  it('collapses two ETIMEDOUT lines that differ only by IP', () => {
    expect(fingerprint('❌ Auto-reminder job failed: connect ETIMEDOUT 203.0.113.10:27017'))
      .toBe(fingerprint('❌ Auto-reminder job failed: connect ETIMEDOUT 10.0.0.1:27017'));
  });

  it('keeps the expiry-reminder and auto-reminder jobs separate', () => {
    expect(fingerprint('❌ E-sign expiry reminder job failed: connect ETIMEDOUT 1.2.3.4'))
      .not.toBe(fingerprint('❌ Auto-reminder job failed: connect ETIMEDOUT 1.2.3.4'));
  });

  it('normalises ids, mongo hosts, emails and digits', () => {
    expect(fingerprint('job for 8f14e45f-ceea-467a-9c2b-1d2e3f4a5b6c took 310ms')).toBe('job for <id> took <n>ms');
    expect(fingerprint('ENOTFOUND ac-x-shard-00-00.abcdefg.mongodb.net')).toBe('enotfound <mongohost>');
    expect(fingerprint('mail to Someone@Example.com bounced')).toBe('mail to <email> bounced');
  });

  it('produces exactly the group keys the design predicted for the real log shapes', () => {
    const entries = fixtureLines().map(parseLogLine).filter((e: LogEntry) => isAiEligible(e, GENERIC_PATTERNS));
    const groups = groupErrors(entries, 8);
    expect(groups.map((g: Group) => g.key)).toEqual([
      '❌ e-sign expiry reminder job failed: getaddrinfo enotfound <mongohost>',
      '❌ auto-reminder job failed: getaddrinfo enotfound <mongohost>',
      '❌ e-sign expiry reminder job failed: connect etimedout <ip>',
      '❌ auto-reminder job failed: connect etimedout <ip>',
      '⚠️ gotenberg request error: fetch failed',
      "typeerror: cannot read properties of undefined (reading 'quote')",
    ]);
  });

  it('counts occurrences and tracks the first and last timestamp', () => {
    const raw = ['2026-09-09T01:00:00.000Z', '2026-09-09T03:00:00.000Z', '2026-09-09T02:00:00.000Z']
      .map((t) => JSON.stringify({ timestamp: t, level: 'error', source: 's', message: 'boom on host 1.2.3.4' }));
    const groups = groupErrors(raw.map(parseLogLine), 8);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].firstSeen).toBe('2026-09-09T01:00:00.000Z');
    expect(groups[0].lastSeen).toBe('2026-09-09T03:00:00.000Z');
  });

  it('honours the group cap', () => {
    const raw = Array.from({ length: 12 }, (_, i) => JSON.stringify({ timestamp: 't', level: 'error', source: 's', message: `distinct failure ${String.fromCharCode(97 + i)}` }));
    expect(groupErrors(raw.map(parseLogLine), 3)).toHaveLength(3);
  });
});

// =============================================================================
// Redaction (§7) — one case per rule, plus ordering, idempotence and the guard
// =============================================================================
describe('redact — one case per rule', () => {
  const cases: Array<[string, string, string]> = [
    ['1 URI credentials', 'see amqp://bob:hunter2@queue.internal/x', 'hunter2'],
    ['2 JWT', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NX0.dBjftJeZ4CVPmB92K27u', 'eyJhbGciOiJIUzI1NiJ9'],
    ['3 Bearer', 'Header: Bearer abcdefghijklmnopqrstuv', 'abcdefghijklmnopqrstuv'],
    ['4 SendGrid', 'key SG.aaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbb failed', 'SG.aaaaaaaaaaaaaaaaaa'],
    ['5 API key', 'using sk-abcdefghijklmnopqrstuvwx now', 'sk-abcdefghijklmnopqrstuvwx'],
    ['6 HubSpot PAT', 'pat-na1-abcdefghijklmnopqrst rejected', 'pat-na1-abcdefghijklmnopqrst'],
    ['7 Slack token', 'xoxb-1234567890-abcdef bad', 'xoxb-1234567890-abcdef'],
    ['8 AWS key', 'AKIAIOSFODNN7EXAMPLE denied', 'AKIAIOSFODNN7EXAMPLE'],
    ['9 Azure secret', 'abc8Q~aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa expired', '8Q~aaaaaaaaaaaaaaaa'],
    ['10 Postgres URI', 'connect postgresql://u:p@db:5432/cpq failed', 'postgresql://'],
    ['11 Mongo URI', 'connect mongodb+srv://u:p@c.abcdefg.mongodb.net/cpq failed', 'mongodb+srv://'],
    ['12 secret-shaped kv', 'GET /esign?token=abc123def456 200', 'abc123def456'],
    ['13 signing link', 'opened /sign/74c0ad9c-49d5-4771 ok', '74c0ad9c'],
    ['14 esign inbox', 'sent /esign-inbox?doc=abc&token=xyz to user', 'doc=abc'],
    ['15 full UUID', 'doc 8f14e45f-ceea-467a-9c2b-1d2e3f4a5b6c saved', '8f14e45f-ceea-467a-9c2b-1d2e3f4a5b6c'],
    ['16 truncated UUID', 'doc 8f14e45f-ceea-467a-9c2b saved', '8f14e45f-ceea-467a-9c2b'],
    ['17 email', 'mail to user@example.test bounced', 'user@example.test'],
    ['18 Mongo Atlas host', 'ENOTFOUND ac-example-shard-00-00.abcdefg.mongodb.net', 'abcdefg.mongodb.net'],
    ['19 IPv4 with port', 'ETIMEDOUT 203.0.113.10:27017 retrying', '203.0.113.10'],
    ['20 base64 blob', `payload ${'A'.repeat(64)}== stored`, 'A'.repeat(64)],
  ];

  it.each(cases)('%s masks its target', (_name, input, secret) => {
    expect(redact(input)).not.toContain(secret);
  });

  it('leaves the surrounding text intact', () => {
    expect(redact('ETIMEDOUT 203.0.113.10:27017 retrying')).toBe('ETIMEDOUT [IP] retrying');
    expect(redact('mail to a.b@c.com bounced')).toBe('mail to [EMAIL] bounced');
  });

  it('removes the password from a real Mongo URI', () => {
    const out = redact('MongoDB connected: mongodb+srv://user:hunter2@cluster1.abcdefg.mongodb.net/cpq12');
    expect(out).not.toContain('hunter2');
    expect(out).toBe('MongoDB connected: [MONGO_URI]');
  });

  it('does not mangle an already-redacted boot line', () => {
    expect(redact('MongoDB connected: mongodb+srv://[REDACTED]@cluster1.abcdefg.mongodb.net/cpq12'))
      .toBe('MongoDB connected: [MONGO_URI]');
  });

  it('replaces a full UUID once rather than chopping it with the truncated rule', () => {
    expect(redact('id 8f14e45f-ceea-467a-9c2b-1d2e3f4a5b6c end')).toBe('id [UUID] end');
  });

  it('is idempotent', () => {
    const inputs = [
      '?token=abcdef123456', 'Bearer abcdefghijklmnop',
      'mongodb+srv://u:p@c.abcdefg.mongodb.net/x', '/sign/74c0ad9c-49d5-4771-a',
      'x 203.0.113.10:27017 y', 'a@b.com', 'password: swordfish',
      '❌ E-sign expiry reminder job failed: getaddrinfo ENOTFOUND ac-x.abcdefg.mongodb.net',
    ];
    for (const input of inputs) expect(redact(redact(input))).toBe(redact(input));
  });

  it('renders the six genuine error messages to stable redacted strings', () => {
    expect(redact('❌ E-sign expiry reminder job failed: getaddrinfo ENOTFOUND ac-example-shard-00-00.abcdefg.mongodb.net'))
      .toBe('❌ E-sign expiry reminder job failed: getaddrinfo ENOTFOUND [MONGO_HOST]');
    expect(redact('❌ Auto-reminder job failed: connect ETIMEDOUT 203.0.113.10:27017'))
      .toBe('❌ Auto-reminder job failed: connect ETIMEDOUT [IP]');
    expect(redact('⚠️ Gotenberg request error: fetch failed'))
      .toBe('⚠️ Gotenberg request error: fetch failed');
    expect(redact('❌ E-sign agreement-status error: {"errno":-4077,"code":"ECONNRESET","syscall":"write"}'))
      .toBe('❌ E-sign agreement-status error: {"errno":-4077,"code":"ECONNRESET","syscall":"write"}');
  });

  it('never throws on junk', () => {
    for (const junk of [null, undefined, 42, '']) expect(() => redact(junk)).not.toThrow();
  });
});

describe('hasResidualSecret', () => {
  it.each([
    ['URI credentials', 'mongodb://bob:hunter2@host/db'],
    ['JWT', 'eyJhbGciOiJIUzI1NiJ9.payload'],
    ['API key', 'sk-abcdefghijklmnopqrstuvwx'],
    ['SendGrid key', 'SG.aaaaaaaaaaaaaaaaaa.bbb'],
    ['AWS key', 'AKIAIOSFODNN7EXAMPLE'],
    ['email', 'reach me at a.b@c.co'],
  ])('trips on %s', (_name, text) => {
    expect(hasResidualSecret(text)).toBe(true);
  });

  // The guard only earns its place if it is independent of the redaction table. Every shape below
  // is one redaction leaves completely untouched — the assertion proves both halves.
  it.each([
    ['GitHub PAT', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
    ['Stripe live key', 'sk_live_51ABCdefGHIjklMNOpqrSTU'],
    ['PEM private key header', '-----BEGIN RSA PRIVATE KEY-----'],
    ['bare 40-char hex', 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3'],
    ['Twilio SID', 'ACaBcDeF0123456789aBcDeF01234567'],
    ['Luhn-valid card number', '4111 1111 1111 1111'],
    ['SSN', '123-45-6789'],
    ['full IPv6 address', 'fe80:0000:0000:0000:0204:61ff:fe9d:f156'],
    ['high-entropy session cookie', 'sessionid=xKq93MzPl2vBn4TrYw8QsL1e'],
    ['GitLab PAT', 'glpat-ABCDEFGHIJKLMNOPQRST'],
    ['Google API key', 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456'],
  ])('catches %s, which no redaction rule masks', (_name, text) => {
    expect(redact(text)).toBe(text);
    expect(hasResidualSecret(text)).toBe(true);
  });

  it('passes a fully redacted real line', () => {
    expect(hasResidualSecret(redact('❌ E-sign expiry reminder job failed: connect ETIMEDOUT 203.0.113.10:27017'))).toBe(false);
  });

  it('does not trip on the system prompt — otherwise the layer could never call', () => {
    expect(hasResidualSecret(SYSTEM_PROMPT)).toBe(false);
  });

  // Tuned against the real logs: these are CPQ12's own structured ids and URLs, not credentials.
  // If any of these start tripping, explanations silently stop for a whole class of error.
  it.each([
    ['an internal template id', 'Fetching template file: template-1771420090782-o1b312'],
    ['a container URL', 'Signing links use: http://host.docker.internal:3001 (set APP_BASE_URL)'],
    ['an ISO timestamp', 'job started at 2026-09-09T06:11:02.399Z and failed'],
    ['a redacted ObjectId', 'Fetching exhibit file: [OBJECTID]'],
    ['our own placeholders', 'failed for [EMAIL] at [IP] on [MONGO_HOST] with [UUID]'],
    ['a 13-digit epoch inside an id', 'template-1771420090782 rejected'],
    ['ordinary prose', 'The e-sign expiry reminder job could not reach the database this morning.'],
  ])('does not trip on %s', (_name, text) => {
    expect(hasResidualSecret(text)).toBe(false);
  });

  it('masks a Mongo ObjectId before it can reach the guard', () => {
    expect(redact('Fetching exhibit file: 6a832c3e3591a4aa913b6104')).toBe('Fetching exhibit file: [OBJECTID]');
  });
});

// =============================================================================
// Prompt assembly
// =============================================================================
describe('buildPrompt', () => {
  const groups = () => groupErrors(fixtureLines().map(parseLogLine).filter((e: LogEntry) => isAiEligible(e, GENERIC_PATTERNS)), 8);
  const ctx = { generatedAt: '2026-09-09T06:11:30.000Z', container: 'cpq-application', windowMinutes: 16 };

  it('is deterministic', () => {
    expect(buildPrompt(groups(), ctx).user).toBe(buildPrompt(groups(), ctx).user);
  });

  it('round-trips ids through the idMap', () => {
    const prompt = buildPrompt(groups(), ctx);
    expect(Object.keys(prompt.idMap)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);
    expect(prompt.user).toContain('"id":"e1"');
    expect(prompt.idMap.e1.key).toContain('e-sign expiry reminder');
  });

  it('sends redacted samples only, never the raw JSON envelope', () => {
    const prompt = buildPrompt(groups(), ctx);
    expect(prompt.user).not.toContain('"source":"server"');
    expect(prompt.user).not.toContain('mongodb.net');
    expect(prompt.user).toContain('[MONGO_HOST]');
    expect(prompt.user).toContain('[IP]');
  });

  // An unbroken run of 900 alphanumerics is itself masked as [BLOB] by redaction rule 20, so
  // the cap fixtures use spaced words to isolate truncation from redaction.
  const filler = (n: number) => 'detail word '.repeat(Math.ceil(n / 12)).slice(0, n);

  it('caps each sample at maxCharsPerError', () => {
    const long = [{ key: 'k', level: 'error', sample: filler(900), raw: 'r', count: 1, firstSeen: null, lastSeen: null }];
    const prompt = buildPrompt(long, { ...ctx, maxCharsPerError: 50 });
    const sample = JSON.parse(prompt.user.split('{"errors":[\n')[1].split('\n]}')[0]).sample;
    expect(sample).toHaveLength(50);
    expect(sample).toBe(filler(900).slice(0, 50));
  });

  it('redaction runs before truncation, so a masked secret is never cut in half', () => {
    const secret = [{ key: 'k', level: 'error', sample: 'mail bounced for someone@example.test now', raw: 'r', count: 1, firstSeen: null, lastSeen: null }];
    const prompt = buildPrompt(secret, { ...ctx, maxCharsPerError: 30 });
    expect(prompt.user).toContain('mail bounced for [EMAIL] now'.slice(0, 30));
    expect(prompt.user).not.toContain('someone@example.test');
  });

  it('drops groups once the total char cap is reached, keeping at least one', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, level: 'error', sample: filler(200), raw: 'r', count: 1, firstSeen: null, lastSeen: null }));
    const prompt = buildPrompt(many, { ...ctx, maxCharsPerError: 200, maxTotalChars: 450 });
    expect(Object.keys(prompt.idMap).length).toBeLessThan(6);
    expect(Object.keys(prompt.idMap).length).toBeGreaterThan(0);
  });

  it('is identical for both providers — redaction has nothing to do with the recipient', () => {
    const a = buildPrompt(groups(), ctx);
    const b = buildPrompt(groups(), ctx);
    expect(a.system).toBe(b.system);
    expect(a.user).toBe(b.user);
  });
});

// =============================================================================
// Config resolution
// =============================================================================
describe('resolveConfig', () => {
  it('turns the AI layer off when AI_PROVIDER is unset or empty', () => {
    expect(resolveConfig({}).status).toBe('skipped_disabled');
    expect(resolveConfig({ AI_PROVIDER: '' }).status).toBe('skipped_disabled');
    expect(resolveConfig({ AI_PROVIDER: '   ' }).status).toBe('skipped_disabled');
    expect(resolveConfig({}).ok).toBe(false);
    expect(resolveConfig({}).warning).toBeUndefined();
  });

  it('resolves the OpenAI adapter with its defaults', () => {
    const cfg = resolveConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-x' });
    expect(cfg.ok).toBe(true);
    expect(cfg.provider).toBe('openai');
    expect(cfg.model).toBe('gpt-5.6-terra');
    expect(cfg.baseUrl).toBe('https://api.openai.com');
    expect(cfg.authStyle).toBe('bearer');
  });

  it('resolves the Anthropic adapter with its defaults', () => {
    const cfg = resolveConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' });
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.model).toBe('claude-opus-5');
    expect(cfg.authStyle).toBe('x-api-key');
  });

  it('accepts a mixed-case provider name', () => {
    expect(resolveConfig({ AI_PROVIDER: 'OpenAI', OPENAI_API_KEY: 'k' }).ok).toBe(true);
  });

  it('rejects an unknown provider and names the valid values', () => {
    const cfg = resolveConfig({ AI_PROVIDER: 'gemini', OPENAI_API_KEY: 'k' });
    expect(cfg.status).toBe('failed_config_provider');
    expect(cfg.warning).toContain('gemini');
    expect(cfg.warning).toContain('openai, anthropic');
  });

  it('reports a missing key and NEVER falls through to the other provider', () => {
    const seen: string[] = [];
    const env = new Proxy({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: 'other-key' } as Record<string, string>, {
      get(target, prop: string) { seen.push(prop); return target[prop]; },
    });
    const cfg = resolveConfig(env);
    expect(cfg.status).toBe('skipped_no_key');
    expect(cfg.warning).toContain('OPENAI_API_KEY');
    expect(seen).toContain('OPENAI_API_KEY');
    expect(seen).not.toContain('ANTHROPIC_API_KEY');
  });

  it('reports a missing Anthropic key the same way', () => {
    const cfg = resolveConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' });
    expect(cfg.status).toBe('skipped_no_key');
    expect(cfg.warning).toContain('ANTHROPIC_API_KEY');
  });

  it('rejects an invalid AI_BASE_URL rather than silently using the default', () => {
    const cfg = resolveConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', AI_BASE_URL: 'not-a-url' });
    expect(cfg.status).toBe('failed_config_url');
    expect(cfg.ok).toBe(false);
  });

  it('uses AI_MODEL when set and the adapter default when empty', () => {
    expect(resolveConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', AI_MODEL: 'x' }).model).toBe('x');
    expect(resolveConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', AI_MODEL: '' }).model).toBe('gpt-5.6-terra');
  });

  it('honours AI_AUTH_STYLE and warns on an unknown value', () => {
    expect(resolveConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', AI_AUTH_STYLE: 'api-key' }).authStyle).toBe('api-key');
    const cfg = resolveConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', AI_AUTH_STYLE: 'magic' });
    expect(cfg.authStyle).toBe('bearer');
    expect(cfg.warning).toContain('magic');
  });

  it('never leaks the key into a serialised form of the config', () => {
    const cfg = resolveConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-super-secret-value' });
    expect(cfg.apiKey).toBe('sk-super-secret-value');
    expect(JSON.stringify(cfg)).not.toContain('sk-super-secret-value');
    expect(Object.keys(cfg)).not.toContain('apiKey');
  });

  it('never throws on hostile input', () => {
    for (const env of [null, undefined, {}, { AI_PROVIDER: 123 }, { AI_PROVIDER: 'openai', OPENAI_API_KEY: {} }]) {
      expect(() => resolveConfig(env)).not.toThrow();
    }
  });
});

// =============================================================================
// Validation (§5.5)
// =============================================================================
describe('validateResponse', () => {
  const idMap = { e1: {}, e2: {} };
  const good = {
    overallSummary: 'Two jobs failed.',
    worstSeverity: 'high',
    explanations: [{
      id: 'e1', whatBroke: 'A job failed.', likelyCause: 'Atlas unreachable.',
      affectedArea: 'e-signature', severity: 'high', nextStep: 'Check the access list.', confidence: 'high',
    }],
  };
  const withText = (o: unknown) => validateResponse(JSON.stringify(o), 'complete', idMap);

  it('accepts a well-formed response', () => {
    expect(withText(good)).toEqual(good);
  });

  it.each([
    ['finishReason truncated', () => validateResponse(JSON.stringify(good), 'truncated', idMap)],
    ['finishReason refused', () => validateResponse(JSON.stringify(good), 'refused', idMap)],
    ['finishReason null', () => validateResponse(JSON.stringify(good), null, idMap)],
    ['null text', () => validateResponse(null, 'complete', idMap)],
    ['empty text', () => validateResponse('   ', 'complete', idMap)],
    ['prose with no JSON', () => validateResponse('I cannot help with that.', 'complete', idMap)],
    ['missing explanations', () => withText({ overallSummary: 's', worstSeverity: 'high' })],
    ['empty explanations', () => withText({ ...good, explanations: [] })],
    ['more explanations than ids sent', () => withText({ ...good, explanations: [good.explanations[0], { ...good.explanations[0], id: 'e2' }, { ...good.explanations[0], id: 'e1' }] })],
    ['missing nextStep', () => withText({ ...good, explanations: [{ ...good.explanations[0], nextStep: undefined }] })],
    ['bad severity', () => withText({ ...good, explanations: [{ ...good.explanations[0], severity: 'catastrophic' }] })],
    ['bad worstSeverity', () => withText({ ...good, worstSeverity: 'apocalyptic' })],
    ['bad affectedArea', () => withText({ ...good, explanations: [{ ...good.explanations[0], affectedArea: 'kitchen' }] })],
    ['bad confidence', () => withText({ ...good, explanations: [{ ...good.explanations[0], confidence: 'certain' }] })],
    ['unknown id', () => withText({ ...good, explanations: [{ ...good.explanations[0], id: 'e99' }] })],
    ['top-level array', () => validateResponse('[1,2]', 'complete', idMap)],
    ['missing overallSummary', () => withText({ worstSeverity: 'high', explanations: good.explanations })],
  ])('rejects %s by returning null, without throwing', (_name, run) => {
    expect(run).not.toThrow();
    expect(run()).toBeNull();
  });

  it('coerces a fenced-code-block reply via one brace extraction', () => {
    const wrapped = `Here is the JSON:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\nHope that helps.`;
    expect(validateResponse(wrapped, 'complete', idMap)).toEqual(good);
  });

  it('truncates an over-length field instead of rejecting the whole answer', () => {
    const long = { ...good, explanations: [{ ...good.explanations[0], whatBroke: 'x'.repeat(400) }] };
    const out = withText(long) as AiResult;
    expect(out.explanations[0].whatBroke).toHaveLength(140);
  });

  it('truncates an over-length overallSummary', () => {
    const out = withText({ ...good, overallSummary: 'y'.repeat(500) }) as AiResult;
    expect(out.overallSummary).toHaveLength(200);
  });
});

// =============================================================================
// State: budget counter and cache
// =============================================================================
const NOW = '2026-09-10T00:00:00.000Z';
const GOOD_EXPLANATION: Explanation = {
  id: 'e1', whatBroke: 'A job failed.', likelyCause: 'Atlas unreachable.', affectedArea: 'e-signature',
  severity: 'high', nextStep: 'Check the access list.', confidence: 'high',
};
const entry = (): CacheEntry => ({ explanation: { ...GOOD_EXPLANATION }, cachedAt: NOW, provider: 'openai', model: 'm' });

describe('loadState / saveState', () => {
  let dir = '';
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-monitor-state-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('treats a missing, unreadable or corrupt state file as empty and never throws', () => {
    expect(loadState('')).toEqual({ aiCallsToday: 0, aiCallsDate: '', cache: {} });
    expect(loadState(path.join(dir, 'nope.json'))).toEqual({ aiCallsToday: 0, aiCallsDate: '', cache: {} });
    const corrupt = path.join(dir, 'corrupt.json');
    fs.writeFileSync(corrupt, '{not json');
    expect(() => loadState(corrupt)).not.toThrow();
    expect(loadState(corrupt).aiCallsToday).toBe(0);
  });

  it('round-trips the budget counter and a well-formed cache entry', () => {
    const p = path.join(dir, 's.json');
    saveState(p, { aiCallsToday: 3, aiCallsDate: '2026-09-09', cache: { k: entry() } });
    const state = loadState(p);
    expect(state.aiCallsToday).toBe(3);
    expect(state.cache.k.provider).toBe('openai');
    expect(state.cache.k.explanation.severity).toBe('high');
  });

  // A cache entry we wrote ourselves is still untrusted on the next run. Before this, a malformed
  // entry survived loadState, passed cacheHit and crashed the renderer for a whole TTL.
  it.each([
    ['a shallow explanation', { explanation: { id: 'e1' }, cachedAt: NOW, provider: 'openai', model: 'm' }],
    ['a non-string severity', { explanation: { ...GOOD_EXPLANATION, severity: 123 }, cachedAt: NOW, provider: 'openai', model: 'm' }],
    ['a severity outside the enum', { explanation: { ...GOOD_EXPLANATION, severity: 'catastrophic' }, cachedAt: NOW, provider: 'openai', model: 'm' }],
    ['an unparseable cachedAt', { ...entry(), cachedAt: 'now' }],
    ['a missing provider', { explanation: GOOD_EXPLANATION, cachedAt: NOW, model: 'm' }],
    ['a null entry', null],
    ['an array entry', []],
    ['a missing nextStep', { explanation: { ...GOOD_EXPLANATION, nextStep: '' }, cachedAt: NOW, provider: 'openai', model: 'm' }],
  ])('drops %s on read', (_name, bad) => {
    const p = path.join(dir, 's.json');
    fs.writeFileSync(p, JSON.stringify({ aiCallsToday: 0, aiCallsDate: '2026-09-10', cache: { good: entry(), bad } }));
    const state = loadState(p);
    expect(Object.keys(state.cache)).toEqual(['good']);
  });

  it('never serves a structurally invalid entry even if it reaches cacheHit', () => {
    const p = path.join(dir, 's.json');
    fs.writeFileSync(p, JSON.stringify({ aiCallsToday: 0, aiCallsDate: '2026-09-10', cache: {} }));
    saveState(p, { aiCallsToday: 0, aiCallsDate: '2026-09-10', cache: { bad: { explanation: { id: 'e1' }, cachedAt: NOW, provider: 'openai', model: 'm' } } });
    expect(loadState(p).cache).toEqual({});
  });

  it('clamps a negative counter on disk rather than granting extra calls', () => {
    const p = path.join(dir, 's.json');
    fs.writeFileSync(p, JSON.stringify({ aiCallsToday: -999999, aiCallsDate: '2026-09-10', cache: {} }));
    expect(loadState(p).aiCallsToday).toBe(0);
    saveState(p, { aiCallsToday: -5, aiCallsDate: '2026-09-10', cache: {} });
    expect(loadState(p).aiCallsToday).toBe(0);
  });

  it('writes the state file atomically, leaving no temp file behind', () => {
    const p = path.join(dir, 's.json');
    saveState(p, { aiCallsToday: 1, aiCallsDate: '2026-09-10', cache: { k: entry() } });
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual(['s.json']);
  });

  it('caps the cache at 200 entries, dropping the oldest', () => {
    const p = path.join(dir, 's.json');
    const cache: Record<string, unknown> = {};
    for (let i = 0; i < 250; i += 1) {
      cache[`k${i}`] = { ...entry(), cachedAt: new Date(2026, 0, 1, 0, 0, i).toISOString() };
    }
    saveState(p, { aiCallsToday: 0, aiCallsDate: 'd', cache });
    const kept = Object.keys(loadState(p).cache);
    expect(kept).toHaveLength(200);
    expect(kept).toContain('k249');
    expect(kept).not.toContain('k0');
  });

  it('swallows a write error to an unwritable path', () => {
    expect(() => saveState(path.join(dir, 'missing-dir', 's.json'), { aiCallsToday: 1, aiCallsDate: 'd', cache: {} })).not.toThrow();
  });

  it('is a no-op when STATE_FILE is unset', () => {
    expect(() => saveState('', { aiCallsToday: 1, aiCallsDate: 'd', cache: {} })).not.toThrow();
  });
});

// =============================================================================
// Transport: every §9 network row, with an injected request function
// =============================================================================
describe('callProvider', () => {
  const adapter = { name: 'openai' };
  const req = { path: '/v1/chat/completions', headers: { 'Content-Type': 'application/json' }, body: { model: 'm' } };
  const base = { apiKey: 'sk-secret-key-value', baseUrl: 'https://api.openai.com', authStyle: 'bearer', maxRetries: 1, retryDelayMs: 0, timeoutMs: 100, totalBudgetMs: 45000 };
  const withResponses = (...responses: WireResponse[]) => {
    const calls: Array<{ target: Record<string, unknown>; headers: Record<string, string>; body: string }> = [];
    const requestFn = (target: Record<string, unknown>, headers: Record<string, string>, body: string) => {
      calls.push({ target, headers, body });
      return Promise.resolve(responses[Math.min(calls.length - 1, responses.length - 1)]);
    };
    return { calls, requestFn };
  };

  it('returns the parsed JSON body on 200', async () => {
    const { requestFn } = withResponses({ status: 200, body: '{"ok":1}' });
    await expect(callProvider(adapter, req, { ...base, requestFn })).resolves.toEqual({ ok: true, json: { ok: 1 } });
  });

  it('injects the key with the configured auth style and nowhere else', async () => {
    for (const [style, header, expected] of [
      ['bearer', 'Authorization', 'Bearer sk-secret-key-value'],
      ['x-api-key', 'x-api-key', 'sk-secret-key-value'],
      ['api-key', 'api-key', 'sk-secret-key-value'],
    ] as const) {
      const { calls, requestFn } = withResponses({ status: 200, body: '{}' });
      await callProvider(adapter, req, { ...base, authStyle: style, requestFn });
      expect(calls[0].headers[header]).toBe(expected);
      expect(calls[0].body).not.toContain('sk-secret-key-value');
    }
  });

  it('appends the adapter path to a bare base URL and uses a pathful base URL verbatim', async () => {
    const bare = withResponses({ status: 200, body: '{}' });
    await callProvider(adapter, req, { ...base, requestFn: bare.requestFn });
    expect(bare.calls[0].target).toMatchObject({ hostname: 'api.openai.com', path: '/v1/chat/completions' });

    const azure = withResponses({ status: 200, body: '{}' });
    await callProvider(adapter, req, {
      ...base,
      baseUrl: 'https://r.openai.azure.com/openai/deployments/d/chat/completions?api-version=2026-01-01',
      requestFn: azure.requestFn,
    });
    expect(azure.calls[0].target.path).toBe('/openai/deployments/d/chat/completions?api-version=2026-01-01');
  });

  it.each([
    [401, 'failed_auth', 1],
    [403, 'failed_auth', 1],
    [404, 'failed_model', 1],
    [400, 'failed_http', 1],
    [429, 'failed_rate_limit', 2],
    [500, 'failed_http', 2],
    [503, 'failed_http', 2],
    [418, 'failed_http', 1],
  ])('maps HTTP %i to %s with %i attempt(s)', async (status, reason, attempts) => {
    const { calls, requestFn } = withResponses({ status, body: '{"error":{"message":"nope"}}' });
    const res = await callProvider(adapter, req, { ...base, requestFn });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe(reason);
    expect(calls).toHaveLength(attempts);
  });

  it('retries a network error once and succeeds on the retry', async () => {
    const { calls, requestFn } = withResponses({ status: 0, error: 'ECONNREFUSED' }, { status: 200, body: '{"ok":1}' });
    await expect(callProvider(adapter, req, { ...base, requestFn })).resolves.toEqual({ ok: true, json: { ok: 1 } });
    expect(calls).toHaveLength(2);
  });

  it('reports a persistent network failure as failed_network', async () => {
    const { requestFn } = withResponses({ status: 0, error: 'EAI_AGAIN' });
    expect((await callProvider(adapter, req, { ...base, requestFn })).reason).toBe('failed_network');
  });

  it('reports a timeout as failed_timeout', async () => {
    const { calls, requestFn } = withResponses({ status: 0, timedOut: true });
    expect((await callProvider(adapter, req, { ...base, requestFn })).reason).toBe('failed_timeout');
    expect(calls).toHaveLength(2);
  });

  it('does not retry once the overall budget is spent', async () => {
    const { calls, requestFn } = withResponses({ status: 500, body: 'boom' });
    const res = await callProvider(adapter, req, { ...base, retryDelayMs: 2000, totalBudgetMs: 1, requestFn });
    expect(res.reason).toBe('failed_http');
    expect(calls).toHaveLength(1);
  });

  it('honours maxRetries=0', async () => {
    const { calls, requestFn } = withResponses({ status: 500, body: 'boom' });
    await callProvider(adapter, req, { ...base, maxRetries: 0, requestFn });
    expect(calls).toHaveLength(1);
  });

  it('reports a non-JSON 200 body as failed_parse without retrying', async () => {
    const { calls, requestFn } = withResponses({ status: 200, body: '<html>gateway</html>' });
    const res = await callProvider(adapter, req, { ...base, requestFn });
    expect(res).toMatchObject({ ok: false, reason: 'failed_parse' });
    expect(calls).toHaveLength(1);
  });

  it('never rejects', async () => {
    const requestFn = () => Promise.resolve({ status: undefined, body: undefined } as WireResponse);
    await expect(callProvider(adapter, req, { ...base, requestFn })).resolves.toBeDefined();
  });
});

// =============================================================================
// Rendering
// =============================================================================
describe('renderAiMessage', () => {
  const groups = [
    { id: 'e1', key: 'k1', level: 'error', sample: 's1', raw: 'RAW LINE ONE', count: 1, firstSeen: null, lastSeen: null },
    { id: 'e2', key: 'k2', level: 'error', sample: 's2', raw: 'RAW LINE TWO', count: 3, firstSeen: null, lastSeen: null },
  ];
  const ai = {
    overallSummary: 'Both reminder jobs failed.',
    worstSeverity: 'high',
    explanations: [
      { id: 'e1', whatBroke: 'Expiry job died.', likelyCause: 'Atlas unreachable.', affectedArea: 'e-signature', severity: 'high', nextStep: 'Check the access list.', confidence: 'high' },
      { id: 'e2', whatBroke: 'Auto job died.', likelyCause: 'Same cause.', affectedArea: 'database', severity: 'medium', nextStep: 'Re-run it.', confidence: 'medium' },
    ],
    cachedIds: ['e2'],
    provider: 'openai',
    model: 'gpt-5.6-terra',
  };
  const summary = { generatedAt: '2026-09-09T06:11:30.000Z', container: 'cpq-application', bugCount: 2, userCount: 0, label: 'CPQ12 User & Error Monitor' };

  it('renders all five fields per group plus the header and raw lines', () => {
    const out = renderAiMessage(summary, ai, groups);
    expect(out).toContain('🔎 CPQ12 User & Error Monitor');
    expect(out).toContain('Severity: HIGH');
    expect(out).toContain('New bug/error lines: 2');
    expect(out).toContain('Both reminder jobs failed.');
    expect(out).toContain('1) E-signature — HIGH (x1)');
    expect(out).toContain('   What broke: Expiry job died.');
    expect(out).toContain('   Why: Atlas unreachable.');
    expect(out).toContain('   Next step: Check the access list.');
    expect(out).toContain('   Confidence: high');
    expect(out).toContain('2) Database — MEDIUM (x3)');
    expect(out).toContain('Raw lines:\n• RAW LINE ONE\n• RAW LINE TWO');
  });

  it('marks cached explanations', () => {
    const out = renderAiMessage(summary, ai, groups);
    expect(out).toContain('2) Database — MEDIUM (x3)  ↻ seen before');
    expect(out).not.toContain('1) E-signature — HIGH (x1)  ↻');
  });

  it('names the provider and model that actually ran', () => {
    expect(renderAiMessage(summary, ai, groups)).toContain('Explained by openai / gpt-5.6-terra');
    expect(renderAiMessage(summary, { ...ai, provider: 'anthropic', model: 'claude-opus-5' }, groups))
      .toContain('Explained by anthropic / claude-opus-5');
  });

  it('truncates an over-long message with the marker', () => {
    const fat = { ...ai, overallSummary: 'z'.repeat(9000) };
    const out = renderAiMessage({ ...summary, maxMessageChars: 500 }, fat, groups);
    expect(out.length).toBeLessThan(600);
    expect(out.endsWith('… (truncated, see logs/monitor/)')).toBe(true);
  });
});

// =============================================================================
// Orchestrator
// =============================================================================
// The one logical answer both fixtures encode, after validation has normalised it.
const EXPECTED_EXPLANATIONS: Explanation[] = [
  {
    id: 'e1',
    whatBroke: 'The e-sign expiry reminder job could not run.',
    likelyCause: 'The job opened a MongoDB Atlas connection and the TCP connect timed out on port 27017. Atlas was unreachable from the droplet.',
    affectedArea: 'e-signature',
    severity: 'high',
    nextStep: 'Check the Atlas IP access list still contains the droplet IP, then curl /api/database/health.',
    confidence: 'high',
  },
  {
    id: 'e2',
    whatBroke: 'The auto-reminder job could not run.',
    likelyCause: 'Same Atlas connectivity failure as the expiry reminder job; the two jobs share a connection path.',
    affectedArea: 'e-signature',
    severity: 'medium',
    nextStep: 'Re-run the reminder job manually once Atlas connectivity is confirmed.',
    confidence: 'medium',
  },
];

describe('explainErrors', () => {
  let dir = '';
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-monitor-ai-'));
    warn = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); warn.mockRestore(); });

  const ctx = (env: Record<string, string>, extra: Record<string, unknown> = {}) => ({
    env, generatedAt: '2026-09-09T06:11:30.000Z', container: 'cpq-application',
    windowMinutes: 16, genericPatterns: GENERIC_PATTERNS, ...extra,
  });
  const okEnv = (over: Record<string, string> = {}) => ({
    AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', STATE_FILE: path.join(dir, 's.json'),
    AI_FIXTURE_FILE: path.join(process.cwd(), 'tests/fixtures/openaiResponse.json'),
    AI_MAX_GROUPS: '2', ...over,
  });

  it('returns ai:null and skipped_disabled with AI_PROVIDER unset', async () => {
    const res = await explainErrors(fixtureLines(), ctx({}));
    expect(res.ai).toBeNull();
    expect(res.aiStatus).toBe('skipped_disabled');
    expect(res.provider).toBeNull();
  });

  it('returns skipped_no_key without touching the other provider key', async () => {
    const res = await explainErrors(fixtureLines(), ctx({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: 'x' }));
    expect(res.aiStatus).toBe('skipped_no_key');
    expect(res.ai).toBeNull();
  });

  it('returns failed_config_provider for an unknown provider', async () => {
    const res = await explainErrors(fixtureLines(), ctx({ AI_PROVIDER: 'gemini', OPENAI_API_KEY: 'k' }));
    expect(res.aiStatus).toBe('failed_config_provider');
  });

  it('returns skipped_not_eligible when nothing in the window qualifies', async () => {
    const benign = ['{"timestamp":"t","level":"info","source":"s","message":"   ❌ Errors: 0"}'];
    const res = await explainErrors(benign, ctx(okEnv()));
    expect(res.aiStatus).toBe('skipped_not_eligible');
    expect(res.ai).toBeNull();
  });

  it('explains the fixture log from a fixture response and caches the result', async () => {
    const env = okEnv();
    const res = await explainErrors(fixtureLines(), ctx(env));
    expect(res.aiStatus).toBe('ok');
    expect(res.provider).toBe('openai');
    expect(res.model).toBe('gpt-5.6-terra');
    expect(res.ai.explanations).toHaveLength(2);
    expect(res.ai.cachedIds).toEqual([]);
    expect(res.errorGroups).toBe(2);

    const state = loadState(env.STATE_FILE);
    expect(state.aiCallsToday).toBe(1);
    expect(Object.keys(state.cache)).toHaveLength(2);
  });

  it('serves a second identical scan entirely from cache with no call', async () => {
    const env = okEnv();
    await explainErrors(fixtureLines(), ctx(env));
    const res = await explainErrors(fixtureLines(), ctx({ ...env, AI_FIXTURE_FILE: path.join(dir, 'does-not-exist.json') }));
    expect(res.aiStatus).toBe('ok_cached');
    expect(res.ai.cachedIds).toEqual(['e1', 'e2']);
    expect(loadState(env.STATE_FILE).aiCallsToday).toBe(1);
  });

  it('treats a cache entry from another provider as a miss', async () => {
    const env = okEnv();
    await explainErrors(fixtureLines(), ctx(env));
    const res = await explainErrors(fixtureLines(), ctx({
      ...env, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k',
      AI_FIXTURE_FILE: path.join(process.cwd(), 'tests/fixtures/anthropicResponse.json'),
    }));
    expect(res.aiStatus).toBe('ok');
    expect(res.provider).toBe('anthropic');
    expect(res.ai.cachedIds).toEqual([]);
  });

  it('treats an expired cache entry as a miss', async () => {
    const env = okEnv({ AI_CACHE_TTL_MIN: '0' });
    await explainErrors(fixtureLines(), ctx(env));
    const res = await explainErrors(fixtureLines(), ctx(env));
    expect(res.aiStatus).toBe('ok');
    expect(loadState(env.STATE_FILE).aiCallsToday).toBe(2);
  });

  it('stops calling once the daily budget is spent', async () => {
    const env = okEnv({ AI_MAX_CALLS_PER_DAY: '1', AI_CACHE_TTL_MIN: '0' });
    await explainErrors(fixtureLines(), ctx(env));
    const res = await explainErrors(fixtureLines(), ctx(env));
    expect(res.aiStatus).toBe('skipped_budget');
    expect(res.ai).toBeNull();
  });

  it('resets the daily counter on a new date', async () => {
    const env = okEnv({ AI_CACHE_TTL_MIN: '0' });
    saveState(env.STATE_FILE, { aiCallsToday: 99, aiCallsDate: '2020-01-01', cache: {} });
    const res = await explainErrors(fixtureLines(), ctx({ ...env, AI_MAX_CALLS_PER_DAY: '5' }));
    expect(res.aiStatus).toBe('ok');
    expect(loadState(env.STATE_FILE).aiCallsToday).toBe(1);
  });

  it('prints the outbound payload and makes no call under AI_DRY_RUN', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ AI_DRY_RUN: '1' })));
    expect(res.aiStatus).toBe('skipped_dry_run');
    expect(res.ai).toBeNull();
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('DRY RUN');
    expect(printed).toContain('/v1/chat/completions');
    expect(printed).not.toContain('sk-test');
    log.mockRestore();
  });

  it('aborts before any request is built when the guard trips', async () => {
    // The guard is a redundant net: with the current table nothing survives redaction to trip it,
    // so a future unmasked shape is simulated here. What matters is that a trip stops the call.
    let requested = 0;
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ AI_FIXTURE_FILE: '' }), {
      guardFn: () => true,
      requestFn: () => { requested += 1; return Promise.resolve({ status: 200, body: '{}' }); },
    }));
    expect(res.aiStatus).toBe('failed_redaction_guard');
    expect(res.ai).toBeNull();
    expect(requested).toBe(0);
    expect(warn.mock.calls.flat().join(' ')).toContain('redaction guard tripped');
  });

  it('proceeds when the guard is clean, and the guard sees the fully redacted payload', async () => {
    const seen: string[] = [];
    const res = await explainErrors(fixtureLines(), ctx(okEnv(), { guardFn: (t: string) => { seen.push(t); return false; } }));
    expect(res.aiStatus).toBe('ok');
    expect(seen).toHaveLength(1);
    // The system prompt legitimately names the .mongodb.net suffix; the log content must not
    // carry a real cluster host, an address or an IP.
    const userPart = seen[0].split('Scan window:')[1];
    expect(userPart).not.toContain('abcdefg.mongodb.net');
    expect(userPart).toContain('[MONGO_HOST]');
    expect(hasResidualSecret(seen[0])).toBe(false);
  });

  it('falls back when the provider response fails validation', async () => {
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, JSON.stringify({ choices: [{ message: { content: 'I cannot help.' }, finish_reason: 'stop' }] }));
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ AI_FIXTURE_FILE: bad })));
    expect(res.aiStatus).toBe('failed_parse');
    expect(res.ai).toBeNull();
  });

  it('falls back when the response is truncated', async () => {
    const trunc = path.join(dir, 'trunc.json');
    fs.writeFileSync(trunc, JSON.stringify({ choices: [{ message: { content: '{"a":1}' }, finish_reason: 'length' }] }));
    expect((await explainErrors(fixtureLines(), ctx(okEnv({ AI_FIXTURE_FILE: trunc })))).aiStatus).toBe('failed_parse');
  });

  it.each([
    ['openai', 'tests/fixtures/openaiResponse.json', { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }],
    ['anthropic', 'tests/fixtures/anthropicResponse.json', { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }],
  ])('produces an identical internal object for the %s wire format', async (_p, fixture, env) => {
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ ...env, AI_FIXTURE_FILE: path.join(process.cwd(), fixture) })));
    expect(res.aiStatus).toBe('ok');
    // Compared against the normalised expectation, not against either fixture's raw wire JSON —
    // the two fixtures deliberately differ in key order and carry a provider-only extra field.
    expect(res.ai.explanations).toEqual(EXPECTED_EXPLANATIONS);
    expect(JSON.stringify(res.ai.explanations)).not.toContain('providerNote');
  });

  // Reachable without any corruption: validateResponse only caps the upper bound, so a provider
  // may answer for fewer groups than were sent. Those groups used to fall into an ungated cache
  // read that could serve an expired or foreign-provider entry under the current footer.
  it('handles a provider that explains fewer groups than were sent', async () => {
    const partial = path.join(dir, 'partial.json');
    fs.writeFileSync(partial, JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            overallSummary: 'Only the first fault could be explained.',
            worstSeverity: 'high',
            explanations: [{
              id: 'e1', whatBroke: 'One job failed.', likelyCause: 'Atlas unreachable.',
              affectedArea: 'e-signature', severity: 'high', nextStep: 'Check the access list.', confidence: 'high',
            }],
          }),
        },
        finish_reason: 'stop',
      }],
    }));
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ AI_FIXTURE_FILE: partial })));
    expect(res.aiStatus).toBe('ok');
    expect(res.errorGroups).toBe(2);
    // The unexplained group is dropped, not back-filled from an ungated cache read.
    expect(res.ai.explanations).toHaveLength(1);
    expect(res.ai.explanations[0].id).toBe('e1');
    expect(res.ai.cachedIds).toEqual([]);
  });

  it('does not resurrect an expired cache entry for an unexplained group', async () => {
    const env = okEnv({ AI_CACHE_TTL_MIN: '0' });
    // Seed the cache with both groups, then expire it and answer for only one.
    await explainErrors(fixtureLines(), ctx(okEnv()));
    const partial = path.join(dir, 'partial2.json');
    fs.writeFileSync(partial, JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            overallSummary: 'One only.',
            worstSeverity: 'low',
            explanations: [{
              id: 'e1', whatBroke: 'One job failed.', likelyCause: 'Atlas unreachable.',
              affectedArea: 'e-signature', severity: 'low', nextStep: 'Check the access list.', confidence: 'low',
            }],
          }),
        },
        finish_reason: 'stop',
      }],
    }));
    const res = await explainErrors(fixtureLines(), ctx({ ...env, AI_FIXTURE_FILE: partial }));
    expect(res.aiStatus).toBe('ok');
    expect(res.ai.explanations).toHaveLength(1);
    expect(res.ai.cachedIds).toEqual([]);
  });

  it('does not serve another provider cache entry for an unexplained group', async () => {
    await explainErrors(fixtureLines(), ctx(okEnv()));
    const partial = path.join(dir, 'partial3.json');
    fs.writeFileSync(partial, JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({
        overallSummary: 'One only.',
        worstSeverity: 'low',
        explanations: [{
          id: 'e1', whatBroke: 'One job failed.', likelyCause: 'Atlas unreachable.',
          affectedArea: 'e-signature', severity: 'low', nextStep: 'Check the access list.', confidence: 'low',
        }],
      }) }],
      stop_reason: 'end_turn',
    }));
    const res = await explainErrors(fixtureLines(), ctx(okEnv({
      AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', AI_FIXTURE_FILE: partial,
    })));
    expect(res.provider).toBe('anthropic');
    expect(res.ai.explanations).toHaveLength(1);
    // The openai-written entry for e2 must not appear under an anthropic footer.
    expect(res.ai.cachedIds).toEqual([]);
  });

  it('names the rejected model on a 404 so the operator can fix AI_MODEL', async () => {
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ AI_FIXTURE_FILE: '', AI_MODEL: 'gpt-does-not-exist' }), {
      requestFn: () => Promise.resolve({ status: 404, body: '{"error":{"message":"model not found"}}' }),
    }));
    expect(res.aiStatus).toBe('failed_model');
    expect(res.ai).toBeNull();
    const logged = warn.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain('gpt-does-not-exist');
    expect(logged).toContain('AI_MODEL');
    expect(logged).not.toContain('sk-test');
  });

  it.each([
    [401, 'failed_auth'],
    [429, 'failed_rate_limit'],
    [500, 'failed_http'],
  ])('maps a live HTTP %i to %s and falls back', async (status, expected) => {
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ AI_FIXTURE_FILE: '', AI_MAX_RETRIES: '0' }), {
      requestFn: () => Promise.resolve({ status, body: '{"error":"x"}' }),
    }));
    expect(res.aiStatus).toBe(expected);
    expect(res.ai).toBeNull();
  });

  it('reports failed_internal rather than throwing when something unexpected breaks', async () => {
    // Row 28 of the failure matrix: an unexpected throw anywhere inside the layer.
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ AI_FIXTURE_FILE: '' }), {
      guardFn: () => { throw new Error('boom from inside the layer'); },
    }));
    expect(res.aiStatus).toBe('failed_internal');
    expect(res.ai).toBeNull();
    expect(warn.mock.calls.flat().map(String).join('\n')).toContain('unexpected failure');
  });

  it('survives a state file that is a directory', async () => {
    const res = await explainErrors(fixtureLines(), ctx(okEnv({ STATE_FILE: dir })));
    expect(['ok', 'failed_internal']).toContain(res.aiStatus);
    expect(res.aiStatus).toBe('ok');
  });

  it('never throws, whatever it is handed', async () => {
    for (const lines of [null, undefined, [], [null], [{}], 'not an array']) {
      await expect(explainErrors(lines, ctx(okEnv()))).resolves.toBeDefined();
    }
  });
});
