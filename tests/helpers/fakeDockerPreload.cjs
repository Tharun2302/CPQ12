/**
 * Test preload for monitor-user-logs.cjs: `node --require <this> monitor-user-logs.cjs`.
 *
 * Because it runs before the script is loaded, the script's own
 * `const { spawnSync } = require('child_process')` destructure picks up this wrapper.
 *
 * Only the binary name is swapped — the real spawnSync still does the spawning, so stream
 * buffering, maxBuffer/ENOBUFS, exit status and encoding are genuine Node behaviour rather
 * than a hand-rolled fake. Non-docker calls pass straight through.
 *
 * FAKE_DOCKER_CALL_FILE, when set, receives one JSON line per intercepted call so a test can
 * assert on the arguments and options the monitor passed (and that docker was called at all).
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const FAKE_DOCKER = path.join(__dirname, 'fakeDocker.cjs');
const realSpawnSync = cp.spawnSync;
const realExecFileSync = cp.execFileSync;

function recordCall(command, args, options) {
  const callFile = process.env.FAKE_DOCKER_CALL_FILE || '';
  if (!callFile) return;
  fs.appendFileSync(callFile, JSON.stringify({
    command,
    args: args || [],
    maxBuffer: options ? options.maxBuffer : undefined,
    timeout: options ? options.timeout : undefined,
    encoding: options ? options.encoding : undefined,
  }) + '\n');
}

cp.spawnSync = function patchedSpawnSync(command, args, options) {
  if (command !== 'docker') return realSpawnSync.apply(this, arguments);
  recordCall(command, args, options);
  return realSpawnSync(process.execPath, [FAKE_DOCKER].concat(args || []), options);
};

// Also patched so these tests fail against the pre-fix stdout-only implementation for the right
// reason — missing stderr lines, not a missing docker binary.
cp.execFileSync = function patchedExecFileSync(command, args, options) {
  if (command !== 'docker') return realExecFileSync.apply(this, arguments);
  recordCall(command, args, options);
  return realExecFileSync(process.execPath, [FAKE_DOCKER].concat(args || []), options);
};
