import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'apps/dashboard-full');

/** The English source catalog (`ng extract-i18n`) and its Spanish translation, by message id. */
const xlf = readFileSync(join(root, 'src/locale/messages.xlf'), 'utf8');
const es: Record<string, string> = JSON.parse(readFileSync(join(root, 'src/locale/messages.es.json'), 'utf8'));

const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const source: Record<string, string> = {};
for (const m of xlf.matchAll(/<trans-unit id="([^"]+)"[^>]*>\s*<source>([\s\S]*?)<\/source>/g)) {
  source[m[1]] = decode(m[2].replace(/<x id="([^"]+)"[^>]*\/>/g, '{$$$1}'));
}

const placeholders = (t: string) => (t.match(/\{\$[A-Za-z_0-9]+\}/g) ?? []).sort();

describe('Spanish catalog', () => {
  it('has a translation for every message and none for a message that no longer exists', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(source).sort());
  });

  it('keeps the placeholders of every message', () => {
    const bad = Object.keys(source).filter((id) => JSON.stringify(placeholders(es[id] ?? '')) !== JSON.stringify(placeholders(source[id])));
    expect(bad).toEqual([]);
  });

  it('has no Spanish in the English source texts', () => {
    const spanish = Object.keys(source).filter((id) => /[áéíóúñ¿¡]/.test(source[id]) && id !== 'music.lyricsPlaceholder');
    expect(spanish).toEqual([]);
  });
});
