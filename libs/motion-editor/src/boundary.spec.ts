import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (entry.endsWith('.ts') && !entry.endsWith('boundary.spec.ts')) yield full;
  }
}

/** `@lab/vector-editor` never imports this library (its own boundary spec says so) and this one never imports it: `motion-edit` is the only place that knows both. */
describe('the library does not know the vector editor', () => {
  it('imports nothing from @lab/vector-editor', () => {
    const offenders: string[] = [];
    for (const file of sources(join(process.cwd(), 'libs/motion-editor/src'))) {
      const imports = readFileSync(file, 'utf8').match(/(?:from|import)\s*\(?\s*['"][^'"]+['"]/g) ?? [];
      for (const line of imports) if (line.includes('@lab/vector-editor')) offenders.push(`${file}: ${line}`);
    }
    expect(offenders).toEqual([]);
  });
});
