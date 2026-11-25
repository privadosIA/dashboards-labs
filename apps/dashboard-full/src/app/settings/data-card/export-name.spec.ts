import { exportName } from './export-name';

describe('exportName', () => {
  const today = new Date('2026-11-19T12:00:00Z');

  it('uses the name the server gives', () => {
    expect(exportName('attachment; filename="veritmo-data-20261119-133655.zip"', today)).toBe('veritmo-data-20261119-133655.zip');
    expect(exportName('attachment; filename=export.zip', today)).toBe('export.zip');
  });

  it('reads the encoded form of the name', () => {
    expect(exportName("attachment; filename*=UTF-8''copia%20datos.zip", today)).toBe('copia datos.zip');
  });

  it('falls back to a dated name when the page cannot read the header or it has no name', () => {
    expect(exportName(null, today)).toBe('veritmo-data-2026-11-19.zip');
    expect(exportName('attachment', today)).toBe('veritmo-data-2026-11-19.zip');
  });

  it('never takes a path or something that is not a file name', () => {
    expect(exportName('attachment; filename="../../etc/passwd"', today)).toBe('passwd');
    expect(exportName('attachment; filename="<script>.zip"', today)).toBe('veritmo-data-2026-11-19.zip');
  });
});
