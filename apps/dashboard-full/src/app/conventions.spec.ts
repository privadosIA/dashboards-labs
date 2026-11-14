// Convention guards (design plan): data tables come from @core/dynamic-forms
// (a dynamic/tables.<lang>.json schema); the only paginator of the app is the
// one of @lab/paged-list, for lists that are not tables.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('component conventions', () => {
  const appDir = join(process.cwd(), 'apps/dashboard-full/src/app');
  const files = walk(appDir);

  it('no template of the app draws a mat-paginator: lists use @lab/paged-list', () => {
    const offenders = files.filter(
      (f) =>
        f.endsWith('.html') &&
        readFileSync(f, 'utf8').includes('mat-paginator'),
    );
    expect(offenders).toEqual([]);
  });

  it('no template draws a data table by hand: tables come from the dynamic-forms library', () => {
    const offenders = files.filter((f) => f.endsWith('.html') && /<table[^>]*\bmat-table\b|<mo-table\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('every component keeps its template and styles in separate files', () => {
    const offenders = files.filter(
      (f) =>
        f.endsWith('.component.ts') &&
        /template\s*:\s*[`'"]|styles\s*:\s*[[`'"]/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('form and table schemas live only in a dynamic folder, one file per language', () => {
    const offenders = files.filter(
      (f) =>
        f.endsWith('.json') &&
        !/[\\/]dynamic[\\/](forms|tables)\.(es|en)\.json$/.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it('only the shared dynamic setup talks to the library theme and providers', () => {
    const offenders = files.filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.spec.ts') &&
        !f.includes(join('shared', 'dynamic')) &&
        /provideDynamicForms|materialTheme/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
