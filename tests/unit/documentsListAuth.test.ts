// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { documentServiceMongoDB } from '../../src/services/documentServiceMongoDB';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.cjs'), 'utf8');
const authContextSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/contexts/AuthContext.tsx'), 'utf8');

function routeSource(opening: RegExp): string {
  const start = serverSrc.search(opening);
  expect(start, `route not found: ${opening}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 1);
  return serverSrc.slice(start, end === -1 ? undefined : end);
}

describe('GET /api/documents requires a signed-in user', () => {
  it('verifies the caller before reading the collection', () => {
    const listRoute = routeSource(/app\.get\(\s*['"]\/api\/documents['"]\s*,/);
    const authAt = listRoute.indexOf('getAuthenticatedUser(req, res)');
    const queryAt = listRoute.indexOf("collection('documents')");
    expect(authAt).toBeGreaterThan(-1);
    expect(queryAt).toBeGreaterThan(authAt);
    expect(listRoute).toMatch(/if \(!authUser\) return;/);
  });
});

describe('documentServiceMongoDB.getAllDocuments', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, documents: [], totalCount: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the saved login token as a Bearer header', async () => {
    localStorage.setItem('cpq_token', 'aaa.bbb.ccc');
    await documentServiceMongoDB.getAllDocuments();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ Authorization: 'Bearer aaa.bbb.ccc' });
  });

  it('sends no Authorization header when signed out', async () => {
    await documentServiceMongoDB.getAllDocuments();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({});
  });

  it('surfaces a 401 from the server as an error instead of an empty list', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Authentication required' });
    await expect(documentServiceMongoDB.getAllDocuments()).rejects.toThrow(/401/);
  });
});

describe('AuthContext only stores server-issued tokens', () => {
  it('has no hardcoded password or fake token generation', () => {
    expect(authContextSrc).not.toMatch(/CPQ@2025@TEAM/);
    expect(authContextSrc).not.toMatch(/mock_token_/);
    expect(authContextSrc).not.toMatch(/hubspot_auth_token/);
  });

  it('never stores the Microsoft access token as the app login token', () => {
    expect(authContextSrc).not.toMatch(/setItem\(\s*['"]cpq_token['"]\s*,\s*microsoftUser\.accessToken/);
  });

  it('only stores cpq_token from a backend response', () => {
    const writes = authContextSrc.match(/setItem\(\s*['"]cpq_token['"]\s*,\s*[^)]+\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w).toMatch(/data\.token/);
  });
});
