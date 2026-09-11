import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error - CommonJS module, no type declarations
import commitAi from '../../commit-ai-explain.cjs';
// @ts-expect-error - CommonJS helper shared with commit-ai-explain.cjs, no type declarations
import monitorAi from '../../monitor-ai-explain.cjs';

type Explanation = {
  summary: string;
  behavioralChanges: string[];
  riskLevel: string;
  affectedSubsystem: string;
  isNoOpOrCosmetic: boolean;
  confidence: string;
};
type Outcome = { ai: Explanation | null; aiStatus: string; provider: string | null; model: string | null; billable: boolean };

const {
  buildPrompt, validateExplanation, validateResponse, explainCommit,
  renderPlainText, renderTeamsBlock, SYSTEM_PROMPT, RESPONSE_SCHEMA,
} = commitAi as {
  buildPrompt: (commit: Record<string, unknown>, ctx?: Record<string, unknown>) => { system: string; user: string };
  validateExplanation: (item: unknown) => Explanation | null;
  validateResponse: (text: unknown, finishReason: unknown) => Explanation | null;
  explainCommit: (commit: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<Outcome>;
  renderPlainText: (meta: Record<string, unknown>, ai: Explanation | null) => string;
  renderTeamsBlock: (meta: Record<string, unknown>, ai: Explanation | null, opts?: Record<string, unknown>) => string;
  SYSTEM_PROMPT: string;
  RESPONSE_SCHEMA: unknown;
};
const { hasResidualSecret } = monitorAi as { hasResidualSecret: (text: unknown) => boolean };
const { runCommitProviderCall } = commitAi as unknown as {
  runCommitProviderCall: (config: Record<string, unknown>, prompt: { system: string; user: string }, opts?: Record<string, unknown>)
    => Promise<{ ok: boolean; json?: unknown; reason?: string; detail?: string | null; billable: boolean }>;
};

const GOOD: Explanation = {
  summary: 'Discounts above 15% now trigger a high-discount approval email.',
  behavioralChanges: [
    'Quotes with a discount over 15% now email Team Lead, Technical and Legal for approval.',
  ],
  riskLevel: 'high',
  affectedSubsystem: 'pricing-quotes',
  isNoOpOrCosmetic: false,
  confidence: 'high',
};

const META = { sha: 'abcdef1234567890', author: 'Dev One <dev@cloudfuze.com>', message: 'feat: add high-discount alert' };

// =============================================================================
// Schema validation
// =============================================================================
describe('validateExplanation — accepts good output, rejects malformed output', () => {
  it('accepts a well-formed explanation and normalises nothing away', () => {
    expect(validateExplanation(GOOD)).toEqual(GOOD);
  });

  it('accepts a no-op/cosmetic explanation', () => {
    const cosmetic: Explanation = { ...GOOD, isNoOpOrCosmetic: true, riskLevel: 'low', confidence: 'high' };
    expect(validateExplanation(cosmetic)).toEqual(cosmetic);
  });

  it.each([
    ['missing summary', { ...GOOD, summary: undefined }],
    ['empty summary', { ...GOOD, summary: '' }],
    ['missing behavioralChanges', { ...GOOD, behavioralChanges: undefined }],
    ['empty behavioralChanges array', { ...GOOD, behavioralChanges: [] }],
    ['more than 6 behavioralChanges', { ...GOOD, behavioralChanges: Array(7).fill('x') }],
    ['a non-string in behavioralChanges', { ...GOOD, behavioralChanges: [123] }],
    ['missing riskLevel', { ...GOOD, riskLevel: undefined }],
    ['riskLevel outside the enum', { ...GOOD, riskLevel: 'apocalyptic' }],
    ['missing affectedSubsystem', { ...GOOD, affectedSubsystem: undefined }],
    ['affectedSubsystem outside the enum', { ...GOOD, affectedSubsystem: 'kitchen' }],
    ['isNoOpOrCosmetic not a boolean', { ...GOOD, isNoOpOrCosmetic: 'true' }],
    ['missing confidence', { ...GOOD, confidence: undefined }],
    ['confidence outside the enum', { ...GOOD, confidence: 'certain' }],
    ['null item', null],
    ['array item', []],
    ['a string instead of an object', 'not an object'],
  ])('rejects %s by returning null, without throwing', (_name, bad) => {
    expect(() => validateExplanation(bad)).not.toThrow();
    expect(validateExplanation(bad)).toBeNull();
  });

  it('truncates an oversized summary instead of rejecting the whole answer', () => {
    const long = { ...GOOD, summary: 'x'.repeat(500) };
    const out = validateExplanation(long) as Explanation;
    expect(out).not.toBeNull();
    expect(out.summary).toHaveLength(200);
  });

  it('truncates an oversized behavioralChanges entry', () => {
    const long = { ...GOOD, behavioralChanges: ['y'.repeat(400)] };
    const out = validateExplanation(long) as Explanation;
    expect(out.behavioralChanges[0]).toHaveLength(160);
  });

  it('strips control characters and collapses whitespace (anti-header-injection)', () => {
    const hostile = { ...GOOD, summary: 'line one\nHEALTHY\r\nline two   three' };
    const out = validateExplanation(hostile) as Explanation;
    expect(out.summary).toBe('line one HEALTHY line two three');
  });
});

describe('validateResponse — the wire-format entry point', () => {
  it('accepts a well-formed JSON response with finishReason complete', () => {
    expect(validateResponse(JSON.stringify(GOOD), 'complete')).toEqual(GOOD);
  });

  it.each([
    ['finishReason truncated', () => validateResponse(JSON.stringify(GOOD), 'truncated')],
    ['finishReason refused', () => validateResponse(JSON.stringify(GOOD), 'refused')],
    ['finishReason null', () => validateResponse(JSON.stringify(GOOD), null)],
    ['null text', () => validateResponse(null, 'complete')],
    ['empty text', () => validateResponse('   ', 'complete')],
    ['prose with no JSON', () => validateResponse('I cannot help with that.', 'complete')],
    ['a JSON array at the top level', () => validateResponse('[1,2,3]', 'complete')],
  ])('rejects %s by returning null, without throwing', (_name, run) => {
    expect(run).not.toThrow();
    expect(run()).toBeNull();
  });

  it('coerces a fenced-code-block reply via one brace extraction', () => {
    const wrapped = `Here you go:\n\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\`\n`;
    expect(validateResponse(wrapped, 'complete')).toEqual(GOOD);
  });
});

// =============================================================================
// Schema shape sanity (matches the design's field list)
// =============================================================================
describe('RESPONSE_SCHEMA', () => {
  it('requires exactly the fields the design specifies', () => {
    const schema = RESPONSE_SCHEMA as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required.sort()).toEqual([
      'affectedSubsystem', 'behavioralChanges', 'confidence',
      'isNoOpOrCosmetic', 'riskLevel', 'summary',
    ].sort());
    expect(Object.keys(schema.properties).sort()).toEqual(schema.required.sort());
  });
});

