import { describe, expect, it } from 'vitest';
import { formatUsd, formatUsDate } from './format';

describe('formatUsd', () => {
  it('formats dollars with cents and thousands separators', () => {
    expect(formatUsd(28.75)).toBe('$28.75');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(367)).toBe('$367.00');
    expect(formatUsd(-40)).toBe('-$40.00');
    expect(formatUsd(0.1 + 0.2)).toBe('$0.30');
  });
  it('drops .00 in compact mode only for whole amounts', () => {
    expect(formatUsd(367, { compact: true })).toBe('$367');
    expect(formatUsd(28.75, { compact: true })).toBe('$28.75');
  });
});

describe('formatUsDate', () => {
  it('turns ISO dates into US dates', () => {
    expect(formatUsDate('2026-07-21')).toBe('07/21/2026');
    expect(formatUsDate('not a date')).toBe('not a date');
  });
});
