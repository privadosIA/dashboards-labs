import { pickSchema } from './pick-schema';

describe('pickSchema', () => {
  const en = { version: '1.0', id: 'x', fields: [{ key: 'a' }], tag: 'en' };
  const es = { ...en, tag: 'es' };

  it('gives the schema of the active language', () => {
    const missing: string[] = [];
    expect(pickSchema('x', { en, es }, 'es', (m) => missing.push(m))).toBe(es);
    expect(missing).toEqual([]);
  });

  it('falls back to English and names the file that is missing', () => {
    const missing: string[] = [];
    expect(pickSchema('x', { en }, 'es', (m) => missing.push(m))).toBe(en);
    expect(missing).toEqual(['x.es.json is missing: using x.en.json']);
  });

  it('names both files when neither exists', () => {
    expect(() => pickSchema('x', {}, 'es', () => undefined)).toThrow('x.es.json nor x.en.json does not exist');
  });

  it('throws when there is no English file to fall back to', () => {
    expect(() => pickSchema('x', { es }, 'en', () => undefined)).toThrow('No schema for "x": x.en.json does not exist');
  });
});
