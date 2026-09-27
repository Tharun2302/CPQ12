import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - CommonJS helper shared with server.cjs, no type declarations
import listProjection from '../../documents-list-projection.cjs';

const { DOCUMENTS_LIST_PROJECTION } = listProjection as {
  DOCUMENTS_LIST_PROJECTION: Record<string, 0 | 1>;
};

const serverPath = fileURLToPath(new URL('../../server.cjs', import.meta.url));
const serverSrc = fs.readFileSync(serverPath, 'utf8');

function routeSource(opening: RegExp): string {
  const start = serverSrc.search(opening);
  expect(start, `route not found: ${opening}`).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\napp.', start + 1);
  return serverSrc.slice(start, end === -1 ? undefined : end);
}

describe('DOCUMENTS_LIST_PROJECTION — GET /api/documents payload', () => {
  it('excludes only the heavy payload fields', () => {
    expect(DOCUMENTS_LIST_PROJECTION).toEqual({ fileData: 0, docxFileData: 0, templateData: 0 });
  });

  it('cannot be mutated at runtime by code sharing the constant', () => {
    expect(Object.isFrozen(DOCUMENTS_LIST_PROJECTION)).toBe(true);
  });
});

describe('server.cjs wiring', () => {
  it('the list route projects with the shared constant, not an inline literal', () => {
    expect(serverSrc).toMatch(/require\(['"]\.\/documents-list-projection\.cjs['"]\)/);
    const listRoute = routeSource(/app\.get\(\s*['"]\/api\/documents['"]\s*,/);
    expect(listRoute).toMatch(/\$project:\s*DOCUMENTS_LIST_PROJECTION\b/);
    expect(listRoute).not.toMatch(/fileData:\s*0/);
  });

  // Express serves the first registered :id handler, and opening a document needs templateData.
  it('the single-document route is not narrowed by the list projection', () => {
    const singleRoute = routeSource(/app\.get\(\s*['"]\/api\/documents\/:id['"]\s*,/);
    expect(singleRoute).not.toContain('DOCUMENTS_LIST_PROJECTION');
    expect(singleRoute).not.toMatch(/templateData\s*:\s*0/);
  });
});
