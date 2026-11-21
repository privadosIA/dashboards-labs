import { DfFormSchema } from '@core/dynamic-forms';

import { placeholdersOnly, withFieldOverrides } from './runtime-schema';

describe('withFieldOverrides', () => {
  const schema = {
    version: '1.0',
    id: 'x',
    fields: [
      { key: 'a', type: 'text', placeholder: 'old' },
      { type: 'group', id: 'g', fields: [{ key: 'render.steps', type: 'number', props: { attributes: { min: 1, 'data-testid': 't' } } }, { key: 'other', type: 'text' }] },
      { type: 'slot', key: 'slots.p', fields: [{ key: 'inner', type: 'text' }] },
    ],
  } as unknown as DfFormSchema;
  type Out = { fields: { placeholder?: string; fields?: { placeholder?: string; props?: { attributes: Record<string, unknown> } }[] }[] };

  it('sets the placeholders by key, inside groups and slots, and leaves the rest', () => {
    const out = withFieldOverrides(schema, placeholdersOnly({ a: 'new', 'render.steps': '20', inner: 'in' })) as unknown as Out;
    expect(out.fields[0].placeholder).toBe('new');
    expect(out.fields[1].fields![0].placeholder).toBe('20');
    expect(out.fields[1].fields![1].placeholder).toBeUndefined();
    expect(out.fields[2].fields![0].placeholder).toBe('in');
  });

  it('lays attributes over the ones the file has', () => {
    const out = withFieldOverrides(schema, { 'render.steps': { attributes: { min: 8, max: 32 } } }) as unknown as Out;
    expect(out.fields[1].fields![0].props!.attributes).toEqual({ min: 8, max: 32, 'data-testid': 't' });
  });

  it('does not change the schema it was given', () => {
    withFieldOverrides(schema, placeholdersOnly({ a: 'new' }));
    expect((schema.fields[0] as { placeholder?: string }).placeholder).toBe('old');
  });
});
