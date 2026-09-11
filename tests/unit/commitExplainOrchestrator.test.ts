import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
// @ts-expect-error - CommonJS module, no type declarations
import commitExplain from '../../commit-explain.cjs';
// @ts-expect-error - CommonJS helper shared with commit-explain.cjs, no type declarations
import monitorAi from '../../monitor-ai-explain.cjs';

type Explanation = {
  summary: string; behavioralChanges: string[]; riskLevel: string;
  affectedSubsystem: string; isNoOpOrCosmetic: boolean; confidence: string;
};
type CacheEntry = { ai: Explanation; cachedAt: string; provider: string; model: string };
type State = { aiCallsToday: number; aiCallsDate: string; cache: Record<string, CacheEntry> };
type Config = { ok: boolean; provider?: string; model?: string; limits?: { cacheTtlMin: number; maxCallsPerDay: number } };

const {
  findMainMovingLine, loadState, saveState, cacheHit, explainOne,
  resolveDiffBase, getCommitMeta, getCommitDiff, diffPathspecArgs,
  MAIN_REF, ZERO_SHA, EMPTY_TREE_SHA, GIT_CALL_TIMEOUT_MS,
} = commitExplain as {
  findMainMovingLine: (stdin: string) => { localSha: string; remoteSha: string } | null;
  loadState: (path: string) => State;
  saveState: (path: string, state: State) => void;
  cacheHit: (entry: CacheEntry | null, config: Config, now: number, ttlMin: number) => boolean;
  explainOne: (meta: Record<string, unknown>, diff: string, state: State, config: Config) => Promise<{ ai: Explanation | null; aiStatus: string; cached: boolean; text: string }>;
  resolveDiffBase: (repoDir: string, sha: string) => string;
  getCommitMeta: (repoDir: string, sha: string) => { sha: string; author: string; message: string };
  getCommitDiff: (repoDir: string, sha: string) => string;
  diffPathspecArgs: () => string[];
  MAIN_REF: string;
  ZERO_SHA: string;
  EMPTY_TREE_SHA: string;
  GIT_CALL_TIMEOUT_MS: number;
};
const { MAX_CACHE_ENTRIES } = monitorAi as { MAX_CACHE_ENTRIES: number };

const GOOD: Explanation = {
  summary: 'A test summary.', behavioralChanges: ['Something changed.'],
  riskLevel: 'low', affectedSubsystem: 'unknown', isNoOpOrCosmetic: false, confidence: 'high',
};

// =============================================================================
// pre-push ref-parsing logic
// =============================================================================
describe('findMainMovingLine', () => {
  const SHA_A = 'a'.repeat(40);
  const SHA_B = 'b'.repeat(40);

  it('finds no line, and so no Teams action, for a push to a non-main branch', () => {
    const stdin = `${'refs/heads/feature'} ${SHA_B} refs/heads/feature ${SHA_A}\n`;
    expect(findMainMovingLine(stdin)).toBeNull();
  });

  it('finds the line and returns the shas when main is actually advancing', () => {
    const stdin = `refs/heads/main ${SHA_B} ${MAIN_REF} ${SHA_A}\n`;
    expect(findMainMovingLine(stdin)).toEqual({ localSha: SHA_B, remoteSha: SHA_A });
  });

  it('ignores a main line whose local sha equals the remote sha (nothing new)', () => {
    const stdin = `refs/heads/main ${SHA_A} ${MAIN_REF} ${SHA_A}\n`;
    expect(findMainMovingLine(stdin)).toBeNull();
  });

  it('ignores a branch delete (local sha all-zero)', () => {
    const stdin = `refs/heads/main ${ZERO_SHA} ${MAIN_REF} ${SHA_A}\n`;
    expect(findMainMovingLine(stdin)).toBeNull();
  });

  it('finds the main line among several other ref lines in the same push', () => {
    const stdin = [
      `refs/heads/feature-a ${SHA_A} refs/heads/feature-a ${SHA_B}`,
      `refs/heads/main ${SHA_B} ${MAIN_REF} ${SHA_A}`,
      `refs/heads/feature-b ${SHA_A} refs/heads/feature-b ${SHA_A}`,
    ].join('\n');
    expect(findMainMovingLine(stdin)).toEqual({ localSha: SHA_B, remoteSha: SHA_A });
  });

  it('is safe with blank lines, ragged whitespace, and never throws', () => {
    for (const junk of ['', '\n\n\n', '   \n  \t \n', 'not enough fields\n', null, undefined]) {
      expect(() => findMainMovingLine(junk as unknown as string)).not.toThrow();
      expect(findMainMovingLine(junk as unknown as string)).toBeNull();
    }
  });
});

