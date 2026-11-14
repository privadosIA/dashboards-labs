import { schemaFor } from './schema-loader';
import { skeletonsDiffer } from './testing/schema-checks';

const es = { version: '1.0', id: 'x', fields: [{ key: 'a', type: 'text', label: 'Nombre' }] };
const en = { version: '1.0', id: 'x', fields: [{ key: 'a', type: 'text', label: 'Name' }] };

describe('schema loader', () => {
  it('returns the schema of the language asked for', () => {
    expect(schemaFor({ es, en }, 'en')).toBe(en);
    expect(schemaFor({ es, en }, 'es')).toBe(es);
  });

  it('tells apart languages that share a structure from those that do not', () => {
    expect(skeletonsDiffer({ es, en })).toBe(false);
    expect(skeletonsDiffer({ es, en: { ...en, fields: [{ key: 'b', type: 'text' }] } })).toBe(true);
  });
});