// =============================================================================
// Prompt assembly
// =============================================================================
describe('buildPrompt', () => {
  it('includes the sha, author, message and diff', () => {
    const prompt = buildPrompt({ sha: 'abc123', author: 'A <a@b.com>', message: 'fix: x', diff: '+ some line' });
    expect(prompt.user).toContain('abc123');
    expect(prompt.user).toContain('A <a@b.com>');
    expect(prompt.user).toContain('fix: x');
    expect(prompt.user).toContain('+ some line');
    expect(prompt.system).toBe(SYSTEM_PROMPT);
  });

  it('caps an oversized diff at maxDiffChars', () => {
    const prompt = buildPrompt({ sha: 's', author: 'a', message: 'm', diff: 'D'.repeat(9000) }, { maxDiffChars: 100 });
    // capScanLine appends a "…[+N chars truncated]" marker, so the diff section is capped, not silently cut.
    expect(prompt.user).toContain('chars truncated');
  });

  it('never throws on missing fields', () => {
    expect(() => buildPrompt({})).not.toThrow();
    expect(() => buildPrompt(undefined as unknown as Record<string, unknown>)).not.toThrow();
  });
});

// =============================================================================
// explainCommit — dry run, fixture, guard, failure mapping
// =============================================================================
describe('explainCommit', () => {
  it('returns skipped_disabled with AI_PROVIDER unset, and is not billable', async () => {
    const res = await explainCommit({ sha: 's', author: 'a', message: 'm', diff: 'd' }, { env: {} });
    expect(res.aiStatus).toBe('skipped_disabled');
    expect(res.ai).toBeNull();
    expect(res.billable).toBe(false);
  });

  it('prints the outbound payload and makes no call under AI_DRY_RUN, and is not billable', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await explainCommit(
      { sha: 's', author: 'a', message: 'm', diff: 'd' },
      { env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_DRY_RUN: '1' } },
    );
    expect(res.aiStatus).toBe('skipped_dry_run');
    expect(res.billable).toBe(false);
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('DRY RUN');
    expect(printed).not.toContain('sk-test');
    log.mockRestore();
  });

  it('aborts before any request is built when the guard trips, and is not billable', async () => {
    let requested = 0;
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await explainCommit(
      { sha: 's', author: 'a', message: 'm', diff: 'd' },
      {
        env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' },
        guardFn: () => true,
        requestFn: () => { requested += 1; return Promise.resolve({ status: 200, body: '{}' }); },
      },
    );
    expect(res.aiStatus).toBe('failed_redaction_guard');
    expect(res.ai).toBeNull();
    expect(res.billable).toBe(false);
    expect(requested).toBe(0);
    warn.mockRestore();
  });

  it('never lets a diff carrying a fake secret shape reach the guard clean', async () => {
    // A canary secret shape the redaction table does not mask (see monitor-ai-explain's own
    // hasResidualSecret tests) must still trip the guard when embedded in a commit diff.
    const secretDiff = '+ const key = "sk_live_51ABCdefGHIjklMNOpqrSTU";';
    expect(hasResidualSecret(secretDiff)).toBe(true);
    const res = await explainCommit(
      { sha: 's', author: 'a', message: 'm', diff: secretDiff },
      { env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' } },
    );
    expect(res.aiStatus).toBe('failed_redaction_guard');
    expect(res.ai).toBeNull();
  });

  it('is billable and succeeds from a fixture file', async () => {
    const fixture = { choices: [{ message: { content: JSON.stringify(GOOD) }, finish_reason: 'stop' }] };
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-ai-'));
    const file = path.join(dir, 'fixture.json');
    fs.writeFileSync(file, JSON.stringify(fixture));
    const res = await explainCommit(
      { sha: 's', author: 'a', message: 'm', diff: 'd' },
      { env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_FIXTURE_FILE: file } },
    );
    expect(res.aiStatus).toBe('ok');
    expect(res.billable).toBe(true);
    expect(res.ai).toEqual(GOOD);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to failed_parse (still billable) on a malformed provider response', async () => {
    const res = await explainCommit(
      { sha: 's', author: 'a', message: 'm', diff: 'd' },
      {
        env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' },
        requestFn: () => Promise.resolve({
          status: 200,
          body: JSON.stringify({ choices: [{ message: { content: 'not json' }, finish_reason: 'stop' }] }),
        }),
      },
    );
    expect(res.aiStatus).toBe('failed_parse');
    expect(res.ai).toBeNull();
    expect(res.billable).toBe(true);
  });

  it.each([
    [401, 'failed_auth'],
    [404, 'failed_model'],
    [429, 'failed_rate_limit'],
    [500, 'failed_http'],
  ])('maps a live HTTP %i to %s and never throws', async (status, expected) => {
    const res = await explainCommit(
      { sha: 's', author: 'a', message: 'm', diff: 'd' },
      {
        env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', AI_MAX_RETRIES: '0' },
        requestFn: () => Promise.resolve({ status, body: '{"error":"x"}' }),
      },
    );
    expect(res.aiStatus).toBe(expected);
    expect(res.ai).toBeNull();
  });

  it('reports failed_internal rather than throwing when something unexpected breaks', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await explainCommit(
      { sha: 's', author: 'a', message: 'm', diff: 'd' },
      { env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' }, guardFn: () => { throw new Error('boom'); } },
    );
    expect(res.aiStatus).toBe('failed_internal');
    expect(res.ai).toBeNull();
    warn.mockRestore();
  });

  it('never throws, whatever it is handed', async () => {
    for (const commit of [null, undefined, {}, { diff: 42 }]) {
      await expect(explainCommit(commit as unknown as Record<string, unknown>, { env: {} })).resolves.toBeDefined();
    }
  });
});