// =============================================================================
// State cache: round-trip + corruption discard
// =============================================================================
describe('loadState / saveState (commit-explain)', () => {
  let dir = '';
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-commit-explain-state-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('treats a missing or corrupt state file as empty, without throwing', () => {
    expect(loadState('')).toEqual({ aiCallsToday: 0, aiCallsDate: '', cache: {} });
    expect(loadState(path.join(dir, 'nope.json'))).toEqual({ aiCallsToday: 0, aiCallsDate: '', cache: {} });
    const corrupt = path.join(dir, 'corrupt.json');
    fs.writeFileSync(corrupt, '{not json');
    expect(() => loadState(corrupt)).not.toThrow();
    expect(loadState(corrupt)).toEqual({ aiCallsToday: 0, aiCallsDate: '', cache: {} });
  });

  it('round-trips a cached explanation keyed by commit sha', () => {
    const p = path.join(dir, 's.json');
    const entry: CacheEntry = { ai: GOOD, cachedAt: '2026-09-10T00:00:00.000Z', provider: 'openai', model: 'm' };
    saveState(p, { aiCallsToday: 2, aiCallsDate: '2026-09-10', cache: { abc123: entry } });
    const state = loadState(p);
    expect(state.aiCallsToday).toBe(2);
    expect(state.cache.abc123).toEqual(entry);
  });

  it('discards a structurally invalid cache entry instead of crashing', () => {
    const p = path.join(dir, 's.json');
    fs.writeFileSync(p, JSON.stringify({
      aiCallsToday: 0,
      aiCallsDate: '2026-09-10',
      cache: {
        good: { ai: GOOD, cachedAt: '2026-09-10T00:00:00.000Z', provider: 'openai', model: 'm' },
        badShape: { ai: { summary: 'x' }, cachedAt: '2026-09-10T00:00:00.000Z', provider: 'openai', model: 'm' },
        badDate: { ai: GOOD, cachedAt: 'not-a-date', provider: 'openai', model: 'm' },
        missingProvider: { ai: GOOD, cachedAt: '2026-09-10T00:00:00.000Z', model: 'm' },
        nullEntry: null,
        arrayEntry: [],
      },
    }));
    const state = loadState(p);
    expect(Object.keys(state.cache)).toEqual(['good']);
  });

  it('writes atomically, leaving no temp file behind', () => {
    const p = path.join(dir, 's.json');
    saveState(p, { aiCallsToday: 1, aiCallsDate: '2026-09-10', cache: {} });
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });

  it('never throws when the state file cannot be written', () => {
    expect(() => saveState(path.join(dir, 'missing-dir', 's.json'), { aiCallsToday: 1, aiCallsDate: 'd', cache: {} })).not.toThrow();
  });

  // Regression coverage: this feature's cache is keyed by commit sha with a deliberately long
  // (30-day) TTL, so without a cap the state file grew by one entry per commit ever explained,
  // forever. saveState must cap and sort by recency exactly like monitor-ai-explain.cjs's own
  // saveState does (same MAX_CACHE_ENTRIES constant, reused rather than re-invented).
  it('caps the cache at MAX_CACHE_ENTRIES, keeping the most recently cached entries', () => {
    const p = path.join(dir, 's.json');
    const cache: Record<string, CacheEntry> = {};
    const total = MAX_CACHE_ENTRIES + 50;
    for (let i = 0; i < total; i += 1) {
      const cachedAt = new Date(Date.now() - i * 1000).toISOString();
      cache[`sha${i}`] = { ai: GOOD, cachedAt, provider: 'openai', model: 'm' };
    }
    saveState(p, { aiCallsToday: 0, aiCallsDate: '2026-09-12', cache });
    const state = loadState(p);
    expect(Object.keys(state.cache)).toHaveLength(MAX_CACHE_ENTRIES);
    // sha0 is the most recently cached (i=0 -> "now"); the oldest (highest i) must be the ones
    // dropped.
    expect(state.cache.sha0).toBeDefined();
    expect(state.cache[`sha${total - 1}`]).toBeUndefined();
  });
});

