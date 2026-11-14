import type { DfFormSchema } from '@core/dynamic-forms';

import { withOptions, withPlaceholder, withoutFields, withoutLogic } from './with-options';

const schema: DfFormSchema = {
  version: '1.0',
  id: 'x',
  fields: [
    { key: 'generator', type: 'select', label: 'Generator', options: [] },
    { type: 'slot', name: 'hint' },
    { key: 'gender', type: 'select', label: 'Gender', options: [{ value: 'random', label: 'Random' }] },
  ],
};

describe('withOptions', () => {
  it('sets the options and the default of the field with that key and touches nothing else', () => {
    const out = withOptions(schema, 'generator', [{ value: 'heartmula', label: 'HeartMuLa' }, { value: 'ace-step', label: 'ACE-Step', disabled: true }], 'heartmula');
    expect(out.fields[0]).toMatchObject({ key: 'generator', defaultValue: 'heartmula', options: [{ value: 'heartmula', label: 'HeartMuLa' }, { value: 'ace-step', label: 'ACE-Step', disabled: true }] });
    expect(out.fields[1]).toBe(schema.fields[1]);
    expect(out.fields[2]).toBe(schema.fields[2]);
  });

  it('keeps the default of the schema when none is given', () => {
    expect(withOptions(schema, 'generator', [])['fields'][0]).not.toHaveProperty('defaultValue');
  });
});

describe('withoutFields', () => {
  it('drops the fields with those keys and keeps the slots', () => {
    const out = withoutFields(schema, 'gender');
    expect(out.fields.map((f) => ('key' in f ? f.key : 'slot'))).toEqual(['generator', 'slot']);
  });
});

describe('withoutLogic', () => {
  it('takes the conditions off one field and leaves the others', () => {
    const conditional: DfFormSchema = {
      version: '1.0',
      id: 'y',
      fields: [
        { key: 'a', type: 'checkbox', label: 'A' },
        { key: 'b', type: 'text', label: 'B', logic: { disabledWhen: { field: 'a', operator: 'truthy' } } },
      ],
    };
    const out = withoutLogic(conditional, 'b');
    expect(out.fields[1]).not.toHaveProperty('logic');
    expect(out.fields[1]).toMatchObject({ key: 'b', label: 'B' });
    expect(out.fields[0]).toBe(conditional.fields[0]);
  });
});

describe('withPlaceholder', () => {
  it('sets the placeholder of one field and leaves the others', () => {
    const out = withPlaceholder(schema, 'generator', 'line one\nline two');
    expect(out.fields[0]).toMatchObject({ key: 'generator', placeholder: 'line one\nline two' });
    expect(out.fields[2]).toBe(schema.fields[2]);
  });
});
