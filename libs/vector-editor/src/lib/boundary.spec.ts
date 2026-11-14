import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['@lab/animation-core', '@lab/music-motion', '@lab/motion-editor', '@lab/api-client', '@lab/server-connection', 'apps/'];

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (entry.endsWith('.ts') && !entry.endsWith('boundary.spec.ts')) yield full;
  }
}

describe('the library stands alone', () => {
  const root = join(process.cwd(), 'libs/vector-editor/src');

  it('imports nothing from the music domain, the server or a dashboard', () => {
    const offenders: string[] = [];
    for (const file of sources(root)) {
      const imports = readFileSync(file, 'utf8').match(/(?:from|import)\s*\(?\s*['"][^'"]+['"]/g) ?? [];
      for (const line of imports) if (FORBIDDEN.some((name) => line.includes(name))) offenders.push(`${file}: ${line}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps HTML and styles out of its TypeScript', () => {
    const offenders: string[] = [];
    for (const file of sources(root)) {
      if (file.includes('/testing/') || file.endsWith('.spec.ts')) continue;
      if (/\b(template|styles)\s*:\s*[`'\[]/.test(readFileSync(file, 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
