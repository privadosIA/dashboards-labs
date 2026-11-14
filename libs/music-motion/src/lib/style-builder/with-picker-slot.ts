import type { DfFormSchema } from '@core/dynamic-forms';

type Node = DfFormSchema['fields'][number];

/** The style form with the plain list of parts taken out and a slot put where it was, for the picker of the builder to be drawn in. */
export function withPickerSlot(schema: DfFormSchema): DfFormSchema {
  const fields = schema.fields
    .filter((f) => !('name' in f && f.name === 'partsProblem'))
    .map((f): Node => ('key' in f && f.key === 'parts' ? ({ type: 'slot', name: 'partPicker' } as Node) : f));
  return { ...schema, fields };
}
