import { DfFormSchema } from '@core/dynamic-forms';

import { splitAtSlots } from './split-schema';

const schema = {
  version: '1.0',
  id: 'x',
  fields: [
    { key: 'ctx.video', type: 'hidden' },
    { key: 'a', type: 'text' },
    { key: 'slots.one', type: 'slot', props: { slot: 'one' }, logic: { showWhen: { field: 'ctx.video', operator: 'truthy' } } },
    { key: 'b', type: 'text' },
    { type: 'group', id: 'g', fields: [{ key: 'c', type: 'text' }] },
    { key: 'slots.two', type: 'slot', props: { slot: 'two' } },
  ],
} as unknown as DfFormSchema;

describe('splitAtSlots with a slot that holds fields', () => {
  it('gives the slot a form of its own with the shared context', () => {
    const withBody = {
      version: '1.0',
      id: 'y',
      fields: [
        { key: 'ctx.x', type: 'hidden' },
        { key: 'slots.panel', type: 'slot', props: { slot: 'panel' }, fields: [{ key: 'inner', type: 'text' }] },
      ],
    } as unknown as DfFormSchema;
    const [panel] = splitAtSlots(withBody);
    expect(panel.kind).toBe('slot');
    expect((panel as { schema?: { fields: { key: string }[] } }).schema!.fields.map((f) => f.key)).toEqual(['ctx.x', 'inner']);
  });
});

describe('splitAtSlots', () => {
  const segments = splitAtSlots(schema);

  it('alternates forms and slots in order', () => {
    expect(segments.map((s) => (s.kind === 'slot' ? `slot:${s.name}` : 'form'))).toEqual(['form', 'slot:one', 'form', 'slot:two']);
  });

  it('puts the shared context in every form and keeps the slot\'s condition', () => {
    const forms = segments.filter((s) => s.kind === 'form').map((s) => (s as { schema: { fields: { key?: string; id?: string }[] } }).schema.fields.map((f) => f.key ?? f.id));
    expect(forms).toEqual([['ctx.video', 'a'], ['ctx.video', 'b', 'g']]);
    expect(segments[1]).toMatchObject({ kind: 'slot', logic: { showWhen: { field: 'ctx.video' } } });
  });

  it('gives every form its own id', () => {
    const ids = segments.filter((s) => s.kind === 'form').map((s) => (s as { schema: { id: string } }).schema.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