describe('cacheHit', () => {
  const entry: CacheEntry = { ai: GOOD, cachedAt: '2026-09-10T00:00:00.000Z', provider: 'openai', model: 'gpt-5.6-terra' };
  const config = { provider: 'openai', model: 'gpt-5.6-terra' } as Config;
  const now = Date.parse('2026-09-10T00:00:00.000Z');

  it('hits within the TTL for the same provider and model', () => {
    expect(cacheHit(entry, config, now + 60_000, 43200)).toBe(true);
  });

  it('misses once the TTL has elapsed', () => {
    expect(cacheHit(entry, config, now + 43200 * 60_000 + 1, 43200)).toBe(false);
  });

  it('misses for a different provider or model, even within the TTL', () => {
    expect(cacheHit(entry, { ...config, provider: 'anthropic' } as Config, now, 43200)).toBe(false);
    expect(cacheHit(entry, { ...config, model: 'other' } as Config, now, 43200)).toBe(false);
  });

  it('misses for a null/missing entry', () => {
    expect(cacheHit(null, config, now, 43200)).toBe(false);
  });
});

// =============================================================================
// explainOne — the redaction guard and the daily budget, wired end to end
// =============================================================================
describe('explainOne', () => {
  const META = { sha: 'deadbeef00000000', author: 'Dev <dev@cloudfuze.com>', message: 'feat: add thing' };

  it('skips the LLM call entirely when the diff carries a secret shape, and never fails', async () => {
    const state = { aiCallsToday: 0, aiCallsDate: '', cache: {} };
    const config = { ok: true, provider: 'openai', model: 'm', limits: { cacheTtlMin: 43200, maxCallsPerDay: 40 } };
    const secretDiff = '+ const key = "sk_live_51ABCdefGHIjklMNOpqrSTU";';
    const res = await explainOne(META, secretDiff, state, config);
    expect(res.aiStatus).toBe('skipped_sensitive');
    expect(res.ai).toBeNull();
    expect(res.text).toContain('Explanation skipped — commit contains sensitive content.');
    // No call attempted, so the budget counter must not move.
    expect(state.aiCallsToday).toBe(0);
  });

  it('serves a cache hit without touching the budget counter', async () => {
    const state = {
      aiCallsToday: 3, aiCallsDate: '2026-09-10',
      cache: { [META.sha]: { ai: GOOD, cachedAt: new Date().toISOString(), provider: 'openai', model: 'm' } },
    };
    const config = { ok: true, provider: 'openai', model: 'm', limits: { cacheTtlMin: 43200, maxCallsPerDay: 40 } };
    const res = await explainOne(META, '+ harmless diff', state, config);
    expect(res.aiStatus).toBe('ok_cached');
    expect(res.cached).toBe(true);
    expect(res.ai).toEqual(GOOD);
    expect(state.aiCallsToday).toBe(3);
  });

  it('skips with skipped_budget once the daily cap is spent, without ever calling out', async () => {
    const state = { aiCallsToday: 1, aiCallsDate: new Date().toISOString().slice(0, 10), cache: {} };
    const config = { ok: true, provider: 'openai', model: 'm', limits: { cacheTtlMin: 43200, maxCallsPerDay: 1 } };
    const res = await explainOne(META, '+ harmless diff', state, config);
    expect(res.aiStatus).toBe('skipped_budget');
    expect(res.ai).toBeNull();
  });

  it('never throws on hostile input', async () => {
    const state = { aiCallsToday: 0, aiCallsDate: '', cache: {} };
    const config = { ok: false } as Config;
    await expect(explainOne({}, '', state, config)).resolves.toBeDefined();
  });
});

