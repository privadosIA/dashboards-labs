import { formatBytes, formatDateTime } from './format';

describe('formatDateTime', () => {
  it('writes the date and the time in the language asked', () => {
    const iso = '2026-11-19T12:36:00Z';
    expect(formatDateTime(iso, 'en')).toMatch(/Nov 19, 2026/);
    expect(formatDateTime(iso, 'es')).toMatch(/19 nov 2026/);
  });

  it('shows what it cannot read as it came', () => {
    expect(formatDateTime('not a date', 'en')).toBe('not a date');
  });
});

describe('formatBytes', () => {
  it('writes gigabytes from a billion and megabytes below', () => {
    expect(formatBytes(14_200_000_000)).toBe('14.2 GB');
    expect(formatBytes(400_000_000)).toBe('400.0 MB');
    expect(formatBytes(1e9)).toBe('1.0 GB');
  });
});
