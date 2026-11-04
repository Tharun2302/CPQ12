import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('security readiness hardening (audit run-1 checklist items)', () => {
  const server = read('server.cjs');

  it('pins HS256 on every jwt.verify call in server.cjs', () => {
    const calls = server.match(/jwt\.verify\([^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/algorithms:\s*\['HS256'\]\s*\}/);
    }
    expect(server).not.toMatch(/require\(['"]jsonwebtoken['"]\)\.verify|\{\s*verify\s*\}\s*=\s*require\(['"]jsonwebtoken['"]\)/);
  });

  it('trusts localhost CORS origins only outside production', () => {
    const fnStart = server.indexOf('function isAllowedOrigin(origin)');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = server.slice(fnStart, server.indexOf('\n}', fnStart));
    const localhostLine = fnBody.split('\n').find(l => l.includes('localhost|127'));
    expect(localhostLine).toBeDefined();
    expect(localhostLine).toContain("process.env.NODE_ENV !== 'production'");
  });

  it('runs the LibreOffice converter image as a non-root user', () => {
    const dockerfile = read('Dockerfile.libreoffice');
    const userLines = dockerfile.split('\n').filter(l => /^USER\s+/.test(l));
    expect(userLines.length).toBeGreaterThan(0);
    expect(userLines[userLines.length - 1]).not.toMatch(/^USER\s+(root|0)(:\S+)?\s*$/);
  });

  it('does not enable wildcard CORS on the internal LibreOffice converter', () => {
    const converter = read('libreoffice-converter.js');
    expect(converter).not.toMatch(/require\(['"]cors['"]\)/);
    expect(converter).not.toMatch(/Access-Control-Allow-Origin/i);
  });

  it('has a Dependabot configuration for npm and GitHub Actions', () => {
    const path = '.github/dependabot.yml';
    expect(existsSync(resolve(root, path))).toBe(true);
    const cfg = read(path);
    expect(cfg).toMatch(/package-ecosystem:\s*npm/);
    expect(cfg).toMatch(/package-ecosystem:\s*github-actions/);
  });
});