// =============================================================================
// Git introspection — against a real, throwaway scratch repo (not a re-implementation)
// =============================================================================
describe('git introspection, end to end against a real repo', () => {
  let dir = '';
  const git = (args: string[]) => execFileSync('git', args, {
    cwd: dir, encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-commit-explain-repo-'));
    git(['init', '-q']);
    git(['config', 'commit.gpgsign', 'false']);
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('uses the empty-tree hash as the diff base for a repo\'s very first commit', () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hello\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'first commit']);
    const sha = git(['rev-parse', 'HEAD']).trim();
    expect(resolveDiffBase(dir, sha)).toBe(EMPTY_TREE_SHA);

    const meta = getCommitMeta(dir, sha);
    expect(meta.sha).toBe(sha);
    expect(meta.message).toBe('first commit');
    expect(meta.author).toContain('test@example.com');

    const diff = getCommitDiff(dir, sha);
    expect(diff).toContain('a.txt');
    expect(diff).toContain('+hello');
  });

  it('uses the real parent as the diff base for every later commit', () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'first']);
    const firstSha = git(['rev-parse', 'HEAD']).trim();

    fs.writeFileSync(path.join(dir, 'a.txt'), 'two\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'second']);
    const secondSha = git(['rev-parse', 'HEAD']).trim();

    expect(resolveDiffBase(dir, secondSha)).toBe(firstSha);
    const diff = getCommitDiff(dir, secondSha);
    expect(diff).toContain('-one');
    expect(diff).toContain('+two');
  });

  it('excludes noisy/generated paths (e.g. package-lock.json) from the diff', () => {
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1);\n');
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"lockfileVersion":1}\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'add app and lockfile']);
    const sha = git(['rev-parse', 'HEAD']).trim();
    const diff = getCommitDiff(dir, sha);
    expect(diff).toContain('app.js');
    expect(diff).not.toContain('package-lock.json');
  });

  it('diffPathspecArgs excludes every noisy path the design calls out', () => {
    const args = diffPathspecArgs();
    for (const p of ['package-lock.json', 'yarn.lock']) {
      expect(args).toContain(`:(exclude)${p}`);
    }
    expect(args.some((a: string) => a.includes('node_modules'))).toBe(true);
    expect(args.some((a: string) => a.includes('dist'))).toBe(true);
    expect(args.some((a: string) => a.includes('coverage'))).toBe(true);
    expect(args.some((a: string) => a.includes('uploads'))).toBe(true);
  });
});

