'use strict';

// Picks where the boot-time DB→folder exhibit sync writes; a local override keeps live-DB files out of git.

const fs = require('fs');
const path = require('path');

const DEFAULT_EXHIBITS_SYNC_DIR = 'backend-exhibits';

function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel !== '' && rel.split(path.sep)[0] !== '..' && !path.isAbsolute(rel);
}

function isAbsoluteOnAnyPlatform(value) {
  return path.win32.isAbsolute(value) || path.posix.isAbsolute(value) || /^[a-z]:/i.test(value);
}

// Windows drops trailing dots and spaces, so ".git." and ".GIT " both open the real .git folder.
function isGitFolder(root, resolved) {
  const firstSegment = path.relative(root, resolved).split(path.sep)[0];
  return firstSegment.replace(/[. ]+$/, '').toLowerCase() === '.git';
}

function nearestExistingPath(target) {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function rejectionReason(root, value) {
  if (value.includes('\0')) return 'contains a null byte';
  if (isAbsoluteOnAnyPlatform(value)) return 'must be a folder inside the project, not an absolute path';
  const resolved = path.resolve(root, value);
  if (!isInside(root, resolved)) return 'points outside the project folder';
  if (isGitFolder(root, resolved)) return 'points inside .git';

  const existing = nearestExistingPath(resolved);
  // A junction or symlink inside the project could still point elsewhere, so the real location is checked too.
  const realTarget = path.join(fs.realpathSync(existing), path.relative(existing, resolved));
  if (!isInside(fs.realpathSync(root), realTarget)) return 'resolves outside the project folder through a link';
  if (!fs.statSync(existing).isDirectory()) return 'is not a folder';
  return null;
}

function resolveExhibitSyncDir(projectRoot, rawValue) {
  const root = path.resolve(projectRoot);
  const fallback = path.join(root, DEFAULT_EXHIBITS_SYNC_DIR);
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) return { dir: fallback, rejectedReason: null };

  let reason;
  try {
    reason = rejectionReason(root, value);
  } catch (error) {
    reason = `could not be checked (${error.code || 'error'})`;
  }
  if (reason) return { dir: fallback, rejectedReason: reason };
  return { dir: path.resolve(root, value), rejectedReason: null };
}

module.exports = { DEFAULT_EXHIBITS_SYNC_DIR, resolveExhibitSyncDir };
