#!/usr/bin/env node
'use strict';

/**
 * One-time setup for the Commit Logic Explainer.
 *
 * Points git at this repo's own hooks directory (scripts/hooks) instead of the default
 * .git/hooks, and marks the two hook files executable. Safe to re-run at any time — it only
 * ever sets a git config value and a file mode, never touches history or working files.
 *
 * Run after cloning: `node scripts/hooks/install.cjs`
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOKS_PATH = 'scripts/hooks';
const HOOK_FILES = ['post-commit', 'pre-push'];

function main() {
  let repoRoot;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch (e) {
    console.error('[install] not inside a git repository — nothing to do:', e.message);
    process.exitCode = 1;
    return;
  }

  try {
    execFileSync('git', ['config', 'core.hooksPath', HOOKS_PATH], { cwd: repoRoot });
  } catch (e) {
    console.error('[install] could not set core.hooksPath:', e.message);
    process.exitCode = 1;
    return;
  }

  for (const name of HOOK_FILES) {
    const file = path.join(repoRoot, HOOKS_PATH, name);
    if (!fs.existsSync(file)) {
      console.error(`[install] warning: expected hook file not found: ${file}`);
      continue;
    }
    try {
      // POSIX only. A harmless no-op on Windows, where Git for Windows runs hooks through its
      // own sh.exe regardless of the file's mode bit.
      fs.chmodSync(file, 0o755);
    } catch (e) {
      // Not fatal — some Windows filesystems reject or silently ignore chmod.
    }
  }

  console.log(`[install] core.hooksPath set to ${HOOKS_PATH}`);
  console.log('[install] Commit Logic Explainer is now active for this clone.');
  console.log('[install] To enable explanations, copy .env.commit-explain.example to');
  console.log('[install] .env.commit-explain and set AI_PROVIDER (+ the matching API key).');
  console.log('[install] Without that file, the hooks still run and exit cleanly — they just');
  console.log('[install] produce no AI explanation.');
}

main();