// =============================================================================
// Rendering
// =============================================================================
describe('renderPlainText / renderTeamsBlock', () => {
  it('renders the plain-text form with all fields', () => {
    const out = renderPlainText(META, GOOD);
    expect(out).toContain('Summary: Discounts above 15%');
    expect(out).toContain('Subsystem: Pricing & quotes');
    expect(out).toContain('Risk: HIGH');
    expect(out).toContain('  - Quotes with a discount over 15%');
    expect(out).toContain('Confidence: high');
  });

  it('renders a no-op/cosmetic explanation plainly, without a risk section', () => {
    const cosmetic = { ...GOOD, isNoOpOrCosmetic: true };
    const out = renderPlainText(META, cosmetic);
    expect(out).toContain('No behavioral change (cosmetic / formatting / refactor only).');
    expect(out).not.toContain('Subsystem:');
  });

  it('renders a "not available" line when ai is null', () => {
    expect(renderPlainText(META, null)).toContain('(not available this run)');
  });

  it('renders one Teams block per commit, marking cached entries', () => {
    const fresh = renderTeamsBlock(META, GOOD, { cached: false });
    const stale = renderTeamsBlock(META, GOOD, { cached: true });
    expect(fresh).not.toContain('↻');
    expect(stale).toContain('↻ from an earlier explanation');
    expect(fresh).toContain('HIGH risk');
  });

  it('renders an "unavailable" block when ai is null', () => {
    expect(renderTeamsBlock(META, null, {})).toContain('(explanation not available)');
  });

  it('end to end: a hostile model reply can never inject an extra line into the rendered block', () => {
    // validateResponse (not a hand-built object) is what every real caller passes to
    // renderTeamsBlock, so this proves the header-injection defence holds across the real path,
    // not just at validateExplanation's own boundary.
    const hostile = { ...GOOD, summary: 'line one\nFAKE HEALTHY BANNER\r\nline two' };
    const validated = validateResponse(JSON.stringify(hostile), 'complete') as Explanation;
    const block = renderTeamsBlock(META, validated, {});
    // Merged into one line, spaces where the raw text had control characters/newlines — never a
    // standalone line of its own that could be mistaken for a line the tool itself wrote.
    expect(block).toContain('line one FAKE HEALTHY BANNER line two');
    expect(block.split('\n').filter((l) => l.trim() === 'FAKE HEALTHY BANNER')).toHaveLength(0);
  });
});

