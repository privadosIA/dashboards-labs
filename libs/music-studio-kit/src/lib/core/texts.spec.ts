import { textsFor } from './texts';

type Path = string[];

/** Every path to a string in a nested object, as a list of keys (a key may hold a dot: `title.required`). */
function paths(value: unknown, prefix: Path = []): Path[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value as object).flatMap(([key, child]) => paths(child, [...prefix, key]));
}

const at = (value: unknown, path: Path): string => path.reduce((v, key) => (v as Record<string, unknown>)[key], value) as string;
const name = (path: Path): string => path.join(' > ');

describe('texts', () => {
  it('has exactly the same keys in Spanish and in English', () => {
    expect(paths(textsFor('en')).map(name).sort()).toEqual(paths(textsFor('es')).map(name).sort());
  });

  it('has no empty text in either language', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const path of paths(textsFor(lang))) expect(at(textsFor(lang), path).trim(), `${lang} ${name(path)}`).not.toBe('');
    }
  });
});
