import { describe, expect, it } from 'vitest';
import { safeNext } from './auth';

describe('safeNext', () => {
  it('keeps in-app paths', () => {
    expect(safeNext('/cases/abc')).toBe('/cases/abc');
    expect(safeNext('/')).toBe('/');
  });
  it('rejects anything that could leave the site', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'cases', '', null, undefined, 42]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