// =============================================================================
// Extraction regression guard: commit-ai-explain.cjs must import sanitiseField/parseLoose from
// monitor-ai-explain.cjs, not keep its own duplicate copy (mirrors teamsNotify.test.ts's pattern
// for postToTeams). The duplicate here specifically had its control-char regex written with raw,
// invisible NUL/unit-separator/DEL bytes typed directly into the source instead of readable
// \u-escape sequences — this guard makes that class of bug structurally impossible to reintroduce.
// =============================================================================
describe('extraction — commit-ai-explain.cjs no longer duplicates sanitiseField/parseLoose', () => {
  it('defines neither function itself and destructures both from monitor-ai-explain.cjs', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(process.cwd(), 'commit-ai-explain.cjs'), 'utf8');
    expect(src).not.toMatch(/function sanitiseField/);
    expect(src).not.toMatch(/function parseLoose/);
    expect(src).toMatch(/require\(['"]\.\/monitor-ai-explain\.cjs['"]\)/);
    expect(src).toMatch(/\bsanitiseField\b/);
    expect(src).toMatch(/\bparseLoose\b/);
  });

  it('validateExplanation neutralises a phishing-shaped link the same way the shared sanitiseField does', () => {
    // Proves the shared fix (finding #5) actually reaches this caller's output, not just
    // monitor-ai-explain.cjs's own callers.
    const hostile = { ...GOOD, summary: 'See [details](https://evil.example/phish) for the full change.' };
    const out = validateExplanation(hostile) as Explanation;
    expect(out.summary).toContain('[link removed]');
    expect(out.summary).not.toContain('evil.example');
  });
});

// =============================================================================
// runCommitProviderCall — the split extracted for finding #8 (mirrors monitor-ai-explain.cjs's
// runProviderCall/explainErrors split, so explainCommit stays orchestration-only)
// =============================================================================
describe('runCommitProviderCall', () => {
  const prompt = { system: 'sys', user: 'usr' };
  const baseConfig = {
    adapter: {
      buildRequest: () => ({ path: '/v1/chat/completions', headers: {}, body: {} }),
    },
    model: 'gpt-5.6-test',
    apiKey: 'sk-test', baseUrl: 'https://api.openai.com', authStyle: 'bearer',
    limits: { maxTokens: 100, effort: 'low', effectiveTimeoutMs: 100, totalBudgetMs: 1000, maxRetries: 0 },
    provider: 'openai',
    dryRun: false,
    fixtureFile: '',
  };

  it('is exported so explainCommit can delegate to it', () => {
    expect(typeof runCommitProviderCall).toBe('function');
  });

  it('reports skipped_dry_run and billable:false under dry run, without calling requestFn', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let called = false;
    const res = await runCommitProviderCall({ ...baseConfig, dryRun: true }, prompt, {
      requestFn: () => { called = true; return Promise.resolve({ status: 200, body: '{}' }); },
    });
    expect(res).toMatchObject({ ok: false, reason: 'skipped_dry_run', billable: false });
    expect(called).toBe(false);
    log.mockRestore();
  });

  it('reads a fixture file and reports billable:true', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-commit-provider-'));
    const file = path.join(dir, 'fixture.json');
    fs.writeFileSync(file, JSON.stringify({ ok: 1 }));
    const res = await runCommitProviderCall({ ...baseConfig, fixtureFile: file }, prompt, {});
    expect(res).toMatchObject({ ok: true, billable: true, json: { ok: 1 } });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('makes a real (injected) call and reports billable:true either way', async () => {
    const res = await runCommitProviderCall(baseConfig, prompt, {
      requestFn: () => Promise.resolve({ status: 500, body: 'boom' }),
    });
    expect(res.billable).toBe(true);
    expect(res.ok).toBe(false);
  });
});
