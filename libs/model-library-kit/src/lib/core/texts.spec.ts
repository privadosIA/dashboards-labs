import { textsFor } from './texts';

/** Every text a function or a string gives, with the keys it is found under. */
function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (typeof node === 'function') {
    const out = (node as (...a: unknown[]) => string)(...[3, 7, 11].slice(0, node.length), ...(node.length === 0 ? [] : []));
    return [[path, typeof out === 'string' ? out : String(out)]];
  }
  return Object.entries(node as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

describe('the library texts', () => {
  const es = leaves(textsFor('es'));
  const en = leaves(textsFor('en'));

  it('have the same keys in both languages and none is empty', () => {
    expect(es.map(([k]) => k)).toEqual(en.map(([k]) => k));
    for (const [key, text] of [...es, ...en]) expect(text.trim(), key).not.toBe('');
  });

  it('are not the same sentence in both languages (nothing was left untranslated)', () => {
    const same = es.filter(([k, text], i) => text === en[i][1] && !/\.(size|range)$/.test(k) && text.length > 12);
    expect(same.map(([k]) => k)).toEqual([]);
  });
});
