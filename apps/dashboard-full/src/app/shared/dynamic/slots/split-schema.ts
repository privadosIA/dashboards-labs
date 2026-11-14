import { DfConditionalLogic, DfFormSchema } from '@core/dynamic-forms';

interface Node {
  key?: string;
  type?: string;
  logic?: DfConditionalLogic;
  props?: { slot?: string };
  fields?: Node[];
}

/** A run of schema fields, or the place of a block the component draws itself. */
export type Segment =
  | { kind: 'form'; id: string; schema: DfFormSchema }
  /** A slot that holds fields of its own (a panel whose body is a form) carries them as a `schema`. */
  | { kind: 'slot'; id: string; name: string; logic?: DfConditionalLogic; schema?: DfFormSchema };

/**
 * Cuts a schema at its `slot` nodes, in order: the fields between two slots
 * become one form, each slot a place for a template of the component. Nodes
 * of type `hidden` go into every form.
 */
export function splitAtSlots(schema: DfFormSchema): Segment[] {
  const nodes = schema.fields as unknown as Node[];
  const shared = nodes.filter((n) => n.type === 'hidden');
  const segments: Segment[] = [];
  let run: Node[] = [];
  const formOf = (id: string, fields: Node[]) => ({ ...schema, id: `${schema.id}-${id}`, fields: [...shared, ...fields] }) as unknown as DfFormSchema;
  const flush = () => {
    if (run.length === 0) return;
    const id = `form-${segments.length}`;
    segments.push({ kind: 'form', id, schema: formOf(id, run) });
    run = [];
  };
  for (const n of nodes) {
    if (n.type === 'hidden') continue;
    if (n.type === 'slot') {
      flush();
      const id = `slot-${n.props?.slot}`;
      segments.push({ kind: 'slot', id, name: String(n.props?.slot), logic: n.logic, ...(n.fields?.length ? { schema: formOf(id, n.fields) } : {}) });
    } else run.push(n);
  }
  flush();
  return segments;
}
