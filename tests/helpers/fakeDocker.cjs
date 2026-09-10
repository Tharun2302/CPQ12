#!/usr/bin/env node
/**
 * Stands in for the real `docker` CLI in tests.
 *
 * Emits fixture text on stdout and/or stderr and exits with a chosen status, so a test can
 * reproduce the production shape of the bug: application `"level":"error"` lines arriving on
 * stderr only. Optional filler bytes let a test push one stream past a maxBuffer limit.
 *
 * Driven entirely by env vars so a single stub covers every scenario:
 *   FAKE_DOCKER_STDOUT_FILE        file whose contents go to stdout
 *   FAKE_DOCKER_STDERR_FILE        file whose contents go to stderr
 *   FAKE_DOCKER_STDOUT_FILLER      bytes of harmless info lines emitted on stdout first
 *   FAKE_DOCKER_STDERR_FILLER      bytes of harmless info lines emitted on stderr first
 *   FAKE_DOCKER_EXIT               exit status (default 0)
 */

const fs = require('fs');

// fs.writeSync on a pipe can accept fewer bytes than offered, so drain the whole buffer.
function writeAll(fd, text) {
  const buf = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < buf.length) offset += fs.writeSync(fd, buf, offset);
}

function fillerLines(bytes) {
  if (!bytes) return '';
  const out = [];
  let size = 0;
  let i = 0;
  while (size < bytes) {
    const line = `{"timestamp":"2026-09-10T10:00:00.000Z","level":"info","source":"server","message":"filler padding line ${i}"}\n`;
    out.push(line);
    size += line.length;
    i += 1;
  }
  return out.join('');
}

function emit(fd, file, fillerBytes) {
  const filler = fillerLines(parseInt(fillerBytes || '0', 10));
  const body = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (filler || body) writeAll(fd, filler + body);
}

emit(1, process.env.FAKE_DOCKER_STDOUT_FILE, process.env.FAKE_DOCKER_STDOUT_FILLER);
emit(2, process.env.FAKE_DOCKER_STDERR_FILE, process.env.FAKE_DOCKER_STDERR_FILLER);

process.exitCode = parseInt(process.env.FAKE_DOCKER_EXIT || '0', 10);