// =============================================================================
// End to end through the real script (not a re-implementation) — this is what actually caught
// two real bugs during development: the commit author's email reaching the AI prompt unredacted
// (which would have tripped the guard on every real commit and silently disabled the whole
// feature), and a brand-new `main` branch's first push (remote sha all-zero) crashing the
// `git rev-list` range computation. Neither was visible from unit tests of the pieces in
// isolation — only from driving the real hook entry point end to end.
// =============================================================================
describe('commit-explain.cjs end to end, spawned exactly as the git hooks invoke it', () => {
  let work = '';
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  const git = (args: string[]) => execFileSync('git', args, { cwd: work, encoding: 'utf8', env: gitEnv });
  const scriptPath = path.join(process.cwd(), 'commit-explain.cjs');
  // A function, not a plain object: `work` is reassigned by beforeEach for every test, so this
  // must be re-evaluated at call time, not captured once while `work` is still ''.
  const baseEnv = () => ({
    COMMIT_REPO_DIR: work,
    COMMIT_EXPLAIN_ENV_FILE: path.join(work, 'no-such.env'),
    COMMIT_EXPLAIN_LOG_DIR: path.join(work, 'logs'),
    COMMIT_EXPLAIN_STATE_FILE: path.join(work, 'logs', '.state.json'),
    AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-not-used', AI_MODEL: 'gpt-5.6-luna',
    AI_DRY_RUN: '1', TEAMS_WEBHOOK_URL: '',
  });
  const runScript = (mode: string, input?: string) => spawnSync(process.execPath, [scriptPath, mode], {
    cwd: work,
    input,
    encoding: 'utf8',
    env: { ...gitEnv, ...baseEnv() },
  });
  // Same real subprocess, but with any of the fixed env overridden — used by the retry/timeout
  // regression tests below, which need AI_DRY_RUN off (a real, if fake, network attempt) or a
  // different git timeout.
  const runScriptWithEnv = (mode: string, envOverrides: Record<string, string>, input?: string) => spawnSync(
    process.execPath, [scriptPath, mode],
    { cwd: work, input, encoding: 'utf8', env: { ...gitEnv, ...baseEnv(), ...envOverrides } },
  );

  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'cpq-commit-explain-e2e-'));
    git(['init', '-q']);
    git(['config', 'commit.gpgsign', 'false']);
  });
  afterEach(() => { fs.rmSync(work, { recursive: true, force: true }); });

  it('post-commit: explains HEAD, exits 0, and never sends the raw 40-char SHA to the prompt', () => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'hello\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'first commit']);
    const sha = git(['rev-parse', 'HEAD']).trim();

    const res = runScript('post-commit');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('DRY RUN');
    // The dry-run preview prints the exact outbound request body: proves the 40-char sha never
    // appears in it (a regression test for the "bare 40-char hex trips the guard" bug).
    expect(res.stdout).not.toContain(sha);
    expect(fs.existsSync(path.join(work, 'logs', 'commit-explain-' + new Date().toISOString().slice(0, 10) + '.log'))).toBe(true);
  });

  it('post-commit: the author\'s email never reaches the AI prompt unredacted', () => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'hello\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'first commit']);

    const res = runScript('post-commit');
    expect(res.status).toBe(0);
    // The DRY RUN preview is the exact outbound request body — the only part of stdout that
    // represents what would actually be sent to the LLM. Everything printed AFTER it is the
    // tool's own local, human-facing summary, which legitimately shows the real author (it never
    // leaves the machine) — so this test isolates the preview block rather than checking all of
    // stdout, which would otherwise wrongly flag that local-only line as a leak.
    const previewStart = res.stdout.indexOf('DRY RUN');
    const previewEnd = res.stdout.indexOf('\nCommit ', previewStart);
    const preview = res.stdout.slice(previewStart, previewEnd === -1 ? undefined : previewEnd);
    expect(preview).not.toContain('test@example.com');
    expect(preview).toContain('[EMAIL]');
  });

  it('pre-push: a non-main branch push produces no Teams action at all', () => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'hello\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'c1']);
    const sha = git(['rev-parse', 'HEAD']).trim();
    const stdin = `refs/heads/feature ${sha} refs/heads/feature ${'a'.repeat(40)}\n`;

    const res = runScript('pre-push', stdin);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('');
    expect(res.stdout).not.toContain('[teams]');
  });

  it('pre-push: main advancing explains the range and attempts a Teams post', () => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'v1\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'c1']);
    const base = git(['rev-parse', 'HEAD']).trim();
    fs.writeFileSync(path.join(work, 'a.txt'), 'v2\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'c2']);
    const head = git(['rev-parse', 'HEAD']).trim();
    const stdin = `refs/heads/main ${head} refs/heads/main ${base}\n`;

    const res = runScript('pre-push', stdin);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('DRY RUN');
    expect(res.stdout).toContain('[teams] notification sent: false'); // no webhook configured
  });

  it('pre-push: does not block a delete of the main branch', () => {
    const stdin = `refs/heads/main ${ZERO_SHA} refs/heads/main ${'a'.repeat(40)}\n`;
    const res = runScript('pre-push', stdin);
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('');
  });

  it('pre-push: a brand-new main (remote sha all-zero, its first ever push) does not crash', () => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'hello\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'founding commit']);
    const head = git(['rev-parse', 'HEAD']).trim();
    const stdin = `refs/heads/main ${head} refs/heads/main ${ZERO_SHA}\n`;

    const res = runScript('pre-push', stdin);
    expect(res.status).toBe(0);
    expect(res.stderr).not.toContain('Invalid revision range');
    expect(res.stdout).toContain('DRY RUN');
  });

  // ===========================================================================================
  // Regression: the guard must not false-trip on known-benign git-generated 40-hex shapes
  // (finding #2). Each of these used to come back "skipped_sensitive" on an otherwise-clean
  // commit; they must now reach all the way to the DRY RUN preview like any other clean commit.
  // ===========================================================================================
  it('post-commit: a `git revert` commit is no longer wrongly flagged skipped_sensitive', () => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'v1\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'c1']);
    fs.writeFileSync(path.join(work, 'a.txt'), 'v2\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'c2']);
    git(['revert', '--no-edit', 'HEAD']);

    const res = runScript('post-commit');
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('skipped_sensitive');
    expect(res.stdout).toContain('DRY RUN');
  });

  it('post-commit: a cherry-pick -x commit is no longer wrongly flagged skipped_sensitive', () => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'v1\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'c1']);
    git(['checkout', '-q', '-b', 'other']);
    fs.writeFileSync(path.join(work, 'b.txt'), 'v1\n');
    git(['add', 'b.txt']);
    git(['commit', '-q', '-m', 'add b.txt']);
    const toCherryPick = git(['rev-parse', 'HEAD']).trim();
    git(['checkout', '-q', 'master']);
    git(['cherry-pick', '-x', toCherryPick]);

    const res = runScript('post-commit');
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('skipped_sensitive');
    expect(res.stdout).toContain('DRY RUN');
  });

  it('post-commit: a commit editing commit-explain.cjs itself (EMPTY_TREE_SHA/ZERO_SHA literals) is not flagged skipped_sensitive', () => {
    const src = fs.readFileSync(scriptPath, 'utf8');
    fs.mkdirSync(path.join(work, 'vendored'), { recursive: true });
    fs.writeFileSync(path.join(work, 'vendored', 'commit-explain.cjs'), src);
    git(['add', 'vendored/commit-explain.cjs']);
    git(['commit', '-q', '-m', 'chore: vendor a copy of commit-explain.cjs']);

    const res = runScript('post-commit');
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('skipped_sensitive');
    expect(res.stdout).toContain('DRY RUN');
  });

  // ===========================================================================================
  // Regression: an unref'd retry-delay timer inside the shared callProvider (finding #1) let
  // Node exit before a scheduled retry ever fired, in THIS short-lived CLI script specifically —
  // nothing else keeps its event loop alive the way monitor-user-logs.cjs's longer-running scan
  // does. Reproduced with AI_DRY_RUN off and AI_BASE_URL pointing at a closed local port (an
  // immediate, real ECONNREFUSED, exactly like QA's repro), and AI_MAX_RETRIES=1. Before the fix
  // this printed and logged NOTHING — the process vanished mid-retry. Now it must run the retry
  // to completion and record a real, non-empty failure reason.
  // ===========================================================================================
  it('post-commit: a failed request survives long enough for its scheduled retry to complete (does not vanish)', () => {
    fs.writeFileSync(path.join(work, 'a.txt'), 'hello\n');
    git(['add', 'a.txt']);
    git(['commit', '-q', '-m', 'first commit']);

    const res = runScriptWithEnv('post-commit', {
      AI_DRY_RUN: '', AI_ALLOW_INSECURE: '1', AI_BASE_URL: 'http://127.0.0.1:1',
      AI_MAX_RETRIES: '1', AI_TIMEOUT_MS: '1000', AI_TOTAL_BUDGET_MS: '10000',
    });

    expect(res.status).toBe(0);
    // The process must have produced real, recorded output — not silently vanished. `explainOne`
    // only renders "Explanation not available" once execution has actually come back from the
    // (failed, retried) provider call — the old bug meant the process exited before that,
    // producing empty stdout and no log file at all.
    expect(res.stdout.trim().length).toBeGreaterThan(0);
    expect(res.stdout).toContain('Explanation not available this run');
    expect(fs.existsSync(path.join(work, 'logs', 'commit-explain-' + new Date().toISOString().slice(0, 10) + '.log'))).toBe(true);
  }, 15000);

  // ===========================================================================================
  // Regression: HARD_TIMEOUT_MS's setTimeout watchdog cannot help against a hung execFileSync
  // call (finding #3) — it blocks Node's one thread synchronously, so the watchdog never gets a
  // turn to run. `sh()` and resolveDiffBase's direct call now pass {timeout, killSignal}, so a
  // hung git subprocess is killed and degrades gracefully instead of blocking forever. The hang
  // is real (a `diff.*.textconv` driver that sleeps), not simulated, so this proves the actual
  // child_process option takes effect end to end.
  // ===========================================================================================
  it('post-commit: a hung git diff subprocess times out and degrades gracefully instead of blocking forever', () => {
    fs.writeFileSync(path.join(work, 'hang.txt'), 'v1\n');
    git(['add', 'hang.txt']);
    git(['commit', '-q', '-m', 'add hang.txt']);
    fs.writeFileSync(path.join(work, '.gitattributes'), '*.txt diff=hangdriver\n');
    git(['config', 'diff.hangdriver.textconv', 'sh -c "sleep 999"']);
    git(['add', '.gitattributes']);
    git(['commit', '-q', '-m', 'wire up the hang driver']);
    fs.writeFileSync(path.join(work, 'hang.txt'), 'v2\n');
    git(['add', 'hang.txt']);
    git(['commit', '-q', '-m', 'trigger the hung diff']);

    const start = Date.now();
    const res = runScriptWithEnv('post-commit', { COMMIT_EXPLAIN_GIT_TIMEOUT_MS: '800' });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(0);
    // Must return well before the 999s sleep — proves the timeout actually fired rather than the
    // test happening to finish for an unrelated reason.
    expect(elapsed).toBeLessThan(30000);
    expect(res.stdout).toContain('DRY RUN'); // execution continued past the hung diff
  }, 35000);

  it('exports GIT_CALL_TIMEOUT_MS, clamped comfortably under HARD_TIMEOUT_MS by construction', () => {
    expect(typeof GIT_CALL_TIMEOUT_MS).toBe('number');
    expect(GIT_CALL_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
