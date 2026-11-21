// Every call `ApiService` makes must be an operation of the server's contract (contract/openapi.yaml). A call that is not
// is a gap to report to the server's owner, never something to patch here (spec: dashboard-full-hosting).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

const root = process.cwd();
const contract = load(readFileSync(join(root, 'contract/openapi.yaml'), 'utf8')) as { paths: Record<string, Record<string, unknown>> };
const source = readFileSync(join(root, 'apps/dashboard-full/src/app/core/api.service.ts'), 'utf8');

const shape = (path: string): string => path.replace(/\{[^}]*\}/g, '{}').replace(/\/$/, '');

/**
 * The template literal that starts at `from` (just after the backtick) as a path shape: an interpolation that starts a
 * path segment is a parameter (`{}`), one glued to a segment is a query string and goes.
 */
function pathOf(from: number): string {
  let out = '';
  let i = from;
  while (source[i] !== '`') {
    if (source[i] === '$' && source[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (depth > 0) depth += source[i++] === '{' ? 1 : source[i - 1] === '}' ? -1 : 0;
      if (out === '' || out.endsWith('/')) out += '{}';
    } else out += source[i++];
  }
  return out.replace(/\?.*$/, '');
}

/** `[METHOD, path shape]` of each call written as `this.http.<method>(`${this.base}/...`)`. */
function calls(): [string, string][] {
  const out: [string, string][] = [];
  for (const m of source.matchAll(/this\.http\.(get|post|put|delete|patch)(?:<[^(]*?>)?\(\s*`\$\{this\.base\}/g)) {
    out.push([m[1], shape(pathOf(m.index + m[0].length))]);
  }
  return out;
}

describe('ApiService against the contract', () => {
  const known = new Set(Object.entries(contract.paths).flatMap(([path, ops]) => Object.keys(ops).map((method) => `${method} ${shape(path.replace(/^\/api/, ''))}`)));

  it('finds the calls of the service', () => {
    expect(calls().length).toBeGreaterThan(100);
  });

  it('calls only operations that exist in the contract', () => {
    const missing = calls().filter(([method, path]) => !known.has(`${method} ${path}`)).map(([method, path]) => `${method.toUpperCase()} ${path}`);
    expect([...new Set(missing)]).toEqual([]);
  });
});
