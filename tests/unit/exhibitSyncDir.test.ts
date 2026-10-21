import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import syncDir from '../../exhibit-sync-dir.cjs';

const { DEFAULT_EXHIBITS_SYNC_DIR, resolveExhibitSyncDir } = syncDir as {
  DEFAULT_EXHIBITS_SYNC_DIR: string;
  resolveExhibitSyncDir: (
    projectRoot: string,
    rawValue: unknown,
  ) => { dir: string; rejectedReason: string | null };
};

let sandbox: string;
let projectRoot: string;
let defaultDir: string;

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exhibit-sync-')));
  projectRoot = path.join(sandbox, 'project');
  fs.mkdirSync(projectRoot);
  defaultDir = path.join(projectRoot, 'backend-exhibits');
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('resolveExhibitSyncDir', () => {
  it('uses backend-exhibits when EXHIBITS_SYNC_DIR is missing', () => {
    expect(DEFAULT_EXHIBITS_SYNC_DIR).toBe('backend-exhibits');
    for (const value of [undefined, '', '   ', null]) {
      expect(resolveExhibitSyncDir(projectRoot, value)).toEqual({ dir: defaultDir, rejectedReason: null });
    }
  });

  it('uses a valid folder inside the project', () => {
    const result = resolveExhibitSyncDir(projectRoot, 'exhibits-local');

    expect(result).toEqual({ dir: path.join(projectRoot, 'exhibits-local'), rejectedReason: null });
  });

  it('accepts a nested folder and trims surrounding spaces', () => {
    const result = resolveExhibitSyncDir(projectRoot, '  local/exhibits  ');

    expect(result.dir).toBe(path.join(projectRoot, 'local', 'exhibits'));
    expect(result.rejectedReason).toBeNull();
  });

  it.each([
    ['../outside'],
    ['..'],
    ['exhibits-local/../../outside'],
    ['..\\outside'],
    ['/tmp/exhibits'],
    ['C:\\some-folder'],
    ['C:some-folder'],
    ['\\\\server\\share\\exhibits'],
    ['.'],
    ['./'],
    ['.git'],
    ['.git/hooks'],
    ['.GIT'],
    ['.git.'],
    ['.git '],
    ['.Git. /hooks'],
    ['.git...'],
    ['exhibits\0local'],
  ])('falls back to backend-exhibits for %j', (value) => {
    const result = resolveExhibitSyncDir(projectRoot, value);

    expect(result.dir).toBe(defaultDir);
    expect(result.rejectedReason).toEqual(expect.any(String));
  });

  it('accepts folders whose names only look like .. or .git', () => {
    for (const value of ['..foo', '.gitkeep-exhibits', 'backend-exhibits']) {
      expect(resolveExhibitSyncDir(projectRoot, value)).toEqual({
        dir: path.join(projectRoot, value),
        rejectedReason: null,
      });
    }
  });

  it('falls back when the setting names an existing file instead of a folder', () => {
    fs.writeFileSync(path.join(projectRoot, 'server.cjs'), '');

    for (const value of ['server.cjs', 'server.cjs/exhibits']) {
      const result = resolveExhibitSyncDir(projectRoot, value);
      expect(result.dir).toBe(defaultDir);
      expect(result.rejectedReason).toBe('is not a folder');
    }
  });

  it('accepts an existing folder', () => {
    fs.mkdirSync(path.join(projectRoot, 'exhibits-local'));

    const result = resolveExhibitSyncDir(projectRoot, 'exhibits-local');

    expect(result).toEqual({ dir: path.join(projectRoot, 'exhibits-local'), rejectedReason: null });
  });

  it('falls back when a folder inside the project is a link to somewhere outside', () => {
    const outside = path.join(sandbox, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(projectRoot, 'linked'), 'junction');

    for (const value of ['linked', 'linked/exhibits']) {
      const result = resolveExhibitSyncDir(projectRoot, value);
      expect(result.dir).toBe(defaultDir);
      expect(result.rejectedReason).toMatch(/link/);
    }
  });

  it('never returns a folder outside the project', () => {
    const hostile = ['../outside', '../../x', '/etc', 'a/../../b', 'C:\\x', '..\\..\\x'];

    for (const value of hostile) {
      const { dir } = resolveExhibitSyncDir(projectRoot, value);
      const rel = path.relative(projectRoot, dir);
      expect(rel.startsWith('..') || path.isAbsolute(rel)).toBe(false);
    }
    expect(fs.readdirSync(sandbox)).toEqual(['project']);
  });
});
