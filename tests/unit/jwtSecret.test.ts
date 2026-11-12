import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isWeakJwtSecret, DEFAULT_JWT_SECRET } = require('../../jwt-secret.cjs') as {
  isWeakJwtSecret: (value: unknown) => boolean;
  DEFAULT_JWT_SECRET: string;
};

describe('isWeakJwtSecret', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 12345],
    ['an empty string', ''],
    ['whitespace', '                                    '],
    ['a short secret', 'short-secret'],
    ['31 characters', 'a'.repeat(31)],
    ['the known default', DEFAULT_JWT_SECRET],
    ['the known default with padding', `  ${DEFAULT_JWT_SECRET}  `],
  ])('flags %s as weak', (_label, value) => {
    expect(isWeakJwtSecret(value)).toBe(true);
  });

  it.each([
    ['32 characters', 'a'.repeat(32)],
    ['64 random hex characters', crypto.randomBytes(32).toString('hex')],
    ['a long random base64 secret', crypto.randomBytes(48).toString('base64')],
  ])('accepts %s', (_label, value) => {
    expect(isWeakJwtSecret(value)).toBe(false);
  });

  it('the default string is the one server.cjs falls back to', () => {
    expect(DEFAULT_JWT_SECRET).toBe('your-super-secret-jwt-key-change-in-production');
  });
});

describe('server.cjs boot check', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
  const at = serverSrc.indexOf('const JWT_SECRET =');
  const block = serverSrc.slice(at, serverSrc.indexOf('\n// Every jwt.verify', at));

  it('keeps the fallback, warns once and never prints or exits', () => {
    expect(block).toContain('process.env.JWT_SECRET || jwtSecretCheck.DEFAULT_JWT_SECRET');
    expect(block).toContain("logger.error('JWT_SECRET is missing or weak; set a strong secret'");
    expect(block).toMatch(/NODE_ENV\)\.trim\(\)\.toLowerCase\(\) === 'production'/);
    expect(block).not.toMatch(/process\.exit|\$\{.*JWT_SECRET/);
    expect(block.match(/logger\.error/g)).toHaveLength(1);
  });
});
