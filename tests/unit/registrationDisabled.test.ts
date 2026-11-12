import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');

function routeSource(opening: RegExp): string {
  const start = serverSrc.search(opening);
  expect(start, `route not found: ${opening}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 1);
  return serverSrc.slice(start, end === -1 ? undefined : end);
}

describe('POST /api/auth/register is disabled', () => {
  const route = routeSource(/app\.post\(\s*['"]\/api\/auth\/register['"]\s*,/);

  it('answers 403 and never creates a user or issues a token', () => {
    expect(route).toMatch(/status\(403\)/);
    expect(route).toContain('Registration is disabled');
    expect(route).not.toMatch(/insertOne|jwt\.sign|bcrypt|req\.body/);
  });

  it('is not advertised as an available endpoint at startup', () => {
    expect(serverSrc).not.toMatch(/console\.log\([^)]*POST \/api\/auth\/register/);
  });
});
