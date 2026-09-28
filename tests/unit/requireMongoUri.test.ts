import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import requireMongoUri from '../../scripts/lib/requireMongoUri.cjs';

describe('requireMongoUri', () => {
  it('returns the MONGODB_URI value', () => {
    expect(requireMongoUri({ MONGODB_URI: 'mongodb://db.example:27017/cpq' })).toBe('mongodb://db.example:27017/cpq');
  });

  it('trims surrounding whitespace', () => {
    expect(requireMongoUri({ MONGODB_URI: '  mongodb://db.example/cpq \n' })).toBe('mongodb://db.example/cpq');
  });

  it('throws when MONGODB_URI is missing', () => {
    expect(() => requireMongoUri({})).toThrow('MONGODB_URI is not set');
  });

  it('throws when MONGODB_URI is blank', () => {
    expect(() => requireMongoUri({ MONGODB_URI: '   ' })).toThrow('MONGODB_URI is not set');
  });
});

describe('scripts that connect to MongoDB', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const scriptFiles = [
    ...fs.readdirSync(repoRoot).filter((f) => f.endsWith('.cjs')).map((f) => path.join(repoRoot, f)),
    ...fs.readdirSync(path.join(repoRoot, 'scripts'))
      .filter((f) => f.endsWith('.cjs'))
      .map((f) => path.join(repoRoot, 'scripts', f)),
  ];

  it('contain no hardcoded mongodb+srv connection string with credentials', () => {
    const offenders = scriptFiles.filter((file) =>
      /mongodb\+srv:\/\/[^\s'"`<]+:[^\s'"`<@]+@/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders.map((f) => path.relative(repoRoot, f))).toEqual([]);
    // Cold reads of ~180 scripts can exceed the 5 s default on Windows with file scanning on
  }, 30000);
});
